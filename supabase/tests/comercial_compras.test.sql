-- Compras y cuenta corriente con proveedores.
BEGIN;
SELECT plan(28);

DO $$ BEGIN PERFORM contabilidad.crear_ejercicio(extract(year FROM contabilidad._hoy())::int); END $$;

CREATE FUNCTION pg_temp.saldo(p_codigo text, p_prov int DEFAULT NULL) RETURNS numeric LANGUAGE sql AS $$
  SELECT coalesce(sum(l.debe - l.haber), 0) FROM contabilidad.lineas l
  JOIN contabilidad.asientos a ON a.id = l.asiento_id
  JOIN contabilidad.cuentas c ON c.id = l.cuenta_id
  WHERE a.estado = 'confirmado' AND c.codigo = p_codigo AND (p_prov IS NULL OR l.proveedor_id = p_prov)
$$;
CREATE FUNCTION pg_temp.cta(p text) RETURNS uuid LANGUAGE sql AS $$ SELECT id FROM contabilidad.cuentas WHERE codigo = p $$;

INSERT INTO public.proveedores (id, nombre) VALUES (7001, 'Textil Sur'), (7002, 'Importadora USA');
INSERT INTO comercial.proveedores_condiciones (proveedor_id, moneda, plazo_dias) VALUES (7001, 'UYU', 30), (7002, 'USD', 60);
INSERT INTO public.productos (id, nombre, slug, precio) VALUES (9201, 'Short', 'short-test', 900), (9202, 'Pelota', 'pelota-test', 2000);

-- ---------- Orden de compra y recepción parcial
CREATE TEMP TABLE oc AS SELECT comercial.guardar_orden_compra(NULL, 7001, contabilidad._hoy(), 'UYU',
  '[{"producto_id": 9201, "cantidad": 10, "costo_unitario": 100}]') AS id;
SELECT throws_like($$ SELECT comercial.recibir_mercaderia(7001, (SELECT id FROM oc), contabilidad._hoy(), 'UYU',
  jsonb_build_array(jsonb_build_object('orden_item_id', (SELECT id FROM comercial.orden_compra_items WHERE orden_id = (SELECT id FROM oc)), 'cantidad', 1))) $$,
  '%no está aprobada%', 'no se recibe contra una orden sin aprobar');
DO $$ BEGIN PERFORM comercial.aprobar_orden_compra((SELECT id FROM oc)); END $$;

CREATE TEMP TABLE rec AS SELECT comercial.recibir_mercaderia(7001, (SELECT id FROM oc), contabilidad._hoy(), 'UYU',
  jsonb_build_array(jsonb_build_object('orden_item_id', (SELECT id FROM comercial.orden_compra_items WHERE orden_id = (SELECT id FROM oc)), 'cantidad', 6)),
  'R-123', NULL, 'clave-1') AS id;
SELECT is((SELECT stock_actual FROM public.productos WHERE id = 9201), 6, 'la recepción suma stock');
SELECT is(pg_temp.saldo('1.1.05.01'), 600.00::numeric, 'entra a Mercadería al costo de la orden');
SELECT is(pg_temp.saldo('2.1.01.03', 7001), -600.00::numeric, 'queda como recibida a facturar del proveedor');
SELECT is((SELECT estado FROM comercial.ordenes_compra WHERE id = (SELECT id FROM oc)), 'recibida_parcial', 'la orden queda parcial');
SELECT is(comercial.recibir_mercaderia(7001, (SELECT id FROM oc), contabilidad._hoy(), 'UYU',
  jsonb_build_array(jsonb_build_object('orden_item_id', (SELECT id FROM comercial.orden_compra_items WHERE orden_id = (SELECT id FROM oc)), 'cantidad', 6)),
  'R-123', NULL, 'clave-1'), (SELECT id FROM rec), 'reenviar la misma recepción no duplica el stock');
SELECT throws_like($$ SELECT comercial.recibir_mercaderia(7001, (SELECT id FROM oc), contabilidad._hoy(), 'UYU',
  jsonb_build_array(jsonb_build_object('orden_item_id', (SELECT id FROM comercial.orden_compra_items WHERE orden_id = (SELECT id FROM oc)), 'cantidad', 5))) $$,
  '%más unidades que las pendientes%', 'no se recibe más de lo pendiente');

