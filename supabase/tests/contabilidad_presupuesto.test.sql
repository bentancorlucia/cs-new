-- Presupuesto: versiones, bloqueo del aprobado y ejecución contra lo real.
BEGIN;
SELECT plan(24);

CREATE FUNCTION pg_temp.cta(p text) RETURNS uuid LANGUAGE sql AS $$ SELECT id FROM contabilidad.cuentas WHERE codigo = p $$;
CREATE FUNCTION pg_temp.cc(p text) RETURNS uuid LANGUAGE sql AS $$ SELECT id FROM contabilidad.centros_costo WHERE codigo = p $$;
CREATE FUNCTION pg_temp.l(p_cuenta text, p_lado text, p_importe numeric, p_extra jsonb DEFAULT '{}')
RETURNS jsonb LANGUAGE sql AS $$
  SELECT jsonb_build_object('cuenta_id', pg_temp.cta(p_cuenta), 'lado', p_lado, 'importe', p_importe) || p_extra
$$;
CREATE FUNCTION pg_temp.asiento(p_fecha date, p_lineas jsonb) RETURNS uuid LANGUAGE sql AS $$
  SELECT contabilidad.guardar_asiento(NULL, p_fecha, 'Prueba presupuesto', p_lineas, true)
$$;

DO $$ BEGIN
  PERFORM contabilidad.crear_ejercicio(2025);
  PERFORM contabilidad.crear_ejercicio(2026);
END $$;
CREATE TEMP TABLE ej AS SELECT id FROM contabilidad.ejercicios WHERE fecha_inicio = '2026-01-01';

-- Real 2025: cuotas sociales en marzo, noviembre y diciembre; UTE y
-- honorarios de básquetbol en diciembre.
SELECT pg_temp.asiento('2025-03-10', jsonb_build_array(pg_temp.l('1.1.01.05', 'debe', 3000), pg_temp.l('4.1.01', 'haber', 3000)));
SELECT pg_temp.asiento('2025-11-10', jsonb_build_array(pg_temp.l('1.1.01.05', 'debe', 1200), pg_temp.l('4.1.01', 'haber', 1200)));
SELECT pg_temp.asiento('2025-12-10', jsonb_build_array(pg_temp.l('1.1.01.05', 'debe', 1200), pg_temp.l('4.1.01', 'haber', 1200)));
SELECT pg_temp.asiento('2025-12-15', jsonb_build_array(
  pg_temp.l('5.4.02', 'debe', 600), pg_temp.l('5.2.01', 'debe', 900, jsonb_build_object('centro_costo_id', pg_temp.cc('BASQUETBOL'))),
  pg_temp.l('1.1.01.05', 'haber', 1500)));
-- Real 2026
SELECT pg_temp.asiento('2026-02-10', jsonb_build_array(pg_temp.l('1.1.01.05', 'debe', 1500), pg_temp.l('4.1.01', 'haber', 1500)));
SELECT pg_temp.asiento('2026-02-20', jsonb_build_array(pg_temp.l('5.4.02', 'debe', 700), pg_temp.l('1.1.01.05', 'haber', 700)));

-- ---------- Base: ejercicio anterior, mes a mes
CREATE TEMP TABLE p1 AS SELECT contabilidad.crear_presupuesto((SELECT id FROM ej), 'ejercicio_anterior') AS id;
SELECT is((SELECT count(*) FROM contabilidad.presupuesto_lineas WHERE presupuesto_id = (SELECT id FROM p1)), 5::bigint,
          'copia lo real del año anterior por cuenta, centro y mes');
SELECT is((SELECT importe FROM contabilidad.presupuesto_lineas WHERE presupuesto_id = (SELECT id FROM p1)
           AND cuenta_id = pg_temp.cta('5.2.01') AND centro_costo_id = pg_temp.cc('BASQUETBOL') AND mes = 12), 900.00::numeric,
          'con el centro de costo');
SELECT is((SELECT importe FROM contabilidad.presupuesto_lineas WHERE presupuesto_id = (SELECT id FROM p1)
           AND cuenta_id = pg_temp.cta('4.1.01') AND mes = 3), 3000.00::numeric, 'ingresos en positivo');
SELECT throws_like($$ SELECT contabilidad.crear_presupuesto((SELECT id FROM ej)) $$,
                   '%Ya hay un borrador%', 'un solo borrador por ejercicio');

-- ---------- Base: promedio de los últimos 3 meses (oct–dic 2025)
DO $$ BEGIN PERFORM contabilidad.eliminar_presupuesto((SELECT id FROM p1)); END $$;
CREATE TEMP TABLE p2 AS SELECT contabilidad.crear_presupuesto((SELECT id FROM ej), 'promedio', 3, p_hasta => '2025-12-31') AS id;
SELECT is((SELECT version FROM contabilidad.presupuestos WHERE id = (SELECT id FROM p2)), 1, 'un borrador eliminado no deja hueco en las versiones');
SELECT is((SELECT importe FROM contabilidad.presupuesto_lineas WHERE presupuesto_id = (SELECT id FROM p2)
           AND cuenta_id = pg_temp.cta('4.1.01') AND mes = 7), 800.00::numeric, 'promedio mensual repetido en cada mes');
SELECT is((SELECT count(*) FROM contabilidad.presupuesto_lineas WHERE presupuesto_id = (SELECT id FROM p2)), 36::bigint,
          'tres cuentas por doce meses');

