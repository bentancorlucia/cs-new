-- Socios: membresías, inscripciones, lotes de cuotas y sincronización.
BEGIN;
SELECT plan(45);

DO $$ BEGIN PERFORM contabilidad.crear_ejercicio(2026); END $$;
CREATE FUNCTION pg_temp.saldo(p_codigo text) RETURNS numeric LANGUAGE sql AS $$
  SELECT coalesce(sum(l.debe - l.haber), 0) FROM contabilidad.lineas l
  JOIN contabilidad.asientos a ON a.id = l.asiento_id JOIN contabilidad.cuentas c ON c.id = l.cuenta_id
  WHERE a.estado = 'confirmado' AND c.codigo = p_codigo
$$;
CREATE FUNCTION pg_temp.persona(p_cedula text) RETURNS integer LANGUAGE sql AS $$
  SELECT id FROM public.padron_socios WHERE cedula = p_cedula
$$;

INSERT INTO socios.planes (nombre, tipo, disciplina_id, permite_anual)
VALUES ('Cuota social', 'social', NULL, true), ('Hockey Primera', 'disciplina', 7, false);
CREATE TEMP TABLE pl AS SELECT nombre, id FROM socios.planes;
CREATE FUNCTION pg_temp.pl(p text) RETURNS integer LANGUAGE sql AS $$ SELECT id FROM pl WHERE nombre = p $$;
INSERT INTO socios.plan_precios (plan_id, vigente_desde, importe_mensual, importe_anual)
VALUES (pg_temp.pl('Cuota social'), '2026-01-01', 1000, 10800), (pg_temp.pl('Hockey Primera'), '2026-01-01', 1500, NULL);

-- ---------- Alta
SELECT lives_ok($$ SELECT socios.alta_socio(
  '{"cedula": "1.234.567-8", "nombre": "Ana", "apellido": "Prueba", "email": "ANA@EXAMPLE.COM"}', '2026-03-01',
  jsonb_build_array(jsonb_build_object('plan_id', pg_temp.pl('Cuota social')),
                    jsonb_build_object('plan_id', pg_temp.pl('Hockey Primera'))),
  '{"medio": "debito_visa", "tarjeta_ultimos4": "4321", "tarjeta_vencimiento": "2028-05-20"}') $$, 'alta con planes y débito');
SELECT ok((SELECT activo FROM public.padron_socios WHERE cedula = '12345678'), 'queda activa en el padrón (cédula normalizada)');
SELECT isnt((SELECT numero_socio FROM public.padron_socios WHERE cedula = '12345678'), NULL, 'con número de socio');
SELECT is((SELECT categoria::text FROM public.padron_disciplinas WHERE padron_socio_id = pg_temp.persona('12345678')),
          'Hockey Primera', 'la disciplina aparece en el padrón viejo');
SELECT is((SELECT tarjeta_vencimiento FROM socios.medios_cobro WHERE persona_id = pg_temp.persona('12345678')),
          '2028-05-01'::date, 'de la tarjeta solo últimos 4 y mes de vencimiento');
SELECT throws_ok($$ SELECT socios.cambiar_medio_cobro(pg_temp.persona('12345678'),
  '{"medio": "debito_visa", "tarjeta_ultimos4": "4111111111111111"}', '2026-04-01') $$,
  '22001', NULL, 'no se guarda el número de la tarjeta');

SELECT throws_like($$ SELECT socios.alta_socio('{"cedula": "12345678"}', '2026-04-01') $$,
                   '%ya era socia%', 'no se superponen membresías');
SELECT throws_like($$ SELECT socios.inscribir(pg_temp.persona('12345678'), pg_temp.pl('Hockey Primera'), '2026-05-01') $$,
                   '%ya está inscripta%', 'no se repite la inscripción');
SELECT throws_like($$ SELECT socios.inscribir(pg_temp.persona('12345678'), pg_temp.pl('Cuota social'), '2026-05-01') $$,
                   '%cuota social%', 'una sola cuota social');
