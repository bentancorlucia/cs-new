-- ============================================
-- Migración 007: Funciones helper de roles
-- ============================================

-- Verificar si el usuario actual tiene un rol específico
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

-- Verificar si el usuario actual tiene alguno de los roles especificados
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

-- Helper: verificar si es staff (cualquier rol admin)
CREATE OR REPLACE FUNCTION es_staff()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN tiene_algun_rol(ARRAY['super_admin', 'tienda', 'secretaria', 'eventos']);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;
