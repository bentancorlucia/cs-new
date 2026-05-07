-- ============================================
-- Migración 034: Reconstrucción del módulo Tesorería
-- Extiende cuentas_financieras y movimientos_financieros,
-- recrea transferencias_internas y presupuestos (con períodos flexibles),
-- agrega cotizaciones_bcu y extractos_importados.
-- Conserva la integración con tienda (modulo='tienda').
-- ============================================

-- =====================
-- 1. EXTENSIONES A TABLAS EXISTENTES
-- =====================

-- 1.1 cuentas_financieras
ALTER TABLE cuentas_financieras
  ADD COLUMN IF NOT EXISTS titular VARCHAR(200),
  ADD COLUMN IF NOT EXISTS incluir_en_tesoreria BOOLEAN NOT NULL DEFAULT TRUE;

-- 1.2 movimientos_financieros
ALTER TABLE movimientos_financieros
  ADD COLUMN IF NOT EXISTS nombre VARCHAR(200),
  ADD COLUMN IF NOT EXISTS clasificado BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS extracto_id INTEGER,
  ADD COLUMN IF NOT EXISTS hash_dedupe TEXT;

-- Permitir categoría null en movimientos importados (clasificación posterior)
ALTER TABLE movimientos_financieros
  ALTER COLUMN categoria_id DROP NOT NULL;

-- Movimientos ya con categoría y descripción de origen automático cuentan como clasificados
UPDATE movimientos_financieros
SET clasificado = TRUE
WHERE clasificado = FALSE AND categoria_id IS NOT NULL;

-- =====================
-- 2. TABLAS NUEVAS
-- =====================

