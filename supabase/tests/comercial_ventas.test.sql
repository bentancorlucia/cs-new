-- Tienda: stock valorizado y contabilización de ventas.
BEGIN;
SELECT plan(32);

-- Ejercicio del año en curso (las ventas se asientan con la fecha de hoy)
DO $$ BEGIN PERFORM contabilidad.crear_ejercicio(extract(year FROM contabilidad._hoy())::int); END $$;

CREATE FUNCTION pg_temp.saldo(p_codigo text) RETURNS numeric LANGUAGE sql AS $$
  SELECT coalesce(sum(l.debe - l.haber), 0) FROM contabilidad.lineas l
  JOIN contabilidad.asientos a ON a.id = l.asiento_id
  JOIN contabilidad.cuentas c ON c.id = l.cuenta_id
  WHERE a.estado = 'confirmado' AND c.codigo = p_codigo
$$;
CREATE FUNCTION pg_temp.item(p_prod int, p_var int DEFAULT NULL) RETURNS comercial.items LANGUAGE sql AS $$
  SELECT * FROM comercial.items WHERE producto_id = p_prod AND coalesce(variante_id, 0) = coalesce(p_var, 0)
$$;

-- Catálogo: una camiseta (promedio), una gorra (FIFO) y un buzo con talles
INSERT INTO public.productos (id, nombre, slug, precio, precio_socio) VALUES
  (9001, 'Camiseta', 'camiseta-test', 1500, 1200),
  (9002, 'Gorra', 'gorra-test', 800, 700),
  (9003, 'Buzo', 'buzo-test', 2500, 2200);
INSERT INTO public.producto_variantes (id, producto_id, nombre) VALUES (9101, 9003, 'M'), (9102, 9003, 'L');

DO $$ BEGIN
  PERFORM comercial.cambiar_metodo_costeo(9002, 'fifo');
  PERFORM comercial.cargar_inventario_inicial(jsonb_build_array(
    jsonb_build_object('producto_id', 9001, 'cantidad', 10, 'costo_unitario', 600),
    jsonb_build_object('producto_id', 9002, 'cantidad', 5, 'costo_unitario', 300),
    jsonb_build_object('producto_id', 9003, 'variante_id', 9101, 'cantidad', 4, 'costo_unitario', 1000)));
END $$;

SELECT is((SELECT stock_actual FROM public.productos WHERE id = 9001), 10, 'el stock público refleja el motor');
SELECT is((SELECT stock_actual FROM public.productos WHERE id = 9003), 4, 'el producto con talles suma sus variantes');
SELECT throws_like($$ UPDATE public.productos SET stock_actual = 99 WHERE id = 9001 $$,
                   '%no se edita en la ficha%', 'el stock no se pisa desde la ficha del producto');
SELECT throws_like($$ INSERT INTO public.productos (nombre, slug, precio, stock_actual) VALUES ('X', 'x-test', 1, 5) $$,
                   '%stock inicial%', 'un producto nuevo no nace con stock');

-- Una segunda partida de gorras más cara (para FIFO) y de camisetas (promedio)
DO $$ BEGIN
  PERFORM comercial._entrada((pg_temp.item(9002)).id, 5, 400, contabilidad._hoy(), 'compra', 'test', 'g2');
  PERFORM comercial._entrada((pg_temp.item(9001)).id, 10, 700, contabilidad._hoy(), 'compra', 'test', 'c2');
END $$;
SELECT is((pg_temp.item(9001)).valor, 13000.00::numeric, 'promedio: 10 a 600 + 10 a 700 = 13.000');

DO $$ BEGIN PERFORM comercial.abrir_caja((SELECT id FROM comercial.cajas LIMIT 1), 0); END $$;

-- ---------- Venta POS en efectivo: 2 camisetas a no socio
INSERT INTO public.pedidos (id, tipo, estado, subtotal, total, metodo_pago) VALUES (8001, 'pos', 'pagado', 3000, 3000, 'efectivo');
SELECT is((public.descontar_stock_pedido(8001, jsonb_build_array(
  jsonb_build_object('producto_id', 9001, 'cantidad', 2, 'precio_unitario', 1500, 'subtotal', 3000)), NULL)) ->> 'ok',
  'true', 'venta POS en efectivo');
