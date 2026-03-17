# Database Schema — Supabase (PostgreSQL)

## Diagrama de Relaciones

```
perfiles ──< perfil_roles >── roles
perfiles ──< perfil_disciplinas >── disciplinas
perfiles ──< pedidos
perfiles ──< entradas
perfiles ──< pagos_socios

productos ──< producto_imagenes
productos ──< pedido_items >── pedidos
productos ──< stock_movimientos
productos ──< producto_proveedores >── proveedores

proveedores ──< compras_proveedor ──< compra_items
proveedores ──< pagos_proveedor
proveedores ──< producto_proveedores

eventos ──< tipo_entradas ──< lotes_entrada
eventos ──< entradas
entradas ──< escaneos_entrada

pedidos ──< pedido_items
pedidos ──< pagos_mercadopago

categorias_producto ──< productos
```

## Tablas

### 1. `perfiles`
Extiende `auth.users` de Supabase. Se crea automáticamente al registrarse.

```sql
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

-- Trigger para crear perfil al registrarse
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.perfiles (id, nombre, apellido)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'nombre', ''),
    COALESCE(NEW.raw_user_meta_data->>'apellido', '')
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
```

### 2. `roles`

```sql
CREATE TABLE roles (
  id SERIAL PRIMARY KEY,
  nombre VARCHAR(50) UNIQUE NOT NULL,
  descripcion TEXT
);

-- Seed
INSERT INTO roles (nombre, descripcion) VALUES
  ('super_admin', 'Acceso total al sistema'),
  ('tienda', 'Administración de tienda, stock y POS'),
  ('secretaria', 'Gestión de socios y disciplinas'),
  ('eventos', 'Gestión de eventos y entradas'),
  ('scanner', 'Escaneo de QR en eventos'),
  ('tesorero', 'Gestión financiera, cuentas, presupuesto y reportes'),
  ('socio', 'Socio activo del club'),
  ('no_socio', 'Usuario registrado sin membresía');
```

### 3. `perfil_roles`
Relación muchos-a-muchos entre perfiles y roles.

```sql
CREATE TABLE perfil_roles (
  id SERIAL PRIMARY KEY,
  perfil_id UUID NOT NULL REFERENCES perfiles(id) ON DELETE CASCADE,
  rol_id INTEGER NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  asignado_por UUID REFERENCES perfiles(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(perfil_id, rol_id)
);
```

### 4. `disciplinas`

```sql
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

-- Seed
INSERT INTO disciplinas (nombre, slug) VALUES
  ('Básquetbol', 'basquetbol'),
  ('Corredores', 'corredores'),
  ('Handball', 'handball'),
  ('Hockey', 'hockey'),
  ('Fútbol', 'futbol'),
  ('Rugby', 'rugby'),
  ('Vóleibol', 'voley');
```

### 5. `perfil_disciplinas`

```sql
CREATE TABLE perfil_disciplinas (
  id SERIAL PRIMARY KEY,
  perfil_id UUID NOT NULL REFERENCES perfiles(id) ON DELETE CASCADE,
  disciplina_id INTEGER NOT NULL REFERENCES disciplinas(id) ON DELETE CASCADE,
  categoria VARCHAR(100), -- ej: "Primera", "Sub-19", "Mami Hockey"
  activa BOOLEAN DEFAULT TRUE,
  fecha_ingreso DATE DEFAULT CURRENT_DATE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(perfil_id, disciplina_id, categoria)
);
```

### 6. `pagos_socios`
Historial de cuotas de socios.

```sql
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
```

---

## Módulo Tienda

### 7. `categorias_producto`

```sql
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
```

### 8. `productos`

