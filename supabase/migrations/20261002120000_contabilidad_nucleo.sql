-- ============================================================
-- Contabilidad — núcleo (partida doble)
--
-- Schema propio para no chocar con la tesorería actual
-- (cuentas_financieras, movimientos_financieros, presupuestos…),
-- que sigue en uso hasta el corte.
--
-- Principio: la base es la única autoridad. Las reglas viven en
-- triggers y constraints, así valen también para service_role:
--   · asiento confirmado = inmutable; se corrige con reversión
--   · cuadre exacto Σdebe = Σhaber al confirmar, mínimo 2 líneas
--   · período cerrado = no se escribe
--   · numeración correlativa por ejercicio, asignada al confirmar
--   · coherencia moneda de la cuenta ↔ importe de origen × TC
--   · cuenta imputable y activa; auxiliar / centro de costo si la
--     cuenta lo exige
--   · auditoría append-only de todo
-- Escritura de asientos, ejercicios, períodos y cotizaciones: solo
-- por funciones. Plan de cuentas y centros de costo: directo con
-- RLS (los triggers validan).
-- ============================================================

CREATE SCHEMA IF NOT EXISTS contabilidad;
GRANT USAGE ON SCHEMA contabilidad TO authenticated, service_role;

-- Roles nuevos (en producción no existe "tesorero" aunque las
-- policies de la tesorería actual lo usan).
INSERT INTO public.roles (nombre, descripcion) VALUES
  ('tesorero', 'Tesorería y contabilidad'),
  ('comision_fiscal', 'Comisión Fiscal: consulta de libros y reportes')
ON CONFLICT (nombre) DO NOTHING;

-- ------------------------------------------------------------
-- Tipos
-- ------------------------------------------------------------
CREATE TYPE contabilidad.clase_cuenta AS ENUM ('activo', 'pasivo', 'patrimonio', 'ingreso', 'egreso');
CREATE TYPE contabilidad.naturaleza AS ENUM ('deudora', 'acreedora');
CREATE TYPE contabilidad.tipo_auxiliar AS ENUM ('proveedor', 'disciplina');
CREATE TYPE contabilidad.tipo_asiento AS ENUM (
  'manual', 'automatico', 'apertura', 'cierre', 'refundicion', 'revaluacion', 'reversion'
);
CREATE TYPE contabilidad.estado_asiento AS ENUM ('borrador', 'confirmado');
CREATE TYPE contabilidad.estado_periodo AS ENUM ('abierto', 'cerrado');

-- ------------------------------------------------------------
-- Permisos (helpers)
-- ------------------------------------------------------------
-- public.tiene_algun_rol depende del search_path de quien llama; acá
-- todo va calificado.
CREATE FUNCTION contabilidad._tiene_rol(p_roles text[]) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.perfil_roles pr
    JOIN public.roles r ON r.id = pr.rol_id
    WHERE pr.perfil_id = auth.uid() AND r.nombre = ANY (p_roles)
  );
$$;

CREATE FUNCTION contabilidad.puede_leer() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT contabilidad._tiene_rol(ARRAY['super_admin', 'tesorero', 'comision_fiscal']);
$$;

CREATE FUNCTION contabilidad.puede_escribir() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT contabilidad._tiene_rol(ARRAY['super_admin', 'tesorero']);
$$;

-- Corta si quien llama por la API no es tesorero. Conexiones
-- directas a la base (migraciones, scripts de admin) y service_role
-- pasan: no llegan con claims de usuario.
CREATE FUNCTION contabilidad._exigir_escritura() RETURNS void
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_claims text := current_setting('request.jwt.claims', true);
BEGIN
  IF v_claims IS NULL OR v_claims = '' THEN
    RETURN;
  END IF;
  IF (v_claims::jsonb ->> 'role') = 'service_role' THEN
    RETURN;
  END IF;
  IF NOT contabilidad._tiene_rol(ARRAY['super_admin', 'tesorero']) THEN
    RAISE EXCEPTION 'No autorizado: requiere rol tesorero' USING ERRCODE = '42501';
  END IF;
END;
$$;

-- Lectura de reportes: roles de consulta, service_role o conexión directa.
CREATE FUNCTION contabilidad._exigir_lectura() RETURNS void
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_claims text := current_setting('request.jwt.claims', true);
BEGIN
  IF v_claims IS NULL OR v_claims = '' THEN
    RETURN;
  END IF;
  IF (v_claims::jsonb ->> 'role') = 'service_role' THEN
    RETURN;
  END IF;
  IF NOT contabilidad._tiene_rol(ARRAY['super_admin', 'tesorero', 'comision_fiscal']) THEN
    RAISE EXCEPTION 'No autorizado' USING ERRCODE = '42501';
  END IF;
END;
$$;

CREATE FUNCTION contabilidad._hoy() RETURNS date
LANGUAGE sql STABLE SET search_path = '' AS $$
  SELECT (now() AT TIME ZONE 'America/Montevideo')::date;
$$;

-- Procesos internos (cierre, reversión, reapertura) marcan la
-- transacción para que los triggers les permitan lo que a un
-- usuario no.
CREATE FUNCTION contabilidad._proceso() RETURNS text
LANGUAGE sql STABLE SET search_path = '' AS $$
  SELECT coalesce(current_setting('contabilidad.proceso', true), '');
$$;

CREATE FUNCTION contabilidad._set_updated_at() RETURNS trigger
LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

-- ------------------------------------------------------------
-- Monedas, configuración y cotizaciones
-- ------------------------------------------------------------
CREATE TABLE contabilidad.monedas (
  codigo char(3) PRIMARY KEY CHECK (codigo ~ '^[A-Z]{3}$'),
  nombre text NOT NULL,
  simbolo text NOT NULL,
  bcu_codigo integer UNIQUE,
  activa boolean NOT NULL DEFAULT true
);

INSERT INTO contabilidad.monedas (codigo, nombre, simbolo, bcu_codigo) VALUES
  ('UYU', 'Peso uruguayo', '$', NULL),
  ('USD', 'Dólar estadounidense', 'US$', 2225);

CREATE TABLE contabilidad.config (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  moneda_funcional char(3) NOT NULL DEFAULT 'UYU' REFERENCES contabilidad.monedas (codigo),
  regimen_iva text NOT NULL DEFAULT 'no_contribuyente'
    CHECK (regimen_iva IN ('no_contribuyente', 'contribuyente')),
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO contabilidad.config DEFAULT VALUES;

CREATE FUNCTION contabilidad.moneda_funcional() RETURNS char(3)
LANGUAGE sql STABLE SET search_path = '' AS $$
  SELECT moneda_funcional FROM contabilidad.config WHERE id;
$$;

-- Cotización: unidades de moneda funcional por 1 unidad de `moneda`.
-- BCU publica un único valor interbancario (compra = venta).
CREATE TABLE contabilidad.cotizaciones (
  moneda char(3) NOT NULL REFERENCES contabilidad.monedas (codigo),
  fecha date NOT NULL,
  tasa numeric(18, 6) NOT NULL CHECK (tasa > 0),
  fuente text NOT NULL CHECK (fuente IN ('bcu', 'manual')),
  cargado_por uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (moneda, fecha)
);

CREATE FUNCTION contabilidad._cotizacion_valida() RETURNS trigger
LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  IF NEW.moneda = contabilidad.moneda_funcional() THEN
    RAISE EXCEPTION 'La moneda funcional no lleva cotización';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER cotizaciones_valida BEFORE INSERT OR UPDATE ON contabilidad.cotizaciones
  FOR EACH ROW EXECUTE FUNCTION contabilidad._cotizacion_valida();

-- TC para documentos: cierre del día hábil anterior a la operación
-- (Decreto 150/007 art. 74). NULL si no hay cotización cargada.
CREATE FUNCTION contabilidad.tc_vigente(p_moneda char(3), p_fecha date) RETURNS numeric
LANGUAGE sql STABLE SET search_path = '' AS $$
  SELECT CASE
    WHEN p_moneda = contabilidad.moneda_funcional() THEN 1::numeric
    ELSE (SELECT c.tasa FROM contabilidad.cotizaciones c
          WHERE c.moneda = p_moneda AND c.fecha < p_fecha
          ORDER BY c.fecha DESC LIMIT 1)
  END;
$$;

-- TC para valuar saldos a una fecha (revaluación, cierre): la del
-- mismo día o la última anterior.
CREATE FUNCTION contabilidad.tc_cierre(p_moneda char(3), p_fecha date) RETURNS numeric
LANGUAGE sql STABLE SET search_path = '' AS $$
  SELECT CASE
    WHEN p_moneda = contabilidad.moneda_funcional() THEN 1::numeric
    ELSE (SELECT c.tasa FROM contabilidad.cotizaciones c
          WHERE c.moneda = p_moneda AND c.fecha <= p_fecha
          ORDER BY c.fecha DESC LIMIT 1)
  END;
$$;

-- ------------------------------------------------------------
-- Plan de cuentas
-- ------------------------------------------------------------
CREATE TABLE contabilidad.cuentas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  codigo text NOT NULL UNIQUE CHECK (codigo ~ '^[1-5](\.[0-9]{1,3})*$'),
  nombre text NOT NULL CHECK (length(btrim(nombre)) > 0),
  padre_id uuid REFERENCES contabilidad.cuentas (id) ON DELETE RESTRICT,
  nivel smallint NOT NULL,
  clase contabilidad.clase_cuenta NOT NULL,
  naturaleza contabilidad.naturaleza NOT NULL,
  imputable boolean NOT NULL DEFAULT true,
  -- NULL = moneda funcional. Solo activo/pasivo pueden ser en otra moneda.
  moneda char(3) REFERENCES contabilidad.monedas (codigo),
  corriente boolean,
  es_disponibilidad boolean NOT NULL DEFAULT false,
  revalua boolean NOT NULL DEFAULT false,
  requiere_auxiliar contabilidad.tipo_auxiliar,
  requiere_centro_costo boolean NOT NULL DEFAULT false,
  activa boolean NOT NULL DEFAULT true,
  descripcion text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (moneda IS NULL OR clase IN ('activo', 'pasivo')),
  CHECK (corriente IS NULL OR clase IN ('activo', 'pasivo')),
  CHECK (NOT es_disponibilidad OR clase = 'activo'),
  CHECK (NOT revalua OR moneda IS NOT NULL),
  CHECK (imputable OR (moneda IS NULL AND NOT es_disponibilidad AND NOT revalua
                       AND requiere_auxiliar IS NULL AND NOT requiere_centro_costo))
);

CREATE INDEX cuentas_padre_idx ON contabilidad.cuentas (padre_id);

CREATE FUNCTION contabilidad._cuenta_valida() RETURNS trigger
LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE
  v_padre contabilidad.cuentas%ROWTYPE;
  v_clase_codigo contabilidad.clase_cuenta;
BEGIN
  v_clase_codigo := (ARRAY['activo', 'pasivo', 'patrimonio', 'ingreso', 'egreso']
                     ::contabilidad.clase_cuenta[])[left(NEW.codigo, 1)::int];

  IF NEW.padre_id IS NULL THEN
    IF NEW.codigo !~ '^[1-5]$' THEN
      RAISE EXCEPTION 'La cuenta % necesita cuenta padre', NEW.codigo;
    END IF;
    NEW.nivel := 1;
    NEW.clase := v_clase_codigo;
  ELSE
    SELECT * INTO v_padre FROM contabilidad.cuentas WHERE id = NEW.padre_id;
    IF v_padre.imputable THEN
      RAISE EXCEPTION 'La cuenta padre % es imputable: convertila en agrupadora antes de agregarle cuentas',
        v_padre.codigo;
    END IF;
    IF NEW.codigo NOT LIKE v_padre.codigo || '.%'
       OR position('.' IN substr(NEW.codigo, length(v_padre.codigo) + 2)) > 0 THEN
      RAISE EXCEPTION 'El código % no corresponde a una subcuenta directa de %', NEW.codigo, v_padre.codigo;
    END IF;
    NEW.nivel := v_padre.nivel + 1;
    NEW.clase := v_padre.clase;
    IF NEW.corriente IS NULL THEN
      NEW.corriente := v_padre.corriente;
    END IF;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF NEW.codigo <> OLD.codigo
       AND EXISTS (SELECT 1 FROM contabilidad.cuentas WHERE padre_id = OLD.id) THEN
      RAISE EXCEPTION 'No se puede cambiar el código de una cuenta con subcuentas';
    END IF;
    IF NEW.imputable AND NOT OLD.imputable
       AND EXISTS (SELECT 1 FROM contabilidad.cuentas WHERE padre_id = OLD.id) THEN
      RAISE EXCEPTION 'La cuenta % tiene subcuentas: no puede ser imputable', OLD.codigo;
    END IF;
    -- Sin llamar a otras funciones: este trigger corre con el usuario
    -- que edita el plan de cuentas.
    IF EXISTS (SELECT 1 FROM contabilidad.lineas l WHERE l.cuenta_id = OLD.id) THEN
      IF NEW.padre_id IS DISTINCT FROM OLD.padre_id
         OR NEW.clase <> OLD.clase
         OR NEW.naturaleza <> OLD.naturaleza
         OR NEW.moneda IS DISTINCT FROM OLD.moneda
         OR NEW.imputable <> OLD.imputable
         OR NEW.requiere_auxiliar IS DISTINCT FROM OLD.requiere_auxiliar THEN
        RAISE EXCEPTION 'La cuenta % tiene movimientos: no se puede cambiar su ubicación, clase, naturaleza, moneda, imputabilidad ni auxiliar',
          OLD.codigo;
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER cuentas_valida BEFORE INSERT OR UPDATE ON contabilidad.cuentas
  FOR EACH ROW EXECUTE FUNCTION contabilidad._cuenta_valida();
