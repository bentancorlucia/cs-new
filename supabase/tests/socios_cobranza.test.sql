-- Socios: cobros, saldo a favor, débito Visa, notas de crédito y
-- liquidación a las disciplinas.
BEGIN;
SELECT plan(39);

DO $$ BEGIN PERFORM contabilidad.crear_ejercicio(2026); END $$;
CREATE FUNCTION pg_temp.saldo(p_codigo text) RETURNS numeric LANGUAGE sql AS $$
  SELECT coalesce(sum(l.debe - l.haber), 0) FROM contabilidad.lineas l
  JOIN contabilidad.asientos a ON a.id = l.asiento_id JOIN contabilidad.cuentas c ON c.id = l.cuenta_id
  WHERE a.estado = 'confirmado' AND c.codigo = p_codigo
$$;
CREATE FUNCTION pg_temp.p(p_cedula text) RETURNS integer LANGUAGE sql AS $$
  SELECT id FROM public.padron_socios WHERE cedula = p_cedula
$$;
CREATE FUNCTION pg_temp.deuda(p_cedula text) RETURNS numeric LANGUAGE sql AS $$
  SELECT coalesce(sum(saldo), 0) FROM socios.cuotas_saldo WHERE persona_id = pg_temp.p(p_cedula) AND estado = 'emitida'
$$;
CREATE FUNCTION pg_temp.cuota(p_cedula text, p_tipo text, p_mes date) RETURNS bigint LANGUAGE sql AS $$
  SELECT id FROM socios.cuotas WHERE persona_id = pg_temp.p(p_cedula) AND tipo = p_tipo AND periodo_desde = p_mes
$$;

INSERT INTO socios.planes (nombre, tipo, disciplina_id) VALUES ('Cuota social', 'social', NULL), ('Hockey', 'disciplina', 7);
INSERT INTO socios.plan_precios (plan_id, vigente_desde, importe_mensual)
SELECT id, '2026-01-01', CASE tipo WHEN 'social' THEN 1000 ELSE 1500 END FROM socios.planes;
INSERT INTO socios.disciplinas_cobranza (disciplina_id, porcentaje_comision) VALUES (7, 50);
DO $$
DECLARE
  v_social integer := (SELECT id FROM socios.planes WHERE tipo = 'social');
  v_hockey integer := (SELECT id FROM socios.planes WHERE tipo = 'disciplina');
BEGIN
  PERFORM socios.alta_socio('{"cedula": "11111111", "nombre": "Ana", "apellido": "Visa"}', '2026-03-01',
    jsonb_build_array(jsonb_build_object('plan_id', v_social), jsonb_build_object('plan_id', v_hockey)),
    '{"medio": "debito_visa", "tarjeta_ultimos4": "1111"}');
  PERFORM socios.alta_socio('{"cedula": "22222222", "nombre": "Beto", "apellido": "Transferencia"}', '2026-03-01',
    jsonb_build_array(jsonb_build_object('plan_id', v_social)), '{"medio": "transferencia_club"}');
  PERFORM socios.alta_socio('{"cedula": "33333333", "nombre": "Ceci", "apellido": "Hockey"}', '2026-03-01',
    jsonb_build_array(jsonb_build_object('plan_id', v_social), jsonb_build_object('plan_id', v_hockey)),
    '{"medio": "transferencia_disciplina", "disciplina_id": 7}');
  PERFORM socios.emitir_lote('2026-03-01');
END $$;

-- ---------- Transferencia con excedente: saldo a favor
CREATE TEMP TABLE cobro_b AS SELECT socios.registrar_cobro(pg_temp.p('22222222'), '2026-03-20', 'transferencia_club', 1500,
  p_referencia => 'TRF-1') AS id;
SELECT is((SELECT saldo FROM socios.cuotas_saldo WHERE id = pg_temp.cuota('22222222', 'social', '2026-03-01')),
          0.00::numeric, 'el cobro cancela la cuota de marzo');
SELECT is((SELECT saldo_a_favor FROM socios.cobros_saldo WHERE id = (SELECT id FROM cobro_b)), 500.00::numeric,
          'y deja 500 a favor');
SELECT is(pg_temp.saldo('2.1.04.01'), -500.00::numeric, 'contabilizados como cobro por adelantado');
SELECT throws_like($$ SELECT socios.registrar_cobro(pg_temp.p('22222222'), '2026-03-21', 'transferencia_club', 100,
  p_referencia => ' trf-1 ') $$, '%duplicate key%', 'la misma referencia no entra dos veces');
SELECT throws_like($$ SELECT socios.registrar_cobro(pg_temp.p('22222222'), contabilidad._hoy() + 1, 'efectivo', 100) $$,
                   '%futura%', 'no se cobra con fecha futura');
