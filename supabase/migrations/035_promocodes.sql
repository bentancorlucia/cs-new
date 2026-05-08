-- ============================================================
-- Migration 035: Promocodes (códigos de descuento) para tienda online
-- ============================================================

-- 1. Tabla principal
CREATE TABLE promocodes (
  id SERIAL PRIMARY KEY,
  codigo VARCHAR(40) UNIQUE NOT NULL,
  descripcion TEXT,
  tipo_descuento VARCHAR(15) NOT NULL
    CHECK (tipo_descuento IN ('porcentaje', 'monto_fijo')),
  valor DECIMAL(10,2) NOT NULL CHECK (valor > 0),
  fecha_inicio TIMESTAMPTZ NOT NULL,
  fecha_fin TIMESTAMPTZ NOT NULL,
  acumulable_con_precio_socio BOOLEAN NOT NULL DEFAULT FALSE,
  monto_minimo DECIMAL(10,2),
  usos_max INTEGER,
  usos_actuales INTEGER NOT NULL DEFAULT 0,
  activo BOOLEAN NOT NULL DEFAULT TRUE,
  created_by UUID REFERENCES perfiles(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT promocodes_fechas_check CHECK (fecha_fin > fecha_inicio),
  CONSTRAINT promocodes_porcentaje_max
    CHECK (tipo_descuento <> 'porcentaje' OR valor <= 100),
  CONSTRAINT promocodes_usos_max_positivo
    CHECK (usos_max IS NULL OR usos_max > 0),
  CONSTRAINT promocodes_monto_minimo_positivo
    CHECK (monto_minimo IS NULL OR monto_minimo > 0)
);

CREATE INDEX idx_promocodes_codigo ON promocodes(codigo);
CREATE INDEX idx_promocodes_activo ON promocodes(activo) WHERE activo;

-- 2. Trigger para actualizar updated_at
CREATE TRIGGER promocodes_updated_at
  BEFORE UPDATE ON promocodes
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

-- 3. Forzar código en mayúsculas
CREATE OR REPLACE FUNCTION promocodes_normalize_codigo()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.codigo := UPPER(TRIM(NEW.codigo));
  RETURN NEW;
END $$;

CREATE TRIGGER promocodes_normalize_codigo_trigger
  BEFORE INSERT OR UPDATE OF codigo ON promocodes
  FOR EACH ROW
  EXECUTE FUNCTION promocodes_normalize_codigo();

-- 4. Ampliar pedidos para auditar el descuento aplicado
ALTER TABLE pedidos
  ADD COLUMN promocode_id INTEGER REFERENCES promocodes(id),
  ADD COLUMN promocode_codigo VARCHAR(40),
  ADD COLUMN aplico_precio_socio BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX idx_pedidos_promocode_id ON pedidos(promocode_id) WHERE promocode_id IS NOT NULL;

-- 5. RLS
ALTER TABLE promocodes ENABLE ROW LEVEL SECURITY;

-- Lectura para validación: cualquier authenticated puede leer códigos vigentes y activos
-- (necesario para que la UI valide antes del checkout sin exponer el listado completo)
CREATE POLICY "promocodes lectura validacion vigentes" ON promocodes
  FOR SELECT TO authenticated
  USING (activo AND NOW() BETWEEN fecha_inicio AND fecha_fin);

-- Lectura admin: super_admin / tienda ven todos
CREATE POLICY "promocodes admin select" ON promocodes
  FOR SELECT TO authenticated
  USING (tiene_algun_rol(ARRAY['super_admin', 'tienda']));

-- Insert / update / delete: solo super_admin / tienda
CREATE POLICY "promocodes admin insert" ON promocodes
  FOR INSERT TO authenticated
  WITH CHECK (tiene_algun_rol(ARRAY['super_admin', 'tienda']));

CREATE POLICY "promocodes admin update" ON promocodes
  FOR UPDATE TO authenticated
  USING (tiene_algun_rol(ARRAY['super_admin', 'tienda']))
  WITH CHECK (tiene_algun_rol(ARRAY['super_admin', 'tienda']));

CREATE POLICY "promocodes admin delete" ON promocodes
  FOR DELETE TO authenticated
  USING (tiene_algun_rol(ARRAY['super_admin', 'tienda']));

-- 6. RPC atómico para incrementar uso al confirmar pedido.
-- Devuelve TRUE si se pudo incrementar (vigente, activo, hay usos disponibles).
-- Si devuelve FALSE el caller debe rechazar el pedido.
CREATE OR REPLACE FUNCTION incrementar_uso_promocode(p_id INTEGER)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actualizadas INTEGER;
BEGIN
  UPDATE promocodes
     SET usos_actuales = usos_actuales + 1,
         updated_at = NOW()
   WHERE id = p_id
     AND activo
     AND NOW() BETWEEN fecha_inicio AND fecha_fin
     AND (usos_max IS NULL OR usos_actuales < usos_max);

  GET DIAGNOSTICS v_actualizadas = ROW_COUNT;
  RETURN v_actualizadas > 0;
END
$$;

GRANT EXECUTE ON FUNCTION incrementar_uso_promocode(INTEGER) TO authenticated;
