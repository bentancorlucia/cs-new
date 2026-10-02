-- Reglas de integridad del núcleo contable.
-- Correr con: supabase test db
BEGIN;
SELECT plan(46);

-- ------------------------------------------------------------
-- Datos de apoyo
-- ------------------------------------------------------------
CREATE TEMP TABLE c AS
SELECT codigo, id FROM contabilidad.cuentas;

CREATE FUNCTION pg_temp.cta(p text) RETURNS uuid LANGUAGE sql AS $$ SELECT id FROM c WHERE codigo = p $$;
CREATE FUNCTION pg_temp.l(p_cuenta text, p_lado text, p_importe numeric, p_extra jsonb DEFAULT '{}')
RETURNS jsonb LANGUAGE sql AS $$
  SELECT jsonb_build_object('cuenta_id', pg_temp.cta(p_cuenta), 'lado', p_lado, 'importe', p_importe) || p_extra
$$;

INSERT INTO public.proveedores (id, nombre) VALUES (990001, 'Proveedor de prueba');

-- ------------------------------------------------------------
-- Plan de cuentas
-- ------------------------------------------------------------
SELECT cmp_ok((SELECT count(*) FROM contabilidad.cuentas), '>', 100::bigint, 'plan de cuentas base cargado');
SELECT is((SELECT count(*) FROM contabilidad.cuentas_sistema), 6::bigint, 'cuentas de sistema configuradas');
SELECT is((SELECT clase::text FROM contabilidad.cuentas WHERE codigo = '1.2.01.02'), 'activo',
          'la clase se hereda del padre');
SELECT is((SELECT naturaleza::text FROM contabilidad.cuentas WHERE codigo = '1.2.01.02'), 'acreedora',
          'amortización acumulada es regularizadora (acreedora)');
SELECT throws_like(
  $$ INSERT INTO contabilidad.cuentas (codigo, nombre, padre_id, nivel, clase, naturaleza)
     VALUES ('1.1.01.01.1', 'Hija de imputable', pg_temp.cta('1.1.01.01'), 0, 'activo', 'deudora') $$,
  '%es imputable%', 'no se cuelgan cuentas de una imputable');
SELECT throws_like(
  $$ INSERT INTO contabilidad.cuentas (codigo, nombre, padre_id, nivel, clase, naturaleza)
     VALUES ('1.1.02.09', 'Mal ubicada', pg_temp.cta('1.1.01'), 0, 'activo', 'deudora') $$,
  '%subcuenta directa%', 'el código tiene que colgar del padre');
SELECT throws_ok(
  $$ UPDATE contabilidad.cuentas SET moneda = 'USD' WHERE codigo = '4.1.01' $$,
  '23514', NULL, 'una cuenta de ingresos no puede ser en dólares');

-- ------------------------------------------------------------
-- Ejercicios y cotizaciones
-- ------------------------------------------------------------
SELECT lives_ok($$ SELECT contabilidad.crear_ejercicio(2026) $$, 'crea el ejercicio 2026');
SELECT is((SELECT count(*) FROM contabilidad.periodos), 12::bigint, 'con 12 períodos');
SELECT throws_like($$ SELECT contabilidad.crear_ejercicio(2028) $$, '%tiene que empezar%',
                   'los ejercicios son consecutivos');

SELECT lives_ok($$ SELECT contabilidad.registrar_cotizacion('USD', '2026-01-14', 40, 'manual') $$,
                'carga cotización manual');
SELECT throws_like($$ SELECT contabilidad.registrar_cotizacion('UYU', '2026-01-14', 1, 'manual') $$,
                   '%moneda funcional%', 'la moneda funcional no lleva cotización');

-- ------------------------------------------------------------
-- Asientos
-- ------------------------------------------------------------
-- Apertura del primer ejercicio: Banco 100.000 / Fondo social
SELECT lives_ok($$
  SELECT contabilidad.guardar_asiento(NULL, '2026-01-01', 'Saldos iniciales', jsonb_build_array(
    pg_temp.l('1.1.01.05', 'debe', 100000), pg_temp.l('3.1.01', 'haber', 100000)), true, 'apertura')
$$, 'el tesorero carga la apertura del primer ejercicio');

