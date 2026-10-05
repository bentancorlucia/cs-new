-- ============================================================
-- Cuota social: una sola vez por persona, bien identificada
--
-- Quien está en varias disciplinas paga una sola cuota social; la cubre
-- (y responde por ella en la liquidación) la disciplina de su inscripción
-- más antigua. Ahora se ve en la ficha del socio, en el panel de cada
-- disciplina y en el detalle de cada liquidación.
--
-- Vault: las tarjetas se guardan cifradas con Supabase Vault. Viene
-- activado en los proyectos de Supabase; si no, esto lo activa.
-- ============================================================

CREATE EXTENSION IF NOT EXISTS supabase_vault WITH SCHEMA vault;

-- Quién cubre la cuota social de una persona a una fecha.
CREATE FUNCTION socios.cuota_social_de(p_persona integer, p_fecha date DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_fecha date := coalesce(p_fecha, contabilidad._hoy());
  v_disc integer;
  v_claims text := current_setting('request.jwt.claims', true);
BEGIN
  IF v_claims IS NOT NULL AND v_claims <> '' AND (v_claims::jsonb ->> 'role') <> 'service_role'
     AND NOT socios.puede_leer() AND NOT EXISTS (
    SELECT 1 FROM socios.suscripciones s JOIN socios.planes pl ON pl.id = s.plan_id
    WHERE s.persona_id = p_persona AND pl.disciplina_id IS NOT NULL AND socios._es_representante(pl.disciplina_id)
  ) AND NOT EXISTS (SELECT 1 FROM public.padron_socios WHERE id = p_persona AND perfil_id = auth.uid()) THEN
    RAISE EXCEPTION 'No autorizado' USING ERRCODE = '42501';
  END IF;
  v_disc := socios._disciplina_principal(p_persona, v_fecha, v_fecha);
  RETURN jsonb_build_object(
    'disciplina_id', v_disc,
    'disciplina', (SELECT nombre FROM public.disciplinas WHERE id = v_disc),
    'disciplinas', (SELECT coalesce(jsonb_agg(DISTINCT d.nombre), '[]') FROM socios.suscripciones s
                    JOIN socios.planes pl ON pl.id = s.plan_id JOIN public.disciplinas d ON d.id = pl.disciplina_id
                    WHERE s.persona_id = p_persona AND s.desde <= v_fecha AND (s.hasta IS NULL OR s.hasta >= v_fecha)),
    'anual', EXISTS (SELECT 1 FROM socios.suscripciones s JOIN socios.planes pl ON pl.id = s.plan_id
                     WHERE s.persona_id = p_persona AND pl.tipo = 'social' AND s.periodicidad = 'anual'
                       AND s.desde <= v_fecha AND (s.hasta IS NULL OR s.hasta >= v_fecha)));
END;
$$;
REVOKE EXECUTE ON FUNCTION socios.cuota_social_de(integer, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION socios.cuota_social_de(integer, date) TO authenticated, service_role;

-- Panel: quién cubre la social de cada socio.
CREATE OR REPLACE FUNCTION socios.disc_socios(p_disciplina integer, p_historico boolean DEFAULT false) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_hoy date := contabilidad._hoy();
  v_out jsonb;
BEGIN
  PERFORM socios._exigir_lectura_disciplina(p_disciplina);
  PERFORM set_config('socios.delegado', 'on', true);
  WITH ins AS (
    SELECT s.persona_id,
           jsonb_agg(jsonb_build_object('suscripcion_id', s.id, 'plan_id', pl.id, 'plan', pl.nombre,
                     'periodicidad', s.periodicidad, 'desde', s.desde, 'hasta', s.hasta, 'motivo_fin', s.motivo_fin,
                     'vigente', s.hasta IS NULL OR s.hasta >= v_hoy) ORDER BY s.desde DESC, s.id DESC) AS inscripciones,
           bool_or(s.hasta IS NULL OR s.hasta >= v_hoy) AS vigente,
           min(s.desde) AS desde, max(s.hasta) AS hasta
    FROM socios.suscripciones s JOIN socios.planes pl ON pl.id = s.plan_id
    WHERE pl.disciplina_id = p_disciplina
    GROUP BY s.persona_id
  ),
  sit AS (SELECT * FROM socios.situacion(v_hoy)),
  deuda_disc AS (
    SELECT c.persona_id, sum(s.saldo) AS saldo,
           sum(s.saldo) FILTER (WHERE c.fecha_vencimiento < v_hoy) AS vencido
    FROM socios.cuotas c JOIN socios.cuotas_saldo s ON s.id = c.id
    WHERE c.tipo = 'disciplina' AND c.disciplina_id = p_disciplina AND c.estado = 'emitida' AND s.saldo > 0
    GROUP BY c.persona_id
  ),
  medio AS (
    SELECT DISTINCT ON (persona_id) * FROM socios.medios_cobro
    WHERE desde <= v_hoy AND (hasta IS NULL OR hasta >= v_hoy)
    ORDER BY persona_id, desde DESC, id DESC
  )
  SELECT coalesce(jsonb_agg(jsonb_build_object(
      'persona_id', p.id, 'numero_socio', p.numero_socio, 'nombre', p.nombre, 'apellido', p.apellido,
      'cedula', p.cedula, 'email', p.email, 'telefono', p.telefono, 'direccion', p.direccion,
      'fecha_nacimiento', p.fecha_nacimiento,
      'vigente', i.vigente, 'desde', i.desde, 'hasta', CASE WHEN i.vigente THEN NULL ELSE i.hasta END,
      'socio', EXISTS (SELECT 1 FROM socios.membresias m WHERE m.persona_id = p.id AND (m.hasta IS NULL OR m.hasta >= v_hoy)),
      'otras_disciplinas', (SELECT coalesce(jsonb_agg(DISTINCT d.nombre), '[]') FROM socios.suscripciones s2
                            JOIN socios.planes pl2 ON pl2.id = s2.plan_id JOIN public.disciplinas d ON d.id = pl2.disciplina_id
                            WHERE s2.persona_id = p.id AND pl2.disciplina_id <> p_disciplina
                              AND (s2.hasta IS NULL OR s2.hasta >= v_hoy)),
      'inscripciones', i.inscripciones,
      'cuota_mensual', socios._cuota_mensual(p.id, v_hoy),
      'social_cubre', (SELECT d.nombre FROM public.disciplinas d
                       WHERE d.id = socios._disciplina_principal(p.id, v_hoy, v_hoy)),
      'social_anual', EXISTS (SELECT 1 FROM socios.suscripciones s3 JOIN socios.planes pl3 ON pl3.id = s3.plan_id
                              WHERE s3.persona_id = p.id AND pl3.tipo = 'social' AND s3.periodicidad = 'anual'
                                AND (s3.hasta IS NULL OR s3.hasta >= v_hoy)),
      'medio', CASE WHEN md.id IS NULL THEN NULL ELSE jsonb_build_object(
          'medio', md.medio, 'tarjeta', md.tarjeta_ultimos4, 'vencimiento', md.tarjeta_vencimiento,
          'emisor', md.tarjeta_emisor, 'titular', md.titular_nombre, 'titular_documento', md.titular_documento,
          'disciplina_id', md.disciplina_id, 'desde', md.desde) END,
      'tarjeta_vencida', md.tarjeta_vencimiento IS NOT NULL
                         AND (md.tarjeta_vencimiento + interval '1 month - 1 day')::date < v_hoy,
      'cuotas_vencidas', coalesce(st.cuotas_vencidas, 0), 'deuda_vencida', coalesce(st.deuda_vencida, 0),
      'deuda_total', coalesce(st.deuda_total, 0), 'al_dia', coalesce(st.al_dia, true),
      'deuda_disciplina', coalesce(dd.saldo, 0), 'vencido_disciplina', coalesce(dd.vencido, 0),
      'cambios_pendientes', (SELECT count(*) FROM socios.cambios_disciplina c
                             WHERE c.persona_id = p.id AND c.estado_debito = 'pendiente')
    ) ORDER BY p.apellido, p.nombre), '[]')
  INTO v_out
  FROM ins i
  JOIN public.padron_socios p ON p.id = i.persona_id
  LEFT JOIN sit st ON st.persona_id = p.id
  LEFT JOIN deuda_disc dd ON dd.persona_id = p.id
  LEFT JOIN medio md ON md.persona_id = p.id
  WHERE p_historico OR i.vigente;
  PERFORM set_config('socios.delegado', 'off', true);
  RETURN v_out;
END;
$$;


-- Liquidación: quién cubre la social de cada socio del mes.
CREATE OR REPLACE FUNCTION socios._detalle_liquidacion(p_disciplina integer, p_periodo date) RETURNS jsonb
LANGUAGE sql STABLE SET search_path = '' AS $$
  WITH m AS (SELECT date_trunc('month', p_periodo)::date AS ini,
                    (date_trunc('month', p_periodo) + interval '1 month - 1 day')::date AS fin),
  visa AS (SELECT v.id FROM socios.liquidaciones_visa v, m WHERE v.estado = 'vigente' AND v.periodo = m.ini),
  apl AS (SELECT * FROM socios._aplicaciones_liquidables(p_disciplina, p_periodo)),
  soc AS (SELECT * FROM socios._socios_disciplina_mes(p_disciplina, p_periodo)),
  imp AS (SELECT * FROM socios._social_impaga(p_disciplina, p_periodo)),
  debitos AS (SELECT b.persona_id, sum(b.importe) AS importe FROM socios.cobros b
              WHERE b.estado = 'vigente' AND b.liquidacion_visa_id IN (SELECT id FROM visa) GROUP BY b.persona_id),
  rechazos AS (SELECT r.persona_id, sum(r.importe) AS importe, string_agg(DISTINCT r.motivo, '; ') AS motivo
               FROM socios.liquidacion_visa_rechazos r
               WHERE r.liquidacion_visa_id IN (SELECT id FROM visa) AND r.persona_id IS NOT NULL GROUP BY r.persona_id),
  personas AS (SELECT persona_id FROM soc UNION SELECT persona_id FROM apl UNION SELECT persona_id FROM imp),
  medio AS (SELECT DISTINCT ON (mc.persona_id) mc.persona_id, mc.medio, mc.tarjeta_ultimos4
            FROM socios.medios_cobro mc, m
            WHERE mc.desde <= m.fin AND (mc.hasta IS NULL OR mc.hasta >= m.ini)
            ORDER BY mc.persona_id, mc.desde DESC, mc.id DESC)
  SELECT coalesce(jsonb_agg(jsonb_build_object(
      'persona_id', p.persona_id,
      'nombre', ps.apellido || ', ' || ps.nombre,
      'cedula', ps.cedula,
      'numero_socio', ps.numero_socio,
      'planes', coalesce(soc.planes, ''),
      -- Quién cubre su cuota social del mes (se cobra una sola vez).
      'social_cubre', (SELECT CASE WHEN c.periodicidad = 'anual' THEN 'anual' ELSE dd.nombre END
                       FROM socios.cuotas c LEFT JOIN public.disciplinas dd ON dd.id = c.disciplina_responsable_id
                       CROSS JOIN m
                       WHERE c.persona_id = p.persona_id AND c.tipo = 'social' AND c.estado = 'emitida'
                         AND c.periodo_desde <= m.fin AND c.periodo_hasta >= m.ini
                       ORDER BY c.periodicidad DESC LIMIT 1),
      'medio', md.medio,
      'tarjeta', md.tarjeta_ultimos4,
      'visa_debitado', coalesce(d.importe, 0),
      'visa_rechazado', coalesce(r.importe, 0),
      'motivo_rechazo', r.motivo,
      'visa_disciplina', coalesce((SELECT sum(importe) FROM apl WHERE apl.persona_id = p.persona_id AND via = 'visa'), 0),
      'visa_social', coalesce((SELECT sum(importe) FROM apl WHERE apl.persona_id = p.persona_id AND via = 'visa'
                                AND cuota_tipo = 'social'), 0),
      'otros_medios', coalesce((SELECT sum(importe) FROM apl WHERE apl.persona_id = p.persona_id AND via = 'otro'), 0),
      'social_a_cargo', coalesce((SELECT sum(saldo) FROM imp WHERE imp.persona_id = p.persona_id), 0)
    ) ORDER BY ps.apellido, ps.nombre), '[]')
  FROM personas p
  JOIN public.padron_socios ps ON ps.id = p.persona_id
  LEFT JOIN soc ON soc.persona_id = p.persona_id
  LEFT JOIN debitos d ON d.persona_id = p.persona_id
  LEFT JOIN rechazos r ON r.persona_id = p.persona_id
  LEFT JOIN medio md ON md.persona_id = p.persona_id
$$;


-- Estado de cuenta: la cuota social que pone la disciplina se nombra como tal.
CREATE OR REPLACE FUNCTION socios.estado_cuenta(p_persona integer)
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
           CASE WHEN b.medio = 'liquidacion_disciplina' THEN coalesce(b.referencia, 'Cuota social a cargo de la disciplina')
                ELSE CASE b.medio WHEN 'debito_visa' THEN 'Débito Visa' WHEN 'transferencia_club' THEN 'Transferencia'
                                  WHEN 'transferencia_disciplina' THEN 'Pago en la cuenta de la disciplina' ELSE 'Efectivo' END
                     || coalesce(' — ' || b.referencia, '') END,
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

