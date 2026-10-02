-- Huecos de seguridad de la tienda cerrados (migración 20261003180000).
BEGIN;
SELECT plan(6);

INSERT INTO public.productos (id, nombre, slug, precio, costo_promedio) VALUES (9401, 'Media', 'media-seg-test', 300, 120);
INSERT INTO public.pedidos (id, tipo, estado, subtotal, total) VALUES (8401, 'online', 'pendiente_verificacion', 300, 300);
INSERT INTO public.listas_precio (id, nombre) VALUES (9401, 'Mayorista test');

SELECT is((SELECT costo_promedio FROM public.productos WHERE id = 9401), NULL::numeric,
          'el costo no queda en el catálogo público');

-- Anónimo
SET LOCAL role anon;
SELECT set_config('request.jwt.claims', '{"role":"anon"}', true);
SELECT throws_ok($$ INSERT INTO public.pedido_items (pedido_id, producto_id, cantidad, precio_unitario, subtotal)
                    VALUES (8401, 9401, 1, 1, 1) $$, '42501', NULL, 'un anónimo no inserta ítems en pedidos');
SELECT is((SELECT count(*) FROM public.listas_precio WHERE id = 9401), 0::bigint, 'las listas mayoristas no son públicas');
SELECT is((SELECT count(*) FROM public.productos WHERE id = 9401), 1::bigint, 'el catálogo sigue siendo público');
RESET role;

-- Usuario logueado sin rol de tienda
SET LOCAL role authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000009","role":"authenticated"}', true);
SELECT throws_ok($$ INSERT INTO public.pedidos (tipo, estado, subtotal, total, perfil_id)
                    VALUES ('online', 'pagado', 1, 1, '00000000-0000-0000-0000-000000000009') $$,
                 '42501', NULL, 'un usuario no crea pedidos directo en la base');
SELECT throws_ok($$ INSERT INTO public.pedido_items (pedido_id, producto_id, cantidad, precio_unitario, subtotal)
                    VALUES (8401, 9401, 1, 1, 1) $$, '42501', NULL, 'ni ítems');
RESET role;

SELECT * FROM finish();
ROLLBACK;
