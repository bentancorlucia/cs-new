-- ============================================
-- Migración 018: Fix handle_new_user
--   1. Guardar cedula y telefono del registro
--   2. Auto-verificar socio si la cedula está en el padrón
-- ============================================

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  v_cedula TEXT;
  v_telefono TEXT;
  v_padron_id INTEGER;
  v_rol_socio_id INTEGER;
  v_rol_no_socio_id INTEGER;
BEGIN
  -- Normalizar cedula (quitar puntos, guiones, espacios)
  v_cedula := NULLIF(TRIM(REPLACE(REPLACE(REPLACE(
    COALESCE(NEW.raw_user_meta_data->>'cedula', ''), '.', ''), '-', ''), ' ', '')), '');
  v_telefono := NULLIF(TRIM(COALESCE(NEW.raw_user_meta_data->>'telefono', '')), '');

  -- Crear perfil
  INSERT INTO public.perfiles (id, nombre, apellido, cedula, telefono)
  VALUES (
    NEW.id,
    COALESCE(
      NEW.raw_user_meta_data->>'nombre',
      NEW.raw_user_meta_data->>'given_name',
      SPLIT_PART(COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', ''), ' ', 1),
      ''
    ),
    COALESCE(
      NEW.raw_user_meta_data->>'apellido',
      NEW.raw_user_meta_data->>'family_name',
      NULLIF(SPLIT_PART(COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', ''), ' ', 2), ''),
      ''
    ),
    v_cedula,
    v_telefono
  );

  -- Obtener IDs de roles
  SELECT id INTO v_rol_socio_id FROM public.roles WHERE nombre = 'socio';
  SELECT id INTO v_rol_no_socio_id FROM public.roles WHERE nombre = 'no_socio';

  -- Si hay cedula, buscar en el padrón y vincular automáticamente
  IF v_cedula IS NOT NULL AND v_cedula <> '' THEN
    SELECT id INTO v_padron_id
    FROM public.padron_socios
    WHERE cedula = v_cedula
      AND activo = TRUE
      AND perfil_id IS NULL  -- Solo si no está vinculado a otro usuario
    LIMIT 1;

    IF v_padron_id IS NOT NULL THEN
      -- Vincular padrón → perfil
      UPDATE public.padron_socios
      SET perfil_id = NEW.id, vinculado_at = NOW()
      WHERE id = v_padron_id;

      -- Marcar perfil como socio verificado
      UPDATE public.perfiles
      SET es_socio = TRUE,
          socio_verificado = TRUE,
          padron_socio_id = v_padron_id
      WHERE id = NEW.id;

      -- Las disciplinas ya viven en padron_disciplinas (vinculadas por padron_socio_id)
      -- No es necesario copiarlas al perfil

      -- Asignar rol socio
      IF v_rol_socio_id IS NOT NULL THEN
        INSERT INTO public.perfil_roles (perfil_id, rol_id)
        VALUES (NEW.id, v_rol_socio_id);
      END IF;

      RETURN NEW;
    END IF;
  END IF;

  -- Si no es socio, asignar rol no_socio
  IF v_rol_no_socio_id IS NOT NULL THEN
    INSERT INTO public.perfil_roles (perfil_id, rol_id)
    VALUES (NEW.id, v_rol_no_socio_id);
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- Trigger: limpiar perfil al borrar padron_socios
-- Protege contra borrado directo en la DB
-- (ON DELETE SET NULL solo limpia padron_socio_id en perfiles,
--  pero deja es_socio, socio_verificado, roles y disciplinas huérfanos)
-- ============================================

CREATE OR REPLACE FUNCTION public.handle_padron_socio_deleted()
RETURNS TRIGGER AS $$
DECLARE
  v_rol_socio_id INTEGER;
  v_rol_no_socio_id INTEGER;
BEGIN
  -- Solo actuar si el socio estaba vinculado a un perfil
  IF OLD.perfil_id IS NOT NULL THEN
    -- Limpiar flags de socio en perfiles
    UPDATE public.perfiles
    SET es_socio = FALSE,
        socio_verificado = FALSE,
        padron_socio_id = NULL
    WHERE id = OLD.perfil_id;

    -- Remover rol socio
    SELECT id INTO v_rol_socio_id FROM public.roles WHERE nombre = 'socio';
    IF v_rol_socio_id IS NOT NULL THEN
      DELETE FROM public.perfil_roles
      WHERE perfil_id = OLD.perfil_id AND rol_id = v_rol_socio_id;
    END IF;

    -- Reasignar rol no_socio
    SELECT id INTO v_rol_no_socio_id FROM public.roles WHERE nombre = 'no_socio';
    IF v_rol_no_socio_id IS NOT NULL THEN
      INSERT INTO public.perfil_roles (perfil_id, rol_id)
      VALUES (OLD.perfil_id, v_rol_no_socio_id)
      ON CONFLICT (perfil_id, rol_id) DO NOTHING;
    END IF;

    -- Las disciplinas en padron_disciplinas se borran automáticamente
    -- por ON DELETE CASCADE desde padron_socios
  END IF;

  RETURN OLD;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_padron_socio_deleted
  BEFORE DELETE ON padron_socios
  FOR EACH ROW EXECUTE FUNCTION public.handle_padron_socio_deleted();