SELECT throws_like($$ SELECT socios.registrar_cobro(pg_temp.p('22222222'), '2026-03-21', 'efectivo', 100, NULL, NULL, NULL,
  ARRAY[pg_temp.cuota('11111111', 'social', '2026-03-01')]) $$, '%no es de la persona%', 'ni a cuotas de otra persona');
SELECT throws_like($$ INSERT INTO socios.aplicaciones (cobro_id, cuota_id, persona_id, importe, fecha, asiento_id)
  SELECT id, pg_temp.cuota('22222222', 'social', '2026-03-01'), pg_temp.p('22222222'), 1, '2026-03-20', asiento_id
  FROM socios.cobros WHERE id = (SELECT id FROM cobro_b) $$, '%más que el saldo%', 'nunca por encima del saldo de la cuota');

DO $$ BEGIN PERFORM socios.emitir_lote('2026-04-01'); END $$;
SELECT is((SELECT saldo FROM socios.cuotas_saldo WHERE id = pg_temp.cuota('22222222', 'social', '2026-04-01')),
          500.00::numeric, 'al emitir abril se aplica solo el saldo a favor');
SELECT is(pg_temp.saldo('2.1.04.01'), 0.00::numeric, 'y el adelanto queda en cero');

-- ---------- Pago en la cuenta de la disciplina
DO $$ BEGIN PERFORM socios.registrar_cobro(pg_temp.p('33333333'), '2026-03-25', 'transferencia_disciplina', 2500,
  p_disciplina => 7); END $$;
SELECT is((SELECT deuda_disciplina FROM socios.previsualizar_liquidacion_disciplina(7, '2026-03-01', '2026-04-30')),
          2500.00::numeric, 'lo que cobró la disciplina es deuda suya con el club');

-- ---------- Débito Visa de marzo
CREATE TEMP TABLE visa AS SELECT socios.aplicar_liquidacion_visa('2026-03-01', '2026-04-10', 100,
  jsonb_build_array(jsonb_build_object('persona_id', pg_temp.p('11111111'), 'importe', 2500)),
  '[{"documento": "55555555", "importe": 1000, "motivo": "Tarjeta vencida"}]') AS id;
SELECT is((SELECT sum(saldo) FROM socios.cuotas_saldo WHERE persona_id = pg_temp.p('11111111') AND periodo_desde = '2026-03-01'),
          0.00::numeric, 'el débito cancela las cuotas de marzo');
SELECT is(pg_temp.saldo('1.1.01.05'), 1500.00 + 2400.00, 'al banco entra el neto');
SELECT is((SELECT importe FROM socios.liquidacion_visa_comisiones WHERE liquidacion_visa_id = (SELECT id FROM visa)
           AND disciplina_id = 7), 30.00::numeric, 'a hockey se le carga la mitad de la comisión sobre sus cuotas');
SELECT is((SELECT sum(l.debe) FROM contabilidad.lineas l JOIN contabilidad.cuentas c ON c.id = l.cuenta_id
           WHERE c.codigo = '5.2.08'), 100.00::numeric, 'la comisión entera es gasto');
SELECT is((SELECT count(*) FROM socios.liquidacion_visa_rechazos WHERE liquidacion_visa_id = (SELECT id FROM visa)),
          1::bigint, 'el rechazo queda registrado sin tocar cuotas');
SELECT throws_like($$ SELECT socios.aplicar_liquidacion_visa('2026-03-01', '2026-04-11', 0,
  jsonb_build_array(jsonb_build_object('persona_id', pg_temp.p('11111111'), 'importe', 100))) $$,
  '%ya se les aplicó%', 'no se debita dos veces el mismo período');
SELECT throws_like($$ SELECT socios.anular_cobro((SELECT id FROM socios.cobros WHERE medio = 'debito_visa'), 'Prueba') $$,
                   '%con su liquidación%', 'un débito se anula con su liquidación');

-- ---------- Liquidación a hockey (marzo y abril)
SELECT is((SELECT importe FROM socios.previsualizar_liquidacion_disciplina(7, '2026-03-01', '2026-04-30')),
          2970.00::numeric, 'le corresponde lo cobrado de sus cuotas menos su parte de la comisión');
CREATE TEMP TABLE liq AS SELECT socios.liquidar_disciplina(7, '2026-03-01', '2026-04-30', '2026-05-05') AS id;
SELECT is((SELECT club_le_debe FROM socios.saldos_disciplinas() WHERE disciplina_id = 7), 2970.00::numeric,
          'la liquidación es deuda del club con la disciplina');
SELECT is((SELECT saldo FROM socios.liquidaciones_disciplina_saldo WHERE id = (SELECT id FROM liq)), 2970.00::numeric,
          'pendiente de pago');
SELECT throws_like($$ SELECT socios.pagar_liquidacion_disciplina((SELECT id FROM liq), '2026-05-06', 0, NULL, 2600) $$,
                   '%le debe al club%', 'no se compensa más que la deuda de la disciplina');
