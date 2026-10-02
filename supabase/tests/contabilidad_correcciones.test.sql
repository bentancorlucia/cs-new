-- Correcciones de la auditoría contra ContaSystem (migración 20261003100000).
BEGIN;
SELECT plan(16);

CREATE TEMP TABLE c AS SELECT codigo, id FROM contabilidad.cuentas;
CREATE FUNCTION pg_temp.cta(p text) RETURNS uuid LANGUAGE sql AS $$ SELECT id FROM c WHERE codigo = p $$;
CREATE FUNCTION pg_temp.l(p_cuenta text, p_lado text, p_importe numeric, p_extra jsonb DEFAULT '{}')
RETURNS jsonb LANGUAGE sql AS $$
  SELECT jsonb_build_object('cuenta_id', pg_temp.cta(p_cuenta), 'lado', p_lado, 'importe', p_importe) || p_extra
$$;
INSERT INTO public.proveedores (id, nombre) VALUES (990002, 'Proveedor USD');

DO $$ BEGIN
  PERFORM contabilidad.crear_ejercicio(2025);
  PERFORM contabilidad.registrar_cotizacion('USD', '2025-03-01', 40, 'manual');
  PERFORM contabilidad.registrar_cotizacion('USD', '2025-05-01', 45, 'manual');
END $$;

-- C1: anticipos USD no revalúan
SELECT is((SELECT revalua FROM contabilidad.cuentas WHERE codigo = '1.1.04.05'), false,
          'C1: anticipos a proveedores USD no revalúan');

-- C3/S7: diferencia de cambio separada y cuentas de sistema validadas
SELECT is((SELECT c2.codigo FROM contabilidad.cuentas_sistema s JOIN contabilidad.cuentas c2 ON c2.id = s.cuenta_id
           WHERE rol = 'diferencia_cambio_ganada_realizada'), '4.6.02.01', 'C3: cuenta de diferencia realizada');
SELECT throws_like($$ UPDATE contabilidad.cuentas_sistema SET cuenta_id = pg_temp.cta('1.1.01.05')
                      WHERE rol = 'resultado_ejercicio' $$,
                   '%imputable de patrimonio%', 'S7: el resultado del ejercicio no puede ir al banco');

-- C4: el primer ejercicio no cierra sin apertura (ni antes de que se pueda)
SELECT throws_like($$ SELECT contabilidad.cerrar_ejercicio((SELECT id FROM contabilidad.ejercicios WHERE nombre = 'Ejercicio 2025')) $$,
                   '%no tiene asiento de apertura%', 'C4: el primer ejercicio exige apertura');

-- Apertura con anticipo USD (no revalúa) y banco USD (revalúa)
CREATE TEMP TABLE ap AS
SELECT contabilidad.guardar_asiento(NULL, '2025-01-01', 'Saldos iniciales', jsonb_build_array(
  pg_temp.l('1.1.01.06', 'debe', 1000, '{"tc": 40}'),
  pg_temp.l('3.1.01', 'haber', 40000)), true, 'apertura') AS id;

-- C5: la apertura manual se revierte y se vuelve a cargar
SELECT lives_ok($$ SELECT contabilidad.revertir_asiento((SELECT id FROM ap), 'Saldo mal cargado', '2025-01-01') $$,
                'C5: la apertura manual se puede revertir');
SELECT lives_ok($$ SELECT contabilidad.guardar_asiento(NULL, '2025-01-01', 'Saldos iniciales corregidos', jsonb_build_array(
  pg_temp.l('1.1.01.06', 'debe', 1000, '{"tc": 40}'),
  pg_temp.l('3.1.01', 'haber', 40000)), true, 'apertura') $$, 'C5: y se carga una nueva');

-- S2: anticipo USD (no revalúa): +100 a 40 y −90 a 45 → origen +10, pesos −50
DO $$ BEGIN
  PERFORM contabilidad.guardar_asiento(NULL, '2025-03-02', 'Anticipo', jsonb_build_array(
    pg_temp.l('1.1.04.05', 'debe', 100, '{"proveedor_id": 990002, "tc": 40}'),
    pg_temp.l('1.1.01.06', 'haber', 100, '{"tc": 40}')), true);
  PERFORM contabilidad.guardar_asiento(NULL, '2025-05-02', 'Aplicación de anticipo', jsonb_build_array(
    pg_temp.l('5.4.01', 'debe', 4050),
    pg_temp.l('1.1.04.05', 'haber', 90, '{"proveedor_id": 990002, "tc": 45}')), true);
END $$;

-- S4: re-contabilizar un documento revertido
CREATE TEMP TABLE v1 AS
SELECT contabilidad._asiento_automatico('2025-06-01', 'Venta V-1', 'venta', 'V-1', jsonb_build_array(
  pg_temp.l('1.1.01.01', 'debe', 500), pg_temp.l('4.4.02', 'haber', 500))) AS id;