CREATE TRIGGER cuentas_updated_at BEFORE UPDATE ON contabilidad.cuentas
  FOR EACH ROW EXECUTE FUNCTION contabilidad._set_updated_at();

-- Cuentas que usan los procesos automáticos, por rol (nunca por código).
CREATE TABLE contabilidad.cuentas_sistema (
  rol text PRIMARY KEY CHECK (rol IN (
    'resultado_ejercicio', 'resultados_acumulados',
    'diferencia_cambio_ganada', 'diferencia_cambio_perdida'
  )),
  cuenta_id uuid NOT NULL REFERENCES contabilidad.cuentas (id) ON DELETE RESTRICT
);

CREATE FUNCTION contabilidad.cuenta_sistema(p_rol text) RETURNS uuid
LANGUAGE plpgsql STABLE SET search_path = '' AS $$
DECLARE
  v_id uuid;
BEGIN
  SELECT cuenta_id INTO v_id FROM contabilidad.cuentas_sistema WHERE rol = p_rol;
  IF v_id IS NULL THEN
    RAISE EXCEPTION 'Falta configurar la cuenta de sistema "%"', p_rol;
  END IF;
  RETURN v_id;
END;
$$;

-- Qué cuenta usa cada proceso automático (tienda, cuotas, …), por
-- moneda. Lo llenan los módulos que contabilizan.
CREATE TABLE contabilidad.parametros_cuentas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  proceso text NOT NULL,
  rol text NOT NULL,
  moneda char(3) REFERENCES contabilidad.monedas (codigo),
  cuenta_id uuid NOT NULL REFERENCES contabilidad.cuentas (id) ON DELETE RESTRICT,
  descripcion text
);

CREATE UNIQUE INDEX parametros_cuentas_unico
  ON contabilidad.parametros_cuentas (proceso, rol, coalesce(moneda, '---'));

-- ------------------------------------------------------------
-- Centros de costo (disciplinas y áreas del club)
-- ------------------------------------------------------------
CREATE TABLE contabilidad.centros_costo (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  codigo text NOT NULL UNIQUE CHECK (codigo ~ '^[A-Z0-9-]+$'),
  nombre text NOT NULL CHECK (length(btrim(nombre)) > 0),
  disciplina_id integer UNIQUE REFERENCES public.disciplinas (id) ON DELETE RESTRICT,
  activo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO contabilidad.centros_costo (codigo, nombre) VALUES
  ('ADM', 'Administración'),
  ('TIENDA', 'Tienda'),
  ('EVENTOS', 'Eventos'),
  ('INSTAL', 'Instalaciones');

-- Un centro de costo por disciplina. Idempotente: se corre en la
-- migración y desde el seed (en un branch las disciplinas llegan
-- después de las migraciones).
CREATE FUNCTION contabilidad.sincronizar_centros_disciplinas() RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_n integer;
BEGIN
  PERFORM contabilidad._exigir_escritura();
  INSERT INTO contabilidad.centros_costo (codigo, nombre, disciplina_id)
  SELECT upper(regexp_replace(d.slug, '[^a-zA-Z0-9]+', '-', 'g')), d.nombre, d.id
  FROM public.disciplinas d
  WHERE NOT EXISTS (SELECT 1 FROM contabilidad.centros_costo c WHERE c.disciplina_id = d.id)
  ON CONFLICT DO NOTHING;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN v_n;
END;
$$;

SELECT contabilidad.sincronizar_centros_disciplinas();

-- ------------------------------------------------------------
-- Ejercicios y períodos
-- ------------------------------------------------------------
CREATE TABLE contabilidad.ejercicios (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre text NOT NULL UNIQUE,
  fecha_inicio date NOT NULL,
  fecha_fin date NOT NULL,
  estado contabilidad.estado_periodo NOT NULL DEFAULT 'abierto',
  cerrado_por uuid,
  cerrado_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (fecha_fin > fecha_inicio),
  CHECK ((estado = 'cerrado') = (cerrado_at IS NOT NULL)),
  EXCLUDE USING gist (daterange(fecha_inicio, fecha_fin, '[]') WITH &&)
);

CREATE TABLE contabilidad.periodos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ejercicio_id uuid NOT NULL REFERENCES contabilidad.ejercicios (id) ON DELETE RESTRICT,
  anio smallint NOT NULL,
  mes smallint NOT NULL CHECK (mes BETWEEN 1 AND 12),
  fecha_inicio date NOT NULL,
  fecha_fin date NOT NULL,
  estado contabilidad.estado_periodo NOT NULL DEFAULT 'abierto',
  cerrado_por uuid,
  cerrado_at timestamptz,
  CHECK (fecha_fin >= fecha_inicio),
  CHECK ((estado = 'cerrado') = (cerrado_at IS NOT NULL)),
  UNIQUE (ejercicio_id, anio, mes),
  EXCLUDE USING gist (daterange(fecha_inicio, fecha_fin, '[]') WITH &&)
);

CREATE FUNCTION contabilidad._periodo_valida() RETURNS trigger
LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE
  v_ej contabilidad.ejercicios%ROWTYPE;
BEGIN
  SELECT * INTO v_ej FROM contabilidad.ejercicios WHERE id = NEW.ejercicio_id;
  IF NEW.fecha_inicio < v_ej.fecha_inicio OR NEW.fecha_fin > v_ej.fecha_fin THEN
    RAISE EXCEPTION 'El período queda fuera del ejercicio %', v_ej.nombre;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER periodos_valida BEFORE INSERT OR UPDATE ON contabilidad.periodos
  FOR EACH ROW EXECUTE FUNCTION contabilidad._periodo_valida();

-- ------------------------------------------------------------
-- Asientos y líneas
-- ------------------------------------------------------------
CREATE TABLE contabilidad.asientos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ejercicio_id uuid NOT NULL REFERENCES contabilidad.ejercicios (id) ON DELETE RESTRICT,
  periodo_id uuid NOT NULL REFERENCES contabilidad.periodos (id) ON DELETE RESTRICT,
  fecha date NOT NULL,
  numero integer,
  tipo contabilidad.tipo_asiento NOT NULL DEFAULT 'manual',
  estado contabilidad.estado_asiento NOT NULL DEFAULT 'borrador',
  descripcion text NOT NULL CHECK (length(btrim(descripcion)) > 0),
  -- Documento que lo generó (venta, cuota, cierre…): traza e idempotencia.
  origen_tipo text,
  origen_id text,
  asiento_revertido_id uuid UNIQUE REFERENCES contabilidad.asientos (id) ON DELETE RESTRICT,
  revertido_por_id uuid UNIQUE REFERENCES contabilidad.asientos (id) ON DELETE SET NULL,
  motivo text,
  creado_por uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  confirmado_por uuid,
  confirmado_at timestamptz,
  CHECK ((origen_tipo IS NULL) = (origen_id IS NULL)),
  CHECK ((tipo = 'reversion') = (asiento_revertido_id IS NOT NULL)),
  CHECK (tipo <> 'reversion' OR motivo IS NOT NULL),
  CHECK ((estado = 'confirmado') = (numero IS NOT NULL)),
  CHECK ((estado = 'confirmado') = (confirmado_at IS NOT NULL)),
  UNIQUE (ejercicio_id, numero)
);

CREATE INDEX asientos_fecha_idx ON contabilidad.asientos (fecha);
CREATE INDEX asientos_periodo_idx ON contabilidad.asientos (periodo_id, estado);
CREATE UNIQUE INDEX asientos_origen_unico ON contabilidad.asientos (origen_tipo, origen_id)
  WHERE origen_tipo IS NOT NULL AND tipo <> 'reversion';
CREATE UNIQUE INDEX asientos_apertura_unica ON contabilidad.asientos (ejercicio_id)
  WHERE tipo = 'apertura' AND revertido_por_id IS NULL;
CREATE UNIQUE INDEX asientos_cierre_unico ON contabilidad.asientos (ejercicio_id)
  WHERE tipo = 'cierre' AND revertido_por_id IS NULL;
CREATE UNIQUE INDEX asientos_refundicion_unica ON contabilidad.asientos (ejercicio_id)
  WHERE tipo = 'refundicion' AND revertido_por_id IS NULL;

CREATE TABLE contabilidad.lineas (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  asiento_id uuid NOT NULL REFERENCES contabilidad.asientos (id) ON DELETE CASCADE,
  orden smallint NOT NULL,
  cuenta_id uuid NOT NULL REFERENCES contabilidad.cuentas (id) ON DELETE RESTRICT,
  descripcion text,
  -- Siempre en moneda funcional.
  debe numeric(18, 2) NOT NULL DEFAULT 0,
  haber numeric(18, 2) NOT NULL DEFAULT 0,
  -- Solo si la cuenta es en otra moneda: importe en esa moneda y TC usado.
  moneda char(3) REFERENCES contabilidad.monedas (codigo),
  importe_origen numeric(18, 2),
  tc numeric(20, 10),
  centro_costo_id uuid REFERENCES contabilidad.centros_costo (id) ON DELETE RESTRICT,
  proveedor_id integer REFERENCES public.proveedores (id) ON DELETE RESTRICT,
  disciplina_id integer REFERENCES public.disciplinas (id) ON DELETE RESTRICT,
  CHECK (debe >= 0 AND haber >= 0 AND (debe = 0) <> (haber = 0)),
  CHECK ((moneda IS NULL) = (importe_origen IS NULL) AND (moneda IS NULL) = (tc IS NULL)),
  CHECK (tc IS NULL OR tc > 0),
  CHECK (importe_origen IS NULL OR importe_origen >= 0),
  -- Importe de origen 0 = ajuste de valuación (revaluación / apertura);
  -- si no, el importe funcional es exactamente origen × TC.
  CHECK (importe_origen IS NULL OR importe_origen = 0
         OR round(importe_origen * tc, 2) = debe + haber),
  UNIQUE (asiento_id, orden)
);

CREATE INDEX lineas_cuenta_idx ON contabilidad.lineas (cuenta_id);
CREATE INDEX lineas_proveedor_idx ON contabilidad.lineas (proveedor_id) WHERE proveedor_id IS NOT NULL;
CREATE INDEX lineas_disciplina_idx ON contabilidad.lineas (disciplina_id) WHERE disciplina_id IS NOT NULL;
CREATE INDEX lineas_centro_idx ON contabilidad.lineas (centro_costo_id) WHERE centro_costo_id IS NOT NULL;

CREATE TABLE contabilidad.numeradores (
  ejercicio_id uuid PRIMARY KEY REFERENCES contabilidad.ejercicios (id) ON DELETE RESTRICT,
  ultimo integer NOT NULL CHECK (ultimo >= 0)
);

-- Ubica fecha → período abierto. Corta si no hay o está cerrado.
CREATE FUNCTION contabilidad._periodo_para(p_fecha date, OUT o_periodo uuid, OUT o_ejercicio uuid)
LANGUAGE plpgsql STABLE SET search_path = '' AS $$
DECLARE
  v_estado contabilidad.estado_periodo;
  v_ej_estado contabilidad.estado_periodo;