INSERT INTO public.padron_socios (nombre, apellido, cedula, activo) VALUES ('Sin', 'Membresía', '99999999', false);
SELECT throws_like($$ SELECT socios.inscribir(pg_temp.persona('99999999'), pg_temp.pl('Hockey Primera'), '2026-05-01') $$,
                   '%deportistas que no sean socios%', 'no hay deportistas que no sean socios');
SELECT throws_like($$ SELECT socios.inscribir(pg_temp.persona('12345678'), pg_temp.pl('Hockey Primera'), '2026-05-01', 'anual') $$,
                   '%opción anual%', 'anual solo si el plan lo permite');

-- ---------- Lote de marzo
SELECT is((SELECT count(*) FROM socios.previsualizar_lote('2026-03-01') WHERE excluida IS NULL), 2::bigint,
          'la previsualización trae social y disciplina');
CREATE TEMP TABLE lote_marzo AS SELECT socios.emitir_lote('2026-03-01') AS id;
SELECT is((SELECT importe_total FROM socios.lotes WHERE id = (SELECT id FROM lote_marzo)), 2500.00::numeric, 'lote por 2500');
SELECT is(pg_temp.saldo('1.1.03.01'), 1000.00::numeric, 'cuota social a cobrar');
SELECT is(pg_temp.saldo('1.1.03.02'), 1500.00::numeric, 'cuota de disciplina a cobrar');
SELECT is((SELECT sum(l.haber) FROM contabilidad.lineas l JOIN contabilidad.cuentas c ON c.id = l.cuenta_id
           JOIN contabilidad.centros_costo cc ON cc.id = l.centro_costo_id
           WHERE c.codigo = '4.2.01' AND cc.disciplina_id = 7), 1500.00::numeric, 'ingreso de la disciplina con su centro');
SELECT is((SELECT fecha_vencimiento FROM socios.cuotas WHERE lote_id = (SELECT id FROM lote_marzo) LIMIT 1),
          '2026-03-10'::date, 'vence el día configurado');
SELECT throws_like($$ SELECT socios.emitir_lote('2026-03-01') $$, '%No hay cuotas%', 'no se emite dos veces el mismo mes');
SELECT throws_like($$ SELECT socios.emitir_cuota((SELECT suscripcion_id FROM socios.cuotas WHERE tipo = 'social' LIMIT 1), '2026-03-01') $$,
                   '%Ya hay una cuota%', 'ni por fuera del lote');

-- ---------- Inmutabilidad
SELECT throws_like($$ UPDATE socios.cuotas SET importe = 1 WHERE tipo = 'social' $$, '%nota de crédito%', 'el importe no se edita');
SELECT throws_like($$ DELETE FROM socios.cuotas WHERE tipo = 'social' $$, '%no se borran%', 'las cuotas no se borran');
SELECT throws_like($$ UPDATE socios.plan_precios SET importe_mensual = 1 WHERE plan_id = pg_temp.pl('Cuota social') $$,
                   '%ya se usó%', 'un precio usado no cambia');

-- ---------- Precio nuevo y cuota anual
INSERT INTO socios.plan_precios (plan_id, vigente_desde, importe_mensual, importe_anual)
VALUES (pg_temp.pl('Cuota social'), '2026-04-01', 1200, 12000);
SELECT is((SELECT importe FROM socios.previsualizar_lote('2026-04-01') WHERE tipo = 'social'), 1200.00::numeric,
          'abril toma el precio nuevo');
DO $$ BEGIN PERFORM socios.alta_socio('{"cedula": "2345678-9", "nombre": "Beto", "apellido": "Prueba"}', '2026-05-15',
  jsonb_build_array(jsonb_build_object('plan_id', pg_temp.pl('Cuota social'), 'periodicidad', 'anual'))); END $$;
SELECT is((SELECT importe FROM socios.previsualizar_lote('2026-05-01') WHERE persona_id = pg_temp.persona('23456789')),
          8000.00::numeric, 'anual desde mayo: 8/12 del precio anual');
