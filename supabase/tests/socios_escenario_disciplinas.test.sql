-- Escenario completo, como la planilla de tesorería: lo que se le paga a
-- cada disciplina por mes según sus socios, tipos de cuota y medios de
-- cobro, y todos los asientos.
--
-- Precios (desde 01/2026): cuota social 1.000/mes (anual 10.800); Hockey
-- Primera 1.500; Hockey Juveniles 1.200; Rugby Plantel 2.000 (la cuota que
-- paga el socio es social + disciplina: 2.500, 2.200, 3.000).
-- Gastos del débito que absorbe cada disciplina: hockey 50 %, rugby 100 %.
--
-- Socios (alta 01/07/2026):
--   Ana   social + Hockey Primera            débito Visa          2.500
--   Bea   social + Hockey Juveniles          paga en la cuenta de hockey 2.200
--   Caro  social + Rugby                     débito Visa          3.000
--   Dani  social + Hockey Primera + Rugby    transferencia club   4.500
--         (su social está a cargo de hockey: su inscripción más antigua)
--   Eli   social                             efectivo             1.000
--   Fede  social ANUAL + Hockey Primera      transferencia club   5.400 + 1.500
--   Gabi  social + Rugby                     débito Visa: REBOTA  3.000
-- Débito de julio (acreditado 10/08): 5.500 cobrado, comisión 110 + IVA 24,20.
--   Gastos de hockey: (110 + 24,20) × 2.500/5.500 × 50 % = 25 + 5,50
--   Gastos de rugby:  (110 + 24,20) × 3.000/5.500        = 60 + 13,20
--   Club: 25 + 5,50. Al banco 5.365,80.
-- Liquidación de julio:
--   Hockey: débito 2.500 − social 1.000 − gastos 30,50 + otros medios 4.200
--           (Bea 1.200, Dani 1.500, Fede 1.500) = 5.669,50
--   Rugby:  débito 3.000 − social 1.000 − gastos 73,20 + Dani 2.000
--           − social de Gabi (rebotó) 1.000 = 2.926,80
--   (es la planilla: cobrado − gastos − social × socios de la disciplina)
-- Hockey le debe al club 5.200 (Bea + compra en la tienda): se compensa y
-- se le transfieren 469,50. A rugby, 2.926,80.
BEGIN;
SELECT plan(39);

DO $$ BEGIN PERFORM contabilidad.crear_ejercicio(2026); END $$;

CREATE FUNCTION pg_temp.cta(p text) RETURNS uuid LANGUAGE sql AS $$ SELECT id FROM contabilidad.cuentas WHERE codigo = p $$;
CREATE FUNCTION pg_temp.p(p_cedula text) RETURNS integer LANGUAGE sql AS $$ SELECT id FROM public.padron_socios WHERE cedula = p_cedula $$;
-- Saldo deudor (debe − haber) de una cuenta, opcionalmente de un centro o del auxiliar de una disciplina.
CREATE FUNCTION pg_temp.saldo(p_codigo text, p_centro text DEFAULT NULL, p_disciplina integer DEFAULT NULL) RETURNS numeric
LANGUAGE sql AS $$
  SELECT coalesce(sum(l.debe - l.haber), 0) FROM contabilidad.lineas l
  JOIN contabilidad.asientos a ON a.id = l.asiento_id
  JOIN contabilidad.cuentas c ON c.id = l.cuenta_id
  LEFT JOIN contabilidad.centros_costo cc ON cc.id = l.centro_costo_id
  WHERE a.estado = 'confirmado' AND c.codigo = p_codigo
    AND (p_centro IS NULL OR cc.codigo = p_centro)
    AND (p_disciplina IS NULL OR l.disciplina_id = p_disciplina)
$$;
-- Debe o haber de una cuenta (y centro) en un asiento.
CREATE FUNCTION pg_temp.linea(p_asiento uuid, p_codigo text, p_lado text, p_centro text DEFAULT NULL) RETURNS numeric
LANGUAGE sql AS $$
  SELECT coalesce(sum(CASE WHEN p_lado = 'debe' THEN l.debe ELSE l.haber END), 0) FROM contabilidad.lineas l
  JOIN contabilidad.cuentas c ON c.id = l.cuenta_id
  LEFT JOIN contabilidad.centros_costo cc ON cc.id = l.centro_costo_id
  WHERE l.asiento_id = p_asiento AND c.codigo = p_codigo AND (p_centro IS NULL OR cc.codigo = p_centro)
$$;

