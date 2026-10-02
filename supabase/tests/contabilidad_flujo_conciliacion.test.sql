-- Flujo de caja (método directo) y conciliación bancaria.
BEGIN;
SELECT plan(45);

CREATE FUNCTION pg_temp.cta(p text) RETURNS uuid LANGUAGE sql AS $$ SELECT id FROM contabilidad.cuentas WHERE codigo = p $$;
CREATE FUNCTION pg_temp.l(p_cuenta text, p_lado text, p_importe numeric)
RETURNS jsonb LANGUAGE sql AS $$
  SELECT jsonb_build_object('cuenta_id', pg_temp.cta(p_cuenta), 'lado', p_lado, 'importe', p_importe)
$$;
CREATE TEMP TABLE a (nombre text PRIMARY KEY, id uuid);
CREATE FUNCTION pg_temp.asiento(p_nombre text, p_fecha date, p_lineas jsonb) RETURNS void LANGUAGE sql AS $$
  INSERT INTO a VALUES (p_nombre, contabilidad.guardar_asiento(NULL, p_fecha, 'Prueba ' || p_nombre, p_lineas, true))
$$;
-- Línea del banco de un asiento
CREATE FUNCTION pg_temp.lb(p_nombre text) RETURNS bigint LANGUAGE sql AS $$
  SELECT l.id FROM contabilidad.lineas l JOIN a ON a.id = l.asiento_id
  WHERE a.nombre = p_nombre AND l.cuenta_id = pg_temp.cta('1.1.01.05')
$$;
CREATE FUNCTION pg_temp.flujo(p_cuenta text, p_disp uuid DEFAULT NULL) RETURNS numeric LANGUAGE sql AS $$
  SELECT coalesce(sum(importe), 0) FROM contabilidad.flujo_caja('2026-01-01', '2026-01-31', p_disp)
  WHERE cuenta_id = pg_temp.cta(p_cuenta)
$$;

DO $$ BEGIN PERFORM contabilidad.crear_ejercicio(2026); END $$;
INSERT INTO a VALUES ('apertura', contabilidad.guardar_asiento(NULL, '2026-01-01', 'Saldos iniciales', jsonb_build_array(
  pg_temp.l('1.1.01.05', 'debe', 10000), pg_temp.l('3.1.01', 'haber', 10000)), true, 'apertura'));

-- Venta: el costo y la baja de mercadería no movieron caja
SELECT pg_temp.asiento('venta', '2026-01-05', jsonb_build_array(
  pg_temp.l('1.1.01.05', 'debe', 1000), pg_temp.l('5.1.01', 'debe', 600),
  pg_temp.l('4.4.02', 'haber', 1000), pg_temp.l('1.1.05.01', 'haber', 600)));
-- Cobro de cuotas con comisión descontada
SELECT pg_temp.asiento('cuota', '2026-01-10', jsonb_build_array(
  pg_temp.l('1.1.01.05', 'debe', 970), pg_temp.l('5.5.04', 'debe', 30), pg_temp.l('4.1.01', 'haber', 1000)));
-- Compra pagada en parte (el resto queda como deuda)
SELECT pg_temp.asiento('compra', '2026-01-12', jsonb_build_array(
  pg_temp.l('1.1.05.01', 'debe', 1000), pg_temp.l('1.1.01.05', 'haber', 400), pg_temp.l('2.1.04.03', 'haber', 600)));
-- Venta en efectivo con seña aplicada
SELECT pg_temp.asiento('sena', '2026-01-14', jsonb_build_array(
  pg_temp.l('1.1.01.03', 'debe', 600), pg_temp.l('2.1.04.03', 'debe', 400), pg_temp.l('4.4.01', 'haber', 1000)));
-- Del banco a la caja
SELECT pg_temp.asiento('traspaso', '2026-01-15', jsonb_build_array(
  pg_temp.l('1.1.01.03', 'debe', 500), pg_temp.l('1.1.01.05', 'haber', 500)));
-- Prorrateo con centavo
SELECT pg_temp.asiento('prorrateo', '2026-01-20', jsonb_build_array(
  pg_temp.l('1.1.01.05', 'debe', 100), pg_temp.l('2.1.04.03', 'debe', 10),
  pg_temp.l('4.4.01', 'haber', 40), pg_temp.l('4.4.02', 'haber', 40), pg_temp.l('4.4.03', 'haber', 30)));