SELECT is(pg_temp.saldo('1.1.01.03'), 3000.00::numeric, 'entra a la caja del POS');
SELECT is(pg_temp.saldo('4.4.02'), -3000.00::numeric, 'venta a no socios');
SELECT is(pg_temp.saldo('5.1.01'), 1300.00::numeric, 'costo promedio: 2 × 650');
SELECT is((SELECT costo_unitario_venta FROM public.pedido_items WHERE pedido_id = 8001), 650.00::numeric,
          'el ítem guarda el costo real de salida');
SELECT is((pg_temp.item(9001)).stock, 18, 'stock 20 − 2');

-- ---------- Venta online por transferencia con donación, a socio, gorras FIFO
INSERT INTO public.pedidos (id, tipo, estado, subtotal, total, metodo_pago, aplico_precio_socio, perfil_id)
VALUES (8002, 'online', 'pendiente_verificacion', 1400, 1600, 'transferencia', true, NULL);
INSERT INTO public.donaciones (pedido_id, monto) VALUES (8002, 200);
SELECT is((public.reservar_stock_pedido(8002, jsonb_build_array(
  jsonb_build_object('producto_id', 9002, 'cantidad', 6, 'precio_unitario', 700, 'subtotal', 4200)))) ->> 'ok',
  'true', 'reserva el stock del pedido online');
UPDATE public.pedidos SET stock_reservado = true WHERE id = 8002;
SELECT is((public.confirmar_reserva_pedido(8002, 'preparando', NULL)) ->> 'ok', 'true', 'aprueba la transferencia');
SELECT is(pg_temp.saldo('1.1.01.07'), 1600.00::numeric, 'entra al banco de la tienda');
SELECT is(pg_temp.saldo('2.1.05.01'), -200.00::numeric, 'la donación es deuda con la Olla, no ingreso');
SELECT is(pg_temp.saldo('4.4.01'), -1400.00::numeric, 'venta a socios neta de la donación');
SELECT is((SELECT sum(-valor) FROM comercial.movimientos WHERE origen_tipo = 'pedido' AND origen_id = '8002'),
          1900.00::numeric, 'FIFO: 5 a 300 + 1 a 400');

-- ---------- Encargue: seña al cobrar, venta al retirar
INSERT INTO public.pedidos (id, tipo, estado, subtotal, total, metodo_pago) VALUES (8003, 'online', 'pendiente_verificacion', 2000, 2000, 'transferencia');
DO $$ BEGIN
  PERFORM public.reservar_stock_pedido(8003, jsonb_build_array(
    jsonb_build_object('producto_id', 9001, 'cantidad', 1, 'precio_unitario', 2000, 'subtotal', 2000, 'es_encargue', true)));
  PERFORM public.confirmar_reserva_pedido(8003, 'encargado', NULL);
END $$;
SELECT is(pg_temp.saldo('2.1.04.03'), -2000.00::numeric, 'el encargue cobrado queda como seña');
UPDATE public.pedidos SET estado = 'retirado' WHERE id = 8003;
SELECT is(pg_temp.saldo('2.1.04.03'), 0.00::numeric, 'al retirarlo la seña se cancela');
SELECT is(pg_temp.saldo('4.4.02'), -5000.00::numeric, 'y pasa a venta');

-- ---------- Pago mixto en el POS
INSERT INTO public.pedidos (id, tipo, estado, subtotal, total, metodo_pago, monto_efectivo, monto_transferencia)
VALUES (8004, 'pos', 'pendiente_verificacion', 1500, 1500, 'mixto', 500, 1000);
DO $$ BEGIN
  PERFORM public.reservar_stock_pedido(8004, jsonb_build_array(
    jsonb_build_object('producto_id', 9001, 'cantidad', 1, 'precio_unitario', 1500, 'subtotal', 1500)));