CREATE TEMP TABLE a1 AS
SELECT contabilidad.guardar_asiento(NULL, '2026-01-15', 'Cobro cuotas sociales', jsonb_build_array(
  pg_temp.l('1.1.01.05', 'debe', 5000), pg_temp.l('4.1.01', 'haber', 5000)), true) AS id;

SELECT is((SELECT numero FROM contabilidad.asientos WHERE id = (SELECT id FROM a1)), 2,
          'numeración correlativa al confirmar (apertura = 1)');

SELECT throws_like($$
  SELECT contabilidad.guardar_asiento(NULL, '2026-01-15', 'Descuadrado', jsonb_build_array(
    pg_temp.l('1.1.01.05', 'debe', 5000), pg_temp.l('4.1.01', 'haber', 4999)), true)
$$, '%no cuadra%', 'no confirma un asiento descuadrado');

SELECT throws_like($$
  SELECT contabilidad.guardar_asiento(NULL, '2026-01-15', 'Una línea', jsonb_build_array(
    pg_temp.l('1.1.01.05', 'debe', 5000)), true)
$$, '%al menos dos líneas%', 'mínimo dos líneas');

SELECT throws_like($$
  SELECT contabilidad.guardar_asiento(NULL, '2026-01-15', 'Agrupadora', jsonb_build_array(
    pg_temp.l('1.1.01', 'debe', 10), pg_temp.l('4.1.01', 'haber', 10)))
$$, '%agrupadora%', 'no imputa en cuentas agrupadoras');

SELECT throws_like($$
  SELECT contabilidad.guardar_asiento(NULL, '2026-01-15', 'Sin proveedor', jsonb_build_array(
    pg_temp.l('5.5.06', 'debe', 10), pg_temp.l('2.1.01.01', 'haber', 10)))
$$, '%exige indicar el proveedor%', 'Proveedores exige auxiliar');

SELECT throws_like($$
  SELECT contabilidad.guardar_asiento(NULL, '2026-01-15', 'Sin centro', jsonb_build_array(
    pg_temp.l('1.1.01.05', 'debe', 10), pg_temp.l('4.2.01', 'haber', 10)))
$$, '%centro de costo%', 'cuotas de disciplina exigen centro de costo');

SELECT throws_like($$
  SELECT contabilidad.guardar_asiento(NULL, '2027-03-01', 'Sin ejercicio', jsonb_build_array(
    pg_temp.l('1.1.01.05', 'debe', 10), pg_temp.l('4.1.01', 'haber', 10)))
$$, '%No hay ejercicio%', 'no hay asientos fuera de un ejercicio');

-- Dólares: 100 USD a la cotización vigente (día anterior) = 4.000
CREATE TEMP TABLE a2 AS
SELECT contabilidad.guardar_asiento(NULL, '2026-01-20', 'Compra de dólares', jsonb_build_array(
  pg_temp.l('1.1.01.06', 'debe', 100), pg_temp.l('1.1.01.05', 'haber', 4000)), true) AS id;

SELECT results_eq(
  $$ SELECT debe, moneda::text, importe_origen, tc FROM contabilidad.lineas
     WHERE asiento_id = (SELECT id FROM a2) AND orden = 1 $$,
  $$ VALUES (4000.00::numeric, 'USD', 100.00::numeric, 40::numeric) $$,
  'la línea en USD guarda origen y TC y valúa en pesos');

CREATE TEMP TABLE b0 AS
SELECT contabilidad.guardar_asiento(NULL, '2026-01-20', 'Borrador en dólares', jsonb_build_array(
  pg_temp.l('1.1.01.06', 'debe', 1), pg_temp.l('1.1.01.05', 'haber', 40))) AS id;
SELECT throws_ok(
  $$ INSERT INTO contabilidad.lineas (asiento_id, orden, cuenta_id, debe, moneda, importe_origen, tc)
     SELECT id, 9, pg_temp.cta('1.1.01.06'), 4001, 'USD', 100, 40 FROM b0 $$,
  '23514', NULL, 'origen × TC tiene que coincidir con el importe en pesos');
DO $$ BEGIN PERFORM contabilidad.eliminar_borrador((SELECT id FROM b0)); END $$;

-- Inmutabilidad
SELECT throws_like($$ UPDATE contabilidad.asientos SET descripcion = 'cambiada' WHERE id = (SELECT id FROM a1) $$,
                   '%confirmado y no se puede modificar%', 'un asiento confirmado no se edita');