-- 2.1 cotizaciones_bcu — snapshot diario UYU/USD
CREATE TABLE IF NOT EXISTS cotizaciones_bcu (
  id SERIAL PRIMARY KEY,
  fecha DATE NOT NULL UNIQUE,
  moneda VARCHAR(3) NOT NULL DEFAULT 'USD',
  compra DECIMAL(10,4) NOT NULL,
  venta DECIMAL(10,4) NOT NULL,
  fuente VARCHAR(50) NOT NULL DEFAULT 'bcu',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_cotizaciones_bcu_fecha ON cotizaciones_bcu(fecha DESC);

-- 2.2 extractos_importados — auditoría de imports CSV
CREATE TABLE IF NOT EXISTS extractos_importados (
  id SERIAL PRIMARY KEY,
  cuenta_id INTEGER NOT NULL REFERENCES cuentas_financieras(id) ON DELETE CASCADE,
  archivo_nombre VARCHAR(255) NOT NULL,
  archivo_hash TEXT NOT NULL,
  formato VARCHAR(30) NOT NULL DEFAULT 'itau',
  fecha_desde DATE,
  fecha_hasta DATE,
  total_movimientos INTEGER NOT NULL DEFAULT 0,
  movimientos_creados INTEGER NOT NULL DEFAULT 0,
  movimientos_duplicados INTEGER NOT NULL DEFAULT 0,
  saldo_inicial_extracto DECIMAL(14,2),
  saldo_final_extracto DECIMAL(14,2),
  importado_por UUID REFERENCES perfiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_extractos_cuenta ON extractos_importados(cuenta_id, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS idx_extractos_archivo_hash ON extractos_importados(cuenta_id, archivo_hash);

-- FK movimientos.extracto_id → extractos_importados
ALTER TABLE movimientos_financieros
  ADD CONSTRAINT fk_movimientos_extracto
    FOREIGN KEY (extracto_id) REFERENCES extractos_importados(id) ON DELETE SET NULL;

-- Índice único parcial para deduplicación
CREATE UNIQUE INDEX IF NOT EXISTS idx_movimientos_hash_dedupe
  ON movimientos_financieros(cuenta_id, hash_dedupe)
  WHERE hash_dedupe IS NOT NULL;

-- 2.3 presupuestos — períodos flexibles
CREATE TABLE IF NOT EXISTS presupuestos (
  id SERIAL PRIMARY KEY,
  tipo_periodo VARCHAR(20) NOT NULL
    CHECK (tipo_periodo IN ('anual', 'semestral', 'cuatrimestral', 'trimestral', 'mensual')),
  anio INTEGER NOT NULL,
  periodo_numero INTEGER NOT NULL CHECK (periodo_numero BETWEEN 1 AND 12),
  fecha_desde DATE NOT NULL,
  fecha_hasta DATE NOT NULL,
  categoria_id INTEGER NOT NULL REFERENCES categorias_financieras(id) ON DELETE CASCADE,
  monto DECIMAL(14,2) NOT NULL CHECK (monto >= 0),
  moneda VARCHAR(3) NOT NULL DEFAULT 'UYU' CHECK (moneda IN ('UYU', 'USD')),
  notas TEXT,
  creado_por UUID REFERENCES perfiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(tipo_periodo, anio, periodo_numero, categoria_id, moneda)
);

CREATE INDEX IF NOT EXISTS idx_presupuestos_periodo ON presupuestos(anio, tipo_periodo, periodo_numero);
CREATE INDEX IF NOT EXISTS idx_presupuestos_categoria ON presupuestos(categoria_id);
CREATE INDEX IF NOT EXISTS idx_presupuestos_fechas ON presupuestos(fecha_desde, fecha_hasta);

-- 2.4 transferencias_internas — recrear
CREATE TABLE IF NOT EXISTS transferencias_internas (
  id SERIAL PRIMARY KEY,
  cuenta_origen_id INTEGER NOT NULL REFERENCES cuentas_financieras(id),
  cuenta_destino_id INTEGER NOT NULL REFERENCES cuentas_financieras(id),
  fecha DATE NOT NULL,
  monto_origen DECIMAL(14,2) NOT NULL CHECK (monto_origen > 0),
  moneda_origen VARCHAR(3) NOT NULL CHECK (moneda_origen IN ('UYU', 'USD')),
  monto_destino DECIMAL(14,2) NOT NULL CHECK (monto_destino > 0),
  moneda_destino VARCHAR(3) NOT NULL CHECK (moneda_destino IN ('UYU', 'USD')),
  tipo_cambio DECIMAL(10,4),
  descripcion VARCHAR(500),
  movimiento_egreso_id INTEGER REFERENCES movimientos_financieros(id),
  movimiento_ingreso_id INTEGER REFERENCES movimientos_financieros(id),
  registrado_por UUID REFERENCES perfiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (cuenta_origen_id <> cuenta_destino_id)
);

CREATE INDEX IF NOT EXISTS idx_transferencias_fecha ON transferencias_internas(fecha DESC);
CREATE INDEX IF NOT EXISTS idx_transferencias_origen ON transferencias_internas(cuenta_origen_id);
CREATE INDEX IF NOT EXISTS idx_transferencias_destino ON transferencias_internas(cuenta_destino_id);

-- =====================
-- 3. TRIGGERS
-- =====================

-- updated_at en presupuestos
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_presupuestos_updated_at ON presupuestos;
CREATE TRIGGER trg_presupuestos_updated_at
  BEFORE UPDATE ON presupuestos
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- =====================
-- 4. ROW LEVEL SECURITY
-- =====================

ALTER TABLE cotizaciones_bcu ENABLE ROW LEVEL SECURITY;
ALTER TABLE extractos_importados ENABLE ROW LEVEL SECURITY;
ALTER TABLE presupuestos ENABLE ROW LEVEL SECURITY;
ALTER TABLE transferencias_internas ENABLE ROW LEVEL SECURITY;

-- 4.1 cotizaciones_bcu: lectura abierta a roles staff (todos consultan), escritura a tesorero/super_admin
CREATE POLICY "Cotizaciones: lectura staff"
  ON cotizaciones_bcu FOR SELECT
  USING (
    tiene_algun_rol(ARRAY['super_admin', 'tesorero', 'tienda', 'secretaria', 'eventos'])
  );

CREATE POLICY "Cotizaciones: escritura tesorero"
  ON cotizaciones_bcu FOR INSERT
  WITH CHECK (tiene_algun_rol(ARRAY['super_admin', 'tesorero']));

CREATE POLICY "Cotizaciones: actualizar tesorero"
  ON cotizaciones_bcu FOR UPDATE
  USING (tiene_algun_rol(ARRAY['super_admin', 'tesorero']))
  WITH CHECK (tiene_algun_rol(ARRAY['super_admin', 'tesorero']));

-- 4.2 extractos_importados
CREATE POLICY "Extractos: lectura tesorero"
  ON extractos_importados FOR SELECT
  USING (tiene_algun_rol(ARRAY['super_admin', 'tesorero']));

CREATE POLICY "Extractos: crear tesorero"
  ON extractos_importados FOR INSERT
  WITH CHECK (tiene_algun_rol(ARRAY['super_admin', 'tesorero']));

CREATE POLICY "Extractos: eliminar tesorero"
  ON extractos_importados FOR DELETE
  USING (tiene_algun_rol(ARRAY['super_admin', 'tesorero']));

-- 4.3 presupuestos
CREATE POLICY "Presupuestos: lectura tesorero"
  ON presupuestos FOR SELECT
  USING (tiene_algun_rol(ARRAY['super_admin', 'tesorero']));

CREATE POLICY "Presupuestos: crear tesorero"
  ON presupuestos FOR INSERT
  WITH CHECK (tiene_algun_rol(ARRAY['super_admin', 'tesorero']));

CREATE POLICY "Presupuestos: actualizar tesorero"
  ON presupuestos FOR UPDATE
  USING (tiene_algun_rol(ARRAY['super_admin', 'tesorero']))
  WITH CHECK (tiene_algun_rol(ARRAY['super_admin', 'tesorero']));

CREATE POLICY "Presupuestos: eliminar tesorero"
  ON presupuestos FOR DELETE
  USING (tiene_algun_rol(ARRAY['super_admin', 'tesorero']));

-- 4.4 transferencias_internas
CREATE POLICY "Transferencias: lectura tesorero"
  ON transferencias_internas FOR SELECT
  USING (tiene_algun_rol(ARRAY['super_admin', 'tesorero']));

CREATE POLICY "Transferencias: crear tesorero"
  ON transferencias_internas FOR INSERT
  WITH CHECK (tiene_algun_rol(ARRAY['super_admin', 'tesorero']));

CREATE POLICY "Transferencias: actualizar tesorero"
  ON transferencias_internas FOR UPDATE
  USING (tiene_algun_rol(ARRAY['super_admin', 'tesorero']))
  WITH CHECK (tiene_algun_rol(ARRAY['super_admin', 'tesorero']));

CREATE POLICY "Transferencias: eliminar tesorero"
  ON transferencias_internas FOR DELETE
  USING (tiene_algun_rol(ARRAY['super_admin', 'tesorero']));

-- =====================
-- 5. SEED — Cuenta caja chica si no existe + asegurar nombres ITAÚ
-- =====================

-- Caja chica para tesorería si no existe ninguna caja chica todavía
INSERT INTO cuentas_financieras (nombre, tipo, moneda, modulo, incluir_en_tesoreria, descripcion, color, activa)
SELECT 'Caja chica', 'caja_chica', 'UYU', NULL, TRUE, 'Efectivo en caja del club', '#f7b643', TRUE
WHERE NOT EXISTS (
  SELECT 1 FROM cuentas_financieras WHERE tipo = 'caja_chica'
);

-- Cuentas ITAÚ placeholder si no existen (se editan luego desde la UI)
INSERT INTO cuentas_financieras (nombre, tipo, moneda, banco, modulo, incluir_en_tesoreria, descripcion, color, activa)
SELECT 'ITAÚ UYU', 'bancaria', 'UYU', 'ITAU', NULL, TRUE, 'Cuenta principal en pesos', '#730d32', TRUE
WHERE NOT EXISTS (
  SELECT 1 FROM cuentas_financieras WHERE banco = 'ITAU' AND moneda = 'UYU'
);

INSERT INTO cuentas_financieras (nombre, tipo, moneda, banco, modulo, incluir_en_tesoreria, descripcion, color, activa)
SELECT 'ITAÚ USD', 'bancaria', 'USD', 'ITAU', NULL, TRUE, 'Cuenta principal en dólares', '#1f6f4a', TRUE
WHERE NOT EXISTS (
  SELECT 1 FROM cuentas_financieras WHERE banco = 'ITAU' AND moneda = 'USD'
);
