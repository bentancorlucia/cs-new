-- ============================================
-- Migración 040: Precio Promedio Ponderado (PPP)
-- ============================================
-- Persiste costo promedio ponderado en productos/variantes (recalculado al
-- recibir compras) y snapshot del PPP en pedido_items al crear el pedido,
-- para que márgenes históricos no se distorsionen ante cambios futuros de costo.

-- Columnas nullables: NULL = sin datos de costo. Sin DEFAULT para que el
-- trigger BEFORE INSERT pueda distinguir "no especificado" de "explícitamente 0".
ALTER TABLE productos
  ADD COLUMN IF NOT EXISTS costo_promedio DECIMAL(10,2);

ALTER TABLE producto_variantes
  ADD COLUMN IF NOT EXISTS costo_promedio DECIMAL(10,2);

ALTER TABLE pedido_items
  ADD COLUMN IF NOT EXISTS costo_unitario_venta DECIMAL(10,2);

-- Índices para acelerar reportes por rango de fechas
CREATE INDEX IF NOT EXISTS idx_pedidos_created_at ON pedidos(created_at);
CREATE INDEX IF NOT EXISTS idx_pedido_items_pedido_id ON pedido_items(pedido_id);

-- ============================================
-- Función: recalcular_costo_promedio
-- ============================================
-- Recalcula PPP de un producto/variante a partir de compra_items en
-- compras_proveedor con estado='recibida' y cantidad_recibida > 0.
-- Si no hay compras recibidas, deja la columna NULL (sin datos).
CREATE OR REPLACE FUNCTION recalcular_costo_promedio(
  p_producto_id INTEGER,
  p_variante_id INTEGER DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
AS $$
DECLARE
  v_ppp DECIMAL(10,2);
BEGIN
  SELECT SUM(ci.cantidad_recibida * ci.costo_unitario)::DECIMAL
         / NULLIF(SUM(ci.cantidad_recibida), 0)
  INTO v_ppp
  FROM compra_items ci
  JOIN compras_proveedor cp ON cp.id = ci.compra_id
  WHERE cp.estado = 'recibida'
    AND ci.cantidad_recibida > 0
    AND ci.producto_id = p_producto_id
    AND (
      (p_variante_id IS NULL AND ci.variante_id IS NULL)
      OR ci.variante_id = p_variante_id
    );

  IF v_ppp IS NULL THEN
    RETURN;
  END IF;

  IF p_variante_id IS NULL THEN
    UPDATE productos
       SET costo_promedio = v_ppp,
           updated_at = NOW()
     WHERE id = p_producto_id;
  ELSE
    UPDATE producto_variantes
       SET costo_promedio = v_ppp
     WHERE id = p_variante_id;
  END IF;
END;
$$;

-- ============================================
-- Trigger: actualizar PPP al recibir una compra
-- ============================================
CREATE OR REPLACE FUNCTION trg_fn_compra_recibida_actualiza_ppp()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  r RECORD;
BEGIN
  IF NEW.estado = 'recibida'
     AND (OLD.estado IS DISTINCT FROM 'recibida') THEN
    FOR r IN
      SELECT DISTINCT producto_id, variante_id
        FROM compra_items
       WHERE compra_id = NEW.id
         AND cantidad_recibida > 0
    LOOP
      PERFORM recalcular_costo_promedio(r.producto_id, r.variante_id);
    END LOOP;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_compra_recibida_actualiza_ppp ON compras_proveedor;
CREATE TRIGGER trg_compra_recibida_actualiza_ppp
  AFTER UPDATE OF estado ON compras_proveedor
  FOR EACH ROW
  EXECUTE FUNCTION trg_fn_compra_recibida_actualiza_ppp();

-- ============================================
-- Trigger: snapshot del PPP al crear pedido_item
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

  IF NEW.variante_id IS NOT NULL THEN
    SELECT pv.costo_promedio
      INTO v_costo
      FROM producto_variantes pv
     WHERE pv.id = NEW.variante_id;
  END IF;

  IF v_costo IS NULL THEN
    SELECT p.costo_promedio
      INTO v_costo
      FROM productos p
     WHERE p.id = NEW.producto_id;
  END IF;

  NEW.costo_unitario_venta := v_costo; -- Puede quedar NULL si no hay datos
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_pedido_item_snapshot_costo ON pedido_items;
CREATE TRIGGER trg_pedido_item_snapshot_costo
  BEFORE INSERT ON pedido_items
  FOR EACH ROW
  EXECUTE FUNCTION trg_fn_pedido_item_snapshot_costo();

-- ============================================
-- Backfill (idempotente)
-- ============================================
-- 1. Recalcular PPP de productos/variantes con historial de compras recibidas
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT DISTINCT ci.producto_id, ci.variante_id
      FROM compra_items ci
      JOIN compras_proveedor cp ON cp.id = ci.compra_id
     WHERE cp.estado = 'recibida'
       AND ci.cantidad_recibida > 0
  LOOP
    PERFORM recalcular_costo_promedio(r.producto_id, r.variante_id);
  END LOOP;
END $$;

-- 2. Backfill pedido_items históricos.
-- NOTA: pedidos anteriores a esta migración NO tienen costo histórico exacto;
-- usamos el PPP actual del producto/variante como mejor estimación disponible.
-- Los reportes informan esto cuando el rango incluye fechas previas.
UPDATE pedido_items pi
   SET costo_unitario_venta = COALESCE(
     (SELECT pv.costo_promedio
        FROM producto_variantes pv
       WHERE pv.id = pi.variante_id),
     (SELECT p.costo_promedio
        FROM productos p
       WHERE p.id = pi.producto_id)
   )
 WHERE pi.costo_unitario_venta IS NULL;

COMMENT ON COLUMN productos.costo_promedio IS
  'Precio Promedio Ponderado actual. Recalculado por trigger al recibir compras. NULL = sin datos.';
COMMENT ON COLUMN producto_variantes.costo_promedio IS
  'PPP de la variante. Tiene prioridad sobre productos.costo_promedio si está seteado.';
COMMENT ON COLUMN pedido_items.costo_unitario_venta IS
  'Snapshot del PPP al momento de crear el item. Base para cálculo de margen.';
