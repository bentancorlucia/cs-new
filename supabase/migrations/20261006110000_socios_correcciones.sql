-- ============================================================
-- Socios y comunicaciones — correcciones de la revisión de pantallas
--
-- * Las políticas de escritura de planes, precios, motivos, config y
--   cobranza de disciplinas (y la de config de comunicaciones) llamaban a
--   contabilidad._tiene_rol, que authenticated no puede ejecutar: hasta un
--   SELECT fallaba. Ahora usan funciones con su propio permiso.
-- * Número de socio: el siguiente libre aunque haya números cargados a mano.
-- * Baja: las inscripciones y el medio que iban a empezar después no
--   quedan vivos; nadie que no sea socio en el período lleva cuota ni
--   figura en el padrón de disciplinas; la nota de crédito no queda con
--   fecha futura.
-- * Medio de cobro: no se pierde el historial con una fecha anterior; el
--   débito Visa exige los últimos 4 dígitos.
-- * Mensaje claro si una inscripción terminaría antes de empezar.
-- ============================================================

CREATE FUNCTION socios.puede_gestionar() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT contabilidad._tiene_rol(ARRAY['super_admin', 'secretaria']);
$$;
CREATE FUNCTION socios.puede_tesoreria() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT contabilidad._tiene_rol(ARRAY['super_admin', 'tesorero']);
$$;
CREATE FUNCTION socios.puede_catalogo() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT contabilidad._tiene_rol(ARRAY['super_admin', 'secretaria', 'tesorero']);
$$;
CREATE FUNCTION comunicaciones.puede_whatsapp() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT contabilidad._tiene_rol(ARRAY['super_admin', 'secretaria', 'tienda']);
$$;
GRANT EXECUTE ON FUNCTION socios.puede_gestionar(), socios.puede_tesoreria(), socios.puede_catalogo(),
  comunicaciones.puede_whatsapp() TO authenticated, service_role;

DROP POLICY planes_escritura ON socios.planes;
DROP POLICY motivos_baja_escritura ON socios.motivos_baja;
DROP POLICY plan_precios_escritura ON socios.plan_precios;
DROP POLICY config_escritura ON socios.config;
DROP POLICY disciplinas_cobranza_escritura ON socios.disciplinas_cobranza;
DROP POLICY config_escritura ON comunicaciones.config;

-- Por operación (sin FOR ALL), para que la lectura dependa solo de la
-- política de lectura.
CREATE POLICY planes_alta ON socios.planes FOR INSERT TO authenticated WITH CHECK (socios.puede_catalogo());
CREATE POLICY planes_edicion ON socios.planes FOR UPDATE TO authenticated
  USING (socios.puede_catalogo()) WITH CHECK (socios.puede_catalogo());
CREATE POLICY planes_borrado ON socios.planes FOR DELETE TO authenticated USING (socios.puede_catalogo());
CREATE POLICY motivos_baja_alta ON socios.motivos_baja FOR INSERT TO authenticated WITH CHECK (socios.puede_gestionar());
CREATE POLICY motivos_baja_edicion ON socios.motivos_baja FOR UPDATE TO authenticated
  USING (socios.puede_gestionar()) WITH CHECK (socios.puede_gestionar());
CREATE POLICY motivos_baja_borrado ON socios.motivos_baja FOR DELETE TO authenticated USING (socios.puede_gestionar());
CREATE POLICY plan_precios_alta ON socios.plan_precios FOR INSERT TO authenticated WITH CHECK (socios.puede_tesoreria());
CREATE POLICY plan_precios_edicion ON socios.plan_precios FOR UPDATE TO authenticated
  USING (socios.puede_tesoreria()) WITH CHECK (socios.puede_tesoreria());
CREATE POLICY plan_precios_borrado ON socios.plan_precios FOR DELETE TO authenticated USING (socios.puede_tesoreria());
CREATE POLICY config_edicion ON socios.config FOR UPDATE TO authenticated
  USING (socios.puede_tesoreria()) WITH CHECK (socios.puede_tesoreria());
CREATE POLICY disciplinas_cobranza_alta ON socios.disciplinas_cobranza FOR INSERT TO authenticated
  WITH CHECK (socios.puede_tesoreria());
CREATE POLICY disciplinas_cobranza_edicion ON socios.disciplinas_cobranza FOR UPDATE TO authenticated
  USING (socios.puede_tesoreria()) WITH CHECK (socios.puede_tesoreria());
CREATE POLICY disciplinas_cobranza_borrado ON socios.disciplinas_cobranza FOR DELETE TO authenticated
  USING (socios.puede_tesoreria());
CREATE POLICY config_edicion ON comunicaciones.config FOR UPDATE TO authenticated
  USING (comunicaciones.puede_whatsapp()) WITH CHECK (comunicaciones.puede_whatsapp());

