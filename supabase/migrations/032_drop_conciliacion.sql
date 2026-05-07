-- ============================================
-- Migración 032: Eliminar conciliación de tienda
-- Drop de tablas conciliaciones / conciliacion_items
-- y columnas asociadas en movimientos_financieros.
-- ============================================

DROP TABLE IF EXISTS conciliacion_items CASCADE;
DROP TABLE IF EXISTS conciliaciones CASCADE;

ALTER TABLE movimientos_financieros
  DROP COLUMN IF EXISTS conciliacion_id,
  DROP COLUMN IF EXISTS conciliado;
