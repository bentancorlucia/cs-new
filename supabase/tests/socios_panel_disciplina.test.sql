-- Representantes, panel de la disciplina, registro de cambios y tarjetas.
BEGIN;
SELECT plan(32);

DO $$ BEGIN PERFORM contabilidad.crear_ejercicio(extract(year FROM contabilidad._hoy())::int); END $$;
CREATE FUNCTION pg_temp.p(p_cedula text) RETURNS integer LANGUAGE sql SECURITY DEFINER AS $$ SELECT id FROM public.padron_socios WHERE cedula = p_cedula $$;
-- Lee como postgres (la representante no ve las tablas: solo el panel).
CREATE FUNCTION pg_temp.v(p_sql text) RETURNS text LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE r text; BEGIN EXECUTE p_sql INTO r; RETURN r; END $$;
CREATE FUNCTION pg_temp.mes() RETURNS date LANGUAGE sql AS $$ SELECT date_trunc('month', contabilidad._hoy())::date $$;
CREATE FUNCTION pg_temp.como(p_usuario text) RETURNS void LANGUAGE sql AS $$
  SELECT set_config('request.jwt.claims', json_build_object('sub', p_usuario, 'role', 'authenticated')::text, true)
$$;

INSERT INTO socios.planes (nombre, tipo, disciplina_id) VALUES ('Cuota social', 'social', NULL),
  ('Fútbol +18', 'disciplina', 7), ('Fútbol +18 con transporte', 'disciplina', 7), ('Rugby', 'disciplina', 13);
INSERT INTO socios.plan_precios (plan_id, vigente_desde, importe_mensual)
SELECT id, '2026-01-01', CASE nombre WHEN 'Cuota social' THEN 480 WHEN 'Fútbol +18' THEN 1445
                                     WHEN 'Fútbol +18 con transporte' THEN 1945 ELSE 2000 END FROM socios.planes;
CREATE FUNCTION pg_temp.pl(p text) RETURNS integer LANGUAGE sql SECURITY DEFINER AS $$ SELECT id FROM socios.planes WHERE nombre = p $$;

-- Usuarios: una representante de la disciplina 7, un tesorero, una persona sin rol.
INSERT INTO auth.users (id, instance_id, aud, role, email, raw_user_meta_data) VALUES
  ('00000000-0000-0000-0000-0000000000d1', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   'delegada@example.com', '{"nombre": "Delia", "apellido": "Gada"}'),
  ('00000000-0000-0000-0000-0000000000d2', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   'tesorero@example.com', '{"nombre": "Teo", "apellido": "Rero"}'),
  ('00000000-0000-0000-0000-0000000000d3', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   'otra@example.com', '{"nombre": "Otra", "apellido": "Persona"}');
INSERT INTO public.perfil_roles (perfil_id, rol_id)
SELECT '00000000-0000-0000-0000-0000000000d2', id FROM public.roles WHERE nombre = 'tesorero';

-- Un socio de rugby (otra disciplina)
DO $$ BEGIN PERFORM socios.alta_socio('{"cedula": "70000001", "nombre": "Raúl", "apellido": "Rugby"}', pg_temp.mes(),
  jsonb_build_array(jsonb_build_object('plan_id', pg_temp.pl('Cuota social')), jsonb_build_object('plan_id', pg_temp.pl('Rugby'))),
  '{"medio": "efectivo"}'); END $$;
SELECT is((SELECT origen || '/' || count(*) FROM socios.cambios_disciplina WHERE persona_id = pg_temp.p('70000001')
           GROUP BY origen), 'club/4', 'un alta de secretaría queda en el registro como cambio del club');

SELECT throws_like($$ SELECT socios.cambiar_medio_cobro(pg_temp.p('70000001'),
  '{"medio": "transferencia_disciplina", "disciplina_id": 7}', contabilidad._hoy()) $$,
  '%disciplina del socio%', 'la transferencia va a la cuenta de su disciplina, no de otra');
SELECT lives_ok($$ SELECT socios.cambiar_medio_cobro(pg_temp.p('70000001'),
  '{"medio": "transferencia_disciplina", "disciplina_id": 13}', contabilidad._hoy()) $$,
  'a la cuenta de rugby, que es la suya, sí');

-- ---------- Representantes
CREATE TEMP TABLE rep AS SELECT socios.guardar_representante(NULL, 7,
  '{"nombre": "Delia Gada", "email": "Delegada@Example.com", "cargo": "Delegada"}') AS id;
SELECT is((SELECT perfil_id FROM socios.representantes WHERE id = (SELECT id FROM rep)),
          '00000000-0000-0000-0000-0000000000d1'::uuid, 'se vincula sola con la cuenta del sitio por el correo');
