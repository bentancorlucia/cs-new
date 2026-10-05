-- ============================================================
-- Medio de cobro: la transferencia va a la cuenta de la disciplina del
-- socio (la que tiene asignada), no a cualquier disciplina.
-- ============================================================

CREATE OR REPLACE FUNCTION socios.cambiar_medio_cobro(p_persona integer, p_medio jsonb, p_desde date) RETURNS bigint
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_actual socios.medios_cobro;
  v_id bigint;
  v_medio jsonb;
BEGIN
  PERFORM socios._exigir_secretaria();
  v_medio := socios._preparar_medio(p_medio);
  IF v_medio ->> 'medio' = 'debito_visa' AND nullif(v_medio ->> 'tarjeta_ultimos4', '') IS NULL THEN
    RAISE EXCEPTION 'Para el débito Visa indicá la tarjeta (o al menos sus últimos 4 dígitos)';
  END IF;
  -- La transferencia va a la cuenta de una disciplina del socio (la que tiene asignada).
  IF v_medio ->> 'medio' = 'transferencia_disciplina' AND NOT EXISTS (
    SELECT 1 FROM socios.suscripciones s JOIN socios.planes pl ON pl.id = s.plan_id
    WHERE s.persona_id = p_persona AND pl.disciplina_id = (v_medio ->> 'disciplina_id')::integer
      AND (s.hasta IS NULL OR s.hasta >= p_desde)
  ) THEN
    RAISE EXCEPTION 'La transferencia es a la cuenta de una disciplina del socio: primero inscribilo en esa disciplina';
  END IF;
  SELECT * INTO v_actual FROM socios.medios_cobro WHERE persona_id = p_persona AND hasta IS NULL FOR UPDATE;
  IF v_actual.id IS NOT NULL THEN
    IF p_desde < v_actual.desde THEN
      RAISE EXCEPTION 'El medio actual rige desde el %: el cambio tiene que ser desde esa fecha o después',
        to_char(v_actual.desde, 'DD/MM/YYYY');
    ELSIF p_desde = v_actual.desde THEN
      DELETE FROM socios.medios_cobro WHERE id = v_actual.id;
    ELSE
      UPDATE socios.medios_cobro SET hasta = p_desde - 1 WHERE id = v_actual.id;
    END IF;
  END IF;
  INSERT INTO socios.medios_cobro (persona_id, medio, disciplina_id, tarjeta_ultimos4, tarjeta_vencimiento, tarjeta_emisor,
                                   titular_documento, titular_nombre, desde)
  VALUES (p_persona, v_medio ->> 'medio', (v_medio ->> 'disciplina_id')::integer,
          nullif(v_medio ->> 'tarjeta_ultimos4', ''),
          date_trunc('month', (nullif(v_medio ->> 'tarjeta_vencimiento', ''))::date)::date,
          nullif(upper(btrim(v_medio ->> 'tarjeta_emisor')), ''),
          nullif(btrim(v_medio ->> 'titular_documento'), ''), nullif(btrim(v_medio ->> 'titular_nombre'), ''),
          p_desde)
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

