-- Disciplinas: cuenta corriente, pagos al club y planes de pago.
BEGIN;
SELECT plan(24);

DO $$ BEGIN PERFORM contabilidad.crear_ejercicio(extract(year FROM contabilidad._hoy())::int); END $$;
CREATE FUNCTION pg_temp.cta(p text) RETURNS uuid LANGUAGE sql AS $$ SELECT id FROM contabilidad.cuentas WHERE codigo = p $$;
CREATE FUNCTION pg_temp.hoy() RETURNS date LANGUAGE sql AS $$ SELECT contabilidad._hoy() $$;
CREATE FUNCTION pg_temp.cc_saldo() RETURNS numeric LANGUAGE sql AS $$
  SELECT saldo FROM socios.cuenta_corriente_disciplina(7) ORDER BY fecha DESC, numero DESC NULLS LAST LIMIT 1
$$;

-- Dos pedidos de hockey (7) a cuenta y uno de rugby (13), contabilizados como la tienda.
INSERT INTO public.pedidos (id, tipo, estado, subtotal, total, disciplina_id)
VALUES (9701, 'disciplina', 'retirado', 2000, 2000, 7), (9702, 'disciplina', 'retirado', 1000, 1000, 7),
       (9703, 'disciplina', 'retirado', 500, 500, 13), (9704, 'disciplina', 'cancelado', 800, 800, 7);
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT id, total, disciplina_id FROM public.pedidos WHERE id IN (9701, 9702, 9703) LOOP
    PERFORM contabilidad._asiento_automatico(pg_temp.hoy(), 'Pedido de disciplina ' || r.id, 'pedido_venta', r.id::text,
      jsonb_build_array(
        jsonb_build_object('cuenta_id', pg_temp.cta('1.1.04.03'), 'lado', 'debe', 'importe', r.total, 'disciplina_id', r.disciplina_id),
        jsonb_build_object('cuenta_id', pg_temp.cta('4.4.03'), 'lado', 'haber', 'importe', r.total)));
  END LOOP;
END $$;

-- ---------- Cuenta corriente
SELECT is((SELECT count(*) FROM socios.cuenta_corriente_disciplina(7)), 2::bigint, 'la cuenta corriente trae las compras de hockey');
SELECT is((SELECT string_agg(DISTINCT tipo, ',') FROM socios.cuenta_corriente_disciplina(7)), 'compra_tienda', 'clasificadas como compras');
SELECT is(pg_temp.cc_saldo(), 3000.00::numeric, 'hockey debe 3000');
SELECT is((SELECT pedido_id FROM socios.cuenta_corriente_disciplina(7) ORDER BY numero LIMIT 1), 9701, 'con el pedido');
SELECT is((SELECT saldo FROM socios.saldos_disciplinas() WHERE disciplina_id = 13), 500.00::numeric, 'saldo de rugby en la lista');

-- ---------- Plan de pago
SELECT throws_like($$ SELECT socios.crear_plan_pago(7, ARRAY[9701, 9702], '[{"vencimiento": "2030-01-10", "importe": 1000}]') $$,
                   '%suman 1000%', 'las cuotas tienen que sumar el plan');
SELECT throws_like($$ SELECT socios.crear_plan_pago(7, ARRAY[9701, 9703], '[{"vencimiento": "2030-01-10", "importe": 2500}]') $$,
                   '%no son de la disciplina%', 'solo pedidos de la disciplina');
SELECT throws_like($$ SELECT socios.crear_plan_pago(7, ARRAY[9704], '[{"vencimiento": "2030-01-10", "importe": 800}]') $$,
                   '%cancelados%', 'ni pedidos cancelados');
SELECT throws_like($$ SELECT socios.crear_plan_pago(7, ARRAY[9701], '[{"vencimiento": "2030-02-10", "importe": 1000}, {"vencimiento": "2030-01-10", "importe": 1000}]') $$,
                   '%en orden%', 'los vencimientos van en orden');
CREATE TEMP TABLE pl AS SELECT socios.crear_plan_pago(7, ARRAY[9701, 9702], jsonb_build_array(
  jsonb_build_object('vencimiento', pg_temp.hoy() - 10, 'importe', 1000),
  jsonb_build_object('vencimiento', pg_temp.hoy() + 20, 'importe', 1000),
  jsonb_build_object('vencimiento', pg_temp.hoy() + 50, 'importe', 1000)), 'Prueba plan hockey') AS id;
SELECT is((SELECT situacion FROM socios.planes_pago_resumen WHERE id = (SELECT id FROM pl)), 'atrasado',
          'con la primera cuota vencida, el plan está atrasado');
