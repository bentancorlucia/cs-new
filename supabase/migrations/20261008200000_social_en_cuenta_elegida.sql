-- ============================================================
-- Transferencia: cada cuota en la cuenta de su disciplina; la cuota
-- social, en la cuenta que se elige.
--
-- Quien paga por transferencia y está en varias disciplinas paga la cuota
-- de cada disciplina en la cuenta de esa disciplina. Lo único que se
-- elige es en qué cuenta paga la cuota social: es la disciplina del medio
-- de cobro (medios_cobro.disciplina_id). Esa disciplina queda a cargo de
-- la social (cuotas.disciplina_responsable_id) en las cuotas que se
-- emitan desde ahora. Con débito Visa (u otro medio), como antes: la
-- disciplina de la inscripción más antigua.
--
-- Un cobro en la cuenta de una disciplina solo se aplica a las cuotas de
-- esa disciplina y a la social que se paga ahí.
-- ============================================================

-- Quién cubre la cuota social de una persona en un período.
CREATE OR REPLACE FUNCTION socios._disciplina_principal(p_persona integer, p_desde date, p_hasta date) RETURNS integer
LANGUAGE sql STABLE SET search_path = '' AS $$
  SELECT coalesce(
    -- Transferencia: la cuenta elegida, si sigue en esa disciplina.
    (SELECT mc.disciplina_id
     FROM (SELECT medio, disciplina_id FROM socios.medios_cobro
           WHERE persona_id = p_persona AND desde <= p_hasta AND (hasta IS NULL OR hasta >= p_desde)
           ORDER BY desde DESC, id DESC LIMIT 1) mc
     WHERE mc.medio = 'transferencia_disciplina'
       AND EXISTS (SELECT 1 FROM socios.suscripciones s JOIN socios.planes pl ON pl.id = s.plan_id
                   WHERE s.persona_id = p_persona AND pl.disciplina_id = mc.disciplina_id
                     AND s.desde <= p_hasta AND (s.hasta IS NULL OR s.hasta >= p_desde))),
    -- Si no: la inscripción más antigua.
    (SELECT pl.disciplina_id
     FROM socios.suscripciones s JOIN socios.planes pl ON pl.id = s.plan_id
     WHERE s.persona_id = p_persona AND pl.tipo = 'disciplina'
       AND s.desde <= p_hasta AND (s.hasta IS NULL OR s.hasta >= p_desde)
     ORDER BY s.desde, s.id
     LIMIT 1))
$$;

-- Cuotas con saldo que se pagan en la cuenta de una disciplina: las de la
-- disciplina y la social a su cargo (la anual, si hoy es la que la cubre).
CREATE FUNCTION socios._cuotas_cuenta_disciplina(p_persona integer, p_disciplina integer, p_fecha date) RETURNS bigint[]
LANGUAGE sql STABLE SET search_path = '' AS $$
  SELECT coalesce(array_agg(c.id ORDER BY c.fecha_vencimiento, c.periodo_desde, c.id), '{}')
  FROM socios.cuotas c
  WHERE c.persona_id = p_persona AND c.estado = 'emitida' AND c.fecha_emision <= p_fecha
    AND socios._saldo_cuota(c.id) > 0
    AND ((c.tipo = 'disciplina' AND c.disciplina_id = p_disciplina)
         OR (c.tipo = 'social' AND coalesce(c.disciplina_responsable_id,
                                            socios._disciplina_principal(p_persona, p_fecha, p_fecha)) = p_disciplina))
$$;
REVOKE EXECUTE ON FUNCTION socios._cuotas_cuenta_disciplina(integer, integer, date) FROM PUBLIC, anon, authenticated;

-- El saldo a favor de un cobro en la cuenta de una disciplina se aplica
-- solo a las cuotas de esa cuenta.
CREATE OR REPLACE FUNCTION socios._aplicar_saldo_a_favor(p_persona integer, p_fecha date) RETURNS numeric
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
    SELECT id, saldo_a_favor, medio, disciplina_id FROM socios.cobros_saldo
    WHERE persona_id = p_persona AND estado = 'vigente' AND saldo_a_favor > 0 AND fecha <= p_fecha
    ORDER BY fecha, id
  LOOP
    v_disp := r_cobro.saldo_a_favor;
    FOR r_cuota IN
      SELECT c.id, c.cuenta_cobrar_id, socios._saldo_cuota(c.id) AS saldo
      FROM socios.cuotas c
      WHERE c.persona_id = p_persona AND c.estado = 'emitida' AND c.fecha_emision <= p_fecha
        -- Lo pagado en la cuenta de una disciplina va solo a las cuotas de esa cuenta.
        AND (r_cobro.medio <> 'transferencia_disciplina'
             OR c.id = ANY (socios._cuotas_cuenta_disciplina(p_persona, r_cobro.disciplina_id, p_fecha)))
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

