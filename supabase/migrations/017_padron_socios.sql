-- ============================================
-- Migración 017: Padrón de Socios
-- Tabla independiente de auth para registro de socios
-- ============================================

-- 1. Tabla padron_socios (registro maestro de socios, sin dependencia de auth)
CREATE TABLE padron_socios (
  id SERIAL PRIMARY KEY,
  nombre VARCHAR(100) NOT NULL,
  apellido VARCHAR(100) NOT NULL,
  cedula VARCHAR(20) NOT NULL UNIQUE,
  fecha_nacimiento DATE,
  telefono VARCHAR(20),
  activo BOOLEAN NOT NULL DEFAULT TRUE,
  notas TEXT,
  -- Vinculación con usuario autenticado (nullable hasta que el usuario verifique)
  perfil_id UUID UNIQUE REFERENCES perfiles(id) ON DELETE SET NULL,
  vinculado_at TIMESTAMPTZ,
  created_by UUID REFERENCES perfiles(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Tabla padron_disciplinas (asociación socio-disciplina)
CREATE TABLE padron_disciplinas (
  id SERIAL PRIMARY KEY,
  padron_socio_id INTEGER NOT NULL REFERENCES padron_socios(id) ON DELETE CASCADE,
  disciplina_id INTEGER NOT NULL REFERENCES disciplinas(id) ON DELETE CASCADE,
  categoria VARCHAR(100),
  activa BOOLEAN DEFAULT TRUE,
  fecha_ingreso DATE DEFAULT CURRENT_DATE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(padron_socio_id, disciplina_id, categoria)
);

-- 3. Modificar perfiles: agregar columnas nuevas
ALTER TABLE perfiles ADD COLUMN socio_verificado BOOLEAN DEFAULT FALSE;
ALTER TABLE perfiles ADD COLUMN padron_socio_id INTEGER REFERENCES padron_socios(id) ON DELETE SET NULL;

-- 4. Modificar perfiles: eliminar columnas redundantes (ahora viven en padron_socios)
ALTER TABLE perfiles DROP COLUMN IF EXISTS numero_socio;
ALTER TABLE perfiles DROP COLUMN IF EXISTS estado_socio;
ALTER TABLE perfiles DROP COLUMN IF EXISTS fecha_alta_socio;
ALTER TABLE perfiles DROP COLUMN IF EXISTS notas;

-- 5. Índices
CREATE INDEX idx_padron_cedula ON padron_socios(cedula);
CREATE INDEX idx_padron_perfil ON padron_socios(perfil_id) WHERE perfil_id IS NOT NULL;
CREATE INDEX idx_padron_activo ON padron_socios(activo);
CREATE INDEX idx_padron_disciplinas_socio ON padron_disciplinas(padron_socio_id);
CREATE INDEX idx_perfiles_padron_socio ON perfiles(padron_socio_id) WHERE padron_socio_id IS NOT NULL;

-- 6. Trigger updated_at para padron_socios
CREATE TRIGGER set_updated_at_padron_socios
  BEFORE UPDATE ON padron_socios
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- 7. Actualizar trigger handle_new_user para soportar Google OAuth metadata
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.perfiles (id, nombre, apellido)
  VALUES (
    NEW.id,
    COALESCE(
      NEW.raw_user_meta_data->>'nombre',
      NEW.raw_user_meta_data->>'given_name',
      SPLIT_PART(COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', ''), ' ', 1),
      ''
    ),
    COALESCE(
      NEW.raw_user_meta_data->>'apellido',
      NEW.raw_user_meta_data->>'family_name',
      NULLIF(SPLIT_PART(COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', ''), ' ', 2), ''),
      ''
    )
  );

  -- Asignar rol no_socio automáticamente
  INSERT INTO public.perfil_roles (perfil_id, rol_id)
  SELECT NEW.id, r.id FROM public.roles r WHERE r.nombre = 'no_socio';

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ========================
-- 8. RLS para padron_socios
-- ========================
ALTER TABLE padron_socios ENABLE ROW LEVEL SECURITY;

-- Secretaría y admin ven todos los registros
CREATE POLICY "Staff ve todo el padrón"
  ON padron_socios FOR SELECT
  USING (tiene_algun_rol(ARRAY['super_admin', 'secretaria']));

-- Usuario autenticado ve solo su registro vinculado
CREATE POLICY "Usuario ve su registro vinculado"
  ON padron_socios FOR SELECT
  USING (auth.uid() = perfil_id);

-- Solo secretaría/admin pueden insertar
CREATE POLICY "Secretaría inserta en padrón"
  ON padron_socios FOR INSERT
  WITH CHECK (tiene_algun_rol(ARRAY['super_admin', 'secretaria']));

-- Solo secretaría/admin pueden actualizar
CREATE POLICY "Secretaría actualiza padrón"
  ON padron_socios FOR UPDATE
  USING (tiene_algun_rol(ARRAY['super_admin', 'secretaria']));

-- Solo secretaría/admin pueden eliminar
CREATE POLICY "Secretaría elimina del padrón"
  ON padron_socios FOR DELETE
  USING (tiene_algun_rol(ARRAY['super_admin', 'secretaria']));

-- ========================
-- 9. RLS para padron_disciplinas
-- ========================
ALTER TABLE padron_disciplinas ENABLE ROW LEVEL SECURITY;

-- Secretaría y admin ven todas las disciplinas del padrón
CREATE POLICY "Staff ve disciplinas del padrón"
  ON padron_disciplinas FOR SELECT
  USING (tiene_algun_rol(ARRAY['super_admin', 'secretaria']));

-- Usuario ve sus propias disciplinas (via padron_socios.perfil_id)
CREATE POLICY "Usuario ve sus disciplinas del padrón"
  ON padron_disciplinas FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM padron_socios ps
      WHERE ps.id = padron_socio_id
      AND ps.perfil_id = auth.uid()
    )
  );

-- Solo secretaría/admin gestionan disciplinas del padrón
CREATE POLICY "Secretaría gestiona disciplinas del padrón"
  ON padron_disciplinas FOR ALL
  USING (tiene_algun_rol(ARRAY['super_admin', 'secretaria']));
