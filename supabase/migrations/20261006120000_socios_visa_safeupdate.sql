-- ============================================================
-- Socios — la liquidación Visa no podía aplicarse desde el sitio:
-- `DELETE FROM _comision;` sin WHERE lo rechaza pg-safeupdate (cargado
-- para las conexiones de la API). Los tests corren por conexión directa
-- y no lo veían; ahora un test revisa el código de las funciones.
-- * Número de socio: el siguiente al mayor, sin la secuencia (que deja
--   huecos cuando una transacción se deshace).
-- ============================================================

CREATE OR REPLACE FUNCTION socios.aplicar_liquidacion_visa(
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
  DELETE FROM _comision WHERE true;
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

CREATE OR REPLACE FUNCTION socios.alta_socio(
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

  -- Número de socio: el que trae, o el siguiente al mayor (consecutivos:
  -- una secuencia deja huecos cuando una transacción se deshace).
  PERFORM pg_advisory_xact_lock(hashtext('socios.numero_socio'));
  UPDATE public.padron_socios
     SET numero_socio = coalesce(numero_socio, nullif(p_persona ->> 'numero_socio', '')::integer,
                                 (SELECT coalesce(max(numero_socio), 0) + 1 FROM public.padron_socios))
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

DROP SEQUENCE socios.numero_socio_seq;
