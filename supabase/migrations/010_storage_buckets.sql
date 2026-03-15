-- ============================================
-- Storage Buckets
-- ============================================

-- Bucket para imágenes de productos
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'productos',
  'productos',
  true,
  5242880, -- 5MB
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/avif']
) ON CONFLICT (id) DO NOTHING;

-- Bucket para imágenes de eventos
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'eventos',
  'eventos',
  true,
  5242880,
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/avif']
) ON CONFLICT (id) DO NOTHING;

-- Bucket para avatars de usuarios
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'avatars',
  'avatars',
  true,
  2097152, -- 2MB
  ARRAY['image/jpeg', 'image/png', 'image/webp']
) ON CONFLICT (id) DO NOTHING;

-- Bucket para memorias (PDFs)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'memorias',
  'memorias',
  true,
  20971520, -- 20MB
  ARRAY['application/pdf']
) ON CONFLICT (id) DO NOTHING;

-- Bucket para documentos (estatuto, reglamento, etc.)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'documentos',
  'documentos',
  true,
  20971520,
  ARRAY['application/pdf']
) ON CONFLICT (id) DO NOTHING;

-- ============================================
-- Storage RLS Policies
-- ============================================

-- Productos: lectura pública, escritura solo staff tienda
CREATE POLICY "productos_public_read" ON storage.objects
  FOR SELECT USING (bucket_id = 'productos');

CREATE POLICY "productos_staff_insert" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'productos'
    AND auth.role() = 'authenticated'
  );

CREATE POLICY "productos_staff_update" ON storage.objects
  FOR UPDATE USING (
    bucket_id = 'productos'
    AND auth.role() = 'authenticated'
  );

CREATE POLICY "productos_staff_delete" ON storage.objects
  FOR DELETE USING (
    bucket_id = 'productos'
    AND auth.role() = 'authenticated'
  );

-- Eventos: lectura pública, escritura solo staff
CREATE POLICY "eventos_public_read" ON storage.objects
  FOR SELECT USING (bucket_id = 'eventos');

CREATE POLICY "eventos_staff_insert" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'eventos'
    AND auth.role() = 'authenticated'
  );

CREATE POLICY "eventos_staff_delete" ON storage.objects
  FOR DELETE USING (
    bucket_id = 'eventos'
    AND auth.role() = 'authenticated'
  );

-- Avatars: lectura pública, escritura solo el propio usuario
CREATE POLICY "avatars_public_read" ON storage.objects
  FOR SELECT USING (bucket_id = 'avatars');

CREATE POLICY "avatars_user_insert" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'avatars'
    AND auth.role() = 'authenticated'
  );

CREATE POLICY "avatars_user_update" ON storage.objects
  FOR UPDATE USING (
    bucket_id = 'avatars'
    AND auth.role() = 'authenticated'
  );

CREATE POLICY "avatars_user_delete" ON storage.objects
  FOR DELETE USING (
    bucket_id = 'avatars'
    AND auth.role() = 'authenticated'
  );

-- Memorias y documentos: lectura pública, escritura solo staff
CREATE POLICY "memorias_public_read" ON storage.objects
  FOR SELECT USING (bucket_id = 'memorias');

CREATE POLICY "memorias_staff_insert" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'memorias'
    AND auth.role() = 'authenticated'
  );

CREATE POLICY "documentos_public_read" ON storage.objects
  FOR SELECT USING (bucket_id = 'documentos');

CREATE POLICY "documentos_staff_insert" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'documentos'
    AND auth.role() = 'authenticated'
  );
