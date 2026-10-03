-- Comunicaciones: cola, omisiones, tope por hora, reintentos, bajas y
-- automatizaciones.
BEGIN;
SELECT plan(33);

CREATE FUNCTION pg_temp.estado(p_envio uuid, p_email text) RETURNS text LANGUAGE sql AS $$
  SELECT estado FROM comunicaciones.mensajes WHERE envio_id = p_envio AND email = p_email
$$;

-- Una baja previa de difusión
DO $$ BEGIN PERFORM comunicaciones.suprimir('Baja@Example.com ', 'difusion', 'manual', 'Prueba'); END $$;

CREATE TEMP TABLE e1 AS SELECT comunicaciones.crear_envio('Prueba', 'difusion', 'Hola {{nombre}}', 'Texto', jsonb_build_array(
  jsonb_build_object('email', 'Ana@Example.com', 'nombre', 'Ana', 'variables', '{"nombre": "Ana"}'),
  jsonb_build_object('email', 'ana@example.com ', 'nombre', 'Ana repetida'),
  jsonb_build_object('email', 'baja@example.com', 'nombre', 'Dada de baja'),
  jsonb_build_object('email', 'no-es-un-mail', 'nombre', 'Mal'),
  jsonb_build_object('email', 'beto@example.com', 'nombre', 'Beto'))) AS id;

SELECT is((SELECT count(*) FROM comunicaciones.mensajes WHERE envio_id = (SELECT id FROM e1)), 4::bigint,
          'una fila por dirección (la repetida se une)');
SELECT is(pg_temp.estado((SELECT id FROM e1), 'baja@example.com'), 'omitido', 'la dada de baja se omite');
SELECT is((SELECT motivo_omision FROM comunicaciones.mensajes WHERE envio_id = (SELECT id FROM e1) AND email = 'no-es-un-mail'),
          'Dirección inválida', 'con su motivo');
SELECT is((SELECT estado FROM comunicaciones.envios WHERE id = (SELECT id FROM e1)), 'borrador', 'nace en borrador');
SELECT is((SELECT count(*) FROM comunicaciones.tomar_mensajes()), 0::bigint, 'un borrador no sale');

-- La baja llega mientras está en borrador
DO $$ BEGIN PERFORM comunicaciones.suprimir('beto@example.com', 'difusion', 'manual'); END $$;
SELECT is(pg_temp.estado((SELECT id FROM e1), 'beto@example.com'), 'omitido', 'una baja posterior omite lo pendiente');
SELECT ok(NOT comunicaciones.suprimido('beto@example.com', 'institucional'), 'la baja de difusión no frena lo institucional');

DO $$ BEGIN PERFORM comunicaciones.aprobar_envio((SELECT id FROM e1)); END $$;
CREATE TEMP TABLE tanda AS SELECT * FROM comunicaciones.tomar_mensajes();
SELECT is((SELECT count(*) FROM tanda), 1::bigint, 'aprobado: sale lo pendiente');
SELECT is((SELECT count(*) FROM comunicaciones.tomar_mensajes()), 0::bigint, 'lo que está saliendo no se toma dos veces');

-- Error transitorio: reintenta más tarde
DO $$ BEGIN PERFORM comunicaciones.resultado_mensaje((SELECT id FROM tanda), false, NULL, '421 Too many'); END $$;
SELECT is(pg_temp.estado((SELECT id FROM e1), 'ana@example.com'), 'pendiente', 'un error transitorio vuelve a la cola');
SELECT ok((SELECT proximo_intento > now() FROM comunicaciones.mensajes WHERE id = (SELECT id FROM tanda)), 'con espera');
UPDATE comunicaciones.mensajes SET proximo_intento = now() WHERE id = (SELECT id FROM tanda);
DELETE FROM tanda;
INSERT INTO tanda SELECT * FROM comunicaciones.tomar_mensajes();
DO $$ BEGIN PERFORM comunicaciones.resultado_mensaje((SELECT id FROM tanda), true, '<abc@club>'); END $$;
SELECT is(pg_temp.estado((SELECT id FROM e1), 'ana@example.com'), 'enviado', 'enviado al segundo intento');
SELECT throws_like($$ UPDATE comunicaciones.mensajes SET estado = 'pendiente' WHERE id = (SELECT id FROM tanda) $$,
                   '%ya terminó%', 'un enviado no vuelve atrás');
SELECT throws_like($$ DELETE FROM comunicaciones.mensajes WHERE id = (SELECT id FROM tanda) $$,
                   '%historial%', 'los mensajes no se borran');

-- Tope por hora
UPDATE comunicaciones.config SET limite_por_hora = 1;
CREATE TEMP TABLE e2 AS SELECT comunicaciones.crear_envio('Prueba 2', 'institucional', 'Aviso', 'Texto',
  '[{"email": "ceci@example.com"}]') AS id;
