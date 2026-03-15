-- ============================================
-- Migración 004: Eventos, entradas, escaneos
-- ============================================

-- 20. eventos
CREATE TABLE eventos (
  id SERIAL PRIMARY KEY,
  titulo VARCHAR(200) NOT NULL,
  slug VARCHAR(200) UNIQUE NOT NULL,
  descripcion TEXT,
  descripcion_corta VARCHAR(300),
  imagen_url TEXT,
  lugar VARCHAR(200),
  direccion TEXT,
  fecha_inicio TIMESTAMPTZ NOT NULL,
  fecha_fin TIMESTAMPTZ,
  capacidad_total INTEGER,
  estado VARCHAR(20) NOT NULL DEFAULT 'borrador'
    CHECK (estado IN ('borrador', 'publicado', 'agotado', 'finalizado', 'cancelado')),
  es_gratuito BOOLEAN DEFAULT FALSE,
  requiere_registro BOOLEAN DEFAULT TRUE,
  creado_por UUID REFERENCES perfiles(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 21. tipo_entradas
CREATE TABLE tipo_entradas (
  id SERIAL PRIMARY KEY,
  evento_id INTEGER NOT NULL REFERENCES eventos(id) ON DELETE CASCADE,
  nombre VARCHAR(100) NOT NULL,
  descripcion TEXT,
  precio DECIMAL(10,2) NOT NULL DEFAULT 0,
  moneda VARCHAR(3) DEFAULT 'UYU',
  capacidad INTEGER,
  solo_socios BOOLEAN DEFAULT FALSE,
  orden INTEGER DEFAULT 0,
  activo BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 22. lotes_entrada
CREATE TABLE lotes_entrada (
  id SERIAL PRIMARY KEY,
  tipo_entrada_id INTEGER NOT NULL REFERENCES tipo_entradas(id) ON DELETE CASCADE,
  nombre VARCHAR(100) NOT NULL,
  precio DECIMAL(10,2) NOT NULL,
  cantidad INTEGER NOT NULL,
  vendidas INTEGER DEFAULT 0,
  fecha_inicio TIMESTAMPTZ NOT NULL,
  fecha_fin TIMESTAMPTZ,
  estado VARCHAR(20) DEFAULT 'pendiente'
    CHECK (estado IN ('pendiente', 'activo', 'agotado', 'cerrado')),
  orden INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 23. entradas
CREATE TABLE entradas (
  id SERIAL PRIMARY KEY,
  codigo UUID DEFAULT gen_random_uuid() UNIQUE NOT NULL,
  evento_id INTEGER NOT NULL REFERENCES eventos(id),
  tipo_entrada_id INTEGER NOT NULL REFERENCES tipo_entradas(id),
  lote_id INTEGER REFERENCES lotes_entrada(id),
  perfil_id UUID REFERENCES perfiles(id),
  nombre_asistente VARCHAR(200),
  cedula_asistente VARCHAR(20),
  email_asistente VARCHAR(200),
  precio_pagado DECIMAL(10,2) NOT NULL,
  moneda VARCHAR(3) DEFAULT 'UYU',
  estado VARCHAR(20) NOT NULL DEFAULT 'pendiente'
    CHECK (estado IN ('pendiente', 'pagada', 'usada', 'cancelada', 'reembolsada')),
  metodo_pago VARCHAR(30)
    CHECK (metodo_pago IN ('mercadopago', 'efectivo', 'cortesia')),
  mercadopago_payment_id TEXT,
  qr_url TEXT,
  usado_at TIMESTAMPTZ,
  usado_por UUID REFERENCES perfiles(id),
  notas TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 24. escaneos_entrada
CREATE TABLE escaneos_entrada (
  id SERIAL PRIMARY KEY,
  entrada_id INTEGER REFERENCES entradas(id),
  codigo_escaneado UUID NOT NULL,
  evento_id INTEGER NOT NULL REFERENCES eventos(id),
  resultado VARCHAR(20) NOT NULL
    CHECK (resultado IN ('valido', 'ya_usado', 'no_encontrado', 'evento_incorrecto', 'cancelada')),
  escaneado_por UUID NOT NULL REFERENCES perfiles(id),
  ip_address INET,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
