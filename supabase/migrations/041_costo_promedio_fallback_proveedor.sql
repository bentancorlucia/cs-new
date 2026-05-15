-- ============================================
-- Migración 041: Fallback de costo al proveedor
-- ============================================
-- Cuando un producto no tiene compras recibidas (no hay PPP), igual queremos
-- contar el costo en los reportes. Como fallback usamos producto_proveedores.costo
-- del proveedor principal (es_principal = true) o, si no hay principal, el
-- proveedor más reciente con costo no nulo.

-- ============================================
-- Helper: costo de fallback por proveedor
-- ============================================
CREATE OR REPLACE FUNCTION costo_proveedor_fallback(p_producto_id INTEGER)
RETURNS DECIMAL(10,2)
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_costo DECIMAL(10,2);
BEGIN
  -- 1) Proveedor principal con costo no nulo
  SELECT pp.costo
    INTO v_costo
    FROM producto_proveedores pp
   WHERE pp.producto_id = p_producto_id
     AND pp.es_principal = TRUE
     AND pp.costo IS NOT NULL
   LIMIT 1;

  -- 2) Cualquier proveedor con costo no nulo, el más reciente cargado
  IF v_costo IS NULL THEN
    SELECT pp.costo
      INTO v_costo
      FROM producto_proveedores pp
     WHERE pp.producto_id = p_producto_id
       AND pp.costo IS NOT NULL
     ORDER BY pp.created_at DESC NULLS LAST, pp.id DESC
     LIMIT 1;
  END IF;

  RETURN v_costo;
END;
$$;

-- ============================================
-- Actualizar trigger snapshot: agregar fallback al proveedor
-- ============================================
CREATE OR REPLACE FUNCTION trg_fn_pedido_item_snapshot_costo()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_costo DECIMAL(10,2);
BEGIN
  -- Solo actúa si no se especificó costo explícito.
  IF NEW.costo_unitario_venta IS NOT NULL THEN
    RETURN NEW;
  END IF;

  -- 1) PPP de la variante
  IF NEW.variante_id IS NOT NULL THEN
    SELECT pv.costo_promedio
      INTO v_costo
      FROM producto_variantes pv
     WHERE pv.id = NEW.variante_id;
  END IF;

  -- 2) PPP del producto
  IF v_costo IS NULL THEN
    SELECT p.costo_promedio
      INTO v_costo
      FROM productos p
     WHERE p.id = NEW.producto_id;
  END IF;

  -- 3) Fallback: costo del proveedor principal
  IF v_costo IS NULL THEN
    v_costo := costo_proveedor_fallback(NEW.producto_id);
  END IF;

  NEW.costo_unitario_venta := v_costo;
  RETURN NEW;
END;
$$;

-- (El trigger BEFORE INSERT ya está creado en 040, solo lo recreamos para tomar la nueva versión)
DROP TRIGGER IF EXISTS trg_pedido_item_snapshot_costo ON pedido_items;
CREATE TRIGGER trg_pedido_item_snapshot_costo
  BEFORE INSERT ON pedido_items
  FOR EACH ROW
  EXECUTE FUNCTION trg_fn_pedido_item_snapshot_costo();

-- ============================================
-- Backfill productos.costo_promedio con costo del proveedor (cuando aún es NULL)
-- ============================================
UPDATE productos p
   SET costo_promedio = costo_proveedor_fallback(p.id)
 WHERE p.costo_promedio IS NULL
   AND costo_proveedor_fallback(p.id) IS NOT NULL;

-- ============================================
-- Re-backfill de pedido_items que quedaron sin costo
-- ============================================
UPDATE pedido_items pi
   SET costo_unitario_venta = COALESCE(
     (SELECT pv.costo_promedio
        FROM producto_variantes pv
       WHERE pv.id = pi.variante_id),
     (SELECT p.costo_promedio
        FROM productos p
       WHERE p.id = pi.producto_id),
     costo_proveedor_fallback(pi.producto_id)
   )
 WHERE pi.costo_unitario_venta IS NULL;

COMMENT ON FUNCTION costo_proveedor_fallback(INTEGER) IS
  'Retorna producto_proveedores.costo del principal (o el más reciente con costo) como fallback cuando no hay PPP.';
