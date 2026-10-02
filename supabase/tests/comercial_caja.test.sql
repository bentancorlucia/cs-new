-- Caja del POS, devoluciones y cambios.
BEGIN;
SELECT plan(19);

DO $$ BEGIN PERFORM contabilidad.crear_ejercicio(extract(year FROM contabilidad._hoy())::int); END $$;

CREATE FUNCTION pg_temp.saldo(p_codigo text) RETURNS numeric LANGUAGE sql AS $$
  SELECT coalesce(sum(l.debe - l.haber), 0) FROM contabilidad.lineas l
  JOIN contabilidad.asientos a ON a.id = l.asiento_id
  JOIN contabilidad.cuentas c ON c.id = l.cuenta_id
  WHERE a.estado = 'confirmado' AND c.codigo = p_codigo
$$;
CREATE FUNCTION pg_temp.cta(p text) RETURNS uuid LANGUAGE sql AS $$ SELECT id FROM contabilidad.cuentas WHERE codigo = p $$;
CREATE TEMP TABLE caja AS SELECT id FROM comercial.cajas LIMIT 1;

INSERT INTO public.productos (id, nombre, slug, precio) VALUES (9301, 'Buzo', 'buzo-caja-test', 2000);
INSERT INTO public.producto_variantes (id, producto_id, nombre) VALUES (9311, 9301, 'M'), (9312, 9301, 'L');
DO $$ BEGIN
  PERFORM comercial.cargar_inventario_inicial(jsonb_build_array(
    jsonb_build_object('producto_id', 9301, 'variante_id', 9311, 'cantidad', 5, 'costo_unitario', 800),
    jsonb_build_object('producto_id', 9301, 'variante_id', 9312, 'cantidad', 5, 'costo_unitario', 800)));
END $$;

-- ---------- Sin caja abierta no se cobra en efectivo
INSERT INTO public.pedidos (id, tipo, estado, subtotal, total, metodo_pago) VALUES (8101, 'pos', 'pagado', 4000, 4000, 'efectivo');
SELECT throws_like($$ SELECT public.descontar_stock_pedido(8101, jsonb_build_array(
  jsonb_build_object('producto_id', 9301, 'variante_id', 9311, 'cantidad', 2, 'precio_unitario', 2000, 'subtotal', 4000)), NULL) $$,
  '%Abrí la caja%', 'sin caja abierta no se vende en efectivo');

-- ---------- Apertura con fondo (sobrante contra saldo contable 0)
CREATE TEMP TABLE ses AS SELECT comercial.abrir_caja((SELECT id FROM caja), 1000) AS id;
SELECT is(pg_temp.saldo('1.1.01.03'), 1000.00::numeric, 'el fondo contado queda en la caja');
SELECT is(pg_temp.saldo('4.7.02'), -1000.00::numeric, 'y la diferencia con el saldo contable es sobrante');
SELECT throws_like($$ SELECT comercial.abrir_caja((SELECT id FROM caja), 0) $$, '%ya está abierta%', 'una sola sesión abierta');

DO $$ BEGIN PERFORM public.descontar_stock_pedido(8101, jsonb_build_array(
  jsonb_build_object('producto_id', 9301, 'variante_id', 9311, 'cantidad', 2, 'precio_unitario', 2000, 'subtotal', 4000)), NULL); END $$;
SELECT is(pg_temp.saldo('1.1.01.03'), 5000.00::numeric, 'la venta en efectivo entra a la caja');

-- ---------- Movimientos de caja
DO $$ BEGIN PERFORM comercial.movimiento_caja((SELECT id FROM ses), 'deposito_banco', 3000, pg_temp.cta('1.1.01.07'), 'Depósito del día'); END $$;
SELECT is(pg_temp.saldo('1.1.01.03'), 2000.00::numeric, 'el depósito sale de la caja');
SELECT is(pg_temp.saldo('1.1.01.07'), 3000.00::numeric, 'y entra al banco');
SELECT throws_like($$ SELECT comercial.movimiento_caja((SELECT id FROM ses), 'retiro', 9999, pg_temp.cta('1.1.04.09'), 'Retiro excesivo') $$,
                   '%No hay ese efectivo%', 'no se retira más de lo que hay');

-- ---------- Devolución de 1 buzo M con reintegro en efectivo
CREATE TEMP TABLE dev AS SELECT comercial.registrar_devolucion(8101, jsonb_build_array(
  jsonb_build_object('pedido_item_id', (SELECT id FROM public.pedido_items WHERE pedido_id = 8101), 'cantidad', 1)),
  'caja', 'No le quedó') AS id;
SELECT is(pg_temp.saldo('4.4.09'), 2000.00::numeric, 'la devolución va a Devoluciones sobre ventas');
SELECT is(pg_temp.saldo('1.1.01.03'), 0.00::numeric, 'el reintegro sale de la caja');
SELECT is((SELECT stock_actual FROM public.producto_variantes WHERE id = 9311), 4, 'el buzo vuelve al stock');
SELECT is((SELECT sum(valor) FROM comercial.movimientos WHERE origen_tipo = 'devolucion_venta'), 800.00::numeric,
          'al costo con que salió');

-- ---------- Cambio de talle: devuelve 1 M y se lleva 1 L, sin diferencia
DO $$ BEGIN PERFORM comercial.registrar_devolucion(8101, jsonb_build_array(
  jsonb_build_object('pedido_item_id', (SELECT id FROM public.pedido_items WHERE pedido_id = 8101), 'cantidad', 1)),
  'caja', 'Cambio de talle', jsonb_build_array(
  jsonb_build_object('producto_id', 9301, 'variante_id', 9312, 'cantidad', 1, 'precio_unitario', 2000))); END $$;
SELECT is((SELECT neto FROM comercial.devoluciones ORDER BY id DESC LIMIT 1), 0.00::numeric, 'el cambio sin diferencia no mueve plata');
SELECT is((SELECT stock_actual FROM public.producto_variantes WHERE id = 9312), 4, 'sale el talle L');
SELECT throws_like($$ SELECT comercial.registrar_devolucion(8101, jsonb_build_array(
  jsonb_build_object('pedido_item_id', (SELECT id FROM public.pedido_items WHERE pedido_id = 8101), 'cantidad', 1)), 'caja', 'Otra vez') $$,
  '%más unidades que las vendidas%', 'no se devuelve más de lo vendido');

SELECT throws_like($$ SELECT public.cancelar_pedido(8101, 'Arrepentido', NULL) $$,
                   '%devoluciones o cambios%', 'un pedido con devoluciones no se cancela entero');

-- ---------- Cierre con faltante
SELECT is(comercial.cerrar_caja((SELECT id FROM ses), 0 - 0 + 0), 0.00::numeric, 'cierre sin diferencia');
SELECT is((SELECT estado FROM comercial.caja_sesiones WHERE id = (SELECT id FROM ses)), 'cerrada', 'la sesión queda cerrada');
CREATE TEMP TABLE ses2 AS SELECT comercial.abrir_caja((SELECT id FROM caja), 0) AS id;
DO $$ BEGIN PERFORM comercial.movimiento_caja((SELECT id FROM ses2), 'ingreso', 500, pg_temp.cta('1.1.01.07'), 'Cambio traído del banco'); END $$;
SELECT is(comercial.cerrar_caja((SELECT id FROM ses2), 450), -50.00::numeric, 'faltan 50 al cerrar');

SELECT * FROM finish();
ROLLBACK;
