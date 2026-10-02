-- ============================================================
-- Socios — núcleo: membresías, planes, inscripciones y cuotas
--
-- Modelo tomado de ContaSystem (persona ≠ membresía, la cuota es el
-- documento de deuda, el saldo se calcula y no se escribe), con las
-- reglas que allá vivían solo en la app puestas en la base:
--   * la persona es public.padron_socios (cédula única, vínculo con la
--     cuenta web); ser socio es tener una membresía vigente (períodos con
--     fecha y motivo de baja, no un booleano editable);
--   * cuota social y cuotas de disciplina son planes con precios por
--     vigencia; una persona se inscribe a planes (mensual o anual) dentro
--     de su membresía; no hay deportistas que no sean socios;
--   * las cuotas se emiten por lote, con un asiento por lote, y quedan
--     inmutables: una por inscripción y período; se corrigen con notas de
--     crédito (migración de cobranza), nunca editando el importe;
--   * padron_socios.activo, padron_disciplinas, perfiles.es_socio y los
--     roles socio/no_socio se derivan de este modelo (el resto del sitio
--     los sigue leyendo igual).
-- ============================================================

CREATE SCHEMA socios;
GRANT USAGE ON SCHEMA socios TO authenticated, service_role;

-- ------------------------------------------------------------
-- Permisos
-- ------------------------------------------------------------
-- Gestión del padrón: secretaría. Cuotas y cobranza: tesorería (los
-- cobros también los registra secretaría). Lectura: también la Comisión
-- Fiscal.
CREATE FUNCTION socios.puede_leer() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT contabilidad._tiene_rol(ARRAY['super_admin', 'secretaria', 'tesorero', 'comision_fiscal']);
$$;

CREATE FUNCTION socios._exigir(p_roles text[]) RETURNS void
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_claims text := current_setting('request.jwt.claims', true);
BEGIN
  IF v_claims IS NULL OR v_claims = '' OR (v_claims::jsonb ->> 'role') = 'service_role' THEN
    RETURN;
  END IF;
  IF NOT contabilidad._tiene_rol(p_roles || 'super_admin'::text) THEN
    RAISE EXCEPTION 'No autorizado' USING ERRCODE = '42501';
  END IF;
END;
$$;

CREATE FUNCTION socios._exigir_secretaria() RETURNS void
LANGUAGE sql STABLE SET search_path = '' AS $$ SELECT socios._exigir(ARRAY['secretaria']) $$;
CREATE FUNCTION socios._exigir_tesoreria() RETURNS void
LANGUAGE sql STABLE SET search_path = '' AS $$ SELECT socios._exigir(ARRAY['tesorero']) $$;
CREATE FUNCTION socios._exigir_cobranza() RETURNS void
LANGUAGE sql STABLE SET search_path = '' AS $$ SELECT socios._exigir(ARRAY['secretaria', 'tesorero']) $$;