SELECT throws_like($$ DELETE FROM contabilidad.asientos WHERE id = (SELECT id FROM a1) $$,
                   '%no se borra, se revierte%', 'un asiento confirmado no se borra');
SELECT throws_like($$ UPDATE contabilidad.lineas SET debe = 1 WHERE asiento_id = (SELECT id FROM a1) AND orden = 1 $$,
                   '%no se modifican%', 'las líneas confirmadas no se tocan');
SELECT throws_like($$ INSERT INTO contabilidad.asientos (fecha, descripcion, estado, numero)
                      VALUES ('2026-01-15', 'directo', 'confirmado', 99) $$,
                   '%se crean como borrador%', 'no se inserta un asiento ya confirmado');
SELECT throws_like($$ INSERT INTO contabilidad.asientos (fecha, descripcion, tipo)
                      VALUES ('2026-01-15', 'cierre trucho', 'cierre') $$,
                   '%solo los genera el sistema%', 'tipos de sistema no se crean a mano');

-- Reversión
CREATE TEMP TABLE r1 AS
SELECT contabilidad.revertir_asiento((SELECT id FROM a1), 'Cuota cobrada dos veces', '2026-01-31') AS id;
SELECT is((SELECT revertido_por_id FROM contabilidad.asientos WHERE id = (SELECT id FROM a1)),
          (SELECT id FROM r1), 'el original queda marcado como revertido');
SELECT is((SELECT sum(debe - haber) FROM contabilidad.lineas
           WHERE asiento_id IN ((SELECT id FROM a1), (SELECT id FROM r1)) AND cuenta_id = pg_temp.cta('4.1.01')),
          0::numeric, 'original + reversión netean a cero');
SELECT throws_like($$ SELECT contabilidad.revertir_asiento((SELECT id FROM a1), 'otra vez') $$,
                   '%ya fue revertido%', 'no se revierte dos veces');

-- Períodos
CREATE TEMP TABLE b1 AS
SELECT contabilidad.guardar_asiento(NULL, '2026-01-25', 'Borrador pendiente', jsonb_build_array(
  pg_temp.l('5.5.06', 'debe', 300), pg_temp.l('1.1.01.01', 'haber', 300))) AS id;
SELECT throws_like($$ SELECT contabilidad.cerrar_periodo((SELECT id FROM contabilidad.periodos WHERE mes = 1)) $$,
                   '%borrador%', 'no cierra un mes con borradores');
SELECT lives_ok($$ SELECT contabilidad.eliminar_borrador((SELECT id FROM b1)) $$, 'se borra el borrador');
SELECT throws_like($$ SELECT contabilidad.cerrar_periodo((SELECT id FROM contabilidad.periodos WHERE mes = 3)) $$,
                   '%en orden%', 'los meses se cierran en orden');
SELECT lives_ok($$ SELECT contabilidad.cerrar_periodo((SELECT id FROM contabilidad.periodos WHERE mes = 1)) $$,
                'cierra enero');
SELECT throws_like($$
  SELECT contabilidad.guardar_asiento(NULL, '2026-01-28', 'En mes cerrado', jsonb_build_array(
    pg_temp.l('1.1.01.05', 'debe', 10), pg_temp.l('4.1.01', 'haber', 10)))
$$, '%está cerrado%', 'no se escribe en un mes cerrado');

SELECT throws_like($$ UPDATE contabilidad.cuentas SET moneda = NULL, revalua = false WHERE codigo = '1.1.01.06' $$,
                   '%tiene movimientos%', 'no cambia la moneda de una cuenta con movimientos');

-- ------------------------------------------------------------
-- Saldos, revaluación y cierre
-- ------------------------------------------------------------
CREATE TEMP TABLE a3 AS SELECT contabilidad.guardar_asiento(NULL, '2026-06-10', 'Gasto con proveedor', jsonb_build_array(
  pg_temp.l('5.4.01', 'debe', 2000),
  pg_temp.l('2.1.01.01', 'haber', 2000, '{"proveedor_id": 990001}')), true);
