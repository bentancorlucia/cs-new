-- ============================================================
-- Migration 037: Donaciones opcionales en checkout (Olla del Hogar de Cristo)
-- ============================================================
-- El cliente puede agregar una donación opcional durante el checkout de
-- tienda online. La donación se cobra junto con el pedido en la transferencia
-- bancaria, pero NO forma parte de las ventas del club: es plata en custodia
-- que se transfiere mensualmente a la Olla del Hogar de Cristo.
--
-- Estados de una donación:
--   'pendiente_pago' → recién creada (pedido en pendiente_verificacion)
--   'cobrada'        → la transferencia del cliente fue verificada
--   'transferida'    → admin la transfirió a la Olla del Hogar
--   'cancelada'      → el pedido fue cancelado antes de transferirse
-- ============================================================

-- 1. Tabla de configuración (singleton)
CREATE TABLE donaciones_config (
  id INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  activo BOOLEAN NOT NULL DEFAULT FALSE,
  monto_1 DECIMAL(10,2) NOT NULL DEFAULT 150 CHECK (monto_1 > 0),
  monto_2 DECIMAL(10,2) NOT NULL DEFAULT 300 CHECK (monto_2 > 0),
  monto_3 DECIMAL(10,2) NOT NULL DEFAULT 500 CHECK (monto_3 > 0),
  permitir_monto_custom BOOLEAN NOT NULL DEFAULT TRUE,
  monto_custom_max DECIMAL(10,2) NOT NULL DEFAULT 100000 CHECK (monto_custom_max > 0),
  titulo VARCHAR(120) NOT NULL DEFAULT 'Olla del Hogar de Cristo',
  descripcion TEXT NOT NULL DEFAULT 'Sumá una donación a tu compra. El 100% va a la Olla del Hogar de Cristo, una iniciativa solidaria que brinda alimento a quienes más lo necesitan.',
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  updated_by UUID REFERENCES perfiles(id)
);

-- Insertar la única fila
INSERT INTO donaciones_config (id, activo) VALUES (1, FALSE);

-- 2. Tabla de transferencias mensuales hacia la Olla
CREATE TABLE donaciones_transferencias (
  id SERIAL PRIMARY KEY,
  fecha_transferencia DATE NOT NULL,
  monto_total DECIMAL(10,2) NOT NULL CHECK (monto_total > 0),
  cantidad_donaciones INTEGER NOT NULL CHECK (cantidad_donaciones > 0),
  comprobante_url TEXT,
  notas TEXT,
  creado_por UUID REFERENCES perfiles(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_donaciones_transferencias_fecha
  ON donaciones_transferencias(fecha_transferencia DESC);

-- 3. Tabla de donaciones (una por pedido)
CREATE TABLE donaciones (
  id SERIAL PRIMARY KEY,
  pedido_id INTEGER NOT NULL UNIQUE REFERENCES pedidos(id) ON DELETE CASCADE,
  monto DECIMAL(10,2) NOT NULL CHECK (monto > 0),
  estado VARCHAR(20) NOT NULL DEFAULT 'pendiente_pago'
    CHECK (estado IN ('pendiente_pago', 'cobrada', 'transferida', 'cancelada')),
  transferencia_id INTEGER REFERENCES donaciones_transferencias(id) ON DELETE SET NULL,
  cobrada_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  -- Si está transferida, debe tener transferencia_id
  CONSTRAINT donaciones_transferida_check
    CHECK (estado <> 'transferida' OR transferencia_id IS NOT NULL),
  -- Si está cobrada o transferida, debe tener cobrada_at
  CONSTRAINT donaciones_cobrada_at_check
    CHECK (estado IN ('pendiente_pago', 'cancelada') OR cobrada_at IS NOT NULL)
);

CREATE INDEX idx_donaciones_pedido ON donaciones(pedido_id);
CREATE INDEX idx_donaciones_estado ON donaciones(estado);
CREATE INDEX idx_donaciones_transferencia ON donaciones(transferencia_id)
  WHERE transferencia_id IS NOT NULL;
CREATE INDEX idx_donaciones_pendientes ON donaciones(estado, transferencia_id)
  WHERE estado = 'cobrada' AND transferencia_id IS NULL;

-- 4. RLS
ALTER TABLE donaciones_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE donaciones ENABLE ROW LEVEL SECURITY;
ALTER TABLE donaciones_transferencias ENABLE ROW LEVEL SECURITY;

-- donaciones_config: lectura abierta a authenticated (el checkout la necesita).
-- No expone datos sensibles, solo la configuración pública del feature.
CREATE POLICY "donaciones_config lectura authenticated" ON donaciones_config
  FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "donaciones_config admin update" ON donaciones_config
  FOR UPDATE TO authenticated
  USING (tiene_algun_rol(ARRAY['super_admin', 'tienda']))
  WITH CHECK (tiene_algun_rol(ARRAY['super_admin', 'tienda']));

-- donaciones: el dueño del pedido puede ver su donación; admin tienda ve todas.
CREATE POLICY "donaciones lectura dueno pedido" ON donaciones
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM pedidos p
      WHERE p.id = donaciones.pedido_id AND p.perfil_id = auth.uid()
    )
  );

