-- ============================================================
-- Popups: los gestiona todo el que tiene el menú de Comunicaciones
-- (super_admin, secretaría, tesorería y tienda).
-- ============================================================
DROP POLICY "popups_admin_delete" ON public.popups;
DROP POLICY "popups_admin_insert" ON public.popups;
DROP POLICY "popups_admin_read" ON public.popups;
DROP POLICY "popups_admin_update" ON public.popups;

CREATE POLICY "popups_admin_delete" ON public.popups FOR DELETE
  USING (public.tiene_algun_rol(ARRAY['super_admin', 'secretaria', 'tesorero', 'tienda']));
CREATE POLICY "popups_admin_insert" ON public.popups FOR INSERT
  WITH CHECK (public.tiene_algun_rol(ARRAY['super_admin', 'secretaria', 'tesorero', 'tienda']));
CREATE POLICY "popups_admin_read" ON public.popups FOR SELECT
  USING (public.tiene_algun_rol(ARRAY['super_admin', 'secretaria', 'tesorero', 'tienda']));
CREATE POLICY "popups_admin_update" ON public.popups FOR UPDATE
  USING (public.tiene_algun_rol(ARRAY['super_admin', 'secretaria', 'tesorero', 'tienda']))
  WITH CHECK (public.tiene_algun_rol(ARRAY['super_admin', 'secretaria', 'tesorero', 'tienda']));