END $$;
SELECT is(pg_temp.saldo('1.1.01.03'), 3500.00::numeric, 'el efectivo del mixto entra a caja al vender');
DO $$ BEGIN PERFORM public.confirmar_reserva_pedido(8004, 'preparando', NULL); END $$;
SELECT is(pg_temp.saldo('2.1.04.03'), 0.00::numeric, 'al aprobar, la seña del efectivo se aplica a la venta');
SELECT is(pg_temp.saldo('1.1.01.07'), 4600.00::numeric, 'y la transferencia entra al banco');

-- ---------- Pedido de disciplina
INSERT INTO public.disciplinas (id, nombre, slug) VALUES (9901, 'Rugby test', 'rugby-test');
DO $$ BEGIN PERFORM contabilidad.sincronizar_centros_disciplinas(); END $$;
INSERT INTO public.pedidos (id, tipo, estado, subtotal, total, metodo_pago, disciplina_id)
VALUES (8005, 'disciplina', 'pagado', 2200, 2200, 'cuenta_corriente', 9901);
DO $$ BEGIN
  PERFORM public.descontar_stock_pedido(8005, jsonb_build_array(
    jsonb_build_object('producto_id', 9003, 'variante_id', 9101, 'cantidad', 1, 'precio_unitario', 2200, 'subtotal', 2200)), NULL);
END $$;
SELECT is((SELECT sum(l.debe) FROM contabilidad.lineas l JOIN contabilidad.cuentas c ON c.id = l.cuenta_id
           WHERE c.codigo = '1.1.04.03' AND l.disciplina_id = 9901), 2200.00::numeric,
          'el pedido de disciplina va a su cuenta corriente');
SELECT throws_like($$ SELECT public.descontar_stock_pedido(8005, jsonb_build_array(
    jsonb_build_object('producto_id', 9003, 'cantidad', 1, 'precio_unitario', 1, 'subtotal', 1)), NULL) $$,
  '%tiene variantes%', 'un producto con talles no se vende sin talle');

-- ---------- Cancelación de una venta cobrada
CREATE TEMP TABLE antes AS SELECT (pg_temp.item(9002)).valor AS valor, (pg_temp.item(9002)).stock AS stock;
DO $$ BEGIN PERFORM public.cancelar_pedido(8002, 'Cliente se arrepintió', NULL); END $$;
SELECT is((pg_temp.item(9002)).stock, (SELECT stock + 6 FROM antes), 'la cancelación devuelve la mercadería');
SELECT is((pg_temp.item(9002)).valor, (SELECT valor + 1900 FROM antes), 'al mismo costo con que salió');
SELECT is(pg_temp.saldo('2.1.05.01'), 0.00::numeric, 'se revierte la donación');
SELECT is(pg_temp.saldo('4.4.01'), 0.00::numeric, 'y la venta');

-- ---------- Ajuste de stock (merma)
DO $$ BEGIN PERFORM comercial.ajustar_stock(9001, NULL, -1, 'Prenda dañada'); END $$;
SELECT cmp_ok(pg_temp.saldo('5.1.02'), '>', 0::numeric, 'la merma va a Ajustes y mermas');

-- ---------- Control: kardex = Mercadería (salvo el inventario inicial, que va en la apertura)
SELECT is((SELECT diferencia FROM comercial.control_mercaderia()),
          (SELECT sum(valor) FROM comercial.movimientos WHERE tipo = 'inventario_inicial')
          + (SELECT sum(valor) FROM comercial.movimientos WHERE origen_tipo = 'test'),
          'la diferencia con Mercadería es solo lo que entró sin asiento (inventario inicial)');
SELECT is((SELECT count(*) FROM comercial.movimientos WHERE asiento_id IS NULL
           AND origen_tipo NOT IN ('inventario_inicial', 'test')), 0::bigint,
          'todo movimiento de ventas y ajustes tiene asiento');

SELECT * FROM finish();
ROLLBACK;
