-- ============================================================
-- Comunicaciones — correcciones de la revisión de pantallas
--
-- * deuda_vencida con formato uruguayo fijo (dependía del idioma del
--   servidor y salía 1,800.00).
-- * Filtro excluir_medio en la audiencia: el aviso de cuotas vencidas no
--   va a quienes pagan por débito automático.
-- * Una corrida sin destinatarios no queda registrada (antes bloqueaba el
--   día), y una corrida cuyo envío se canceló se puede volver a correr.
-- * Un mensaje cancelado no "quema" su dedupe_key: el aviso puede volver
--   a encolarse.
-- * service_role puede mantener plantillas y configuración.
-- ============================================================

ALTER TABLE comunicaciones.mensajes DROP CONSTRAINT mensajes_dedupe_key_key;
CREATE UNIQUE INDEX mensajes_dedupe_vigente ON comunicaciones.mensajes (dedupe_key)
  WHERE dedupe_key IS NOT NULL AND estado <> 'cancelado';

UPDATE comunicaciones.automatizaciones SET parametros = parametros || '{"excluir_medio": "debito_visa"}'
WHERE clave = 'cuota_vencida';

GRANT INSERT, UPDATE, DELETE ON comunicaciones.plantillas, comunicaciones.config,
  comunicaciones.automatizaciones TO service_role;

CREATE OR REPLACE FUNCTION comunicaciones.audiencia_socios(p_filtro jsonb DEFAULT '{}')
RETURNS TABLE (persona_id integer, perfil_id uuid, email text, nombre text, variables jsonb)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_hoy date := contabilidad._hoy();
BEGIN
  IF NOT comunicaciones.puede_gestionar() AND current_setting('request.jwt.claims', true) IS NOT NULL
     AND current_setting('request.jwt.claims', true) <> ''
     AND (current_setting('request.jwt.claims', true)::jsonb ->> 'role') <> 'service_role' THEN
    RAISE EXCEPTION 'No autorizado' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
  WITH s AS (
    SELECT * FROM socios.situacion(v_hoy)
  )
  SELECT p.id, p.perfil_id,
         lower(btrim(coalesce(nullif(p.email, ''), u.email))),
         p.nombre || ' ' || p.apellido,
         jsonb_build_object(
           'nombre', p.nombre, 'apellido', p.apellido, 'numero_socio', p.numero_socio,
           'cuotas_vencidas', coalesce(s.cuotas_vencidas, 0),
           -- Formato uruguayo fijo (G y D dependen del idioma del servidor).
           'deuda_vencida', '$ ' || translate(to_char(coalesce(s.deuda_vencida, 0), 'FM999,999,990.00'), ',.', '.,'),
           'disciplinas', (SELECT string_agg(DISTINCT d.nombre, ', ')
                           FROM public.padron_disciplinas pd JOIN public.disciplinas d ON d.id = pd.disciplina_id
                           WHERE pd.padron_socio_id = p.id))
  FROM public.padron_socios p
  LEFT JOIN auth.users u ON u.id = p.perfil_id
  LEFT JOIN s ON s.persona_id = p.id
  WHERE coalesce(nullif(p.email, ''), u.email) IS NOT NULL
    AND (NOT coalesce((p_filtro ->> 'vigentes')::boolean, true) OR socios.es_socio_en(p.id, v_hoy))
    AND (p_filtro -> 'disciplinas' IS NULL OR jsonb_array_length(p_filtro -> 'disciplinas') = 0
         OR EXISTS (SELECT 1 FROM public.padron_disciplinas pd WHERE pd.padron_socio_id = p.id
                    AND pd.disciplina_id IN (SELECT jsonb_array_elements_text(p_filtro -> 'disciplinas')::integer)))
    AND (p_filtro ->> 'con_deuda' IS NULL
         OR ((p_filtro ->> 'con_deuda')::boolean = (coalesce(s.al_dia, true) = false)))
    AND (p_filtro ->> 'medio' IS NULL OR s.medio = p_filtro ->> 'medio')
    AND (p_filtro ->> 'excluir_medio' IS NULL OR s.medio IS DISTINCT FROM p_filtro ->> 'excluir_medio')
    AND (p_filtro ->> 'cumple_mes' IS NULL OR extract(month FROM p.fecha_nacimiento) = (p_filtro ->> 'cumple_mes')::int)
    AND (NOT coalesce((p_filtro ->> 'cumple_hoy')::boolean, false)
         OR to_char(p.fecha_nacimiento, 'MM-DD') = to_char(v_hoy, 'MM-DD'))
    AND (p_filtro ->> 'alta_desde' IS NULL
         OR EXISTS (SELECT 1 FROM socios.membresias m WHERE m.persona_id = p.id
                    AND m.desde BETWEEN (p_filtro ->> 'alta_desde')::date AND v_hoy));