DO $$ BEGIN PERFORM socios.emitir_lote('2026-05-01'); END $$;
SELECT is((SELECT periodo_hasta FROM socios.cuotas WHERE persona_id = pg_temp.persona('23456789')), '2026-12-31'::date,
          'la cuota anual cubre hasta diciembre');
SELECT is((SELECT count(*) FROM socios.previsualizar_lote('2026-06-01') WHERE persona_id = pg_temp.persona('23456789')),
          0::bigint, 'y no vuelve a aparecer en junio');
SELECT throws_like($$ SELECT socios.emitir_cuota((SELECT id FROM socios.suscripciones WHERE persona_id = pg_temp.persona('23456789')), '2026-08-01') $$,
                   '%Ya hay una cuota%', 'ni una cuota suelta dentro del año pago');

-- ---------- Mes del alta bonificado
UPDATE socios.config SET cobrar_mes_alta = false;
DO $$ BEGIN PERFORM socios.alta_socio('{"cedula": "34567890", "nombre": "Ceci", "apellido": "Prueba"}', '2026-06-10',
  jsonb_build_array(jsonb_build_object('plan_id', pg_temp.pl('Cuota social')))); END $$;
SELECT is((SELECT excluida FROM socios.previsualizar_lote('2026-06-01') WHERE persona_id = pg_temp.persona('34567890')),
          'Mes del alta bonificado', 'el mes del alta queda bonificado si así se configura');
UPDATE socios.config SET cobrar_mes_alta = true;

-- ---------- Cuota suelta y cargo
SELECT throws_like($$ SELECT socios.emitir_cuota((SELECT id FROM socios.suscripciones WHERE persona_id = pg_temp.persona('12345678')
  AND plan_id = pg_temp.pl('Hockey Primera')), '2026-02-01') $$, '%no está vigente%', 'no se cobra antes de inscribirse');
SELECT throws_like($$ SELECT socios.emitir_cuota((SELECT id FROM socios.suscripciones WHERE persona_id = pg_temp.persona('12345678')
  AND plan_id = pg_temp.pl('Hockey Primera')), '2026-06-01', 900) $$, '%indicá el motivo%', 'otro importe exige motivo');
SELECT lives_ok($$ SELECT socios.emitir_cargo(pg_temp.persona('23456789'), 'Cuota de ingreso', 500,
  (SELECT id FROM contabilidad.cuentas WHERE codigo = '4.1.02')) $$, 'cargo suelto');

-- ---------- Baja
DO $$ BEGIN PERFORM socios.baja_socio(pg_temp.persona('12345678'), '2026-06-30', 1::smallint, 'Prueba'); END $$;
SELECT ok(NOT (SELECT activo FROM public.padron_socios WHERE cedula = '12345678'), 'la baja la desactiva en el padrón');
SELECT is((SELECT count(*) FROM socios.suscripciones WHERE persona_id = pg_temp.persona('12345678') AND hasta IS NULL),
          0::bigint, 'y cierra sus inscripciones');
SELECT is((SELECT count(*) FROM socios.previsualizar_lote('2026-07-01') WHERE persona_id = pg_temp.persona('12345678')),
          0::bigint, 'julio ya no le genera cuotas');

-- ---------- Cuenta web
INSERT INTO auth.users (id, instance_id, aud, role, email, raw_user_meta_data)
VALUES ('00000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-000000000000', 'authenticated',
        'authenticated', 'beto-test@example.com', '{"nombre": "Beto", "apellido": "Prueba"}');
UPDATE public.padron_socios SET perfil_id = '00000000-0000-0000-0000-0000000000e1' WHERE cedula = '23456789';
SELECT ok((SELECT es_socio FROM public.perfiles WHERE id = '00000000-0000-0000-0000-0000000000e1'),
          'al vincular la cuenta web queda como socio');
