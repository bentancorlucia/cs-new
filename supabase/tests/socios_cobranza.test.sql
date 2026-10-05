-- Socios: cobros, saldo a favor, débito Visa, notas de crédito y
-- liquidación a las disciplinas.
BEGIN;
SELECT plan(48);

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

INSERT INTO socios.planes (nombre, tipo, disciplina_id) VALUES ('Cuota social', 'social', NULL), ('Hockey', 'disciplina', 7),
  ('Rugby', 'disciplina', 13);
INSERT INTO socios.plan_precios (plan_id, vigente_desde, importe_mensual)
SELECT id, '2026-01-01', CASE tipo WHEN 'social' THEN 1000 ELSE 1500 END FROM socios.planes;
INSERT INTO socios.disciplinas_cobranza (disciplina_id, porcentaje_comision) VALUES (7, 50);
DO $$
DECLARE
  v_social integer := (SELECT id FROM socios.planes WHERE tipo = 'social');
  v_hockey integer := (SELECT id FROM socios.planes WHERE nombre = 'Hockey');
  v_rugby integer := (SELECT id FROM socios.planes WHERE nombre = 'Rugby');
BEGIN
  PERFORM socios.alta_socio('{"cedula": "11111111", "nombre": "Ana", "apellido": "Visa"}', '2026-03-01',
    jsonb_build_array(jsonb_build_object('plan_id', v_social), jsonb_build_object('plan_id', v_hockey)),
    '{"medio": "debito_visa", "tarjeta_ultimos4": "1111"}');
  PERFORM socios.alta_socio('{"cedula": "22222222", "nombre": "Beto", "apellido": "Transferencia"}', '2026-03-01',
    jsonb_build_array(jsonb_build_object('plan_id', v_social)), '{"medio": "transferencia_club"}');
  PERFORM socios.alta_socio('{"cedula": "33333333", "nombre": "Ceci", "apellido": "Hockey"}', '2026-03-01',
    jsonb_build_array(jsonb_build_object('plan_id', v_social), jsonb_build_object('plan_id', v_hockey)),
    '{"medio": "transferencia_disciplina", "disciplina_id": 7}');
  -- Dani: débito que rebota. Eva: rugby, le paga a la disciplina y no lo registra nadie.
  PERFORM socios.alta_socio('{"cedula": "44444444", "nombre": "Dani", "apellido": "Rebote"}', '2026-03-01',
    jsonb_build_array(jsonb_build_object('plan_id', v_social), jsonb_build_object('plan_id', v_hockey)),
    '{"medio": "debito_visa", "tarjeta_ultimos4": "4444"}');
  PERFORM socios.alta_socio('{"cedula": "66666666", "nombre": "Eva", "apellido": "Rugby"}', '2026-03-01',
    jsonb_build_array(jsonb_build_object('plan_id', v_social), jsonb_build_object('plan_id', v_rugby)),
    '{"medio": "transferencia_disciplina", "disciplina_id": 13}');
  PERFORM socios.alta_socio('{"cedula": "77777777", "nombre": "Fran", "apellido": "Rugby"}', '2026-03-01',
    jsonb_build_array(jsonb_build_object('plan_id', v_social), jsonb_build_object('plan_id', v_rugby)),
    '{"medio": "transferencia_disciplina", "disciplina_id": 13}');
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
SELECT is((SELECT deuda_disciplina FROM socios.previsualizar_liquidacion_disciplina(7, '2026-03-01')),
          2500.00::numeric, 'lo que cobró la disciplina es deuda suya con el club');

-- ---------- Débito Visa de marzo: comisión e IVA aparte; Dani rebota
CREATE TEMP TABLE visa AS SELECT socios.aplicar_liquidacion_visa('2026-03-01', '2026-04-10', 80,
  jsonb_build_array(jsonb_build_object('persona_id', pg_temp.p('11111111'), 'importe', 2500)),
  jsonb_build_array(jsonb_build_object('persona_id', pg_temp.p('44444444'), 'importe', 2500, 'motivo', 'Fondos insuficientes'),
                    jsonb_build_object('documento', '55555555', 'importe', 1000, 'motivo', 'Tarjeta vencida')),
  p_iva => 20) AS id;
