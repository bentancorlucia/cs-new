-- Transferencia de donaciones a la Olla del Hogar.
BEGIN;
SELECT plan(5);

DO $$ BEGIN PERFORM contabilidad.crear_ejercicio(extract(year FROM contabilidad._hoy())::int); END $$;

INSERT INTO auth.users (id, instance_id, aud, role, email, raw_user_meta_data)
VALUES ('00000000-0000-0000-0000-0000000000d1', '00000000-0000-0000-0000-000000000000', 'authenticated',
        'authenticated', 'tienda-test@example.com', '{"nombre": "Tienda", "apellido": "Test"}');
INSERT INTO public.perfil_roles (perfil_id, rol_id)
SELECT '00000000-0000-0000-0000-0000000000d1', id FROM public.roles WHERE nombre = 'tienda';

INSERT INTO public.productos (id, nombre, slug, precio) VALUES (9501, 'Gorro', 'gorro-don-test', 500);
DO $$ BEGIN PERFORM comercial.cargar_inventario_inicial('[{"producto_id": 9501, "cantidad": 3, "costo_unitario": 200}]'); END $$;
INSERT INTO public.pedidos (id, tipo, estado, subtotal, total, metodo_pago) VALUES (8501, 'online', 'pendiente_verificacion', 500, 700, 'transferencia');
INSERT INTO public.donaciones (pedido_id, monto) VALUES (8501, 200);
DO $$ BEGIN
  PERFORM public.reservar_stock_pedido(8501, '[{"producto_id": 9501, "cantidad": 1, "precio_unitario": 500, "subtotal": 500}]');
  PERFORM public.confirmar_reserva_pedido(8501, 'preparando', NULL);
END $$;
UPDATE public.donaciones SET estado = 'cobrada', cobrada_at = now() WHERE pedido_id = 8501;

SELECT throws_like($$ SELECT * FROM public.registrar_transferencia_donaciones(contabilidad._hoy(), NULL, NULL, NULL) $$,
                   '%No autorizado%', 'sin un usuario con rol no se registra');
SELECT is((SELECT monto_total FROM public.registrar_transferencia_donaciones(contabilidad._hoy(), NULL, 'test',
             '00000000-0000-0000-0000-0000000000d1')), 200.00::numeric, 'registra la transferencia de lo cobrado');
SELECT is((SELECT estado FROM public.donaciones WHERE pedido_id = 8501), 'transferida', 'la donación queda transferida');
SELECT is((SELECT coalesce(sum(l.debe - l.haber), 0) FROM contabilidad.lineas l
           JOIN contabilidad.cuentas c ON c.id = l.cuenta_id WHERE c.codigo = '2.1.05.01'), 0.00::numeric,
          'la deuda con la Olla queda saldada');

SET LOCAL role authenticated;
SELECT throws_ok($$ SELECT * FROM public.registrar_transferencia_donaciones(current_date, NULL, NULL,
                    '00000000-0000-0000-0000-0000000000d1') $$, '42501', NULL,
                 'un usuario no la puede llamar por la API');
RESET role;

SELECT * FROM finish();
ROLLBACK;
