-- ============================================
-- Migración 012: Agregar moneda a presupuestos
-- Permite definir presupuestos en UYU o USD
-- ============================================

-- Agregar columna moneda con default UYU (todos los existentes quedan en UYU)
ALTER TABLE presupuestos
  ADD COLUMN moneda VARCHAR(3) NOT NULL DEFAULT 'UYU'
  CHECK (moneda IN ('UYU', 'USD'));
