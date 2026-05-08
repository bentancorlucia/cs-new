-- ============================================
-- Migración 036: Popups
-- Sistema de pop-ups para mostrar en el sitio público,
-- gestionados desde el panel de Secretaría.
-- ============================================

-- ========================
-- TABLA popups
-- ========================
CREATE TABLE IF NOT EXISTS public.popups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text,
  body text,
  image_url text,
  buttons jsonb NOT NULL DEFAULT '[]'::jsonb,
  pages jsonb NOT NULL DEFAULT '["*"]'::jsonb,
  starts_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL,
  priority int NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS popups_active_idx
  ON public.popups (status, starts_at, ends_at);

CREATE INDEX IF NOT EXISTS popups_priority_idx
  ON public.popups (priority DESC, updated_at DESC);

-- Trigger updated_at
CREATE OR REPLACE FUNCTION public.popups_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS popups_set_updated_at ON public.popups;
CREATE TRIGGER popups_set_updated_at
  BEFORE UPDATE ON public.popups
  FOR EACH ROW
  EXECUTE FUNCTION public.popups_set_updated_at();

-- ========================
-- RLS
-- ========================
ALTER TABLE public.popups ENABLE ROW LEVEL SECURITY;

-- Lectura pública: solo popups publicados y dentro del rango de fechas
CREATE POLICY "popups_public_read"
  ON public.popups FOR SELECT
  USING (
    status = 'published'
    AND now() BETWEEN starts_at AND ends_at
  );

-- Secretaría y super_admin: lectura total (incluye drafts y fuera de rango)
CREATE POLICY "popups_admin_read"
  ON public.popups FOR SELECT
  USING (tiene_algun_rol(ARRAY['super_admin', 'secretaria']));

-- Secretaría y super_admin: insertar
CREATE POLICY "popups_admin_insert"
  ON public.popups FOR INSERT
  WITH CHECK (tiene_algun_rol(ARRAY['super_admin', 'secretaria']));

-- Secretaría y super_admin: actualizar
CREATE POLICY "popups_admin_update"
  ON public.popups FOR UPDATE
  USING (tiene_algun_rol(ARRAY['super_admin', 'secretaria']))
  WITH CHECK (tiene_algun_rol(ARRAY['super_admin', 'secretaria']));

-- Secretaría y super_admin: eliminar
CREATE POLICY "popups_admin_delete"
  ON public.popups FOR DELETE
  USING (tiene_algun_rol(ARRAY['super_admin', 'secretaria']));

-- ========================
-- STORAGE BUCKET popups
-- ========================
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'popups',
  'popups',
  true,
  5242880, -- 5MB
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/avif']
) ON CONFLICT (id) DO NOTHING;

CREATE POLICY "popups_public_read_storage" ON storage.objects
  FOR SELECT USING (bucket_id = 'popups');

CREATE POLICY "popups_staff_insert_storage" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'popups'
    AND auth.role() = 'authenticated'
  );

CREATE POLICY "popups_staff_update_storage" ON storage.objects
  FOR UPDATE USING (
    bucket_id = 'popups'
    AND auth.role() = 'authenticated'
  );

CREATE POLICY "popups_staff_delete_storage" ON storage.objects
  FOR DELETE USING (
    bucket_id = 'popups'
    AND auth.role() = 'authenticated'
  );