BEGIN
  SELECT p.id, p.ejercicio_id, p.estado, e.estado
    INTO o_periodo, o_ejercicio, v_estado, v_ej_estado
  FROM contabilidad.periodos p
  JOIN contabilidad.ejercicios e ON e.id = p.ejercicio_id
  WHERE p_fecha BETWEEN p.fecha_inicio AND p.fecha_fin;

  IF o_periodo IS NULL THEN
    RAISE EXCEPTION 'No hay ejercicio contable para la fecha %', to_char(p_fecha, 'DD/MM/YYYY');
  END IF;
  IF v_estado = 'cerrado' OR v_ej_estado = 'cerrado' THEN
    RAISE EXCEPTION 'El período de % está cerrado', to_char(p_fecha, 'MM/YYYY');
  END IF;
END;
$$;

CREATE FUNCTION contabilidad._periodo_abierto(p_periodo uuid) RETURNS boolean
LANGUAGE sql STABLE SET search_path = '' AS $$
  SELECT p.estado = 'abierto' AND e.estado = 'abierto'
  FROM contabilidad.periodos p JOIN contabilidad.ejercicios e ON e.id = p.ejercicio_id
  WHERE p.id = p_periodo;
$$;

CREATE FUNCTION contabilidad._asiento_antes() RETURNS trigger
LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE
  v_proceso text := contabilidad._proceso();
  v_lineas integer;
  v_debe numeric;
  v_haber numeric;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.estado <> 'borrador' OR NEW.numero IS NOT NULL THEN
      RAISE EXCEPTION 'Los asientos se crean como borrador y se confirman después de cargar las líneas';
    END IF;
    IF NEW.tipo IN ('apertura', 'cierre', 'refundicion', 'revaluacion', 'reversion')
       AND v_proceso <> 'sistema' THEN
      RAISE EXCEPTION 'Los asientos de tipo % solo los genera el sistema', NEW.tipo;
    END IF;
    SELECT o_periodo, o_ejercicio INTO NEW.periodo_id, NEW.ejercicio_id
      FROM contabilidad._periodo_para(NEW.fecha);
    NEW.confirmado_por := NULL;
    NEW.confirmado_at := NULL;
    NEW.revertido_por_id := NULL;
    RETURN NEW;
  END IF;

  IF TG_OP = 'DELETE' THEN
    IF v_proceso = 'reapertura' AND OLD.tipo IN ('apertura', 'cierre', 'refundicion', 'revaluacion') THEN
      RETURN OLD;
    END IF;
    IF OLD.estado <> 'borrador' THEN
      RAISE EXCEPTION 'El asiento % está confirmado: no se borra, se revierte', OLD.numero;
    END IF;
    IF NOT contabilidad._periodo_abierto(OLD.periodo_id) THEN
      RAISE EXCEPTION 'El período del asiento está cerrado';
    END IF;
    RETURN OLD;
  END IF;

  -- UPDATE
  IF OLD.estado = 'confirmado' THEN
    -- Única modificación posible: marcarlo como revertido (lo hace la
    -- función de reversión).
    IF v_proceso = 'sistema'
       AND OLD.revertido_por_id IS NULL AND NEW.revertido_por_id IS NOT NULL
       AND (to_jsonb(NEW) - 'revertido_por_id') = (to_jsonb(OLD) - 'revertido_por_id') THEN
      RETURN NEW;
    END IF;
    RAISE EXCEPTION 'El asiento % está confirmado y no se puede modificar: revertilo', OLD.numero;
  END IF;

  IF NOT contabilidad._periodo_abierto(OLD.periodo_id) THEN
    RAISE EXCEPTION 'El período del asiento está cerrado';
  END IF;
  IF NEW.tipo <> OLD.tipo OR NEW.origen_tipo IS DISTINCT FROM OLD.origen_tipo
     OR NEW.origen_id IS DISTINCT FROM OLD.origen_id
     OR NEW.asiento_revertido_id IS DISTINCT FROM OLD.asiento_revertido_id
     OR NEW.revertido_por_id IS NOT NULL
     OR NEW.creado_por IS DISTINCT FROM OLD.creado_por
     OR NEW.created_at <> OLD.created_at THEN
    RAISE EXCEPTION 'No se puede cambiar el tipo ni el origen de un asiento';
  END IF;
  IF NEW.fecha <> OLD.fecha THEN
    SELECT o_periodo, o_ejercicio INTO NEW.periodo_id, NEW.ejercicio_id
      FROM contabilidad._periodo_para(NEW.fecha);
    IF NEW.tipo = 'apertura' THEN
      RAISE EXCEPTION 'La fecha del asiento de apertura no se cambia';
    END IF;
  ELSIF NEW.periodo_id <> OLD.periodo_id OR NEW.ejercicio_id <> OLD.ejercicio_id THEN
    RAISE EXCEPTION 'El período se deriva de la fecha';
  END IF;

  IF NEW.estado = 'confirmado' THEN
    SELECT count(*), coalesce(sum(debe), 0), coalesce(sum(haber), 0)
      INTO v_lineas, v_debe, v_haber
    FROM contabilidad.lineas WHERE asiento_id = NEW.id;

    IF v_lineas < 2 THEN
      RAISE EXCEPTION 'Un asiento necesita al menos dos líneas';
    END IF;
    IF v_debe <> v_haber THEN
      RAISE EXCEPTION 'El asiento no cuadra: debe % ≠ haber %', v_debe, v_haber;
    END IF;
    IF NEW.tipo <> 'apertura' AND EXISTS (
      SELECT 1 FROM contabilidad.asientos a
      WHERE a.ejercicio_id = NEW.ejercicio_id AND a.tipo = 'apertura'
        AND a.revertido_por_id IS NULL AND a.fecha > NEW.fecha
    ) THEN
      RAISE EXCEPTION 'La fecha es anterior al asiento de apertura del ejercicio';
    END IF;

    INSERT INTO contabilidad.numeradores AS n (ejercicio_id, ultimo)
    VALUES (NEW.ejercicio_id, 1)
    ON CONFLICT (ejercicio_id) DO UPDATE SET ultimo = n.ultimo + 1
    RETURNING ultimo INTO NEW.numero;

    NEW.confirmado_at := now();
    NEW.confirmado_por := auth.uid();
  ELSE
    NEW.numero := NULL;
    NEW.confirmado_at := NULL;
    NEW.confirmado_por := NULL;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER asientos_antes BEFORE INSERT OR UPDATE OR DELETE ON contabilidad.asientos
  FOR EACH ROW EXECUTE FUNCTION contabilidad._asiento_antes();

CREATE FUNCTION contabilidad._linea_antes() RETURNS trigger
LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE
  v_asiento contabilidad.asientos%ROWTYPE;
  v_cuenta contabilidad.cuentas%ROWTYPE;
  v_asiento_id uuid := CASE WHEN TG_OP = 'DELETE' THEN OLD.asiento_id ELSE NEW.asiento_id END;
BEGIN
  SELECT * INTO v_asiento FROM contabilidad.asientos WHERE id = v_asiento_id;

  IF TG_OP = 'DELETE' THEN
    -- Borrado en cascada: el asiento ya pasó su propio control.
    IF v_asiento.id IS NULL OR contabilidad._proceso() = 'reapertura' THEN
      RETURN OLD;
    END IF;
    IF v_asiento.estado <> 'borrador' THEN
      RAISE EXCEPTION 'Las líneas de un asiento confirmado no se modifican';
    END IF;
    RETURN OLD;
  END IF;

  IF v_asiento.estado <> 'borrador' THEN
    RAISE EXCEPTION 'Las líneas de un asiento confirmado no se modifican';
  END IF;
  IF TG_OP = 'UPDATE' AND NEW.asiento_id <> OLD.asiento_id THEN
    RAISE EXCEPTION 'Una línea no se mueve de asiento';
  END IF;

  SELECT * INTO v_cuenta FROM contabilidad.cuentas WHERE id = NEW.cuenta_id;
  IF NOT v_cuenta.imputable THEN
    RAISE EXCEPTION 'La cuenta % % es agrupadora: elegí una subcuenta', v_cuenta.codigo, v_cuenta.nombre;
  END IF;
  IF NOT v_cuenta.activa AND v_asiento.tipo NOT IN ('cierre', 'apertura', 'revaluacion', 'reversion') THEN
    RAISE EXCEPTION 'La cuenta % % está inactiva', v_cuenta.codigo, v_cuenta.nombre;
  END IF;

  IF v_cuenta.moneda IS NULL THEN
    IF NEW.moneda IS NOT NULL THEN
      RAISE EXCEPTION 'La cuenta % es en moneda funcional: la línea no lleva moneda de origen', v_cuenta.codigo;
    END IF;
  ELSE
    IF NEW.moneda IS DISTINCT FROM v_cuenta.moneda THEN
      RAISE EXCEPTION 'La cuenta % es en %: la línea debe llevar el importe en esa moneda',
        v_cuenta.codigo, v_cuenta.moneda;
    END IF;
    IF NEW.importe_origen = 0 AND v_asiento.tipo NOT IN ('revaluacion', 'apertura', 'reversion') THEN
      RAISE EXCEPTION 'Importe en % igual a cero en la cuenta %', v_cuenta.moneda, v_cuenta.codigo;
    END IF;
  END IF;

  IF v_cuenta.requiere_auxiliar = 'proveedor' AND NEW.proveedor_id IS NULL THEN
    RAISE EXCEPTION 'La cuenta % exige indicar el proveedor', v_cuenta.codigo;
  END IF;
  IF v_cuenta.requiere_auxiliar IS DISTINCT FROM 'proveedor' AND NEW.proveedor_id IS NOT NULL THEN
    RAISE EXCEPTION 'La cuenta % no lleva proveedor', v_cuenta.codigo;
  END IF;
  IF v_cuenta.requiere_auxiliar = 'disciplina' AND NEW.disciplina_id IS NULL THEN
    RAISE EXCEPTION 'La cuenta % exige indicar la disciplina', v_cuenta.codigo;
  END IF;
  IF v_cuenta.requiere_auxiliar IS DISTINCT FROM 'disciplina' AND NEW.disciplina_id IS NOT NULL THEN
    RAISE EXCEPTION 'La cuenta % no lleva disciplina', v_cuenta.codigo;
  END IF;
  IF v_cuenta.requiere_centro_costo AND NEW.centro_costo_id IS NULL THEN
    RAISE EXCEPTION 'La cuenta % exige centro de costo', v_cuenta.codigo;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER lineas_antes BEFORE INSERT OR UPDATE OR DELETE ON contabilidad.lineas
  FOR EACH ROW EXECUTE FUNCTION contabilidad._linea_antes();

