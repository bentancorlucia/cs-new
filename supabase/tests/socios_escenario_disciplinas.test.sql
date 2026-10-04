-- Escenario completo: lo que el club le paga a cada disciplina según sus
-- socios, tipos de cuota y medios de cobro, y todos los asientos.
--
-- Precios (desde 01/2026): cuota social 1.000/mes (anual 10.800); Hockey
-- Primera 1.500; Hockey Juveniles 1.200; Rugby Plantel 2.000.
-- Comisión del débito que se le carga a cada disciplina: hockey 50 %,
-- rugby 100 %; el resto de la comisión es del club.
--
-- Socios (alta 01/07/2026):
--   Ana   social + Hockey Primera            débito Visa          2.500
--   Bea   social + Hockey Juveniles          paga en la cuenta de hockey 2.200
--   Caro  social + Rugby                     débito Visa          3.000
--   Dani  social + Hockey Primera + Rugby    transferencia club   4.500
--   Eli   social                             efectivo             1.000
--   Fede  social ANUAL + Hockey Primera      transferencia club   5.400 + 1.500
--         (anual desde julio: 10.800 × 6/12 = 5.400)
-- Lote de julio: social 10.400; hockey 5.700 (1.500+1.200+1.500+1.500);
-- rugby 4.000 (2.000+2.000).
-- Débito Visa de julio (acreditado 10/08): 5.500 bruto, comisión 110:
--   hockey 110 × 1.500/5.500 × 50 % = 15; rugby 110 × 2.000/5.500 = 40;
--   club 55. Neto al banco 5.390.
-- Hockey compró en la tienda a cuenta 3.000 → con lo que cobró de Bea,
-- le debe al club 5.200.
-- Liquidación jul–ago: hockey 5.700 − 15 = 5.685; rugby 4.000 − 40 = 3.960.
-- Pago: hockey compensa 5.200 y se le transfieren 485; a rugby 3.960.
-- Resultado: lo que pagan los socios por cada disciplina vuelve entero a
-- la disciplina, menos su parte de la comisión (resultado del centro = 0).
BEGIN;
SELECT plan(35);

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
END $$;

-- ============================================================
-- 1. Lote de julio
-- ============================================================
CREATE TEMP TABLE lote AS SELECT socios.emitir_lote('2026-07-01') AS id;
CREATE TEMP TABLE asi_lote AS SELECT asiento_id AS id FROM socios.lotes WHERE id = (SELECT id FROM lote);

SELECT is((SELECT cantidad FROM socios.lotes WHERE id = (SELECT id FROM lote)), 12, 'lote: 12 cuotas (6 sociales, 6 de disciplina)');
SELECT is((SELECT importe FROM socios.cuotas WHERE persona_id = pg_temp.p('90000006') AND tipo = 'social'), 5400.00::numeric,
          'la social anual desde julio es 6/12 del precio anual');
SELECT is(pg_temp.linea((SELECT id FROM asi_lote), '1.1.03.01', 'debe'), 10400.00::numeric, 'Debe cuotas sociales a cobrar 10.400');
SELECT is(pg_temp.linea((SELECT id FROM asi_lote), '1.1.03.02', 'debe'), 9700.00::numeric, 'Debe cuotas de disciplina a cobrar 9.700');
SELECT is(pg_temp.linea((SELECT id FROM asi_lote), '4.1.01', 'haber'), 10400.00::numeric, 'Haber ingreso por cuota social 10.400');
SELECT is(pg_temp.linea((SELECT id FROM asi_lote), '4.2.01', 'haber', 'HOCKEY-FEMENINO'), 5700.00::numeric,
          'Haber cuotas de disciplina, centro hockey 5.700');
SELECT is(pg_temp.linea((SELECT id FROM asi_lote), '4.2.01', 'haber', 'RUGBY'), 4000.00::numeric,
          'Haber cuotas de disciplina, centro rugby 4.000');

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
SELECT is(pg_temp.linea((SELECT asiento_id FROM socios.cobros WHERE id = (SELECT id FROM cobro_bea)), '1.1.04.03', 'debe'),
          2200.00::numeric, 'Bea pagó en la cuenta de hockey: Debe fondos en poder de la disciplina 2.200');
SELECT is(pg_temp.saldo('1.1.04.03', p_disciplina => 7), 2200.00::numeric, 'hockey le debe al club lo que cobró de Bea');
SELECT is(pg_temp.saldo('1.1.01.01'), 1000.00::numeric, 'el efectivo de Eli entra a la caja');