-- ============================================================
-- Flujo de caja
-- ============================================================
SELECT is(contabilidad.saldo_disponibilidades('2026-01-01'), 10000.00::numeric, 'el saldo inicial cuenta la apertura');
SELECT is((SELECT count(*) FROM contabilidad.flujo_caja('2026-01-01', '2026-01-31') WHERE cuenta_id = pg_temp.cta('3.1.01')),
          0::bigint, 'la apertura no es flujo');
SELECT is(pg_temp.flujo('5.1.01'), 0::numeric, 'el costo de venta no es flujo');
SELECT is(pg_temp.flujo('1.1.05.01'), -400.00::numeric, 'la compra muestra solo lo pagado');
SELECT is(pg_temp.flujo('4.1.01'), 1000.00::numeric, 'la cuota se muestra bruta');
SELECT is(pg_temp.flujo('5.5.04'), -30.00::numeric, 'y la comisión como egreso');
SELECT is(pg_temp.flujo('2.1.04.03'), 0::numeric, 'ni la deuda ni la seña aplicada son flujo');
SELECT is((SELECT importe FROM contabilidad._flujo_asiento((SELECT id FROM a WHERE nombre = 'sena'))
           WHERE cuenta_id = pg_temp.cta('4.4.01')), 600.00::numeric, 'la venta con seña muestra lo cobrado');
SELECT is((SELECT count(*) FROM contabilidad._flujo_asiento((SELECT id FROM a WHERE nombre = 'traspaso'))),
          0::bigint, 'un traspaso entre disponibilidades no es flujo');
SELECT is(pg_temp.flujo('1.1.01.03', pg_temp.cta('1.1.01.05')), -500.00::numeric,
          'pero sí lo es mirando una sola cuenta');
SELECT is((SELECT sum(importe) FROM contabilidad._flujo_asiento((SELECT id FROM a WHERE nombre = 'prorrateo'))),
          100.00::numeric, 'el prorrateo no pierde centavos');
SELECT is(contabilidad.saldo_disponibilidades('2026-01-01')
          + (SELECT sum(importe) FROM contabilidad.flujo_caja('2026-01-01', '2026-01-31')),
          contabilidad.saldo_disponibilidades('2026-02-01'), 'saldo inicial + flujo = saldo final');
SELECT is(contabilidad.saldo_disponibilidades('2026-01-11', pg_temp.cta('1.1.01.05')), 11970.00::numeric,
          'saldo de una cuenta al empezar un día');

-- Diferencia de cambio realizada: va con el pago, ganada o perdida
SELECT pg_temp.asiento('perdida', '2026-02-10', jsonb_build_array(
  pg_temp.l('2.1.04.03', 'debe', 1000), pg_temp.l('5.7.02.01', 'debe', 50), pg_temp.l('1.1.01.03', 'haber', 1050)));
SELECT pg_temp.asiento('ganancia', '2026-02-11', jsonb_build_array(
  pg_temp.l('2.1.04.03', 'debe', 1000), pg_temp.l('4.6.02.01', 'haber', 50), pg_temp.l('1.1.01.03', 'haber', 950)));
SELECT is((SELECT importe FROM contabilidad._flujo_asiento((SELECT id FROM a WHERE nombre = 'perdida'))
           WHERE cuenta_id = pg_temp.cta('2.1.04.03')), -1050.00::numeric, 'la pérdida de cambio va con el pago');
SELECT is((SELECT importe FROM contabilidad._flujo_asiento((SELECT id FROM a WHERE nombre = 'ganancia'))
           WHERE cuenta_id = pg_temp.cta('2.1.04.03')), -950.00::numeric, 'y la ganancia también');
SELECT isnt(contabilidad.saldo_disponibilidades('2027-01-01'), 0::numeric, 'después del último ejercicio no da cero');
SELECT is(contabilidad.saldo_disponibilidades('2027-01-01'), contabilidad.saldo_disponibilidades('2026-12-31'),
          'es el saldo de su cierre');

-- ============================================================
-- Conciliación bancaria
-- ============================================================
CREATE FUNCTION pg_temp.movs(p_comision numeric) RETURNS jsonb LANGUAGE sql AS $$
  SELECT jsonb_build_array(
    jsonb_build_object('fecha', '2026-01-06', 'concepto', 'Depósito', 'importe', 1000, 'saldo', 11000),
    jsonb_build_object('fecha', '2026-01-11', 'concepto', 'Transferencia', 'importe', 970),
    jsonb_build_object('fecha', '2026-01-13', 'concepto', 'Pago', 'importe', -400),
    jsonb_build_object('fecha', '2026-01-15', 'concepto', 'Retiro', 'importe', -500),
    jsonb_build_object('fecha', '2026-01-31', 'concepto', 'Comisión mantenimiento', 'importe', -p_comision))