CREATE TEMP TABLE a4 AS SELECT contabilidad.guardar_asiento(NULL, '2026-06-15', 'Cuota fútbol', jsonb_build_array(
  pg_temp.l('1.1.01.05', 'debe', 3000),
  pg_temp.l('4.2.01', 'haber', 3000, jsonb_build_object('centro_costo_id',
    (SELECT id FROM contabilidad.centros_costo WHERE codigo = 'ADM')))), true);

SELECT is((SELECT debe_anterior - haber_anterior + debe - haber FROM contabilidad.saldos('2026-02-01', '2026-12-31')
           WHERE cuenta_id = pg_temp.cta('1.1.01.05')),
          99000::numeric, 'saldo de Banco = apertura + cobros − compra USD (la cuota revertida no cuenta)');

DO $$ BEGIN PERFORM contabilidad.registrar_cotizacion('USD', '2026-12-30', 42, 'manual'); END $$;

SELECT lives_ok($$ SELECT contabilidad.cerrar_ejercicio((SELECT id FROM contabilidad.ejercicios WHERE nombre = 'Ejercicio 2026')) $$,
                'cierra el ejercicio 2026');

SELECT is((SELECT sum(debe) FROM contabilidad.lineas l JOIN contabilidad.asientos a ON a.id = l.asiento_id
           WHERE a.tipo = 'revaluacion' AND l.cuenta_id = pg_temp.cta('1.1.01.06')),
          200.00::numeric, 'revalúa 100 USD de 40 a 42: +200');

SELECT is((SELECT sum(haber - debe) FROM contabilidad.lineas l JOIN contabilidad.asientos a ON a.id = l.asiento_id
           WHERE a.ejercicio_id = (SELECT id FROM contabilidad.ejercicios WHERE nombre = 'Ejercicio 2026')
             AND l.cuenta_id = pg_temp.cta('3.4.01')),
          1200.00::numeric, 'superávit 2026 = 3.000 cuota + 200 dif. cambio − 2.000 mantenimiento');

SELECT is((SELECT count(*) FROM contabilidad.lineas l JOIN contabilidad.cuentas cu ON cu.id = l.cuenta_id
           JOIN contabilidad.asientos a ON a.id = l.asiento_id
           WHERE a.tipo = 'apertura' AND a.ejercicio_id = (SELECT id FROM contabilidad.ejercicios WHERE nombre = 'Ejercicio 2027')
             AND cu.clase IN ('ingreso', 'egreso')), 0::bigint,
          'la apertura 2027 no arrastra cuentas de resultado');

SELECT is((SELECT importe_origen FROM contabilidad.lineas l JOIN contabilidad.asientos a ON a.id = l.asiento_id
           WHERE a.tipo = 'apertura' AND a.ejercicio_id = (SELECT id FROM contabilidad.ejercicios WHERE nombre = 'Ejercicio 2027')
             AND l.cuenta_id = pg_temp.cta('1.1.01.06')),
          100.00::numeric, 'la apertura conserva los dólares');

SELECT is((SELECT proveedor_id FROM contabilidad.lineas l JOIN contabilidad.asientos a ON a.id = l.asiento_id
           WHERE a.tipo = 'apertura' AND a.ejercicio_id = (SELECT id FROM contabilidad.ejercicios WHERE nombre = 'Ejercicio 2027')
             AND l.cuenta_id = pg_temp.cta('2.1.01.01')),
          990001, 'la apertura conserva el saldo por proveedor');

SELECT lives_ok($$ SELECT contabilidad.reabrir_ejercicio((SELECT id FROM contabilidad.ejercicios WHERE nombre = 'Ejercicio 2026')) $$,
                'deshace el cierre mientras 2027 no tenga movimientos');
SELECT is((SELECT count(*) FROM contabilidad.asientos WHERE tipo IN ('cierre', 'refundicion', 'revaluacion')
             OR (tipo = 'apertura' AND fecha = '2027-01-01')), 0::bigint,
          'la reapertura quita cierre, refundición, revaluación y apertura siguiente');

-- ------------------------------------------------------------
-- Permisos
-- ------------------------------------------------------------
SET LOCAL role authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000001","role":"authenticated"}', true);
SELECT throws_ok($$ SELECT contabilidad.crear_ejercicio(2030) $$, '42501', NULL,
                 'un usuario sin rol tesorero no escribe');

SELECT * FROM finish();
ROLLBACK;