-- ---------- Planes y precios
INSERT INTO socios.planes (nombre, tipo, disciplina_id, permite_anual) VALUES
  ('Cuota social', 'social', NULL, true), ('Hockey Primera', 'disciplina', 7, false),
  ('Hockey Juveniles', 'disciplina', 7, false), ('Rugby Plantel', 'disciplina', 13, false);
CREATE FUNCTION pg_temp.pl(p text) RETURNS integer LANGUAGE sql AS $$ SELECT id FROM socios.planes WHERE nombre = p $$;
INSERT INTO socios.plan_precios (plan_id, vigente_desde, importe_mensual, importe_anual) VALUES
  (pg_temp.pl('Cuota social'), '2026-01-01', 1000, 10800), (pg_temp.pl('Hockey Primera'), '2026-01-01', 1500, NULL),
  (pg_temp.pl('Hockey Juveniles'), '2026-01-01', 1200, NULL), (pg_temp.pl('Rugby Plantel'), '2026-01-01', 2000, NULL);
INSERT INTO socios.disciplinas_cobranza (disciplina_id, porcentaje_comision) VALUES (7, 50), (13, 100);

-- ---------- Altas
DO $$
DECLARE
  s integer := pg_temp.pl('Cuota social');
  hp integer := pg_temp.pl('Hockey Primera');
  hj integer := pg_temp.pl('Hockey Juveniles');
  r integer := pg_temp.pl('Rugby Plantel');
BEGIN
  PERFORM socios.alta_socio('{"cedula": "90000001", "nombre": "Ana", "apellido": "Escenario"}', '2026-07-01',
    jsonb_build_array(jsonb_build_object('plan_id', s), jsonb_build_object('plan_id', hp)),
    '{"medio": "debito_visa", "tarjeta_ultimos4": "1111"}');
  PERFORM socios.alta_socio('{"cedula": "90000002", "nombre": "Bea", "apellido": "Escenario"}', '2026-07-01',
    jsonb_build_array(jsonb_build_object('plan_id', s), jsonb_build_object('plan_id', hj)),
    '{"medio": "transferencia_disciplina", "disciplina_id": 7}');
  PERFORM socios.alta_socio('{"cedula": "90000003", "nombre": "Caro", "apellido": "Escenario"}', '2026-07-01',
    jsonb_build_array(jsonb_build_object('plan_id', s), jsonb_build_object('plan_id', r)),
    '{"medio": "debito_visa", "tarjeta_ultimos4": "3333"}');
  PERFORM socios.alta_socio('{"cedula": "90000004", "nombre": "Dani", "apellido": "Escenario"}', '2026-07-01',
    jsonb_build_array(jsonb_build_object('plan_id', s), jsonb_build_object('plan_id', hp), jsonb_build_object('plan_id', r)),
    '{"medio": "transferencia_club"}');
  PERFORM socios.alta_socio('{"cedula": "90000005", "nombre": "Eli", "apellido": "Escenario"}', '2026-07-01',
    jsonb_build_array(jsonb_build_object('plan_id', s)), '{"medio": "efectivo"}');
  PERFORM socios.alta_socio('{"cedula": "90000006", "nombre": "Fede", "apellido": "Escenario"}', '2026-07-01',
    jsonb_build_array(jsonb_build_object('plan_id', s, 'periodicidad', 'anual'), jsonb_build_object('plan_id', hp)),
    '{"medio": "transferencia_club"}');
  PERFORM socios.alta_socio('{"cedula": "90000007", "nombre": "Gabi", "apellido": "Escenario"}', '2026-07-01',
    jsonb_build_array(jsonb_build_object('plan_id', s), jsonb_build_object('plan_id', r)),
    '{"medio": "debito_visa", "tarjeta_ultimos4": "7777"}');
END $$;

-- ============================================================
-- 1. Lote de julio
-- ============================================================
CREATE TEMP TABLE lote AS SELECT socios.emitir_lote('2026-07-01') AS id;
CREATE TEMP TABLE asi_lote AS SELECT asiento_id AS id FROM socios.lotes WHERE id = (SELECT id FROM lote);

SELECT is((SELECT cantidad FROM socios.lotes WHERE id = (SELECT id FROM lote)), 14, 'lote: 14 cuotas (7 sociales, 7 de disciplina)');
SELECT is((SELECT importe FROM socios.cuotas WHERE persona_id = pg_temp.p('90000006') AND tipo = 'social'), 5400.00::numeric,
          'la social anual desde julio es 6/12 del precio anual');