SELECT is((SELECT sum(saldo) FROM socios.cuotas_saldo WHERE persona_id = pg_temp.p('11111111') AND periodo_desde = '2026-03-01'),
          0.00::numeric, 'el débito cancela las cuotas de marzo');
SELECT is(pg_temp.saldo('1.1.01.05'), 1500.00 + 2400.00, 'al banco entra el neto (2.500 − 80 − 20)');
SELECT is((SELECT comision || ' + ' || iva FROM socios.liquidacion_visa_comisiones
           WHERE liquidacion_visa_id = (SELECT id FROM visa) AND disciplina_id = 7), '40.00 + 10.00',
          'a hockey se le carga la mitad de comisión e IVA sobre lo cobrado de sus socios, social incluida');
SELECT is((SELECT sum(l.debe) FROM contabilidad.lineas l JOIN contabilidad.cuentas c ON c.id = l.cuenta_id
           WHERE c.codigo = '5.2.08'), 100.00::numeric, 'comisión e IVA son gasto');
SELECT is((SELECT count(*) FROM socios.liquidacion_visa_rechazos WHERE liquidacion_visa_id = (SELECT id FROM visa)),
          2::bigint, 'los rechazos quedan registrados sin tocar cuotas');
SELECT throws_like($$ SELECT socios.aplicar_liquidacion_visa('2026-03-01', '2026-04-11', 0,
  jsonb_build_array(jsonb_build_object('persona_id', pg_temp.p('11111111'), 'importe', 100))) $$,
  '%ya se les aplicó%', 'no se debita dos veces el mismo período');
SELECT throws_like($$ SELECT socios.anular_cobro((SELECT id FROM socios.cobros WHERE medio = 'debito_visa'), 'Prueba') $$,
                   '%con su liquidación%', 'un débito se anula con su liquidación');

-- ---------- Liquidación de marzo
-- Hockey: débito de Ana 2.500 − social 1.000 − gastos 50 + Ceci pagó la
-- parte de hockey (1.500) en su cuenta − social de Dani (rebotó) 1.000 = 1.950.
SELECT is((SELECT visa_cobrado || '/' || visa_social || '/' || otros_cobrado || '/' || (gastos_comision + gastos_iva)
                  || '/' || social_a_cargo || '/' || resultado
           FROM socios.previsualizar_liquidacion_disciplina(7, '2026-03-01')),
          '2500.00/1000.00/1500.00/50.00/1000.00/1950.00', 'hockey: débito, social, otros medios, gastos y social a su cargo');
SELECT is((SELECT socios_mes FROM socios.previsualizar_liquidacion_disciplina(7, '2026-03-01')), 3,
          'hockey tiene 3 socios en marzo');
-- Rugby: sin débito, Eva no pagó en el sistema: la disciplina pone la social.
SELECT is((SELECT a_pagar || '/' || a_depositar FROM socios.previsualizar_liquidacion_disciplina(13, '2026-03-01')),
          '0/2000.00', 'rugby no cobró nada por el club: deposita la cuota social de sus dos socios');
CREATE TEMP TABLE liqs AS SELECT unnest(socios.liquidar_disciplinas_mes('2026-03-01', '2026-04-15')) AS id;
CREATE TEMP TABLE liq AS SELECT id FROM socios.liquidaciones_disciplina WHERE id IN (SELECT id FROM liqs) AND disciplina_id = 7;
SELECT is((SELECT count(*) FROM liqs), 2::bigint, 'se liquidan las dos disciplinas del mes de una vez');
SELECT is((SELECT saldo FROM socios.cuotas_saldo WHERE id = pg_temp.cuota('44444444', 'social', '2026-03-01')),
          0.00::numeric, 'la social de Dani queda cobrada a cargo de hockey');
SELECT is((SELECT saldo FROM socios.cuotas_saldo WHERE id = pg_temp.cuota('44444444', 'disciplina', '2026-03-01')),
          1500.00::numeric, 'y Dani le sigue debiendo la parte de hockey');