-- ---------- Edición del borrador
SELECT throws_like($$ SELECT contabilidad.guardar_presupuesto_lineas((SELECT id FROM p2), jsonb_build_array(
  jsonb_build_object('cuenta_id', pg_temp.cta('1.1.01.05'), 'mes', 1, 'importe', 10))) $$,
  '%ingresos o egresos%', 'no se presupuestan cuentas patrimoniales');
SELECT throws_like($$ SELECT contabilidad.guardar_presupuesto_lineas((SELECT id FROM p2), jsonb_build_array(
  jsonb_build_object('cuenta_id', pg_temp.cta('4.1'), 'mes', 1, 'importe', 10))) $$,
  '%imputables%', 'ni cuentas agrupadoras');
DO $$ BEGIN PERFORM contabilidad.guardar_presupuesto_lineas((SELECT id FROM p2), jsonb_build_array(
  jsonb_build_object('cuenta_id', pg_temp.cta('4.1.01'), 'mes', 1, 'importe', 2000),
  jsonb_build_object('cuenta_id', pg_temp.cta('5.4.02'), 'mes', 1, 'importe', 0))); END $$;
SELECT is((SELECT importe FROM contabilidad.presupuesto_lineas WHERE presupuesto_id = (SELECT id FROM p2)
           AND cuenta_id = pg_temp.cta('4.1.01') AND mes = 1), 2000.00::numeric, 'la celda se reemplaza');
SELECT is((SELECT count(*) FROM contabilidad.presupuesto_lineas WHERE presupuesto_id = (SELECT id FROM p2)
           AND cuenta_id = pg_temp.cta('5.4.02') AND mes = 1), 0::bigint, 'importe 0 borra la celda');

-- ---------- Aprobación: queda congelado
DO $$ BEGIN PERFORM contabilidad.aprobar_presupuesto((SELECT id FROM p2)); END $$;
SELECT is((SELECT estado FROM contabilidad.presupuestos WHERE id = (SELECT id FROM p2)), 'aprobado', 'aprobado');
SELECT throws_like($$ SELECT contabilidad.guardar_presupuesto_lineas((SELECT id FROM p2), jsonb_build_array(
  jsonb_build_object('cuenta_id', pg_temp.cta('4.1.01'), 'mes', 2, 'importe', 1))) $$,
  '%reformulalo%', 'un aprobado no se edita');
SELECT throws_like($$ UPDATE contabilidad.presupuestos SET nombre = 'Otro' WHERE id = (SELECT id FROM p2) $$,
                   '%no se modifica%', 'ni siquiera por fuera de las funciones');
SELECT throws_like($$ SELECT contabilidad.eliminar_presupuesto((SELECT id FROM p2)) $$,
                   '%borrador%', 'ni se borra');

-- ---------- Ejecución contra lo real (año completo)
CREATE TEMP TABLE ejec AS SELECT * FROM contabilidad.ejecucion_presupuesto((SELECT id FROM p2));
SELECT is((SELECT presupuestado FROM ejec WHERE cuenta_id = pg_temp.cta('4.1.01')), 10800.00::numeric,
          'presupuestado anual: 2000 + 11 × 800');
SELECT is((SELECT ejecutado FROM ejec WHERE cuenta_id = pg_temp.cta('4.1.01')), 1500.00::numeric, 'ingreso ejecutado');
SELECT is((SELECT ejecutado FROM ejec WHERE cuenta_id = pg_temp.cta('5.4.02')), 700.00::numeric, 'egreso ejecutado en positivo');
SELECT is((SELECT desvio FROM ejec WHERE cuenta_id = pg_temp.cta('5.4.02')), 700.00 - 2200.00, 'desvío = ejecutado − presupuestado');
SELECT is((SELECT presupuestado FROM contabilidad.ejecucion_presupuesto((SELECT id FROM p2), 2, 2)
           WHERE cuenta_id = pg_temp.cta('4.1.01')), 800.00::numeric, 'filtrado por meses');

-- ---------- Reformulación: versión nueva y la anterior queda reemplazada
CREATE TEMP TABLE p3 AS SELECT contabilidad.crear_presupuesto((SELECT id FROM ej), 'vigente') AS id;
SELECT is((SELECT count(*) FROM contabilidad.presupuesto_lineas WHERE presupuesto_id = (SELECT id FROM p3)),
          (SELECT count(*) FROM contabilidad.presupuesto_lineas WHERE presupuesto_id = (SELECT id FROM p2)),
          'la reformulación parte del aprobado');
DO $$ BEGIN PERFORM contabilidad.aprobar_presupuesto((SELECT id FROM p3)); END $$;
SELECT is((SELECT estado FROM contabilidad.presupuestos WHERE id = (SELECT id FROM p2)), 'reemplazado',
          'al aprobarla, la anterior queda reemplazada');

-- ---------- Nombre y notas: solo en borrador
CREATE TEMP TABLE p4 AS SELECT contabilidad.crear_presupuesto((SELECT id FROM ej), 'vigente') AS id;
DO $$ BEGIN PERFORM contabilidad.actualizar_presupuesto((SELECT id FROM p4), 'Prueba renombrado', 'Notas'); END $$;
SELECT is((SELECT nombre FROM contabilidad.presupuestos WHERE id = (SELECT id FROM p4)), 'Prueba renombrado', 'se renombra el borrador');
SELECT throws_like($$ SELECT contabilidad.actualizar_presupuesto((SELECT id FROM p3), 'Otro') $$, '%no se modifica%',
                   'un aprobado no se renombra');

SELECT * FROM finish();
ROLLBACK;
