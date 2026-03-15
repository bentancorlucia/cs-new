-- ============================================
-- Migración 005: Contenido institucional
-- ============================================

-- 25. contenido_paginas
CREATE TABLE contenido_paginas (
  id SERIAL PRIMARY KEY,
  pagina VARCHAR(100) NOT NULL,
  seccion VARCHAR(100) NOT NULL,
  titulo VARCHAR(200),
  contenido TEXT,
  imagen_url TEXT,
  orden INTEGER DEFAULT 0,
  activo BOOLEAN DEFAULT TRUE,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  updated_by UUID REFERENCES perfiles(id),
  UNIQUE(pagina, seccion)
);

-- 26. memorias
CREATE TABLE memorias (
  id SERIAL PRIMARY KEY,
  anio INTEGER UNIQUE NOT NULL,
  titulo VARCHAR(200),
  archivo_url TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 27. directivos
CREATE TABLE directivos (
  id SERIAL PRIMARY KEY,
  nombre VARCHAR(200) NOT NULL,
  cargo VARCHAR(100) NOT NULL,
  tipo VARCHAR(30) NOT NULL
    CHECK (tipo IN ('directiva', 'fiscal', 'suplente')),
  foto_url TEXT,
  orden INTEGER DEFAULT 0,
  periodo VARCHAR(20),
  activo BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
