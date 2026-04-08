-- Agregar timestamps de alta/baja al padrón de socios
ALTER TABLE padron_socios
  ADD COLUMN desactivado_at TIMESTAMPTZ,
  ADD COLUMN activo_since TIMESTAMPTZ DEFAULT NOW();

-- Socios activos actuales: activo_since = created_at
UPDATE padron_socios SET activo_since = created_at WHERE activo = TRUE;

-- Socios inactivos actuales: desactivado_at = updated_at, activo_since = null
UPDATE padron_socios SET desactivado_at = updated_at, activo_since = NULL WHERE activo = FALSE;