-- ------------------------------------------------------------
-- Configuración (una fila)
-- ------------------------------------------------------------
CREATE TABLE socios.config (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  dia_vencimiento smallint NOT NULL DEFAULT 10 CHECK (dia_vencimiento BETWEEN 1 AND 28),
  -- "Al día": hasta cuántas cuotas vencidas impagas se toleran.
  tolerancia_cuotas smallint NOT NULL DEFAULT 2 CHECK (tolerancia_cuotas >= 0),
  tolerancia_debito smallint NOT NULL DEFAULT 3 CHECK (tolerancia_debito >= 0),
  -- El mes del alta se cobra entero (true) o queda bonificado.
  cobrar_mes_alta boolean NOT NULL DEFAULT true,
  -- Qué se propone hacer con la deuda al dar de baja: mantenerla o anularla con nota de crédito.
  baja_con_deuda text NOT NULL DEFAULT 'mantener' CHECK (baja_con_deuda IN ('mantener', 'anular')),
  -- Mes en que se emite la cuota anual.
  mes_cuota_anual smallint NOT NULL DEFAULT 1 CHECK (mes_cuota_anual BETWEEN 1 AND 12),
  updated_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO socios.config DEFAULT VALUES;

-- ------------------------------------------------------------
-- Persona: el padrón existente
-- ------------------------------------------------------------
ALTER TABLE public.padron_socios
  ADD COLUMN numero_socio integer UNIQUE CHECK (numero_socio > 0),
  ADD COLUMN email text,
  ADD COLUMN direccion text;

CREATE SEQUENCE socios.numero_socio_seq;

CREATE TABLE socios.motivos_baja (
  id smallint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  nombre text NOT NULL UNIQUE,
  activo boolean NOT NULL DEFAULT true
);
INSERT INTO socios.motivos_baja (nombre) VALUES
  ('Renuncia'), ('Falta de pago'), ('Fallecimiento'), ('Se mudó'), ('Otro');

-- ------------------------------------------------------------
-- Membresías: períodos como socio
-- ------------------------------------------------------------
CREATE TABLE socios.membresias (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  persona_id integer NOT NULL REFERENCES public.padron_socios (id) ON DELETE RESTRICT,
  desde date NOT NULL CHECK (desde >= '1900-01-01'),
  -- Último día como socio.
  hasta date,
  motivo_baja_id smallint REFERENCES socios.motivos_baja (id),
  notas_baja text,
  creado_por uuid DEFAULT contabilidad._usuario(),
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (hasta IS NULL OR hasta >= desde),
  CHECK ((hasta IS NULL) = (motivo_baja_id IS NULL))
);
CREATE UNIQUE INDEX membresias_abierta ON socios.membresias (persona_id) WHERE hasta IS NULL;
CREATE INDEX membresias_persona_idx ON socios.membresias (persona_id, desde);

-- ------------------------------------------------------------
-- Planes (cuota social y cuotas de disciplina) y precios
-- ------------------------------------------------------------
CREATE TABLE socios.planes (
  id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  nombre text NOT NULL CHECK (length(btrim(nombre)) > 0),
  tipo text NOT NULL CHECK (tipo IN ('social', 'disciplina')),
  disciplina_id integer REFERENCES public.disciplinas (id) ON DELETE RESTRICT,
  permite_anual boolean NOT NULL DEFAULT true,
  activo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((tipo = 'disciplina') = (disciplina_id IS NOT NULL))
);
CREATE UNIQUE INDEX planes_nombre_unico ON socios.planes (coalesce(disciplina_id, 0), lower(btrim(nombre)));

CREATE TABLE socios.plan_precios (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  plan_id integer NOT NULL REFERENCES socios.planes (id) ON DELETE RESTRICT,
  vigente_desde date NOT NULL CHECK (vigente_desde = date_trunc('month', vigente_desde)::date),
  importe_mensual numeric(12, 2) NOT NULL CHECK (importe_mensual > 0),
  importe_anual numeric(12, 2) CHECK (importe_anual > 0),
  creado_por uuid DEFAULT contabilidad._usuario(),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (plan_id, vigente_desde)
);

CREATE FUNCTION socios.precio_vigente(p_plan integer, p_periodo date) RETURNS socios.plan_precios
LANGUAGE sql STABLE SET search_path = '' AS $$
  SELECT * FROM socios.plan_precios
  WHERE plan_id = p_plan AND vigente_desde <= p_periodo
  ORDER BY vigente_desde DESC LIMIT 1
$$;

-- ------------------------------------------------------------
-- Inscripciones a planes
-- ------------------------------------------------------------
CREATE TABLE socios.suscripciones (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  persona_id integer NOT NULL REFERENCES public.padron_socios (id) ON DELETE RESTRICT,
  plan_id integer NOT NULL REFERENCES socios.planes (id) ON DELETE RESTRICT,
  periodicidad text NOT NULL DEFAULT 'mensual' CHECK (periodicidad IN ('mensual', 'anual')),
  desde date NOT NULL,
  hasta date,
  motivo_fin text,
  creado_por uuid DEFAULT contabilidad._usuario(),
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (hasta IS NULL OR hasta >= desde)
);
CREATE INDEX suscripciones_persona_idx ON socios.suscripciones (persona_id);
CREATE INDEX suscripciones_plan_idx ON socios.suscripciones (plan_id);

-- ------------------------------------------------------------
-- Medio de cobro de la persona (con historia)
-- ------------------------------------------------------------
-- Nunca se guarda el número completo de la tarjeta: solo los últimos 4
-- dígitos y el vencimiento, para identificar la adhesión al débito.
CREATE TABLE socios.medios_cobro (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  persona_id integer NOT NULL REFERENCES public.padron_socios (id) ON DELETE RESTRICT,
  medio text NOT NULL CHECK (medio IN ('debito_visa', 'transferencia_club', 'transferencia_disciplina', 'efectivo')),
  disciplina_id integer REFERENCES public.disciplinas (id) ON DELETE RESTRICT,
  tarjeta_ultimos4 char(4) CHECK (tarjeta_ultimos4 ~ '^[0-9]{4}$'),
  tarjeta_vencimiento date CHECK (tarjeta_vencimiento = date_trunc('month', tarjeta_vencimiento)::date),
  titular_documento text,
  titular_nombre text,
  desde date NOT NULL,
  hasta date,
  creado_por uuid DEFAULT contabilidad._usuario(),
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((medio = 'transferencia_disciplina') = (disciplina_id IS NOT NULL)),
  CHECK (medio = 'debito_visa' OR (tarjeta_ultimos4 IS NULL AND tarjeta_vencimiento IS NULL
                                   AND titular_documento IS NULL AND titular_nombre IS NULL)),
  CHECK (hasta IS NULL OR hasta >= desde)
);
CREATE UNIQUE INDEX medios_cobro_vigente ON socios.medios_cobro (persona_id) WHERE hasta IS NULL;

-- ------------------------------------------------------------
-- Lotes y cuotas
-- ------------------------------------------------------------
CREATE TABLE socios.lotes (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  periodo date NOT NULL CHECK (periodo = date_trunc('month', periodo)::date),
  fecha_emision date NOT NULL,
  fecha_vencimiento date NOT NULL CHECK (fecha_vencimiento >= fecha_emision),
  cantidad integer NOT NULL CHECK (cantidad > 0),
  importe_total numeric(14, 2) NOT NULL CHECK (importe_total > 0),
  asiento_id uuid NOT NULL REFERENCES contabilidad.asientos (id) ON DELETE RESTRICT,
  estado text NOT NULL DEFAULT 'emitido' CHECK (estado IN ('emitido', 'anulado')),
  motivo_anulacion text,
  anulado_por uuid,
  anulado_at timestamptz,
  creado_por uuid DEFAULT contabilidad._usuario(),
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((estado = 'anulado') = (anulado_at IS NOT NULL AND motivo_anulacion IS NOT NULL))
);

CREATE TABLE socios.cuotas (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  persona_id integer NOT NULL REFERENCES public.padron_socios (id) ON DELETE RESTRICT,
  -- Cuota de un plan (social o disciplina) o cargo suelto (cuota de
  -- ingreso, aporte extraordinario).
  tipo text NOT NULL CHECK (tipo IN ('social', 'disciplina', 'cargo')),
  suscripcion_id bigint REFERENCES socios.suscripciones (id) ON DELETE RESTRICT,
  plan_id integer REFERENCES socios.planes (id) ON DELETE RESTRICT,
  disciplina_id integer REFERENCES public.disciplinas (id) ON DELETE RESTRICT,
  concepto text NOT NULL CHECK (length(btrim(concepto)) > 0),
  periodicidad text NOT NULL CHECK (periodicidad IN ('mensual', 'anual', 'unica')),
  periodo_desde date NOT NULL,
  periodo_hasta date NOT NULL,
  importe numeric(12, 2) NOT NULL CHECK (importe > 0),
  precio_id bigint REFERENCES socios.plan_precios (id) ON DELETE RESTRICT,
  -- Obligatorio si el importe no sale del precio vigente.
  motivo_importe text,
  fecha_emision date NOT NULL,
  fecha_vencimiento date NOT NULL,
  cuenta_cobrar_id uuid NOT NULL REFERENCES contabilidad.cuentas (id) ON DELETE RESTRICT,
  cuenta_ingreso_id uuid NOT NULL REFERENCES contabilidad.cuentas (id) ON DELETE RESTRICT,
  centro_costo_id uuid REFERENCES contabilidad.centros_costo (id) ON DELETE RESTRICT,
  lote_id bigint REFERENCES socios.lotes (id) ON DELETE RESTRICT,
  asiento_id uuid NOT NULL REFERENCES contabilidad.asientos (id) ON DELETE RESTRICT,
  -- 'anulada' solo por anulación del lote o del cargo (sin cobros): el
  -- asiento se revierte. Lo demás se corrige con notas de crédito.
  estado text NOT NULL DEFAULT 'emitida' CHECK (estado IN ('emitida', 'anulada')),
  creado_por uuid DEFAULT contabilidad._usuario(),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (id, persona_id),
  CHECK (periodo_hasta >= periodo_desde),
  CHECK (fecha_vencimiento >= fecha_emision),
  CHECK ((tipo = 'cargo') = (suscripcion_id IS NULL)),
  CHECK ((tipo = 'cargo') = (periodicidad = 'unica')),
  CHECK ((tipo = 'disciplina') = (disciplina_id IS NOT NULL)),
  CHECK (tipo = 'cargo' OR (plan_id IS NOT NULL AND precio_id IS NOT NULL)),
  CHECK (periodicidad <> 'mensual' OR periodo_hasta = (periodo_desde + interval '1 month - 1 day')::date),
  CHECK (periodicidad <> 'anual' OR (date_trunc('month', periodo_desde) = periodo_desde
                                     AND periodo_hasta = make_date(extract(year FROM periodo_desde)::int, 12, 31)))
);
CREATE UNIQUE INDEX cuotas_una_por_periodo ON socios.cuotas (suscripcion_id, periodo_desde) WHERE estado = 'emitida';
CREATE INDEX cuotas_persona_idx ON socios.cuotas (persona_id, fecha_vencimiento);
CREATE INDEX cuotas_lote_idx ON socios.cuotas (lote_id);

-- ------------------------------------------------------------
-- Cuentas contables del proceso
-- ------------------------------------------------------------
INSERT INTO contabilidad.parametros_cuentas (proceso, rol, cuenta_id, descripcion)
SELECT 'socios', v.rol, c.id, v.descripcion
FROM (VALUES
  ('cuotas_sociales_cobrar', '1.1.03.01', 'Cuotas sociales y cargos a cobrar'),
  ('cuotas_disciplina_cobrar', '1.1.03.02', 'Cuotas de disciplina a cobrar'),
  ('ingreso_cuota_social', '4.1.01', 'Ingreso por cuota social'),
  ('ingreso_cuota_disciplina', '4.2.01', 'Ingreso por cuota de disciplina (con centro de la disciplina)')
) AS v (rol, codigo, descripcion)
JOIN contabilidad.cuentas c ON c.codigo = v.codigo;

-- ------------------------------------------------------------
-- Reglas
-- ------------------------------------------------------------
-- Membresías: sin superposición por persona.
CREATE FUNCTION socios._membresia_valida() RETURNS trigger
LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM socios.membresias m
    WHERE m.persona_id = NEW.persona_id AND m.id <> NEW.id
      AND daterange(m.desde, m.hasta, '[]') && daterange(NEW.desde, NEW.hasta, '[]')
  ) THEN
    RAISE EXCEPTION 'La persona ya era socia en esas fechas';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER membresias_valida BEFORE INSERT OR UPDATE ON socios.membresias
  FOR EACH ROW EXECUTE FUNCTION socios._membresia_valida();