SELECT ok(EXISTS (SELECT 1 FROM public.perfil_roles pr JOIN public.roles r ON r.id = pr.rol_id
                  WHERE pr.perfil_id = '00000000-0000-0000-0000-0000000000e1' AND r.nombre = 'socio')
          AND NOT EXISTS (SELECT 1 FROM public.perfil_roles pr JOIN public.roles r ON r.id = pr.rol_id
                  WHERE pr.perfil_id = '00000000-0000-0000-0000-0000000000e1' AND r.nombre = 'no_socio'),
          'con rol socio y sin no_socio');
DO $$ BEGIN PERFORM socios.baja_socio(pg_temp.persona('23456789'), '2026-08-31', 1::smallint); END $$;
SELECT ok(NOT (SELECT es_socio FROM public.perfiles WHERE id = '00000000-0000-0000-0000-0000000000e1'),
          'la baja le saca el precio de socio');

-- ---------- Regresiones de la revisión de pantallas
-- Número de socio libre aunque haya números cargados a mano
DO $$ BEGIN
  PERFORM socios.alta_socio('{"cedula": "51111111", "nombre": "N", "apellido": "Prueba", "numero_socio": 500}', '2026-01-01');
  PERFORM socios.alta_socio('{"cedula": "52222222", "nombre": "N", "apellido": "Prueba"}', '2026-01-01');
  PERFORM socios.alta_socio('{"cedula": "53333333", "nombre": "N", "apellido": "Prueba"}', '2026-01-01');
END $$;
SELECT is((SELECT numero_socio FROM public.padron_socios WHERE cedula = '53333333'), 502, 'el número automático salta los cargados a mano');

-- Inscripción que empezaba después de la baja: no queda viva
DO $$ BEGIN
  PERFORM socios.inscribir(pg_temp.persona('52222222'), pg_temp.pl('Cuota social'), '2026-11-01');
  PERFORM socios.dar_baja(pg_temp.persona('52222222'), '2026-10-15', 1::smallint);
END $$;
SELECT is((SELECT count(*) FROM socios.suscripciones WHERE persona_id = pg_temp.persona('52222222')), 0::bigint,
          'la inscripción posterior a la baja no queda');
SELECT throws_like($$ SELECT socios.cambiar_medio_cobro(pg_temp.persona('53333333'), '{"medio": "debito_visa"}', '2026-02-01') $$,
                   '%últimos 4%', 'el débito exige los últimos 4 dígitos');

-- Un usuario de secretaría lee y edita los catálogos (las políticas no
-- pueden depender de funciones que authenticated no ejecuta)
INSERT INTO auth.users (id, instance_id, aud, role, email, raw_user_meta_data)
VALUES ('00000000-0000-0000-0000-0000000000e2', '00000000-0000-0000-0000-000000000000', 'authenticated',
        'authenticated', 'secre-test@example.com', '{"nombre": "Secre", "apellido": "Prueba"}');
INSERT INTO public.perfil_roles (perfil_id, rol_id)
SELECT '00000000-0000-0000-0000-0000000000e2', id FROM public.roles WHERE nombre = 'secretaria';
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000e2","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;
SELECT cmp_ok((SELECT count(*) FROM socios.planes), '>', 0::bigint, 'secretaría lee los planes');
SELECT lives_ok($$ UPDATE socios.planes SET permite_anual = true WHERE nombre = 'Cuota social' $$, 'y los edita');
SELECT is((SELECT count(*) FROM socios.plan_precios), 3::bigint, 'lee los precios');
SELECT throws_ok($$ INSERT INTO socios.plan_precios (plan_id, vigente_desde, importe_mensual)
                    VALUES ((SELECT id FROM socios.planes LIMIT 1), '2027-01-01', 1) $$,
                 '42501', NULL, 'pero no carga precios (es de tesorería)');
SELECT lives_ok($$ SELECT count(*) FROM comunicaciones.config $$, 'lee la configuración de comunicaciones');
RESET ROLE;
SELECT set_config('request.jwt.claims', '', true);

SELECT * FROM finish();
ROLLBACK;