SELECT is((SELECT disciplina_responsable_id FROM socios.cuotas WHERE persona_id = pg_temp.p('90000004') AND tipo = 'social'), 7,
          'la social de Dani (hockey y rugby) queda a cargo de hockey, su inscripción más antigua');
SELECT is(pg_temp.linea((SELECT id FROM asi_lote), '1.1.03.01', 'debe'), 11400.00::numeric, 'Debe cuotas sociales a cobrar 11.400');
SELECT is(pg_temp.linea((SELECT id FROM asi_lote), '4.2.01', 'haber', 'HOCKEY-FEMENINO'), 5700.00::numeric,
          'Haber cuotas de disciplina, centro hockey 5.700');
SELECT is(pg_temp.linea((SELECT id FROM asi_lote), '4.2.01', 'haber', 'RUGBY'), 6000.00::numeric,
          'Haber cuotas de disciplina, centro rugby 6.000');

-- ============================================================
-- 2. Cobros
-- ============================================================
CREATE TEMP TABLE cobro_bea AS SELECT socios.registrar_cobro(pg_temp.p('90000002'), '2026-07-20', 'transferencia_disciplina',
  2200, p_disciplina => 7) AS id;
DO $$ BEGIN
  PERFORM socios.registrar_cobro(pg_temp.p('90000004'), '2026-07-15', 'transferencia_club', 4500, p_referencia => 'TRF-DANI');
  PERFORM socios.registrar_cobro(pg_temp.p('90000005'), '2026-07-05', 'efectivo', 1000);
  PERFORM socios.registrar_cobro(pg_temp.p('90000006'), '2026-07-12', 'transferencia_club', 6900, p_referencia => 'TRF-FEDE');
END $$;
SELECT is(pg_temp.saldo('1.1.04.03', p_disciplina => 7), 2200.00::numeric, 'hockey le debe al club lo que cobró de Bea');

-- Hockey compra en la tienda a cuenta
INSERT INTO public.pedidos (id, tipo, estado, subtotal, total, disciplina_id) VALUES (9801, 'disciplina', 'retirado', 3000, 3000, 7);
DO $$ BEGIN PERFORM contabilidad._asiento_automatico('2026-07-25', 'Pedido de hockey', 'pedido_venta', '9801',
  jsonb_build_array(jsonb_build_object('cuenta_id', pg_temp.cta('1.1.04.03'), 'lado', 'debe', 'importe', 3000, 'disciplina_id', 7),
                    jsonb_build_object('cuenta_id', pg_temp.cta('4.4.03'), 'lado', 'haber', 'importe', 3000))); END $$;

-- ---------- Débito Visa de julio: Gabi rebota
CREATE TEMP TABLE visa AS SELECT socios.aplicar_liquidacion_visa('2026-07-01', '2026-08-10', 110,
  jsonb_build_array(jsonb_build_object('persona_id', pg_temp.p('90000001'), 'importe', 2500),
                    jsonb_build_object('persona_id', pg_temp.p('90000003'), 'importe', 3000)),
  jsonb_build_array(jsonb_build_object('persona_id', pg_temp.p('90000007'), 'importe', 3000, 'motivo', 'Fondos insuficientes')),
  p_iva => 24.20) AS id;
CREATE TEMP TABLE asi_visa AS SELECT asiento_id AS id FROM socios.liquidaciones_visa WHERE id = (SELECT id FROM visa);
SELECT is(pg_temp.linea((SELECT id FROM asi_visa), '1.1.01.05', 'debe'), 5365.80::numeric, 'Visa: al banco entra 5.500 − 110 − 24,20');
SELECT is(pg_temp.linea((SELECT id FROM asi_visa), '5.2.08', 'debe', 'HOCKEY-FEMENINO'), 30.50::numeric,
          'gastos de hockey: (110 + 24,20) × 2.500/5.500 × 50 % = 25 + 5,50');
SELECT is(pg_temp.linea((SELECT id FROM asi_visa), '5.2.08', 'debe', 'RUGBY'), 73.20::numeric,
          'gastos de rugby: (110 + 24,20) × 3.000/5.500 = 60 + 13,20');
SELECT is(pg_temp.linea((SELECT id FROM asi_visa), '5.2.08', 'debe', 'ADM'), 30.50::numeric, 'el resto es del club: 25 + 5,50');
SELECT is((SELECT count(*) FROM contabilidad.lineas l JOIN contabilidad.cuentas c ON c.id = l.cuenta_id
           WHERE l.asiento_id = (SELECT id FROM asi_visa) AND c.codigo = '5.2.08' AND l.descripcion = 'IVA de la comisión'),
          3::bigint, 'el IVA de la comisión va en líneas aparte');