-- Inscripciones: dentro de una membresía, sin repetir plan en las mismas
-- fechas, una sola cuota social a la vez, anual solo si el plan lo permite.
CREATE FUNCTION socios._suscripcion_valida() RETURNS trigger
LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE
  v_plan socios.planes;
BEGIN
  SELECT * INTO v_plan FROM socios.planes WHERE id = NEW.plan_id;
  IF TG_OP = 'INSERT' AND NOT v_plan.activo THEN
    RAISE EXCEPTION 'El plan "%" no está activo', v_plan.nombre;
  END IF;
  IF NEW.periodicidad = 'anual' AND NOT v_plan.permite_anual THEN
    RAISE EXCEPTION 'El plan "%" no tiene opción anual', v_plan.nombre;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM socios.membresias m
    WHERE m.persona_id = NEW.persona_id AND m.desde <= NEW.desde
      AND (m.hasta IS NULL OR (NEW.hasta IS NOT NULL AND NEW.hasta <= m.hasta))
  ) THEN
    RAISE EXCEPTION 'La inscripción tiene que estar dentro de un período como socio (no hay deportistas que no sean socios)';
  END IF;
  IF EXISTS (
    SELECT 1 FROM socios.suscripciones s JOIN socios.planes p ON p.id = s.plan_id
    WHERE s.persona_id = NEW.persona_id AND s.id <> NEW.id
      AND (s.plan_id = NEW.plan_id OR (p.tipo = 'social' AND v_plan.tipo = 'social'))
      AND daterange(s.desde, s.hasta, '[]') && daterange(NEW.desde, NEW.hasta, '[]')
  ) THEN
    RAISE EXCEPTION '%', CASE WHEN v_plan.tipo = 'social' THEN 'La persona ya tiene cuota social en esas fechas'
                              ELSE 'La persona ya está inscripta a "' || v_plan.nombre || '" en esas fechas' END;
  END IF;
  -- Con cuotas emitidas, el período de la inscripción no puede dejarlas afuera.
  IF TG_OP = 'UPDATE' AND EXISTS (
    SELECT 1 FROM socios.cuotas c WHERE c.suscripcion_id = NEW.id AND c.estado = 'emitida'
      AND (c.periodo_hasta < NEW.desde OR (NEW.hasta IS NOT NULL AND c.periodo_desde > NEW.hasta))
  ) THEN
    RAISE EXCEPTION 'Hay cuotas emitidas fuera de las nuevas fechas: anulalas o acreditalas primero';
  END IF;
  IF TG_OP = 'UPDATE' AND (NEW.persona_id <> OLD.persona_id OR NEW.plan_id <> OLD.plan_id) THEN
    RAISE EXCEPTION 'La persona y el plan de una inscripción no cambian: cerrala y creá otra';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER suscripciones_valida BEFORE INSERT OR UPDATE ON socios.suscripciones
  FOR EACH ROW EXECUTE FUNCTION socios._suscripcion_valida();

-- Medios de cobro: sin superposición.
CREATE FUNCTION socios._medio_valido() RETURNS trigger
LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM socios.medios_cobro m
    WHERE m.persona_id = NEW.persona_id AND m.id <> NEW.id
      AND daterange(m.desde, m.hasta, '[]') && daterange(NEW.desde, NEW.hasta, '[]')
  ) THEN
    RAISE EXCEPTION 'Ya hay un medio de cobro en esas fechas: cerralo antes';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER medios_cobro_valido BEFORE INSERT OR UPDATE ON socios.medios_cobro
  FOR EACH ROW EXECUTE FUNCTION socios._medio_valido();

-- Precios usados por cuotas: no se tocan.
CREATE FUNCTION socios._precio_inmutable() RETURNS trigger
LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM socios.cuotas WHERE precio_id = OLD.id) THEN
    RAISE EXCEPTION 'Ese precio ya se usó en cuotas: cargá uno nuevo con otra vigencia';
  END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$;
CREATE TRIGGER plan_precios_inmutable BEFORE UPDATE OR DELETE ON socios.plan_precios
  FOR EACH ROW EXECUTE FUNCTION socios._precio_inmutable();

-- Cuotas: sin superponer períodos de la misma inscripción (mensual vs
-- anual) e inmutables salvo el pase a anulada.
CREATE FUNCTION socios._cuota_valida() RETURNS trigger
LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Las cuotas no se borran: se anulan con su lote o se acreditan';
  END IF;
  IF TG_OP = 'UPDATE' THEN
    IF (to_jsonb(NEW) - 'estado') <> (to_jsonb(OLD) - 'estado') OR OLD.estado = 'anulada' THEN
      RAISE EXCEPTION 'Una cuota emitida no se modifica: corregila con una nota de crédito';
    END IF;
    RETURN NEW;
  END IF;
  IF NEW.suscripcion_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM socios.cuotas c
    WHERE c.suscripcion_id = NEW.suscripcion_id AND c.estado = 'emitida'
      AND daterange(c.periodo_desde, c.periodo_hasta, '[]') && daterange(NEW.periodo_desde, NEW.periodo_hasta, '[]')
  ) THEN
    RAISE EXCEPTION 'Ya hay una cuota de esa inscripción para ese período';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER cuotas_valida BEFORE INSERT OR UPDATE OR DELETE ON socios.cuotas
  FOR EACH ROW EXECUTE FUNCTION socios._cuota_valida();

CREATE FUNCTION socios._lote_valido() RETURNS trigger
LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Los lotes no se borran: se anulan';
  END IF;
  IF OLD.estado = 'anulado' OR (to_jsonb(NEW) - ARRAY['estado', 'motivo_anulacion', 'anulado_por', 'anulado_at'])
                                <> (to_jsonb(OLD) - ARRAY['estado', 'motivo_anulacion', 'anulado_por', 'anulado_at']) THEN
    RAISE EXCEPTION 'Un lote emitido no se modifica';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER lotes_valido BEFORE UPDATE OR DELETE ON socios.lotes
  FOR EACH ROW EXECUTE FUNCTION socios._lote_valido();

