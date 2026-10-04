-- ============================================================
-- Disciplinas: cuenta corriente, pagos al club y planes de pago
--
-- * Cuenta corriente de cada disciplina = la cuenta contable "Fondos en
--   poder de disciplinas" con su auxiliar: compras de la tienda a cuenta,
--   cuotas que los socios pagaron en la cuenta de la disciplina, lo que se
--   compensa en las liquidaciones, los pagos de la disciplina al club y
--   las anulaciones. Saldo deudor = lo que la disciplina le debe al club.
-- * Pago de la disciplina al club (transferencia o efectivo): un asiento
--   Debe banco/caja / Haber fondos en poder de la disciplina.
-- * Planes de pago: el tesorero arma cuotas con vencimiento sobre uno o
--   más pedidos de la disciplina. El plan no genera asientos (la deuda ya
--   está registrada desde la venta): ordena cómo se paga. Los pagos y lo
--   compensado en las liquidaciones se imputan a las cuotas, de la más
--   vieja a la más nueva; el saldo de cada cuota se calcula. Un pedido está
--   en un solo plan vigente.
-- ============================================================

CREATE TABLE socios.cobros_disciplina (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  disciplina_id integer NOT NULL REFERENCES public.disciplinas (id) ON DELETE RESTRICT,
  fecha date NOT NULL,
  importe numeric(14, 2) NOT NULL CHECK (importe > 0),
  cuenta_id uuid NOT NULL REFERENCES contabilidad.cuentas (id) ON DELETE RESTRICT,
  referencia text,
  notas text,
  asiento_id uuid NOT NULL REFERENCES contabilidad.asientos (id) ON DELETE RESTRICT,
  estado text NOT NULL DEFAULT 'vigente' CHECK (estado IN ('vigente', 'anulado')),
  motivo_anulacion text,
  anulado_por uuid,
  anulado_at timestamptz,
  creado_por uuid DEFAULT contabilidad._usuario(),
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((estado = 'anulado') = (anulado_at IS NOT NULL AND motivo_anulacion IS NOT NULL))
);
CREATE INDEX cobros_disciplina_disciplina_idx ON socios.cobros_disciplina (disciplina_id, fecha);
CREATE UNIQUE INDEX cobros_disciplina_referencia ON socios.cobros_disciplina (disciplina_id, lower(btrim(referencia)))
  WHERE referencia IS NOT NULL AND estado = 'vigente';

CREATE TABLE socios.planes_pago (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  disciplina_id integer NOT NULL REFERENCES public.disciplinas (id) ON DELETE RESTRICT,
  descripcion text NOT NULL CHECK (length(btrim(descripcion)) > 0),
  importe_total numeric(14, 2) NOT NULL CHECK (importe_total > 0),
  notas text,
  estado text NOT NULL DEFAULT 'vigente' CHECK (estado IN ('vigente', 'cancelado')),
  motivo_cancelacion text,
  cancelado_por uuid,
  cancelado_at timestamptz,
  creado_por uuid DEFAULT contabilidad._usuario(),
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((estado = 'cancelado') = (cancelado_at IS NOT NULL AND motivo_cancelacion IS NOT NULL))
);
CREATE INDEX planes_pago_disciplina_idx ON socios.planes_pago (disciplina_id);

CREATE TABLE socios.plan_pago_pedidos (
  plan_id bigint NOT NULL REFERENCES socios.planes_pago (id) ON DELETE RESTRICT,
  pedido_id integer NOT NULL REFERENCES public.pedidos (id) ON DELETE RESTRICT,
  importe numeric(14, 2) NOT NULL CHECK (importe > 0),
  PRIMARY KEY (plan_id, pedido_id)
);
CREATE INDEX plan_pago_pedidos_pedido_idx ON socios.plan_pago_pedidos (pedido_id);

CREATE TABLE socios.plan_pago_cuotas (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  plan_id bigint NOT NULL REFERENCES socios.planes_pago (id) ON DELETE RESTRICT,
  numero smallint NOT NULL CHECK (numero > 0),
  vencimiento date NOT NULL,
  importe numeric(14, 2) NOT NULL CHECK (importe > 0),
  UNIQUE (plan_id, numero)
);