-- ------------------------------------------------------------
-- Auditoría append-only
-- ------------------------------------------------------------
CREATE TABLE contabilidad.auditoria (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tabla text NOT NULL,
  registro_id text,
  accion text NOT NULL CHECK (accion IN ('INSERT', 'UPDATE', 'DELETE')),
  antes jsonb,
  despues jsonb,
  usuario_id uuid,
  proceso text,
  at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX auditoria_registro_idx ON contabilidad.auditoria (tabla, registro_id);

CREATE FUNCTION contabilidad._auditar() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_antes jsonb := CASE WHEN TG_OP <> 'INSERT' THEN to_jsonb(OLD) END;
  v_despues jsonb := CASE WHEN TG_OP <> 'DELETE' THEN to_jsonb(NEW) END;
BEGIN
  INSERT INTO contabilidad.auditoria (tabla, registro_id, accion, antes, despues, usuario_id, proceso)
  VALUES (
    TG_TABLE_NAME,
    coalesce(v_despues, v_antes) ->> CASE WHEN TG_TABLE_NAME IN ('cotizaciones') THEN 'fecha'
                                          WHEN TG_TABLE_NAME IN ('cuentas_sistema') THEN 'rol'
                                          WHEN TG_TABLE_NAME IN ('config') THEN 'id'
                                          WHEN TG_TABLE_NAME IN ('numeradores') THEN 'ejercicio_id'
                                          ELSE 'id' END,
    TG_OP, v_antes, v_despues, auth.uid(), nullif(contabilidad._proceso(), '')
  );
  RETURN NULL;
END;
$$;

CREATE FUNCTION contabilidad._auditoria_inmutable() RETURNS trigger
LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  RAISE EXCEPTION 'La auditoría no se modifica';
END;
$$;

CREATE TRIGGER auditoria_inmutable BEFORE UPDATE OR DELETE OR TRUNCATE ON contabilidad.auditoria
  FOR EACH STATEMENT EXECUTE FUNCTION contabilidad._auditoria_inmutable();

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['config', 'cotizaciones', 'cuentas', 'cuentas_sistema', 'parametros_cuentas',
                           'centros_costo', 'ejercicios', 'periodos', 'asientos', 'lineas']
  LOOP
    EXECUTE format(
      'CREATE TRIGGER %I AFTER INSERT OR UPDATE OR DELETE ON contabilidad.%I
         FOR EACH ROW EXECUTE FUNCTION contabilidad._auditar()',
      t || '_auditoria', t);
  END LOOP;
END;
$$;

CREATE FUNCTION contabilidad._config_valida() RETURNS trigger
LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  IF NEW.moneda_funcional <> OLD.moneda_funcional
     AND EXISTS (SELECT 1 FROM contabilidad.lineas) THEN
    RAISE EXCEPTION 'Con asientos cargados no se cambia la moneda funcional';
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER config_valida BEFORE UPDATE ON contabilidad.config
  FOR EACH ROW EXECUTE FUNCTION contabilidad._config_valida();

-- ------------------------------------------------------------
-- Operaciones (RPC)
-- ------------------------------------------------------------

-- Ejercicio calendario con sus 12 períodos. Los ejercicios son
-- consecutivos: el nuevo empieza el día siguiente al último.
CREATE FUNCTION contabilidad.crear_ejercicio(p_anio integer) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_id uuid;
  v_inicio date := make_date(p_anio, 1, 1);
  v_fin date := make_date(p_anio, 12, 31);
  v_ultimo_fin date;
  m integer;
BEGIN
  PERFORM contabilidad._exigir_escritura();
  SELECT max(fecha_fin) INTO v_ultimo_fin FROM contabilidad.ejercicios;
  IF v_ultimo_fin IS NOT NULL AND v_inicio <> v_ultimo_fin + 1 THEN
    RAISE EXCEPTION 'El próximo ejercicio tiene que empezar el %', to_char(v_ultimo_fin + 1, 'DD/MM/YYYY');
  END IF;

  INSERT INTO contabilidad.ejercicios (nombre, fecha_inicio, fecha_fin)
  VALUES ('Ejercicio ' || p_anio, v_inicio, v_fin)
  RETURNING id INTO v_id;

  FOR m IN 1..12 LOOP
    INSERT INTO contabilidad.periodos (ejercicio_id, anio, mes, fecha_inicio, fecha_fin)
    VALUES (v_id, p_anio, m, make_date(p_anio, m, 1),
            (make_date(p_anio, m, 1) + interval '1 month' - interval '1 day')::date);
  END LOOP;

  RETURN v_id;
END;
$$;

CREATE FUNCTION contabilidad.cerrar_periodo(p_periodo uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_p contabilidad.periodos%ROWTYPE;
BEGIN
  PERFORM contabilidad._exigir_escritura();
  SELECT * INTO v_p FROM contabilidad.periodos WHERE id = p_periodo FOR UPDATE;
  IF v_p.id IS NULL THEN
    RAISE EXCEPTION 'Período inexistente';
  END IF;
  IF v_p.estado = 'cerrado' THEN
    RAISE EXCEPTION 'El período ya está cerrado';
  END IF;
  IF EXISTS (SELECT 1 FROM contabilidad.periodos
             WHERE fecha_fin < v_p.fecha_inicio AND estado = 'abierto') THEN
    RAISE EXCEPTION 'Hay períodos anteriores abiertos: se cierran en orden';
  END IF;
  IF EXISTS (SELECT 1 FROM contabilidad.asientos
             WHERE periodo_id = p_periodo AND estado = 'borrador') THEN
    RAISE EXCEPTION 'El período tiene asientos en borrador: confirmalos o borralos antes de cerrar';
  END IF;
  UPDATE contabilidad.periodos
     SET estado = 'cerrado', cerrado_at = now(), cerrado_por = auth.uid()
   WHERE id = p_periodo;
END;
$$;

CREATE FUNCTION contabilidad.reabrir_periodo(p_periodo uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_p contabilidad.periodos%ROWTYPE;
  v_ej contabilidad.estado_periodo;
BEGIN
  PERFORM contabilidad._exigir_escritura();
  SELECT * INTO v_p FROM contabilidad.periodos WHERE id = p_periodo FOR UPDATE;
  IF v_p.id IS NULL OR v_p.estado = 'abierto' THEN
    RAISE EXCEPTION 'El período no está cerrado';
  END IF;
  SELECT estado INTO v_ej FROM contabilidad.ejercicios WHERE id = v_p.ejercicio_id;
  IF v_ej = 'cerrado' THEN
    RAISE EXCEPTION 'El ejercicio está cerrado: hay que reabrir el ejercicio';
  END IF;
  IF EXISTS (SELECT 1 FROM contabilidad.periodos
             WHERE fecha_inicio > v_p.fecha_fin AND estado = 'cerrado') THEN
    RAISE EXCEPTION 'Solo se reabre el último período cerrado';
  END IF;
  UPDATE contabilidad.periodos
     SET estado = 'abierto', cerrado_at = NULL, cerrado_por = NULL
   WHERE id = p_periodo;
END;
$$;

-- Inserta las líneas de un asiento borrador a partir de JSON:
--   [{ cuenta_id, lado: 'debe'|'haber', importe, tc?, descripcion?,
--      centro_costo_id?, proveedor_id?, disciplina_id? }]
-- `importe` va en la moneda de la cuenta. Si la cuenta es en otra
-- moneda y no viene `tc`, se usa la cotización vigente a la fecha.
CREATE FUNCTION contabilidad._insertar_lineas(p_asiento uuid, p_fecha date, p_lineas jsonb) RETURNS void
LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE
  v_l jsonb;
  v_i bigint;
  v_cuenta contabilidad.cuentas%ROWTYPE;
  v_importe numeric;
  v_tc numeric;
  v_base numeric;
  v_lado text;
BEGIN
  IF p_lineas IS NULL OR jsonb_typeof(p_lineas) <> 'array' OR jsonb_array_length(p_lineas) = 0 THEN
    RAISE EXCEPTION 'El asiento no tiene líneas';
  END IF;

  FOR v_l, v_i IN SELECT e, o FROM jsonb_array_elements(p_lineas) WITH ORDINALITY AS t(e, o) LOOP
    SELECT * INTO v_cuenta FROM contabilidad.cuentas WHERE id = (v_l ->> 'cuenta_id')::uuid;
    IF v_cuenta.id IS NULL THEN
      RAISE EXCEPTION 'Línea %: cuenta inexistente', v_i;
    END IF;
    v_lado := v_l ->> 'lado';
    IF v_lado NOT IN ('debe', 'haber') THEN
      RAISE EXCEPTION 'Línea %: lado tiene que ser debe o haber', v_i;
    END IF;
    v_importe := round((v_l ->> 'importe')::numeric, 2);
    IF v_importe IS NULL OR v_importe <= 0 THEN
      RAISE EXCEPTION 'Línea %: el importe tiene que ser mayor que cero', v_i;
    END IF;

    IF v_cuenta.moneda IS NULL THEN
      v_tc := NULL;
      v_base := v_importe;
    ELSE
      v_tc := coalesce((v_l ->> 'tc')::numeric, contabilidad.tc_vigente(v_cuenta.moneda, p_fecha));
      IF v_tc IS NULL THEN
        RAISE EXCEPTION 'No hay cotización de % anterior al %: cargala o indicá el tipo de cambio',
          v_cuenta.moneda, to_char(p_fecha, 'DD/MM/YYYY');
      END IF;
      v_base := round(v_importe * v_tc, 2);
    END IF;

    INSERT INTO contabilidad.lineas (
      asiento_id, orden, cuenta_id, descripcion, debe, haber,
      moneda, importe_origen, tc, centro_costo_id, proveedor_id, disciplina_id
    ) VALUES (
      p_asiento, v_i, v_cuenta.id, nullif(btrim(v_l ->> 'descripcion'), ''),
      CASE WHEN v_lado = 'debe' THEN v_base ELSE 0 END,
      CASE WHEN v_lado = 'haber' THEN v_base ELSE 0 END,
      v_cuenta.moneda,
      CASE WHEN v_cuenta.moneda IS NOT NULL THEN v_importe END,
      v_tc,
      (v_l ->> 'centro_costo_id')::uuid,
      (v_l ->> 'proveedor_id')::integer,
      (v_l ->> 'disciplina_id')::integer
    );
  END LOOP;
END;
$$;

-- Crea o reemplaza un asiento manual en borrador y opcionalmente lo
-- confirma. Con p_tipo = 'apertura' carga los saldos iniciales del
-- primer ejercicio (los siguientes los genera el cierre).
CREATE FUNCTION contabilidad.guardar_asiento(
  p_id uuid,
  p_fecha date,
  p_descripcion text,
  p_lineas jsonb,
  p_confirmar boolean DEFAULT false,
  p_tipo contabilidad.tipo_asiento DEFAULT 'manual'
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_id uuid := p_id;
  v_actual contabilidad.asientos%ROWTYPE;
  v_ej contabilidad.ejercicios%ROWTYPE;
BEGIN
  PERFORM contabilidad._exigir_escritura();

  IF p_tipo NOT IN ('manual', 'apertura') THEN
    RAISE EXCEPTION 'Tipo de asiento no permitido';
  END IF;

  IF p_tipo = 'apertura' THEN
    SELECT e.* INTO v_ej FROM contabilidad.ejercicios e
    WHERE p_fecha BETWEEN e.fecha_inicio AND e.fecha_fin;
    IF v_ej.id IS NULL OR p_fecha <> v_ej.fecha_inicio THEN
      RAISE EXCEPTION 'El asiento de apertura va fechado el primer día del ejercicio';
    END IF;
    IF EXISTS (SELECT 1 FROM contabilidad.ejercicios WHERE fecha_fin < v_ej.fecha_inicio) THEN
      RAISE EXCEPTION 'La apertura de este ejercicio la genera el cierre del anterior';
    END IF;
    PERFORM set_config('contabilidad.proceso', 'sistema', true);
  END IF;

  IF v_id IS NULL THEN
    INSERT INTO contabilidad.asientos (fecha, descripcion, tipo)
    VALUES (p_fecha, p_descripcion, p_tipo)
    RETURNING id INTO v_id;
  ELSE
    SELECT * INTO v_actual FROM contabilidad.asientos WHERE id = v_id FOR UPDATE;
    IF v_actual.id IS NULL THEN
      RAISE EXCEPTION 'Asiento inexistente';
    END IF;
    IF v_actual.tipo <> p_tipo THEN
      RAISE EXCEPTION 'No se puede cambiar el tipo del asiento';
    END IF;
    UPDATE contabilidad.asientos SET fecha = p_fecha, descripcion = p_descripcion WHERE id = v_id;
    DELETE FROM contabilidad.lineas WHERE asiento_id = v_id;
  END IF;

  PERFORM contabilidad._insertar_lineas(v_id, p_fecha, p_lineas);

  IF p_confirmar THEN
    UPDATE contabilidad.asientos SET estado = 'confirmado' WHERE id = v_id;
  END IF;

  PERFORM set_config('contabilidad.proceso', '', true);
  RETURN v_id;
END;
$$;

CREATE FUNCTION contabilidad.confirmar_asiento(p_id uuid) RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_numero integer;
BEGIN
  PERFORM contabilidad._exigir_escritura();
  UPDATE contabilidad.asientos SET estado = 'confirmado'
   WHERE id = p_id AND estado = 'borrador'
  RETURNING numero INTO v_numero;
  IF v_numero IS NULL THEN
    RAISE EXCEPTION 'El asiento no existe o ya está confirmado';
  END IF;
  RETURN v_numero;
END;
$$;

CREATE FUNCTION contabilidad.eliminar_borrador(p_id uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  PERFORM contabilidad._exigir_escritura();
  DELETE FROM contabilidad.asientos WHERE id = p_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Asiento inexistente';
  END IF;
END;
$$;

-- Asiento confirmado por un proceso automático (lo usan los módulos
-- que contabilizan: tienda, cuotas…). No se expone por la API.
CREATE FUNCTION contabilidad._asiento_automatico(
  p_fecha date,
  p_descripcion text,
  p_origen_tipo text,
  p_origen_id text,
  p_lineas jsonb,
  p_tipo contabilidad.tipo_asiento DEFAULT 'automatico'
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_id uuid;
  v_proceso text := contabilidad._proceso();
BEGIN
  IF p_tipo <> 'automatico' THEN
    PERFORM set_config('contabilidad.proceso', 'sistema', true);
  END IF;
  INSERT INTO contabilidad.asientos (fecha, descripcion, tipo, origen_tipo, origen_id)
  VALUES (p_fecha, p_descripcion, p_tipo, p_origen_tipo, p_origen_id)
  RETURNING id INTO v_id;
  PERFORM contabilidad._insertar_lineas(v_id, p_fecha, p_lineas);
  UPDATE contabilidad.asientos SET estado = 'confirmado' WHERE id = v_id;
  PERFORM set_config('contabilidad.proceso', v_proceso, true);
  RETURN v_id;
END;
$$;

-- Corrige un asiento confirmado con otro que lo espeja. El original
-- queda intacto y marcado como revertido.
CREATE FUNCTION contabilidad.revertir_asiento(p_id uuid, p_motivo text, p_fecha date DEFAULT NULL) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_orig contabilidad.asientos%ROWTYPE;
  v_id uuid;
  v_fecha date;
BEGIN
  PERFORM contabilidad._exigir_escritura();
  IF p_motivo IS NULL OR length(btrim(p_motivo)) < 3 THEN
    RAISE EXCEPTION 'Indicá el motivo de la reversión';
  END IF;

  SELECT * INTO v_orig FROM contabilidad.asientos WHERE id = p_id FOR UPDATE;
  IF v_orig.id IS NULL OR v_orig.estado <> 'confirmado' THEN
    RAISE EXCEPTION 'Solo se revierten asientos confirmados';
  END IF;
  IF v_orig.revertido_por_id IS NOT NULL THEN
    RAISE EXCEPTION 'El asiento % ya fue revertido', v_orig.numero;
  END IF;
  IF v_orig.tipo IN ('apertura', 'cierre', 'refundicion', 'reversion')
     OR v_orig.origen_tipo LIKE 'cierre\_%' THEN
    RAISE EXCEPTION 'Este asiento lo generó el sistema: se deshace reabriendo el ejercicio';
  END IF;

  v_fecha := coalesce(p_fecha, contabilidad._hoy());
  IF v_fecha < v_orig.fecha THEN
    RAISE EXCEPTION 'La reversión no puede ser anterior al asiento original';
  END IF;

  PERFORM set_config('contabilidad.proceso', 'sistema', true);

  INSERT INTO contabilidad.asientos (fecha, descripcion, tipo, asiento_revertido_id, motivo)
  VALUES (v_fecha, 'Reversión del asiento ' || v_orig.numero || ': ' || v_orig.descripcion,
          'reversion', v_orig.id, btrim(p_motivo))
  RETURNING id INTO v_id;

  INSERT INTO contabilidad.lineas (
    asiento_id, orden, cuenta_id, descripcion, debe, haber,
    moneda, importe_origen, tc, centro_costo_id, proveedor_id, disciplina_id
  )
  SELECT v_id, l.orden, l.cuenta_id, l.descripcion, l.haber, l.debe,
         l.moneda, l.importe_origen, l.tc, l.centro_costo_id, l.proveedor_id, l.disciplina_id
  FROM contabilidad.lineas l WHERE l.asiento_id = v_orig.id;

  UPDATE contabilidad.asientos SET estado = 'confirmado' WHERE id = v_id;
  UPDATE contabilidad.asientos SET revertido_por_id = v_id WHERE id = v_orig.id;

  PERFORM set_config('contabilidad.proceso', '', true);
  RETURN v_id;
END;
$$;

CREATE FUNCTION contabilidad.registrar_cotizacion(
  p_moneda char(3), p_fecha date, p_tasa numeric, p_fuente text DEFAULT 'manual'
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  PERFORM contabilidad._exigir_escritura();
  IF p_fuente = 'bcu' THEN
    INSERT INTO contabilidad.cotizaciones (moneda, fecha, tasa, fuente)
    VALUES (p_moneda, p_fecha, p_tasa, 'bcu')
    ON CONFLICT (moneda, fecha) DO UPDATE SET tasa = EXCLUDED.tasa, fuente = 'bcu', created_at = now()
    WHERE contabilidad.cotizaciones.tasa <> EXCLUDED.tasa OR contabilidad.cotizaciones.fuente <> 'bcu';
  ELSIF p_fuente = 'manual' THEN
    -- La cotización oficial no se pisa a mano.
    IF EXISTS (SELECT 1 FROM contabilidad.cotizaciones
               WHERE moneda = p_moneda AND fecha = p_fecha AND fuente = 'bcu') THEN
      RAISE EXCEPTION 'Ya hay cotización BCU para %', to_char(p_fecha, 'DD/MM/YYYY');
    END IF;
    INSERT INTO contabilidad.cotizaciones (moneda, fecha, tasa, fuente)
    VALUES (p_moneda, p_fecha, p_tasa, 'manual')
    ON CONFLICT (moneda, fecha) DO UPDATE SET tasa = EXCLUDED.tasa, created_at = now();
  ELSE
    RAISE EXCEPTION 'Fuente inválida';
  END IF;
END;
$$;

-- ------------------------------------------------------------
-- Saldos y libros
-- ------------------------------------------------------------

-- Saldos por cuenta imputable entre dos fechas del mismo ejercicio.
-- "Anterior" acumula desde el inicio del ejercicio (la apertura ya
-- resume lo previo). Importes funcionales; *_origen en la moneda de
-- la cuenta, con signo debe − haber.
CREATE FUNCTION contabilidad.saldos(
  p_desde date, p_hasta date, p_excluir_cierre boolean DEFAULT false
) RETURNS TABLE (
  cuenta_id uuid,
  debe_anterior numeric, haber_anterior numeric,
  debe numeric, haber numeric,
  origen_anterior numeric, origen_periodo numeric
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_ej contabilidad.ejercicios%ROWTYPE;
BEGIN
  PERFORM contabilidad._exigir_lectura();
  SELECT * INTO v_ej FROM contabilidad.ejercicios e WHERE p_desde BETWEEN e.fecha_inicio AND e.fecha_fin;
  IF v_ej.id IS NULL THEN
    RAISE EXCEPTION 'No hay ejercicio para el %', to_char(p_desde, 'DD/MM/YYYY');
  END IF;
  IF p_hasta < p_desde OR p_hasta > v_ej.fecha_fin THEN
    RAISE EXCEPTION 'El rango tiene que estar dentro de un mismo ejercicio';
  END IF;

  RETURN QUERY
  SELECT l.cuenta_id,
    sum(l.debe) FILTER (WHERE a.fecha < p_desde),
    sum(l.haber) FILTER (WHERE a.fecha < p_desde),
    sum(l.debe) FILTER (WHERE a.fecha >= p_desde),
    sum(l.haber) FILTER (WHERE a.fecha >= p_desde),
    sum(CASE WHEN l.debe > 0 THEN l.importe_origen ELSE -l.importe_origen END) FILTER (WHERE a.fecha < p_desde),
    sum(CASE WHEN l.debe > 0 THEN l.importe_origen ELSE -l.importe_origen END) FILTER (WHERE a.fecha >= p_desde)
  FROM contabilidad.lineas l
  JOIN contabilidad.asientos a ON a.id = l.asiento_id
  WHERE a.estado = 'confirmado'
    AND a.fecha BETWEEN v_ej.fecha_inicio AND p_hasta
    AND NOT (p_excluir_cierre AND a.tipo IN ('cierre', 'refundicion'))
  GROUP BY l.cuenta_id;
END;
$$;

-- Libro mayor de una cuenta imputable con saldo acumulado
-- (signo según la clase: activo/egreso debe − haber; el resto al revés).
CREATE FUNCTION contabilidad.libro_mayor(p_cuenta uuid, p_desde date, p_hasta date)
RETURNS TABLE (
  asiento_id uuid, fecha date, numero integer, tipo contabilidad.tipo_asiento,
  asiento_descripcion text, linea_descripcion text,
  debe numeric, haber numeric, importe_origen numeric, tc numeric,
  saldo numeric, saldo_origen numeric,
  centro_costo_id uuid, proveedor_id integer, disciplina_id integer
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_signo integer;
  v_ant numeric;
  v_ant_origen numeric;
BEGIN
  PERFORM contabilidad._exigir_lectura();
  SELECT CASE WHEN c.clase IN ('activo', 'egreso') THEN 1 ELSE -1 END INTO v_signo
  FROM contabilidad.cuentas c WHERE c.id = p_cuenta;
  IF v_signo IS NULL THEN
    RAISE EXCEPTION 'Cuenta inexistente';
  END IF;

  SELECT coalesce(s.debe_anterior, 0) - coalesce(s.haber_anterior, 0), coalesce(s.origen_anterior, 0)
    INTO v_ant, v_ant_origen
  FROM contabilidad.saldos(p_desde, p_hasta) s WHERE s.cuenta_id = p_cuenta;
  v_ant := coalesce(v_ant, 0);
  v_ant_origen := coalesce(v_ant_origen, 0);

  RETURN QUERY
  SELECT a.id, a.fecha, a.numero, a.tipo, a.descripcion, l.descripcion,
    l.debe, l.haber,
    CASE WHEN l.debe > 0 THEN l.importe_origen ELSE -l.importe_origen END,
    l.tc,
    v_signo * (v_ant + sum(l.debe - l.haber) OVER w),
    v_signo * (v_ant_origen + sum(CASE WHEN l.debe > 0 THEN coalesce(l.importe_origen, 0)
                                       ELSE -coalesce(l.importe_origen, 0) END) OVER w),
    l.centro_costo_id, l.proveedor_id, l.disciplina_id
  FROM contabilidad.lineas l
  JOIN contabilidad.asientos a ON a.id = l.asiento_id
  WHERE l.cuenta_id = p_cuenta AND a.estado = 'confirmado'
    AND a.fecha BETWEEN p_desde AND p_hasta
  WINDOW w AS (ORDER BY a.fecha, a.numero, l.orden ROWS UNBOUNDED PRECEDING)
  ORDER BY a.fecha, a.numero, l.orden;
END;
$$;

-- ------------------------------------------------------------
-- Revaluación, cierre y reapertura de ejercicio
-- ------------------------------------------------------------

-- Ajusta el valor funcional de las cuentas en moneda extranjera que
-- revalúan a la cotización de p_fecha. Idempotente: mide contra lo
-- ya registrado. Ganancias y pérdidas en bruto.
CREATE FUNCTION contabilidad._revaluar(p_fecha date, p_origen_tipo text, p_origen_id text) RETURNS uuid
LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE
  v_ej contabilidad.ejercicios%ROWTYPE;
  v_lineas jsonb := '[]'::jsonb;
  v_ganancia numeric := 0;
  v_perdida numeric := 0;
  r record;
  v_tc numeric;
  v_ajuste numeric;
  v_id uuid;
  v_n integer := 0;
BEGIN
  SELECT * INTO v_ej FROM contabilidad.ejercicios e WHERE p_fecha BETWEEN e.fecha_inicio AND e.fecha_fin;

  FOR r IN
    SELECT c.id, c.codigo, c.moneda, l.proveedor_id, l.disciplina_id, l.centro_costo_id,
           sum(l.debe - l.haber) AS base,
           sum(CASE WHEN l.debe > 0 THEN l.importe_origen ELSE -l.importe_origen END) AS origen
    FROM contabilidad.lineas l
    JOIN contabilidad.asientos a ON a.id = l.asiento_id
    JOIN contabilidad.cuentas c ON c.id = l.cuenta_id
    WHERE c.revalua AND a.estado = 'confirmado'
      AND a.fecha BETWEEN v_ej.fecha_inicio AND p_fecha
    GROUP BY c.id, c.codigo, c.moneda, l.proveedor_id, l.disciplina_id, l.centro_costo_id
  LOOP
    v_tc := contabilidad.tc_cierre(r.moneda, p_fecha);
    IF v_tc IS NULL THEN
      RAISE EXCEPTION 'Falta la cotización de % al %', r.moneda, to_char(p_fecha, 'DD/MM/YYYY');
    END IF;
    v_ajuste := round(r.origen * v_tc, 2) - r.base;
    CONTINUE WHEN v_ajuste = 0;

    v_n := v_n + 1;
    v_lineas := v_lineas || jsonb_build_object(
      'cuenta_id', r.id, 'debe', greatest(v_ajuste, 0), 'haber', greatest(-v_ajuste, 0),
      'moneda', r.moneda, 'tc', v_tc,
      'proveedor_id', r.proveedor_id, 'disciplina_id', r.disciplina_id,
      'centro_costo_id', r.centro_costo_id,
      'descripcion', 'Revaluación a ' || v_tc);
    IF v_ajuste > 0 THEN
      v_ganancia := v_ganancia + v_ajuste;
    ELSE
      v_perdida := v_perdida - v_ajuste;
    END IF;
  END LOOP;

  IF v_n = 0 THEN
    RETURN NULL;
  END IF;

  PERFORM set_config('contabilidad.proceso', 'sistema', true);
  INSERT INTO contabilidad.asientos (fecha, descripcion, tipo, origen_tipo, origen_id)
  VALUES (p_fecha, 'Revaluación de saldos en moneda extranjera al ' || to_char(p_fecha, 'DD/MM/YYYY'),
          'revaluacion', p_origen_tipo, p_origen_id)
  RETURNING id INTO v_id;

  INSERT INTO contabilidad.lineas (asiento_id, orden, cuenta_id, descripcion, debe, haber,
                                   moneda, importe_origen, tc, centro_costo_id, proveedor_id, disciplina_id)
  SELECT v_id, o, (e ->> 'cuenta_id')::uuid, e ->> 'descripcion',
         (e ->> 'debe')::numeric, (e ->> 'haber')::numeric,
         e ->> 'moneda', 0, (e ->> 'tc')::numeric,
         (e ->> 'centro_costo_id')::uuid, (e ->> 'proveedor_id')::integer, (e ->> 'disciplina_id')::integer
  FROM jsonb_array_elements(v_lineas) WITH ORDINALITY AS t(e, o);

  IF v_ganancia > 0 THEN
    v_n := v_n + 1;
    INSERT INTO contabilidad.lineas (asiento_id, orden, cuenta_id, descripcion, debe, haber)
    VALUES (v_id, v_n, contabilidad.cuenta_sistema('diferencia_cambio_ganada'),
            'Diferencia de cambio', 0, v_ganancia);
  END IF;
  IF v_perdida > 0 THEN
    v_n := v_n + 1;
    INSERT INTO contabilidad.lineas (asiento_id, orden, cuenta_id, descripcion, debe, haber)
    VALUES (v_id, v_n, contabilidad.cuenta_sistema('diferencia_cambio_perdida'),
            'Diferencia de cambio', v_perdida, 0);
  END IF;

  UPDATE contabilidad.asientos SET estado = 'confirmado' WHERE id = v_id;
  RETURN v_id;
END;
$$;

CREATE FUNCTION contabilidad.revaluar_moneda_extranjera(p_fecha date) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_id uuid;
BEGIN
  PERFORM contabilidad._exigir_escritura();
  v_id := contabilidad._revaluar(p_fecha, NULL, NULL);
  PERFORM set_config('contabilidad.proceso', '', true);
  RETURN v_id;
END;
$$;

CREATE FUNCTION contabilidad.cerrar_ejercicio(p_ejercicio uuid) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_ej contabilidad.ejercicios%ROWTYPE;
  v_sig uuid;
  v_id uuid;
  v_res_ej uuid := contabilidad.cuenta_sistema('resultado_ejercicio');
  v_res_acum uuid := contabilidad.cuenta_sistema('resultados_acumulados');
  v_resultado numeric;
  v_n integer;
  v_moneda char(3);
BEGIN
  PERFORM contabilidad._exigir_escritura();

  SELECT * INTO v_ej FROM contabilidad.ejercicios WHERE id = p_ejercicio FOR UPDATE;
  IF v_ej.id IS NULL OR v_ej.estado = 'cerrado' THEN
    RAISE EXCEPTION 'El ejercicio no existe o ya está cerrado';
  END IF;
  IF EXISTS (SELECT 1 FROM contabilidad.ejercicios
             WHERE fecha_fin < v_ej.fecha_inicio AND estado = 'abierto') THEN
    RAISE EXCEPTION 'Primero hay que cerrar el ejercicio anterior';
  END IF;
  IF EXISTS (SELECT 1 FROM contabilidad.asientos
             WHERE ejercicio_id = p_ejercicio AND estado = 'borrador') THEN
    RAISE EXCEPTION 'Hay asientos en borrador en el ejercicio';
  END IF;
  FOR v_moneda IN SELECT DISTINCT moneda FROM contabilidad.cuentas WHERE revalua LOOP
    IF NOT EXISTS (SELECT 1 FROM contabilidad.cotizaciones
                   WHERE moneda = v_moneda AND fecha BETWEEN v_ej.fecha_fin - 7 AND v_ej.fecha_fin) THEN
      RAISE EXCEPTION 'Falta la cotización de % de los últimos días del ejercicio', v_moneda;
    END IF;
  END LOOP;

  -- Para revaluar y asentar el cierre, el último período tiene que
  -- estar abierto: se reabren los que estén cerrados (el cierre los
  -- vuelve a cerrar todos al final).
  UPDATE contabilidad.periodos SET estado = 'abierto', cerrado_at = NULL, cerrado_por = NULL
   WHERE ejercicio_id = p_ejercicio AND estado = 'cerrado'
     AND fecha_fin = v_ej.fecha_fin;

  -- 1. Revaluación de moneda extranjera al cierre
  PERFORM contabilidad._revaluar(v_ej.fecha_fin, 'cierre_revaluacion', p_ejercicio::text);

  PERFORM set_config('contabilidad.proceso', 'sistema', true);

  -- 2. Cancelación de resultados contra Superávit/(Déficit) del ejercicio
  INSERT INTO contabilidad.asientos (fecha, descripcion, tipo, origen_tipo, origen_id)
  VALUES (v_ej.fecha_fin, 'Cierre de cuentas de resultado — ' || v_ej.nombre,
          'cierre', 'cierre_resultados', p_ejercicio::text)
  RETURNING id INTO v_id;

  INSERT INTO contabilidad.lineas (asiento_id, orden, cuenta_id, descripcion, debe, haber, centro_costo_id)
  SELECT v_id, row_number() OVER (ORDER BY c.codigo, s.centro_costo_id), s.cuenta_id, NULL,
         greatest(-s.saldo, 0), greatest(s.saldo, 0), s.centro_costo_id
  FROM (
    SELECT l.cuenta_id, l.centro_costo_id, sum(l.debe - l.haber) AS saldo
    FROM contabilidad.lineas l
    JOIN contabilidad.asientos a ON a.id = l.asiento_id
    JOIN contabilidad.cuentas c ON c.id = l.cuenta_id
    WHERE a.ejercicio_id = p_ejercicio AND a.estado = 'confirmado'
      AND c.clase IN ('ingreso', 'egreso')
    GROUP BY l.cuenta_id, l.centro_costo_id
    HAVING sum(l.debe - l.haber) <> 0
  ) s
  JOIN contabilidad.cuentas c ON c.id = s.cuenta_id;
  GET DIAGNOSTICS v_n = ROW_COUNT;

  IF v_n = 0 THEN
    DELETE FROM contabilidad.asientos WHERE id = v_id;
  ELSE
    -- Lo que falta para cuadrar: positivo = egresos > ingresos = déficit
    SELECT sum(haber) - sum(debe) INTO v_resultado FROM contabilidad.lineas WHERE asiento_id = v_id;
    IF v_resultado <> 0 THEN
      INSERT INTO contabilidad.lineas (asiento_id, orden, cuenta_id, descripcion, debe, haber)
      VALUES (v_id, v_n + 1, v_res_ej, 'Resultado del ejercicio',
              greatest(v_resultado, 0), greatest(-v_resultado, 0));
    END IF;
    UPDATE contabilidad.asientos SET estado = 'confirmado' WHERE id = v_id;
  END IF;

  -- 3. Refundición en Superávit/(Déficit) acumulado
  SELECT coalesce(sum(l.debe - l.haber), 0) INTO v_resultado
  FROM contabilidad.lineas l JOIN contabilidad.asientos a ON a.id = l.asiento_id
  WHERE a.ejercicio_id = p_ejercicio AND a.estado = 'confirmado' AND l.cuenta_id = v_res_ej;

  IF v_resultado <> 0 THEN
    INSERT INTO contabilidad.asientos (fecha, descripcion, tipo, origen_tipo, origen_id)
    VALUES (v_ej.fecha_fin, 'Refundición del resultado — ' || v_ej.nombre,
            'refundicion', 'cierre_refundicion', p_ejercicio::text)
    RETURNING id INTO v_id;
    INSERT INTO contabilidad.lineas (asiento_id, orden, cuenta_id, debe, haber) VALUES
      (v_id, 1, v_res_ej, greatest(-v_resultado, 0), greatest(v_resultado, 0)),
      (v_id, 2, v_res_acum, greatest(v_resultado, 0), greatest(-v_resultado, 0));
    UPDATE contabilidad.asientos SET estado = 'confirmado' WHERE id = v_id;
  END IF;

  -- 4. Cierre de períodos y ejercicio
  UPDATE contabilidad.periodos SET estado = 'cerrado', cerrado_at = now(), cerrado_por = auth.uid()
   WHERE ejercicio_id = p_ejercicio AND estado = 'abierto';
  UPDATE contabilidad.ejercicios SET estado = 'cerrado', cerrado_at = now(), cerrado_por = auth.uid()
   WHERE id = p_ejercicio;

  -- 5. Ejercicio siguiente y su apertura
  SELECT id INTO v_sig FROM contabilidad.ejercicios WHERE fecha_inicio = v_ej.fecha_fin + 1;
  IF v_sig IS NULL THEN
    v_sig := contabilidad.crear_ejercicio(extract(year FROM v_ej.fecha_fin + 1)::integer);
  END IF;
  PERFORM set_config('contabilidad.proceso', 'sistema', true);

  INSERT INTO contabilidad.asientos (fecha, descripcion, tipo, origen_tipo, origen_id)
  VALUES (v_ej.fecha_fin + 1, 'Apertura — saldos al ' || to_char(v_ej.fecha_fin, 'DD/MM/YYYY'),
          'apertura', 'apertura', v_sig::text)
  RETURNING id INTO v_id;

  INSERT INTO contabilidad.lineas (asiento_id, orden, cuenta_id, debe, haber, moneda, importe_origen, tc,
                                   centro_costo_id, proveedor_id, disciplina_id)
  SELECT v_id, row_number() OVER (ORDER BY c.codigo, s.proveedor_id, s.disciplina_id, s.centro_costo_id),
         s.cuenta_id, greatest(s.base, 0), greatest(-s.base, 0),
         c.moneda,
         CASE WHEN c.moneda IS NOT NULL THEN abs(s.origen) END,
         CASE WHEN c.moneda IS NOT NULL THEN
           CASE WHEN s.origen <> 0 THEN round(abs(s.base) / abs(s.origen), 10)
                ELSE contabilidad.tc_cierre(c.moneda, v_ej.fecha_fin) END
         END,
         s.centro_costo_id, s.proveedor_id, s.disciplina_id
  FROM (
    SELECT l.cuenta_id, l.proveedor_id, l.disciplina_id, l.centro_costo_id,
           sum(l.debe - l.haber) AS base,
           coalesce(sum(CASE WHEN l.debe > 0 THEN l.importe_origen ELSE -l.importe_origen END), 0) AS origen
    FROM contabilidad.lineas l
    JOIN contabilidad.asientos a ON a.id = l.asiento_id
    JOIN contabilidad.cuentas c ON c.id = l.cuenta_id
    WHERE a.ejercicio_id = p_ejercicio AND a.estado = 'confirmado'
      AND c.clase IN ('activo', 'pasivo', 'patrimonio')
    GROUP BY l.cuenta_id, l.proveedor_id, l.disciplina_id, l.centro_costo_id
    HAVING sum(l.debe - l.haber) <> 0
  ) s
  JOIN contabilidad.cuentas c ON c.id = s.cuenta_id;
  GET DIAGNOSTICS v_n = ROW_COUNT;

  IF v_n = 0 THEN
    DELETE FROM contabilidad.asientos WHERE id = v_id;
  ELSE
    UPDATE contabilidad.asientos SET estado = 'confirmado' WHERE id = v_id;
  END IF;

  PERFORM set_config('contabilidad.proceso', '', true);
  RETURN v_sig;
END;
$$;

-- Deshace el cierre del último ejercicio cerrado, mientras el
-- siguiente no tenga movimientos propios.
CREATE FUNCTION contabilidad.reabrir_ejercicio(p_ejercicio uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_ej contabilidad.ejercicios%ROWTYPE;
  v_sig uuid;
BEGIN
  PERFORM contabilidad._exigir_escritura();
  SELECT * INTO v_ej FROM contabilidad.ejercicios WHERE id = p_ejercicio FOR UPDATE;
  IF v_ej.id IS NULL OR v_ej.estado <> 'cerrado' THEN
    RAISE EXCEPTION 'El ejercicio no está cerrado';
  END IF;
  IF EXISTS (SELECT 1 FROM contabilidad.ejercicios
             WHERE fecha_inicio > v_ej.fecha_fin AND estado = 'cerrado') THEN
    RAISE EXCEPTION 'Hay un ejercicio posterior cerrado: se reabren del más nuevo al más viejo';
  END IF;
  SELECT id INTO v_sig FROM contabilidad.ejercicios WHERE fecha_inicio = v_ej.fecha_fin + 1;
  IF v_sig IS NOT NULL AND EXISTS (
    SELECT 1 FROM contabilidad.asientos WHERE ejercicio_id = v_sig AND tipo <> 'apertura'
  ) THEN
    RAISE EXCEPTION 'El ejercicio siguiente ya tiene movimientos: no se puede reabrir';
  END IF;

  PERFORM set_config('contabilidad.proceso', 'reapertura', true);

  DELETE FROM contabilidad.asientos
   WHERE (ejercicio_id = v_sig AND tipo = 'apertura')
      OR (ejercicio_id = p_ejercicio
          AND origen_tipo IN ('cierre_revaluacion', 'cierre_resultados', 'cierre_refundicion'));

  UPDATE contabilidad.numeradores n
     SET ultimo = coalesce((SELECT max(numero) FROM contabilidad.asientos a
                            WHERE a.ejercicio_id = n.ejercicio_id), 0)
   WHERE n.ejercicio_id IN (p_ejercicio, v_sig);

  UPDATE contabilidad.ejercicios SET estado = 'abierto', cerrado_at = NULL, cerrado_por = NULL
   WHERE id = p_ejercicio;
  UPDATE contabilidad.periodos SET estado = 'abierto', cerrado_at = NULL, cerrado_por = NULL
   WHERE ejercicio_id = p_ejercicio AND fecha_fin = v_ej.fecha_fin;

  PERFORM set_config('contabilidad.proceso', '', true);
END;
$$;

-- ------------------------------------------------------------
-- Plan de cuentas base (asociación civil deportiva)
-- ------------------------------------------------------------
CREATE FUNCTION contabilidad._seed_cuenta(
  p_codigo text, p_nombre text, p_imputable boolean DEFAULT true,
  p_naturaleza contabilidad.naturaleza DEFAULT NULL,
  p_moneda char(3) DEFAULT NULL, p_disponibilidad boolean DEFAULT false,
  p_auxiliar contabilidad.tipo_auxiliar DEFAULT NULL, p_centro_costo boolean DEFAULT false,
  p_activa boolean DEFAULT true, p_corriente boolean DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE
  v_padre uuid;
  v_naturaleza contabilidad.naturaleza;
BEGIN
  IF position('.' IN p_codigo) > 0 THEN
    SELECT id INTO v_padre FROM contabilidad.cuentas
    WHERE codigo = regexp_replace(p_codigo, '\.[0-9]+$', '');
  END IF;
  v_naturaleza := coalesce(p_naturaleza,
    CASE WHEN left(p_codigo, 1) IN ('1', '5') THEN 'deudora' ELSE 'acreedora' END::contabilidad.naturaleza);
  INSERT INTO contabilidad.cuentas (codigo, nombre, padre_id, nivel, clase, naturaleza, imputable,
                                    moneda, corriente, es_disponibilidad, revalua,
                                    requiere_auxiliar, requiere_centro_costo, activa)
  VALUES (p_codigo, p_nombre, v_padre, 0, 'activo', v_naturaleza, p_imputable,
          p_moneda, p_corriente, p_disponibilidad, p_moneda IS NOT NULL,
          p_auxiliar, p_centro_costo, p_activa);
END;
$$;

DO $$
DECLARE
  f constant boolean := false;
BEGIN
  -- 1 ACTIVO
  PERFORM contabilidad._seed_cuenta('1', 'Activo', f);
  PERFORM contabilidad._seed_cuenta('1.1', 'Activo corriente', f, p_corriente => true);
  PERFORM contabilidad._seed_cuenta('1.1.01', 'Disponibilidades', f);
  PERFORM contabilidad._seed_cuenta('1.1.01.01', 'Caja oficina', p_disponibilidad => true);
  PERFORM contabilidad._seed_cuenta('1.1.01.02', 'Caja oficina USD', p_moneda => 'USD', p_disponibilidad => true);
  PERFORM contabilidad._seed_cuenta('1.1.01.03', 'Caja tienda (POS)', p_disponibilidad => true);
  PERFORM contabilidad._seed_cuenta('1.1.01.04', 'Fondo fijo', p_disponibilidad => true);
  PERFORM contabilidad._seed_cuenta('1.1.01.05', 'Banco cuenta corriente', p_disponibilidad => true);
  PERFORM contabilidad._seed_cuenta('1.1.01.06', 'Banco cuenta USD', p_moneda => 'USD', p_disponibilidad => true);
  PERFORM contabilidad._seed_cuenta('1.1.02', 'Inversiones temporarias', f);
  PERFORM contabilidad._seed_cuenta('1.1.02.01', 'Depósitos a plazo');
  PERFORM contabilidad._seed_cuenta('1.1.02.02', 'Depósitos a plazo USD', p_moneda => 'USD');
  PERFORM contabilidad._seed_cuenta('1.1.03', 'Créditos con socios', f);
  PERFORM contabilidad._seed_cuenta('1.1.03.01', 'Cuotas sociales a cobrar');
  PERFORM contabilidad._seed_cuenta('1.1.03.02', 'Cuotas de disciplina a cobrar');
  PERFORM contabilidad._seed_cuenta('1.1.03.03', 'Compras de socios a cobrar');
  PERFORM contabilidad._seed_cuenta('1.1.03.09', 'Previsión para cuotas incobrables', p_naturaleza => 'acreedora');
  PERFORM contabilidad._seed_cuenta('1.1.04', 'Otros créditos', f);
  PERFORM contabilidad._seed_cuenta('1.1.04.01', 'Visa a cobrar (débito automático)');
  PERFORM contabilidad._seed_cuenta('1.1.04.02', 'Deudores por ventas de tienda');
  PERFORM contabilidad._seed_cuenta('1.1.04.03', 'Fondos en poder de disciplinas', p_auxiliar => 'disciplina');
  PERFORM contabilidad._seed_cuenta('1.1.04.04', 'Anticipos a proveedores', p_auxiliar => 'proveedor');
  PERFORM contabilidad._seed_cuenta('1.1.04.05', 'Anticipos a proveedores USD', p_moneda => 'USD', p_auxiliar => 'proveedor');
  PERFORM contabilidad._seed_cuenta('1.1.04.06', 'Patrocinadores a cobrar');
  PERFORM contabilidad._seed_cuenta('1.1.04.07', 'Subvenciones a cobrar');
  PERFORM contabilidad._seed_cuenta('1.1.04.08', 'IVA compras', p_activa => false);
  PERFORM contabilidad._seed_cuenta('1.1.04.09', 'Deudores varios');
  PERFORM contabilidad._seed_cuenta('1.1.05', 'Bienes de cambio', f);
  PERFORM contabilidad._seed_cuenta('1.1.05.01', 'Mercadería de tienda');
  PERFORM contabilidad._seed_cuenta('1.1.05.02', 'Mercadería en tránsito');
  PERFORM contabilidad._seed_cuenta('1.2', 'Activo no corriente', f, p_corriente => false);
  PERFORM contabilidad._seed_cuenta('1.2.01', 'Bienes de uso', f);
  PERFORM contabilidad._seed_cuenta('1.2.01.01', 'Mejoras e instalaciones deportivas');
  PERFORM contabilidad._seed_cuenta('1.2.01.02', 'Amort. acum. mejoras e instalaciones', p_naturaleza => 'acreedora');
  PERFORM contabilidad._seed_cuenta('1.2.01.03', 'Equipamiento deportivo');
  PERFORM contabilidad._seed_cuenta('1.2.01.04', 'Amort. acum. equipamiento deportivo', p_naturaleza => 'acreedora');
  PERFORM contabilidad._seed_cuenta('1.2.01.05', 'Muebles y útiles');
  PERFORM contabilidad._seed_cuenta('1.2.01.06', 'Amort. acum. muebles y útiles', p_naturaleza => 'acreedora');
  PERFORM contabilidad._seed_cuenta('1.2.01.07', 'Equipos informáticos');
  PERFORM contabilidad._seed_cuenta('1.2.01.08', 'Amort. acum. equipos informáticos', p_naturaleza => 'acreedora');
  PERFORM contabilidad._seed_cuenta('1.2.02', 'Intangibles', f);
  PERFORM contabilidad._seed_cuenta('1.2.02.01', 'Software');
  PERFORM contabilidad._seed_cuenta('1.2.02.02', 'Amort. acum. software', p_naturaleza => 'acreedora');
  PERFORM contabilidad._seed_cuenta('1.2.03', 'Inversiones a largo plazo', f);
  PERFORM contabilidad._seed_cuenta('1.2.03.01', 'Inversiones a largo plazo');

  -- 2 PASIVO
  PERFORM contabilidad._seed_cuenta('2', 'Pasivo', f);
  PERFORM contabilidad._seed_cuenta('2.1', 'Pasivo corriente', f, p_corriente => true);
  PERFORM contabilidad._seed_cuenta('2.1.01', 'Deudas comerciales', f);
  PERFORM contabilidad._seed_cuenta('2.1.01.01', 'Proveedores', p_auxiliar => 'proveedor');
  PERFORM contabilidad._seed_cuenta('2.1.01.02', 'Proveedores USD', p_moneda => 'USD', p_auxiliar => 'proveedor');
  PERFORM contabilidad._seed_cuenta('2.1.01.03', 'Mercadería recibida a facturar', p_auxiliar => 'proveedor');
  PERFORM contabilidad._seed_cuenta('2.1.01.04', 'Documentos a pagar');
  PERFORM contabilidad._seed_cuenta('2.1.02', 'Deudas sociales', f);
  PERFORM contabilidad._seed_cuenta('2.1.02.01', 'Sueldos a pagar');
  PERFORM contabilidad._seed_cuenta('2.1.02.02', 'BPS a pagar');
  PERFORM contabilidad._seed_cuenta('2.1.02.03', 'Provisión aguinaldo y licencia');
  PERFORM contabilidad._seed_cuenta('2.1.03', 'Deudas fiscales', f);
  PERFORM contabilidad._seed_cuenta('2.1.03.01', 'Retenciones IRPF/IRNR a pagar');
  PERFORM contabilidad._seed_cuenta('2.1.03.02', 'IVA ventas', p_activa => false);
  PERFORM contabilidad._seed_cuenta('2.1.03.03', 'Tributos y tasas a pagar');
  PERFORM contabilidad._seed_cuenta('2.1.04', 'Cobros anticipados', f);
  PERFORM contabilidad._seed_cuenta('2.1.04.01', 'Cuotas cobradas por adelantado');
  PERFORM contabilidad._seed_cuenta('2.1.04.02', 'Entradas de eventos futuros');
  PERFORM contabilidad._seed_cuenta('2.1.04.03', 'Señas de encargues de tienda');
  PERFORM contabilidad._seed_cuenta('2.1.05', 'Fondos de terceros en custodia', f);
  PERFORM contabilidad._seed_cuenta('2.1.05.01', 'Donaciones Olla del Hogar a transferir');
  PERFORM contabilidad._seed_cuenta('2.1.05.02', 'Cobros por cuenta de terceros');
  PERFORM contabilidad._seed_cuenta('2.1.06', 'Deudas financieras', f);
  PERFORM contabilidad._seed_cuenta('2.1.06.01', 'Préstamos bancarios');
  PERFORM contabilidad._seed_cuenta('2.1.06.02', 'Tarjeta de crédito corporativa');
  PERFORM contabilidad._seed_cuenta('2.1.07', 'Deudas diversas', f);
  PERFORM contabilidad._seed_cuenta('2.1.07.01', 'Acreedores varios');
  PERFORM contabilidad._seed_cuenta('2.2', 'Pasivo no corriente', f, p_corriente => false);
  PERFORM contabilidad._seed_cuenta('2.2.01', 'Deudas financieras a largo plazo', f);
  PERFORM contabilidad._seed_cuenta('2.2.01.01', 'Préstamos bancarios a largo plazo');

  -- 3 PATRIMONIO
  PERFORM contabilidad._seed_cuenta('3', 'Patrimonio', f);
  PERFORM contabilidad._seed_cuenta('3.1', 'Fondo social', f);
  PERFORM contabilidad._seed_cuenta('3.1.01', 'Fondo social');
  PERFORM contabilidad._seed_cuenta('3.2', 'Ajustes al patrimonio', f);
  PERFORM contabilidad._seed_cuenta('3.2.01', 'Revaluación de bienes de uso');
  PERFORM contabilidad._seed_cuenta('3.3', 'Reservas y fondos con destino específico', f);
  PERFORM contabilidad._seed_cuenta('3.3.01', 'Fondo para obras');
  PERFORM contabilidad._seed_cuenta('3.3.02', 'Fondos afectados a disciplinas');
  PERFORM contabilidad._seed_cuenta('3.4', 'Resultados', f);
  PERFORM contabilidad._seed_cuenta('3.4.01', 'Superávit (déficit) acumulado');
  PERFORM contabilidad._seed_cuenta('3.4.02', 'Superávit (déficit) del ejercicio');

  -- 4 INGRESOS
  PERFORM contabilidad._seed_cuenta('4', 'Ingresos', f);
  PERFORM contabilidad._seed_cuenta('4.1', 'Recursos para fines generales', f);
  PERFORM contabilidad._seed_cuenta('4.1.01', 'Cuotas sociales');
  PERFORM contabilidad._seed_cuenta('4.1.02', 'Cuotas de ingreso');
  PERFORM contabilidad._seed_cuenta('4.1.03', 'Aportes extraordinarios');
  PERFORM contabilidad._seed_cuenta('4.2', 'Recursos deportivos', f);
  PERFORM contabilidad._seed_cuenta('4.2.01', 'Cuotas de disciplina', p_centro_costo => true);
  PERFORM contabilidad._seed_cuenta('4.2.02', 'Inscripciones a torneos y campamentos', p_centro_costo => true);
  PERFORM contabilidad._seed_cuenta('4.2.03', 'Entradas a espectáculos deportivos', p_centro_costo => true);
  PERFORM contabilidad._seed_cuenta('4.3', 'Actividades sociales y culturales', f);
  PERFORM contabilidad._seed_cuenta('4.3.01', 'Eventos');
  PERFORM contabilidad._seed_cuenta('4.3.02', 'Alquiler de instalaciones');
  PERFORM contabilidad._seed_cuenta('4.4', 'Tienda', f);
  PERFORM contabilidad._seed_cuenta('4.4.01', 'Ventas a socios');
  PERFORM contabilidad._seed_cuenta('4.4.02', 'Ventas a no socios');
  PERFORM contabilidad._seed_cuenta('4.4.03', 'Ventas a disciplinas');
  PERFORM contabilidad._seed_cuenta('4.4.09', 'Devoluciones y bonificaciones sobre ventas', p_naturaleza => 'deudora');
  PERFORM contabilidad._seed_cuenta('4.5', 'Donaciones, subvenciones y patrocinios', f);
  PERFORM contabilidad._seed_cuenta('4.5.01', 'Donaciones');
  PERFORM contabilidad._seed_cuenta('4.5.02', 'Subvenciones');
  PERFORM contabilidad._seed_cuenta('4.5.03', 'Patrocinios y publicidad');
  PERFORM contabilidad._seed_cuenta('4.6', 'Resultados financieros', f);
  PERFORM contabilidad._seed_cuenta('4.6.01', 'Intereses ganados');
  PERFORM contabilidad._seed_cuenta('4.6.02', 'Diferencia de cambio ganada');
  PERFORM contabilidad._seed_cuenta('4.7', 'Otros ingresos', f);
  PERFORM contabilidad._seed_cuenta('4.7.01', 'Ingresos diversos');
  PERFORM contabilidad._seed_cuenta('4.7.02', 'Sobrantes de caja');

  -- 5 EGRESOS
  PERFORM contabilidad._seed_cuenta('5', 'Egresos', f);
  PERFORM contabilidad._seed_cuenta('5.1', 'Costo de ventas', f);
  PERFORM contabilidad._seed_cuenta('5.1.01', 'Costo de mercadería vendida');
  PERFORM contabilidad._seed_cuenta('5.1.02', 'Ajustes y mermas de inventario');
  PERFORM contabilidad._seed_cuenta('5.2', 'Gastos deportivos', f);
  PERFORM contabilidad._seed_cuenta('5.2.01', 'Honorarios de entrenadores y preparadores', p_centro_costo => true);
  PERFORM contabilidad._seed_cuenta('5.2.02', 'Inscripciones y afiliaciones a federaciones', p_centro_costo => true);
  PERFORM contabilidad._seed_cuenta('5.2.03', 'Arbitrajes', p_centro_costo => true);
  PERFORM contabilidad._seed_cuenta('5.2.04', 'Alquiler de canchas', p_centro_costo => true);
  PERFORM contabilidad._seed_cuenta('5.2.05', 'Indumentaria y material deportivo', p_centro_costo => true);
  PERFORM contabilidad._seed_cuenta('5.2.06', 'Traslados', p_centro_costo => true);
  PERFORM contabilidad._seed_cuenta('5.2.07', 'Servicio médico y seguros deportivos', p_centro_costo => true);
  PERFORM contabilidad._seed_cuenta('5.2.08', 'Comisiones de cobranza de cuotas', p_centro_costo => true);
  PERFORM contabilidad._seed_cuenta('5.3', 'Gastos de eventos', f);
  PERFORM contabilidad._seed_cuenta('5.3.01', 'Gastos de eventos');
  PERFORM contabilidad._seed_cuenta('5.4', 'Gastos de instalaciones', f);
  PERFORM contabilidad._seed_cuenta('5.4.01', 'Mantenimiento');
  PERFORM contabilidad._seed_cuenta('5.4.02', 'UTE, OSE y comunicaciones');
  PERFORM contabilidad._seed_cuenta('5.4.03', 'Seguridad y limpieza');
  PERFORM contabilidad._seed_cuenta('5.4.04', 'Seguros');
  PERFORM contabilidad._seed_cuenta('5.5', 'Gastos de administración', f);
  PERFORM contabilidad._seed_cuenta('5.5.01', 'Sueldos y jornales');
  PERFORM contabilidad._seed_cuenta('5.5.02', 'Cargas sociales');
  PERFORM contabilidad._seed_cuenta('5.5.03', 'Honorarios profesionales');
  PERFORM contabilidad._seed_cuenta('5.5.04', 'Comisiones bancarias');
  PERFORM contabilidad._seed_cuenta('5.5.05', 'Software y hosting');
  PERFORM contabilidad._seed_cuenta('5.5.06', 'Papelería y gastos de oficina');
  PERFORM contabilidad._seed_cuenta('5.5.07', 'Comunicación y publicidad');
  PERFORM contabilidad._seed_cuenta('5.6', 'Amortizaciones', f);
  PERFORM contabilidad._seed_cuenta('5.6.01', 'Amortizaciones de bienes de uso');
  PERFORM contabilidad._seed_cuenta('5.7', 'Resultados financieros', f);
  PERFORM contabilidad._seed_cuenta('5.7.01', 'Intereses perdidos');
  PERFORM contabilidad._seed_cuenta('5.7.02', 'Diferencia de cambio perdida');
  PERFORM contabilidad._seed_cuenta('5.8', 'Tributos', f);
  PERFORM contabilidad._seed_cuenta('5.8.01', 'Tributos y tasas');
  PERFORM contabilidad._seed_cuenta('5.8.02', 'IVA no recuperable');
  PERFORM contabilidad._seed_cuenta('5.9', 'Otros egresos', f);
  PERFORM contabilidad._seed_cuenta('5.9.01', 'Deudores incobrables');
  PERFORM contabilidad._seed_cuenta('5.9.02', 'Faltantes de caja');
  PERFORM contabilidad._seed_cuenta('5.9.03', 'Egresos diversos');
END;
$$;

DROP FUNCTION contabilidad._seed_cuenta(text, text, boolean, contabilidad.naturaleza, char, boolean,
                                        contabilidad.tipo_auxiliar, boolean, boolean, boolean);

INSERT INTO contabilidad.cuentas_sistema (rol, cuenta_id)
SELECT v.rol, c.id FROM (VALUES
  ('resultado_ejercicio', '3.4.02'),
  ('resultados_acumulados', '3.4.01'),
  ('diferencia_cambio_ganada', '4.6.02'),
  ('diferencia_cambio_perdida', '5.7.02')
) AS v(rol, codigo)
JOIN contabilidad.cuentas c ON c.codigo = v.codigo;

-- ------------------------------------------------------------
-- RLS y permisos
-- ------------------------------------------------------------
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['monedas', 'config', 'cotizaciones', 'cuentas', 'cuentas_sistema',
                           'parametros_cuentas', 'centros_costo', 'ejercicios', 'periodos',
                           'asientos', 'lineas', 'numeradores', 'auditoria']
  LOOP
    EXECUTE format('ALTER TABLE contabilidad.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('CREATE POLICY %I ON contabilidad.%I FOR SELECT TO authenticated USING (contabilidad.puede_leer())',
                   t || '_lectura', t);
  END LOOP;

  FOREACH t IN ARRAY ARRAY['cuentas', 'centros_costo', 'cuentas_sistema', 'parametros_cuentas', 'config']
  LOOP
    EXECUTE format('CREATE POLICY %I ON contabilidad.%I FOR INSERT TO authenticated WITH CHECK (contabilidad.puede_escribir())',
                   t || '_alta', t);
    EXECUTE format('CREATE POLICY %I ON contabilidad.%I FOR UPDATE TO authenticated USING (contabilidad.puede_escribir()) WITH CHECK (contabilidad.puede_escribir())',
                   t || '_modificacion', t);
    EXECUTE format('CREATE POLICY %I ON contabilidad.%I FOR DELETE TO authenticated USING (contabilidad.puede_escribir())',
                   t || '_baja', t);
  END LOOP;
END;
$$;

REVOKE ALL ON ALL TABLES IN SCHEMA contabilidad FROM PUBLIC, anon, authenticated;
GRANT SELECT ON ALL TABLES IN SCHEMA contabilidad TO authenticated, service_role;
GRANT INSERT, UPDATE, DELETE ON contabilidad.cuentas, contabilidad.centros_costo,
  contabilidad.cuentas_sistema, contabilidad.parametros_cuentas TO authenticated;
GRANT UPDATE ON contabilidad.config TO authenticated;

REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA contabilidad FROM PUBLIC, anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA contabilidad REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;

GRANT EXECUTE ON FUNCTION
  contabilidad.puede_leer(),
  contabilidad.puede_escribir(),
  contabilidad.moneda_funcional(),
  contabilidad.tc_vigente(char, date),
  contabilidad.tc_cierre(char, date),
  contabilidad.saldos(date, date, boolean),
  contabilidad.libro_mayor(uuid, date, date),
  contabilidad.crear_ejercicio(integer),
  contabilidad.cerrar_periodo(uuid),
  contabilidad.reabrir_periodo(uuid),
  contabilidad.guardar_asiento(uuid, date, text, jsonb, boolean, contabilidad.tipo_asiento),
  contabilidad.confirmar_asiento(uuid),
  contabilidad.eliminar_borrador(uuid),
  contabilidad.revertir_asiento(uuid, text, date),
  contabilidad.registrar_cotizacion(char, date, numeric, text),
  contabilidad.revaluar_moneda_extranjera(date),
  contabilidad.cerrar_ejercicio(uuid),
  contabilidad.reabrir_ejercicio(uuid),
  contabilidad.sincronizar_centros_disciplinas()
TO authenticated, service_role;