SELECT ok(EXISTS (SELECT 1 FROM public.perfil_roles pr JOIN public.roles r ON r.id = pr.rol_id
                  WHERE pr.perfil_id = '00000000-0000-0000-0000-0000000000d1' AND r.nombre = 'representante_disciplina'),
          'y recibe el rol de representante');
DO $$ BEGIN PERFORM socios.guardar_representante(NULL, 7, '{"nombre": "Solo mail", "email": "lista@example.com", "acceso_panel": false}'); END $$;
SELECT is((SELECT count(*) FROM socios.representantes WHERE disciplina_id = 7 AND activo AND recibe_liquidacion), 2::bigint,
          'la lista de correos de la disciplina tiene dos destinatarios');

-- ---------- Como representante
SELECT pg_temp.como('00000000-0000-0000-0000-0000000000d1');
SET LOCAL ROLE authenticated;
SELECT is((SELECT count(*) FROM socios.mis_disciplinas()), 1::bigint, 'la representante ve solo su disciplina');
SELECT throws_ok($$ SELECT socios.disc_socios(13) $$, '42501', NULL, 'no ve los socios de otra disciplina');
SELECT throws_ok($$ SELECT socios.disc_baja(13, pg_temp.p('70000001'), contabilidad._hoy()) $$, '42501', NULL,
                 'ni da de baja en otra disciplina');
SELECT throws_ok($$ SELECT socios.disc_baja(7, pg_temp.p('70000001'), contabilidad._hoy()) $$, '42501', NULL,
                 'ni toca a una persona que no está en la suya');
SELECT throws_like($$ SELECT socios.disc_alta_socio(7, '{"cedula": "70000002", "nombre": "Lucía", "apellido": "Tarjeta"}',
  pg_temp.mes(), pg_temp.pl('Fútbol +18'), '{"medio": "debito_visa", "tarjeta_numero": "4111 1111 1111 1112"}') $$,
  '%no es válido%', 'un número de tarjeta mal escrito se rechaza');

CREATE TEMP TABLE alta AS SELECT socios.disc_alta_socio(7, '{"cedula": "70000002", "nombre": "Lucía", "apellido": "Tarjeta"}',
  pg_temp.mes(), pg_temp.pl('Fútbol +18'),
  '{"medio": "debito_visa", "tarjeta_numero": "4111 1111 1111 1111", "tarjeta_vencimiento": "2029-02-01", "tarjeta_emisor": "itau"}') AS id;
SELECT is(pg_temp.v('SELECT tarjeta_ultimos4 || '' '' || tarjeta_emisor FROM socios.medios_cobro WHERE persona_id = '
                    || (SELECT id FROM alta)),
          '1111 ITAU', 'del número completo, el medio de cobro guarda solo los últimos 4 y el emisor');
SELECT is((SELECT jsonb_array_length(socios.disc_socios(7))), 1, 'la socia nueva aparece en el panel');
SELECT is((SELECT (e ->> 'cuota_mensual')::numeric FROM jsonb_array_elements(socios.disc_socios(7)) e), 1925.00::numeric,
          'con su cuota mensual: social 480 + fútbol 1.445');
SELECT is((SELECT string_agg(tipo, ',' ORDER BY id) FROM socios.cambios_disciplina WHERE persona_id = (SELECT id FROM alta)),
          'alta,inscripcion,inscripcion,medio_cobro', 'el alta queda registrada paso a paso');
SELECT ok((SELECT bool_and(origen = 'representante' AND disciplina_id = 7 AND hecho_por_nombre = 'Delia Gada')
           FROM socios.cambios_disciplina WHERE persona_id = (SELECT id FROM alta)),
          'con la disciplina, quién lo hizo y que fue la representante');
SELECT is((SELECT estado_debito || '/' || (tarjeta_secreto_id IS NOT NULL) FROM socios.cambios_disciplina
           WHERE persona_id = (SELECT id FROM alta) AND tipo = 'medio_cobro'),
          'pendiente/true', 'la adhesión al débito queda pendiente para tesorería, con la tarjeta cifrada');
SELECT ok(NOT (socios.disc_cambios(7)::text LIKE '%4111111111111111%'), 'el registro nunca muestra el número completo');

DO $$ BEGIN PERFORM socios.disc_cambiar_plan(7, pg_temp.v('SELECT id FROM socios.suscripciones WHERE persona_id = '
  || (SELECT id FROM alta) || ' AND plan_id = ' || pg_temp.pl('Fútbol +18'))::bigint,
  pg_temp.pl('Fútbol +18 con transporte'), (pg_temp.mes() + interval '1 month')::date); END $$;
