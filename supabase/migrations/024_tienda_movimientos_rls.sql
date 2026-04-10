-- =====================
-- 024: Movimientos financieros para módulo Tienda
-- =====================

-- 1. Asignar modulo='tienda' a las cuentas existentes de caja chica y bancaria
UPDATE cuentas_financieras SET modulo = 'tienda' WHERE tipo = 'caja_chica' AND modulo IS NULL;
UPDATE cuentas_financieras SET modulo = 'tienda' WHERE tipo = 'bancaria' AND modulo IS NULL;

-- 2. Agregar columna modulo a categorias_financieras
ALTER TABLE categorias_financieras ADD COLUMN IF NOT EXISTS modulo text DEFAULT NULL;

CREATE INDEX IF NOT EXISTS idx_categorias_financieras_modulo ON categorias_financieras(modulo) WHERE modulo IS NOT NULL;

-- Marcar categorías relevantes a tienda
UPDATE categorias_financieras SET modulo = 'tienda' WHERE slug IN (
  'ventas-tienda', 'ventas-online', 'ventas-pos',
  'compras-proveedores', 'mercaderia-tienda',
  'otros-ingresos', 'otros-egresos'
);

-- 3. RLS policies para rol tienda en movimientos_financieros
CREATE POLICY "Tienda: lectura movimientos"
  ON movimientos_financieros FOR SELECT
  USING (
    tiene_algun_rol(ARRAY['tienda'])
    AND cuenta_id IN (SELECT id FROM cuentas_financieras WHERE modulo = 'tienda')
  );

CREATE POLICY "Tienda: crear movimientos"
  ON movimientos_financieros FOR INSERT
  WITH CHECK (
    tiene_algun_rol(ARRAY['tienda'])
    AND cuenta_id IN (SELECT id FROM cuentas_financieras WHERE modulo = 'tienda')
  );

CREATE POLICY "Tienda: actualizar movimientos"
  ON movimientos_financieros FOR UPDATE
  USING (
    tiene_algun_rol(ARRAY['tienda'])
    AND cuenta_id IN (SELECT id FROM cuentas_financieras WHERE modulo = 'tienda')
  )
  WITH CHECK (
    tiene_algun_rol(ARRAY['tienda'])
    AND cuenta_id IN (SELECT id FROM cuentas_financieras WHERE modulo = 'tienda')
  );

CREATE POLICY "Tienda: eliminar movimientos"
  ON movimientos_financieros FOR DELETE
  USING (
    tiene_algun_rol(ARRAY['tienda'])
    AND cuenta_id IN (SELECT id FROM cuentas_financieras WHERE modulo = 'tienda')
  );

-- 4. RLS para tienda en cuentas_financieras (solo lectura de sus cuentas)
CREATE POLICY "Tienda: lectura cuentas"
  ON cuentas_financieras FOR SELECT
  USING (
    tiene_algun_rol(ARRAY['tienda'])
    AND modulo = 'tienda'
  );

-- 5. RLS para tienda en categorias_financieras (solo lectura de categorías tienda + subcategorías)
CREATE POLICY "Tienda: lectura categorías"
  ON categorias_financieras FOR SELECT
  USING (
    tiene_algun_rol(ARRAY['tienda'])
    AND (
      modulo = 'tienda'
      OR padre_id IN (SELECT id FROM categorias_financieras WHERE modulo = 'tienda')
    )
  );

-- 6. RLS para tienda en conciliaciones (lectura de conciliaciones de sus cuentas)
CREATE POLICY "Tienda: lectura conciliaciones"
  ON conciliaciones FOR SELECT
  USING (
    tiene_algun_rol(ARRAY['tienda'])
    AND cuenta_id IN (SELECT id FROM cuentas_financieras WHERE modulo = 'tienda')
  );

CREATE POLICY "Tienda: crear conciliaciones"
  ON conciliaciones FOR INSERT
  WITH CHECK (
    tiene_algun_rol(ARRAY['tienda'])
    AND cuenta_id IN (SELECT id FROM cuentas_financieras WHERE modulo = 'tienda')
  );

CREATE POLICY "Tienda: actualizar conciliaciones"
  ON conciliaciones FOR UPDATE
  USING (
    tiene_algun_rol(ARRAY['tienda'])
    AND cuenta_id IN (SELECT id FROM cuentas_financieras WHERE modulo = 'tienda')
  )
  WITH CHECK (
    tiene_algun_rol(ARRAY['tienda'])
    AND cuenta_id IN (SELECT id FROM cuentas_financieras WHERE modulo = 'tienda')
  );

-- 7. RLS para tienda en conciliacion_items
CREATE POLICY "Tienda: lectura conciliacion_items"
  ON conciliacion_items FOR SELECT
  USING (
    tiene_algun_rol(ARRAY['tienda'])
    AND conciliacion_id IN (
      SELECT id FROM conciliaciones
      WHERE cuenta_id IN (SELECT id FROM cuentas_financieras WHERE modulo = 'tienda')
    )
  );

CREATE POLICY "Tienda: crear conciliacion_items"
  ON conciliacion_items FOR INSERT
  WITH CHECK (
    tiene_algun_rol(ARRAY['tienda'])
    AND conciliacion_id IN (
      SELECT id FROM conciliaciones
      WHERE cuenta_id IN (SELECT id FROM cuentas_financieras WHERE modulo = 'tienda')
    )
  );

CREATE POLICY "Tienda: actualizar conciliacion_items"
  ON conciliacion_items FOR UPDATE
  USING (
    tiene_algun_rol(ARRAY['tienda'])
    AND conciliacion_id IN (
      SELECT id FROM conciliaciones
      WHERE cuenta_id IN (SELECT id FROM cuentas_financieras WHERE modulo = 'tienda')
    )
  )
  WITH CHECK (
    tiene_algun_rol(ARRAY['tienda'])
    AND conciliacion_id IN (
      SELECT id FROM conciliaciones
      WHERE cuenta_id IN (SELECT id FROM cuentas_financieras WHERE modulo = 'tienda')
    )
  );

-- 8. Extender trigger actualizar_saldo_cuenta para manejar UPDATE
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
  ELSIF TG_OP = 'UPDATE' THEN
    -- Revertir el movimiento viejo
    delta := CASE WHEN OLD.tipo = 'ingreso' THEN -OLD.monto ELSE OLD.monto END;
    UPDATE cuentas_financieras
    SET saldo_actual = saldo_actual + delta, updated_at = NOW()
    WHERE id = OLD.cuenta_id;
    -- Aplicar el movimiento nuevo
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

-- Recrear trigger para incluir UPDATE
DROP TRIGGER IF EXISTS on_movimiento_financiero ON movimientos_financieros;
CREATE TRIGGER on_movimiento_financiero
  AFTER INSERT OR UPDATE OR DELETE ON movimientos_financieros
  FOR EACH ROW EXECUTE FUNCTION actualizar_saldo_cuenta();