-- ------------------------------------------------------------
-- Sincronización con el padrón, la cuenta web y los roles
-- ------------------------------------------------------------
CREATE FUNCTION socios.es_socio_en(p_persona integer, p_fecha date) RETURNS boolean
LANGUAGE sql STABLE SET search_path = '' AS $$
  SELECT EXISTS (SELECT 1 FROM socios.membresias
                 WHERE persona_id = p_persona AND desde <= p_fecha AND (hasta IS NULL OR hasta >= p_fecha))
$$;

CREATE FUNCTION socios._sincronizar_persona(p_persona integer) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_hoy date := contabilidad._hoy();
  v_socio boolean := socios.es_socio_en(p_persona, v_hoy);
  v_perfil uuid;
  v_rol_socio integer;
  v_rol_no_socio integer;
BEGIN
  UPDATE public.padron_socios
     SET activo = v_socio,
         activo_since = CASE WHEN v_socio THEN now() ELSE activo_since END,
         desactivado_at = CASE WHEN v_socio THEN NULL ELSE now() END
   WHERE id = p_persona AND activo IS DISTINCT FROM v_socio;

  -- Disciplinas vigentes (lo que leen el carnet, mi cuenta y la verificación)
  DELETE FROM public.padron_disciplinas WHERE padron_socio_id = p_persona;
  INSERT INTO public.padron_disciplinas (padron_socio_id, disciplina_id, categoria, activa, fecha_ingreso)
  SELECT DISTINCT ON (p.disciplina_id, p.nombre) p_persona, p.disciplina_id, p.nombre, true, s.desde
  FROM socios.suscripciones s JOIN socios.planes p ON p.id = s.plan_id
  WHERE s.persona_id = p_persona AND p.tipo = 'disciplina'
    AND s.desde <= v_hoy AND (s.hasta IS NULL OR s.hasta >= v_hoy)
  ORDER BY p.disciplina_id, p.nombre, s.desde;

  SELECT perfil_id INTO v_perfil FROM public.padron_socios WHERE id = p_persona;
  IF v_perfil IS NOT NULL THEN
    UPDATE public.perfiles SET es_socio = v_socio WHERE id = v_perfil AND es_socio IS DISTINCT FROM v_socio;
    SELECT id INTO v_rol_socio FROM public.roles WHERE nombre = 'socio';
    SELECT id INTO v_rol_no_socio FROM public.roles WHERE nombre = 'no_socio';
    DELETE FROM public.perfil_roles
    WHERE perfil_id = v_perfil AND rol_id = CASE WHEN v_socio THEN v_rol_no_socio ELSE v_rol_socio END;
    IF (CASE WHEN v_socio THEN v_rol_socio ELSE v_rol_no_socio END) IS NOT NULL THEN
      INSERT INTO public.perfil_roles (perfil_id, rol_id)
      VALUES (v_perfil, CASE WHEN v_socio THEN v_rol_socio ELSE v_rol_no_socio END)
      ON CONFLICT (perfil_id, rol_id) DO NOTHING;
    END IF;
  END IF;
END;
$$;

CREATE FUNCTION socios._tras_cambio_persona() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  PERFORM socios._sincronizar_persona(CASE WHEN TG_OP = 'DELETE' THEN OLD.persona_id ELSE NEW.persona_id END);
  RETURN NULL;
END;
$$;
CREATE TRIGGER membresias_sincronizar AFTER INSERT OR UPDATE OR DELETE ON socios.membresias
  FOR EACH ROW EXECUTE FUNCTION socios._tras_cambio_persona();
CREATE TRIGGER suscripciones_sincronizar AFTER INSERT OR UPDATE OR DELETE ON socios.suscripciones
  FOR EACH ROW EXECUTE FUNCTION socios._tras_cambio_persona();

-- Al vincular la cuenta web, el estado lo da la membresía.
CREATE FUNCTION socios._tras_vincular_perfil() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NEW.perfil_id IS DISTINCT FROM OLD.perfil_id AND NEW.perfil_id IS NOT NULL
     AND EXISTS (SELECT 1 FROM socios.membresias WHERE persona_id = NEW.id) THEN
    PERFORM socios._sincronizar_persona(NEW.id);
  END IF;
  RETURN NULL;
END;
$$;
CREATE TRIGGER padron_socios_vincular AFTER UPDATE OF perfil_id ON public.padron_socios
  FOR EACH ROW EXECUTE FUNCTION socios._tras_vincular_perfil();

-- Altas y bajas con fecha futura: correr a diario.
CREATE FUNCTION socios.sincronizar_vigencias() RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_n integer := 0;
  r record;
BEGIN
  FOR r IN
    SELECT p.id FROM public.padron_socios p
    WHERE EXISTS (SELECT 1 FROM socios.membresias m WHERE m.persona_id = p.id)
      AND (p.activo IS DISTINCT FROM socios.es_socio_en(p.id, contabilidad._hoy())
           OR EXISTS (SELECT 1 FROM socios.suscripciones s
                      WHERE s.persona_id = p.id
                        AND (s.desde = contabilidad._hoy() OR s.hasta = contabilidad._hoy() - 1)))
  LOOP
    PERFORM socios._sincronizar_persona(r.id);
    v_n := v_n + 1;
  END LOOP;
  RETURN v_n;
END;
$$;

-- ------------------------------------------------------------
-- Operaciones de padrón
-- ------------------------------------------------------------
-- Alta (o reingreso) de una persona como socia. Si la cédula no está en
-- el padrón, la crea. p_planes: [{plan_id, periodicidad?}] (cuota social
-- y disciplinas desde la misma fecha). p_medio: {medio, disciplina_id?,
-- tarjeta_ultimos4?, tarjeta_vencimiento?, titular_documento?, titular_nombre?}.
CREATE FUNCTION socios.alta_socio(
  p_persona jsonb, p_desde date, p_planes jsonb DEFAULT '[]', p_medio jsonb DEFAULT NULL
) RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_cedula text := regexp_replace(coalesce(p_persona ->> 'cedula', ''), '[^0-9]', '', 'g');
  v_id integer;
  v_p jsonb;
BEGIN
  PERFORM socios._exigir_secretaria();
  IF v_cedula = '' THEN
    RAISE EXCEPTION 'Falta la cédula';
  END IF;
  IF p_desde IS NULL OR p_desde > contabilidad._hoy() + 90 THEN
    RAISE EXCEPTION 'Fecha de alta inválida';
  END IF;

  SELECT id INTO v_id FROM public.padron_socios WHERE cedula = v_cedula FOR UPDATE;
  IF v_id IS NULL THEN
    IF nullif(btrim(p_persona ->> 'nombre'), '') IS NULL OR nullif(btrim(p_persona ->> 'apellido'), '') IS NULL THEN
      RAISE EXCEPTION 'Faltan nombre y apellido';
    END IF;
    INSERT INTO public.padron_socios (nombre, apellido, cedula, fecha_nacimiento, telefono, email, direccion,
                                      activo, created_by)
    VALUES (btrim(p_persona ->> 'nombre'), btrim(p_persona ->> 'apellido'), v_cedula,
            (p_persona ->> 'fecha_nacimiento')::date, nullif(btrim(p_persona ->> 'telefono'), ''),
            nullif(lower(btrim(p_persona ->> 'email')), ''), nullif(btrim(p_persona ->> 'direccion'), ''),
            false, auth.uid())
    RETURNING id INTO v_id;
  END IF;

  UPDATE public.padron_socios
     SET numero_socio = coalesce(numero_socio, nullif(p_persona ->> 'numero_socio', '')::integer,
                                 nextval('socios.numero_socio_seq')::integer)
   WHERE id = v_id;

  INSERT INTO socios.membresias (persona_id, desde) VALUES (v_id, p_desde);

  FOR v_p IN SELECT * FROM jsonb_array_elements(coalesce(p_planes, '[]')) LOOP
    INSERT INTO socios.suscripciones (persona_id, plan_id, periodicidad, desde)
    VALUES (v_id, (v_p ->> 'plan_id')::integer, coalesce(v_p ->> 'periodicidad', 'mensual'), p_desde);
  END LOOP;

  IF p_medio IS NOT NULL THEN
    PERFORM socios.cambiar_medio_cobro(v_id, p_medio, p_desde);
  END IF;
  RETURN v_id;
