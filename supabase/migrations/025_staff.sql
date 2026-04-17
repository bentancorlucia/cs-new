-- ============================================
-- Migración 025: Staff del club
-- Personas que trabajan en el club (entrenadores, administrativos,
-- profesionales, mantenimiento, directivos). Pueden o no ser socios;
-- pueden o no estar asociadas a una disciplina.
-- ============================================

-- 1. Tabla staff
CREATE TABLE staff (
  id SERIAL PRIMARY KEY,
  nombre VARCHAR(100) NOT NULL,
  apellido VARCHAR(100) NOT NULL,
  cedula VARCHAR(20) NOT NULL UNIQUE,
  cargo VARCHAR(100) NOT NULL,
  disciplina_id INTEGER REFERENCES disciplinas(id) ON DELETE SET NULL,
  telefono VARCHAR(20),
  email VARCHAR(100),
  descripcion TEXT,
  activo BOOLEAN NOT NULL DEFAULT TRUE,
  fecha_ingreso DATE DEFAULT CURRENT_DATE,
  notas TEXT,
  created_by UUID REFERENCES perfiles(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Índices
CREATE INDEX idx_staff_disciplina ON staff(disciplina_id);
CREATE INDEX idx_staff_cedula ON staff(cedula);
CREATE INDEX idx_staff_activo ON staff(activo);

-- 3. Trigger updated_at
CREATE TRIGGER set_updated_at_staff
  BEFORE UPDATE ON staff
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ========================
-- 4. RLS
-- ========================
ALTER TABLE staff ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Secretaría ve staff"
  ON staff FOR SELECT
  USING (tiene_algun_rol(ARRAY['super_admin', 'secretaria']));

CREATE POLICY "Secretaría inserta staff"
  ON staff FOR INSERT
  WITH CHECK (tiene_algun_rol(ARRAY['super_admin', 'secretaria']));

CREATE POLICY "Secretaría actualiza staff"
  ON staff FOR UPDATE
  USING (tiene_algun_rol(ARRAY['super_admin', 'secretaria']));

CREATE POLICY "Secretaría elimina staff"
  ON staff FOR DELETE
  USING (tiene_algun_rol(ARRAY['super_admin', 'secretaria']));