```sql
CREATE TABLE productos (
  id SERIAL PRIMARY KEY,
  nombre VARCHAR(200) NOT NULL,
  slug VARCHAR(200) UNIQUE NOT NULL,
  descripcion TEXT,
  descripcion_corta VARCHAR(300),
  categoria_id INTEGER REFERENCES categorias_producto(id),
  precio DECIMAL(10,2) NOT NULL,
  precio_socio DECIMAL(10,2), -- precio especial para socios (nullable)
  moneda VARCHAR(3) DEFAULT 'UYU',
  sku VARCHAR(50) UNIQUE,
  stock_actual INTEGER NOT NULL DEFAULT 0,
  stock_minimo INTEGER DEFAULT 5, -- alerta cuando baja de este nivel
  peso DECIMAL(8,2), -- en gramos, por si se necesita a futuro
  activo BOOLEAN DEFAULT TRUE,
  destacado BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

### 9. `producto_variantes`
Para productos con tallas, colores, etc.

```sql
CREATE TABLE producto_variantes (
  id SERIAL PRIMARY KEY,
  producto_id INTEGER NOT NULL REFERENCES productos(id) ON DELETE CASCADE,
  nombre VARCHAR(100) NOT NULL, -- ej: "Talle M - Rojo"
  sku VARCHAR(50) UNIQUE,
  precio_override DECIMAL(10,2), -- si es null, usa el del producto
  stock_actual INTEGER NOT NULL DEFAULT 0,
  atributos JSONB DEFAULT '{}', -- {"talle": "M", "color": "Rojo"}
  activo BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

### 10. `producto_imagenes`

```sql
CREATE TABLE producto_imagenes (
  id SERIAL PRIMARY KEY,
  producto_id INTEGER NOT NULL REFERENCES productos(id) ON DELETE CASCADE,
  url TEXT NOT NULL,
  alt_text VARCHAR(200),
  orden INTEGER DEFAULT 0,
  es_principal BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

### 11. `pedidos`

```sql
CREATE TABLE pedidos (
  id SERIAL PRIMARY KEY,
  numero_pedido VARCHAR(20) UNIQUE NOT NULL, -- ej: "CS-20260314-001"
  perfil_id UUID REFERENCES perfiles(id), -- nullable para ventas POS sin usuario
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
  nombre_cliente VARCHAR(200), -- para ventas POS sin usuario registrado
  telefono_cliente VARCHAR(20),
  notas TEXT,
  vendedor_id UUID REFERENCES perfiles(id), -- quien hizo la venta (POS)
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Generar número de pedido automáticamente
CREATE OR REPLACE FUNCTION generar_numero_pedido()
RETURNS TRIGGER AS $$
DECLARE
  fecha_str TEXT;
  secuencia INTEGER;
BEGIN
  fecha_str := TO_CHAR(NOW(), 'YYYYMMDD');
  SELECT COALESCE(MAX(
    CAST(SPLIT_PART(numero_pedido, '-', 3) AS INTEGER)
  ), 0) + 1 INTO secuencia
  FROM pedidos
  WHERE numero_pedido LIKE 'CS-' || fecha_str || '-%';

  NEW.numero_pedido := 'CS-' || fecha_str || '-' || LPAD(secuencia::TEXT, 3, '0');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_numero_pedido
  BEFORE INSERT ON pedidos
  FOR EACH ROW
  WHEN (NEW.numero_pedido IS NULL)
  EXECUTE FUNCTION generar_numero_pedido();
```

### 12. `pedido_items`

```sql
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
```

### 13. `stock_movimientos`
Auditoría de todo movimiento de stock.

```sql
CREATE TABLE stock_movimientos (
  id SERIAL PRIMARY KEY,
  producto_id INTEGER NOT NULL REFERENCES productos(id),
  variante_id INTEGER REFERENCES producto_variantes(id),
  tipo VARCHAR(20) NOT NULL
    CHECK (tipo IN ('entrada', 'salida', 'ajuste', 'venta', 'devolucion')),
  cantidad INTEGER NOT NULL, -- positivo = entrada, negativo = salida
  stock_anterior INTEGER NOT NULL,
  stock_nuevo INTEGER NOT NULL,
  referencia_tipo VARCHAR(20), -- 'pedido', 'compra', 'ajuste_manual'
  referencia_id INTEGER,
  motivo TEXT,
  registrado_por UUID REFERENCES perfiles(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

### 14. `pagos_mercadopago`

```sql
CREATE TABLE pagos_mercadopago (
  id SERIAL PRIMARY KEY,
  tipo_origen VARCHAR(20) NOT NULL CHECK (tipo_origen IN ('pedido', 'entrada')),
  origen_id INTEGER NOT NULL, -- pedido_id o entrada_id
  mercadopago_payment_id TEXT UNIQUE NOT NULL,
  mercadopago_status VARCHAR(50),
  mercadopago_status_detail TEXT,
  monto DECIMAL(10,2) NOT NULL,
  moneda VARCHAR(3) DEFAULT 'UYU',
  metodo VARCHAR(50), -- credit_card, debit_card, etc.
  raw_data JSONB, -- respuesta completa de MP
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

---

## Módulo Proveedores

### 15. `proveedores`

```sql
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
  saldo_cuenta_corriente DECIMAL(12,2) DEFAULT 0, -- positivo = le debemos
  activo BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

### 16. `producto_proveedores`
Qué proveedores suministran qué productos.

```sql
CREATE TABLE producto_proveedores (
  id SERIAL PRIMARY KEY,
  producto_id INTEGER NOT NULL REFERENCES productos(id) ON DELETE CASCADE,
  proveedor_id INTEGER NOT NULL REFERENCES proveedores(id) ON DELETE CASCADE,
  costo DECIMAL(10,2), -- último costo conocido
  codigo_proveedor VARCHAR(50), -- código del producto en el proveedor
  es_principal BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(producto_id, proveedor_id)
);
```

### 17. `compras_proveedor`

```sql
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
```

### 18. `compra_items`

```sql
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
```

### 19. `pagos_proveedor`

```sql
CREATE TABLE pagos_proveedor (
  id SERIAL PRIMARY KEY,
  proveedor_id INTEGER NOT NULL REFERENCES proveedores(id),
  compra_id INTEGER REFERENCES compras_proveedor(id), -- nullable para pagos a cuenta
  monto DECIMAL(12,2) NOT NULL,
  moneda VARCHAR(3) DEFAULT 'UYU',
  metodo_pago VARCHAR(30) NOT NULL
    CHECK (metodo_pago IN ('efectivo', 'transferencia', 'cheque', 'otro')),
  referencia TEXT,
  notas TEXT,
  registrado_por UUID REFERENCES perfiles(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Trigger para actualizar saldo cuenta corriente
CREATE OR REPLACE FUNCTION actualizar_saldo_proveedor()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE proveedores
    SET saldo_cuenta_corriente = saldo_cuenta_corriente - NEW.monto,
        updated_at = NOW()
    WHERE id = NEW.proveedor_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER on_pago_proveedor
  AFTER INSERT ON pagos_proveedor
  FOR EACH ROW EXECUTE FUNCTION actualizar_saldo_proveedor();

-- Trigger para aumentar deuda al confirmar compra
CREATE OR REPLACE FUNCTION actualizar_deuda_compra()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.estado = 'confirmada' AND OLD.estado = 'borrador' THEN
    UPDATE proveedores
    SET saldo_cuenta_corriente = saldo_cuenta_corriente + NEW.total,
        updated_at = NOW()
    WHERE id = NEW.proveedor_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER on_compra_confirmada
  AFTER UPDATE ON compras_proveedor
  FOR EACH ROW EXECUTE FUNCTION actualizar_deuda_compra();
```

---

## Módulo Eventos

### 20. `eventos`

```sql
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
```

### 21. `tipo_entradas`
Tipos de entrada por evento (General, VIP, Socio, etc.)

```sql
CREATE TABLE tipo_entradas (
  id SERIAL PRIMARY KEY,
  evento_id INTEGER NOT NULL REFERENCES eventos(id) ON DELETE CASCADE,
  nombre VARCHAR(100) NOT NULL, -- "General", "VIP", "Socio"
  descripcion TEXT,
  precio DECIMAL(10,2) NOT NULL DEFAULT 0,
  moneda VARCHAR(3) DEFAULT 'UYU',
  capacidad INTEGER, -- null = sin límite (usa capacidad del evento)
  solo_socios BOOLEAN DEFAULT FALSE, -- si true, solo socios pueden comprar
  orden INTEGER DEFAULT 0,
  activo BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

### 22. `lotes_entrada`
Lotes por tipo de entrada (Early Bird, Preventa, etc.)

```sql
CREATE TABLE lotes_entrada (
  id SERIAL PRIMARY KEY,
  tipo_entrada_id INTEGER NOT NULL REFERENCES tipo_entradas(id) ON DELETE CASCADE,
  nombre VARCHAR(100) NOT NULL, -- "Early Bird", "Preventa", "Venta General"
  precio DECIMAL(10,2) NOT NULL, -- sobrescribe el precio del tipo
  cantidad INTEGER NOT NULL, -- cuántas entradas tiene este lote
  vendidas INTEGER DEFAULT 0,
  fecha_inicio TIMESTAMPTZ NOT NULL, -- cuándo abre este lote
  fecha_fin TIMESTAMPTZ, -- cuándo cierra (null = hasta agotar)
  estado VARCHAR(20) DEFAULT 'pendiente'
    CHECK (estado IN ('pendiente', 'activo', 'agotado', 'cerrado')),
  orden INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

### 23. `entradas`
Cada entrada vendida/emitida.

```sql
CREATE TABLE entradas (
  id SERIAL PRIMARY KEY,
  codigo UUID DEFAULT gen_random_uuid() UNIQUE NOT NULL, -- para el QR
  evento_id INTEGER NOT NULL REFERENCES eventos(id),
  tipo_entrada_id INTEGER NOT NULL REFERENCES tipo_entradas(id),
  lote_id INTEGER REFERENCES lotes_entrada(id),
  perfil_id UUID REFERENCES perfiles(id), -- comprador
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
  qr_url TEXT, -- URL de la imagen del QR generado
  usado_at TIMESTAMPTZ, -- cuándo se escaneó
  usado_por UUID REFERENCES perfiles(id), -- quién escaneó (scanner)
  notas TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

### 24. `escaneos_entrada`
Log de todos los intentos de escaneo (exitosos y fallidos).

```sql
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
```

---

## Tablas Auxiliares

### 25. `contenido_paginas`
Para contenido editable de páginas institucionales.

```sql
CREATE TABLE contenido_paginas (
  id SERIAL PRIMARY KEY,
  pagina VARCHAR(100) NOT NULL, -- 'inicio', 'directiva', etc.
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
```

### 26. `memorias`

```sql
CREATE TABLE memorias (
  id SERIAL PRIMARY KEY,
  anio INTEGER UNIQUE NOT NULL,
  titulo VARCHAR(200),
  archivo_url TEXT NOT NULL, -- PDF en Supabase Storage
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

### 27. `directivos`

```sql
CREATE TABLE directivos (
  id SERIAL PRIMARY KEY,
  nombre VARCHAR(200) NOT NULL,
  cargo VARCHAR(100) NOT NULL,
  tipo VARCHAR(30) NOT NULL
    CHECK (tipo IN ('directiva', 'fiscal', 'suplente')),
  foto_url TEXT,
  orden INTEGER DEFAULT 0,
  periodo VARCHAR(20), -- "2024-2026"
  activo BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

---

## Row Level Security (RLS)

**IMPORTANTE**: Todas las tablas deben tener RLS habilitado. Ejemplo patrón:

```sql
-- Habilitar RLS
ALTER TABLE perfiles ENABLE ROW LEVEL SECURITY;

-- Lectura: cada usuario ve su propio perfil
CREATE POLICY "Usuarios ven su propio perfil"
  ON perfiles FOR SELECT
  USING (auth.uid() = id);

-- Lectura: staff puede ver todos los perfiles
CREATE POLICY "Staff ve todos los perfiles"
  ON perfiles FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM perfil_roles pr
      JOIN roles r ON r.id = pr.rol_id
      WHERE pr.perfil_id = auth.uid()
      AND r.nombre IN ('super_admin', 'secretaria', 'tienda', 'eventos')
    )
  );

-- Actualización: usuario actualiza su propio perfil
CREATE POLICY "Usuario actualiza su perfil"
  ON perfiles FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- Actualización: secretaría puede actualizar cualquier perfil
CREATE POLICY "Secretaría actualiza perfiles"
  ON perfiles FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM perfil_roles pr
      JOIN roles r ON r.id = pr.rol_id
      WHERE pr.perfil_id = auth.uid()
      AND r.nombre IN ('super_admin', 'secretaria')
    )
  );
```

Aplicar patrón similar para cada tabla según qué roles necesitan acceso.

---

## Módulo Tesorería

### 28. `cuentas_financieras`

```sql
CREATE TABLE cuentas_financieras (
  id SERIAL PRIMARY KEY,
  nombre VARCHAR(200) NOT NULL,
  tipo VARCHAR(20) NOT NULL
    CHECK (tipo IN ('bancaria', 'mercadopago', 'caja_chica', 'virtual')),
  moneda VARCHAR(3) NOT NULL CHECK (moneda IN ('UYU', 'USD')),
  banco VARCHAR(100),
  numero_cuenta VARCHAR(50),
  saldo_actual DECIMAL(14,2) NOT NULL DEFAULT 0,
  saldo_inicial DECIMAL(14,2) NOT NULL DEFAULT 0,
  descripcion TEXT,
  color VARCHAR(7), -- hex para UI
  activa BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

### 29. `categorias_financieras`

```sql
CREATE TABLE categorias_financieras (
  id SERIAL PRIMARY KEY,
  nombre VARCHAR(100) NOT NULL,
  slug VARCHAR(100) UNIQUE NOT NULL,
  tipo VARCHAR(10) NOT NULL CHECK (tipo IN ('ingreso', 'egreso')),
  padre_id INTEGER REFERENCES categorias_financieras(id) ON DELETE SET NULL,
  color VARCHAR(7),
  icono VARCHAR(50),
  presupuesto_mensual DECIMAL(12,2),
  orden INTEGER DEFAULT 0,
  activa BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

### 30. `movimientos_financieros`

```sql
CREATE TABLE movimientos_financieros (
  id SERIAL PRIMARY KEY,
  cuenta_id INTEGER NOT NULL REFERENCES cuentas_financieras(id),
  tipo VARCHAR(10) NOT NULL CHECK (tipo IN ('ingreso', 'egreso')),
  categoria_id INTEGER NOT NULL REFERENCES categorias_financieras(id),
  subcategoria_id INTEGER REFERENCES categorias_financieras(id),
  monto DECIMAL(14,2) NOT NULL CHECK (monto > 0),
  moneda VARCHAR(3) NOT NULL CHECK (moneda IN ('UYU', 'USD')),
  fecha DATE NOT NULL,
  descripcion VARCHAR(500) NOT NULL,
  comprobante_url TEXT,
  referencia VARCHAR(100),
  origen_tipo VARCHAR(30),
    -- 'manual', 'pedido', 'cuota', 'entrada', 'transferencia', 'pago_proveedor', 'conciliacion'
  origen_id INTEGER,
  transferencia_id INTEGER REFERENCES transferencias_internas(id),
  conciliado BOOLEAN DEFAULT FALSE,
  conciliacion_id INTEGER REFERENCES conciliaciones(id),
  tags TEXT[], -- array de etiquetas libres
  notas TEXT,
  registrado_por UUID REFERENCES perfiles(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Trigger para actualizar saldo de la cuenta
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
  ELSIF TG_OP = 'DELETE' THEN
    delta := CASE WHEN OLD.tipo = 'ingreso' THEN -OLD.monto ELSE OLD.monto END;
    UPDATE cuentas_financieras
    SET saldo_actual = saldo_actual + delta, updated_at = NOW()
    WHERE id = OLD.cuenta_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER on_movimiento_financiero
  AFTER INSERT OR DELETE ON movimientos_financieros
  FOR EACH ROW EXECUTE FUNCTION actualizar_saldo_cuenta();
```

### 31. `transferencias_internas`

```sql
CREATE TABLE transferencias_internas (
  id SERIAL PRIMARY KEY,
  cuenta_origen_id INTEGER NOT NULL REFERENCES cuentas_financieras(id),
  cuenta_destino_id INTEGER NOT NULL REFERENCES cuentas_financieras(id),
  monto DECIMAL(14,2) NOT NULL CHECK (monto > 0),
  moneda_origen VARCHAR(3) NOT NULL,
  moneda_destino VARCHAR(3) NOT NULL,
  tipo_cambio DECIMAL(10,4), -- si es conversión UYU↔USD
  monto_destino DECIMAL(14,2) NOT NULL, -- monto convertido si aplica
  fecha DATE NOT NULL,
  descripcion VARCHAR(500),
  comprobante_url TEXT,
  movimiento_egreso_id INTEGER REFERENCES movimientos_financieros(id),
  movimiento_ingreso_id INTEGER REFERENCES movimientos_financieros(id),
  registrado_por UUID REFERENCES perfiles(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

### 32. `presupuestos`

```sql
CREATE TABLE presupuestos (
  id SERIAL PRIMARY KEY,
  anio INTEGER NOT NULL,
  mes INTEGER NOT NULL CHECK (mes BETWEEN 1 AND 12),
  categoria_id INTEGER NOT NULL REFERENCES categorias_financieras(id),
  monto_presupuestado DECIMAL(12,2) NOT NULL,
  notas TEXT,
  created_by UUID REFERENCES perfiles(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(anio, mes, categoria_id)
);
```

### 33. `conciliaciones`

```sql
CREATE TABLE conciliaciones (
  id SERIAL PRIMARY KEY,
  cuenta_id INTEGER NOT NULL REFERENCES cuentas_financieras(id),
  periodo_desde DATE NOT NULL,
  periodo_hasta DATE NOT NULL,
  saldo_banco DECIMAL(14,2) NOT NULL,
  saldo_sistema DECIMAL(14,2) NOT NULL,
  diferencia DECIMAL(14,2) NOT NULL,
  archivo_extracto_url TEXT, -- CSV/Excel subido
  estado VARCHAR(20) NOT NULL DEFAULT 'en_proceso'
    CHECK (estado IN ('en_proceso', 'completada')),
  movimientos_matcheados INTEGER DEFAULT 0,
  movimientos_pendientes_banco INTEGER DEFAULT 0,
  movimientos_pendientes_sistema INTEGER DEFAULT 0,
  completada_por UUID REFERENCES perfiles(id),
  completada_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

### 34. `conciliacion_items`

```sql
CREATE TABLE conciliacion_items (
  id SERIAL PRIMARY KEY,
  conciliacion_id INTEGER NOT NULL REFERENCES conciliaciones(id) ON DELETE CASCADE,
  movimiento_id INTEGER REFERENCES movimientos_financieros(id),
  fecha_banco DATE,
  descripcion_banco VARCHAR(500),
  monto_banco DECIMAL(14,2),
  estado VARCHAR(20) NOT NULL
    CHECK (estado IN ('matcheado', 'pendiente_sistema', 'pendiente_banco', 'ignorado')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

### 35. `cierres_mensuales`

```sql
CREATE TABLE cierres_mensuales (
  id SERIAL PRIMARY KEY,
  anio INTEGER NOT NULL,
  mes INTEGER NOT NULL CHECK (mes BETWEEN 1 AND 12),
  total_ingresos DECIMAL(14,2) NOT NULL,
  total_egresos DECIMAL(14,2) NOT NULL,
  resultado DECIMAL(14,2) NOT NULL,
  saldos_snapshot JSONB NOT NULL, -- {"cuenta_id": saldo, ...}
  categorias_snapshot JSONB, -- resumen por categoría
  estado VARCHAR(10) NOT NULL DEFAULT 'abierto'
    CHECK (estado IN ('abierto', 'cerrado')),
  cerrado_por UUID REFERENCES perfiles(id),
  cerrado_at TIMESTAMPTZ,
  notas TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(anio, mes)
);

-- Proteger movimientos de períodos cerrados
CREATE OR REPLACE FUNCTION proteger_periodo_cerrado()
RETURNS TRIGGER AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM cierres_mensuales
    WHERE estado = 'cerrado'
    AND anio = EXTRACT(YEAR FROM COALESCE(NEW.fecha, OLD.fecha))
    AND mes = EXTRACT(MONTH FROM COALESCE(NEW.fecha, OLD.fecha))
  ) THEN
    RAISE EXCEPTION 'No se pueden modificar movimientos de un período cerrado';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER check_periodo_cerrado
  BEFORE INSERT OR UPDATE OR DELETE ON movimientos_financieros
  FOR EACH ROW EXECUTE FUNCTION proteger_periodo_cerrado();
```

### 36. `arqueos_caja`
Para caja chica.

```sql
CREATE TABLE arqueos_caja (
  id SERIAL PRIMARY KEY,
  cuenta_id INTEGER NOT NULL REFERENCES cuentas_financieras(id),
  fecha DATE NOT NULL,
  saldo_sistema DECIMAL(14,2) NOT NULL,
  saldo_fisico DECIMAL(14,2) NOT NULL,
  diferencia DECIMAL(14,2) NOT NULL,
  notas TEXT,
  registrado_por UUID REFERENCES perfiles(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

---

## Función Helper para Verificar Roles

```sql
CREATE OR REPLACE FUNCTION tiene_rol(rol_nombre TEXT)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM perfil_roles pr
    JOIN roles r ON r.id = pr.rol_id
    WHERE pr.perfil_id = auth.uid()
    AND r.nombre = rol_nombre
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- Versión con múltiples roles
CREATE OR REPLACE FUNCTION tiene_algun_rol(roles_nombres TEXT[])
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM perfil_roles pr
    JOIN roles r ON r.id = pr.rol_id
    WHERE pr.perfil_id = auth.uid()
    AND r.nombre = ANY(roles_nombres)
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;
```

## Índices Recomendados

```sql
-- Búsquedas frecuentes
CREATE INDEX idx_perfil_roles_perfil ON perfil_roles(perfil_id);
CREATE INDEX idx_perfil_disciplinas_perfil ON perfil_disciplinas(perfil_id);
CREATE INDEX idx_productos_categoria ON productos(categoria_id) WHERE activo = TRUE;
CREATE INDEX idx_productos_slug ON productos(slug);
CREATE INDEX idx_pedidos_perfil ON pedidos(perfil_id);
CREATE INDEX idx_pedidos_estado ON pedidos(estado);
CREATE INDEX idx_pedidos_fecha ON pedidos(created_at DESC);
CREATE INDEX idx_eventos_fecha ON eventos(fecha_inicio) WHERE estado = 'publicado';
CREATE INDEX idx_eventos_slug ON eventos(slug);
CREATE INDEX idx_entradas_codigo ON entradas(codigo);
CREATE INDEX idx_entradas_evento ON entradas(evento_id);
CREATE INDEX idx_entradas_perfil ON entradas(perfil_id);
CREATE INDEX idx_stock_movimientos_producto ON stock_movimientos(producto_id);
CREATE INDEX idx_compras_proveedor ON compras_proveedor(proveedor_id);
CREATE INDEX idx_pagos_proveedor ON pagos_proveedor(proveedor_id);
CREATE INDEX idx_pagos_socios_perfil ON pagos_socios(perfil_id);
CREATE INDEX idx_lotes_entrada_tipo ON lotes_entrada(tipo_entrada_id);

-- Tesorería
CREATE INDEX idx_movimientos_cuenta ON movimientos_financieros(cuenta_id);
CREATE INDEX idx_movimientos_fecha ON movimientos_financieros(fecha DESC);
CREATE INDEX idx_movimientos_categoria ON movimientos_financieros(categoria_id);
CREATE INDEX idx_movimientos_tipo ON movimientos_financieros(tipo);
CREATE INDEX idx_movimientos_origen ON movimientos_financieros(origen_tipo, origen_id);
CREATE INDEX idx_movimientos_conciliado ON movimientos_financieros(conciliado) WHERE conciliado = FALSE;
CREATE INDEX idx_presupuestos_periodo ON presupuestos(anio, mes);
CREATE INDEX idx_cierres_periodo ON cierres_mensuales(anio, mes);
CREATE INDEX idx_transferencias_fecha ON transferencias_internas(fecha DESC);
CREATE INDEX idx_categorias_fin_tipo ON categorias_financieras(tipo) WHERE activa = TRUE;
```

## Supabase Storage Buckets

```
productos/        -- Imágenes de productos (público)
eventos/          -- Imágenes de eventos (público)
avatars/          -- Fotos de perfil (público)
memorias/         -- PDFs de memorias anuales (público)
documentos/       -- Documentos internos (privado)
comprobantes/     -- Comprobantes financieros (privado, solo tesorero/admin)
extractos/        -- Extractos bancarios subidos (privado)
reportes/         -- PDFs de reportes generados (privado)
```