END;
$$;

-- Baja: cierra la membresía, las inscripciones y el medio de cobro.
-- La deuda se trata aparte (mantener o acreditar: ver cobranza).
CREATE FUNCTION socios.baja_socio(p_persona integer, p_hasta date, p_motivo smallint, p_notas text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_m socios.membresias;
BEGIN
  PERFORM socios._exigir_secretaria();
  SELECT * INTO v_m FROM socios.membresias WHERE persona_id = p_persona AND hasta IS NULL FOR UPDATE;
  IF v_m.id IS NULL THEN
    RAISE EXCEPTION 'La persona no es socia';
  END IF;
  IF p_hasta IS NULL OR p_hasta < v_m.desde THEN
    RAISE EXCEPTION 'La fecha de baja no puede ser anterior al alta (%)', to_char(v_m.desde, 'DD/MM/YYYY');
  END IF;
  IF p_motivo IS NULL THEN
    RAISE EXCEPTION 'Indicá el motivo de la baja';
  END IF;
  -- Antes que la membresía, para que las inscripciones sigan adentro.
  UPDATE socios.suscripciones SET hasta = greatest(desde, p_hasta), motivo_fin = 'Baja como socio'
  WHERE persona_id = p_persona AND (hasta IS NULL OR hasta > p_hasta);
  UPDATE socios.medios_cobro SET hasta = greatest(desde, p_hasta)
  WHERE persona_id = p_persona AND hasta IS NULL;
  UPDATE socios.membresias SET hasta = p_hasta, motivo_baja_id = p_motivo, notas_baja = nullif(btrim(p_notas), '')
  WHERE id = v_m.id;
END;
$$;

-- Deshace una baja (error de carga): reabre la última membresía si no
-- hubo otra después. Las inscripciones se vuelven a crear a mano.
CREATE FUNCTION socios.anular_baja(p_persona integer) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_m socios.membresias;
BEGIN
  PERFORM socios._exigir_secretaria();
  SELECT * INTO v_m FROM socios.membresias WHERE persona_id = p_persona ORDER BY desde DESC LIMIT 1 FOR UPDATE;
  IF v_m.id IS NULL OR v_m.hasta IS NULL THEN
    RAISE EXCEPTION 'La persona no tiene una baja para anular';
  END IF;
  UPDATE socios.membresias SET hasta = NULL, motivo_baja_id = NULL, notas_baja = NULL WHERE id = v_m.id;
END;
$$;

CREATE FUNCTION socios.inscribir(p_persona integer, p_plan integer, p_desde date, p_periodicidad text DEFAULT 'mensual')
RETURNS bigint
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_id bigint;
BEGIN
  PERFORM socios._exigir_secretaria();
  INSERT INTO socios.suscripciones (persona_id, plan_id, periodicidad, desde)
  VALUES (p_persona, p_plan, coalesce(p_periodicidad, 'mensual'), p_desde)
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

CREATE FUNCTION socios.finalizar_inscripcion(p_suscripcion bigint, p_hasta date, p_motivo text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  PERFORM socios._exigir_secretaria();
  UPDATE socios.suscripciones SET hasta = p_hasta, motivo_fin = nullif(btrim(p_motivo), '')
  WHERE id = p_suscripcion AND (hasta IS NULL OR hasta > p_hasta);
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Inscripción inexistente o ya terminada antes de esa fecha';
  END IF;
END;
$$;

-- Cambio de plan (de categoría): cierra una inscripción y abre otra el
-- día siguiente, en una sola operación.
CREATE FUNCTION socios.cambiar_plan(p_suscripcion bigint, p_plan_nuevo integer, p_desde date, p_periodicidad text DEFAULT NULL)
RETURNS bigint
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_s socios.suscripciones;
  v_id bigint;
BEGIN
  PERFORM socios._exigir_secretaria();
  SELECT * INTO v_s FROM socios.suscripciones WHERE id = p_suscripcion FOR UPDATE;
  IF v_s.id IS NULL OR (v_s.hasta IS NOT NULL AND v_s.hasta < p_desde) THEN
    RAISE EXCEPTION 'La inscripción no está vigente en esa fecha';
  END IF;
  IF p_desde <= v_s.desde THEN
    RAISE EXCEPTION 'El cambio tiene que ser posterior al inicio de la inscripción';
  END IF;
  UPDATE socios.suscripciones SET hasta = p_desde - 1, motivo_fin = 'Cambio de plan' WHERE id = p_suscripcion;
  INSERT INTO socios.suscripciones (persona_id, plan_id, periodicidad, desde, hasta)
  VALUES (v_s.persona_id, p_plan_nuevo, coalesce(p_periodicidad, v_s.periodicidad), p_desde, v_s.hasta)
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

CREATE FUNCTION socios.cambiar_medio_cobro(p_persona integer, p_medio jsonb, p_desde date) RETURNS bigint
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_actual socios.medios_cobro;
  v_id bigint;
BEGIN
  PERFORM socios._exigir_secretaria();
  SELECT * INTO v_actual FROM socios.medios_cobro WHERE persona_id = p_persona AND hasta IS NULL FOR UPDATE;
  IF v_actual.id IS NOT NULL THEN
    IF p_desde <= v_actual.desde THEN
      -- Corrección del mismo día: se reemplaza.
      DELETE FROM socios.medios_cobro WHERE id = v_actual.id;
    ELSE
      UPDATE socios.medios_cobro SET hasta = p_desde - 1 WHERE id = v_actual.id;
    END IF;
  END IF;
  INSERT INTO socios.medios_cobro (persona_id, medio, disciplina_id, tarjeta_ultimos4, tarjeta_vencimiento,
                                   titular_documento, titular_nombre, desde)
  VALUES (p_persona, p_medio ->> 'medio', (p_medio ->> 'disciplina_id')::integer,
          nullif(p_medio ->> 'tarjeta_ultimos4', ''),
          date_trunc('month', (nullif(p_medio ->> 'tarjeta_vencimiento', ''))::date)::date,
          nullif(btrim(p_medio ->> 'titular_documento'), ''), nullif(btrim(p_medio ->> 'titular_nombre'), ''),
          p_desde)
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

-- ------------------------------------------------------------
-- Emisión de cuotas
-- ------------------------------------------------------------
CREATE FUNCTION socios._centro_disciplina(p_disciplina integer) RETURNS uuid
LANGUAGE plpgsql STABLE SET search_path = '' AS $$
DECLARE
  v_id uuid;
BEGIN
  SELECT id INTO v_id FROM contabilidad.centros_costo WHERE disciplina_id = p_disciplina;
  IF v_id IS NULL THEN
    RAISE EXCEPTION 'La disciplina % no tiene centro de costo: sincronizá los centros en Contabilidad', p_disciplina;
  END IF;
  RETURN v_id;
END;
$$;

-- Lo que emitiría un lote del período: una fila por inscripción vigente.
-- Mensual: el mes. Anual: el año calendario (o desde el primer mes de
-- la inscripción, si empezó ese año), proporcional a los meses; se emite
-- en el mes de la cuota anual o, si la inscripción empieza después, en
-- su primer mes.
-- "excluida" explica por qué una inscripción no lleva cuota.
CREATE FUNCTION socios.previsualizar_lote(p_periodo date)
RETURNS TABLE (
  suscripcion_id bigint, persona_id integer, plan_id integer, tipo text, disciplina_id integer,
  concepto text, periodicidad text, periodo_desde date, periodo_hasta date,
  importe numeric, precio_id bigint, excluida text
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_ini date := date_trunc('month', p_periodo)::date;
  v_fin date := (date_trunc('month', p_periodo) + interval '1 month - 1 day')::date;
  v_cfg socios.config;
BEGIN
  PERFORM socios._exigir(ARRAY['secretaria', 'tesorero', 'comision_fiscal']);
  SELECT * INTO v_cfg FROM socios.config;
  RETURN QUERY
  WITH s AS (
    SELECT s.*, p.nombre AS plan_nombre, p.tipo AS plan_tipo, p.disciplina_id AS plan_disciplina,
           (SELECT m.desde FROM socios.membresias m
            WHERE m.persona_id = s.persona_id AND m.desde <= v_fin AND (m.hasta IS NULL OR m.hasta >= v_ini)
            ORDER BY m.desde DESC LIMIT 1) AS alta
    FROM socios.suscripciones s JOIN socios.planes p ON p.id = s.plan_id
    WHERE s.desde <= v_fin AND (s.hasta IS NULL OR s.hasta >= v_ini)
  ), c AS (
    SELECT s.*,
      CASE WHEN s.periodicidad = 'mensual' THEN v_ini
           WHEN (extract(month FROM v_ini) = v_cfg.mes_cuota_anual AND date_trunc('month', s.desde) <= v_ini)
                OR (date_trunc('month', s.desde) = v_ini AND extract(month FROM v_ini) > v_cfg.mes_cuota_anual)
             THEN greatest(date_trunc('year', v_ini)::date, date_trunc('month', s.desde)::date)
      END AS p_desde
    FROM s
  ), d AS (
    SELECT c.*,
      CASE WHEN c.periodicidad = 'mensual' THEN v_fin
           ELSE make_date(extract(year FROM v_ini)::int, 12, 31) END AS p_hasta,
      socios.precio_vigente(c.plan_id, v_ini) AS precio
    FROM c WHERE c.p_desde IS NOT NULL
  )
  SELECT d.id, d.persona_id, d.plan_id, d.plan_tipo, d.plan_disciplina,
    d.plan_nombre || ' — ' || CASE WHEN d.periodicidad = 'anual'
        THEN 'anual ' || extract(year FROM v_ini) || CASE WHEN extract(month FROM d.p_desde) > 1
             THEN ' (desde ' || to_char(d.p_desde, 'MM/YYYY') || ')' ELSE '' END
        ELSE to_char(v_ini, 'MM/YYYY') END,
    d.periodicidad, d.p_desde, d.p_hasta,
    CASE WHEN d.periodicidad = 'mensual' THEN (d.precio).importe_mensual
         ELSE round(coalesce((d.precio).importe_anual, (d.precio).importe_mensual * 12)
                    * (13 - extract(month FROM d.p_desde)) / 12, 2) END,
    (d.precio).id,
    CASE
      WHEN (d.precio).id IS NULL THEN 'El plan no tiene precio para el período'
      WHEN EXISTS (SELECT 1 FROM socios.cuotas q WHERE q.suscripcion_id = d.id AND q.estado = 'emitida'
                   AND daterange(q.periodo_desde, q.periodo_hasta, '[]') && daterange(d.p_desde, d.p_hasta, '[]'))
        THEN 'Ya tiene cuota del período'
      WHEN NOT v_cfg.cobrar_mes_alta AND d.periodicidad = 'mensual' AND d.alta BETWEEN v_ini AND v_fin
        THEN 'Mes del alta bonificado'
    END
  FROM d;
END;
$$;

-- Emite las cuotas del período para las inscripciones sin exclusión y
-- las contabiliza en un asiento: Debe cuotas a cobrar / Haber ingreso
-- (cuota social sin centro; disciplinas con el centro de cada una).
-- p_omitir: inscripciones a dejar fuera de este lote.
CREATE FUNCTION socios.emitir_lote(
  p_periodo date, p_fecha_emision date DEFAULT NULL, p_fecha_vencimiento date DEFAULT NULL,
  p_omitir bigint[] DEFAULT '{}'
) RETURNS bigint
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_ini date := date_trunc('month', p_periodo)::date;
  v_emision date;
  v_venc date;
  v_cfg socios.config;
  v_lote bigint;
  v_asiento uuid;
  v_cobrar_social uuid := contabilidad.cuenta_para('socios', 'cuotas_sociales_cobrar');
  v_cobrar_disc uuid := contabilidad.cuenta_para('socios', 'cuotas_disciplina_cobrar');
  v_ing_social uuid := contabilidad.cuenta_para('socios', 'ingreso_cuota_social');
  v_ing_disc uuid := contabilidad.cuenta_para('socios', 'ingreso_cuota_disciplina');
  v_lineas jsonb;
  v_n integer;
  v_total numeric;
BEGIN
  PERFORM socios._exigir_tesoreria();
  SELECT * INTO v_cfg FROM socios.config;
  v_emision := coalesce(p_fecha_emision, v_ini);
  v_venc := coalesce(p_fecha_vencimiento, v_ini + v_cfg.dia_vencimiento - 1);
  -- Un lote por período a la vez (los pedidos simultáneos esperan).
  PERFORM pg_advisory_xact_lock(hashtext('socios.lote'), extract(epoch FROM v_ini)::integer);

  IF to_regclass('pg_temp._lote') IS NOT NULL THEN
    DROP TABLE pg_temp._lote;
  END IF;
  CREATE TEMP TABLE _lote ON COMMIT DROP AS
  SELECT p.*,
         CASE WHEN p.tipo = 'disciplina' THEN v_cobrar_disc ELSE v_cobrar_social END AS cobrar,
         CASE WHEN p.tipo = 'disciplina' THEN v_ing_disc ELSE v_ing_social END AS ingreso,
         CASE WHEN p.tipo = 'disciplina' THEN socios._centro_disciplina(p.disciplina_id) END AS centro
  FROM socios.previsualizar_lote(v_ini) p
  WHERE p.excluida IS NULL AND NOT p.suscripcion_id = ANY (coalesce(p_omitir, '{}'));

  SELECT count(*), coalesce(sum(importe), 0) INTO v_n, v_total FROM _lote;
  IF v_n = 0 THEN
    RAISE EXCEPTION 'No hay cuotas para emitir en %', to_char(v_ini, 'MM/YYYY');
  END IF;

  SELECT jsonb_agg(l ORDER BY o) INTO v_lineas FROM (
    SELECT 1 AS o, jsonb_build_object('cuenta_id', cobrar, 'lado', 'debe', 'importe', sum(importe)) AS l
    FROM _lote GROUP BY cobrar
    UNION ALL
    SELECT 2, jsonb_strip_nulls(jsonb_build_object('cuenta_id', ingreso, 'lado', 'haber', 'importe', sum(importe),
                                                   'centro_costo_id', centro))
    FROM _lote GROUP BY ingreso, centro
  ) x;

  v_lote := nextval(pg_get_serial_sequence('socios.lotes', 'id'));
  v_asiento := contabilidad._asiento_automatico(v_emision, 'Cuotas de socios ' || to_char(v_ini, 'MM/YYYY'),
                                                'lote_cuotas', v_lote::text, v_lineas);
  INSERT INTO socios.lotes (id, periodo, fecha_emision, fecha_vencimiento, cantidad, importe_total, asiento_id)
  OVERRIDING SYSTEM VALUE
  VALUES (v_lote, v_ini, v_emision, v_venc, v_n, v_total, v_asiento);

  INSERT INTO socios.cuotas (persona_id, tipo, suscripcion_id, plan_id, disciplina_id, concepto, periodicidad,
                             periodo_desde, periodo_hasta, importe, precio_id, fecha_emision, fecha_vencimiento,
                             cuenta_cobrar_id, cuenta_ingreso_id, centro_costo_id, lote_id, asiento_id)
  SELECT persona_id, tipo, suscripcion_id, plan_id, disciplina_id, concepto, periodicidad,
         periodo_desde, periodo_hasta, importe, precio_id, v_emision, greatest(v_venc, v_emision),
         cobrar, ingreso, centro, v_lote, v_asiento
  FROM _lote;
  RETURN v_lote;
END;
$$;

-- Cuota de una inscripción fuera del lote (alta a mitad de mes, cuota
-- que faltó). Con importe distinto del precio, motivo obligatorio.
CREATE FUNCTION socios.emitir_cuota(
  p_suscripcion bigint, p_periodo date, p_importe numeric DEFAULT NULL, p_motivo text DEFAULT NULL,
  p_fecha_emision date DEFAULT NULL
) RETURNS bigint
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_ini date := date_trunc('month', p_periodo)::date;
  v_s socios.suscripciones;
  v_plan socios.planes;
  v_precio socios.plan_precios;
  v_cfg socios.config;
  v_hasta date;
  v_importe numeric;
  v_emision date;
  v_cobrar uuid;
  v_ingreso uuid;
  v_centro uuid;
  v_asiento uuid;
  v_id bigint;
  v_concepto text;
BEGIN
  PERFORM socios._exigir_tesoreria();
  SELECT * INTO v_cfg FROM socios.config;
  SELECT * INTO v_s FROM socios.suscripciones WHERE id = p_suscripcion;
  SELECT * INTO v_plan FROM socios.planes WHERE id = v_s.plan_id;
  IF v_s.id IS NULL THEN
    RAISE EXCEPTION 'Inscripción inexistente';
  END IF;
  IF v_s.periodicidad = 'anual' THEN
    v_ini := greatest(date_trunc('year', v_ini)::date, date_trunc('month', v_s.desde)::date);
  END IF;
  v_hasta := CASE WHEN v_s.periodicidad = 'mensual' THEN (v_ini + interval '1 month - 1 day')::date
                  ELSE make_date(extract(year FROM v_ini)::int, 12, 31) END;
  IF v_s.desde > v_hasta OR (v_s.hasta IS NOT NULL AND v_s.hasta < v_ini) THEN
    RAISE EXCEPTION 'La inscripción no está vigente en %', to_char(v_ini, 'MM/YYYY');
  END IF;
  v_precio := socios.precio_vigente(v_s.plan_id, v_ini);
  IF v_precio.id IS NULL THEN
    RAISE EXCEPTION 'El plan "%" no tiene precio para %', v_plan.nombre, to_char(v_ini, 'MM/YYYY');
  END IF;
  v_importe := CASE WHEN v_s.periodicidad = 'mensual' THEN v_precio.importe_mensual
                    ELSE round(coalesce(v_precio.importe_anual, v_precio.importe_mensual * 12)
                               * (13 - extract(month FROM v_ini)) / 12, 2) END;
  IF p_importe IS NOT NULL AND round(p_importe, 2) <> v_importe THEN
    IF nullif(btrim(p_motivo), '') IS NULL THEN
      RAISE EXCEPTION 'El importe difiere del precio (%): indicá el motivo', v_importe;
    END IF;
    v_importe := round(p_importe, 2);
  END IF;

  v_emision := coalesce(p_fecha_emision, greatest(v_ini, least(contabilidad._hoy(), v_hasta)));
  v_cobrar := contabilidad.cuenta_para('socios', CASE WHEN v_plan.tipo = 'disciplina' THEN 'cuotas_disciplina_cobrar'
                                                      ELSE 'cuotas_sociales_cobrar' END);
  v_ingreso := contabilidad.cuenta_para('socios', CASE WHEN v_plan.tipo = 'disciplina' THEN 'ingreso_cuota_disciplina'
                                                       ELSE 'ingreso_cuota_social' END);
  v_centro := CASE WHEN v_plan.tipo = 'disciplina' THEN socios._centro_disciplina(v_plan.disciplina_id) END;
  v_concepto := v_plan.nombre || ' — ' || CASE WHEN v_s.periodicidad = 'anual'
                  THEN 'anual ' || extract(year FROM v_ini) ELSE to_char(v_ini, 'MM/YYYY') END;

  v_asiento := contabilidad._asiento_automatico(v_emision, 'Cuota ' || v_concepto, 'cuota',
    'suscripcion-' || p_suscripcion || '-' || to_char(v_ini, 'YYYY-MM'),
    jsonb_build_array(
      jsonb_build_object('cuenta_id', v_cobrar, 'lado', 'debe', 'importe', v_importe),
      jsonb_strip_nulls(jsonb_build_object('cuenta_id', v_ingreso, 'lado', 'haber', 'importe', v_importe,
                                           'centro_costo_id', v_centro))));

  INSERT INTO socios.cuotas (persona_id, tipo, suscripcion_id, plan_id, disciplina_id, concepto, periodicidad,
                             periodo_desde, periodo_hasta, importe, precio_id, motivo_importe, fecha_emision,
                             fecha_vencimiento, cuenta_cobrar_id, cuenta_ingreso_id, centro_costo_id, asiento_id)
  VALUES (v_s.persona_id, v_plan.tipo, v_s.id, v_plan.id, v_plan.disciplina_id, v_concepto, v_s.periodicidad,
          v_ini, v_hasta, v_importe, v_precio.id, nullif(btrim(p_motivo), ''), v_emision,
          greatest(v_emision, v_ini + v_cfg.dia_vencimiento - 1), v_cobrar, v_ingreso, v_centro, v_asiento)
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

-- Cargo suelto a una persona (cuota de ingreso, aporte extraordinario):
-- la cuenta de ingreso la elige tesorería; si exige centro, va el centro.
CREATE FUNCTION socios.emitir_cargo(
  p_persona integer, p_concepto text, p_importe numeric, p_cuenta_ingreso uuid,
  p_centro_costo uuid DEFAULT NULL, p_fecha date DEFAULT NULL, p_vencimiento date DEFAULT NULL
) RETURNS bigint
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_cuenta contabilidad.cuentas;
  v_fecha date := coalesce(p_fecha, contabilidad._hoy());
  v_cobrar uuid := contabilidad.cuenta_para('socios', 'cuotas_sociales_cobrar');
  v_asiento uuid;
  v_id bigint;
BEGIN
  PERFORM socios._exigir_tesoreria();
  SELECT * INTO v_cuenta FROM contabilidad.cuentas WHERE id = p_cuenta_ingreso;
  IF v_cuenta.id IS NULL OR v_cuenta.clase <> 'ingreso' OR NOT v_cuenta.imputable THEN
    RAISE EXCEPTION 'Elegí una cuenta de ingresos imputable';
  END IF;
  IF p_importe IS NULL OR p_importe <= 0 THEN
    RAISE EXCEPTION 'El importe tiene que ser mayor que cero';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.padron_socios WHERE id = p_persona) THEN
    RAISE EXCEPTION 'Persona inexistente';
  END IF;

  -- Reserva el id para usarlo como origen del asiento.
  v_id := nextval(pg_get_serial_sequence('socios.cuotas', 'id'));
  v_asiento := contabilidad._asiento_automatico(v_fecha, btrim(p_concepto), 'cuota', 'cargo-' || v_id,
    jsonb_build_array(
      jsonb_build_object('cuenta_id', v_cobrar, 'lado', 'debe', 'importe', round(p_importe, 2)),
      jsonb_strip_nulls(jsonb_build_object('cuenta_id', v_cuenta.id, 'lado', 'haber', 'importe', round(p_importe, 2),
                                           'centro_costo_id', p_centro_costo))));

  INSERT INTO socios.cuotas (id, persona_id, tipo, concepto, periodicidad, periodo_desde, periodo_hasta, importe,
                             fecha_emision, fecha_vencimiento, cuenta_cobrar_id, cuenta_ingreso_id, centro_costo_id,
                             asiento_id)
  OVERRIDING SYSTEM VALUE
  VALUES (v_id, p_persona, 'cargo', btrim(p_concepto), 'unica', v_fecha, v_fecha, round(p_importe, 2),
          v_fecha, coalesce(p_vencimiento, v_fecha), v_cobrar, v_cuenta.id, p_centro_costo, v_asiento);
  RETURN v_id;
END;
$$;

-- ------------------------------------------------------------
-- RLS, auditoría y permisos
-- ------------------------------------------------------------
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['config', 'motivos_baja', 'membresias', 'planes', 'plan_precios', 'suscripciones',
                           'medios_cobro', 'lotes', 'cuotas'] LOOP
    EXECUTE format('ALTER TABLE socios.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('CREATE POLICY %I ON socios.%I FOR SELECT TO authenticated USING (socios.puede_leer())',
                   t || '_lectura', t);
    EXECUTE format('REVOKE ALL ON socios.%I FROM PUBLIC, anon, authenticated', t);
    EXECUTE format('GRANT SELECT ON socios.%I TO authenticated, service_role', t);
  END LOOP;
  FOREACH t IN ARRAY ARRAY['config', 'membresias', 'planes', 'plan_precios', 'suscripciones', 'medios_cobro',
                           'lotes'] LOOP
    EXECUTE format('CREATE TRIGGER %I AFTER INSERT OR UPDATE OR DELETE ON socios.%I
                    FOR EACH ROW EXECUTE FUNCTION contabilidad._auditar()', t || '_auditoria', t);
  END LOOP;
END $$;

-- Catálogos que edita secretaría directamente (planes y motivos); los
-- precios y la configuración los edita tesorería. Todo lo demás, por
-- funciones.
CREATE POLICY planes_escritura ON socios.planes FOR ALL TO authenticated
  USING (contabilidad._tiene_rol(ARRAY['super_admin', 'secretaria', 'tesorero']))
  WITH CHECK (contabilidad._tiene_rol(ARRAY['super_admin', 'secretaria', 'tesorero']));
CREATE POLICY motivos_baja_escritura ON socios.motivos_baja FOR ALL TO authenticated
  USING (contabilidad._tiene_rol(ARRAY['super_admin', 'secretaria']))
  WITH CHECK (contabilidad._tiene_rol(ARRAY['super_admin', 'secretaria']));
CREATE POLICY plan_precios_escritura ON socios.plan_precios FOR ALL TO authenticated
  USING (contabilidad._tiene_rol(ARRAY['super_admin', 'tesorero']))
  WITH CHECK (contabilidad._tiene_rol(ARRAY['super_admin', 'tesorero']));
CREATE POLICY config_escritura ON socios.config FOR UPDATE TO authenticated
  USING (contabilidad._tiene_rol(ARRAY['super_admin', 'tesorero']))
  WITH CHECK (contabilidad._tiene_rol(ARRAY['super_admin', 'tesorero']));
GRANT INSERT, UPDATE, DELETE ON socios.planes, socios.motivos_baja, socios.plan_precios TO authenticated;
GRANT UPDATE ON socios.config TO authenticated;
GRANT USAGE ON SEQUENCE socios.numero_socio_seq TO authenticated, service_role;

-- Contabilidad ve los socios (auxiliar de cuotas)
CREATE POLICY "Contabilidad ve el padrón" ON public.padron_socios FOR SELECT TO authenticated
  USING (contabilidad.puede_leer());

REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA socios FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION socios._exigir(text[]), socios._exigir_secretaria(), socios._exigir_tesoreria(),
  socios._exigir_cobranza(), socios._membresia_valida(), socios._suscripcion_valida(), socios._medio_valido(),
  socios._precio_inmutable(), socios._cuota_valida(), socios._lote_valido(), socios._sincronizar_persona(integer),
  socios._tras_cambio_persona(), socios._tras_vincular_perfil(), socios._centro_disciplina(integer),
  socios.sincronizar_vigencias()
  FROM authenticated;
GRANT EXECUTE ON FUNCTION socios.puede_leer(), socios.precio_vigente(integer, date), socios.es_socio_en(integer, date),
  socios.alta_socio(jsonb, date, jsonb, jsonb), socios.baja_socio(integer, date, smallint, text),
  socios.anular_baja(integer), socios.inscribir(integer, integer, date, text),
  socios.finalizar_inscripcion(bigint, date, text), socios.cambiar_plan(bigint, integer, date, text),
  socios.cambiar_medio_cobro(integer, jsonb, date), socios.previsualizar_lote(date),
  socios.emitir_lote(date, date, date, bigint[]), socios.emitir_cuota(bigint, date, numeric, text, date),
  socios.emitir_cargo(integer, text, numeric, uuid, uuid, date, date)
  TO authenticated;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA socios TO service_role;