END;
$$;

CREATE OR REPLACE FUNCTION comunicaciones._encolar(
  p_nombre text, p_categoria text, p_asunto text, p_cuerpo text, p_destinatarios jsonb,
  p_origen text, p_aprobado boolean, p_programado_para timestamptz DEFAULT NULL,
  p_plantilla uuid DEFAULT NULL, p_audiencia jsonb DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE
  v_id uuid;
BEGIN
  IF p_categoria NOT IN ('institucional', 'difusion') THEN
    RAISE EXCEPTION 'Categoría inválida';
  END IF;
  IF nullif(btrim(p_asunto), '') IS NULL THEN
    RAISE EXCEPTION 'Falta el asunto';
  END IF;
  INSERT INTO comunicaciones.envios (nombre, categoria, plantilla_id, asunto, cuerpo, audiencia, estado,
                                     programado_para, origen, aprobado_por, aprobado_at)
  VALUES (coalesce(nullif(btrim(p_nombre), ''), btrim(p_asunto)), p_categoria, p_plantilla, btrim(p_asunto), p_cuerpo,
          p_audiencia, CASE WHEN p_aprobado THEN 'aprobado' ELSE 'borrador' END, coalesce(p_programado_para, now()),
          p_origen, CASE WHEN p_aprobado THEN contabilidad._usuario() END, CASE WHEN p_aprobado THEN now() END)
  RETURNING id INTO v_id;

  INSERT INTO comunicaciones.mensajes (envio_id, categoria, persona_id, perfil_id, email, nombre, variables, html,
                                       ref_tipo, ref_id, dedupe_key, estado, motivo_omision)
  SELECT DISTINCT ON (d.email) v_id, p_categoria, d.persona_id, d.perfil_id, d.email, d.nombre, d.variables, d.html,
         d.ref_tipo, d.ref_id,
         CASE WHEN NOT d.duplicado THEN d.dedupe_key END,
         CASE WHEN d.motivo IS NULL THEN 'pendiente' ELSE 'omitido' END, d.motivo
  FROM (
    SELECT e.*, x.duplicado,
      CASE
        WHEN e.email !~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' THEN 'Dirección inválida'
        WHEN comunicaciones.suprimido(e.email, p_categoria) THEN 'Dada de baja'
        WHEN x.duplicado THEN 'Ya se le envió (' || e.dedupe_key || ')'
      END AS motivo
    FROM (
      SELECT lower(btrim(coalesce(r ->> 'email', ''))) AS email, nullif(btrim(r ->> 'nombre'), '') AS nombre,
             (r ->> 'persona_id')::integer AS persona_id, (r ->> 'perfil_id')::uuid AS perfil_id,
             coalesce(r -> 'variables', '{}'::jsonb) AS variables, r ->> 'html' AS html,
             nullif(r ->> 'dedupe_key', '') AS dedupe_key, r ->> 'ref_tipo' AS ref_tipo, r ->> 'ref_id' AS ref_id
      FROM jsonb_array_elements(coalesce(p_destinatarios, '[]')) r
    ) e
    CROSS JOIN LATERAL (SELECT e.dedupe_key IS NOT NULL AND EXISTS (
      SELECT 1 FROM comunicaciones.mensajes m WHERE m.dedupe_key = e.dedupe_key AND m.estado <> 'cancelado') AS duplicado) x
    WHERE e.email <> ''
  ) d
  ORDER BY d.email, d.motivo NULLS FIRST;
  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION comunicaciones.encolar_transaccional(
  p_email text, p_nombre text, p_asunto text, p_html text, p_dedupe_key text,
  p_ref_tipo text DEFAULT NULL, p_ref_id text DEFAULT NULL, p_perfil uuid DEFAULT NULL,
  p_variables jsonb DEFAULT '{}'
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF current_setting('request.jwt.claims', true) IS NOT NULL AND current_setting('request.jwt.claims', true) <> ''
     AND (current_setting('request.jwt.claims', true)::jsonb ->> 'role') <> 'service_role' THEN
    RAISE EXCEPTION 'Solo desde el servidor' USING ERRCODE = '42501';
  END IF;
  IF p_dedupe_key IS NOT NULL AND EXISTS (SELECT 1 FROM comunicaciones.mensajes
                                          WHERE dedupe_key = p_dedupe_key AND estado <> 'cancelado') THEN
    RETURN NULL;
  END IF;
  RETURN comunicaciones._encolar(p_asunto, 'institucional', p_asunto, NULL,
    jsonb_build_array(jsonb_build_object('email', p_email, 'nombre', p_nombre, 'html', p_html,
                                         'dedupe_key', p_dedupe_key, 'ref_tipo', p_ref_tipo, 'ref_id', p_ref_id,
                                         'perfil_id', p_perfil, 'variables', coalesce(p_variables, '{}'))),
    'transaccional', true);
END;
$$;

CREATE OR REPLACE FUNCTION comunicaciones.correr_automatizacion(p_clave text, p_periodo text, p_filtro jsonb, p_dedupe_prefijo text)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_a comunicaciones.automatizaciones;
  v_p comunicaciones.plantillas;
  v_dest jsonb;
  v_envio uuid;
BEGIN
  PERFORM comunicaciones._exigir_gestion();
  SELECT * INTO v_a FROM comunicaciones.automatizaciones WHERE clave = p_clave;
  IF v_a.clave IS NULL OR NOT v_a.activa THEN
    RETURN NULL;
  END IF;
  -- Una corrida por período; si su envío se canceló, se puede volver a correr.
  PERFORM pg_advisory_xact_lock(hashtext('comunicaciones.corrida:' || p_clave || ':' || p_periodo));
  IF EXISTS (SELECT 1 FROM comunicaciones.corridas c JOIN comunicaciones.envios e ON e.id = c.envio_id
             WHERE c.clave = p_clave AND c.periodo = p_periodo AND e.estado <> 'cancelado') THEN
    RETURN NULL;
  END IF;
  SELECT * INTO v_p FROM comunicaciones.plantillas WHERE clave = v_a.plantilla_clave AND activa;
  IF v_p.id IS NULL THEN
    RAISE EXCEPTION 'La plantilla "%" no está activa', v_a.plantilla_clave;
  END IF;

  SELECT coalesce(jsonb_agg(jsonb_build_object('email', a.email, 'nombre', a.nombre, 'persona_id', a.persona_id,
           'perfil_id', a.perfil_id, 'variables', a.variables,
           'dedupe_key', p_dedupe_prefijo || ':' || a.persona_id)), '[]')
  INTO v_dest FROM comunicaciones.audiencia_socios(p_filtro) a
  WHERE NOT EXISTS (SELECT 1 FROM comunicaciones.mensajes m
                    WHERE m.dedupe_key = p_dedupe_prefijo || ':' || a.persona_id AND m.estado <> 'cancelado');
  IF jsonb_array_length(v_dest) = 0 THEN
    RETURN NULL;
  END IF;
  v_envio := comunicaciones._encolar(v_a.nombre || ' — ' || p_periodo, v_p.categoria, v_p.asunto, v_p.cuerpo, v_dest,
                                     'automatizacion', v_a.modo = 'auto', NULL, v_p.id, p_filtro);
  -- Sin destinatarios no queda registrada: puede volver a correr ese día.
  INSERT INTO comunicaciones.corridas (clave, periodo, envio_id, cantidad)
  VALUES (p_clave, p_periodo, v_envio, jsonb_array_length(v_dest))
  ON CONFLICT (clave, periodo) DO UPDATE SET envio_id = EXCLUDED.envio_id, cantidad = EXCLUDED.cantidad,
                                             created_at = now();
  RETURN v_envio;
END;
$$;