SELECT is((SELECT sum(saldo) FROM socios.cuotas_saldo WHERE persona_id = pg_temp.p('90000007')), 3000.00::numeric,
          'el rebote de Gabi no toca sus cuotas');

-- ============================================================
-- 3. Liquidación de julio
-- ============================================================
SELECT is((SELECT visa_cobrado || '/' || visa_social || '/' || otros_cobrado || '/' || (gastos_comision + gastos_iva)
                  || '/' || social_a_cargo || '/' || resultado || '/' || socios_mes
           FROM socios.previsualizar_liquidacion_disciplina(7, '2026-07-01')),
          '2500.00/1000.00/4200.00/30.50/0/5669.50/4', 'hockey: 2.500 − 1.000 − 30,50 + 4.200 = 5.669,50 (4 socios)');
SELECT is((SELECT visa_cobrado || '/' || visa_social || '/' || otros_cobrado || '/' || (gastos_comision + gastos_iva)
                  || '/' || social_a_cargo || '/' || resultado || '/' || socios_mes
           FROM socios.previsualizar_liquidacion_disciplina(13, '2026-07-01')),
          '3000.00/1000.00/2000.00/73.20/1000.00/2926.80/3', 'rugby: 3.000 − 1.000 − 73,20 + 2.000 − 1.000 (Gabi) = 2.926,80');
SELECT is((SELECT deuda_disciplina FROM socios.previsualizar_liquidacion_disciplina(7, '2026-07-01')),
          5200.00::numeric, 'y hockey le debe al club 5.200 (Bea + tienda)');

CREATE TEMP TABLE liqs AS SELECT unnest(socios.liquidar_disciplinas_mes('2026-07-01', '2026-08-15')) AS id;
CREATE TEMP TABLE liq_h AS SELECT id FROM socios.liquidaciones_disciplina WHERE id IN (SELECT id FROM liqs) AND disciplina_id = 7;
CREATE TEMP TABLE liq_r AS SELECT id FROM socios.liquidaciones_disciplina WHERE id IN (SELECT id FROM liqs) AND disciplina_id = 13;
CREATE TEMP TABLE asi_liq_r AS SELECT asiento_id AS id FROM socios.liquidaciones_disciplina WHERE id = (SELECT id FROM liq_r);
SELECT is((SELECT count(*) FROM liqs), 2::bigint, 'se liquidan hockey y rugby en un paso');
SELECT is(pg_temp.linea((SELECT asiento_id FROM socios.liquidaciones_disciplina WHERE id = (SELECT id FROM liq_h)),
                        '5.2.09', 'debe', 'HOCKEY-FEMENINO'), 5669.50::numeric,
          'hockey: Debe transferencias a disciplinas = cuotas cobradas − gastos');
SELECT is(pg_temp.linea((SELECT id FROM asi_liq_r), '5.2.09', 'debe', 'RUGBY'), 3926.80::numeric,
          'rugby: Debe transferencias a disciplinas 4.000 − 73,20');
SELECT is(pg_temp.linea((SELECT id FROM asi_liq_r), '1.1.03.01', 'haber'), 1000.00::numeric,
          'Haber cuotas sociales a cobrar: la social de Gabi la pone rugby');
SELECT is(pg_temp.linea((SELECT id FROM asi_liq_r), '2.1.07.02', 'haber'), 2926.80::numeric,
          'Haber liquidaciones a pagar: el club le debe a rugby 2.926,80');
SELECT is((SELECT saldo FROM socios.cuotas_saldo WHERE persona_id = pg_temp.p('90000007') AND tipo = 'social'), 0.00::numeric,
          'la social de Gabi queda cobrada a cargo de rugby');
SELECT is((SELECT saldo FROM socios.cuotas_saldo WHERE persona_id = pg_temp.p('90000007') AND tipo = 'disciplina'), 2000.00::numeric,
          'y Gabi le debe la parte de rugby (la cobra la disciplina)');
SELECT is((SELECT (e ->> 'visa_rechazado')::numeric || '/' || (e ->> 'social_a_cargo')::numeric
           FROM socios.liquidaciones_disciplina l, jsonb_array_elements(l.detalle) e
           WHERE l.id = (SELECT id FROM liq_r) AND (e ->> 'persona_id')::integer = pg_temp.p('90000007')),
          '3000.00/1000.00', 'el detalle de rugby muestra el rebote de Gabi y su social');