$$;

SELECT throws_like($$ SELECT contabilidad.importar_extracto(pg_temp.cta('1.1.01.05'), '2026-01-01', '2026-01-31',
  10000, 11000, pg_temp.movs(25)) $$, '%no cierra%', 'el extracto tiene que cerrar');
SELECT throws_like($$ SELECT contabilidad.importar_extracto(pg_temp.cta('1.1.01.05'), '2026-01-01', '2026-01-31',
  10000, 11045, jsonb_set(pg_temp.movs(25), '{0,saldo}', '11001')) $$, '%saldo informado%', 'los saldos por fila tienen que coincidir');
SELECT throws_like($$ SELECT contabilidad.importar_extracto(pg_temp.cta('4.1.01'), '2026-01-01', '2026-01-31',
  0, 0, '[]') $$, '%caja o banco%', 'solo sobre disponibilidades');

CREATE TEMP TABLE ext AS SELECT contabilidad.importar_extracto(pg_temp.cta('1.1.01.05'), '2026-01-01', '2026-01-31',
  10000, 11045, pg_temp.movs(25), 'enero.csv') AS id;
CREATE FUNCTION pg_temp.mov(p_orden integer, p_ext uuid DEFAULT NULL) RETURNS bigint LANGUAGE sql AS $$
  SELECT id FROM contabilidad.extracto_movimientos WHERE extracto_id = coalesce(p_ext, (SELECT id FROM ext)) AND orden = p_orden
$$;

SELECT is((SELECT count(*) FROM contabilidad.sugerir_conciliacion((SELECT id FROM ext))), 4::bigint,
          'sugiere las cuatro coincidencias por importe y fecha');
SELECT throws_like($$ SELECT contabilidad.conciliar((SELECT id FROM ext), ARRAY[pg_temp.mov(1)], ARRAY[pg_temp.lb('cuota')]) $$,
                   '%No coincide%', 'banco y libros tienen que sumar lo mismo');
SELECT throws_like($$ SELECT contabilidad.conciliar((SELECT id FROM ext), ARRAY[pg_temp.mov(1)],
                      ARRAY[(SELECT id FROM contabilidad.lineas WHERE asiento_id = (SELECT id FROM a WHERE nombre = 'venta')
                             AND cuenta_id = pg_temp.cta('4.4.02'))]) $$,
                   '%no son de esta cuenta%', 'solo líneas de la cuenta del extracto');
SELECT throws_like($$ SELECT contabilidad.conciliar((SELECT id FROM ext), NULL, ARRAY[pg_temp.lb('apertura')]) $$,
                   '%no son de esta cuenta%', 'la apertura no se concilia');

DO $$ DECLARE r record; BEGIN
  FOR r IN SELECT * FROM contabilidad.sugerir_conciliacion((SELECT id FROM ext)) LOOP
    PERFORM contabilidad.conciliar((SELECT id FROM ext), ARRAY[r.movimiento_id], ARRAY[r.linea_id]);
  END LOOP;
END $$;
SELECT throws_like($$ SELECT contabilidad.conciliar((SELECT id FROM ext), NULL, ARRAY[pg_temp.lb('venta')]) $$,
                   '%ya están conciliadas%', 'una línea se concilia una sola vez');
SELECT throws_like($$ SELECT contabilidad.cerrar_extracto((SELECT id FROM ext)) $$,
                   '%Faltan 1 movimientos%', 'no se cierra con movimientos del banco sin conciliar');

-- La comisión no estaba en los libros: se registra desde el extracto
SELECT lives_ok($$ SELECT contabilidad.contabilizar_movimiento_extracto(pg_temp.mov(5), pg_temp.cta('5.5.04')) $$,
                'registra la comisión y la deja conciliada');
SELECT is(pg_temp.flujo('5.5.04'), -55.00::numeric, 'la comisión del banco entra al flujo');
DO $$ BEGIN PERFORM contabilidad.desconciliar((SELECT conciliacion_id FROM contabilidad.conciliacion_movimientos
  WHERE movimiento_id = pg_temp.mov(5))); END $$;
SELECT is(contabilidad.contabilizar_movimiento_extracto(pg_temp.mov(5), pg_temp.cta('5.5.04')),
          (SELECT id FROM contabilidad.asientos WHERE origen_tipo = 'extracto' AND origen_id = pg_temp.mov(5)::text),
          'registrarlo de nuevo reutiliza el asiento');

