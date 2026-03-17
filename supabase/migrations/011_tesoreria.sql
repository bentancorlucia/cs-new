-- ============================================
-- Migración 011: Módulo de Tesorería
-- Tablas, triggers, funciones, índices y RLS
-- ============================================

-- =====================
-- 1. TABLAS
-- =====================

-- 1.1 Cuentas financieras
CREATE TABLE cuentas_financieras (
  id SERIAL PRIMARY KEY,
  nombre VARCHAR(200) NOT NULL,
  tipo VARCHAR(20) NOT NULL
    CHECK (tipo IN ('bancaria', 'mercadopago', 'caja_chica', 'virtual')),
  moneda VARCHAR(3) NOT NULL CHECK (moneda IN ('UYU', 'USD')),
  banco VARCHAR(100),
  numero_cuenta VARCHAR(50),
  saldo_actual DECIMAL(14,2) NOT NULL DEFAULT 0,
  saldo_inicial DECIMAL(14,2) NOT NULL DEFAULT 0,
  descripcion TEXT,
  color VARCHAR(7),
  activa BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 1.2 Categorías financieras (jerárquicas)
CREATE TABLE categorias_financieras (
  id SERIAL PRIMARY KEY,
  nombre VARCHAR(100) NOT NULL,
  slug VARCHAR(100) UNIQUE NOT NULL,
  tipo VARCHAR(10) NOT NULL CHECK (tipo IN ('ingreso', 'egreso')),
  padre_id INTEGER REFERENCES categorias_financieras(id) ON DELETE SET NULL,
  color VARCHAR(7),
  icono VARCHAR(50),
  presupuesto_mensual DECIMAL(12,2),
  orden INTEGER DEFAULT 0,
  activa BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 1.3 Transferencias internas (antes de movimientos para FK)
CREATE TABLE transferencias_internas (
  id SERIAL PRIMARY KEY,
  cuenta_origen_id INTEGER NOT NULL REFERENCES cuentas_financieras(id),
  cuenta_destino_id INTEGER NOT NULL REFERENCES cuentas_financieras(id),
  monto DECIMAL(14,2) NOT NULL CHECK (monto > 0),
  moneda_origen VARCHAR(3) NOT NULL,
  moneda_destino VARCHAR(3) NOT NULL,
  tipo_cambio DECIMAL(10,4),
  monto_destino DECIMAL(14,2) NOT NULL,
  fecha DATE NOT NULL,
  descripcion VARCHAR(500),
  comprobante_url TEXT,
  movimiento_egreso_id INTEGER,  -- FK added after movimientos table
  movimiento_ingreso_id INTEGER, -- FK added after movimientos table
  registrado_por UUID REFERENCES perfiles(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 1.4 Conciliaciones
CREATE TABLE conciliaciones (
  id SERIAL PRIMARY KEY,
  cuenta_id INTEGER NOT NULL REFERENCES cuentas_financieras(id),
  periodo_desde DATE NOT NULL,
  periodo_hasta DATE NOT NULL,
  saldo_banco DECIMAL(14,2) NOT NULL,
  saldo_sistema DECIMAL(14,2) NOT NULL,
  diferencia DECIMAL(14,2) NOT NULL,
  archivo_extracto_url TEXT,
  estado VARCHAR(20) NOT NULL DEFAULT 'en_proceso'
    CHECK (estado IN ('en_proceso', 'completada')),
  movimientos_matcheados INTEGER DEFAULT 0,
  movimientos_pendientes_banco INTEGER DEFAULT 0,
  movimientos_pendientes_sistema INTEGER DEFAULT 0,
  completada_por UUID REFERENCES perfiles(id),
  completada_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 1.5 Cierres mensuales
CREATE TABLE cierres_mensuales (
  id SERIAL PRIMARY KEY,
  anio INTEGER NOT NULL,
  mes INTEGER NOT NULL CHECK (mes BETWEEN 1 AND 12),
  total_ingresos DECIMAL(14,2) NOT NULL,
  total_egresos DECIMAL(14,2) NOT NULL,
  resultado DECIMAL(14,2) NOT NULL,
  saldos_snapshot JSONB NOT NULL,
  categorias_snapshot JSONB,
  estado VARCHAR(10) NOT NULL DEFAULT 'abierto'
    CHECK (estado IN ('abierto', 'cerrado')),
  cerrado_por UUID REFERENCES perfiles(id),
  cerrado_at TIMESTAMPTZ,
  notas TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(anio, mes)
);

-- 1.6 Movimientos financieros
CREATE TABLE movimientos_financieros (
  id SERIAL PRIMARY KEY,
  cuenta_id INTEGER NOT NULL REFERENCES cuentas_financieras(id),
  tipo VARCHAR(10) NOT NULL CHECK (tipo IN ('ingreso', 'egreso')),
  categoria_id INTEGER NOT NULL REFERENCES categorias_financieras(id),
  subcategoria_id INTEGER REFERENCES categorias_financieras(id),
  monto DECIMAL(14,2) NOT NULL CHECK (monto > 0),
  moneda VARCHAR(3) NOT NULL CHECK (moneda IN ('UYU', 'USD')),
  fecha DATE NOT NULL,
  descripcion VARCHAR(500) NOT NULL,
  comprobante_url TEXT,
  referencia VARCHAR(100),
  origen_tipo VARCHAR(30),
  origen_id INTEGER,
  transferencia_id INTEGER REFERENCES transferencias_internas(id),
  conciliado BOOLEAN DEFAULT FALSE,
  conciliacion_id INTEGER REFERENCES conciliaciones(id),
  tags TEXT[],
  notas TEXT,
  registrado_por UUID REFERENCES perfiles(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add FK from transferencias to movimientos
ALTER TABLE transferencias_internas
  ADD CONSTRAINT fk_transf_mov_egreso
    FOREIGN KEY (movimiento_egreso_id) REFERENCES movimientos_financieros(id),
  ADD CONSTRAINT fk_transf_mov_ingreso
    FOREIGN KEY (movimiento_ingreso_id) REFERENCES movimientos_financieros(id);

-- 1.7 Conciliación items
CREATE TABLE conciliacion_items (
  id SERIAL PRIMARY KEY,
  conciliacion_id INTEGER NOT NULL REFERENCES conciliaciones(id) ON DELETE CASCADE,
  movimiento_id INTEGER REFERENCES movimientos_financieros(id),
  fecha_banco DATE,
  descripcion_banco VARCHAR(500),
  monto_banco DECIMAL(14,2),
  estado VARCHAR(20) NOT NULL
    CHECK (estado IN ('matcheado', 'pendiente_sistema', 'pendiente_banco', 'ignorado')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 1.8 Presupuestos
CREATE TABLE presupuestos (
  id SERIAL PRIMARY KEY,
  anio INTEGER NOT NULL,
  mes INTEGER NOT NULL CHECK (mes BETWEEN 1 AND 12),
  categoria_id INTEGER NOT NULL REFERENCES categorias_financieras(id),
  monto_presupuestado DECIMAL(12,2) NOT NULL,
  notas TEXT,
  created_by UUID REFERENCES perfiles(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(anio, mes, categoria_id)
);

-- 1.9 Arqueos de caja
CREATE TABLE arqueos_caja (
  id SERIAL PRIMARY KEY,
  cuenta_id INTEGER NOT NULL REFERENCES cuentas_financieras(id),
  fecha DATE NOT NULL,
  saldo_sistema DECIMAL(14,2) NOT NULL,
  saldo_fisico DECIMAL(14,2) NOT NULL,
  diferencia DECIMAL(14,2) NOT NULL,
  notas TEXT,
  registrado_por UUID REFERENCES perfiles(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =====================
-- 2. TRIGGERS Y FUNCIONES
-- =====================

-- 2.1 Actualizar saldo de cuenta al insertar/eliminar movimiento
CREATE OR REPLACE FUNCTION actualizar_saldo_cuenta()
RETURNS TRIGGER AS $$
DECLARE
  delta DECIMAL(14,2);
BEGIN
  IF TG_OP = 'INSERT' THEN
    delta := CASE WHEN NEW.tipo = 'ingreso' THEN NEW.monto ELSE -NEW.monto END;
    UPDATE cuentas_financieras
    SET saldo_actual = saldo_actual + delta, updated_at = NOW()
    WHERE id = NEW.cuenta_id;
  ELSIF TG_OP = 'DELETE' THEN
    delta := CASE WHEN OLD.tipo = 'ingreso' THEN -OLD.monto ELSE OLD.monto END;
    UPDATE cuentas_financieras
    SET saldo_actual = saldo_actual + delta, updated_at = NOW()
    WHERE id = OLD.cuenta_id;
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER on_movimiento_financiero
  AFTER INSERT OR DELETE ON movimientos_financieros
  FOR EACH ROW EXECUTE FUNCTION actualizar_saldo_cuenta();

-- 2.2 Proteger movimientos de períodos cerrados
CREATE OR REPLACE FUNCTION proteger_periodo_cerrado()
RETURNS TRIGGER AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM cierres_mensuales
    WHERE estado = 'cerrado'
    AND anio = EXTRACT(YEAR FROM COALESCE(NEW.fecha, OLD.fecha))
    AND mes = EXTRACT(MONTH FROM COALESCE(NEW.fecha, OLD.fecha))
  ) THEN
    RAISE EXCEPTION 'No se pueden modificar movimientos de un período cerrado';
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER check_periodo_cerrado
  BEFORE INSERT OR UPDATE OR DELETE ON movimientos_financieros
  FOR EACH ROW EXECUTE FUNCTION proteger_periodo_cerrado();

-- 2.3 RPC para actualizar saldo (usado por helper de movimientos automáticos)
CREATE OR REPLACE FUNCTION actualizar_saldo_cuenta_rpc(
  p_cuenta_id INTEGER,
  p_delta DECIMAL(14,2)
)
RETURNS VOID AS $$
BEGIN
  UPDATE cuentas_financieras
  SET saldo_actual = saldo_actual + p_delta, updated_at = NOW()
  WHERE id = p_cuenta_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =====================
-- 3. ÍNDICES
-- =====================

CREATE INDEX idx_movimientos_cuenta ON movimientos_financieros(cuenta_id);
CREATE INDEX idx_movimientos_fecha ON movimientos_financieros(fecha DESC);
CREATE INDEX idx_movimientos_categoria ON movimientos_financieros(categoria_id);
CREATE INDEX idx_movimientos_tipo ON movimientos_financieros(tipo);
CREATE INDEX idx_movimientos_origen ON movimientos_financieros(origen_tipo, origen_id);
CREATE INDEX idx_movimientos_conciliado ON movimientos_financieros(conciliado) WHERE conciliado = FALSE;
CREATE INDEX idx_presupuestos_periodo ON presupuestos(anio, mes);
CREATE INDEX idx_cierres_periodo ON cierres_mensuales(anio, mes);
CREATE INDEX idx_transferencias_fecha ON transferencias_internas(fecha DESC);
CREATE INDEX idx_categorias_fin_tipo ON categorias_financieras(tipo) WHERE activa = TRUE;
CREATE INDEX idx_categorias_fin_padre ON categorias_financieras(padre_id);
CREATE INDEX idx_arqueos_cuenta ON arqueos_caja(cuenta_id, fecha DESC);
CREATE INDEX idx_conciliacion_items_conc ON conciliacion_items(conciliacion_id);

-- =====================
-- 4. ROW LEVEL SECURITY
-- =====================

ALTER TABLE cuentas_financieras ENABLE ROW LEVEL SECURITY;
ALTER TABLE categorias_financieras ENABLE ROW LEVEL SECURITY;
ALTER TABLE movimientos_financieros ENABLE ROW LEVEL SECURITY;
ALTER TABLE transferencias_internas ENABLE ROW LEVEL SECURITY;
ALTER TABLE conciliaciones ENABLE ROW LEVEL SECURITY;
ALTER TABLE conciliacion_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE cierres_mensuales ENABLE ROW LEVEL SECURITY;
ALTER TABLE presupuestos ENABLE ROW LEVEL SECURITY;
ALTER TABLE arqueos_caja ENABLE ROW LEVEL SECURITY;

-- Tesorero y super_admin pueden ver y modificar todo en tesorería
-- Lectura
CREATE POLICY "Tesorería: lectura cuentas"
  ON cuentas_financieras FOR SELECT
  USING (tiene_algun_rol(ARRAY['super_admin', 'tesorero']));

CREATE POLICY "Tesorería: lectura categorías"
  ON categorias_financieras FOR SELECT
  USING (tiene_algun_rol(ARRAY['super_admin', 'tesorero']));

CREATE POLICY "Tesorería: lectura movimientos"
  ON movimientos_financieros FOR SELECT
  USING (tiene_algun_rol(ARRAY['super_admin', 'tesorero']));

CREATE POLICY "Tesorería: lectura transferencias"
  ON transferencias_internas FOR SELECT
  USING (tiene_algun_rol(ARRAY['super_admin', 'tesorero']));

CREATE POLICY "Tesorería: lectura conciliaciones"
  ON conciliaciones FOR SELECT
  USING (tiene_algun_rol(ARRAY['super_admin', 'tesorero']));

CREATE POLICY "Tesorería: lectura conciliacion_items"
  ON conciliacion_items FOR SELECT
  USING (tiene_algun_rol(ARRAY['super_admin', 'tesorero']));

CREATE POLICY "Tesorería: lectura cierres"
  ON cierres_mensuales FOR SELECT
  USING (tiene_algun_rol(ARRAY['super_admin', 'tesorero']));

CREATE POLICY "Tesorería: lectura presupuestos"
  ON presupuestos FOR SELECT
  USING (tiene_algun_rol(ARRAY['super_admin', 'tesorero']));

CREATE POLICY "Tesorería: lectura arqueos"
  ON arqueos_caja FOR SELECT
  USING (tiene_algun_rol(ARRAY['super_admin', 'tesorero']));

-- Escritura (INSERT)
CREATE POLICY "Tesorería: crear cuentas"
  ON cuentas_financieras FOR INSERT
  WITH CHECK (tiene_algun_rol(ARRAY['super_admin', 'tesorero']));

CREATE POLICY "Tesorería: crear categorías"
  ON categorias_financieras FOR INSERT
  WITH CHECK (tiene_algun_rol(ARRAY['super_admin', 'tesorero']));

CREATE POLICY "Tesorería: crear movimientos"
  ON movimientos_financieros FOR INSERT
  WITH CHECK (tiene_algun_rol(ARRAY['super_admin', 'tesorero']));

CREATE POLICY "Tesorería: crear transferencias"
  ON transferencias_internas FOR INSERT
  WITH CHECK (tiene_algun_rol(ARRAY['super_admin', 'tesorero']));

CREATE POLICY "Tesorería: crear conciliaciones"
  ON conciliaciones FOR INSERT
  WITH CHECK (tiene_algun_rol(ARRAY['super_admin', 'tesorero']));

CREATE POLICY "Tesorería: crear conciliacion_items"
  ON conciliacion_items FOR INSERT
  WITH CHECK (tiene_algun_rol(ARRAY['super_admin', 'tesorero']));

CREATE POLICY "Tesorería: crear cierres"
  ON cierres_mensuales FOR INSERT
  WITH CHECK (tiene_algun_rol(ARRAY['super_admin', 'tesorero']));

CREATE POLICY "Tesorería: crear presupuestos"
  ON presupuestos FOR INSERT
  WITH CHECK (tiene_algun_rol(ARRAY['super_admin', 'tesorero']));

CREATE POLICY "Tesorería: crear arqueos"
  ON arqueos_caja FOR INSERT
  WITH CHECK (tiene_algun_rol(ARRAY['super_admin', 'tesorero']));

-- Actualización (UPDATE)
CREATE POLICY "Tesorería: actualizar cuentas"
  ON cuentas_financieras FOR UPDATE
  USING (tiene_algun_rol(ARRAY['super_admin', 'tesorero']))
  WITH CHECK (tiene_algun_rol(ARRAY['super_admin', 'tesorero']));

CREATE POLICY "Tesorería: actualizar categorías"
  ON categorias_financieras FOR UPDATE
  USING (tiene_algun_rol(ARRAY['super_admin', 'tesorero']))
  WITH CHECK (tiene_algun_rol(ARRAY['super_admin', 'tesorero']));

CREATE POLICY "Tesorería: actualizar movimientos"
  ON movimientos_financieros FOR UPDATE
  USING (tiene_algun_rol(ARRAY['super_admin', 'tesorero']))
  WITH CHECK (tiene_algun_rol(ARRAY['super_admin', 'tesorero']));

CREATE POLICY "Tesorería: actualizar transferencias"
  ON transferencias_internas FOR UPDATE
  USING (tiene_algun_rol(ARRAY['super_admin', 'tesorero']))
  WITH CHECK (tiene_algun_rol(ARRAY['super_admin', 'tesorero']));

CREATE POLICY "Tesorería: actualizar conciliaciones"
  ON conciliaciones FOR UPDATE
  USING (tiene_algun_rol(ARRAY['super_admin', 'tesorero']))
  WITH CHECK (tiene_algun_rol(ARRAY['super_admin', 'tesorero']));

CREATE POLICY "Tesorería: actualizar conciliacion_items"
  ON conciliacion_items FOR UPDATE
  USING (tiene_algun_rol(ARRAY['super_admin', 'tesorero']))
  WITH CHECK (tiene_algun_rol(ARRAY['super_admin', 'tesorero']));

CREATE POLICY "Tesorería: actualizar cierres"
  ON cierres_mensuales FOR UPDATE
  USING (tiene_algun_rol(ARRAY['super_admin', 'tesorero']))
  WITH CHECK (tiene_algun_rol(ARRAY['super_admin', 'tesorero']));

CREATE POLICY "Tesorería: actualizar presupuestos"
  ON presupuestos FOR UPDATE
  USING (tiene_algun_rol(ARRAY['super_admin', 'tesorero']))
  WITH CHECK (tiene_algun_rol(ARRAY['super_admin', 'tesorero']));

-- Eliminación (DELETE)
CREATE POLICY "Tesorería: eliminar movimientos"
  ON movimientos_financieros FOR DELETE
  USING (tiene_algun_rol(ARRAY['super_admin', 'tesorero']));

CREATE POLICY "Tesorería: eliminar conciliacion_items"
  ON conciliacion_items FOR DELETE
  USING (tiene_algun_rol(ARRAY['super_admin', 'tesorero']));

-- No editar movimientos de períodos cerrados (RLS adicional)
CREATE POLICY "No editar movimientos cerrados"
  ON movimientos_financieros
  FOR UPDATE
  USING (
    NOT EXISTS (
      SELECT 1 FROM cierres_mensuales
      WHERE estado = 'cerrado'
      AND anio = EXTRACT(YEAR FROM movimientos_financieros.fecha)
      AND mes = EXTRACT(MONTH FROM movimientos_financieros.fecha)
    )
  );

-- =====================
-- 5. SEED: Categorías financieras iniciales
-- =====================

-- Ingresos
INSERT INTO categorias_financieras (nombre, slug, tipo, color, icono, orden) VALUES
  ('Cuotas de socios', 'cuotas-socios', 'ingreso', '#10B981', 'Users', 1),
  ('Ventas tienda', 'ventas-tienda', 'ingreso', '#3B82F6', 'ShoppingBag', 2),
  ('Entradas eventos', 'entradas-eventos', 'ingreso', '#8B5CF6', 'Ticket', 3),
  ('Donaciones', 'donaciones', 'ingreso', '#F59E0B', 'Heart', 4),
  ('Sponsors', 'sponsors', 'ingreso', '#EF4444', 'Award', 5),
  ('Alquiler de instalaciones', 'alquiler-instalaciones', 'ingreso', '#06B6D4', 'Building', 6),
  ('Otros ingresos', 'otros-ingresos', 'ingreso', '#6B7280', 'Plus', 7),
  ('Transferencia interna', 'transferencia-interna-ingreso', 'ingreso', '#9CA3AF', 'ArrowRightLeft', 99);

-- Subcategorías de ingresos
INSERT INTO categorias_financieras (nombre, slug, tipo, padre_id, color, icono, orden) VALUES
  ('Cuota colaborador', 'cuota-colaborador', 'ingreso', (SELECT id FROM categorias_financieras WHERE slug = 'cuotas-socios'), '#10B981', 'User', 1),
  ('Cuota deportivo', 'cuota-deportivo', 'ingreso', (SELECT id FROM categorias_financieras WHERE slug = 'cuotas-socios'), '#10B981', 'Dumbbell', 2),
  ('Ventas online', 'ventas-online', 'ingreso', (SELECT id FROM categorias_financieras WHERE slug = 'ventas-tienda'), '#3B82F6', 'Globe', 1),
  ('Ventas POS', 'ventas-pos', 'ingreso', (SELECT id FROM categorias_financieras WHERE slug = 'ventas-tienda'), '#3B82F6', 'Monitor', 2),
  ('Sponsors principales', 'sponsors-principales', 'ingreso', (SELECT id FROM categorias_financieras WHERE slug = 'sponsors'), '#EF4444', 'Star', 1),
  ('Sponsors secundarios', 'sponsors-secundarios', 'ingreso', (SELECT id FROM categorias_financieras WHERE slug = 'sponsors'), '#EF4444', 'Star', 2);

-- Egresos
INSERT INTO categorias_financieras (nombre, slug, tipo, color, icono, orden) VALUES
  ('Compras proveedores', 'compras-proveedores', 'egreso', '#EF4444', 'Truck', 1),
  ('Servicios', 'servicios', 'egreso', '#F59E0B', 'Zap', 2),
  ('Sueldos y honorarios', 'sueldos-honorarios', 'egreso', '#8B5CF6', 'Briefcase', 3),
  ('Alquiler canchas', 'alquiler-canchas', 'egreso', '#06B6D4', 'MapPin', 4),
  ('Mantenimiento', 'mantenimiento', 'egreso', '#10B981', 'Wrench', 5),
  ('Transporte', 'transporte', 'egreso', '#3B82F6', 'Bus', 6),
  ('Seguros', 'seguros', 'egreso', '#6366F1', 'Shield', 7),
  ('Impuestos y tasas', 'impuestos-tasas', 'egreso', '#DC2626', 'FileText', 8),
  ('Eventos (gastos)', 'eventos-gastos', 'egreso', '#D946EF', 'Calendar', 9),
  ('Marketing y comunicación', 'marketing-comunicacion', 'egreso', '#F97316', 'Megaphone', 10),
  ('Otros egresos', 'otros-egresos', 'egreso', '#6B7280', 'Minus', 11),
  ('Transferencia interna', 'transferencia-interna-egreso', 'egreso', '#9CA3AF', 'ArrowRightLeft', 99);

-- Subcategorías de egresos
INSERT INTO categorias_financieras (nombre, slug, tipo, padre_id, color, icono, orden) VALUES
  ('Mercadería tienda', 'mercaderia-tienda', 'egreso', (SELECT id FROM categorias_financieras WHERE slug = 'compras-proveedores'), '#EF4444', 'Package', 1),
  ('Insumos deportivos', 'insumos-deportivos', 'egreso', (SELECT id FROM categorias_financieras WHERE slug = 'compras-proveedores'), '#EF4444', 'Dumbbell', 2),
  ('Luz', 'luz', 'egreso', (SELECT id FROM categorias_financieras WHERE slug = 'servicios'), '#F59E0B', 'Lightbulb', 1),
  ('Agua', 'agua', 'egreso', (SELECT id FROM categorias_financieras WHERE slug = 'servicios'), '#F59E0B', 'Droplet', 2),
  ('Internet', 'internet', 'egreso', (SELECT id FROM categorias_financieras WHERE slug = 'servicios'), '#F59E0B', 'Wifi', 3),
  ('Teléfono', 'telefono', 'egreso', (SELECT id FROM categorias_financieras WHERE slug = 'servicios'), '#F59E0B', 'Phone', 4),
  ('Logística', 'logistica-eventos', 'egreso', (SELECT id FROM categorias_financieras WHERE slug = 'eventos-gastos'), '#D946EF', 'Truck', 1),
  ('Sonido/iluminación', 'sonido-iluminacion', 'egreso', (SELECT id FROM categorias_financieras WHERE slug = 'eventos-gastos'), '#D946EF', 'Speaker', 2),
  ('Catering', 'catering', 'egreso', (SELECT id FROM categorias_financieras WHERE slug = 'eventos-gastos'), '#D946EF', 'UtensilsCrossed', 3);

-- Storage bucket para comprobantes
INSERT INTO storage.buckets (id, name, public) VALUES
  ('comprobantes', 'comprobantes', false)
ON CONFLICT (id) DO NOTHING;

INSERT INTO storage.buckets (id, name, public) VALUES
  ('extractos', 'extractos', false)
ON CONFLICT (id) DO NOTHING;

INSERT INTO storage.buckets (id, name, public) VALUES
  ('reportes', 'reportes', false)
ON CONFLICT (id) DO NOTHING;
