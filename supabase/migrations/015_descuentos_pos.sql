-- ============================================
-- Migración 015: Descuentos en POS
-- Campos de descuento detallado en pedidos
-- ============================================

-- Detalle de descuento a nivel pedido
ALTER TABLE pedidos
  ADD COLUMN descuento_tipo VARCHAR(20)
    CHECK (descuento_tipo IN ('porcentaje', 'fijo', 'socio', 'lista_precio')),
  ADD COLUMN descuento_porcentaje DECIMAL(5,2),
  ADD COLUMN descuento_autorizado_por UUID REFERENCES perfiles(id),
  ADD COLUMN descuento_motivo TEXT;

-- Descuento por item
ALTER TABLE pedido_items
  ADD COLUMN descuento_unitario DECIMAL(10,2) DEFAULT 0,
  ADD COLUMN descuento_tipo VARCHAR(20)
    CHECK (descuento_tipo IN ('porcentaje', 'fijo', 'socio', 'lista_precio'));

-- PIN de autorización para descuentos (supervisores)
ALTER TABLE perfiles
  ADD COLUMN pin_autorizacion VARCHAR(6);
