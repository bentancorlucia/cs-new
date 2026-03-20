-- ============================================
-- Migración 019: Transferencia bancaria como método de pago
-- ============================================

-- 1. Agregar 'pendiente_verificacion' al CHECK de pedidos.estado
ALTER TABLE pedidos DROP CONSTRAINT IF EXISTS pedidos_estado_check;
ALTER TABLE pedidos ADD CONSTRAINT pedidos_estado_check
  CHECK (estado IN ('pendiente', 'pendiente_verificacion', 'pagado', 'preparando', 'listo_retiro', 'retirado', 'cancelado'));

-- 2. Agregar 'transferencia' al CHECK de pedidos.metodo_pago
ALTER TABLE pedidos DROP CONSTRAINT IF EXISTS pedidos_metodo_pago_check;
ALTER TABLE pedidos ADD CONSTRAINT pedidos_metodo_pago_check
  CHECK (metodo_pago IN ('mercadopago', 'efectivo', 'mercadopago_qr', 'transferencia'));

-- 3. Columnas de reserva de stock en pedidos
ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS stock_reservado BOOLEAN DEFAULT FALSE;
ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS stock_reservado_at TIMESTAMPTZ;

-- 4. Tabla comprobantes
CREATE TABLE comprobantes (
  id SERIAL PRIMARY KEY,
  pedido_id INTEGER NOT NULL REFERENCES pedidos(id) ON DELETE CASCADE,
  url TEXT NOT NULL,
  nombre_archivo VARCHAR(255) NOT NULL,
  tipo VARCHAR(10) NOT NULL CHECK (tipo IN ('imagen', 'pdf')),
  tamano_bytes INTEGER,
  datos_extraidos JSONB,
  estado VARCHAR(20) NOT NULL DEFAULT 'pendiente'
    CHECK (estado IN ('pendiente', 'verificado', 'rechazado')),
  verificado_por UUID REFERENCES perfiles(id),
  verificado_at TIMESTAMPTZ,
  motivo_rechazo TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Índice en pedido_id
CREATE INDEX idx_comprobantes_pedido_id ON comprobantes(pedido_id);

-- Trigger updated_at
CREATE TRIGGER set_comprobantes_updated_at
  BEFORE UPDATE ON comprobantes
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

-- 5. Bucket de storage para comprobantes (privado)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'comprobantes',
  'comprobantes',
  false,
  10485760, -- 10MB
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
)
ON CONFLICT (id) DO NOTHING;

-- 6. RLS para comprobantes
ALTER TABLE comprobantes ENABLE ROW LEVEL SECURITY;

-- Usuarios autenticados pueden ver comprobantes de sus propios pedidos
CREATE POLICY "comprobantes_select_own" ON comprobantes
  FOR SELECT TO authenticated
  USING (
    pedido_id IN (SELECT id FROM pedidos WHERE perfil_id = auth.uid())
  );

-- Usuarios autenticados pueden insertar comprobantes para sus propios pedidos
CREATE POLICY "comprobantes_insert_own" ON comprobantes
  FOR INSERT TO authenticated
  WITH CHECK (
    pedido_id IN (SELECT id FROM pedidos WHERE perfil_id = auth.uid())
  );

-- Admin/tienda pueden ver todos los comprobantes
CREATE POLICY "comprobantes_select_admin" ON comprobantes
  FOR SELECT TO authenticated
  USING (
    auth.uid() IN (
      SELECT pr.perfil_id FROM perfil_roles pr
      JOIN roles r ON r.id = pr.rol_id
      WHERE r.nombre IN ('super_admin', 'tienda')
    )
  );

-- Admin/tienda pueden actualizar comprobantes (verificar/rechazar)
CREATE POLICY "comprobantes_update_admin" ON comprobantes
  FOR UPDATE TO authenticated
  USING (
    auth.uid() IN (
      SELECT pr.perfil_id FROM perfil_roles pr
      JOIN roles r ON r.id = pr.rol_id
      WHERE r.nombre IN ('super_admin', 'tienda')
    )
  );

-- 7. Storage policies para bucket comprobantes
-- Usuarios pueden subir a su carpeta
CREATE POLICY "comprobantes_storage_insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'comprobantes' AND (storage.foldername(name))[1] = auth.uid()::text);

-- Usuarios pueden ver sus propios comprobantes
CREATE POLICY "comprobantes_storage_select_own" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'comprobantes' AND (storage.foldername(name))[1] = auth.uid()::text);

-- Admin puede ver todos los comprobantes
CREATE POLICY "comprobantes_storage_select_admin" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'comprobantes' AND
    auth.uid() IN (
      SELECT pr.perfil_id FROM perfil_roles pr
      JOIN roles r ON r.id = pr.rol_id
      WHERE r.nombre IN ('super_admin', 'tienda')
    )
  );