DO $$ BEGIN PERFORM contabilidad.revertir_asiento((SELECT id FROM v1), 'Venta anulada', '2025-06-01'); END $$;
SELECT lives_ok($$ SELECT contabilidad._asiento_automatico('2025-06-02', 'Venta V-1 corregida', 'venta', 'V-1', jsonb_build_array(
  pg_temp.l('1.1.01.01', 'debe', 450), pg_temp.l('4.4.02', 'haber', 450))) $$,
  'S4: un documento revertido se vuelve a contabilizar');
SELECT throws_ok($$ SELECT contabilidad._asiento_automatico('2025-06-03', 'Duplicado', 'venta', 'V-1', jsonb_build_array(
  pg_temp.l('1.1.01.01', 'debe', 1), pg_temp.l('4.4.02', 'haber', 1))) $$,
  '23505', NULL, 'S4: pero no dos veces vivo');

-- S5: revaluación con cotización vieja
SELECT throws_like($$ SELECT contabilidad.revaluar_moneda_extranjera('2025-11-30') $$,
                   '%Falta la cotización%', 'S5: no revalúa con una cotización de meses atrás');

-- S1: pasar a exigir centro de costo con movimientos sin centro
SELECT throws_like($$ UPDATE contabilidad.cuentas SET requiere_centro_costo = true WHERE codigo = '5.4.01' $$,
                   '%sin centro de costo%', 'S1: no se exige centro si ya hay movimientos sin centro');

-- C14: cuenta de un proceso automático
INSERT INTO contabilidad.parametros_cuentas (proceso, rol, cuenta_id) VALUES ('tienda.venta', 'ingreso', pg_temp.cta('4.4.02'));
SELECT is(contabilidad.cuenta_para('tienda.venta', 'ingreso', 'USD'), pg_temp.cta('4.4.02'),
          'C14: cae a la cuenta genérica si no hay una para la moneda');

-- Cierre
DO $$ BEGIN PERFORM contabilidad.registrar_cotizacion('USD', '2025-12-30', 42, 'manual'); END $$;
SELECT lives_ok($$ SELECT contabilidad.cerrar_ejercicio((SELECT id FROM contabilidad.ejercicios WHERE nombre = 'Ejercicio 2025')) $$,
                'cierra 2025');

SELECT is((SELECT sum(CASE WHEN debe > 0 THEN importe_origen ELSE -importe_origen END)
           FROM contabilidad.lineas l JOIN contabilidad.asientos a ON a.id = l.asiento_id
           WHERE a.tipo = 'apertura' AND a.fecha = '2026-01-01' AND l.cuenta_id = pg_temp.cta('1.1.04.05')),
          10.00::numeric, 'S2: la apertura conserva el signo de los dólares');
SELECT is((SELECT sum(debe - haber)
           FROM contabilidad.lineas l JOIN contabilidad.asientos a ON a.id = l.asiento_id
           WHERE a.tipo = 'apertura' AND a.fecha = '2026-01-01' AND l.cuenta_id = pg_temp.cta('1.1.04.05')),
          -50.00::numeric, 'S2: y el valor en pesos');

-- S3: no se reabre si el siguiente tiene meses cerrados
DO $$ BEGIN PERFORM contabilidad.cerrar_periodo((SELECT id FROM contabilidad.periodos WHERE anio = 2026 AND mes = 1)); END $$;
SELECT throws_like($$ SELECT contabilidad.reabrir_ejercicio((SELECT id FROM contabilidad.ejercicios WHERE nombre = 'Ejercicio 2025')) $$,
                   '%meses cerrados%', 'S3: no reabre si el siguiente tiene meses cerrados');

-- C6/C21: la reapertura no reutiliza números y elimina el ejercicio siguiente vacío
DO $$ BEGIN PERFORM contabilidad.reabrir_periodo((SELECT id FROM contabilidad.periodos WHERE anio = 2026 AND mes = 1)); END $$;
CREATE TEMP TABLE antes AS SELECT ultimo FROM contabilidad.numeradores
  WHERE ejercicio_id = (SELECT id FROM contabilidad.ejercicios WHERE nombre = 'Ejercicio 2025');
DO $$ BEGIN PERFORM contabilidad.reabrir_ejercicio((SELECT id FROM contabilidad.ejercicios WHERE nombre = 'Ejercicio 2025')); END $$;
SELECT is((SELECT ultimo FROM contabilidad.numeradores
           WHERE ejercicio_id = (SELECT id FROM contabilidad.ejercicios WHERE nombre = 'Ejercicio 2025')),
          (SELECT ultimo FROM antes), 'C6: los números de los asientos deshechos no se reutilizan');

SELECT * FROM finish();
ROLLBACK;