SELECT throws_like($$ SELECT socios.crear_plan_pago(7, ARRAY[9702], '[{"vencimiento": "2030-01-10", "importe": 1000}]') $$,
                   '%otro plan%', 'un pedido está en un solo plan vigente');
SELECT throws_like($$ UPDATE socios.plan_pago_cuotas SET importe = 1 WHERE plan_id = (SELECT id FROM pl) $$,
                   '%no cambian%', 'las cuotas no se editan');

SELECT throws_like($$ UPDATE public.pedidos SET estado = 'cancelado' WHERE id = 9702 $$,
                   '%plan de pago vigente%', 'un pedido en un plan no se cancela');

-- ---------- Pago de la disciplina imputado al plan
CREATE TEMP TABLE c1 AS SELECT socios.registrar_cobro_disciplina(7, pg_temp.hoy(), 1500, NULL, 'TRF-H1', (SELECT id FROM pl)) AS id;
SELECT is((SELECT string_agg(situacion, ',' ORDER BY numero) FROM socios.plan_pago_cuotas_saldo WHERE plan_id = (SELECT id FROM pl)),
          'pagada,parcial,pendiente', 'el pago cubre la primera cuota y parte de la segunda');
SELECT is(pg_temp.cc_saldo(), 1500.00::numeric, 'y baja la deuda de la disciplina');
SELECT is((SELECT tipo FROM socios.cuenta_corriente_disciplina(7) ORDER BY numero DESC NULLS LAST LIMIT 1), 'pago',
          'el pago figura en la cuenta corriente');
SELECT is((SELECT situacion FROM socios.planes_pago_resumen WHERE id = (SELECT id FROM pl)), 'al_dia', 'el plan queda al día');

-- ---------- Anular el pago: vuelve la deuda y las cuotas
DO $$ BEGIN PERFORM socios.anular_cobro_disciplina((SELECT id FROM c1), 'Prueba'); END $$;
SELECT is((SELECT saldo FROM socios.planes_pago_resumen WHERE id = (SELECT id FROM pl)), 3000.00::numeric,
          'anular el pago devuelve el saldo del plan');
SELECT is(pg_temp.cc_saldo(), 3000.00::numeric, 'y la deuda');

-- ---------- Plan ya pago: el excedente queda a cuenta de la deuda general
CREATE TEMP TABLE pl2 AS SELECT socios.crear_plan_pago(13, ARRAY[9703], '[{"vencimiento": "2030-01-10", "importe": 500}]') AS id;
DO $$ BEGIN PERFORM socios.registrar_cobro_disciplina(13, pg_temp.hoy(), 500, NULL, NULL, (SELECT id FROM pl2)); END $$;
SELECT lives_ok($$ SELECT socios.registrar_cobro_disciplina(13, pg_temp.hoy(), 100, NULL, NULL, (SELECT id FROM pl2)) $$,
                'un pago a un plan ya cumplido no se rechaza');

-- ---------- Cancelar el plan libera los pedidos
DO $$ BEGIN PERFORM socios.cancelar_plan_pago((SELECT id FROM pl), 'Se rearma'); END $$;
SELECT is((SELECT count(*) FROM socios.plan_pago_cuotas_saldo WHERE plan_id = (SELECT id FROM pl) AND situacion = 'cancelada'),
          3::bigint, 'las cuotas impagas de un plan cancelado no figuran como vencidas');
SELECT lives_ok($$ SELECT socios.crear_plan_pago(7, ARRAY[9701, 9702], '[{"vencimiento": "2030-01-10", "importe": 3000}]') $$,
                'cancelado el plan, los pedidos van a otro');

-- ---------- Solo tesorería ve la cuenta corriente
INSERT INTO auth.users (id, instance_id, aud, role, email, raw_user_meta_data)
VALUES ('00000000-0000-0000-0000-0000000000e3', '00000000-0000-0000-0000-000000000000', 'authenticated',
        'authenticated', 'secre-disc@example.com', '{"nombre": "Secre", "apellido": "Prueba"}');
INSERT INTO public.perfil_roles (perfil_id, rol_id)
SELECT '00000000-0000-0000-0000-0000000000e3', id FROM public.roles WHERE nombre = 'secretaria';
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000e3","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;
SELECT throws_ok($$ SELECT * FROM socios.cuenta_corriente_disciplina(7) $$, '42501', NULL,
                 'secretaría no ve la cuenta corriente');
SELECT lives_ok($$ SELECT * FROM socios.planes_pago_resumen $$, 'las vistas de planes se leen como usuario del sitio');
RESET ROLE;
SELECT set_config('request.jwt.claims', '', true);

SELECT * FROM finish();
ROLLBACK;
