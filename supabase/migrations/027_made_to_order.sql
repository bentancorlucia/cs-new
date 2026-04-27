-- ============================================
-- Migración 027: Made-to-Order (MTO) — productos personalizables
-- ============================================
-- Permite que un producto se venda bajo encargue con campos personalizables
-- definidos por el admin (texto, número, select, talle), opcionalmente con
-- sobrecargo de precio y exclusividad para socios.
-- Modos de venta: solo stock (default), stock+MTO, solo MTO.

-- Productos: flags y configuración MTO
ALTER TABLE productos
  ADD COLUMN mto_disponible BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN mto_solo BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN mto_tiempo_fabricacion_dias INTEGER,
  ADD COLUMN mto_campos JSONB NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE productos
  ADD CONSTRAINT productos_mto_solo_requiere_disponible
  CHECK (NOT mto_solo OR mto_disponible);

CREATE INDEX productos_mto_idx
  ON productos(mto_disponible)
  WHERE mto_disponible = TRUE;

-- Pedido items: datos del encargue por línea
ALTER TABLE pedido_items
  ADD COLUMN es_encargue BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN personalizacion JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN precio_extra_personalizacion DECIMAL(10,2) NOT NULL DEFAULT 0;
