-- ============================================
-- Migración 001: Perfiles, Roles, Disciplinas
-- ============================================

-- 1. perfiles
CREATE TABLE perfiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  nombre VARCHAR(100) NOT NULL,
  apellido VARCHAR(100) NOT NULL,
  cedula VARCHAR(20) UNIQUE,
  telefono VARCHAR(20),
  fecha_nacimiento DATE,
  avatar_url TEXT,
  es_socio BOOLEAN DEFAULT FALSE,
  numero_socio VARCHAR(20) UNIQUE,
  estado_socio VARCHAR(20) DEFAULT 'inactivo'
    CHECK (estado_socio IN ('activo', 'inactivo', 'moroso', 'suspendido')),
  fecha_alta_socio TIMESTAMPTZ,
  notas TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. roles
CREATE TABLE roles (
  id SERIAL PRIMARY KEY,
  nombre VARCHAR(50) UNIQUE NOT NULL,
  descripcion TEXT
);

-- 3. perfil_roles
CREATE TABLE perfil_roles (
  id SERIAL PRIMARY KEY,
  perfil_id UUID NOT NULL REFERENCES perfiles(id) ON DELETE CASCADE,
  rol_id INTEGER NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  asignado_por UUID REFERENCES perfiles(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(perfil_id, rol_id)
);

-- 4. disciplinas
CREATE TABLE disciplinas (
  id SERIAL PRIMARY KEY,
  nombre VARCHAR(100) NOT NULL,
  slug VARCHAR(100) UNIQUE NOT NULL,
  descripcion TEXT,
  imagen_url TEXT,
  contacto_nombre VARCHAR(100),
  contacto_telefono VARCHAR(20),
  contacto_email VARCHAR(100),
  activa BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. perfil_disciplinas
CREATE TABLE perfil_disciplinas (
  id SERIAL PRIMARY KEY,
  perfil_id UUID NOT NULL REFERENCES perfiles(id) ON DELETE CASCADE,
  disciplina_id INTEGER NOT NULL REFERENCES disciplinas(id) ON DELETE CASCADE,
  categoria VARCHAR(100),
  activa BOOLEAN DEFAULT TRUE,
  fecha_ingreso DATE DEFAULT CURRENT_DATE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(perfil_id, disciplina_id, categoria)
);

-- 6. pagos_socios
CREATE TABLE pagos_socios (
  id SERIAL PRIMARY KEY,
  perfil_id UUID NOT NULL REFERENCES perfiles(id) ON DELETE CASCADE,
  monto DECIMAL(10,2) NOT NULL,
  moneda VARCHAR(3) DEFAULT 'UYU',
  periodo_mes INTEGER NOT NULL CHECK (periodo_mes BETWEEN 1 AND 12),
  periodo_anio INTEGER NOT NULL,
  metodo_pago VARCHAR(30) NOT NULL
    CHECK (metodo_pago IN ('efectivo', 'mercadopago', 'transferencia')),
  referencia_pago TEXT,
  registrado_por UUID REFERENCES perfiles(id),
  notas TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(perfil_id, periodo_mes, periodo_anio)
);
