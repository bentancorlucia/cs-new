-- ============================================
-- Migración 043: Visibilidad separada web / POS
-- ============================================
-- `activo` pasa a significar "visible en la tienda web".
-- `activo_pos` controla si el producto aparece en el punto de venta físico,
-- de forma independiente (ej: producto que ya no se vende online pero sí
-- en el mostrador).

ALTER TABLE productos
  ADD COLUMN IF NOT EXISTS activo_pos BOOLEAN NOT NULL DEFAULT TRUE;

-- Mantener el comportamiento actual: lo que hoy está inactivo tampoco
-- aparecía en el POS.
UPDATE productos SET activo_pos = COALESCE(activo, TRUE);

COMMENT ON COLUMN productos.activo IS 'Visible en la tienda web';
COMMENT ON COLUMN productos.activo_pos IS 'Disponible en el punto de venta (POS)';