-- ---------- Factura contra la recepción, con diferencia de precio
CREATE TEMP TABLE f1 AS SELECT comercial.registrar_documento_proveedor(7001, 'factura', 'A', '1001', contabilidad._hoy(), 'UYU',
  jsonb_build_array(jsonb_build_object('tipo', 'recepcion',
    'recepcion_item_id', (SELECT id FROM comercial.recepcion_items WHERE recepcion_id = (SELECT id FROM rec)),
    'cantidad', 6, 'importe', 660))) AS id;
SELECT is(pg_temp.saldo('2.1.01.03', 7001), 0.00::numeric, 'la factura cancela lo recibido a facturar');
SELECT is(pg_temp.saldo('2.1.01.01', 7001), -660.00::numeric, 'y genera la deuda con el proveedor');
SELECT is(pg_temp.saldo('5.1.01'), 60.00::numeric, 'la diferencia de precio va a costo de ventas');
SELECT is((SELECT vencimiento - fecha FROM comercial.documentos_proveedor WHERE id = (SELECT id FROM f1)), 30,
          'vence según el plazo del proveedor');
SELECT throws_ok($$ SELECT comercial.registrar_documento_proveedor(7001, 'factura', 'A', '1001', contabilidad._hoy(), 'UYU',
  jsonb_build_array(jsonb_build_object('tipo', 'gasto', 'cuenta_id', pg_temp.cta('5.4.01'), 'importe', 1))) $$,
  '23505', NULL, 'no se carga dos veces la misma factura');

-- ---------- Factura de gasto, nota de crédito y pago con saldo a favor
CREATE TEMP TABLE f2 AS SELECT comercial.registrar_documento_proveedor(7001, 'factura', 'A', '1002', contabilidad._hoy(), 'UYU',
  jsonb_build_array(jsonb_build_object('tipo', 'gasto', 'cuenta_id', pg_temp.cta('5.4.01'), 'importe', 1000))) AS id;
CREATE TEMP TABLE nc AS SELECT comercial.registrar_documento_proveedor(7001, 'nota_credito', 'A', '55', contabilidad._hoy(), 'UYU',
  jsonb_build_array(jsonb_build_object('tipo', 'gasto', 'cuenta_id', pg_temp.cta('5.4.01'), 'importe', 200))) AS id;
DO $$ BEGIN PERFORM comercial.aplicar_nota_credito((SELECT id FROM nc), (SELECT id FROM f2), 200); END $$;
SELECT is(comercial.saldo_documento((SELECT id FROM f2)), 800.00::numeric, 'la nota de crédito baja el saldo de la factura');

CREATE TEMP TABLE op AS SELECT comercial.crear_orden_pago(7001, 'UYU', 1500, pg_temp.cta('1.1.01.05'),
  jsonb_build_array(jsonb_build_object('documento_id', (SELECT id FROM f1), 'importe', 660),
                    jsonb_build_object('documento_id', (SELECT id FROM f2), 'importe', 800))) AS id;
SELECT is(comercial.saldo_documento((SELECT id FROM f1)), 660.00::numeric, 'una orden de pago pendiente todavía no baja el saldo');
DO $$ BEGIN PERFORM comercial.pagar_orden((SELECT id FROM op)); END $$;
SELECT is(comercial.saldo_documento((SELECT id FROM f1)) + comercial.saldo_documento((SELECT id FROM f2)), 0.00::numeric,
          'pagada, las facturas quedan saldadas');
SELECT is(pg_temp.saldo('1.1.04.04', 7001), 40.00::numeric, 'lo pagado de más queda como anticipo');
SELECT is(pg_temp.saldo('1.1.01.05'), -1500.00::numeric, 'sale del banco');
SELECT is((SELECT count(*) FROM comercial.control_proveedores() WHERE diferencia <> 0), 0::bigint,
          'documentos y mayor coinciden por proveedor');

-- ---------- Proveedor en dólares
DO $$ BEGIN PERFORM contabilidad.registrar_cotizacion('USD', contabilidad._hoy() - 1, 40, 'manual'); END $$;
CREATE TEMP TABLE rec2 AS SELECT comercial.recibir_mercaderia(7002, NULL, contabilidad._hoy(), 'USD',
  '[{"producto_id": 9202, "cantidad": 10, "costo_unitario": 5}]', NULL, 40) AS id;