CREATE TEMP TABLE res AS SELECT * FROM contabilidad.resumen_conciliacion((SELECT id FROM ext));
SELECT is((SELECT saldo_libros FROM res), 11145.00::numeric, 'saldo según libros');
SELECT is((SELECT pendientes FROM res), 100.00::numeric, 'el depósito del 20 está en tránsito');
SELECT is((SELECT diferencia FROM res), 0.00::numeric, 'la conciliación no tiene diferencias');

SELECT throws_like($$ SELECT contabilidad.revertir_asiento((SELECT id FROM a WHERE nombre = 'compra'), 'Error') $$,
                   '%desconcilialo%', 'un asiento conciliado no se revierte');

DO $$ BEGIN PERFORM contabilidad.cerrar_extracto((SELECT id FROM ext)); END $$;
SELECT throws_like($$ SELECT contabilidad.desconciliar((SELECT min(id) FROM contabilidad.conciliaciones)) $$,
                   '%cerrado%', 'un extracto cerrado no se desconcilia');
SELECT throws_like($$ DELETE FROM contabilidad.extracto_movimientos WHERE id = pg_temp.mov(1) $$,
                   '%cerrado%', 'ni se le borran movimientos');
SELECT throws_like($$ UPDATE contabilidad.extractos SET saldo_final = 1 WHERE id = (SELECT id FROM ext) $$,
                   '%no se modifican%', 'los saldos del banco no cambian');

-- ---------- Febrero: encadenado al anterior
SELECT throws_like($$ SELECT contabilidad.importar_extracto(pg_temp.cta('1.1.01.05'), '2026-02-02', '2026-02-28',
  11045, 11145, '[{"fecha":"2026-02-02","concepto":"Depósito","importe":100}]') $$, '%van seguidos%', 'sin huecos entre extractos');
SELECT throws_like($$ SELECT contabilidad.importar_extracto(pg_temp.cta('1.1.01.05'), '2026-02-01', '2026-02-28',
  11000, 11100, '[{"fecha":"2026-02-02","concepto":"Depósito","importe":100}]') $$, '%no coincide con el saldo final%',
  'el saldo inicial es el final del anterior');
CREATE TEMP TABLE feb AS SELECT contabilidad.importar_extracto(pg_temp.cta('1.1.01.05'), '2026-02-01', '2026-02-28',
  11045, 11145, '[{"fecha":"2026-02-02","concepto":"Depósito","importe":100}]') AS id;
SELECT lives_ok($$ SELECT contabilidad.conciliar((SELECT id FROM feb), ARRAY[pg_temp.mov(1, (SELECT id FROM feb))], ARRAY[pg_temp.lb('prorrateo')]) $$,
                'el depósito en tránsito se concilia en el extracto siguiente');
SELECT is((SELECT pendientes FROM contabilidad.resumen_conciliacion((SELECT id FROM feb))), 0::numeric, 'ya no hay pendientes');
SELECT is((SELECT diferencia FROM contabilidad.resumen_conciliacion((SELECT id FROM feb))), 0.00::numeric, 'y cierra');
SELECT is((SELECT pendientes FROM contabilidad.resumen_conciliacion((SELECT id FROM ext))), 100.00::numeric,
          'enero sigue mostrando el tránsito a su fecha');

SELECT throws_like($$ SELECT contabilidad.eliminar_extracto((SELECT id FROM ext)) $$, '%último extracto%',
                   'solo se borra el último extracto');
DO $$ BEGIN PERFORM contabilidad.cerrar_extracto((SELECT id FROM feb)); END $$;
SELECT throws_like($$ SELECT contabilidad.reabrir_extracto((SELECT id FROM ext)) $$, '%posterior cerrado%',
                   'se reabren del más nuevo al más viejo');

-- Asiento y su reversión: se sugieren como par (suman cero)
SELECT pg_temp.asiento('a_revertir', '2026-02-15', jsonb_build_array(pg_temp.l('1.1.01.05', 'debe', 77), pg_temp.l('4.7.01', 'haber', 77)));
DO $$ BEGIN PERFORM contabilidad.revertir_asiento((SELECT id FROM a WHERE nombre = 'a_revertir'), 'Prueba', '2026-02-16'); END $$;
SELECT is((SELECT count(*) FROM contabilidad.sugerir_reversiones((SELECT id FROM feb))), 1::bigint,
          'sugiere conciliar el asiento con su reversión');

SELECT * FROM finish();
ROLLBACK;
