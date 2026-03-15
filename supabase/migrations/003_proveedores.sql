-- ============================================
-- Migración 003: Proveedores y compras
-- ============================================

-- 15. proveedores
CREATE TABLE proveedores (
  id SERIAL PRIMARY KEY,
  nombre VARCHAR(200) NOT NULL,
  rut VARCHAR(20) UNIQUE,
  razon_social VARCHAR(200),
  contacto_nombre VARCHAR(100),
  contacto_telefono VARCHAR(20),
  contacto_email VARCHAR(100),
  direccion TEXT,
  notas TEXT,
  saldo_cuenta_corriente DECIMAL(12,2) DEFAULT 0,
  activo BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 16. producto_proveedores
CREATE TABLE producto_proveedores (
  id SERIAL PRIMARY KEY,
  producto_id INTEGER NOT NULL REFERENCES productos(id) ON DELETE CASCADE,
  proveedor_id INTEGER NOT NULL REFERENCES proveedores(id) ON DELETE CASCADE,
  costo DECIMAL(10,2),
  codigo_proveedor VARCHAR(50),
  es_principal BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(producto_id, proveedor_id)
);

-- 17. compras_proveedor
CREATE TABLE compras_proveedor (
  id SERIAL PRIMARY KEY,
  numero_compra VARCHAR(20) UNIQUE NOT NULL,
  proveedor_id INTEGER NOT NULL REFERENCES proveedores(id),
  estado VARCHAR(20) NOT NULL DEFAULT 'borrador'
    CHECK (estado IN ('borrador', 'confirmada', 'recibida', 'cancelada')),
  subtotal DECIMAL(12,2) NOT NULL DEFAULT 0,
  impuestos DECIMAL(12,2) DEFAULT 0,
  total DECIMAL(12,2) NOT NULL DEFAULT 0,
  moneda VARCHAR(3) DEFAULT 'UYU',
  fecha_compra DATE DEFAULT CURRENT_DATE,
  fecha_recepcion DATE,
  notas TEXT,
  registrado_por UUID REFERENCES perfiles(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 18. compra_items
CREATE TABLE compra_items (
  id SERIAL PRIMARY KEY,
  compra_id INTEGER NOT NULL REFERENCES compras_proveedor(id) ON DELETE CASCADE,
  producto_id INTEGER NOT NULL REFERENCES productos(id),
  variante_id INTEGER REFERENCES producto_variantes(id),
  cantidad INTEGER NOT NULL CHECK (cantidad > 0),
  costo_unitario DECIMAL(10,2) NOT NULL,
  subtotal DECIMAL(10,2) NOT NULL,
  cantidad_recibida INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 19. pagos_proveedor
CREATE TABLE pagos_proveedor (
  id SERIAL PRIMARY KEY,
  proveedor_id INTEGER NOT NULL REFERENCES proveedores(id),
  compra_id INTEGER REFERENCES compras_proveedor(id),
  monto DECIMAL(12,2) NOT NULL,
  moneda VARCHAR(3) DEFAULT 'UYU',
  metodo_pago VARCHAR(30) NOT NULL
    CHECK (metodo_pago IN ('efectivo', 'transferencia', 'cheque', 'otro')),
  referencia TEXT,
  notas TEXT,
  registrado_por UUID REFERENCES perfiles(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);