-- La secuencia arranca después de los números existentes.
SELECT setval('socios.numero_socio_seq',
              greatest((SELECT coalesce(max(numero_socio), 1) FROM public.padron_socios), 1));

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

  -- Número de socio: el que trae, o el siguiente libre (la secuencia se
  -- alinea con los cargados a mano).
  PERFORM pg_advisory_xact_lock(hashtext('socios.numero_socio'));
  UPDATE public.padron_socios
     SET numero_socio = coalesce(numero_socio, nullif(p_persona ->> 'numero_socio', '')::integer,
                                 greatest(nextval('socios.numero_socio_seq')::integer,
                                          (SELECT coalesce(max(numero_socio), 0) + 1 FROM public.padron_socios)))
   WHERE id = v_id;
  PERFORM setval('socios.numero_socio_seq',
                 greatest((SELECT coalesce(max(numero_socio), 1) FROM public.padron_socios), 1));

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

CREATE OR REPLACE FUNCTION socios.baja_socio(p_persona integer, p_hasta date, p_motivo smallint, p_notas text DEFAULT NULL)
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
  -- Las que iban a empezar después de la baja no llegan a existir.
  DELETE FROM socios.suscripciones s
  WHERE s.persona_id = p_persona AND s.desde > p_hasta
    AND NOT EXISTS (SELECT 1 FROM socios.cuotas c WHERE c.suscripcion_id = s.id);
  UPDATE socios.suscripciones SET hasta = greatest(desde, p_hasta), motivo_fin = 'Baja como socio'
  WHERE persona_id = p_persona AND (hasta IS NULL OR hasta > p_hasta);
  DELETE FROM socios.medios_cobro WHERE persona_id = p_persona AND hasta IS NULL AND desde > p_hasta;
  UPDATE socios.medios_cobro SET hasta = greatest(desde, p_hasta)
  WHERE persona_id = p_persona AND hasta IS NULL;
  UPDATE socios.membresias SET hasta = p_hasta, motivo_baja_id = p_motivo, notas_baja = nullif(btrim(p_notas), '')
  WHERE id = v_m.id;
END;
$$;

CREATE OR REPLACE FUNCTION socios._sincronizar_persona(p_persona integer) RETURNS void
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
  WHERE s.persona_id = p_persona AND p.tipo = 'disciplina' AND v_socio
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

CREATE OR REPLACE FUNCTION socios.previsualizar_lote(p_periodo date)
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
      WHEN d.alta IS NULL THEN 'No es socio en el período'
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

CREATE OR REPLACE FUNCTION socios.cambiar_medio_cobro(p_persona integer, p_medio jsonb, p_desde date) RETURNS bigint
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_actual socios.medios_cobro;
  v_id bigint;
BEGIN
  PERFORM socios._exigir_secretaria();
  IF p_medio ->> 'medio' = 'debito_visa' AND nullif(p_medio ->> 'tarjeta_ultimos4', '') IS NULL THEN
    RAISE EXCEPTION 'Para el débito Visa indicá los últimos 4 dígitos de la tarjeta';
  END IF;
  SELECT * INTO v_actual FROM socios.medios_cobro WHERE persona_id = p_persona AND hasta IS NULL FOR UPDATE;
  IF v_actual.id IS NOT NULL THEN
    IF p_desde < v_actual.desde THEN
      RAISE EXCEPTION 'El medio actual rige desde el %: el cambio tiene que ser desde esa fecha o después',
        to_char(v_actual.desde, 'DD/MM/YYYY');
    ELSIF p_desde = v_actual.desde THEN
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

CREATE OR REPLACE FUNCTION socios.finalizar_inscripcion(p_suscripcion bigint, p_hasta date, p_motivo text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  PERFORM socios._exigir_secretaria();
  IF p_hasta < (SELECT desde FROM socios.suscripciones WHERE id = p_suscripcion) THEN
    RAISE EXCEPTION 'La inscripción no puede terminar antes de empezar (%)',
      to_char((SELECT desde FROM socios.suscripciones WHERE id = p_suscripcion), 'DD/MM/YYYY');
  END IF;
  UPDATE socios.suscripciones SET hasta = p_hasta, motivo_fin = nullif(btrim(p_motivo), '')
  WHERE id = p_suscripcion AND (hasta IS NULL OR hasta > p_hasta);
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Inscripción inexistente o ya terminada antes de esa fecha';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION socios.dar_baja(
  p_persona integer, p_hasta date, p_motivo smallint, p_notas text DEFAULT NULL, p_anular_deuda boolean DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_anular boolean := coalesce(p_anular_deuda, (SELECT baja_con_deuda = 'anular' FROM socios.config));
  v_items jsonb;
  v_fecha date;
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
    -- La nota de crédito se emite hoy (o con la emisión más reciente de lo
    -- que acredita), no en la fecha futura de la baja.
    SELECT greatest(contabilidad._hoy(), max(c.fecha_emision)) INTO v_fecha
    FROM socios.cuotas c WHERE c.id IN (SELECT (e ->> 'cuota_id')::bigint FROM jsonb_array_elements(v_items) e);
    PERFORM socios._registrar_credito(p_persona, v_fecha, 'baja',
      CASE WHEN v_anular THEN 'Baja: se anula la deuda' ELSE 'Baja: cuotas posteriores a la baja' END, v_items);
  END IF;
  PERFORM socios.baja_socio(p_persona, p_hasta, p_motivo, p_notas);
END;
$$;