CREATE TABLE socios.plan_pago_aplicaciones (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  cuota_id bigint NOT NULL REFERENCES socios.plan_pago_cuotas (id) ON DELETE RESTRICT,
  cobro_id bigint REFERENCES socios.cobros_disciplina (id) ON DELETE RESTRICT,
  liquidacion_id bigint REFERENCES socios.liquidaciones_disciplina (id) ON DELETE RESTRICT,
  fecha date NOT NULL,
  importe numeric(14, 2) NOT NULL CHECK (importe > 0),
  anulada boolean NOT NULL DEFAULT false,
  CHECK ((cobro_id IS NULL) <> (liquidacion_id IS NULL))
);
CREATE INDEX plan_pago_aplicaciones_cuota_idx ON socios.plan_pago_aplicaciones (cuota_id) WHERE NOT anulada;

-- Saldos (se calculan, no se escriben)
CREATE VIEW socios.plan_pago_cuotas_saldo WITH (security_invoker = true) AS
SELECT c.*,
  coalesce(a.pagado, 0) AS pagado,
  c.importe - coalesce(a.pagado, 0) AS saldo,
  CASE WHEN c.importe - coalesce(a.pagado, 0) <= 0 THEN 'pagada'
       WHEN c.vencimiento < contabilidad._hoy() THEN 'vencida'
       WHEN coalesce(a.pagado, 0) > 0 THEN 'parcial'
       ELSE 'pendiente' END AS situacion
FROM socios.plan_pago_cuotas c
LEFT JOIN (SELECT cuota_id, sum(importe) AS pagado FROM socios.plan_pago_aplicaciones WHERE NOT anulada GROUP BY cuota_id) a
  ON a.cuota_id = c.id;

CREATE VIEW socios.planes_pago_resumen WITH (security_invoker = true) AS
SELECT p.*,
  coalesce(sum(s.pagado), 0) AS pagado,
  coalesce(sum(s.saldo), 0) AS saldo,
  count(s.id) AS cuotas,
  count(s.id) FILTER (WHERE s.situacion = 'pagada') AS cuotas_pagadas,
  count(s.id) FILTER (WHERE s.situacion = 'vencida') AS cuotas_vencidas,
  coalesce(sum(s.saldo) FILTER (WHERE s.situacion = 'vencida'), 0) AS saldo_vencido,
  min(s.vencimiento) FILTER (WHERE s.saldo > 0) AS proximo_vencimiento,
  CASE WHEN p.estado = 'cancelado' THEN 'cancelado'
       WHEN coalesce(sum(s.saldo), 0) <= 0 THEN 'cumplido'
       WHEN count(s.id) FILTER (WHERE s.situacion = 'vencida') > 0 THEN 'atrasado'
       ELSE 'al_dia' END AS situacion
FROM socios.planes_pago p
LEFT JOIN socios.plan_pago_cuotas_saldo s ON s.plan_id = p.id
GROUP BY p.id;

-- ------------------------------------------------------------
-- Reglas
-- ------------------------------------------------------------
CREATE FUNCTION socios._plan_pago_valido() RETURNS trigger
LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Los planes de pago no se borran: se cancelan';
  END IF;
  IF OLD.estado = 'cancelado' OR (to_jsonb(NEW) - ARRAY['estado', 'motivo_cancelacion', 'cancelado_por', 'cancelado_at', 'notas'])
                                 <> (to_jsonb(OLD) - ARRAY['estado', 'motivo_cancelacion', 'cancelado_por', 'cancelado_at', 'notas']) THEN
    RAISE EXCEPTION 'Un plan de pago no se modifica: se cancela y se arma otro';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER planes_pago_valido BEFORE UPDATE OR DELETE ON socios.planes_pago
  FOR EACH ROW EXECUTE FUNCTION socios._plan_pago_valido();

CREATE FUNCTION socios._plan_fijo() RETURNS trigger
LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  RAISE EXCEPTION 'Las cuotas y los pedidos de un plan no cambian: se cancela el plan y se arma otro';
END;
$$;
CREATE TRIGGER plan_pago_cuotas_fijas BEFORE UPDATE OR DELETE ON socios.plan_pago_cuotas
  FOR EACH ROW EXECUTE FUNCTION socios._plan_fijo();
CREATE TRIGGER plan_pago_pedidos_fijos BEFORE UPDATE OR DELETE ON socios.plan_pago_pedidos
  FOR EACH ROW EXECUTE FUNCTION socios._plan_fijo();

