-- ============================================================
-- Comunicaciones — categoría "personal" (cumpleaños, bienvenida)
--
-- Mensajes de a uno, que no son difusión masiva: admiten baja propia
-- ("no quiero recibir estos saludos", enlace discreto en el pie) pero
-- salen sin el encabezado List-Unsubscribe que Gmail usa para mandarlos a
-- Promociones. La baja de saludos no afecta la difusión ni al revés; una
-- baja total corta todo.
-- ============================================================

ALTER TABLE comunicaciones.plantillas DROP CONSTRAINT plantillas_categoria_check,
  ADD CONSTRAINT plantillas_categoria_check CHECK (categoria IN ('institucional', 'difusion', 'personal'));
ALTER TABLE comunicaciones.envios DROP CONSTRAINT envios_categoria_check,
  ADD CONSTRAINT envios_categoria_check CHECK (categoria IN ('institucional', 'difusion', 'personal'));
ALTER TABLE comunicaciones.mensajes DROP CONSTRAINT mensajes_categoria_check,
  ADD CONSTRAINT mensajes_categoria_check CHECK (categoria IN ('institucional', 'difusion', 'personal'));
ALTER TABLE comunicaciones.supresiones DROP CONSTRAINT supresiones_alcance_check,
  ADD CONSTRAINT supresiones_alcance_check CHECK (alcance IN ('difusion', 'personal', 'total'));

CREATE OR REPLACE FUNCTION comunicaciones.suprimido(p_email text, p_categoria text) RETURNS boolean
LANGUAGE sql STABLE SET search_path = '' AS $$
  SELECT EXISTS (SELECT 1 FROM comunicaciones.supresiones
                 WHERE email = lower(btrim(p_email)) AND revocada_at IS NULL
                   AND (alcance = 'total' OR (alcance = p_categoria AND p_categoria IN ('difusion', 'personal'))))
$$;

-- La baja desde el enlace es de la categoría del mensaje (difusión o saludos).
CREATE OR REPLACE FUNCTION comunicaciones.registrar_baja(p_mensaje uuid, p_origen text DEFAULT 'enlace') RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_m comunicaciones.mensajes;
  v_alcance text;
BEGIN
  SELECT * INTO v_m FROM comunicaciones.mensajes WHERE id = p_mensaje;
  IF v_m.id IS NULL OR v_m.categoria NOT IN ('difusion', 'personal') THEN
    RAISE EXCEPTION 'Enlace inválido';
  END IF;
  v_alcance := v_m.categoria;
  INSERT INTO comunicaciones.supresiones (email, alcance, motivo, origen, mensaje_id, registrado_por)
  VALUES (v_m.email, v_alcance, 'baja', p_origen, p_mensaje, NULL)
  ON CONFLICT (email, alcance) WHERE revocada_at IS NULL DO NOTHING;
  UPDATE comunicaciones.mensajes SET estado = 'omitido', motivo_omision = 'Dada de baja'
  WHERE email = v_m.email AND categoria = v_alcance AND estado = 'pendiente';
  RETURN v_m.email;
END;
$$;

CREATE OR REPLACE FUNCTION comunicaciones._encolar(
  p_nombre text, p_categoria text, p_asunto text, p_cuerpo text, p_destinatarios jsonb,
  p_origen text, p_aprobado boolean, p_programado_para timestamptz DEFAULT NULL,
  p_plantilla uuid DEFAULT NULL, p_audiencia jsonb DEFAULT NULL,
  p_formato text DEFAULT 'texto', p_usa_molde boolean DEFAULT true, p_encabezado jsonb DEFAULT '{}'
) RETURNS uuid
LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE
  v_id uuid;
BEGIN
  IF p_categoria NOT IN ('institucional', 'difusion', 'personal') THEN
    RAISE EXCEPTION 'Categoría inválida';
  END IF;
  IF nullif(btrim(p_asunto), '') IS NULL THEN
    RAISE EXCEPTION 'Falta el asunto';
  END IF;
  IF p_formato NOT IN ('texto', 'html') THEN
    RAISE EXCEPTION 'Formato inválido';
  END IF;
  INSERT INTO comunicaciones.envios (nombre, categoria, plantilla_id, asunto, cuerpo, audiencia, estado,
                                     programado_para, origen, aprobado_por, aprobado_at, formato, usa_molde, encabezado)
  VALUES (coalesce(nullif(btrim(p_nombre), ''), btrim(p_asunto)), p_categoria, p_plantilla, btrim(p_asunto), p_cuerpo,
          p_audiencia, CASE WHEN p_aprobado THEN 'aprobado' ELSE 'borrador' END, coalesce(p_programado_para, now()),
          p_origen, CASE WHEN p_aprobado THEN contabilidad._usuario() END, CASE WHEN p_aprobado THEN now() END,
          p_formato, coalesce(p_usa_molde, true), coalesce(p_encabezado, '{}'))
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

UPDATE comunicaciones.plantillas SET categoria = 'personal' WHERE clave IN ('cumpleanos', 'bienvenida');