DO $$ BEGIN PERFORM comunicaciones.aprobar_envio((SELECT id FROM e2)); END $$;
SELECT is((SELECT count(*) FROM comunicaciones.tomar_mensajes()), 0::bigint, 'con el cupo de la hora usado, espera');
UPDATE comunicaciones.config SET limite_por_hora = 200;
SELECT is(comunicaciones.cancelar_envio((SELECT id FROM e2)), 1, 'cancelar deja sin salir lo pendiente');

-- Transaccional: sale solo y una sola vez
SELECT isnt(comunicaciones.encolar_transaccional('dani@example.com', 'Dani', 'Tu pedido', '<p>Listo</p>', 'pedido:1:listo'),
            NULL, 'transaccional encolado');
SELECT is(comunicaciones.encolar_transaccional('dani@example.com', 'Dani', 'Tu pedido', '<p>Listo</p>', 'pedido:1:listo'),
          NULL, 'el mismo aviso no se encola dos veces');
SELECT is((SELECT count(*) FROM comunicaciones.tomar_mensajes() WHERE email = 'dani@example.com'), 1::bigint,
          'y sale sin aprobación');

-- Baja por enlace
CREATE TEMP TABLE e3 AS SELECT comunicaciones.crear_envio('Prueba 3', 'difusion', 'Novedades', 'Texto',
  '[{"email": "eli@example.com"}]') AS id;
SELECT is(comunicaciones.registrar_baja((SELECT id FROM comunicaciones.mensajes WHERE envio_id = (SELECT id FROM e3))),
          'eli@example.com', 'la baja por enlace registra la dirección');
SELECT is(pg_temp.estado((SELECT id FROM e3), 'eli@example.com'), 'omitido', 'y omite lo que tenía pendiente');
SELECT lives_ok($$ SELECT comunicaciones.registrar_baja((SELECT id FROM comunicaciones.mensajes WHERE envio_id = (SELECT id FROM e3))) $$,
                'dos veces no falla');

-- Automatización: una vez por período
INSERT INTO public.padron_socios (nombre, apellido, cedula, email, activo) VALUES ('Fede', 'Prueba', '77777777', 'fede@example.com', false);
DO $$ BEGIN PERFORM socios.alta_socio('{"cedula": "77777777"}', '2026-01-01'); END $$;
UPDATE comunicaciones.automatizaciones SET activa = true WHERE clave = 'bienvenida';
SELECT isnt(comunicaciones.correr_automatizacion('bienvenida', '2026-01-01', '{}', 'bienvenida'), NULL, 'corre la bienvenida');
SELECT is(comunicaciones.correr_automatizacion('bienvenida', '2026-01-01', '{}', 'bienvenida'), NULL,
          'el mismo período no corre dos veces');

-- Correcciones: formato de la deuda, corrida sin destinatarios, cancelado
SELECT is((SELECT variables ->> 'deuda_vencida' FROM comunicaciones.audiencia_socios('{"vigentes": false}') LIMIT 1),
          '$ 0,00', 'importes con formato uruguayo');
UPDATE comunicaciones.automatizaciones SET activa = true WHERE clave = 'cumpleanos';
SELECT is(comunicaciones.correr_automatizacion('cumpleanos', '2026-01-01', '{"cumple_hoy": true, "vigentes": false, "alta_desde": "2099-01-01"}', 'c'),
          NULL, 'sin destinatarios no corre');
SELECT is((SELECT count(*) FROM comunicaciones.corridas WHERE clave = 'cumpleanos'), 0::bigint, 'y no queda registrada');

-- Plantillas en HTML y mails automáticos
SELECT is((SELECT count(*) FROM comunicaciones.plantillas WHERE transaccional), 6::bigint, 'seis mails automáticos editables');
SELECT throws_like($$ UPDATE comunicaciones.plantillas SET activa = false WHERE clave = 'pedido_listo' $$,
                   '%solo cambian de asunto%', 'un mail automático no se desactiva');
SELECT throws_like($$ UPDATE comunicaciones.plantillas SET cuerpo_original = 'x' WHERE clave = 'pedido_listo' $$,
                   '%solo cambian de asunto%', 'ni se le cambia el original');
SELECT lives_ok($$ UPDATE comunicaciones.plantillas SET cuerpo = '<p>Hola {{nombre}}</p>', usa_molde = false WHERE clave = 'pedido_listo' $$,
                'se edita el HTML');
CREATE TEMP TABLE e_html AS SELECT comunicaciones.crear_envio('Prueba HTML', 'difusion', 'Hola', '<h1>Hola</h1>',
  '[{"email": "html@example.com"}]', NULL, NULL, 'html', false) AS id;
SELECT is((SELECT formato || '/' || usa_molde::text FROM comunicaciones.envios WHERE id = (SELECT id FROM e_html)),
          'html/false', 'el envío guarda formato y molde');
SELECT throws_like($$ SELECT comunicaciones.crear_envio('X', 'difusion', 'Hola', 'x', '[]', NULL, NULL, 'pdf') $$,
                   '%Formato inválido%', 'solo texto o html');

SELECT * FROM finish();
ROLLBACK;