CREATE POLICY "donaciones admin select" ON donaciones
  FOR SELECT TO authenticated
  USING (tiene_algun_rol(ARRAY['super_admin', 'tienda']));

CREATE POLICY "donaciones admin insert" ON donaciones
  FOR INSERT TO authenticated
  WITH CHECK (tiene_algun_rol(ARRAY['super_admin', 'tienda']));

CREATE POLICY "donaciones admin update" ON donaciones
  FOR UPDATE TO authenticated
  USING (tiene_algun_rol(ARRAY['super_admin', 'tienda']))
  WITH CHECK (tiene_algun_rol(ARRAY['super_admin', 'tienda']));

-- donaciones_transferencias: solo admin tienda
CREATE POLICY "donaciones_transferencias admin select" ON donaciones_transferencias
  FOR SELECT TO authenticated
  USING (tiene_algun_rol(ARRAY['super_admin', 'tienda']));

CREATE POLICY "donaciones_transferencias admin insert" ON donaciones_transferencias
  FOR INSERT TO authenticated
  WITH CHECK (tiene_algun_rol(ARRAY['super_admin', 'tienda']));

CREATE POLICY "donaciones_transferencias admin update" ON donaciones_transferencias
  FOR UPDATE TO authenticated
  USING (tiene_algun_rol(ARRAY['super_admin', 'tienda']))
  WITH CHECK (tiene_algun_rol(ARRAY['super_admin', 'tienda']));

-- 5. RPC atómico para registrar una transferencia mensual a la Olla.
-- Crea la fila en donaciones_transferencias y marca todas las donaciones
-- 'cobrada' sin transferencia como 'transferida' apuntando a la nueva fila.
-- Devuelve el id de la transferencia creada y el monto total.
CREATE OR REPLACE FUNCTION registrar_transferencia_donaciones(
  p_fecha DATE,
  p_comprobante_url TEXT,
  p_notas TEXT,
  p_creado_por UUID
)
RETURNS TABLE(transferencia_id INTEGER, monto_total DECIMAL, cantidad INTEGER)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_total DECIMAL(10,2);
  v_cantidad INTEGER;
  v_transferencia_id INTEGER;
BEGIN
  -- Verificar permisos (la función es SECURITY DEFINER, así que validamos manualmente)
  IF NOT tiene_algun_rol(ARRAY['super_admin', 'tienda']) THEN
    RAISE EXCEPTION 'No autorizado';
  END IF;

  -- Calcular total y cantidad de donaciones pendientes de transferir
  SELECT COALESCE(SUM(monto), 0), COUNT(*)
    INTO v_total, v_cantidad
    FROM donaciones
   WHERE estado = 'cobrada' AND transferencia_id IS NULL;

  IF v_cantidad = 0 THEN
    RAISE EXCEPTION 'No hay donaciones pendientes de transferir';
  END IF;

  -- Crear la transferencia
  INSERT INTO donaciones_transferencias
    (fecha_transferencia, monto_total, cantidad_donaciones, comprobante_url, notas, creado_por)
  VALUES
    (p_fecha, v_total, v_cantidad, p_comprobante_url, p_notas, p_creado_por)
  RETURNING id INTO v_transferencia_id;

  -- Marcar las donaciones como transferidas
  UPDATE donaciones
     SET estado = 'transferida',
         transferencia_id = v_transferencia_id
   WHERE estado = 'cobrada' AND transferencia_id IS NULL;

  RETURN QUERY SELECT v_transferencia_id, v_total, v_cantidad;
END
$$;

GRANT EXECUTE ON FUNCTION registrar_transferencia_donaciones(DATE, TEXT, TEXT, UUID) TO authenticated;
