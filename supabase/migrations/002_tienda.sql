-- ============================================
-- Migración 002: Tienda (productos, pedidos, stock, pagos MP)
-- ============================================

-- 7. categorias_producto
CREATE TABLE categorias_producto (
  id SERIAL PRIMARY KEY,
  nombre VARCHAR(100) NOT NULL,
  slug VARCHAR(100) UNIQUE NOT NULL,
  descripcion TEXT,
  imagen_url TEXT,
  orden INTEGER DEFAULT 0,
  activa BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 8. productos
CREATE TABLE productos (
  id SERIAL PRIMARY KEY,
  nombre VARCHAR(200) NOT NULL,
  slug VARCHAR(200) UNIQUE NOT NULL,
  descripcion TEXT,
  descripcion_corta VARCHAR(300),
  categoria_id INTEGER REFERENCES categorias_producto(id),
  precio DECIMAL(10,2) NOT NULL,
  precio_socio DECIMAL(10,2),
  moneda VARCHAR(3) DEFAULT 'UYU',
  sku VARCHAR(50) UNIQUE,
  stock_actual INTEGER NOT NULL DEFAULT 0,
  stock_minimo INTEGER DEFAULT 5,
  peso DECIMAL(8,2),
  activo BOOLEAN DEFAULT TRUE,
  destacado BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 9. producto_variantes
CREATE TABLE producto_variantes (
  id SERIAL PRIMARY KEY,
  producto_id INTEGER NOT NULL REFERENCES productos(id) ON DELETE CASCADE,
  nombre VARCHAR(100) NOT NULL,
  sku VARCHAR(50) UNIQUE,
  precio_override DECIMAL(10,2),
  stock_actual INTEGER NOT NULL DEFAULT 0,
  atributos JSONB DEFAULT '{}',
  activo BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 10. producto_imagenes
CREATE TABLE producto_imagenes (
  id SERIAL PRIMARY KEY,
  producto_id INTEGER NOT NULL REFERENCES productos(id) ON DELETE CASCADE,
  url TEXT NOT NULL,
  alt_text VARCHAR(200),
  orden INTEGER DEFAULT 0,
  es_principal BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 11. pedidos
CREATE TABLE pedidos (
  id SERIAL PRIMARY KEY,
  numero_pedido VARCHAR(20) UNIQUE,
  perfil_id UUID REFERENCES perfiles(id),
  tipo VARCHAR(10) NOT NULL CHECK (tipo IN ('online', 'pos')),
  estado VARCHAR(20) NOT NULL DEFAULT 'pendiente'
    CHECK (estado IN ('pendiente', 'pagado', 'preparando', 'listo_retiro', 'retirado', 'cancelado')),
  subtotal DECIMAL(10,2) NOT NULL,
  descuento DECIMAL(10,2) DEFAULT 0,
  total DECIMAL(10,2) NOT NULL,
  moneda VARCHAR(3) DEFAULT 'UYU',
  metodo_pago VARCHAR(30)
    CHECK (metodo_pago IN ('mercadopago', 'efectivo', 'mercadopago_qr')),
  mercadopago_preference_id TEXT,
  mercadopago_payment_id TEXT,
  nombre_cliente VARCHAR(200),
  telefono_cliente VARCHAR(20),
  notas TEXT,
  vendedor_id UUID REFERENCES perfiles(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 12. pedido_items
CREATE TABLE pedido_items (
  id SERIAL PRIMARY KEY,
  pedido_id INTEGER NOT NULL REFERENCES pedidos(id) ON DELETE CASCADE,
  producto_id INTEGER NOT NULL REFERENCES productos(id),
  variante_id INTEGER REFERENCES producto_variantes(id),
  cantidad INTEGER NOT NULL CHECK (cantidad > 0),
  precio_unitario DECIMAL(10,2) NOT NULL,
  subtotal DECIMAL(10,2) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 13. stock_movimientos
CREATE TABLE stock_movimientos (
  id SERIAL PRIMARY KEY,
  producto_id INTEGER NOT NULL REFERENCES productos(id),
  variante_id INTEGER REFERENCES producto_variantes(id),
  tipo VARCHAR(20) NOT NULL
    CHECK (tipo IN ('entrada', 'salida', 'ajuste', 'venta', 'devolucion')),
  cantidad INTEGER NOT NULL,
  stock_anterior INTEGER NOT NULL,
  stock_nuevo INTEGER NOT NULL,
  referencia_tipo VARCHAR(20),
  referencia_id INTEGER,
  motivo TEXT,
  registrado_por UUID REFERENCES perfiles(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 14. pagos_mercadopago
CREATE TABLE pagos_mercadopago (
  id SERIAL PRIMARY KEY,
  tipo_origen VARCHAR(20) NOT NULL CHECK (tipo_origen IN ('pedido', 'entrada')),
  origen_id INTEGER NOT NULL,
  mercadopago_payment_id TEXT UNIQUE NOT NULL,
  mercadopago_status VARCHAR(50),
  mercadopago_status_detail TEXT,
  monto DECIMAL(10,2) NOT NULL,
  moneda VARCHAR(3) DEFAULT 'UYU',
  metodo VARCHAR(50),
  raw_data JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
