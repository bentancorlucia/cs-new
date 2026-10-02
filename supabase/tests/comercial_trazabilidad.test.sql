-- Stock con trazabilidad plena (migración 20261003220000).
BEGIN;
SELECT plan(18);

DO $$ BEGIN PERFORM contabilidad.crear_ejercicio(extract(year FROM contabilidad._hoy())::int); END $$;
CREATE FUNCTION pg_temp.item(p_prod int) RETURNS comercial.items LANGUAGE sql AS $$
  SELECT * FROM comercial.items WHERE producto_id = p_prod AND variante_id IS NULL
$$;

INSERT INTO auth.users (id, instance_id, aud, role, email, raw_user_meta_data)
VALUES ('00000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-000000000000', 'authenticated',
        'authenticated', 'pos-test@example.com', '{"nombre": "Pos", "apellido": "Test"}');

INSERT INTO public.productos (id, nombre, slug, precio) VALUES (9601, 'Bolso', 'bolso-traz-test', 1000);
DO $$ BEGIN PERFORM comercial.cargar_inventario_inicial('[{"producto_id": 9601, "cantidad": 10, "costo_unitario": 400}]'); END $$;

SELECT throws_like($$ SELECT comercial.cargar_inventario_inicial('[{"producto_id": 9601, "cantidad": 1, "costo_unitario": 1}]') $$,
                   '%recuento%', 'el inventario inicial se carga una sola vez');
SELECT throws_like($$ UPDATE comercial.items SET stock = 99 WHERE producto_id = 9601 $$,
                   '%sin un movimiento en el kardex%', 'el stock no cambia sin movimiento, ni siquiera por SQL directo');
SELECT is((SELECT count(*) FROM pg_proc WHERE proname = 'ajustar_stock'), 0::bigint, 'ya no existe el ajuste libre de stock');

-- Quién opera: la ruta usa service role y pasa p_registrado_por
DO $$ BEGIN PERFORM comercial.abrir_caja((SELECT id FROM comercial.cajas LIMIT 1), 0); END $$;
INSERT INTO public.pedidos (id, tipo, estado, subtotal, total, metodo_pago) VALUES (8601, 'pos', 'pagado', 1000, 1000, 'efectivo');
DO $$ BEGIN PERFORM public.descontar_stock_pedido(8601, '[{"producto_id": 9601, "cantidad": 1, "precio_unitario": 1000, "subtotal": 1000}]',
  '00000000-0000-0000-0000-0000000000e1'); END $$;
SELECT is((SELECT creado_por FROM comercial.movimientos WHERE origen_tipo = 'pedido' AND origen_id = '8601'),
          '00000000-0000-0000-0000-0000000000e1'::uuid, 'el kardex registra quién vendió');
SELECT is((SELECT creado_por FROM contabilidad.asientos WHERE origen_tipo = 'pedido_venta' AND origen_id = '8601'),
          '00000000-0000-0000-0000-0000000000e1'::uuid, 'y el asiento también');

-- Baja tipificada
SELECT throws_ok($$ SELECT comercial.registrar_baja('cualquiera', 'Algo que pasó', '[{"producto_id": 9601, "cantidad": 1}]') $$,
                 '23514', NULL, 'la baja tiene un tipo de la lista');
CREATE TEMP TABLE b AS SELECT comercial.registrar_baja('uso_interno', 'Bolso para el plantel de rugby',
  '[{"producto_id": 9601, "cantidad": 2}]') AS id;
SELECT is((pg_temp.item(9601)).stock, 7, 'la baja saca el stock');
SELECT isnt((SELECT asiento_id FROM comercial.bajas WHERE id = (SELECT id FROM b)), NULL, 'con su asiento');
SELECT is((SELECT motivo FROM comercial.movimientos WHERE origen_tipo = 'baja' AND origen_id = (SELECT id FROM b)::text),
          'Uso Interno: Bolso para el plantel de rugby', 'y el motivo en el kardex');

-- Recuento físico: se cuentan 5 (faltan 2)
CREATE TEMP TABLE r AS SELECT comercial.guardar_recuento(NULL, '[{"producto_id": 9601, "contado": 4}]', 'Recuento de octubre') AS id;
DO $$ BEGIN PERFORM comercial.guardar_recuento((SELECT id FROM r), '[{"producto_id": 9601, "contado": 5}]'); END $$;
SELECT is((SELECT contado FROM comercial.recuento_items WHERE recuento_id = (SELECT id FROM r)), 5, 'el borrador se corrige');
SELECT is((comercial.confirmar_recuento((SELECT id FROM r)) ->> 'faltante')::numeric, 800.00::numeric,
          'al confirmar registra el faltante (2 × 400)');
SELECT is((pg_temp.item(9601)).stock, 5, 'el stock queda en lo contado');
SELECT throws_like($$ SELECT comercial.guardar_recuento((SELECT id FROM r), '[{"producto_id": 9601, "contado": 9}]') $$,
                   '%borrador%', 'un recuento confirmado no se edita');

-- Producto con stock anterior al motor (sin ítem) y sobrante sin costo
INSERT INTO public.productos (id, nombre, slug, precio) VALUES (9602, 'Termo', 'termo-traz-test', 900);
SET LOCAL comercial.sincronizando = 'on';
UPDATE public.productos SET stock_actual = 7 WHERE id = 9602;
RESET comercial.sincronizando;
SELECT throws_like($$ SELECT comercial.guardar_recuento(NULL, '[{"producto_id": 9602, "contado": 7}]') $$,
                   '%stock sin registrar%', 'el stock viejo no entra solo al kardex');
SELECT is(comercial.cargar_inventario_inicial('[{"producto_id": 9602, "cantidad": 5, "costo_unitario": 300}]'), 1,
          'el inventario inicial del corte lo carga con cantidad y costo reales');
SELECT is((SELECT stock_actual FROM public.productos WHERE id = 9602), 5, 'y reemplaza al stock viejo');

INSERT INTO public.productos (id, nombre, slug, precio) VALUES (9603, 'Pin', 'pin-traz-test', 100);
CREATE TEMP TABLE r2 AS SELECT comercial.guardar_recuento(NULL, '[{"producto_id": 9603, "contado": 3}]') AS id;
SELECT throws_like($$ SELECT comercial.confirmar_recuento((SELECT id FROM r2)) $$,
                   '%No hay costo%', 'un sobrante sin costo conocido no entra a $0');

-- Todo el kardex queda explicado por documentos
SELECT is((SELECT count(*) FROM comercial.movimientos m WHERE m.item_id = (pg_temp.item(9601)).id
           AND m.tipo NOT IN ('inventario_inicial') AND m.asiento_id IS NULL), 0::bigint,
          'cada movimiento (menos el inventario inicial) tiene su asiento');

SELECT * FROM finish();
ROLLBACK;