DO $$ BEGIN PERFORM socios.pagar_liquidacion_disciplina((SELECT id FROM liq), '2026-05-06', 470, NULL, 2500); END $$;
SELECT is((SELECT saldo FROM socios.liquidaciones_disciplina_saldo WHERE id = (SELECT id FROM liq)), 0.00::numeric,
          'pagada: se transfiere la diferencia y se compensa la deuda');
SELECT is((SELECT saldo FROM socios.saldos_disciplinas() WHERE disciplina_id = 7), 0.00::numeric,
          'la cuenta corriente queda en cero');
SELECT throws_like($$ SELECT socios.pagar_liquidacion_disciplina((SELECT id FROM liq), '2026-05-06', 1) $$,
                   '%más que el saldo%', 'no se paga dos veces');
SELECT throws_like($$ SELECT socios.anular_liquidacion_disciplina((SELECT id FROM liq), 'Prueba') $$,
                   '%tiene pagos%', 'una liquidación pagada no se anula sin anular el pago');
SELECT is((SELECT sum(l.debe) FROM contabilidad.lineas l JOIN contabilidad.cuentas c ON c.id = l.cuenta_id
           WHERE c.codigo = '5.2.09'), 2970.00::numeric, 'lo liquidado es gasto de la disciplina');
SELECT throws_like($$ SELECT socios.liquidar_disciplina(7, '2026-04-01', '2026-05-31', '2026-06-05') $$,
                   '%ya se liquidó%', 'no se liquida dos veces el mismo período');
SELECT throws_like($$ SELECT socios.registrar_cobro(pg_temp.p('11111111'), '2026-04-15', 'transferencia_club', 2500) $$,
                   '%ya se liquidó a la disciplina%', 'un cobro no cae en un período ya liquidado');
SELECT throws_like($$ SELECT socios.anular_liquidacion_visa((SELECT id FROM visa), 'Prueba') $$,
                   '%anulá esa liquidación primero%', 'ni se anula un débito ya liquidado');

-- ---------- Nota de crédito
DO $$ BEGIN PERFORM socios.registrar_credito(pg_temp.p('11111111'), '2026-05-10', 'bonificacion', 'Prueba',
  jsonb_build_array(jsonb_build_object('cuota_id', pg_temp.cuota('11111111', 'social', '2026-04-01')))); END $$;
SELECT is((SELECT saldo FROM socios.cuotas_saldo WHERE id = pg_temp.cuota('11111111', 'social', '2026-04-01')),
          0.00::numeric, 'la nota de crédito cancela el saldo');
SELECT throws_like($$ SELECT socios.anular_lote((SELECT lote_id FROM socios.cuotas WHERE id = pg_temp.cuota('11111111', 'social', '2026-04-01')), 'Prueba') $$,
                   '%cobros o notas de crédito%', 'un lote con cuotas cobradas no se anula');

-- ---------- Situación y estado de cuenta
SELECT is((SELECT saldo FROM socios.estado_cuenta(pg_temp.p('22222222')) ORDER BY fecha DESC, tipo LIMIT 1),
          500.00::numeric, 'estado de cuenta con saldo acumulado');
SELECT ok((SELECT al_dia FROM socios.situacion('2026-05-15') WHERE persona_id = pg_temp.p('11111111')),
          'con una cuota vencida sigue al día por la tolerancia del débito');
SELECT is((SELECT sum(abs(diferencia)) FROM socios.control_contable()), 0.00::numeric,
          'las cuotas cuadran con la contabilidad');

-- ---------- Anular un cobro con saldo a favor ya aplicado
DO $$ BEGIN PERFORM socios.anular_cobro((SELECT id FROM cobro_b), 'Rebotó', '2026-05-20'); END $$;
SELECT is(pg_temp.deuda('22222222'), 2000.00::numeric, 'vuelve toda la deuda, también la del saldo aplicado');
SELECT is((SELECT sum(abs(diferencia)) FROM socios.control_contable()), 0.00::numeric, 'y sigue cuadrando');

-- ---------- Baja: lo posterior se acredita, lo anterior se mantiene
DO $$ BEGIN PERFORM socios.dar_baja(pg_temp.p('22222222'), '2026-03-31', 1::smallint, 'Prueba', false); END $$;
SELECT is(pg_temp.deuda('22222222'), 1000.00::numeric, 'se acredita abril y queda la deuda de marzo');
SELECT is((SELECT tipo FROM socios.creditos WHERE persona_id = pg_temp.p('22222222')), 'baja', 'con nota de crédito de baja');
SELECT is((SELECT sum(abs(diferencia)) FROM socios.control_contable()), 0.00::numeric, 'todo cuadra al final');

SELECT * FROM finish();
ROLLBACK;
