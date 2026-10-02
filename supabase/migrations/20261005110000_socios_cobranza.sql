-- ============================================================
-- Socios — cobranza: cobros, saldo a favor, notas de crédito, débito
-- Visa y liquidación a las disciplinas
--
-- Reglas (ContaSystem las tenía en la app y se rompían; acá son de la base):
--   * cada operación es una función en una transacción, con su asiento;
--   * un cobro se aplica a cuotas de la misma persona, nunca por encima
--     de su saldo (cobros + créditos ≤ importe) ni a cuotas anuladas;
--     lo que sobra queda como saldo a favor y se aplica solo a las cuotas
--     que se emiten después;
--   * anular = contra-asiento (nunca editar ni borrar); el saldo de una
--     cuota se calcula, no se escribe;
--   * una liquidación de Visa no se aplica dos veces a la misma persona y
--     período; los rechazos no tocan la cuota (la deuda sigue);
--   * lo que la persona paga en la cuenta de una disciplina queda como
--     deuda de la disciplina con el club; la liquidación a la disciplina
--     es lo cobrado de sus cuotas menos su parte de la comisión, y puede
--     compensar esa deuda.
-- ============================================================

-- ------------------------------------------------------------
-- Cuentas
-- ------------------------------------------------------------
INSERT INTO contabilidad.cuentas (codigo, nombre, padre_id, nivel, clase, naturaleza, imputable, requiere_centro_costo)
SELECT '5.2.09', 'Transferencias a disciplinas', id, 0, 'egreso', 'deudora', true, true
FROM contabilidad.cuentas WHERE codigo = '5.2';

INSERT INTO contabilidad.parametros_cuentas (proceso, rol, cuenta_id, descripcion)
SELECT 'socios', v.rol, c.id, v.descripcion
FROM (VALUES
  ('anticipos', '2.1.04.01', 'Saldo a favor de socios (cobros por adelantado)'),
  ('banco_cobros', '1.1.01.05', 'Cuenta donde entran transferencias y el débito Visa'),
  ('caja', '1.1.01.01', 'Caja donde entra el efectivo'),
  ('disciplinas', '1.1.04.03', 'Cobros recibidos por las disciplinas (deuda de la disciplina con el club)'),
  ('comision_cobranza', '5.2.08', 'Comisión del débito automático'),
  ('liquidacion_disciplinas', '5.2.09', 'Lo que se liquida a cada disciplina')
) AS v (rol, codigo, descripcion)
JOIN contabilidad.cuentas c ON c.codigo = v.codigo;

-- Centro de costo de la parte del club (cuota social) en la comisión.
ALTER TABLE socios.config ADD COLUMN centro_club_id uuid REFERENCES contabilidad.centros_costo (id);
UPDATE socios.config SET centro_club_id = (SELECT id FROM contabilidad.centros_costo WHERE codigo = 'ADM');