SELECT is((SELECT e ->> 'social_cubre' FROM socios.liquidaciones_disciplina l, jsonb_array_elements(l.detalle) e
           WHERE l.id = (SELECT id FROM liq_r) AND (e ->> 'persona_id')::integer = pg_temp.p('90000004')),
          'Hockey Femenino', 'en rugby, la cuota social de Dani figura cubierta por hockey: se cobra una sola vez');
SELECT is((socios.cuota_social_de(pg_temp.p('90000004'), '2026-07-15') ->> 'disciplina'), 'Hockey Femenino',
          'y la ficha lo identifica: la cubre hockey, su inscripción más antigua');
SELECT is((SELECT debe_al_club || ' / ' || club_le_debe || ' / ' || saldo FROM socios.saldos_disciplinas() WHERE disciplina_id = 7),
          '5200.00 / 5669.50 / -469.50', 'hockey: debe 5.200, el club le debe 5.669,50, neto le debe 469,50');
SELECT is(pg_temp.saldo('1.1.01.05'), 5365.80 + 4500 + 6900, 'liquidar no mueve el banco');

-- ============================================================
-- 4. Pagos de las liquidaciones
-- ============================================================
CREATE TEMP TABLE pago_h AS SELECT socios.pagar_liquidacion_disciplina((SELECT id FROM liq_h), '2026-08-16', 469.50, NULL, 5200) AS id;
CREATE TEMP TABLE asi_pago_h AS SELECT asiento_id AS id FROM socios.pagos_liquidacion WHERE id = (SELECT id FROM pago_h);
SELECT is(pg_temp.linea((SELECT id FROM asi_pago_h), '2.1.07.02', 'debe'), 5669.50::numeric, 'pago hockey: Debe liquidaciones a pagar');
SELECT is(pg_temp.linea((SELECT id FROM asi_pago_h), '1.1.01.05', 'haber'), 469.50::numeric, 'Haber banco: se transfieren 469,50');
SELECT is(pg_temp.linea((SELECT id FROM asi_pago_h), '1.1.04.03', 'haber'), 5200.00::numeric, 'Haber fondos en poder de hockey: se compensan 5.200');
DO $$ BEGIN PERFORM socios.pagar_liquidacion_disciplina((SELECT id FROM liq_r), '2026-08-16', 2926.80); END $$;

-- ============================================================
-- 5. Cómo queda todo
-- ============================================================
SELECT is((SELECT sum(abs(debe_al_club) + abs(club_le_debe) + abs(saldo))
           FROM socios.saldos_disciplinas() WHERE disciplina_id IN (7, 13)),
          0.00::numeric, 'hockey y rugby quedan saldados con el club');
SELECT is(pg_temp.saldo('2.1.07.02'), 0.00::numeric, 'no quedan liquidaciones por pagar');
SELECT is(pg_temp.saldo('1.1.01.05'), 5365.80 + 4500 + 6900 - 469.50 - 2926.80, 'banco: 13.369,50');
SELECT is(-pg_temp.saldo('4.2.01', 'HOCKEY-FEMENINO') - pg_temp.saldo('5.2.08', 'HOCKEY-FEMENINO')
          - pg_temp.saldo('5.2.09', 'HOCKEY-FEMENINO'), 0.00::numeric,
          'resultado del centro hockey = 0: lo que pagan sus socios vuelve a hockey, menos sus gastos');
SELECT is(-pg_temp.saldo('4.2.01', 'RUGBY') - pg_temp.saldo('5.2.08', 'RUGBY') - pg_temp.saldo('5.2.09', 'RUGBY'),
          2000.00::numeric, 'centro rugby: queda la parte de rugby que Gabi todavía debe');
SELECT is(-pg_temp.saldo('4.1.01') - pg_temp.saldo('5.2.08', 'ADM'), 11369.50::numeric,
          'el club se queda con toda la cuota social (11.400) menos su parte de los gastos (30,50)');
SELECT is((SELECT string_agg(tipo || ':' || debe || '/' || haber, ' ' ORDER BY fecha, numero)
           FROM socios.cuenta_corriente_disciplina(7)),
          'cuota_cobrada:2200.00/0.00 compra_tienda:3000.00/0.00 liquidacion:0.00/5669.50 pago_liquidacion:5669.50/0.00 compensacion:0.00/5200.00',
          'cuenta corriente de hockey: cuota que cobró, compra, liquidación, pago y compensación');
SELECT is((SELECT sum(abs(diferencia)) FROM socios.control_contable()), 0.00::numeric, 'socios cuadra con la contabilidad');

SELECT * FROM finish();
ROLLBACK;
