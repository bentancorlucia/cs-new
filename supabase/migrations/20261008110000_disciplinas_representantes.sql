-- ============================================================
-- Disciplinas — representantes y registro de cambios
--
-- * Cada disciplina tiene representantes (uno o varios): reciben el
--   resumen de cada liquidación por mail y, si tienen cuenta en el sitio,
--   entran a su panel. El rol "representante_disciplina" se asigna y se
--   quita solo según esta tabla.
-- * Registro de cambios (socios.cambios_disciplina): altas, bajas, cambios
--   de plan, de medio de cobro y de tarjeta, datos, planes y precios,
--   cobros. Lo escriben triggers (membresías, inscripciones, medios de
--   cobro) y las funciones del panel, haga el cambio quien lo haga. Lo que
--   afecta al débito Visa queda "pendiente" hasta que tesorería lo carga
--   en el portal y lo marca aplicado.
-- ============================================================

INSERT INTO public.roles (nombre, descripcion)
VALUES ('representante_disciplina', 'Representante de una disciplina: socios, liquidaciones y cuenta de su disciplina')
ON CONFLICT (nombre) DO NOTHING;

-- ------------------------------------------------------------
-- Representantes
-- ------------------------------------------------------------
CREATE TABLE socios.representantes (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  disciplina_id integer NOT NULL REFERENCES public.disciplinas (id) ON DELETE RESTRICT,
  nombre text NOT NULL CHECK (length(btrim(nombre)) > 0),
  email text NOT NULL CHECK (email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  telefono text,
  cargo text,
  recibe_liquidacion boolean NOT NULL DEFAULT true,
  acceso_panel boolean NOT NULL DEFAULT true,
  -- La cuenta del sitio con ese correo (se vincula sola, también si la crea después).
  perfil_id uuid REFERENCES public.perfiles (id) ON DELETE SET NULL,
  activo boolean NOT NULL DEFAULT true,
  creado_por uuid DEFAULT contabilidad._usuario(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX representantes_email ON socios.representantes (disciplina_id, lower(email)) WHERE activo;
CREATE INDEX representantes_perfil_idx ON socios.representantes (perfil_id) WHERE activo;

CREATE FUNCTION socios._representante_vincular() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  NEW.email := lower(btrim(NEW.email));
  NEW.updated_at := now();
  SELECT u.id INTO NEW.perfil_id FROM auth.users u
  WHERE lower(u.email) = NEW.email AND EXISTS (SELECT 1 FROM public.perfiles p WHERE p.id = u.id)
  LIMIT 1;
  RETURN NEW;
END;
$$;
CREATE TRIGGER representantes_vincular BEFORE INSERT OR UPDATE ON socios.representantes
  FOR EACH ROW EXECUTE FUNCTION socios._representante_vincular();

-- El rol sigue a la tabla: lo tiene quien es representante activo con acceso.
CREATE FUNCTION socios._sincronizar_rol_representante(p_perfil uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_rol integer := (SELECT id FROM public.roles WHERE nombre = 'representante_disciplina');
BEGIN
  IF p_perfil IS NULL THEN
    RETURN;
  END IF;
  IF EXISTS (SELECT 1 FROM socios.representantes WHERE perfil_id = p_perfil AND activo AND acceso_panel) THEN
    INSERT INTO public.perfil_roles (perfil_id, rol_id) VALUES (p_perfil, v_rol) ON CONFLICT DO NOTHING;
  ELSE
    DELETE FROM public.perfil_roles WHERE perfil_id = p_perfil AND rol_id = v_rol;
  END IF;
END;
$$;

CREATE FUNCTION socios._representante_rol() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF TG_OP IN ('UPDATE', 'DELETE') THEN
    PERFORM socios._sincronizar_rol_representante(OLD.perfil_id);
  END IF;
  IF TG_OP IN ('INSERT', 'UPDATE') THEN
    PERFORM socios._sincronizar_rol_representante(NEW.perfil_id);
  END IF;
  RETURN NULL;
END;
$$;
CREATE TRIGGER representantes_rol AFTER INSERT OR UPDATE OR DELETE ON socios.representantes
  FOR EACH ROW EXECUTE FUNCTION socios._representante_rol();

-- Cuentas nuevas: si su correo es de un representante, se vinculan.
-- ("zz_": corre después del trigger que crea el perfil.)
CREATE FUNCTION socios._usuario_nuevo_representante() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NEW.email IS NOT NULL AND EXISTS (SELECT 1 FROM socios.representantes
                                       WHERE activo AND lower(email) = lower(NEW.email) AND perfil_id IS NULL) THEN
    UPDATE socios.representantes SET updated_at = now()
    WHERE activo AND lower(email) = lower(NEW.email) AND perfil_id IS NULL;
  END IF;
  RETURN NULL;
END;
$$;
CREATE TRIGGER zz_representantes_vincular AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION socios._usuario_nuevo_representante();

-- ------------------------------------------------------------
-- Acceso
-- ------------------------------------------------------------
CREATE FUNCTION socios._es_representante(p_disciplina integer) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT EXISTS (SELECT 1 FROM socios.representantes
                 WHERE disciplina_id = p_disciplina AND activo AND acceso_panel AND perfil_id = auth.uid())
$$;

-- Las funciones del panel delegan en las de secretaría y tesorería: con
-- "socios.delegado" encendido (solo dentro de la transacción de una
-- función del panel, que ya controló el acceso) esas no vuelven a exigir rol.
CREATE OR REPLACE FUNCTION socios._exigir(p_roles text[]) RETURNS void
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_claims text := current_setting('request.jwt.claims', true);
BEGIN
  IF v_claims IS NULL OR v_claims = '' OR (v_claims::jsonb ->> 'role') = 'service_role' THEN
    RETURN;
  END IF;
  IF current_setting('socios.delegado', true) = 'on' THEN
    RETURN;
  END IF;
  IF NOT contabilidad._tiene_rol(p_roles || 'super_admin'::text) THEN
    RAISE EXCEPTION 'No autorizado' USING ERRCODE = '42501';
  END IF;
END;
$$;

-- Acceso al panel de una disciplina: sus representantes y el club
-- (secretaría, tesorería, super_admin). Devuelve el origen del cambio y
-- deja el contexto para el registro.
CREATE FUNCTION socios._exigir_disciplina(p_disciplina integer) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_claims text := current_setting('request.jwt.claims', true);
  v_origen text;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.disciplinas WHERE id = p_disciplina) THEN
    RAISE EXCEPTION 'La disciplina no existe';
  END IF;
  IF v_claims IS NULL OR v_claims = '' OR (v_claims::jsonb ->> 'role') = 'service_role' THEN
    v_origen := 'club';
  ELSIF socios._es_representante(p_disciplina) THEN
    v_origen := 'representante';
  ELSIF contabilidad._tiene_rol(ARRAY['super_admin', 'secretaria', 'tesorero']) THEN
    v_origen := 'club';
  ELSE
    RAISE EXCEPTION 'No autorizado' USING ERRCODE = '42501';
  END IF;
  PERFORM set_config('socios.cambio_disciplina', p_disciplina::text, true);
  PERFORM set_config('socios.cambio_origen', v_origen, true);
  RETURN v_origen;
END;
$$;

-- Lectura del panel (incluye a la Comisión Fiscal, sin escribir).
CREATE FUNCTION socios._exigir_lectura_disciplina(p_disciplina integer) RETURNS void
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_claims text := current_setting('request.jwt.claims', true);
BEGIN
  IF v_claims IS NULL OR v_claims = '' OR (v_claims::jsonb ->> 'role') = 'service_role' THEN
    RETURN;
  END IF;
  IF NOT socios._es_representante(p_disciplina)
     AND NOT contabilidad._tiene_rol(ARRAY['super_admin', 'secretaria', 'tesorero', 'comision_fiscal']) THEN
    RAISE EXCEPTION 'No autorizado' USING ERRCODE = '42501';
  END IF;
END;
$$;

-- ------------------------------------------------------------
-- Registro de cambios
-- ------------------------------------------------------------
CREATE TABLE socios.cambios_disciplina (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  -- NULL: un cambio del club sobre un socio sin disciplina.
  disciplina_id integer REFERENCES public.disciplinas (id) ON DELETE RESTRICT,
  persona_id integer REFERENCES public.padron_socios (id) ON DELETE RESTRICT,
  tipo text NOT NULL CHECK (tipo IN ('alta', 'reingreso', 'baja_club', 'baja_anulada', 'inscripcion', 'fin_inscripcion',
                                     'medio_cobro', 'tarjeta', 'datos', 'plan_nuevo', 'precio', 'cobro', 'representante')),
  descripcion text NOT NULL,
  antes jsonb,
  despues jsonb,
  -- Desde cuándo rige.
  vigencia date,
  afecta_debito boolean NOT NULL DEFAULT false,
  estado_debito text NOT NULL DEFAULT 'no_aplica'
    CHECK (estado_debito IN ('no_aplica', 'pendiente', 'aplicado', 'descartado')),
  aplicado_por uuid,
  aplicado_at timestamptz,
  notas_aplicacion text,
  -- Número completo de la tarjeta, cifrado en Vault, solo hasta aplicarlo.
  tarjeta_secreto_id uuid,
  hecho_por uuid DEFAULT auth.uid(),
  hecho_por_nombre text,
  origen text NOT NULL CHECK (origen IN ('representante', 'club')),
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (afecta_debito OR estado_debito = 'no_aplica'),
  CHECK ((estado_debito IN ('aplicado', 'descartado')) = (aplicado_at IS NOT NULL)),
  CHECK (tarjeta_secreto_id IS NULL OR estado_debito = 'pendiente')
);
CREATE INDEX cambios_disciplina_disc_idx ON socios.cambios_disciplina (disciplina_id, created_at DESC);
CREATE INDEX cambios_disciplina_pendientes_idx ON socios.cambios_disciplina (created_at) WHERE estado_debito = 'pendiente';
CREATE INDEX cambios_disciplina_persona_idx ON socios.cambios_disciplina (persona_id);

-- Solo cambia el estado del débito; nada se borra.
CREATE FUNCTION socios._cambio_valido() RETURNS trigger
LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'El registro de cambios no se borra';
  END IF;
  IF (to_jsonb(NEW) - ARRAY['estado_debito', 'aplicado_por', 'aplicado_at', 'notas_aplicacion', 'tarjeta_secreto_id'])
     <> (to_jsonb(OLD) - ARRAY['estado_debito', 'aplicado_por', 'aplicado_at', 'notas_aplicacion', 'tarjeta_secreto_id'])
     OR OLD.estado_debito <> 'pendiente' THEN
    RAISE EXCEPTION 'Un cambio registrado no se modifica';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER cambios_disciplina_valido BEFORE UPDATE OR DELETE ON socios.cambios_disciplina
  FOR EACH ROW EXECUTE FUNCTION socios._cambio_valido();

-- Importe para leer: $ 2.425,00
CREATE FUNCTION socios._pesos(p numeric) RETURNS text
LANGUAGE sql IMMUTABLE SET search_path = '' AS $$
  SELECT '$ ' || translate(to_char(coalesce(p, 0), 'FM999,999,999,990.00'), ',.', '.,')
$$;

-- Cuota mensual de la persona a una fecha (lo que se le debita).
CREATE FUNCTION socios._cuota_mensual(p_persona integer, p_fecha date) RETURNS numeric
LANGUAGE sql STABLE SET search_path = '' AS $$
  SELECT coalesce(sum((socios.precio_vigente(s.plan_id, date_trunc('month', p_fecha)::date)).importe_mensual), 0)
  FROM socios.suscripciones s
  WHERE s.persona_id = p_persona AND s.periodicidad = 'mensual'
    AND s.desde <= p_fecha AND (s.hasta IS NULL OR s.hasta >= p_fecha)
$$;

CREATE FUNCTION socios._tiene_debito(p_persona integer, p_fecha date) RETURNS boolean
LANGUAGE sql STABLE SET search_path = '' AS $$
  SELECT EXISTS (SELECT 1 FROM socios.medios_cobro WHERE persona_id = p_persona AND medio = 'debito_visa'
                 AND desde <= p_fecha AND (hasta IS NULL OR hasta >= p_fecha))
$$;

CREATE FUNCTION socios._nombre_usuario() RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT nullif(btrim(coalesce(nombre, '') || ' ' || coalesce(apellido, '')), '') FROM public.perfiles WHERE id = auth.uid()
$$;

-- Escribe un cambio. La disciplina y el origen salen del contexto de la
-- función del panel; si no hay, es un cambio del club.
CREATE FUNCTION socios._registrar_cambio(
  p_tipo text, p_persona integer, p_descripcion text, p_antes jsonb, p_despues jsonb, p_vigencia date,
  p_afecta_debito boolean, p_disciplina integer DEFAULT NULL
) RETURNS bigint
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_id bigint;
  v_secreto uuid := nullif(current_setting('socios.tarjeta_secreto', true), '')::uuid;
BEGIN
  INSERT INTO socios.cambios_disciplina (disciplina_id, persona_id, tipo, descripcion, antes, despues, vigencia,
                                         afecta_debito, estado_debito, tarjeta_secreto_id, hecho_por_nombre, origen)
  VALUES (coalesce(p_disciplina, nullif(current_setting('socios.cambio_disciplina', true), '')::integer),
          p_persona, p_tipo, p_descripcion, p_antes, p_despues, p_vigencia,
          p_afecta_debito, CASE WHEN p_afecta_debito THEN 'pendiente' ELSE 'no_aplica' END,
          CASE WHEN p_afecta_debito AND p_tipo IN ('medio_cobro', 'tarjeta') THEN v_secreto END,
          coalesce(socios._nombre_usuario(), 'Sistema'),
          coalesce(nullif(current_setting('socios.cambio_origen', true), ''), 'club'))
  RETURNING id INTO v_id;
  IF v_secreto IS NOT NULL AND p_tipo IN ('medio_cobro', 'tarjeta') THEN
    PERFORM set_config('socios.tarjeta_secreto', '', true);
  END IF;
  RETURN v_id;
END;
$$;

-- Membresías: alta, reingreso, baja y baja anulada.
CREATE FUNCTION socios._cambio_membresia() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_nombre text := socios._nombre(NEW.persona_id);
  v_debito boolean;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF EXISTS (SELECT 1 FROM socios.membresias WHERE persona_id = NEW.persona_id AND id <> NEW.id) THEN
      PERFORM socios._registrar_cambio('reingreso', NEW.persona_id, 'Reingreso como socio: ' || v_nombre,
        NULL, jsonb_build_object('desde', NEW.desde), NEW.desde, false);
    ELSE
      PERFORM socios._registrar_cambio('alta', NEW.persona_id, 'Alta como socio: ' || v_nombre,
        NULL, jsonb_build_object('desde', NEW.desde), NEW.desde, false);
    END IF;
  ELSIF OLD.hasta IS NULL AND NEW.hasta IS NOT NULL THEN
    v_debito := socios._tiene_debito(NEW.persona_id, NEW.hasta);
    PERFORM socios._registrar_cambio('baja_club', NEW.persona_id,
      'Baja del club: ' || v_nombre || CASE WHEN v_debito THEN ' — dar de baja el débito' ELSE '' END,
      jsonb_build_object('cuota_mensual', socios._cuota_mensual(NEW.persona_id, NEW.hasta)),
      jsonb_build_object('hasta', NEW.hasta, 'motivo', (SELECT nombre FROM socios.motivos_baja WHERE id = NEW.motivo_baja_id),
                         'notas', NEW.notas_baja),
      NEW.hasta + 1, v_debito);
  ELSIF OLD.hasta IS NOT NULL AND NEW.hasta IS NULL THEN
    PERFORM socios._registrar_cambio('baja_anulada', NEW.persona_id, 'Se anuló la baja de ' || v_nombre,
      jsonb_build_object('hasta', OLD.hasta), NULL, OLD.hasta, socios._tiene_debito(NEW.persona_id, OLD.hasta));
  END IF;
  RETURN NULL;
END;
$$;
CREATE TRIGGER membresias_cambios AFTER INSERT OR UPDATE ON socios.membresias
  FOR EACH ROW EXECUTE FUNCTION socios._cambio_membresia();

-- Inscripciones: entrar a un plan o dejarlo (la cuota a debitar cambia).
CREATE FUNCTION socios._cambio_suscripcion() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_plan socios.planes;
  v_nombre text := socios._nombre(NEW.persona_id);
  v_fecha date;
  v_debito boolean;
  v_anterior text;
BEGIN
  SELECT * INTO v_plan FROM socios.planes WHERE id = NEW.plan_id;
  IF TG_OP = 'INSERT' THEN
    v_fecha := NEW.desde;
    v_debito := socios._tiene_debito(NEW.persona_id, v_fecha);
    -- Cambio de plan: la inscripción anterior terminó el día antes con ese motivo.
    SELECT pl.nombre INTO v_anterior FROM socios.suscripciones s JOIN socios.planes pl ON pl.id = s.plan_id
    WHERE s.persona_id = NEW.persona_id AND s.id <> NEW.id AND s.hasta = NEW.desde - 1
      AND s.motivo_fin = 'Cambio de plan' AND pl.disciplina_id IS NOT DISTINCT FROM v_plan.disciplina_id
    ORDER BY s.id DESC LIMIT 1;
    PERFORM socios._registrar_cambio('inscripcion', NEW.persona_id,
      v_nombre || CASE WHEN v_anterior IS NOT NULL THEN ' pasa de ' || v_anterior || ' a ' ELSE ' entra a ' END || v_plan.nombre
        || CASE WHEN v_debito THEN ' — nueva cuota a debitar: ' || socios._pesos(socios._cuota_mensual(NEW.persona_id, v_fecha)) ELSE '' END,
      CASE WHEN v_anterior IS NOT NULL THEN jsonb_build_object('plan', v_anterior,
        'cuota_mensual', socios._cuota_mensual(NEW.persona_id, NEW.desde - 1)) END,
      jsonb_build_object('plan', v_plan.nombre, 'periodicidad', NEW.periodicidad, 'desde', NEW.desde,
                         'cuota_mensual', socios._cuota_mensual(NEW.persona_id, v_fecha)),
      NEW.desde, v_debito, v_plan.disciplina_id);
  ELSIF NEW.motivo_fin IS NOT DISTINCT FROM 'Cambio de plan' AND OLD.hasta IS NULL THEN
    -- Lo registra la inscripción nueva ("pasa de A a B").
    NULL;
  ELSIF (OLD.hasta IS DISTINCT FROM NEW.hasta) AND NEW.hasta IS NOT NULL THEN
    v_fecha := NEW.hasta + 1;
    v_debito := socios._tiene_debito(NEW.persona_id, NEW.hasta)
                AND EXISTS (SELECT 1 FROM socios.membresias WHERE persona_id = NEW.persona_id
                            AND (hasta IS NULL OR hasta >= v_fecha));
    PERFORM socios._registrar_cambio('fin_inscripcion', NEW.persona_id,
      v_nombre || ' deja ' || v_plan.nombre
        || CASE WHEN v_debito THEN ' — nueva cuota a debitar: ' || socios._pesos(socios._cuota_mensual(NEW.persona_id, v_fecha)) ELSE '' END,
      jsonb_build_object('plan', v_plan.nombre, 'desde', NEW.desde),
      jsonb_build_object('hasta', NEW.hasta, 'motivo', NEW.motivo_fin,
                         'cuota_mensual', socios._cuota_mensual(NEW.persona_id, v_fecha)),
      v_fecha, v_debito, v_plan.disciplina_id);
  END IF;
  RETURN NULL;
END;
$$;
CREATE TRIGGER suscripciones_cambios AFTER INSERT OR UPDATE ON socios.suscripciones
  FOR EACH ROW EXECUTE FUNCTION socios._cambio_suscripcion();

-- Medio de cobro: adhesión al débito, cambio de tarjeta, otros medios.
CREATE FUNCTION socios._cambio_medio() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_ant socios.medios_cobro;
  v_nombre text := socios._nombre(NEW.persona_id);
  v_tipo text := 'medio_cobro';
  v_desc text;
  v_etiqueta jsonb := '{"debito_visa": "débito Visa", "transferencia_club": "transferencia al club",
                        "transferencia_disciplina": "pago en la cuenta de la disciplina", "efectivo": "efectivo"}';
BEGIN
  SELECT * INTO v_ant FROM socios.medios_cobro
  WHERE persona_id = NEW.persona_id AND id <> NEW.id AND desde < NEW.desde
  ORDER BY desde DESC, id DESC LIMIT 1;
  IF NEW.medio = 'debito_visa' AND v_ant.medio = 'debito_visa' THEN
    v_tipo := 'tarjeta';
    v_desc := 'Cambio de tarjeta de ' || v_nombre || ': ****' || coalesce(v_ant.tarjeta_ultimos4, '----')
              || ' → ****' || coalesce(NEW.tarjeta_ultimos4, '----');
  ELSIF NEW.medio = 'debito_visa' THEN
    v_desc := 'Adhesión al débito Visa de ' || v_nombre || ' (****' || coalesce(NEW.tarjeta_ultimos4, '----')
              || ') — cuota ' || socios._pesos(socios._cuota_mensual(NEW.persona_id, NEW.desde));
  ELSIF v_ant.medio = 'debito_visa' THEN
    v_desc := v_nombre || ' deja el débito Visa (****' || coalesce(v_ant.tarjeta_ultimos4, '----') || ') y pasa a '
              || (v_etiqueta ->> NEW.medio);
  ELSE
    v_desc := 'Medio de cobro de ' || v_nombre || ': ' || (v_etiqueta ->> NEW.medio);
  END IF;
  PERFORM socios._registrar_cambio(v_tipo, NEW.persona_id, v_desc,
    CASE WHEN v_ant.id IS NOT NULL THEN jsonb_build_object('medio', v_ant.medio, 'tarjeta', v_ant.tarjeta_ultimos4,
      'vencimiento', v_ant.tarjeta_vencimiento, 'emisor', v_ant.tarjeta_emisor) END,
    jsonb_build_object('medio', NEW.medio, 'tarjeta', NEW.tarjeta_ultimos4, 'vencimiento', NEW.tarjeta_vencimiento,
      'emisor', NEW.tarjeta_emisor, 'titular', NEW.titular_nombre, 'titular_documento', NEW.titular_documento,
      'cuota_mensual', socios._cuota_mensual(NEW.persona_id, NEW.desde)),
    NEW.desde, NEW.medio = 'debito_visa' OR coalesce(v_ant.medio = 'debito_visa', false),
    coalesce(NEW.disciplina_id, socios._disciplina_principal(NEW.persona_id, NEW.desde, NEW.desde)));
  RETURN NULL;
END;
$$;

-- Emisor de la tarjeta (ITAU, BROU, SCOTIA…), como en las planillas.
ALTER TABLE socios.medios_cobro ADD COLUMN tarjeta_emisor text;
ALTER TABLE socios.medios_cobro DROP CONSTRAINT medios_cobro_check1;
ALTER TABLE socios.medios_cobro ADD CONSTRAINT medios_cobro_solo_tarjeta
  CHECK (medio = 'debito_visa' OR (tarjeta_ultimos4 IS NULL AND tarjeta_vencimiento IS NULL AND tarjeta_emisor IS NULL
                                   AND titular_documento IS NULL AND titular_nombre IS NULL));
CREATE TRIGGER medios_cobro_cambios AFTER INSERT ON socios.medios_cobro
  FOR EACH ROW EXECUTE FUNCTION socios._cambio_medio();

-- ------------------------------------------------------------
-- RLS
-- ------------------------------------------------------------
ALTER TABLE socios.representantes ENABLE ROW LEVEL SECURITY;
ALTER TABLE socios.cambios_disciplina ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON socios.representantes, socios.cambios_disciplina FROM PUBLIC, anon, authenticated;
GRANT SELECT ON socios.representantes, socios.cambios_disciplina TO authenticated, service_role;
CREATE POLICY representantes_lectura ON socios.representantes FOR SELECT TO authenticated
  USING (socios.puede_leer() OR socios._es_representante(disciplina_id));
CREATE POLICY cambios_lectura ON socios.cambios_disciplina FOR SELECT TO authenticated
  USING (socios.puede_leer() OR (disciplina_id IS NOT NULL AND socios._es_representante(disciplina_id)));
CREATE TRIGGER representantes_auditoria AFTER INSERT OR UPDATE OR DELETE ON socios.representantes
  FOR EACH ROW EXECUTE FUNCTION contabilidad._auditar();

REVOKE EXECUTE ON FUNCTION socios._representante_vincular(), socios._sincronizar_rol_representante(uuid),
  socios._representante_rol(), socios._usuario_nuevo_representante(), socios._exigir_disciplina(integer),
  socios._exigir_lectura_disciplina(integer), socios._cambio_valido(), socios._cuota_mensual(integer, date),
  socios._tiene_debito(integer, date), socios._nombre_usuario(), socios._pesos(numeric),
  socios._registrar_cambio(text, integer, text, jsonb, jsonb, date, boolean, integer),
  socios._cambio_membresia(), socios._cambio_suscripcion(), socios._cambio_medio()
  FROM PUBLIC, anon, authenticated;
-- La usan las políticas.
GRANT EXECUTE ON FUNCTION socios._es_representante(integer) TO authenticated;