CREATE FUNCTION socios._aplicacion_plan_valida() RETURNS trigger
LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Las imputaciones no se borran: se anulan con su pago';
  END IF;
  IF OLD.anulada OR NOT NEW.anulada OR (to_jsonb(NEW) - 'anulada') <> (to_jsonb(OLD) - 'anulada') THEN
    RAISE EXCEPTION 'Una imputación solo se anula';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER plan_pago_aplicaciones_valida BEFORE UPDATE OR DELETE ON socios.plan_pago_aplicaciones
  FOR EACH ROW EXECUTE FUNCTION socios._aplicacion_plan_valida();

CREATE TRIGGER cobros_disciplina_valido BEFORE UPDATE OR DELETE ON socios.cobros_disciplina
  FOR EACH ROW EXECUTE FUNCTION socios._documento_valido();

-- Un pedido en un plan vigente no se cancela: primero se cancela el plan.
CREATE FUNCTION socios._pedido_en_plan() RETURNS trigger
LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  IF NEW.estado = 'cancelado' AND OLD.estado IS DISTINCT FROM 'cancelado' AND EXISTS (
    SELECT 1 FROM socios.plan_pago_pedidos pp JOIN socios.planes_pago p ON p.id = pp.plan_id
    WHERE pp.pedido_id = NEW.id AND p.estado = 'vigente'
  ) THEN
    RAISE EXCEPTION 'El pedido está en un plan de pago vigente: cancelá primero el plan (Disciplinas → plan de pago)';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER pedidos_en_plan BEFORE UPDATE OF estado ON public.pedidos
  FOR EACH ROW EXECUTE FUNCTION socios._pedido_en_plan();
REVOKE EXECUTE ON FUNCTION socios._pedido_en_plan() FROM PUBLIC, anon, authenticated;

-- ------------------------------------------------------------
-- Imputar a un plan (de la cuota más vieja a la más nueva)
-- ------------------------------------------------------------
CREATE FUNCTION socios._aplicar_a_plan(
  p_plan bigint, p_disciplina integer, p_importe numeric, p_fecha date, p_cobro bigint, p_liquidacion bigint
) RETURNS numeric
LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE
  v_p socios.planes_pago;
  v_resto numeric := p_importe;
  v_aplica numeric;
  r record;
BEGIN
  SELECT * INTO v_p FROM socios.planes_pago WHERE id = p_plan FOR UPDATE;
  IF v_p.id IS NULL OR v_p.estado <> 'vigente' THEN
    RAISE EXCEPTION 'El plan de pago no existe o está cancelado';
  END IF;
  IF v_p.disciplina_id <> p_disciplina THEN
    RAISE EXCEPTION 'El plan de pago es de otra disciplina';
  END IF;
  FOR r IN SELECT id, saldo FROM socios.plan_pago_cuotas_saldo WHERE plan_id = p_plan AND saldo > 0 ORDER BY numero LOOP
    EXIT WHEN v_resto <= 0;
    v_aplica := least(r.saldo, v_resto);
    INSERT INTO socios.plan_pago_aplicaciones (cuota_id, cobro_id, liquidacion_id, fecha, importe)
    VALUES (r.id, p_cobro, p_liquidacion, p_fecha, v_aplica);
    v_resto := v_resto - v_aplica;
  END LOOP;
  IF v_resto = p_importe THEN
    RAISE EXCEPTION 'El plan de pago ya está pago';
  END IF;
  -- Lo que excede al plan queda a cuenta de la deuda general de la disciplina.
  RETURN p_importe - v_resto;
END;
$$;

-- ------------------------------------------------------------
-- Operaciones (tesorería)
-- ------------------------------------------------------------
-- p_cuotas: [{vencimiento, importe}] en orden; tienen que sumar el
-- importe del plan (por defecto, el total de los pedidos; puede ser menor
-- si ya pagaron una parte).
CREATE FUNCTION socios.crear_plan_pago(
  p_disciplina integer, p_pedidos integer[], p_cuotas jsonb, p_descripcion text DEFAULT NULL,
  p_importe numeric DEFAULT NULL, p_notas text DEFAULT NULL
) RETURNS bigint
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_total_pedidos numeric;
  v_n integer;
  v_importe numeric;
  v_suma numeric;
  v_id bigint;
  v_c jsonb;
  v_i integer := 0;
  v_ant date;
  v_venc date;
  v_nombre text;