SELECT is((SELECT club_le_debe FROM socios.saldos_disciplinas() WHERE disciplina_id = 7), 1950.00::numeric,
          'la liquidación es deuda del club con la disciplina');
SELECT is((SELECT debe_al_club FROM socios.saldos_disciplinas() WHERE disciplina_id = 13), 2000.00::numeric,
          'y rugby queda debiendo lo que tiene que depositar');
SELECT is((SELECT jsonb_array_length(detalle) FROM socios.liquidaciones_disciplina WHERE id = (SELECT id FROM liq)), 3,
          'el detalle trae a los tres socios de hockey');
SELECT is((SELECT (e ->> 'visa_rechazado')::numeric FROM socios.liquidaciones_disciplina l, jsonb_array_elements(l.detalle) e
           WHERE l.id = (SELECT id FROM liq) AND (e ->> 'persona_id')::integer = pg_temp.p('44444444')), 2500.00::numeric,
          'con el rebote de Dani');
SELECT throws_like($$ SELECT socios.anular_cobro((SELECT id FROM socios.cobros WHERE medio = 'liquidacion_disciplina' LIMIT 1), 'x') $$,
                   '%con la liquidación de la disciplina%', 'la social a cargo de la disciplina se anula con la liquidación');
DO $$ BEGIN PERFORM socios.pagar_liquidacion_disciplina((SELECT id FROM liq), '2026-05-06', 0, NULL, 1950); END $$;
SELECT is((SELECT saldo FROM socios.liquidaciones_disciplina_saldo WHERE id = (SELECT id FROM liq)), 0.00::numeric,
          'pagada compensando lo que hockey cobró de Ceci');
SELECT is((SELECT saldo FROM socios.saldos_disciplinas() WHERE disciplina_id = 7), 550.00::numeric,
          'hockey sigue debiendo 550 (2.500 de Ceci − 1.950)');
SELECT throws_like($$ SELECT socios.pagar_liquidacion_disciplina((SELECT id FROM liq), '2026-05-06', 1) $$,
                   '%más que el saldo%', 'no se paga dos veces');
SELECT throws_like($$ SELECT socios.anular_liquidacion_disciplina((SELECT id FROM liq), 'Prueba') $$,
                   '%tiene pagos%', 'una liquidación pagada no se anula sin anular el pago');
SELECT is((SELECT sum(l.debe - l.haber) FROM contabilidad.lineas l JOIN contabilidad.cuentas c ON c.id = l.cuenta_id
           WHERE c.codigo = '5.2.09'), 2950.00::numeric, 'gasto de hockey: cuotas cobradas menos gastos del débito');
SELECT throws_like($$ SELECT socios.liquidar_disciplina(7, '2026-03-01', '2026-06-05') $$,
                   '%ya se liquidó%', 'no se liquida dos veces el mismo mes');
SELECT throws_like($$ SELECT socios.registrar_cobro(pg_temp.p('44444444'), '2026-03-30', 'transferencia_club', 1500) $$,
                   '%ya se liquidó a la disciplina%', 'un cobro no cae en un mes ya liquidado');
SELECT throws_like($$ SELECT socios.anular_liquidacion_visa((SELECT id FROM visa), 'Prueba') $$,
                   '%anulá esas liquidaciones primero%', 'ni se anula un débito ya liquidado');
DO $$ BEGIN PERFORM socios.anular_liquidacion_disciplina((SELECT id FROM liqs WHERE id NOT IN (SELECT id FROM liq)), 'Prueba'); END $$;
SELECT is((SELECT saldo FROM socios.cuotas_saldo WHERE id = pg_temp.cuota('66666666', 'social', '2026-03-01')),
          1000.00::numeric, 'anular la de rugby devuelve la social de Eva a su deuda');
SELECT is((SELECT debe_al_club FROM socios.saldos_disciplinas() WHERE disciplina_id = 13), 0.00::numeric,
          'y rugby ya no debe nada');

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