-- ---------- Débito Visa de julio
CREATE TEMP TABLE visa AS SELECT socios.aplicar_liquidacion_visa('2026-07-01', '2026-08-10', 110,
  jsonb_build_array(jsonb_build_object('persona_id', pg_temp.p('90000001'), 'importe', 2500),
                    jsonb_build_object('persona_id', pg_temp.p('90000003'), 'importe', 3000))) AS id;
CREATE TEMP TABLE asi_visa AS SELECT asiento_id AS id FROM socios.liquidaciones_visa WHERE id = (SELECT id FROM visa);
SELECT is(pg_temp.linea((SELECT id FROM asi_visa), '1.1.01.05', 'debe'), 5390.00::numeric, 'Visa: al banco entra el neto 5.390');
SELECT is(pg_temp.linea((SELECT id FROM asi_visa), '5.2.08', 'debe', 'HOCKEY-FEMENINO'), 15.00::numeric,
          'comisión de hockey: 110 × 1.500/5.500 × 50 % = 15');
SELECT is(pg_temp.linea((SELECT id FROM asi_visa), '5.2.08', 'debe', 'RUGBY'), 40.00::numeric,
          'comisión de rugby: 110 × 2.000/5.500 × 100 % = 40');
SELECT is(pg_temp.linea((SELECT id FROM asi_visa), '5.2.08', 'debe', 'ADM'), 55.00::numeric, 'el resto de la comisión es del club: 55');
SELECT is(pg_temp.linea((SELECT id FROM asi_visa), '1.1.03.02', 'haber'), 3500.00::numeric,
          'cancela las cuotas de disciplina de Ana y Caro (1.500 + 2.000)');

SELECT is(pg_temp.saldo('1.1.03.01') + pg_temp.saldo('1.1.03.02'), 0.00::numeric, 'todas las cuotas de julio quedaron cobradas');

-- ---------- Hockey compra en la tienda a cuenta
INSERT INTO public.pedidos (id, tipo, estado, subtotal, total, disciplina_id) VALUES (9801, 'disciplina', 'retirado', 3000, 3000, 7);
DO $$ BEGIN PERFORM contabilidad._asiento_automatico('2026-08-20', 'Pedido de hockey', 'pedido_venta', '9801',
  jsonb_build_array(jsonb_build_object('cuenta_id', pg_temp.cta('1.1.04.03'), 'lado', 'debe', 'importe', 3000, 'disciplina_id', 7),
                    jsonb_build_object('cuenta_id', pg_temp.cta('4.4.03'), 'lado', 'haber', 'importe', 3000))); END $$;

-- ============================================================
-- 3. Liquidación jul–ago
-- ============================================================
SELECT is((SELECT cobrado || ' − ' || comision || ' = ' || importe
           FROM socios.previsualizar_liquidacion_disciplina(7, '2026-07-01', '2026-08-31')),
          '5700.00 − 15.00 = 5685.00', 'hockey: cobrado de sus cuotas menos su comisión');
SELECT is((SELECT deuda_disciplina FROM socios.previsualizar_liquidacion_disciplina(7, '2026-07-01', '2026-08-31')),
          5200.00::numeric, 'y hockey le debe al club 5.200 (Bea + tienda)');
SELECT is((SELECT cobrado || ' − ' || comision || ' = ' || importe
           FROM socios.previsualizar_liquidacion_disciplina(13, '2026-07-01', '2026-08-31')),
          '4000.00 − 40.00 = 3960.00', 'rugby: cobrado de sus cuotas menos su comisión');

CREATE TEMP TABLE liq_h AS SELECT socios.liquidar_disciplina(7, '2026-07-01', '2026-08-31', '2026-09-05') AS id;
CREATE TEMP TABLE liq_r AS SELECT socios.liquidar_disciplina(13, '2026-07-01', '2026-08-31', '2026-09-05') AS id;
CREATE TEMP TABLE asi_liq_h AS SELECT asiento_id AS id FROM socios.liquidaciones_disciplina WHERE id = (SELECT id FROM liq_h);
SELECT is(pg_temp.linea((SELECT id FROM asi_liq_h), '5.2.09', 'debe', 'HOCKEY-FEMENINO'), 5685.00::numeric,
          'liquidación hockey: Debe transferencias a disciplinas, centro hockey');