BEGIN
  PERFORM socios._exigir_tesoreria();
  PERFORM pg_advisory_xact_lock(hashtext('socios.plan_pago'), p_disciplina);
  SELECT nombre INTO v_nombre FROM public.disciplinas WHERE id = p_disciplina;
  IF v_nombre IS NULL THEN
    RAISE EXCEPTION 'Disciplina inexistente';
  END IF;
  IF p_pedidos IS NULL OR cardinality(p_pedidos) = 0 THEN
    RAISE EXCEPTION 'Elegí al menos un pedido';
  END IF;
  SELECT count(*), coalesce(sum(total), 0) INTO v_n, v_total_pedidos FROM public.pedidos
  WHERE id = ANY (p_pedidos) AND tipo = 'disciplina' AND disciplina_id = p_disciplina AND estado <> 'cancelado';
  IF v_n <> cardinality(ARRAY(SELECT DISTINCT unnest(p_pedidos))) THEN
    RAISE EXCEPTION 'Hay pedidos que no son de la disciplina o están cancelados';
  END IF;
  IF EXISTS (SELECT 1 FROM socios.plan_pago_pedidos pp JOIN socios.planes_pago p ON p.id = pp.plan_id
             WHERE pp.pedido_id = ANY (p_pedidos) AND p.estado = 'vigente') THEN
    RAISE EXCEPTION 'Hay pedidos que ya están en otro plan de pago vigente';
  END IF;
  v_importe := round(coalesce(p_importe, v_total_pedidos), 2);
  IF v_importe <= 0 OR v_importe > v_total_pedidos THEN
    RAISE EXCEPTION 'El importe del plan tiene que ser mayor que cero y no superar el total de los pedidos (%)', v_total_pedidos;
  END IF;
  IF p_cuotas IS NULL OR jsonb_typeof(p_cuotas) <> 'array' OR jsonb_array_length(p_cuotas) = 0 THEN
    RAISE EXCEPTION 'Armá al menos una cuota';
  END IF;
  IF jsonb_array_length(p_cuotas) > 60 THEN
    RAISE EXCEPTION 'Como máximo 60 cuotas';
  END IF;
  SELECT coalesce(sum(round((c ->> 'importe')::numeric, 2)), 0) INTO v_suma FROM jsonb_array_elements(p_cuotas) c;
  IF v_suma <> v_importe THEN
    RAISE EXCEPTION 'Las cuotas suman % y el plan es de %', v_suma, v_importe;
  END IF;

  INSERT INTO socios.planes_pago (disciplina_id, descripcion, importe_total, notas)
  VALUES (p_disciplina, coalesce(nullif(btrim(p_descripcion), ''), 'Plan de pago de ' || v_nombre), v_importe,
          nullif(btrim(p_notas), ''))
  RETURNING id INTO v_id;
  INSERT INTO socios.plan_pago_pedidos (plan_id, pedido_id, importe)
  SELECT v_id, id, total FROM public.pedidos WHERE id = ANY (p_pedidos);

  FOR v_c IN SELECT * FROM jsonb_array_elements(p_cuotas) LOOP
    v_i := v_i + 1;
    v_venc := (v_c ->> 'vencimiento')::date;
    IF v_venc IS NULL OR coalesce((v_c ->> 'importe')::numeric, 0) <= 0 THEN
      RAISE EXCEPTION 'Cuota %: falta el vencimiento o el importe', v_i;
    END IF;
    IF v_ant IS NOT NULL AND v_venc < v_ant THEN
      RAISE EXCEPTION 'Cuota %: los vencimientos van en orden', v_i;
    END IF;
    INSERT INTO socios.plan_pago_cuotas (plan_id, numero, vencimiento, importe)
    VALUES (v_id, v_i, v_venc, round((v_c ->> 'importe')::numeric, 2));
    v_ant := v_venc;
  END LOOP;
  RETURN v_id;
END;
$$;