SELECT is((SELECT count(*) FROM socios.cambios_disciplina WHERE persona_id = (SELECT id FROM alta)
           AND tipo IN ('inscripcion', 'fin_inscripcion') AND estado_debito = 'pendiente'), 1::bigint,
          'el cambio a "con transporte" es un solo cambio pendiente para tesorería');
SELECT is((SELECT descripcion FROM socios.cambios_disciplina WHERE persona_id = (SELECT id FROM alta)
           AND tipo = 'inscripcion' ORDER BY id DESC LIMIT 1),
          'Tarjeta, Lucía pasa de Fútbol +18 a Fútbol +18 con transporte — nueva cuota a debitar: $ 2.425,00',
          'que dice de qué plan a qué plan y la cuota nueva: 2.425');
DO $$ BEGIN PERFORM socios.disc_nuevo_precio(7, pg_temp.pl('Fútbol +18'), 1545, (pg_temp.mes() + interval '2 months')::date); END $$;
SELECT is((SELECT tipo || '/' || afecta_debito FROM socios.cambios_disciplina WHERE tipo = 'precio'), 'precio/false',
          'un precio nuevo sin socios con débito en ese plan no queda pendiente');
SELECT throws_ok($$ SELECT socios.ver_tarjeta(1) $$, '42501', NULL, 'la representante no ve números de tarjeta');
SELECT throws_ok($$ SELECT socios.marcar_cambios(ARRAY[1::bigint]) $$, '42501', NULL, 'ni marca cambios como aplicados');
SELECT throws_like($$ UPDATE socios.cambios_disciplina SET descripcion = 'x' $$, '%permission denied%', 'ni edita el registro');
DO $$ BEGIN PERFORM socios.disc_registrar_cobro(7, (SELECT id FROM alta), contabilidad._hoy(), 1925, 'TRF-FUT-1'); END $$;
SELECT is(pg_temp.v('SELECT medio || ''/'' || disciplina_id FROM socios.cobros WHERE persona_id = ' || (SELECT id FROM alta)),
          'transferencia_disciplina/7', 'un cobro que recibió la disciplina queda como deuda suya con el club');
DO $$ BEGIN PERFORM socios.disc_baja(7, (SELECT id FROM alta), contabilidad._hoy() + 40, false, 'Se lesionó'); END $$;
SELECT is(pg_temp.v('SELECT count(*) FROM socios.membresias WHERE hasta IS NULL AND persona_id = ' || (SELECT id FROM alta)),
          '1', 'salir de la disciplina no la da de baja del club');
RESET ROLE;

-- ---------- Como tesorero
SELECT pg_temp.como('00000000-0000-0000-0000-0000000000d2');
SET LOCAL ROLE authenticated;
CREATE TEMP TABLE adh AS SELECT id FROM socios.cambios_disciplina WHERE persona_id = (SELECT id FROM alta) AND tipo = 'medio_cobro';
SELECT is(socios.ver_tarjeta((SELECT id FROM adh)), '4111111111111111', 'tesorería ve el número completo para cargarlo en Visa');
SELECT is((SELECT count(*) FROM socios.tarjetas_consultas WHERE cambio_id = (SELECT id FROM adh)), 1::bigint,
          'y queda registrado que lo vio');
SELECT is(socios.marcar_cambios(ARRAY(SELECT id FROM socios.cambios_disciplina WHERE estado_debito = 'pendiente')),
          (SELECT count(*)::integer FROM socios.cambios_disciplina WHERE estado_debito = 'pendiente'),
          'marca aplicados todos los pendientes');
RESET ROLE;
SELECT is((SELECT count(*) FROM vault.secrets WHERE description LIKE 'Número de tarjeta%'), 0::bigint,
          'al aplicarlo, el número de la tarjeta se borra');
SELECT throws_like($$ SELECT socios.ver_tarjeta((SELECT id FROM adh)) $$, '%no tiene un número%', 'y ya no se puede ver');

-- ---------- Quitar representante
DO $$ BEGIN PERFORM socios.quitar_representante((SELECT id FROM rep)); END $$;
SELECT ok(NOT EXISTS (SELECT 1 FROM public.perfil_roles pr JOIN public.roles r ON r.id = pr.rol_id
                      WHERE pr.perfil_id = '00000000-0000-0000-0000-0000000000d1' AND r.nombre = 'representante_disciplina'),
          'al quitarla, pierde el rol');

SELECT * FROM finish();
ROLLBACK;