SELECT is(pg_temp.linea((SELECT id FROM asi_liq_h), '2.1.07.02', 'haber'), 5685.00::numeric,
          'Haber liquidaciones a pagar: el club le debe a hockey');
SELECT is(pg_temp.saldo('1.1.01.05'), 5390.00 + 4500 + 6900, 'liquidar no mueve el banco');
SELECT is((SELECT debe_al_club || ' / ' || club_le_debe || ' / ' || saldo FROM socios.saldos_disciplinas() WHERE disciplina_id = 7),
          '5200.00 / 5685.00 / -485.00', 'hockey: debe 5.200, el club le debe 5.685, neto el club le debe 485');

-- ============================================================
-- 4. Pagos de las liquidaciones
-- ============================================================
CREATE TEMP TABLE pago_h AS SELECT socios.pagar_liquidacion_disciplina((SELECT id FROM liq_h), '2026-09-06', 485, NULL, 5200) AS id;
CREATE TEMP TABLE asi_pago_h AS SELECT asiento_id AS id FROM socios.pagos_liquidacion WHERE id = (SELECT id FROM pago_h);
SELECT is(pg_temp.linea((SELECT id FROM asi_pago_h), '2.1.07.02', 'debe'), 5685.00::numeric, 'pago hockey: Debe liquidaciones a pagar 5.685');
SELECT is(pg_temp.linea((SELECT id FROM asi_pago_h), '1.1.01.05', 'haber'), 485.00::numeric, 'Haber banco: se transfieren 485');
SELECT is(pg_temp.linea((SELECT id FROM asi_pago_h), '1.1.04.03', 'haber'), 5200.00::numeric, 'Haber fondos en poder de hockey: se compensan 5.200');
DO $$ BEGIN PERFORM socios.pagar_liquidacion_disciplina((SELECT id FROM liq_r), '2026-09-06', 3960); END $$;

-- ============================================================
-- 5. Cómo queda todo
-- ============================================================
SELECT is((SELECT sum(abs(debe_al_club) + abs(club_le_debe) + abs(saldo))
           FROM socios.saldos_disciplinas() WHERE disciplina_id IN (7, 13)),
          0.00::numeric, 'hockey y rugby quedan saldados con el club');
SELECT is((SELECT saldo FROM socios.liquidaciones_disciplina_saldo WHERE id = (SELECT id FROM liq_h)), 0.00::numeric,
          'la liquidación de hockey queda pagada');
SELECT is(pg_temp.saldo('2.1.07.02'), 0.00::numeric, 'no quedan liquidaciones por pagar');
SELECT is(pg_temp.saldo('1.1.01.05'), 5390.00 + 4500 + 6900 - 485 - 3960, 'banco: 12.345');
SELECT is(-pg_temp.saldo('4.2.01', 'HOCKEY-FEMENINO') - pg_temp.saldo('5.2.08', 'HOCKEY-FEMENINO')
          - pg_temp.saldo('5.2.09', 'HOCKEY-FEMENINO'), 0.00::numeric,
          'resultado del centro hockey = 0: lo que pagan sus socios vuelve a hockey, menos su comisión');
SELECT is(-pg_temp.saldo('4.2.01', 'RUGBY') - pg_temp.saldo('5.2.08', 'RUGBY') - pg_temp.saldo('5.2.09', 'RUGBY'),
          0.00::numeric, 'resultado del centro rugby = 0');
SELECT is(-pg_temp.saldo('4.1.01') - pg_temp.saldo('5.2.08', 'ADM'), 10345.00::numeric,
          'el club se queda con la cuota social (10.400) menos su parte de la comisión (55)');
SELECT is((SELECT string_agg(tipo || ':' || debe || '/' || haber, ' ' ORDER BY fecha, numero)
           FROM socios.cuenta_corriente_disciplina(7)),
          'cuota_cobrada:2200.00/0.00 compra_tienda:3000.00/0.00 liquidacion:0.00/5685.00 pago_liquidacion:5685.00/0.00 compensacion:0.00/5200.00',
          'cuenta corriente de hockey: cuota que cobró, compra, liquidación, pago y compensación');
SELECT is((SELECT sum(abs(diferencia)) FROM socios.control_contable()), 0.00::numeric, 'socios cuadra con la contabilidad');

SELECT * FROM finish();
ROLLBACK;