-- Cancelar: lo pagado queda imputado; el resto vuelve a ser deuda general
-- de la disciplina (y los pedidos pueden ir a un plan nuevo).
CREATE FUNCTION socios.cancelar_plan_pago(p_plan bigint, p_motivo text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  PERFORM socios._exigir_tesoreria();
  IF nullif(btrim(p_motivo), '') IS NULL THEN
    RAISE EXCEPTION 'Indicá el motivo';
  END IF;
  UPDATE socios.planes_pago SET estado = 'cancelado', motivo_cancelacion = btrim(p_motivo),
         cancelado_por = contabilidad._usuario(), cancelado_at = now()
  WHERE id = p_plan AND estado = 'vigente';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'El plan no existe o ya está cancelado';
  END IF;
END;
$$;

-- Pago de la disciplina al club. Con p_plan, se imputa a sus cuotas.
--   Debe banco / caja      Haber fondos en poder de disciplinas (auxiliar)
CREATE FUNCTION socios.registrar_cobro_disciplina(
  p_disciplina integer, p_fecha date, p_importe numeric, p_cuenta uuid DEFAULT NULL,
  p_referencia text DEFAULT NULL, p_plan bigint DEFAULT NULL, p_notas text DEFAULT NULL
) RETURNS bigint
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_importe numeric := round(p_importe, 2);
  v_cuenta uuid := coalesce(p_cuenta, contabilidad.cuenta_para('socios', 'banco_cobros'));
  v_disp contabilidad.cuentas;
  v_nombre text;
  v_id bigint;
  v_asiento uuid;
BEGIN
  PERFORM socios._exigir_tesoreria();
  SELECT nombre INTO v_nombre FROM public.disciplinas WHERE id = p_disciplina;
  IF v_nombre IS NULL THEN
    RAISE EXCEPTION 'Disciplina inexistente';
  END IF;
  IF v_importe IS NULL OR v_importe <= 0 THEN
    RAISE EXCEPTION 'El importe tiene que ser mayor que cero';
  END IF;
  IF p_fecha IS NULL OR p_fecha > contabilidad._hoy() THEN
    RAISE EXCEPTION 'La fecha del pago no puede ser futura';
  END IF;
  SELECT * INTO v_disp FROM contabilidad.cuentas WHERE id = v_cuenta;
  IF NOT coalesce(v_disp.es_disponibilidad, false) OR v_disp.moneda IS NOT NULL THEN
    RAISE EXCEPTION 'El pago entra a una cuenta de caja o banco en pesos';
  END IF;

  v_id := nextval(pg_get_serial_sequence('socios.cobros_disciplina', 'id'));
  v_asiento := contabilidad._asiento_automatico(p_fecha,
    'Pago de ' || v_nombre || coalesce(' (' || nullif(btrim(p_referencia), '') || ')', ''),
    'cobro_disciplina', v_id::text,
    jsonb_build_array(
      jsonb_build_object('cuenta_id', v_cuenta, 'lado', 'debe', 'importe', v_importe),
      jsonb_build_object('cuenta_id', contabilidad.cuenta_para('socios', 'disciplinas'), 'lado', 'haber',
                         'importe', v_importe, 'disciplina_id', p_disciplina)));
  INSERT INTO socios.cobros_disciplina (id, disciplina_id, fecha, importe, cuenta_id, referencia, notas, asiento_id)
  OVERRIDING SYSTEM VALUE
  VALUES (v_id, p_disciplina, p_fecha, v_importe, v_cuenta, nullif(btrim(p_referencia), ''), nullif(btrim(p_notas), ''),
          v_asiento);
  IF p_plan IS NOT NULL THEN
    PERFORM socios._aplicar_a_plan(p_plan, p_disciplina, v_importe, p_fecha, v_id, NULL);
  END IF;
  RETURN v_id;
END;
$$;

CREATE FUNCTION socios.anular_cobro_disciplina(p_cobro bigint, p_motivo text, p_fecha date DEFAULT NULL) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_c socios.cobros_disciplina;
BEGIN
  PERFORM socios._exigir_tesoreria();
  IF nullif(btrim(p_motivo), '') IS NULL THEN
    RAISE EXCEPTION 'Indicá el motivo';
  END IF;
  SELECT * INTO v_c FROM socios.cobros_disciplina WHERE id = p_cobro FOR UPDATE;
  IF v_c.id IS NULL OR v_c.estado <> 'vigente' THEN
    RAISE EXCEPTION 'El pago no existe o ya está anulado';
  END IF;
  PERFORM contabilidad._revertir(v_c.asiento_id, p_motivo, greatest(coalesce(p_fecha, contabilidad._hoy()), v_c.fecha));
  UPDATE socios.plan_pago_aplicaciones SET anulada = true WHERE cobro_id = p_cobro AND NOT anulada;
  UPDATE socios.cobros_disciplina SET estado = 'anulado', motivo_anulacion = btrim(p_motivo),
         anulado_por = contabilidad._usuario(), anulado_at = now()
  WHERE id = p_cobro;
END;
$$;

DROP FUNCTION socios.liquidar_disciplina(integer, date, date, date, numeric, uuid, text);
CREATE FUNCTION socios.liquidar_disciplina(
  p_disciplina integer, p_desde date, p_hasta date, p_fecha date, p_compensar numeric DEFAULT 0,
  p_cuenta uuid DEFAULT NULL, p_notas text DEFAULT NULL, p_plan bigint DEFAULT NULL
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
  -- Lo compensado puede imputarse a las cuotas de un plan de pago.
  IF p_plan IS NOT NULL THEN
    IF v_comp = 0 THEN
      RAISE EXCEPTION 'Para imputar a un plan de pago hay que compensar parte de la deuda';
    END IF;
    PERFORM socios._aplicar_a_plan(p_plan, p_disciplina, v_comp, p_fecha, NULL, v_id);
  END IF;
  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION socios.anular_liquidacion_disciplina(p_liquidacion bigint, p_motivo text, p_fecha date DEFAULT NULL)
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
  UPDATE socios.plan_pago_aplicaciones SET anulada = true WHERE liquidacion_id = p_liquidacion AND NOT anulada;
  UPDATE socios.liquidaciones_disciplina SET estado = 'anulada', motivo_anulacion = btrim(p_motivo),
         anulado_por = contabilidad._usuario(), anulado_at = now()
  WHERE id = p_liquidacion;
END;
$$;

-- ------------------------------------------------------------
-- Cuenta corriente
-- ------------------------------------------------------------
-- Movimientos de "Fondos en poder de disciplinas" de una disciplina, con
-- saldo acumulado (+ = lo que la disciplina le debe al club). Toma todos
-- los ejercicios: la apertura de cada uno repite el saldo del anterior, así
-- que solo cuenta la del primer ejercicio (los saldos iniciales).
CREATE FUNCTION socios.cuenta_corriente_disciplina(p_disciplina integer)
RETURNS TABLE (
  fecha date, asiento_id uuid, numero integer, tipo text, descripcion text,
  debe numeric, haber numeric, saldo numeric, origen_tipo text, origen_id text, pedido_id integer
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_cuenta uuid := contabilidad.cuenta_para('socios', 'disciplinas');
  v_primer uuid;
BEGIN
  PERFORM socios._exigir(ARRAY['tesorero', 'comision_fiscal']);
  SELECT id INTO v_primer FROM contabilidad.ejercicios ORDER BY fecha_inicio LIMIT 1;
  RETURN QUERY
  WITH m AS (
    SELECT a.fecha AS f, a.id AS asiento, a.numero AS num,
      CASE
        WHEN a.tipo = 'apertura' THEN 'saldo_inicial'
        WHEN a.tipo = 'reversion' THEN 'anulacion'
        WHEN a.origen_tipo IN ('pedido', 'pedido_venta', 'pedido_entrega', 'pedido_efectivo') THEN 'compra_tienda'
        WHEN a.origen_tipo LIKE 'devolucion%' OR a.origen_tipo = 'pedido_cancelacion' THEN 'devolucion_tienda'
        WHEN a.origen_tipo = 'cobro_socio' THEN 'cuota_cobrada'
        WHEN a.origen_tipo = 'liquidacion_disciplina' THEN 'liquidacion'
        WHEN a.origen_tipo = 'cobro_disciplina' THEN 'pago'
        ELSE 'otro'
      END AS t,
      coalesce(nullif(l.descripcion, ''), a.descripcion) AS d,
      l.debe AS de, l.haber AS ha, a.origen_tipo AS ot, a.origen_id AS oi, l.id AS lid,
      CASE WHEN a.origen_tipo IN ('pedido', 'pedido_venta', 'pedido_entrega', 'pedido_efectivo') AND a.origen_id ~ '^[0-9]+$'
           THEN a.origen_id::integer END AS ped
    FROM contabilidad.lineas l
    JOIN contabilidad.asientos a ON a.id = l.asiento_id
    WHERE l.cuenta_id = v_cuenta AND l.disciplina_id = p_disciplina AND a.estado = 'confirmado'
      AND a.tipo NOT IN ('cierre', 'refundicion')
      AND (a.tipo <> 'apertura' OR a.ejercicio_id = v_primer)
  )
  SELECT m.f, m.asiento, m.num, m.t, m.d, m.de, m.ha,
         sum(m.de - m.ha) OVER (ORDER BY m.f, m.num NULLS LAST, m.lid ROWS UNBOUNDED PRECEDING),
         m.ot, m.oi, m.ped
  FROM m ORDER BY m.f, m.num NULLS LAST, m.lid;
END;
$$;

-- Saldo de todas las disciplinas (para la lista).
CREATE FUNCTION socios.saldos_disciplinas()
RETURNS TABLE (disciplina_id integer, saldo numeric, ultimo_movimiento date)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_cuenta uuid := contabilidad.cuenta_para('socios', 'disciplinas');
  v_primer uuid;
BEGIN
  PERFORM socios._exigir(ARRAY['tesorero', 'comision_fiscal']);
  SELECT id INTO v_primer FROM contabilidad.ejercicios ORDER BY fecha_inicio LIMIT 1;
  RETURN QUERY
  SELECT l.disciplina_id, sum(l.debe - l.haber), max(a.fecha)
  FROM contabilidad.lineas l
  JOIN contabilidad.asientos a ON a.id = l.asiento_id
  WHERE l.cuenta_id = v_cuenta AND l.disciplina_id IS NOT NULL AND a.estado = 'confirmado'
    AND a.tipo NOT IN ('cierre', 'refundicion') AND (a.tipo <> 'apertura' OR a.ejercicio_id = v_primer)
  GROUP BY l.disciplina_id;
END;
$$;

-- ------------------------------------------------------------
-- RLS y permisos
-- ------------------------------------------------------------
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['cobros_disciplina', 'planes_pago', 'plan_pago_pedidos', 'plan_pago_cuotas',
                           'plan_pago_aplicaciones'] LOOP
    EXECUTE format('ALTER TABLE socios.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('CREATE POLICY %I ON socios.%I FOR SELECT TO authenticated USING (socios.puede_leer())',
                   t || '_lectura', t);
    EXECUTE format('REVOKE ALL ON socios.%I FROM PUBLIC, anon, authenticated', t);
    EXECUTE format('GRANT SELECT ON socios.%I TO authenticated, service_role', t);
  END LOOP;
  FOREACH t IN ARRAY ARRAY['cobros_disciplina', 'planes_pago'] LOOP
    EXECUTE format('CREATE TRIGGER %I AFTER INSERT OR UPDATE OR DELETE ON socios.%I
                    FOR EACH ROW EXECUTE FUNCTION contabilidad._auditar()', t || '_auditoria', t);
  END LOOP;
END $$;
GRANT SELECT ON socios.plan_pago_cuotas_saldo, socios.planes_pago_resumen TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION socios._plan_pago_valido(), socios._plan_fijo(), socios._aplicacion_plan_valida(),
  socios._aplicar_a_plan(bigint, integer, numeric, date, bigint, bigint) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION socios.crear_plan_pago(integer, integer[], jsonb, text, numeric, text),
  socios.cancelar_plan_pago(bigint, text),
  socios.registrar_cobro_disciplina(integer, date, numeric, uuid, text, bigint, text),
  socios.anular_cobro_disciplina(bigint, text, date),
  socios.liquidar_disciplina(integer, date, date, date, numeric, uuid, text, bigint),
  socios.cuenta_corriente_disciplina(integer), socios.saldos_disciplinas() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION socios.crear_plan_pago(integer, integer[], jsonb, text, numeric, text),
  socios.cancelar_plan_pago(bigint, text),
  socios.registrar_cobro_disciplina(integer, date, numeric, uuid, text, bigint, text),
  socios.anular_cobro_disciplina(bigint, text, date),
  socios.liquidar_disciplina(integer, date, date, date, numeric, uuid, text, bigint),
  socios.cuenta_corriente_disciplina(integer), socios.saldos_disciplinas() TO authenticated, service_role;
