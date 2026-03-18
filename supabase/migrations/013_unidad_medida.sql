-- ============================================
-- Migración 013: Unidad de medida en productos
-- Permite definir la unidad del producto (un, kg, lt, etc.)
-- ============================================

ALTER TABLE productos
  ADD COLUMN unidad VARCHAR(10) NOT NULL DEFAULT 'un'
  CHECK (unidad IN ('un', 'kg', 'lt', 'mt', 'par', 'docena'));
