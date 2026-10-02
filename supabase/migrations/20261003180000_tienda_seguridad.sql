-- ============================================================
-- Tienda — cierre de huecos de seguridad (inventario 2026-10-03)
--
-- 1. Pedidos e ítems solo se crean desde el servidor (checkout, POS y
--    pedidos de disciplina usan service role o funciones SECURITY
--    DEFINER). Hoy un usuario logueado podía insertar un pedido propio
--    con cualquier estado o total, y cualquiera (anónimo incluido)
--    insertar ítems en cualquier pedido.
-- 2. El costo deja de estar en productos/variantes (legible por
--    anónimos): vive en comercial.items. El último costo conocido se
--    guarda como sugerencia para el inventario inicial del corte.
-- 3. Listas de precio mayoristas, depósitos y promocodes vigentes dejan
--    de ser públicos.
-- 4. Bucket productos: escriben solo tienda y super_admin.
-- 5. Funciones de mantenimiento que podía ejecutar cualquiera.
-- ============================================================

-- 1. Pedidos -------------------------------------------------
DROP POLICY "Insertar items de pedido" ON public.pedido_items;
DROP POLICY "Usuarios crean pedidos" ON public.pedidos;
CREATE POLICY "Tienda crea pedidos" ON public.pedidos
  FOR INSERT TO authenticated WITH CHECK (public.tiene_algun_rol(ARRAY['super_admin', 'tienda']));
REVOKE INSERT, UPDATE, DELETE ON public.pedidos, public.pedido_items FROM anon;
REVOKE INSERT, UPDATE, DELETE ON public.pedido_items FROM authenticated;

-- 2. Costo fuera del catálogo público --------------------------
-- El último costo conocido queda como sugerencia para cargar el
-- inventario inicial del corte (lo hace el tesorero con cantidad y costo
-- reales; el stock viejo no entra solo al kardex).
CREATE TABLE IF NOT EXISTS comercial.costos_previos (
  producto_id integer NOT NULL REFERENCES public.productos (id) ON DELETE CASCADE,
  variante_id integer REFERENCES public.producto_variantes (id) ON DELETE CASCADE,
  costo numeric(18, 6) NOT NULL CHECK (costo >= 0)
);
INSERT INTO comercial.costos_previos (producto_id, variante_id, costo)
SELECT v.producto_id, v.id, coalesce(v.costo_promedio, p.costo_promedio)
FROM public.producto_variantes v JOIN public.productos p ON p.id = v.producto_id
WHERE coalesce(v.costo_promedio, p.costo_promedio) IS NOT NULL
UNION ALL
SELECT p.id, NULL, p.costo_promedio FROM public.productos p
WHERE p.costo_promedio IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM public.producto_variantes v WHERE v.producto_id = p.id);

UPDATE public.productos SET costo_promedio = NULL WHERE costo_promedio IS NOT NULL;
UPDATE public.producto_variantes SET costo_promedio = NULL WHERE costo_promedio IS NOT NULL;

-- Código viejo que todavía lo escriba (recepción de compras vieja,
-- recalcular_costo_promedio) no vuelve a exponerlo.
CREATE FUNCTION comercial._costo_fuera_del_catalogo() RETURNS trigger
LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  NEW.costo_promedio := NULL;
  RETURN NEW;
END;
$$;
CREATE TRIGGER productos_sin_costo BEFORE INSERT OR UPDATE OF costo_promedio ON public.productos
  FOR EACH ROW EXECUTE FUNCTION comercial._costo_fuera_del_catalogo();
CREATE TRIGGER variantes_sin_costo BEFORE INSERT OR UPDATE OF costo_promedio ON public.producto_variantes
  FOR EACH ROW EXECUTE FUNCTION comercial._costo_fuera_del_catalogo();

-- El snapshot de costo al insertar un ítem de pedido ya no tiene de dónde
-- leer el promedio: el costo real lo fija el motor al descontar el stock.
DROP TRIGGER trg_pedido_item_snapshot_costo ON public.pedido_items;

-- 3. Catálogos internos fuera del alcance público --------------
DROP POLICY "listas_precio_select" ON public.listas_precio;
DROP POLICY "lista_precio_items_select" ON public.lista_precio_items;
DROP POLICY "lista_precio_disciplinas_select" ON public.lista_precio_disciplinas;
CREATE POLICY "Staff ve listas de precio" ON public.listas_precio
  FOR SELECT TO authenticated USING (public.tiene_algun_rol(ARRAY['super_admin', 'tienda', 'tesorero']));
CREATE POLICY "Staff ve items de listas de precio" ON public.lista_precio_items
  FOR SELECT TO authenticated USING (public.tiene_algun_rol(ARRAY['super_admin', 'tienda', 'tesorero']));
CREATE POLICY "Staff ve disciplinas de listas de precio" ON public.lista_precio_disciplinas
  FOR SELECT TO authenticated USING (public.tiene_algun_rol(ARRAY['super_admin', 'tienda', 'tesorero']));

DROP POLICY "depositos_select" ON public.depositos;
DROP POLICY "stock_deposito_select" ON public.stock_deposito;
DROP POLICY "transferencias_select" ON public.transferencias_deposito;
DROP POLICY "transferencia_items_select" ON public.transferencia_items;

DROP POLICY "promocodes lectura validacion vigentes" ON public.promocodes;

-- 4. Bucket productos ------------------------------------------
DROP POLICY productos_staff_insert ON storage.objects;
DROP POLICY productos_staff_update ON storage.objects;
DROP POLICY productos_staff_delete ON storage.objects;
CREATE POLICY productos_staff_insert ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'productos' AND EXISTS (
    SELECT 1 FROM public.perfil_roles pr JOIN public.roles r ON r.id = pr.rol_id
    WHERE pr.perfil_id = auth.uid() AND r.nombre IN ('super_admin', 'tienda')));
CREATE POLICY productos_staff_update ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'productos' AND EXISTS (
    SELECT 1 FROM public.perfil_roles pr JOIN public.roles r ON r.id = pr.rol_id
    WHERE pr.perfil_id = auth.uid() AND r.nombre IN ('super_admin', 'tienda')));
CREATE POLICY productos_staff_delete ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'productos' AND EXISTS (
    SELECT 1 FROM public.perfil_roles pr JOIN public.roles r ON r.id = pr.rol_id
    WHERE pr.perfil_id = auth.uid() AND r.nombre IN ('super_admin', 'tienda')));

-- 5. Funciones de mantenimiento ---------------------------------
REVOKE EXECUTE ON FUNCTION public.recalcular_costo_promedio(integer, integer) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.recalcular_stock_producto(integer) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.actualizar_saldo_cuenta_rpc(integer, numeric) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.incrementar_stock_item(integer, integer, integer) FROM PUBLIC, anon, authenticated;