-- Datos de cada disciplina para la cobranza
CREATE TABLE socios.disciplinas_cobranza (
  disciplina_id integer PRIMARY KEY REFERENCES public.disciplinas (id) ON DELETE RESTRICT,
  -- Qué parte de la comisión del débito sobre sus cuotas se le carga.
  porcentaje_comision numeric(5, 2) NOT NULL DEFAULT 100 CHECK (porcentaje_comision BETWEEN 0 AND 100),
  -- Dónde se le transfiere (titular, banco, cuenta): informativo.
  datos_transferencia text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- ------------------------------------------------------------
-- Cobros y aplicaciones
-- ------------------------------------------------------------
CREATE TABLE socios.liquidaciones_visa (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  periodo date NOT NULL CHECK (periodo = date_trunc('month', periodo)::date),
  fecha date NOT NULL,
  cuenta_id uuid NOT NULL REFERENCES contabilidad.cuentas (id) ON DELETE RESTRICT,
  bruto numeric(14, 2) NOT NULL CHECK (bruto > 0),
  comision numeric(14, 2) NOT NULL CHECK (comision >= 0 AND comision < bruto),
  archivo text,
  asiento_id uuid NOT NULL REFERENCES contabilidad.asientos (id) ON DELETE RESTRICT,
  estado text NOT NULL DEFAULT 'vigente' CHECK (estado IN ('vigente', 'anulada')),
  motivo_anulacion text,
  anulado_por uuid,
  anulado_at timestamptz,
  creado_por uuid DEFAULT contabilidad._usuario(),
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((estado = 'anulada') = (anulado_at IS NOT NULL AND motivo_anulacion IS NOT NULL))
);

CREATE TABLE socios.cobros (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  persona_id integer NOT NULL REFERENCES public.padron_socios (id) ON DELETE RESTRICT,
  fecha date NOT NULL,
  medio text NOT NULL CHECK (medio IN ('debito_visa', 'transferencia_club', 'transferencia_disciplina', 'efectivo')),
  cuenta_id uuid REFERENCES contabilidad.cuentas (id) ON DELETE RESTRICT,
  disciplina_id integer REFERENCES public.disciplinas (id) ON DELETE RESTRICT,
  importe numeric(12, 2) NOT NULL CHECK (importe > 0),
  referencia text,
  liquidacion_visa_id bigint REFERENCES socios.liquidaciones_visa (id) ON DELETE RESTRICT,
  asiento_id uuid NOT NULL REFERENCES contabilidad.asientos (id) ON DELETE RESTRICT,
  estado text NOT NULL DEFAULT 'vigente' CHECK (estado IN ('vigente', 'anulado')),
  motivo_anulacion text,
  anulado_por uuid,
  anulado_at timestamptz,
  creado_por uuid DEFAULT contabilidad._usuario(),
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((medio = 'transferencia_disciplina') = (disciplina_id IS NOT NULL)),
  CHECK ((medio = 'transferencia_disciplina') = (cuenta_id IS NULL)),
  CHECK ((medio = 'debito_visa') = (liquidacion_visa_id IS NOT NULL)),
  CHECK ((estado = 'anulado') = (anulado_at IS NOT NULL AND motivo_anulacion IS NOT NULL))
);
-- Idempotencia: la misma referencia del banco no entra dos veces.
CREATE UNIQUE INDEX cobros_referencia_unica ON socios.cobros (medio, lower(btrim(referencia)))
  WHERE referencia IS NOT NULL AND estado = 'vigente' AND medio <> 'debito_visa';
-- Un débito por persona y liquidación.
CREATE UNIQUE INDEX cobros_visa_unico ON socios.cobros (liquidacion_visa_id, persona_id) WHERE estado = 'vigente';
CREATE INDEX cobros_persona_idx ON socios.cobros (persona_id, fecha);

CREATE TABLE socios.aplicaciones (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  cobro_id bigint NOT NULL REFERENCES socios.cobros (id) ON DELETE RESTRICT,
  cuota_id bigint NOT NULL,
  persona_id integer NOT NULL,
  importe numeric(12, 2) NOT NULL CHECK (importe > 0),
  fecha date NOT NULL,
  -- El del cobro, o el de la aplicación del saldo a favor.
  asiento_id uuid NOT NULL REFERENCES contabilidad.asientos (id) ON DELETE RESTRICT,
  anulada boolean NOT NULL DEFAULT false,
  FOREIGN KEY (cuota_id, persona_id) REFERENCES socios.cuotas (id, persona_id) ON DELETE RESTRICT
);
CREATE INDEX aplicaciones_cuota_idx ON socios.aplicaciones (cuota_id) WHERE NOT anulada;
CREATE INDEX aplicaciones_cobro_idx ON socios.aplicaciones (cobro_id) WHERE NOT anulada;

-- ------------------------------------------------------------
-- Notas de crédito
-- ------------------------------------------------------------
CREATE TABLE socios.creditos (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  persona_id integer NOT NULL REFERENCES public.padron_socios (id) ON DELETE RESTRICT,
  fecha date NOT NULL,
  tipo text NOT NULL CHECK (tipo IN ('baja', 'anulacion', 'bonificacion')),
  motivo text NOT NULL CHECK (length(btrim(motivo)) > 0),
  importe numeric(12, 2) NOT NULL CHECK (importe > 0),
  asiento_id uuid NOT NULL REFERENCES contabilidad.asientos (id) ON DELETE RESTRICT,
  estado text NOT NULL DEFAULT 'vigente' CHECK (estado IN ('vigente', 'anulado')),
  motivo_anulacion text,
  anulado_por uuid,
  anulado_at timestamptz,
  creado_por uuid DEFAULT contabilidad._usuario(),
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((estado = 'anulado') = (anulado_at IS NOT NULL AND motivo_anulacion IS NOT NULL))
);

CREATE TABLE socios.credito_aplicaciones (
  credito_id bigint NOT NULL REFERENCES socios.creditos (id) ON DELETE RESTRICT,
  cuota_id bigint NOT NULL,
  persona_id integer NOT NULL,
  importe numeric(12, 2) NOT NULL CHECK (importe > 0),
  anulada boolean NOT NULL DEFAULT false,
  PRIMARY KEY (credito_id, cuota_id),
  FOREIGN KEY (cuota_id, persona_id) REFERENCES socios.cuotas (id, persona_id) ON DELETE RESTRICT
);

-- ------------------------------------------------------------
-- Comisión del débito por disciplina (para liquidarla)
-- ------------------------------------------------------------
CREATE TABLE socios.liquidacion_visa_comisiones (
  liquidacion_visa_id bigint NOT NULL REFERENCES socios.liquidaciones_visa (id) ON DELETE RESTRICT,
  -- NULL: la parte del club.
  disciplina_id integer REFERENCES public.disciplinas (id) ON DELETE RESTRICT,
  importe numeric(14, 2) NOT NULL CHECK (importe >= 0),
  UNIQUE NULLS NOT DISTINCT (liquidacion_visa_id, disciplina_id)
);

CREATE TABLE socios.liquidacion_visa_rechazos (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  liquidacion_visa_id bigint NOT NULL REFERENCES socios.liquidaciones_visa (id) ON DELETE RESTRICT,
  persona_id integer REFERENCES public.padron_socios (id) ON DELETE RESTRICT,
  documento text,
  importe numeric(12, 2) NOT NULL CHECK (importe > 0),
  motivo text,
  CHECK (persona_id IS NOT NULL OR documento IS NOT NULL)
);

-- ------------------------------------------------------------
-- Liquidación a las disciplinas
-- ------------------------------------------------------------
CREATE TABLE socios.liquidaciones_disciplina (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  disciplina_id integer NOT NULL REFERENCES public.disciplinas (id) ON DELETE RESTRICT,
  desde date NOT NULL,
  hasta date NOT NULL,
  fecha date NOT NULL,
  cobrado numeric(14, 2) NOT NULL CHECK (cobrado >= 0),
  comision numeric(14, 2) NOT NULL CHECK (comision >= 0),
  -- cobrado − comision: lo que le corresponde a la disciplina.
  importe numeric(14, 2) NOT NULL CHECK (importe > 0),
  -- Deuda de la disciplina con el club que se descuenta.
  compensado numeric(14, 2) NOT NULL DEFAULT 0 CHECK (compensado >= 0),
  transferido numeric(14, 2) NOT NULL CHECK (transferido >= 0),
  cuenta_id uuid REFERENCES contabilidad.cuentas (id) ON DELETE RESTRICT,
  notas text,
  asiento_id uuid NOT NULL REFERENCES contabilidad.asientos (id) ON DELETE RESTRICT,
  estado text NOT NULL DEFAULT 'vigente' CHECK (estado IN ('vigente', 'anulada')),
  motivo_anulacion text,
  anulado_por uuid,
  anulado_at timestamptz,
  creado_por uuid DEFAULT contabilidad._usuario(),
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (hasta >= desde),
  CHECK (importe = cobrado - comision),
  CHECK (importe = compensado + transferido),
  CHECK ((transferido > 0) = (cuenta_id IS NOT NULL)),
  CHECK ((estado = 'anulada') = (anulado_at IS NOT NULL AND motivo_anulacion IS NOT NULL))
);

-- ------------------------------------------------------------
-- Saldos
-- ------------------------------------------------------------
CREATE VIEW socios.cuotas_saldo WITH (security_invoker = true) AS
SELECT c.*,
  coalesce(p.pagado, 0) AS pagado,
  coalesce(n.acreditado, 0) AS acreditado,
  CASE WHEN c.estado = 'anulada' THEN 0 ELSE c.importe - coalesce(p.pagado, 0) - coalesce(n.acreditado, 0) END AS saldo
FROM socios.cuotas c
LEFT JOIN (SELECT cuota_id, sum(importe) AS pagado FROM socios.aplicaciones WHERE NOT anulada GROUP BY cuota_id) p
  ON p.cuota_id = c.id
LEFT JOIN (SELECT cuota_id, sum(importe) AS acreditado FROM socios.credito_aplicaciones WHERE NOT anulada GROUP BY cuota_id) n
  ON n.cuota_id = c.id;

CREATE VIEW socios.cobros_saldo WITH (security_invoker = true) AS
SELECT b.*,
  coalesce(a.aplicado, 0) AS aplicado,
  CASE WHEN b.estado = 'anulado' THEN 0 ELSE b.importe - coalesce(a.aplicado, 0) END AS saldo_a_favor
FROM socios.cobros b
LEFT JOIN (SELECT cobro_id, sum(importe) AS aplicado FROM socios.aplicaciones WHERE NOT anulada GROUP BY cobro_id) a
  ON a.cobro_id = b.id;

CREATE FUNCTION socios._saldo_cuota(p_cuota bigint) RETURNS numeric
LANGUAGE sql STABLE SET search_path = '' AS $$
  SELECT c.importe
    - coalesce((SELECT sum(importe) FROM socios.aplicaciones WHERE cuota_id = c.id AND NOT anulada), 0)
    - coalesce((SELECT sum(importe) FROM socios.credito_aplicaciones WHERE cuota_id = c.id AND NOT anulada), 0)
  FROM socios.cuotas c WHERE c.id = p_cuota
$$;

-- Con la cobranza, una inscripción puede cerrarse dejando afuera cuotas
-- ya pagas o acreditadas (baja con la anual paga, cuotas posteriores
-- acreditadas por la baja).
CREATE OR REPLACE FUNCTION socios._suscripcion_valida() RETURNS trigger
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
  -- Con cuotas emitidas y pendientes, el período de la inscripción no
  -- puede dejarlas afuera (las pagas o acreditadas quedan como historia).
  IF TG_OP = 'UPDATE' AND EXISTS (
    SELECT 1 FROM socios.cuotas_saldo c WHERE c.suscripcion_id = NEW.id AND c.estado = 'emitida' AND c.saldo > 0
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

-- ------------------------------------------------------------
-- Reglas de las aplicaciones
-- ------------------------------------------------------------
CREATE FUNCTION socios._aplicacion_valida() RETURNS trigger
LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE
  v_cuota socios.cuotas;
  v_doc_persona integer;
  v_doc_importe numeric;
  v_doc_aplicado numeric;
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Las aplicaciones no se borran: se anulan con su documento';
  END IF;
  IF TG_OP = 'UPDATE' THEN
    IF OLD.anulada OR NOT NEW.anulada OR (to_jsonb(NEW) - 'anulada') <> (to_jsonb(OLD) - 'anulada') THEN
      RAISE EXCEPTION 'Una aplicación solo se anula';
    END IF;
    RETURN NEW;
  END IF;

  SELECT * INTO v_cuota FROM socios.cuotas WHERE id = NEW.cuota_id FOR UPDATE;
  IF v_cuota.estado <> 'emitida' THEN
    RAISE EXCEPTION 'La cuota % está anulada', v_cuota.concepto;
  END IF;
  IF TG_TABLE_NAME = 'aplicaciones' THEN
    SELECT persona_id, importe INTO v_doc_persona, v_doc_importe FROM socios.cobros WHERE id = NEW.cobro_id FOR UPDATE;
    SELECT coalesce(sum(importe), 0) INTO v_doc_aplicado FROM socios.aplicaciones
    WHERE cobro_id = NEW.cobro_id AND NOT anulada;
    IF NEW.fecha < v_cuota.fecha_emision THEN
      RAISE EXCEPTION 'No se aplica un cobro a una cuota emitida después (%)', v_cuota.concepto;
    END IF;
  ELSE
    SELECT persona_id, importe INTO v_doc_persona, v_doc_importe FROM socios.creditos WHERE id = NEW.credito_id FOR UPDATE;
    SELECT coalesce(sum(importe), 0) INTO v_doc_aplicado FROM socios.credito_aplicaciones
    WHERE credito_id = NEW.credito_id AND NOT anulada;
  END IF;
  IF v_doc_persona <> NEW.persona_id THEN
    RAISE EXCEPTION 'El documento y la cuota son de personas distintas';
  END IF;
  IF v_doc_aplicado + NEW.importe > v_doc_importe THEN
    RAISE EXCEPTION 'Se aplica más de lo que tiene el documento';
  END IF;
  IF NEW.importe > socios._saldo_cuota(NEW.cuota_id) THEN
    RAISE EXCEPTION 'Se aplica más que el saldo de la cuota % (%)', v_cuota.concepto, socios._saldo_cuota(NEW.cuota_id);
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER aplicaciones_valida BEFORE INSERT OR UPDATE OR DELETE ON socios.aplicaciones
  FOR EACH ROW EXECUTE FUNCTION socios._aplicacion_valida();
CREATE TRIGGER credito_aplicaciones_valida BEFORE INSERT OR UPDATE OR DELETE ON socios.credito_aplicaciones
  FOR EACH ROW EXECUTE FUNCTION socios._aplicacion_valida();

-- Documentos: solo se anulan.
CREATE FUNCTION socios._documento_valido() RETURNS trigger
LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'No se borra: se anula';
  END IF;
  IF OLD.estado <> 'vigente' OR (to_jsonb(NEW) - ARRAY['estado', 'motivo_anulacion', 'anulado_por', 'anulado_at'])
                                 <> (to_jsonb(OLD) - ARRAY['estado', 'motivo_anulacion', 'anulado_por', 'anulado_at']) THEN
    RAISE EXCEPTION 'Un documento registrado no se modifica: se anula';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER cobros_valido BEFORE UPDATE OR DELETE ON socios.cobros
  FOR EACH ROW EXECUTE FUNCTION socios._documento_valido();
CREATE TRIGGER creditos_valido BEFORE UPDATE OR DELETE ON socios.creditos
  FOR EACH ROW EXECUTE FUNCTION socios._documento_valido();
CREATE TRIGGER liquidaciones_visa_valido BEFORE UPDATE OR DELETE ON socios.liquidaciones_visa
  FOR EACH ROW EXECUTE FUNCTION socios._documento_valido();
CREATE TRIGGER liquidaciones_disciplina_valido BEFORE UPDATE OR DELETE ON socios.liquidaciones_disciplina
  FOR EACH ROW EXECUTE FUNCTION socios._documento_valido();

-- ------------------------------------------------------------
-- Internos
-- ------------------------------------------------------------
-- Reparte p_importe sobre las cuotas con saldo de la persona (las más
-- viejas primero, o solo p_cuotas). Devuelve [{cuota_id, importe,
-- cuenta_cobrar_id}] sin escribir nada.
CREATE FUNCTION socios._repartir(p_persona integer, p_importe numeric, p_fecha date, p_cuotas bigint[] DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql STABLE SET search_path = '' AS $$
DECLARE
  v_resto numeric := p_importe;
  v_out jsonb := '[]';
  r record;
  v_aplica numeric;
BEGIN
  FOR r IN
    SELECT c.id, c.cuenta_cobrar_id, socios._saldo_cuota(c.id) AS saldo
    FROM socios.cuotas c
    WHERE c.persona_id = p_persona AND c.estado = 'emitida' AND c.fecha_emision <= p_fecha
      AND (p_cuotas IS NULL OR c.id = ANY (p_cuotas))
    ORDER BY c.fecha_vencimiento, c.periodo_desde, c.id
  LOOP
    EXIT WHEN v_resto <= 0;
    CONTINUE WHEN r.saldo <= 0;
    v_aplica := least(r.saldo, v_resto);
    v_out := v_out || jsonb_build_object('cuota_id', r.id, 'importe', v_aplica, 'cuenta_cobrar_id', r.cuenta_cobrar_id);
    v_resto := v_resto - v_aplica;
  END LOOP;
  IF p_cuotas IS NOT NULL AND jsonb_array_length(v_out) < cardinality(p_cuotas) AND v_resto > 0 THEN
    RAISE EXCEPTION 'Alguna de las cuotas elegidas no es de la persona, no tiene saldo o se emitió después del cobro';
  END IF;
  RETURN v_out;
END;
$$;

-- Líneas del haber de un reparto: por cuenta a cobrar, y el excedente a
-- saldo a favor.
CREATE FUNCTION socios._lineas_haber(p_reparto jsonb, p_total numeric, p_descripcion text) RETURNS jsonb
LANGUAGE sql STABLE SET search_path = '' AS $$
  SELECT coalesce(jsonb_agg(l), '[]') FROM (
    SELECT jsonb_build_object('cuenta_id', (e ->> 'cuenta_cobrar_id')::uuid, 'lado', 'haber',
                              'importe', sum((e ->> 'importe')::numeric), 'descripcion', p_descripcion) AS l
    FROM jsonb_array_elements(p_reparto) e GROUP BY e ->> 'cuenta_cobrar_id'
    UNION ALL
    SELECT jsonb_build_object('cuenta_id', contabilidad.cuenta_para('socios', 'anticipos'), 'lado', 'haber',
                              'importe', p_total - coalesce((SELECT sum((e ->> 'importe')::numeric)
                                                             FROM jsonb_array_elements(p_reparto) e), 0),
                              'descripcion', 'Saldo a favor')
    WHERE p_total > coalesce((SELECT sum((e ->> 'importe')::numeric) FROM jsonb_array_elements(p_reparto) e), 0)
  ) x
$$;

CREATE FUNCTION socios._nombre(p_persona integer) RETURNS text
LANGUAGE sql STABLE SET search_path = '' AS $$
  SELECT apellido || ', ' || nombre FROM public.padron_socios WHERE id = p_persona
$$;

-- Aplica el saldo a favor de la persona a sus cuotas con saldo (FIFO
-- de los dos lados), con un asiento: Debe saldo a favor / Haber cuotas.
CREATE FUNCTION socios._aplicar_saldo_a_favor(p_persona integer, p_fecha date) RETURNS numeric
LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE
  v_total numeric := 0;
  v_items jsonb := '[]';
  v_asiento uuid;
  r_cobro record;
  r_cuota record;
  v_disp numeric;
  v_aplica numeric;
  v_pend numeric;
  v_i jsonb;
BEGIN
  FOR r_cobro IN
    SELECT id, saldo_a_favor FROM socios.cobros_saldo
    WHERE persona_id = p_persona AND estado = 'vigente' AND saldo_a_favor > 0 AND fecha <= p_fecha
    ORDER BY fecha, id
  LOOP
    v_disp := r_cobro.saldo_a_favor;
    FOR r_cuota IN
      SELECT c.id, c.cuenta_cobrar_id, socios._saldo_cuota(c.id) AS saldo
      FROM socios.cuotas c
      WHERE c.persona_id = p_persona AND c.estado = 'emitida' AND c.fecha_emision <= p_fecha
      ORDER BY c.fecha_vencimiento, c.periodo_desde, c.id
    LOOP
      EXIT WHEN v_disp <= 0;
      -- Lo ya repartido en esta pasada a la misma cuota.
      SELECT coalesce(sum((e ->> 'importe')::numeric), 0) INTO v_pend
      FROM jsonb_array_elements(v_items) e WHERE (e ->> 'cuota_id')::bigint = r_cuota.id;
      v_aplica := least(v_disp, r_cuota.saldo - v_pend);
      CONTINUE WHEN v_aplica <= 0;
      v_items := v_items || jsonb_build_object('cobro_id', r_cobro.id, 'cuota_id', r_cuota.id, 'importe', v_aplica,
                                               'cuenta_cobrar_id', r_cuota.cuenta_cobrar_id);
      v_disp := v_disp - v_aplica;
      v_total := v_total + v_aplica;
    END LOOP;
  END LOOP;

  IF v_total = 0 THEN
    RETURN 0;
  END IF;
  v_asiento := contabilidad._asiento_automatico(p_fecha, 'Saldo a favor aplicado — ' || socios._nombre(p_persona),
    'saldo_a_favor', p_persona || '-' || txid_current() || '-' || clock_timestamp(),
    jsonb_build_array(jsonb_build_object('cuenta_id', contabilidad.cuenta_para('socios', 'anticipos'),
                                         'lado', 'debe', 'importe', v_total))
    || socios._lineas_haber(v_items, v_total, NULL));
  FOR v_i IN SELECT * FROM jsonb_array_elements(v_items) LOOP
    INSERT INTO socios.aplicaciones (cobro_id, cuota_id, persona_id, importe, fecha, asiento_id)
    VALUES ((v_i ->> 'cobro_id')::bigint, (v_i ->> 'cuota_id')::bigint, p_persona, (v_i ->> 'importe')::numeric,
            p_fecha, v_asiento);
  END LOOP;
  RETURN v_total;
END;
$$;

-- Al emitir una cuota, si la persona tenía saldo a favor, se aplica.
CREATE FUNCTION socios._tras_emitir_cuota() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM socios.cobros_saldo
             WHERE persona_id = NEW.persona_id AND estado = 'vigente' AND saldo_a_favor > 0) THEN
    PERFORM socios._aplicar_saldo_a_favor(NEW.persona_id, greatest(NEW.fecha_emision,
      (SELECT max(fecha) FROM socios.cobros WHERE persona_id = NEW.persona_id AND estado = 'vigente')));
  END IF;
  RETURN NULL;
END;
$$;
CREATE TRIGGER cuotas_saldo_a_favor AFTER INSERT ON socios.cuotas
  FOR EACH ROW EXECUTE FUNCTION socios._tras_emitir_cuota();

-- ------------------------------------------------------------
-- Cobros
-- ------------------------------------------------------------
-- Cobro de una persona por transferencia (al club o a una disciplina) o
-- en efectivo. Se aplica a las cuotas más viejas con saldo (o a
-- p_cuotas); el excedente queda como saldo a favor.
--   Debe banco / caja / disciplina (si pagó en la cuenta de la disciplina)
--   Haber cuotas a cobrar; Haber saldo a favor
CREATE FUNCTION socios.registrar_cobro(
  p_persona integer, p_fecha date, p_medio text, p_importe numeric,
  p_cuenta uuid DEFAULT NULL, p_disciplina integer DEFAULT NULL, p_referencia text DEFAULT NULL,
  p_cuotas bigint[] DEFAULT NULL
) RETURNS bigint
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_importe numeric := round(p_importe, 2);
  v_cuenta uuid;
  v_disp contabilidad.cuentas;
  v_reparto jsonb;
  v_id bigint;
  v_asiento uuid;
  v_debe jsonb;
  v_i jsonb;
BEGIN
  PERFORM socios._exigir_cobranza();
  IF p_medio NOT IN ('transferencia_club', 'transferencia_disciplina', 'efectivo') THEN
    RAISE EXCEPTION 'Medio de cobro inválido (el débito Visa se registra con su liquidación)';
  END IF;
  IF v_importe IS NULL OR v_importe <= 0 THEN
    RAISE EXCEPTION 'El importe tiene que ser mayor que cero';
  END IF;
  IF p_fecha IS NULL OR p_fecha > contabilidad._hoy() THEN
    RAISE EXCEPTION 'La fecha del cobro no puede ser futura';
  END IF;
  PERFORM 1 FROM public.padron_socios WHERE id = p_persona FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Persona inexistente';
  END IF;

  IF p_medio = 'transferencia_disciplina' THEN
    IF p_disciplina IS NULL THEN
      RAISE EXCEPTION 'Indicá en la cuenta de qué disciplina pagó';
    END IF;
    v_debe := jsonb_build_object('cuenta_id', contabilidad.cuenta_para('socios', 'disciplinas'), 'lado', 'debe',
                                 'importe', v_importe, 'disciplina_id', p_disciplina);
  ELSE
    v_cuenta := coalesce(p_cuenta, contabilidad.cuenta_para('socios',
                          CASE WHEN p_medio = 'efectivo' THEN 'caja' ELSE 'banco_cobros' END));
    SELECT * INTO v_disp FROM contabilidad.cuentas WHERE id = v_cuenta;
    IF NOT v_disp.es_disponibilidad OR v_disp.moneda IS NOT NULL THEN
      RAISE EXCEPTION 'El cobro entra a una cuenta de caja o banco en pesos';
    END IF;
    v_debe := jsonb_build_object('cuenta_id', v_cuenta, 'lado', 'debe', 'importe', v_importe);
  END IF;

  v_reparto := socios._repartir(p_persona, v_importe, p_fecha, p_cuotas);
  v_id := nextval(pg_get_serial_sequence('socios.cobros', 'id'));
  v_asiento := contabilidad._asiento_automatico(p_fecha,
    'Cobro de cuotas — ' || socios._nombre(p_persona) || coalesce(' (' || btrim(p_referencia) || ')', ''),
    'cobro_socio', v_id::text,
    jsonb_build_array(v_debe) || socios._lineas_haber(v_reparto, v_importe, NULL));

  INSERT INTO socios.cobros (id, persona_id, fecha, medio, cuenta_id, disciplina_id, importe, referencia, asiento_id)
  OVERRIDING SYSTEM VALUE
  VALUES (v_id, p_persona, p_fecha, p_medio, v_cuenta,
          CASE WHEN p_medio = 'transferencia_disciplina' THEN p_disciplina END,
          v_importe, nullif(btrim(p_referencia), ''), v_asiento);
  FOR v_i IN SELECT * FROM jsonb_array_elements(v_reparto) LOOP
    INSERT INTO socios.aplicaciones (cobro_id, cuota_id, persona_id, importe, fecha, asiento_id)
    VALUES (v_id, (v_i ->> 'cuota_id')::bigint, p_persona, (v_i ->> 'importe')::numeric, p_fecha, v_asiento);
  END LOOP;
  RETURN v_id;
END;
$$;

-- Anula un cobro: contra-asiento y sus aplicaciones caen. Si parte de su
-- saldo a favor ya se aplicó a cuotas posteriores, esas aplicaciones se
-- revierten también (su asiento entero).
CREATE FUNCTION socios._anular_aplicaciones_externas(p_cobros bigint[], p_motivo text, p_fecha date) RETURNS void
LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE
  v_asiento uuid;
BEGIN
  FOR v_asiento IN
    SELECT DISTINCT a.asiento_id FROM socios.aplicaciones a JOIN socios.cobros b ON b.id = a.cobro_id
    WHERE a.cobro_id = ANY (p_cobros) AND NOT a.anulada AND a.asiento_id <> b.asiento_id
  LOOP
    PERFORM contabilidad._revertir(v_asiento, p_motivo, p_fecha);
    UPDATE socios.aplicaciones SET anulada = true WHERE asiento_id = v_asiento AND NOT anulada;
  END LOOP;
END;
$$;

CREATE FUNCTION socios.anular_cobro(p_cobro bigint, p_motivo text, p_fecha date DEFAULT NULL) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_c socios.cobros;
  v_fecha date := coalesce(p_fecha, contabilidad._hoy());
  v_otros integer[];
BEGIN
  PERFORM socios._exigir_tesoreria();
  IF nullif(btrim(p_motivo), '') IS NULL THEN
    RAISE EXCEPTION 'Indicá el motivo';
  END IF;
  SELECT * INTO v_c FROM socios.cobros WHERE id = p_cobro FOR UPDATE;
  IF v_c.id IS NULL OR v_c.estado <> 'vigente' THEN
    RAISE EXCEPTION 'El cobro no existe o ya está anulado';
  END IF;
  IF v_c.medio = 'debito_visa' THEN
    RAISE EXCEPTION 'Los cobros del débito se anulan con su liquidación';
  END IF;
  PERFORM socios._anular_aplicaciones_externas(ARRAY[p_cobro], p_motivo, v_fecha);
  PERFORM contabilidad._revertir(v_c.asiento_id, p_motivo, v_fecha);
  UPDATE socios.aplicaciones SET anulada = true WHERE cobro_id = p_cobro AND NOT anulada;
  UPDATE socios.cobros SET estado = 'anulado', motivo_anulacion = btrim(p_motivo),
         anulado_por = contabilidad._usuario(), anulado_at = now()
  WHERE id = p_cobro;
  -- Otros cobros de la persona con saldo a favor pueden cubrir lo que quedó.
  PERFORM socios._aplicar_saldo_a_favor(v_c.persona_id, v_fecha);
END;
$$;

-- ------------------------------------------------------------
-- Notas de crédito
-- ------------------------------------------------------------
-- p_cuotas: [{cuota_id, importe?}] (sin importe: todo el saldo).
--   Debe ingreso de la cuota (con su centro) / Haber cuota a cobrar
CREATE FUNCTION socios._registrar_credito(
  p_persona integer, p_fecha date, p_tipo text, p_motivo text, p_cuotas jsonb
) RETURNS bigint
LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE
  v_id bigint;
  v_e jsonb;
  v_c socios.cuotas;
  v_imp numeric;
  v_items jsonb := '[]';
  v_total numeric := 0;
  v_asiento uuid;
  v_lineas jsonb;
BEGIN
  IF nullif(btrim(p_motivo), '') IS NULL THEN
    RAISE EXCEPTION 'Indicá el motivo';
  END IF;
  IF p_tipo NOT IN ('baja', 'anulacion', 'bonificacion') THEN
    RAISE EXCEPTION 'Tipo de nota de crédito inválido';
  END IF;
  FOR v_e IN SELECT * FROM jsonb_array_elements(coalesce(p_cuotas, '[]')) LOOP
    SELECT * INTO v_c FROM socios.cuotas WHERE id = (v_e ->> 'cuota_id')::bigint;
    IF v_c.id IS NULL OR v_c.persona_id <> p_persona OR v_c.estado <> 'emitida' THEN
      RAISE EXCEPTION 'Cuota inválida para esta persona';
    END IF;
    IF v_c.fecha_emision > p_fecha THEN
      RAISE EXCEPTION 'La cuota % se emitió después de la nota de crédito', v_c.concepto;
    END IF;
    v_imp := round(coalesce((v_e ->> 'importe')::numeric, socios._saldo_cuota(v_c.id)), 2);
    CONTINUE WHEN v_imp <= 0;
    v_items := v_items || jsonb_build_object('cuota_id', v_c.id, 'importe', v_imp,
      'cuenta_cobrar_id', v_c.cuenta_cobrar_id, 'cuenta_ingreso_id', v_c.cuenta_ingreso_id,
      'centro_costo_id', v_c.centro_costo_id);
    v_total := v_total + v_imp;
  END LOOP;
  IF v_total = 0 THEN
    RAISE EXCEPTION 'No hay saldo para acreditar';
  END IF;

  SELECT jsonb_agg(l) INTO v_lineas FROM (
    SELECT jsonb_strip_nulls(jsonb_build_object('cuenta_id', (e ->> 'cuenta_ingreso_id')::uuid, 'lado', 'debe',
             'importe', sum((e ->> 'importe')::numeric), 'centro_costo_id', (e ->> 'centro_costo_id')::uuid)) AS l
    FROM jsonb_array_elements(v_items) e GROUP BY e ->> 'cuenta_ingreso_id', e ->> 'centro_costo_id'
    UNION ALL
    SELECT jsonb_build_object('cuenta_id', (e ->> 'cuenta_cobrar_id')::uuid, 'lado', 'haber',
             'importe', sum((e ->> 'importe')::numeric))
    FROM jsonb_array_elements(v_items) e GROUP BY e ->> 'cuenta_cobrar_id'
  ) x;

  v_id := nextval(pg_get_serial_sequence('socios.creditos', 'id'));
  v_asiento := contabilidad._asiento_automatico(p_fecha,
    'Nota de crédito (' || p_tipo || ') — ' || socios._nombre(p_persona) || ': ' || btrim(p_motivo),
    'credito_socio', v_id::text, v_lineas);
  INSERT INTO socios.creditos (id, persona_id, fecha, tipo, motivo, importe, asiento_id)
  OVERRIDING SYSTEM VALUE
  VALUES (v_id, p_persona, p_fecha, p_tipo, btrim(p_motivo), v_total, v_asiento);
  INSERT INTO socios.credito_aplicaciones (credito_id, cuota_id, persona_id, importe)
  SELECT v_id, (e ->> 'cuota_id')::bigint, p_persona, (e ->> 'importe')::numeric
  FROM jsonb_array_elements(v_items) e;
  RETURN v_id;
END;
$$;

CREATE FUNCTION socios.registrar_credito(
  p_persona integer, p_fecha date, p_tipo text, p_motivo text, p_cuotas jsonb
) RETURNS bigint
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  PERFORM socios._exigir_tesoreria();
  RETURN socios._registrar_credito(p_persona, p_fecha, p_tipo, p_motivo, p_cuotas);
END;
$$;

CREATE FUNCTION socios.anular_credito(p_credito bigint, p_motivo text, p_fecha date DEFAULT NULL) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_c socios.creditos;
BEGIN
  PERFORM socios._exigir_tesoreria();
  IF nullif(btrim(p_motivo), '') IS NULL THEN
    RAISE EXCEPTION 'Indicá el motivo';
  END IF;
  SELECT * INTO v_c FROM socios.creditos WHERE id = p_credito FOR UPDATE;
  IF v_c.id IS NULL OR v_c.estado <> 'vigente' THEN
    RAISE EXCEPTION 'La nota de crédito no existe o ya está anulada';
  END IF;
  PERFORM contabilidad._revertir(v_c.asiento_id, p_motivo, coalesce(p_fecha, contabilidad._hoy()));
  UPDATE socios.credito_aplicaciones SET anulada = true WHERE credito_id = p_credito AND NOT anulada;
  UPDATE socios.creditos SET estado = 'anulado', motivo_anulacion = btrim(p_motivo),
         anulado_por = contabilidad._usuario(), anulado_at = now()
  WHERE id = p_credito;
END;
$$;

-- Anula un lote entero (error de emisión): solo si ninguna de sus cuotas
-- tiene cobros ni créditos vivos. Contra-asiento y cuotas anuladas.
CREATE FUNCTION socios.anular_lote(p_lote bigint, p_motivo text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_l socios.lotes;
BEGIN
  PERFORM socios._exigir_tesoreria();
  IF nullif(btrim(p_motivo), '') IS NULL THEN
    RAISE EXCEPTION 'Indicá el motivo';
  END IF;
  SELECT * INTO v_l FROM socios.lotes WHERE id = p_lote FOR UPDATE;
  IF v_l.id IS NULL OR v_l.estado <> 'emitido' THEN
    RAISE EXCEPTION 'El lote no existe o ya está anulado';
  END IF;
  IF EXISTS (SELECT 1 FROM socios.aplicaciones a JOIN socios.cuotas c ON c.id = a.cuota_id
             WHERE c.lote_id = p_lote AND NOT a.anulada)
     OR EXISTS (SELECT 1 FROM socios.credito_aplicaciones a JOIN socios.cuotas c ON c.id = a.cuota_id
                WHERE c.lote_id = p_lote AND NOT a.anulada) THEN
    RAISE EXCEPTION 'Hay cuotas del lote con cobros o notas de crédito: anulalas primero o acreditá las cuotas';
  END IF;
  PERFORM contabilidad._revertir(v_l.asiento_id, p_motivo, greatest(v_l.fecha_emision, contabilidad._hoy()));
  UPDATE socios.cuotas SET estado = 'anulada' WHERE lote_id = p_lote;
  UPDATE socios.lotes SET estado = 'anulado', motivo_anulacion = btrim(p_motivo),
         anulado_por = contabilidad._usuario(), anulado_at = now()
  WHERE id = p_lote;
END;
$$;

-- Anula una cuota suelta o un cargo (con su propio asiento) sin cobros.
CREATE FUNCTION socios.anular_cuota(p_cuota bigint, p_motivo text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_c socios.cuotas;
BEGIN
  PERFORM socios._exigir_tesoreria();
  IF nullif(btrim(p_motivo), '') IS NULL THEN
    RAISE EXCEPTION 'Indicá el motivo';
  END IF;
  SELECT * INTO v_c FROM socios.cuotas WHERE id = p_cuota FOR UPDATE;
  IF v_c.id IS NULL OR v_c.estado <> 'emitida' THEN
    RAISE EXCEPTION 'La cuota no existe o ya está anulada';
  END IF;
  IF v_c.lote_id IS NOT NULL THEN
    RAISE EXCEPTION 'La cuota es de un lote: acreditala con una nota de crédito o anulá el lote';
  END IF;
  IF socios._saldo_cuota(p_cuota) <> v_c.importe THEN
    RAISE EXCEPTION 'La cuota tiene cobros o notas de crédito';
  END IF;
  PERFORM contabilidad._revertir(v_c.asiento_id, p_motivo, greatest(v_c.fecha_emision, contabilidad._hoy()));
  UPDATE socios.cuotas SET estado = 'anulada' WHERE id = p_cuota;
END;
$$;

-- Baja con tratamiento de la deuda: las cuotas de períodos posteriores a
-- la baja se acreditan siempre (en la anual, la parte posterior); con
-- p_anular_deuda (por defecto, lo configurado) también el resto del saldo.
CREATE FUNCTION socios.dar_baja(
  p_persona integer, p_hasta date, p_motivo smallint, p_notas text DEFAULT NULL, p_anular_deuda boolean DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_anular boolean := coalesce(p_anular_deuda, (SELECT baja_con_deuda = 'anular' FROM socios.config));
  v_items jsonb;
  v_fecha date := greatest(p_hasta, contabilidad._hoy());
BEGIN
  PERFORM socios._exigir_secretaria();
  IF NOT EXISTS (SELECT 1 FROM socios.membresias WHERE persona_id = p_persona AND hasta IS NULL) THEN
    RAISE EXCEPTION 'La persona no es socia';
  END IF;

  SELECT jsonb_agg(jsonb_build_object('cuota_id', id, 'importe', a_acreditar)) INTO v_items FROM (
    SELECT c.id,
      least(s.saldo, CASE
        WHEN v_anular THEN s.saldo
        WHEN c.periodo_desde > p_hasta THEN s.saldo
        WHEN c.periodicidad = 'anual' AND c.periodo_hasta > p_hasta
          THEN round(c.importe * ((extract(year FROM c.periodo_hasta) - extract(year FROM p_hasta)) * 12
                                  + extract(month FROM c.periodo_hasta) - extract(month FROM p_hasta))
                     / ((extract(year FROM c.periodo_hasta) - extract(year FROM c.periodo_desde)) * 12
                        + extract(month FROM c.periodo_hasta) - extract(month FROM c.periodo_desde) + 1), 2)
        ELSE 0 END) AS a_acreditar
    FROM socios.cuotas c JOIN socios.cuotas_saldo s ON s.id = c.id
    WHERE c.persona_id = p_persona AND c.estado = 'emitida' AND s.saldo > 0
  ) x WHERE a_acreditar > 0;

  IF v_items IS NOT NULL THEN
    PERFORM socios._registrar_credito(p_persona, v_fecha, 'baja',
      CASE WHEN v_anular THEN 'Baja: se anula la deuda' ELSE 'Baja: cuotas posteriores a la baja' END, v_items);
  END IF;
  PERFORM socios.baja_socio(p_persona, p_hasta, p_motivo, p_notas);
END;
$$;

-- ------------------------------------------------------------
-- Débito automático Visa
-- ------------------------------------------------------------
-- Aplica la liquidación del débito de las cuotas de p_periodo:
-- p_cobrados [{persona_id, importe, referencia?}], p_rechazados
-- [{persona_id?, documento?, importe, motivo?}]. Todo o nada; cada
-- persona una vez por liquidación y período. Un asiento:
--   Debe banco (neto) + Debe comisión (por centro: club y disciplinas)
--   Haber cuotas a cobrar + Haber saldo a favor
CREATE FUNCTION socios.aplicar_liquidacion_visa(
  p_periodo date, p_fecha date, p_comision numeric, p_cobrados jsonb, p_rechazados jsonb DEFAULT '[]',
  p_cuenta uuid DEFAULT NULL, p_archivo text DEFAULT NULL
) RETURNS bigint
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_ini date := date_trunc('month', p_periodo)::date;
  v_cuenta uuid := coalesce(p_cuenta, contabilidad.cuenta_para('socios', 'banco_cobros'));
  v_cfg socios.config;
  v_id bigint;
  v_bruto numeric;
  v_comision numeric := round(coalesce(p_comision, 0), 2);
  v_e jsonb;
  v_reparto jsonb;
  v_todos jsonb := '[]';
  v_cobros jsonb := '[]';
  v_cobro bigint;
  v_asiento uuid;
  v_lineas jsonb;
  v_resto numeric;
  r record;
BEGIN
  PERFORM socios._exigir_tesoreria();
  SELECT * INTO v_cfg FROM socios.config;
  IF EXISTS (
    SELECT 1 FROM socios.cobros b JOIN socios.liquidaciones_visa l ON l.id = b.liquidacion_visa_id
    JOIN jsonb_array_elements(p_cobrados) e ON (e ->> 'persona_id')::integer = b.persona_id
    WHERE l.periodo = v_ini AND l.estado = 'vigente' AND b.estado = 'vigente'
  ) THEN
    RAISE EXCEPTION 'Hay personas a las que ya se les aplicó el débito de %', to_char(v_ini, 'MM/YYYY');
  END IF;
  IF (SELECT count(DISTINCT e ->> 'persona_id') FROM jsonb_array_elements(p_cobrados) e)
     <> jsonb_array_length(p_cobrados) THEN
    RAISE EXCEPTION 'Hay personas repetidas en la liquidación';
  END IF;
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(p_cobrados) e
             WHERE (e ->> 'persona_id') IS NULL
                OR NOT EXISTS (SELECT 1 FROM public.padron_socios p WHERE p.id = (e ->> 'persona_id')::integer)) THEN
    RAISE EXCEPTION 'Hay débitos cobrados sin identificar a la persona';
  END IF;
  SELECT coalesce(sum(round((e ->> 'importe')::numeric, 2)), 0) INTO v_bruto FROM jsonb_array_elements(p_cobrados) e;
  IF v_bruto <= 0 THEN
    RAISE EXCEPTION 'La liquidación no tiene débitos cobrados';
  END IF;
  IF v_comision < 0 OR v_comision >= v_bruto THEN
    RAISE EXCEPTION 'La comisión no es válida';
  END IF;

  v_id := nextval(pg_get_serial_sequence('socios.liquidaciones_visa', 'id'));
  -- Reparto de cada débito sobre las cuotas de su persona
  FOR v_e IN SELECT * FROM jsonb_array_elements(p_cobrados) LOOP
    v_reparto := socios._repartir((v_e ->> 'persona_id')::integer, round((v_e ->> 'importe')::numeric, 2), p_fecha);
    v_cobros := v_cobros || jsonb_build_object('persona_id', (v_e ->> 'persona_id')::integer,
      'importe', round((v_e ->> 'importe')::numeric, 2), 'referencia', v_e ->> 'referencia', 'reparto', v_reparto);
    v_todos := v_todos || v_reparto;
  END LOOP;

  -- Comisión: proporcional a lo aplicado a cuotas de cada disciplina,
  -- por su porcentaje; el resto es del club.
  CREATE TEMP TABLE IF NOT EXISTS _comision (disciplina_id integer, importe numeric) ON COMMIT DROP;
  DELETE FROM _comision;
  IF v_comision > 0 THEN
    INSERT INTO _comision
    SELECT c.disciplina_id,
           round(v_comision * sum((e ->> 'importe')::numeric) / v_bruto
                 * coalesce((SELECT porcentaje_comision FROM socios.disciplinas_cobranza d
                             WHERE d.disciplina_id = c.disciplina_id), 100) / 100, 2)
    FROM jsonb_array_elements(v_todos) e JOIN socios.cuotas c ON c.id = (e ->> 'cuota_id')::bigint
    WHERE c.tipo = 'disciplina'
    GROUP BY c.disciplina_id;
    DELETE FROM _comision WHERE importe = 0;
    SELECT v_comision - coalesce(sum(importe), 0) INTO v_resto FROM _comision;
    IF v_resto > 0 THEN
      INSERT INTO _comision VALUES (NULL, v_resto);
    END IF;
  END IF;

  SELECT jsonb_agg(l) INTO v_lineas FROM (
    SELECT jsonb_build_object('cuenta_id', v_cuenta, 'lado', 'debe', 'importe', v_bruto - v_comision,
                              'descripcion', 'Acreditación débito Visa') AS l
    UNION ALL
    SELECT jsonb_build_object('cuenta_id', contabilidad.cuenta_para('socios', 'comision_cobranza'), 'lado', 'debe',
             'importe', k.importe,
             'centro_costo_id', CASE WHEN k.disciplina_id IS NULL THEN v_cfg.centro_club_id
                                     ELSE socios._centro_disciplina(k.disciplina_id) END)
    FROM _comision k
  ) x;
  v_lineas := v_lineas || socios._lineas_haber(v_todos, v_bruto, NULL);

  v_asiento := contabilidad._asiento_automatico(p_fecha, 'Débito automático Visa ' || to_char(v_ini, 'MM/YYYY'),
                                                'liquidacion_visa', v_id::text, v_lineas);
  INSERT INTO socios.liquidaciones_visa (id, periodo, fecha, cuenta_id, bruto, comision, archivo, asiento_id)
  OVERRIDING SYSTEM VALUE
  VALUES (v_id, v_ini, p_fecha, v_cuenta, v_bruto, v_comision, nullif(btrim(p_archivo), ''), v_asiento);
  INSERT INTO socios.liquidacion_visa_comisiones (liquidacion_visa_id, disciplina_id, importe)
  SELECT v_id, disciplina_id, importe FROM _comision;

  FOR v_e IN SELECT * FROM jsonb_array_elements(v_cobros) LOOP
    INSERT INTO socios.cobros (persona_id, fecha, medio, cuenta_id, importe, referencia, liquidacion_visa_id, asiento_id)
    VALUES ((v_e ->> 'persona_id')::integer, p_fecha, 'debito_visa', v_cuenta, (v_e ->> 'importe')::numeric,
            coalesce(nullif(btrim(v_e ->> 'referencia'), ''), 'Visa ' || to_char(v_ini, 'MM/YYYY')), v_id, v_asiento)
    RETURNING id INTO v_cobro;
    INSERT INTO socios.aplicaciones (cobro_id, cuota_id, persona_id, importe, fecha, asiento_id)
    SELECT v_cobro, (a ->> 'cuota_id')::bigint, (v_e ->> 'persona_id')::integer, (a ->> 'importe')::numeric,
           p_fecha, v_asiento
    FROM jsonb_array_elements(v_e -> 'reparto') a;
  END LOOP;

  INSERT INTO socios.liquidacion_visa_rechazos (liquidacion_visa_id, persona_id, documento, importe, motivo)
  SELECT v_id, (e ->> 'persona_id')::integer, nullif(btrim(e ->> 'documento'), ''), round((e ->> 'importe')::numeric, 2),
         nullif(btrim(e ->> 'motivo'), '')
  FROM jsonb_array_elements(coalesce(p_rechazados, '[]')) e;
  RETURN v_id;
END;
$$;

CREATE FUNCTION socios.anular_liquidacion_visa(p_liquidacion bigint, p_motivo text, p_fecha date DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_l socios.liquidaciones_visa;
  v_fecha date := coalesce(p_fecha, contabilidad._hoy());
  v_cobros bigint[];
BEGIN
  PERFORM socios._exigir_tesoreria();
  IF nullif(btrim(p_motivo), '') IS NULL THEN
    RAISE EXCEPTION 'Indicá el motivo';
  END IF;
  SELECT * INTO v_l FROM socios.liquidaciones_visa WHERE id = p_liquidacion FOR UPDATE;
  IF v_l.id IS NULL OR v_l.estado <> 'vigente' THEN
    RAISE EXCEPTION 'La liquidación no existe o ya está anulada';
  END IF;
  IF EXISTS (SELECT 1 FROM socios.liquidaciones_disciplina ld
             WHERE ld.estado = 'vigente' AND v_l.fecha BETWEEN ld.desde AND ld.hasta) THEN
    RAISE EXCEPTION 'Ya se liquidó a disciplinas el período de esta acreditación: anulá esa liquidación primero';
  END IF;
  SELECT array_agg(id) INTO v_cobros FROM socios.cobros WHERE liquidacion_visa_id = p_liquidacion AND estado = 'vigente';
  PERFORM socios._anular_aplicaciones_externas(v_cobros, p_motivo, v_fecha);
  PERFORM contabilidad._revertir(v_l.asiento_id, p_motivo, v_fecha);
  UPDATE socios.aplicaciones SET anulada = true WHERE cobro_id = ANY (v_cobros) AND NOT anulada;
  UPDATE socios.cobros SET estado = 'anulado', motivo_anulacion = btrim(p_motivo),
         anulado_por = contabilidad._usuario(), anulado_at = now()
  WHERE id = ANY (v_cobros);
  UPDATE socios.liquidaciones_visa SET estado = 'anulada', motivo_anulacion = btrim(p_motivo),
         anulado_por = contabilidad._usuario(), anulado_at = now()
  WHERE id = p_liquidacion;
END;
$$;

-- ------------------------------------------------------------
-- Liquidación a las disciplinas
-- ------------------------------------------------------------
-- Lo cobrado de cuotas de la disciplina en el rango (por fecha de la
-- aplicación: cobros y saldos a favor aplicados), su parte de la comisión
-- del débito acreditado en el rango, y su deuda con el club (cobros que
-- recibió en su cuenta, pedidos de tienda a cuenta corriente).
CREATE FUNCTION socios.previsualizar_liquidacion_disciplina(p_disciplina integer, p_desde date, p_hasta date)
RETURNS TABLE (cobrado numeric, comision numeric, importe numeric, deuda_disciplina numeric, ya_liquidado boolean)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  PERFORM socios._exigir(ARRAY['tesorero', 'comision_fiscal']);
  SELECT coalesce(sum(a.importe), 0) INTO cobrado
  FROM socios.aplicaciones a JOIN socios.cuotas c ON c.id = a.cuota_id
  WHERE NOT a.anulada AND c.tipo = 'disciplina' AND c.disciplina_id = p_disciplina
    AND a.fecha BETWEEN p_desde AND p_hasta;
  SELECT coalesce(sum(k.importe), 0) INTO comision
  FROM socios.liquidacion_visa_comisiones k JOIN socios.liquidaciones_visa l ON l.id = k.liquidacion_visa_id
  WHERE l.estado = 'vigente' AND k.disciplina_id = p_disciplina AND l.fecha BETWEEN p_desde AND p_hasta;
  importe := cobrado - comision;
  SELECT coalesce(sum(l.debe - l.haber), 0) INTO deuda_disciplina
  FROM contabilidad.lineas l JOIN contabilidad.asientos a ON a.id = l.asiento_id
  WHERE a.estado = 'confirmado' AND l.disciplina_id = p_disciplina
    AND l.cuenta_id = contabilidad.cuenta_para('socios', 'disciplinas');
  ya_liquidado := EXISTS (SELECT 1 FROM socios.liquidaciones_disciplina
                          WHERE disciplina_id = p_disciplina AND estado = 'vigente'
                            AND daterange(desde, hasta, '[]') && daterange(p_desde, p_hasta, '[]'));
  RETURN NEXT;
END;
$$;

--   Debe transferencias a disciplinas (centro de la disciplina)
--   Haber deuda de la disciplina (lo compensado) / Haber banco (lo transferido)
CREATE FUNCTION socios.liquidar_disciplina(
  p_disciplina integer, p_desde date, p_hasta date, p_fecha date, p_compensar numeric DEFAULT 0,
  p_cuenta uuid DEFAULT NULL, p_notas text DEFAULT NULL
) RETURNS bigint
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_p record;
  v_comp numeric := round(coalesce(p_compensar, 0), 2);
  v_transf numeric;
  v_cuenta uuid;
  v_id bigint;
  v_asiento uuid;
  v_nombre text;
BEGIN
  PERFORM socios._exigir_tesoreria();
  PERFORM pg_advisory_xact_lock(hashtext('socios.liquidacion_disciplina'), p_disciplina);
  SELECT * INTO v_p FROM socios.previsualizar_liquidacion_disciplina(p_disciplina, p_desde, p_hasta);
  IF v_p.ya_liquidado THEN
    RAISE EXCEPTION 'Ese período ya se liquidó (total o parcialmente) a la disciplina';
  END IF;
  IF v_p.importe <= 0 THEN
    RAISE EXCEPTION 'No hay nada para liquidar en el período';
  END IF;
  IF v_comp < 0 OR v_comp > v_p.importe OR v_comp > greatest(v_p.deuda_disciplina, 0) THEN
    RAISE EXCEPTION 'Lo compensado no puede superar lo liquidado ni la deuda de la disciplina (%)',
      greatest(v_p.deuda_disciplina, 0);
  END IF;
  v_transf := v_p.importe - v_comp;
  IF v_transf > 0 THEN
    v_cuenta := coalesce(p_cuenta, contabilidad.cuenta_para('socios', 'banco_cobros'));
  END IF;
  SELECT nombre INTO v_nombre FROM public.disciplinas WHERE id = p_disciplina;

  v_id := nextval(pg_get_serial_sequence('socios.liquidaciones_disciplina', 'id'));
  v_asiento := contabilidad._asiento_automatico(p_fecha,
    'Liquidación de cuotas a ' || v_nombre || ' ' || to_char(p_desde, 'DD/MM') || '–' || to_char(p_hasta, 'DD/MM/YYYY'),
    'liquidacion_disciplina', v_id::text,
    jsonb_build_array(jsonb_build_object('cuenta_id', contabilidad.cuenta_para('socios', 'liquidacion_disciplinas'),
                                         'lado', 'debe', 'importe', v_p.importe,
                                         'centro_costo_id', socios._centro_disciplina(p_disciplina)))
    || CASE WHEN v_comp > 0 THEN jsonb_build_array(jsonb_build_object(
         'cuenta_id', contabilidad.cuenta_para('socios', 'disciplinas'), 'lado', 'haber', 'importe', v_comp,
         'disciplina_id', p_disciplina, 'descripcion', 'Compensación de la deuda de la disciplina')) ELSE '[]' END
    || CASE WHEN v_transf > 0 THEN jsonb_build_array(jsonb_build_object(
         'cuenta_id', v_cuenta, 'lado', 'haber', 'importe', v_transf, 'descripcion', 'Transferencia a ' || v_nombre))
       ELSE '[]' END);

  INSERT INTO socios.liquidaciones_disciplina (id, disciplina_id, desde, hasta, fecha, cobrado, comision, importe,
                                               compensado, transferido, cuenta_id, notas, asiento_id)
  OVERRIDING SYSTEM VALUE
  VALUES (v_id, p_disciplina, p_desde, p_hasta, p_fecha, v_p.cobrado, v_p.comision, v_p.importe, v_comp, v_transf,
          v_cuenta, nullif(btrim(p_notas), ''), v_asiento);
  RETURN v_id;
END;
$$;

CREATE FUNCTION socios.anular_liquidacion_disciplina(p_liquidacion bigint, p_motivo text, p_fecha date DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_l socios.liquidaciones_disciplina;
BEGIN
  PERFORM socios._exigir_tesoreria();
  IF nullif(btrim(p_motivo), '') IS NULL THEN
    RAISE EXCEPTION 'Indicá el motivo';
  END IF;
  SELECT * INTO v_l FROM socios.liquidaciones_disciplina WHERE id = p_liquidacion FOR UPDATE;
  IF v_l.id IS NULL OR v_l.estado <> 'vigente' THEN
    RAISE EXCEPTION 'La liquidación no existe o ya está anulada';
  END IF;
  PERFORM contabilidad._revertir(v_l.asiento_id, p_motivo, coalesce(p_fecha, contabilidad._hoy()));
  UPDATE socios.liquidaciones_disciplina SET estado = 'anulada', motivo_anulacion = btrim(p_motivo),
         anulado_por = contabilidad._usuario(), anulado_at = now()
  WHERE id = p_liquidacion;
END;
$$;

-- Lo cobrado y aplicado después de liquidar un período (cobros con
-- fecha vieja) no se pierde: queda para el período en que se registra.
-- Por eso la liquidación usa la fecha de la aplicación, y un cobro no
-- puede caer en un período ya liquidado de su disciplina.
CREATE FUNCTION socios._aplicacion_no_liquidada() RETURNS trigger
LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE
  v_disc integer;
BEGIN
  SELECT disciplina_id INTO v_disc FROM socios.cuotas WHERE id = NEW.cuota_id AND tipo = 'disciplina';
  IF v_disc IS NOT NULL AND EXISTS (
    SELECT 1 FROM socios.liquidaciones_disciplina
    WHERE disciplina_id = v_disc AND estado = 'vigente' AND NEW.fecha BETWEEN desde AND hasta
  ) THEN
    RAISE EXCEPTION 'El % ya se liquidó a la disciplina: registrá el cobro con fecha posterior', to_char(NEW.fecha, 'DD/MM/YYYY');
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER aplicaciones_no_liquidada BEFORE INSERT ON socios.aplicaciones
  FOR EACH ROW EXECUTE FUNCTION socios._aplicacion_no_liquidada();

-- ------------------------------------------------------------
-- Consultas
-- ------------------------------------------------------------
-- Situación de cada persona a una fecha: deuda vencida, cuotas vencidas
-- impagas, saldo a favor y si está al día (tolerancia según el medio).
CREATE FUNCTION socios.situacion(p_fecha date DEFAULT NULL)
RETURNS TABLE (
  persona_id integer, es_socio boolean, medio text, cuotas_vencidas integer, deuda_vencida numeric,
  deuda_total numeric, saldo_a_favor numeric, al_dia boolean
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_fecha date := coalesce(p_fecha, contabilidad._hoy());
  v_cfg socios.config;
BEGIN
  PERFORM socios._exigir(ARRAY['secretaria', 'tesorero', 'comision_fiscal']);
  SELECT * INTO v_cfg FROM socios.config;
  RETURN QUERY
  WITH d AS (
    SELECT s.persona_id,
           count(*) FILTER (WHERE s.fecha_vencimiento < v_fecha AND s.saldo > 0)::integer AS vencidas,
           coalesce(sum(s.saldo) FILTER (WHERE s.fecha_vencimiento < v_fecha), 0) AS deuda_vencida,
           coalesce(sum(s.saldo), 0) AS deuda_total
    FROM socios.cuotas_saldo s WHERE s.estado = 'emitida' AND s.fecha_emision <= v_fecha
    GROUP BY s.persona_id
  ), f AS (
    SELECT b.persona_id, sum(b.saldo_a_favor) AS a_favor FROM socios.cobros_saldo b
    WHERE b.estado = 'vigente' GROUP BY b.persona_id
  ), p AS (
    SELECT DISTINCT m.persona_id FROM socios.membresias m
  )
  SELECT p.persona_id, socios.es_socio_en(p.persona_id, v_fecha),
         (SELECT mc.medio FROM socios.medios_cobro mc WHERE mc.persona_id = p.persona_id
            AND mc.desde <= v_fecha AND (mc.hasta IS NULL OR mc.hasta >= v_fecha)),
         coalesce(d.vencidas, 0), coalesce(d.deuda_vencida, 0), coalesce(d.deuda_total, 0), coalesce(f.a_favor, 0),
         coalesce(d.vencidas, 0) <= CASE WHEN (SELECT mc.medio FROM socios.medios_cobro mc
                                               WHERE mc.persona_id = p.persona_id AND mc.desde <= v_fecha
                                                 AND (mc.hasta IS NULL OR mc.hasta >= v_fecha)) = 'debito_visa'
                                          THEN v_cfg.tolerancia_debito ELSE v_cfg.tolerancia_cuotas END
  FROM p LEFT JOIN d ON d.persona_id = p.persona_id LEFT JOIN f ON f.persona_id = p.persona_id;
END;
$$;

-- Estado de cuenta: cuotas (cargo), cobros, notas de crédito y
-- aplicaciones de saldo a favor, con saldo acumulado (+ debe la persona).
CREATE FUNCTION socios.estado_cuenta(p_persona integer)
RETURNS TABLE (fecha date, tipo text, documento_id bigint, concepto text, cargo numeric, abono numeric, saldo numeric)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NOT socios.puede_leer() AND NOT EXISTS (SELECT 1 FROM public.padron_socios
                                              WHERE id = p_persona AND perfil_id = auth.uid()) THEN
    PERFORM socios._exigir(ARRAY['secretaria', 'tesorero', 'comision_fiscal']);
  END IF;
  RETURN QUERY
  WITH m AS (
    SELECT c.fecha_emision AS f, 'cuota'::text AS t, c.id AS doc, c.concepto AS con, c.importe AS cargo, 0::numeric AS abono, 1 AS o
    FROM socios.cuotas c WHERE c.persona_id = p_persona AND c.estado = 'emitida'
    UNION ALL
    SELECT b.fecha, 'cobro', b.id,
           CASE b.medio WHEN 'debito_visa' THEN 'Débito Visa' WHEN 'transferencia_club' THEN 'Transferencia'
                        WHEN 'transferencia_disciplina' THEN 'Pago en la cuenta de la disciplina' ELSE 'Efectivo' END
             || coalesce(' — ' || b.referencia, ''),
           0, b.importe, 2
    FROM socios.cobros b WHERE b.persona_id = p_persona AND b.estado = 'vigente'
    UNION ALL
    SELECT n.fecha, 'credito', n.id, 'Nota de crédito: ' || n.motivo, 0, n.importe, 3
    FROM socios.creditos n WHERE n.persona_id = p_persona AND n.estado = 'vigente'
  )
  SELECT m.f, m.t, m.doc, m.con, m.cargo, m.abono,
         sum(m.cargo - m.abono) OVER (ORDER BY m.f, m.o, m.doc ROWS UNBOUNDED PRECEDING)
  FROM m ORDER BY m.f, m.o, m.doc;
END;
$$;

-- Control: lo que dicen las cuotas contra lo que dice la contabilidad.
CREATE FUNCTION socios.control_contable()
RETURNS TABLE (concepto text, segun_socios numeric, segun_contabilidad numeric, diferencia numeric)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  PERFORM socios._exigir(ARRAY['tesorero', 'comision_fiscal']);
  RETURN QUERY
  WITH cuentas AS (
    SELECT 'Cuotas sociales y cargos a cobrar'::text AS concepto, contabilidad.cuenta_para('socios', 'cuotas_sociales_cobrar') AS id,
           (SELECT coalesce(sum(saldo), 0) FROM socios.cuotas_saldo WHERE estado = 'emitida' AND tipo <> 'disciplina') AS socios_
    UNION ALL
    SELECT 'Cuotas de disciplina a cobrar', contabilidad.cuenta_para('socios', 'cuotas_disciplina_cobrar'),
           (SELECT coalesce(sum(saldo), 0) FROM socios.cuotas_saldo WHERE estado = 'emitida' AND tipo = 'disciplina')
    UNION ALL
    SELECT 'Saldo a favor de socios', contabilidad.cuenta_para('socios', 'anticipos'),
           (SELECT -coalesce(sum(saldo_a_favor), 0) FROM socios.cobros_saldo WHERE estado = 'vigente')
  )
  SELECT c.concepto, abs(c.socios_),
         abs((SELECT coalesce(sum(l.debe - l.haber), 0) FROM contabilidad.lineas l
              JOIN contabilidad.asientos a ON a.id = l.asiento_id
              WHERE a.estado = 'confirmado' AND l.cuenta_id = c.id AND a.tipo NOT IN ('cierre', 'refundicion'))),
         c.socios_ - (SELECT coalesce(sum(l.debe - l.haber), 0) FROM contabilidad.lineas l
                      JOIN contabilidad.asientos a ON a.id = l.asiento_id
                      WHERE a.estado = 'confirmado' AND l.cuenta_id = c.id AND a.tipo NOT IN ('cierre', 'refundicion'))
  FROM cuentas c;
END;
$$;

-- ------------------------------------------------------------
-- RLS, auditoría y permisos
-- ------------------------------------------------------------
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['disciplinas_cobranza', 'liquidaciones_visa', 'cobros', 'aplicaciones', 'creditos',
                           'credito_aplicaciones', 'liquidacion_visa_comisiones', 'liquidacion_visa_rechazos',
                           'liquidaciones_disciplina'] LOOP
    EXECUTE format('ALTER TABLE socios.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('CREATE POLICY %I ON socios.%I FOR SELECT TO authenticated USING (socios.puede_leer())',
                   t || '_lectura', t);
    EXECUTE format('REVOKE ALL ON socios.%I FROM PUBLIC, anon, authenticated', t);
    EXECUTE format('GRANT SELECT ON socios.%I TO authenticated, service_role', t);
  END LOOP;
  FOREACH t IN ARRAY ARRAY['disciplinas_cobranza', 'liquidaciones_visa', 'cobros', 'creditos',
                           'liquidaciones_disciplina'] LOOP
    EXECUTE format('CREATE TRIGGER %I AFTER INSERT OR UPDATE OR DELETE ON socios.%I
                    FOR EACH ROW EXECUTE FUNCTION contabilidad._auditar()', t || '_auditoria', t);
  END LOOP;
END $$;
CREATE TRIGGER cuotas_auditoria AFTER INSERT OR UPDATE OR DELETE ON socios.cuotas
  FOR EACH ROW EXECUTE FUNCTION contabilidad._auditar();

CREATE POLICY disciplinas_cobranza_escritura ON socios.disciplinas_cobranza FOR ALL TO authenticated
  USING (contabilidad._tiene_rol(ARRAY['super_admin', 'tesorero']))
  WITH CHECK (contabilidad._tiene_rol(ARRAY['super_admin', 'tesorero']));
GRANT INSERT, UPDATE, DELETE ON socios.disciplinas_cobranza TO authenticated;
GRANT SELECT ON socios.cuotas_saldo, socios.cobros_saldo TO authenticated, service_role;

-- El socio ve sus propias cuotas y cobros (Mi cuenta)
CREATE POLICY cuotas_propias ON socios.cuotas FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.padron_socios p WHERE p.id = persona_id AND p.perfil_id = auth.uid()));
CREATE POLICY cobros_propios ON socios.cobros FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.padron_socios p WHERE p.id = persona_id AND p.perfil_id = auth.uid()));
CREATE POLICY aplicaciones_propias ON socios.aplicaciones FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.padron_socios p WHERE p.id = persona_id AND p.perfil_id = auth.uid()));
CREATE POLICY credito_aplicaciones_propias ON socios.credito_aplicaciones FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.padron_socios p WHERE p.id = persona_id AND p.perfil_id = auth.uid()));

REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA socios FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION socios._saldo_cuota(bigint), socios._aplicacion_valida(), socios._documento_valido(),
  socios._repartir(integer, numeric, date, bigint[]), socios._lineas_haber(jsonb, numeric, text),
  socios._nombre(integer), socios._aplicar_saldo_a_favor(integer, date), socios._tras_emitir_cuota(),
  socios._anular_aplicaciones_externas(bigint[], text, date), socios._aplicacion_no_liquidada(),
  socios._registrar_credito(integer, date, text, text, jsonb)
  FROM authenticated;
GRANT EXECUTE ON FUNCTION socios.registrar_cobro(integer, date, text, numeric, uuid, integer, text, bigint[]),
  socios.anular_cobro(bigint, text, date), socios.registrar_credito(integer, date, text, text, jsonb),
  socios.anular_credito(bigint, text, date), socios.anular_lote(bigint, text), socios.anular_cuota(bigint, text),
  socios.dar_baja(integer, date, smallint, text, boolean),
  socios.aplicar_liquidacion_visa(date, date, numeric, jsonb, jsonb, uuid, text),
  socios.anular_liquidacion_visa(bigint, text, date),
  socios.previsualizar_liquidacion_disciplina(integer, date, date),
  socios.liquidar_disciplina(integer, date, date, date, numeric, uuid, text),
  socios.anular_liquidacion_disciplina(bigint, text, date),
  socios.situacion(date), socios.estado_cuenta(integer), socios.control_contable()
  TO authenticated;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA socios TO service_role;