SELECT is(pg_temp.saldo('1.1.05.01'), 2600.00::numeric, 'recepción en dólares: 10 × US$ 5 × 40 = $2.000 más los $600 anteriores');
CREATE TEMP TABLE f3 AS SELECT comercial.registrar_documento_proveedor(7002, 'factura', '', 'INV-9', contabilidad._hoy(), 'USD',
  jsonb_build_array(jsonb_build_object('tipo', 'recepcion',
    'recepcion_item_id', (SELECT id FROM comercial.recepcion_items WHERE recepcion_id = (SELECT id FROM rec2)),
    'cantidad', 10, 'importe', 50)), NULL, 42) AS id;
SELECT is(pg_temp.saldo('5.7.02.01'), 100.00::numeric, 'factura a 42 de lo recibido a 40: pérdida de cambio realizada');
CREATE TEMP TABLE op2 AS SELECT comercial.crear_orden_pago(7002, 'USD', 50, pg_temp.cta('1.1.01.06'),
  jsonb_build_array(jsonb_build_object('documento_id', (SELECT id FROM f3), 'importe', 50))) AS id;
DO $$ BEGIN
  PERFORM contabilidad.guardar_asiento(NULL, contabilidad._hoy(), 'Compra de dólares', jsonb_build_array(
    jsonb_build_object('cuenta_id', pg_temp.cta('1.1.01.06'), 'lado', 'debe', 'importe', 100, 'tc', 41),
    jsonb_build_object('cuenta_id', pg_temp.cta('1.1.01.05'), 'lado', 'haber', 'importe', 4100)), true);
  PERFORM comercial.pagar_orden((SELECT id FROM op2), contabilidad._hoy(), 41);
END $$;
SELECT is(pg_temp.saldo('4.6.02.01'), -50.00::numeric, 'pagar a 41 lo facturado a 42: ganancia de cambio realizada');
SELECT is((SELECT sum(CASE WHEN l.debe > 0 THEN l.importe_origen ELSE -l.importe_origen END)
           FROM contabilidad.lineas l JOIN contabilidad.cuentas c ON c.id = l.cuenta_id
           WHERE c.codigo = '2.1.01.02' AND l.proveedor_id = 7002), 0.00::numeric, 'la deuda en dólares queda en cero');
SELECT is((SELECT count(*) FROM comercial.control_proveedores() WHERE diferencia <> 0), 0::bigint,
          'control en dólares también coincide');

-- ---------- Devolución de mercadería al proveedor y anulaciones
CREATE TEMP TABLE nc2 AS SELECT comercial.registrar_documento_proveedor(7001, 'nota_credito', 'A', '56', contabilidad._hoy(), 'UYU',
  '[{"tipo": "devolucion", "producto_id": 9201, "cantidad": 1, "importe": 100}]') AS id;
SELECT is((SELECT stock_actual FROM public.productos WHERE id = 9201), 5, 'la devolución al proveedor saca el stock');
SELECT throws_like($$ SELECT comercial.anular_documento_proveedor((SELECT id FROM f2), 'error') $$,
                   '%aplicados%', 'no se anula una factura con pagos aplicados');
DO $$ BEGIN PERFORM comercial.anular_orden_pago((SELECT id FROM op), 'Pago cargado mal'); END $$;
SELECT is(comercial.saldo_documento((SELECT id FROM f1)), 660.00::numeric, 'anular el pago reabre las facturas');
SELECT is((SELECT count(*) FROM comercial.control_proveedores() WHERE diferencia <> 0), 0::bigint,
          'y documentos y mayor siguen coincidiendo');

-- ---------- Factura contado
SELECT lives_ok($$ SELECT comercial.registrar_documento_proveedor(7001, 'factura', 'B', '77', contabilidad._hoy(), 'UYU',
  jsonb_build_array(jsonb_build_object('tipo', 'gasto', 'cuenta_id', pg_temp.cta('5.5.06'), 'importe', 350)),
  NULL, NULL, pg_temp.cta('1.1.01.01')) $$, 'factura contado pagada de caja');

SELECT * FROM finish();
ROLLBACK;
