-- ============================================
-- Migración 014: Depósitos y transferencias
-- Sistema multi-depósito para gestión de stock
-- ============================================

-- Depósitos
CREATE TABLE depositos (
  id SERIAL PRIMARY KEY,
  nombre VARCHAR(200) NOT NULL,
  descripcion TEXT,
  ubicacion VARCHAR(200),
  activo BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Seed: depósito principal para migrar stock existente
INSERT INTO depositos (nombre, descripcion)
VALUES ('Principal', 'Depósito principal del club');

-- Stock por depósito (stock desglosado por ubicación)
CREATE TABLE stock_deposito (
  id SERIAL PRIMARY KEY,
  producto_id INTEGER NOT NULL REFERENCES productos(id) ON DELETE CASCADE,
  variante_id INTEGER REFERENCES producto_variantes(id) ON DELETE CASCADE,
  deposito_id INTEGER NOT NULL REFERENCES depositos(id) ON DELETE CASCADE,
  cantidad INTEGER NOT NULL DEFAULT 0 CHECK (cantidad >= 0),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(producto_id, variante_id, deposito_id)
);

-- Migrar stock existente de productos (sin variante) al depósito principal
INSERT INTO stock_deposito (producto_id, variante_id, deposito_id, cantidad)
SELECT id, NULL, 1, stock_actual
FROM productos
WHERE stock_actual > 0;

-- Migrar stock de variantes al depósito principal
INSERT INTO stock_deposito (producto_id, variante_id, deposito_id, cantidad)
SELECT producto_id, id, 1, stock_actual
FROM producto_variantes
WHERE stock_actual > 0;

-- Transferencias entre depósitos
CREATE TABLE transferencias_deposito (
  id SERIAL PRIMARY KEY,
  deposito_origen_id INTEGER NOT NULL REFERENCES depositos(id),
  deposito_destino_id INTEGER NOT NULL REFERENCES depositos(id),
  estado VARCHAR(20) NOT NULL DEFAULT 'pendiente'
    CHECK (estado IN ('pendiente', 'completada', 'cancelada')),
  notas TEXT,
  registrado_por UUID REFERENCES perfiles(id),
  completada_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  CHECK (deposito_origen_id != deposito_destino_id)
);

CREATE TABLE transferencia_items (
  id SERIAL PRIMARY KEY,
  transferencia_id INTEGER NOT NULL REFERENCES transferencias_deposito(id) ON DELETE CASCADE,
  producto_id INTEGER NOT NULL REFERENCES productos(id),
  variante_id INTEGER REFERENCES producto_variantes(id),
  cantidad INTEGER NOT NULL CHECK (cantidad > 0)
);

-- Agregar deposito_id a stock_movimientos para trazabilidad
ALTER TABLE stock_movimientos
  ADD COLUMN deposito_id INTEGER REFERENCES depositos(id);

-- Migrar movimientos existentes al depósito principal
UPDATE stock_movimientos SET deposito_id = 1;

-- Actualizar CHECK de tipo para incluir 'transferencia'
ALTER TABLE stock_movimientos
  DROP CONSTRAINT stock_movimientos_tipo_check;
ALTER TABLE stock_movimientos
  ADD CONSTRAINT stock_movimientos_tipo_check
  CHECK (tipo IN ('entrada', 'salida', 'ajuste', 'venta', 'devolucion', 'transferencia'));

-- Función para recalcular stock total de un producto desde depósitos
CREATE OR REPLACE FUNCTION recalcular_stock_producto(p_producto_id INTEGER)
RETURNS void AS $$
BEGIN
  -- Recalcular stock de producto (sin variantes)
  UPDATE productos
  SET stock_actual = COALESCE((
    SELECT SUM(cantidad) FROM stock_deposito
    WHERE producto_id = p_producto_id AND variante_id IS NULL
  ), 0),
  updated_at = NOW()
  WHERE id = p_producto_id;

  -- Recalcular stock de cada variante
  UPDATE producto_variantes pv
  SET stock_actual = COALESCE((
    SELECT SUM(cantidad) FROM stock_deposito
    WHERE producto_id = p_producto_id AND variante_id = pv.id
  ), 0)
  WHERE pv.producto_id = p_producto_id;
END;
$$ LANGUAGE plpgsql;

-- Índices
CREATE INDEX idx_stock_deposito_producto ON stock_deposito(producto_id, deposito_id);
CREATE INDEX idx_stock_deposito_deposito ON stock_deposito(deposito_id);
CREATE INDEX idx_transferencias_estado ON transferencias_deposito(estado);
CREATE INDEX idx_transferencias_origen ON transferencias_deposito(deposito_origen_id);
CREATE INDEX idx_transferencias_destino ON transferencias_deposito(deposito_destino_id);

-- RLS
ALTER TABLE depositos ENABLE ROW LEVEL SECURITY;
ALTER TABLE stock_deposito ENABLE ROW LEVEL SECURITY;
ALTER TABLE transferencias_deposito ENABLE ROW LEVEL SECURITY;
ALTER TABLE transferencia_items ENABLE ROW LEVEL SECURITY;

-- Políticas: acceso para roles tienda y super_admin
CREATE POLICY "depositos_select" ON depositos FOR SELECT USING (true);
CREATE POLICY "depositos_all" ON depositos FOR ALL USING (
  tiene_algun_rol(ARRAY['super_admin', 'tienda'])
);

CREATE POLICY "stock_deposito_select" ON stock_deposito FOR SELECT USING (true);
CREATE POLICY "stock_deposito_all" ON stock_deposito FOR ALL USING (
  tiene_algun_rol(ARRAY['super_admin', 'tienda'])
);

CREATE POLICY "transferencias_select" ON transferencias_deposito FOR SELECT USING (true);
CREATE POLICY "transferencias_all" ON transferencias_deposito FOR ALL USING (
  tiene_algun_rol(ARRAY['super_admin', 'tienda'])
);

CREATE POLICY "transferencia_items_select" ON transferencia_items FOR SELECT USING (true);
CREATE POLICY "transferencia_items_all" ON transferencia_items FOR ALL USING (
  tiene_algun_rol(ARRAY['super_admin', 'tienda'])
);