CREATE OR REPLACE FUNCTION socios.registrar_cobro(
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
  v_cuotas bigint[] := p_cuotas;
  v_permitidas bigint[];
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
    -- En la cuenta de una disciplina se pagan sus cuotas y la social a su cargo.
    v_permitidas := socios._cuotas_cuenta_disciplina(p_persona, p_disciplina, p_fecha);
    -- Sin cuotas pendientes ahí (un adelanto) queda como saldo a favor, que
    -- también se aplica solo a cuotas de esa cuenta.
    IF v_cuotas IS NULL THEN
      v_cuotas := v_permitidas;
    ELSIF NOT v_cuotas <@ v_permitidas THEN
      RAISE EXCEPTION 'En la cuenta de % solo se pagan sus cuotas y la cuota social que tiene a cargo',
        (SELECT nombre FROM public.disciplinas WHERE id = p_disciplina);
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

  v_reparto := socios._repartir(p_persona, v_importe, p_fecha, v_cuotas);
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

-- Panel: la transferencia va a las cuentas de sus disciplinas; la social,
-- a la de esta disciplina o a la que ya tenía elegida.
CREATE OR REPLACE FUNCTION socios.disc_cambiar_medio(p_disciplina integer, p_persona integer, p_medio jsonb, p_desde date)
RETURNS bigint
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_id bigint;
BEGIN
  PERFORM socios._exigir_disciplina(p_disciplina);
  PERFORM socios._exigir_persona_disciplina(p_persona, p_disciplina);
  IF p_medio ->> 'medio' = 'transferencia_disciplina' AND (p_medio ->> 'disciplina_id')::integer <> p_disciplina
     AND NOT EXISTS (SELECT 1 FROM socios.medios_cobro
                     WHERE persona_id = p_persona AND hasta IS NULL AND medio = 'transferencia_disciplina'
                       AND disciplina_id = (p_medio ->> 'disciplina_id')::integer) THEN
    RAISE EXCEPTION 'La cuota social se paga en la cuenta de tu disciplina o en la que ya tenía elegida';
  END IF;
  PERFORM socios._delegar();
  v_id := socios.cambiar_medio_cobro(p_persona, p_medio, p_desde);
  PERFORM socios._delegar(false);
  RETURN v_id;
END;
$$;

-- Panel, alta de alguien que ya es socio: si ya paga por transferencia, se
-- mantiene la cuenta donde paga la social (la cuota de esta disciplina va
-- igual a la cuenta de esta disciplina).
CREATE OR REPLACE FUNCTION socios.disc_alta_socio(
  p_disciplina integer, p_persona jsonb, p_desde date, p_plan integer, p_medio jsonb DEFAULT NULL
) RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_cedula text := regexp_replace(coalesce(p_persona ->> 'cedula', ''), '[^0-9]', '', 'g');
  v_id integer;
  v_social integer := socios._plan_social();
BEGIN
  PERFORM socios._exigir_disciplina(p_disciplina);
  PERFORM socios._exigir_plan_disciplina(p_plan, p_disciplina);
  IF p_desde IS NULL OR p_desde < date_trunc('month', contabilidad._hoy())::date - 31 THEN
    RAISE EXCEPTION 'La fecha de alta no puede ser de más de un mes atrás';
  END IF;
  PERFORM socios._delegar();
  SELECT id INTO v_id FROM public.padron_socios WHERE cedula = v_cedula;
  IF v_id IS NOT NULL AND EXISTS (SELECT 1 FROM socios.membresias WHERE persona_id = v_id AND hasta IS NULL) THEN
    IF socios._persona_en_disciplina(v_id, p_disciplina) THEN
      RAISE EXCEPTION 'Esa persona ya está en la disciplina: cambiale el plan';
    END IF;
    PERFORM socios.inscribir(v_id, p_plan, p_desde, 'mensual');
    IF p_medio IS NOT NULL AND NOT (
      p_medio ->> 'medio' = 'transferencia_disciplina'
      AND EXISTS (SELECT 1 FROM socios.medios_cobro WHERE persona_id = v_id AND hasta IS NULL
                  AND medio = 'transferencia_disciplina')
    ) THEN
      PERFORM socios.cambiar_medio_cobro(v_id, p_medio, p_desde);
    END IF;
  ELSE
    IF v_social IS NULL THEN
      RAISE EXCEPTION 'No hay un plan de cuota social activo';
    END IF;
    v_id := socios.alta_socio(p_persona, p_desde,
      jsonb_build_array(jsonb_build_object('plan_id', v_social), jsonb_build_object('plan_id', p_plan)), p_medio);
  END IF;
  PERFORM socios._delegar(false);
  RETURN v_id;
END;
$$;
