-- ============================================================
-- Comunicaciones: cola de salida, historial por destinatario, bajas
--
-- Tomado de ContaSystem (lo que vale la pena):
--   * un mensaje = una fila, creada antes de enviar: es la cola, el
--     historial y el ancla de la baja; dedupe_key única evita duplicados;
--   * dos categorías: 'institucional' (cuotas, recibos, pedidos: no admite
--     baja) y 'difusion' (admite baja); la baja es por dirección de mail;
--   * "omitido" (no se manda: baja, mail inválido, repetido) es distinto de
--     "fallido" y nunca se reintenta;
--   * lo que toca plata se prepara solo pero sale con aprobación.
-- Distinto de ContaSystem: se envía desde el servidor (worker por cron,
-- SMTP del dominio; credenciales solo en variables de entorno), con
-- reintentos y tope por hora, y la baja vive en la misma base.
-- ============================================================

CREATE SCHEMA comunicaciones;
GRANT USAGE ON SCHEMA comunicaciones TO authenticated, service_role;

CREATE FUNCTION comunicaciones.puede_gestionar() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT contabilidad._tiene_rol(ARRAY['super_admin', 'secretaria']);
$$;

CREATE FUNCTION comunicaciones.puede_ver() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT contabilidad._tiene_rol(ARRAY['super_admin', 'secretaria', 'tesorero', 'tienda']);
$$;

CREATE FUNCTION comunicaciones._exigir_gestion() RETURNS void
LANGUAGE sql STABLE SET search_path = '' AS $$ SELECT socios._exigir(ARRAY['secretaria']) $$;

-- ------------------------------------------------------------
-- Configuración (una fila)
-- ------------------------------------------------------------
CREATE TABLE comunicaciones.config (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  remitente_nombre text NOT NULL DEFAULT 'Club Seminario',
  remitente_email text NOT NULL DEFAULT 'noreply@clubseminario.com.uy'
    CHECK (remitente_email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  responder_a text CHECK (responder_a IS NULL OR responder_a ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  -- Topes del servidor SMTP (cPanel suele limitar por hora).
  limite_por_hora integer NOT NULL DEFAULT 200 CHECK (limite_por_hora > 0),
  limite_por_tanda integer NOT NULL DEFAULT 25 CHECK (limite_por_tanda BETWEEN 1 AND 200),
  pie text,
  -- WhatsApp de la tienda (número en formato internacional, sin +).
  whatsapp_tienda text CHECK (whatsapp_tienda IS NULL OR whatsapp_tienda ~ '^[0-9]{8,15}$'),
  whatsapp_mensajes jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO comunicaciones.config (whatsapp_mensajes) VALUES (jsonb_build_object(
  'pedido_listo', 'Hola {{nombre}}, tu pedido #{{numero}} de la tienda de Club Seminario está listo para retirar.',
  'consulta', 'Hola, te escribimos de la tienda de Club Seminario por tu pedido #{{numero}}.'
));

-- ------------------------------------------------------------
-- Plantillas
-- ------------------------------------------------------------
CREATE TABLE comunicaciones.plantillas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clave text NOT NULL UNIQUE CHECK (clave ~ '^[a-z0-9_]+$'),
  nombre text NOT NULL CHECK (length(btrim(nombre)) > 0),
  categoria text NOT NULL CHECK (categoria IN ('institucional', 'difusion')),
  asunto text NOT NULL CHECK (length(btrim(asunto)) > 0),
  -- Texto con formato simple (párrafos, **negrita**, [enlaces](url), listas)
  -- y variables {{nombre}}.
  cuerpo text NOT NULL CHECK (length(btrim(cuerpo)) > 0),
  -- Las del sistema (bienvenida, cuota vencida…) no se borran ni cambian de clave.
  sistema boolean NOT NULL DEFAULT false,
  activa boolean NOT NULL DEFAULT true,
  updated_by uuid DEFAULT contabilidad._usuario(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO comunicaciones.plantillas (clave, nombre, categoria, asunto, cuerpo, sistema) VALUES
('bienvenida', 'Bienvenida de socio', 'institucional', '¡Bienvenido/a a Club Seminario, {{nombre}}!',
 E'Hola {{nombre}}:\n\nTe damos la bienvenida como socio/a de Club Seminario. Tu número de socio es **{{numero_socio}}**.\n\nDesde [tu cuenta](https://www.clubseminario.com.uy/mi-cuenta) podés ver tu carnet y tus cuotas.\n\n¡Nos vemos en el club!', true),
('cuota_vencida', 'Aviso de cuotas vencidas', 'institucional', 'Club Seminario: tenés cuotas pendientes',
 E'Hola {{nombre}}:\n\nTe recordamos que tenés **{{cuotas_vencidas}} cuota(s) vencida(s)** por un total de **{{deuda_vencida}}**.\n\nSi ya pagaste, desestimá este mensaje. Ante cualquier duda, respondé este correo.', true),
('cumpleanos', 'Feliz cumpleaños', 'difusion', '¡Feliz cumpleaños, {{nombre}}!',
 E'Hola {{nombre}}:\n\nTodo Club Seminario te desea un muy feliz cumpleaños. 🎉', true);

-- ------------------------------------------------------------
-- Envíos y mensajes
-- ------------------------------------------------------------
CREATE TABLE comunicaciones.envios (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre text NOT NULL,
  categoria text NOT NULL CHECK (categoria IN ('institucional', 'difusion')),
  plantilla_id uuid REFERENCES comunicaciones.plantillas (id) ON DELETE SET NULL,
  -- Copia de lo que se envía (las plantillas pueden cambiar después).
  asunto text NOT NULL,
  cuerpo text,
  audiencia jsonb,
  -- borrador: preparado, espera aprobación; aprobado: se envía (desde
  -- programado_para); cancelado: lo pendiente no sale.
  estado text NOT NULL DEFAULT 'borrador' CHECK (estado IN ('borrador', 'aprobado', 'cancelado')),
  programado_para timestamptz NOT NULL DEFAULT now(),
  origen text NOT NULL DEFAULT 'manual' CHECK (origen IN ('manual', 'transaccional', 'automatizacion')),
  creado_por uuid DEFAULT contabilidad._usuario(),
  aprobado_por uuid,
  aprobado_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE comunicaciones.mensajes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  envio_id uuid NOT NULL REFERENCES comunicaciones.envios (id) ON DELETE RESTRICT,
  categoria text NOT NULL CHECK (categoria IN ('institucional', 'difusion')),
  persona_id integer REFERENCES public.padron_socios (id) ON DELETE SET NULL,
  perfil_id uuid REFERENCES public.perfiles (id) ON DELETE SET NULL,
  email text NOT NULL,
  nombre text,
  variables jsonb NOT NULL DEFAULT '{}'::jsonb,
  -- HTML ya armado (mails de la tienda y eventos hechos en código).
  html text,
  ref_tipo text,
  ref_id text,
  dedupe_key text UNIQUE,
  estado text NOT NULL DEFAULT 'pendiente'
    CHECK (estado IN ('pendiente', 'enviando', 'enviado', 'fallido', 'omitido', 'cancelado')),
  motivo_omision text,
  intentos smallint NOT NULL DEFAULT 0,
  proximo_intento timestamptz NOT NULL DEFAULT now(),
  bloqueado_hasta timestamptz,
  smtp_id text,
  error text,
  enviado_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((estado = 'omitido') = (motivo_omision IS NOT NULL)),
  CHECK ((estado = 'enviado') = (enviado_at IS NOT NULL)),
  CHECK (email = lower(btrim(email)))
);
CREATE INDEX mensajes_cola_idx ON comunicaciones.mensajes (proximo_intento) WHERE estado = 'pendiente';
CREATE INDEX mensajes_envio_idx ON comunicaciones.mensajes (envio_id, estado);
CREATE INDEX mensajes_email_idx ON comunicaciones.mensajes (email);
CREATE INDEX mensajes_persona_idx ON comunicaciones.mensajes (persona_id);
CREATE INDEX mensajes_enviados_idx ON comunicaciones.mensajes (enviado_at) WHERE estado = 'enviado';
-- Un envío no le escribe dos veces a la misma dirección.
CREATE UNIQUE INDEX mensajes_envio_email ON comunicaciones.mensajes (envio_id, email);

-- ------------------------------------------------------------
-- Bajas y supresiones (por dirección; nunca se borran, se revocan)
-- ------------------------------------------------------------
CREATE TABLE comunicaciones.supresiones (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  email text NOT NULL CHECK (email = lower(btrim(email))),
  -- difusion: deja de recibir difusión; total: no se le escribe más
  -- (rebote permanente, pedido expreso).
  alcance text NOT NULL CHECK (alcance IN ('difusion', 'total')),
  motivo text NOT NULL CHECK (motivo IN ('baja', 'rebote', 'queja', 'manual')),
  origen text NOT NULL CHECK (origen IN ('enlace', 'un_clic', 'manual')),
  mensaje_id uuid REFERENCES comunicaciones.mensajes (id) ON DELETE SET NULL,
  notas text,
  registrado_por uuid DEFAULT contabilidad._usuario(),
  created_at timestamptz NOT NULL DEFAULT now(),
  revocada_at timestamptz,
  revocada_por uuid
);
CREATE UNIQUE INDEX supresiones_vigente ON comunicaciones.supresiones (email, alcance) WHERE revocada_at IS NULL;

CREATE FUNCTION comunicaciones.suprimido(p_email text, p_categoria text) RETURNS boolean
LANGUAGE sql STABLE SET search_path = '' AS $$
  SELECT EXISTS (SELECT 1 FROM comunicaciones.supresiones
                 WHERE email = lower(btrim(p_email)) AND revocada_at IS NULL
                   AND (alcance = 'total' OR p_categoria = 'difusion'))
$$;

-- ------------------------------------------------------------
-- Automatizaciones (cada corrida una sola vez por período)
-- ------------------------------------------------------------
CREATE TABLE comunicaciones.automatizaciones (
  clave text PRIMARY KEY,
  nombre text NOT NULL,
  descripcion text,
  activa boolean NOT NULL DEFAULT false,
  -- auto: se envía sola; asistida: queda en borrador para aprobar.
  modo text NOT NULL CHECK (modo IN ('auto', 'asistida')),
  plantilla_clave text NOT NULL REFERENCES comunicaciones.plantillas (clave) ON UPDATE CASCADE,
  parametros jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO comunicaciones.automatizaciones (clave, nombre, descripcion, modo, plantilla_clave, parametros) VALUES
('bienvenida', 'Bienvenida', 'Al dar de alta a un socio con email', 'auto', 'bienvenida', '{}'),
('cuota_vencida', 'Cuotas vencidas', 'Mensual: a quienes superan la tolerancia de cuotas vencidas (sin débito automático)',
 'asistida', 'cuota_vencida', '{"dia_del_mes": 15}'),
('cumpleanos', 'Cumpleaños', 'Diario: a los socios que cumplen años', 'auto', 'cumpleanos', '{}');

CREATE TABLE comunicaciones.corridas (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  clave text NOT NULL REFERENCES comunicaciones.automatizaciones (clave),
  periodo text NOT NULL,
  envio_id uuid REFERENCES comunicaciones.envios (id),
  cantidad integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (clave, periodo)
);

-- ------------------------------------------------------------
-- Reglas
-- ------------------------------------------------------------
-- Los mensajes no se borran; solo avanzan de estado.
CREATE FUNCTION comunicaciones._mensaje_valido() RETURNS trigger
LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Los mensajes no se borran: son el historial';
  END IF;
  IF OLD.estado IN ('enviado', 'omitido', 'cancelado', 'fallido') AND NEW.estado <> OLD.estado
     AND NOT (OLD.estado = 'fallido' AND NEW.estado = 'pendiente') THEN
    RAISE EXCEPTION 'El mensaje ya terminó (%)', OLD.estado;
  END IF;
  IF (NEW.email, NEW.envio_id, NEW.categoria, NEW.variables, NEW.html)
     IS DISTINCT FROM (OLD.email, OLD.envio_id, OLD.categoria, OLD.variables, OLD.html) THEN
    RAISE EXCEPTION 'El contenido de un mensaje no cambia';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER mensajes_valido BEFORE UPDATE OR DELETE ON comunicaciones.mensajes
  FOR EACH ROW EXECUTE FUNCTION comunicaciones._mensaje_valido();

CREATE FUNCTION comunicaciones._envio_valido() RETURNS trigger
LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.estado <> 'borrador' OR EXISTS (SELECT 1 FROM comunicaciones.mensajes
                                           WHERE envio_id = OLD.id AND estado NOT IN ('pendiente', 'omitido')) THEN
      RAISE EXCEPTION 'Solo se borra un envío en borrador';
    END IF;
    RETURN OLD;
  END IF;
  IF OLD.estado = 'cancelado' OR (OLD.estado = 'aprobado' AND NEW.estado = 'borrador') THEN
    RAISE EXCEPTION 'El envío ya está %', OLD.estado;
  END IF;
  IF OLD.estado <> 'borrador' AND (NEW.asunto, NEW.cuerpo, NEW.categoria) IS DISTINCT FROM (OLD.asunto, OLD.cuerpo, OLD.categoria) THEN
    RAISE EXCEPTION 'Un envío aprobado no cambia de contenido';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER envios_valido BEFORE UPDATE OR DELETE ON comunicaciones.envios
  FOR EACH ROW EXECUTE FUNCTION comunicaciones._envio_valido();

-- ------------------------------------------------------------
-- Encolar
-- ------------------------------------------------------------
-- p_destinatarios: [{email, nombre?, persona_id?, perfil_id?, variables?, html?, dedupe_key?, ref_tipo?, ref_id?}]
-- Omite (con motivo, sin enviar) direcciones inválidas, repetidas en el
-- envío, dadas de baja, o con dedupe_key ya usada.
CREATE FUNCTION comunicaciones._encolar(
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
      SELECT 1 FROM comunicaciones.mensajes m WHERE m.dedupe_key = e.dedupe_key) AS duplicado) x
    WHERE e.email <> ''
  ) d
  ORDER BY d.email, d.motivo NULLS FIRST;
  RETURN v_id;
END;
$$;

-- Envío manual o masivo (secretaría). Nace en borrador: se aprueba aparte.
CREATE FUNCTION comunicaciones.crear_envio(
  p_nombre text, p_categoria text, p_asunto text, p_cuerpo text, p_destinatarios jsonb,
  p_plantilla uuid DEFAULT NULL, p_audiencia jsonb DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  PERFORM comunicaciones._exigir_gestion();
  IF nullif(btrim(p_cuerpo), '') IS NULL THEN
    RAISE EXCEPTION 'Falta el texto del mensaje';
  END IF;
  RETURN comunicaciones._encolar(p_nombre, p_categoria, p_asunto, p_cuerpo, p_destinatarios, 'manual', false,
                                 NULL, p_plantilla, p_audiencia);
END;
$$;

CREATE FUNCTION comunicaciones.aprobar_envio(p_envio uuid, p_programado_para timestamptz DEFAULT NULL) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  PERFORM comunicaciones._exigir_gestion();
  UPDATE comunicaciones.envios
     SET estado = 'aprobado', aprobado_por = contabilidad._usuario(), aprobado_at = now(),
         programado_para = coalesce(p_programado_para, now())
   WHERE id = p_envio AND estado = 'borrador';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'El envío no existe o no está en borrador';
  END IF;
  -- La baja pudo llegar mientras estaba en borrador.
  UPDATE comunicaciones.mensajes SET estado = 'omitido', motivo_omision = 'Dada de baja'
  WHERE envio_id = p_envio AND estado = 'pendiente' AND comunicaciones.suprimido(email, categoria);
END;
$$;

CREATE FUNCTION comunicaciones.cancelar_envio(p_envio uuid) RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_n integer;
BEGIN
  PERFORM comunicaciones._exigir_gestion();
  UPDATE comunicaciones.envios SET estado = 'cancelado' WHERE id = p_envio AND estado <> 'cancelado';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'El envío no existe o ya está cancelado';
  END IF;
  UPDATE comunicaciones.mensajes SET estado = 'cancelado' WHERE envio_id = p_envio AND estado = 'pendiente';
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN v_n;
END;
$$;

CREATE FUNCTION comunicaciones.reintentar_fallidos(p_envio uuid) RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_n integer;
BEGIN
  PERFORM comunicaciones._exigir_gestion();
  UPDATE comunicaciones.mensajes SET estado = 'pendiente', intentos = 0, proximo_intento = now(), error = NULL
  WHERE envio_id = p_envio AND estado = 'fallido';
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN v_n;
END;
$$;

-- Mail transaccional desde el servidor (tienda, eventos, recibos): sale
-- solo, con HTML ya armado. dedupe_key evita mandarlo dos veces.
CREATE FUNCTION comunicaciones.encolar_transaccional(
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
  IF p_dedupe_key IS NOT NULL AND EXISTS (SELECT 1 FROM comunicaciones.mensajes WHERE dedupe_key = p_dedupe_key) THEN
    RETURN NULL;
  END IF;
  RETURN comunicaciones._encolar(p_asunto, 'institucional', p_asunto, NULL,
    jsonb_build_array(jsonb_build_object('email', p_email, 'nombre', p_nombre, 'html', p_html,
                                         'dedupe_key', p_dedupe_key, 'ref_tipo', p_ref_tipo, 'ref_id', p_ref_id,
                                         'perfil_id', p_perfil, 'variables', coalesce(p_variables, '{}'))),
    'transaccional', true);
END;
$$;

-- ------------------------------------------------------------
-- Worker (solo service_role)
-- ------------------------------------------------------------
-- Toma una tanda de mensajes listos (envío aprobado y a su hora),
-- respetando el tope por hora. Rescata los que quedaron "enviando" de una
-- corrida que murió. Concurrencia: FOR UPDATE SKIP LOCKED.
CREATE FUNCTION comunicaciones.tomar_mensajes() RETURNS SETOF comunicaciones.mensajes
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_cfg comunicaciones.config;
  v_cupo integer;
BEGIN
  SELECT * INTO v_cfg FROM comunicaciones.config;
  UPDATE comunicaciones.mensajes SET estado = 'pendiente', bloqueado_hasta = NULL
  WHERE estado = 'enviando' AND bloqueado_hasta < now();

  SELECT v_cfg.limite_por_hora - count(*) INTO v_cupo FROM comunicaciones.mensajes
  WHERE (estado = 'enviado' AND enviado_at > now() - interval '1 hour') OR estado = 'enviando';
  v_cupo := least(greatest(v_cupo, 0), v_cfg.limite_por_tanda);
  IF v_cupo = 0 THEN
    RETURN;
  END IF;

  RETURN QUERY
  UPDATE comunicaciones.mensajes m
     SET estado = 'enviando', bloqueado_hasta = now() + interval '5 minutes', intentos = m.intentos + 1
   WHERE m.id IN (
     SELECT x.id FROM comunicaciones.mensajes x
     JOIN comunicaciones.envios e ON e.id = x.envio_id
     WHERE x.estado = 'pendiente' AND x.proximo_intento <= now()
       AND e.estado = 'aprobado' AND e.programado_para <= now()
     -- Primero lo transaccional, después lo más viejo.
     ORDER BY (e.origen = 'transaccional') DESC, x.created_at
     FOR UPDATE OF x SKIP LOCKED
     LIMIT v_cupo)
  RETURNING m.*;
END;
$$;

-- Resultado del intento: enviado, o error (transitorio: reintenta con
-- espera creciente hasta 5 intentos; permanente: fallido).
CREATE FUNCTION comunicaciones.resultado_mensaje(
  p_mensaje uuid, p_ok boolean, p_smtp_id text DEFAULT NULL, p_error text DEFAULT NULL, p_permanente boolean DEFAULT false
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_m comunicaciones.mensajes;
BEGIN
  SELECT * INTO v_m FROM comunicaciones.mensajes WHERE id = p_mensaje FOR UPDATE;
  IF v_m.estado <> 'enviando' THEN
    RETURN;
  END IF;
  IF p_ok THEN
    UPDATE comunicaciones.mensajes SET estado = 'enviado', enviado_at = now(), smtp_id = p_smtp_id,
           bloqueado_hasta = NULL, error = NULL
    WHERE id = p_mensaje;
  ELSIF p_permanente OR v_m.intentos >= 5 THEN
    UPDATE comunicaciones.mensajes SET estado = 'fallido', error = left(p_error, 1000), bloqueado_hasta = NULL
    WHERE id = p_mensaje;
  ELSE
    UPDATE comunicaciones.mensajes SET estado = 'pendiente', error = left(p_error, 1000), bloqueado_hasta = NULL,
           proximo_intento = now() + (ARRAY[1, 5, 15, 60, 240])[least(v_m.intentos, 5)] * interval '1 minute'
    WHERE id = p_mensaje;
  END IF;
END;
$$;

-- Omite un mensaje en el momento del envío (la baja llegó después de
-- encolar).
CREATE FUNCTION comunicaciones.omitir_mensaje(p_mensaje uuid, p_motivo text) RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path = '' AS $$
  UPDATE comunicaciones.mensajes SET estado = 'omitido', motivo_omision = p_motivo, bloqueado_hasta = NULL
  WHERE id = p_mensaje AND estado IN ('pendiente', 'enviando');
$$;

-- ------------------------------------------------------------
-- Bajas
-- ------------------------------------------------------------
-- Baja desde el enlace del mail (la ruta verifica la firma del token y
-- llama con service_role). Idempotente.
CREATE FUNCTION comunicaciones.registrar_baja(p_mensaje uuid, p_origen text DEFAULT 'enlace') RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_email text;
BEGIN
  SELECT email INTO v_email FROM comunicaciones.mensajes WHERE id = p_mensaje;
  IF v_email IS NULL THEN
    RAISE EXCEPTION 'Enlace inválido';
  END IF;
  INSERT INTO comunicaciones.supresiones (email, alcance, motivo, origen, mensaje_id, registrado_por)
  VALUES (v_email, 'difusion', 'baja', p_origen, p_mensaje, NULL)
  ON CONFLICT (email, alcance) WHERE revocada_at IS NULL DO NOTHING;
  UPDATE comunicaciones.mensajes SET estado = 'omitido', motivo_omision = 'Dada de baja'
  WHERE email = v_email AND categoria = 'difusion' AND estado = 'pendiente';
  RETURN v_email;
END;
$$;

CREATE FUNCTION comunicaciones.suprimir(p_email text, p_alcance text, p_motivo text, p_notas text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  PERFORM comunicaciones._exigir_gestion();
  INSERT INTO comunicaciones.supresiones (email, alcance, motivo, origen, notas)
  VALUES (lower(btrim(p_email)), p_alcance, p_motivo, 'manual', nullif(btrim(p_notas), ''))
  ON CONFLICT (email, alcance) WHERE revocada_at IS NULL DO NOTHING;
  UPDATE comunicaciones.mensajes SET estado = 'omitido', motivo_omision = 'Dada de baja'
  WHERE email = lower(btrim(p_email)) AND estado = 'pendiente' AND comunicaciones.suprimido(email, categoria);
END;
$$;

CREATE FUNCTION comunicaciones.revocar_supresion(p_supresion bigint) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  PERFORM comunicaciones._exigir_gestion();
  UPDATE comunicaciones.supresiones SET revocada_at = now(), revocada_por = contabilidad._usuario()
  WHERE id = p_supresion AND revocada_at IS NULL;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'La baja no existe o ya fue revocada';
  END IF;
END;
$$;

-- ------------------------------------------------------------
-- Audiencias del padrón
-- ------------------------------------------------------------
-- Destinatarios entre los socios (y la cuenta web vinculada) con las
-- variables para las plantillas. p_filtro: {vigentes (bool, def true),
-- disciplinas [ids], con_deuda (bool), medio, cumple_mes (1-12), cumple_hoy (bool),
-- alta_desde (fecha: altas desde ese día)}.
CREATE FUNCTION comunicaciones.audiencia_socios(p_filtro jsonb DEFAULT '{}')
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
           'deuda_vencida', '$ ' || to_char(coalesce(s.deuda_vencida, 0), 'FM999G999G990D00'),
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
    AND (p_filtro ->> 'cumple_mes' IS NULL OR extract(month FROM p.fecha_nacimiento) = (p_filtro ->> 'cumple_mes')::int)
    AND (NOT coalesce((p_filtro ->> 'cumple_hoy')::boolean, false)
         OR to_char(p.fecha_nacimiento, 'MM-DD') = to_char(v_hoy, 'MM-DD'))
    AND (p_filtro ->> 'alta_desde' IS NULL
         OR EXISTS (SELECT 1 FROM socios.membresias m WHERE m.persona_id = p.id
                    AND m.desde BETWEEN (p_filtro ->> 'alta_desde')::date AND v_hoy));
END;
$$;

-- Prepara la corrida de una automatización para un período (una sola
-- vez): arma la audiencia, encola con dedupe_key y la deja aprobada
-- (auto) o en borrador (asistida). Solo service_role (cron) o gestión.
CREATE FUNCTION comunicaciones.correr_automatizacion(p_clave text, p_periodo text, p_filtro jsonb, p_dedupe_prefijo text)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_a comunicaciones.automatizaciones;
  v_p comunicaciones.plantillas;
  v_dest jsonb;
  v_envio uuid;
  v_corrida bigint;
BEGIN
  PERFORM comunicaciones._exigir_gestion();
  SELECT * INTO v_a FROM comunicaciones.automatizaciones WHERE clave = p_clave;
  IF v_a.clave IS NULL OR NOT v_a.activa THEN
    RETURN NULL;
  END IF;
  INSERT INTO comunicaciones.corridas (clave, periodo) VALUES (p_clave, p_periodo)
  ON CONFLICT (clave, periodo) DO NOTHING
  RETURNING id INTO v_corrida;
  IF v_corrida IS NULL THEN
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
  WHERE NOT EXISTS (SELECT 1 FROM comunicaciones.mensajes m WHERE m.dedupe_key = p_dedupe_prefijo || ':' || a.persona_id);
  IF jsonb_array_length(v_dest) = 0 THEN
    RETURN NULL;
  END IF;
  v_envio := comunicaciones._encolar(v_a.nombre || ' — ' || p_periodo, v_p.categoria, v_p.asunto, v_p.cuerpo, v_dest,
                                     'automatizacion', v_a.modo = 'auto', NULL, v_p.id, p_filtro);
  UPDATE comunicaciones.corridas SET envio_id = v_envio, cantidad = jsonb_array_length(v_dest) WHERE id = v_corrida;
  RETURN v_envio;
END;
$$;

-- ------------------------------------------------------------
-- Consultas
-- ------------------------------------------------------------
CREATE VIEW comunicaciones.envios_resumen WITH (security_invoker = true) AS
SELECT e.*,
  count(m.id) AS total,
  count(m.id) FILTER (WHERE m.estado = 'pendiente') AS pendientes,
  count(m.id) FILTER (WHERE m.estado = 'enviando') AS enviando,
  count(m.id) FILTER (WHERE m.estado = 'enviado') AS enviados,
  count(m.id) FILTER (WHERE m.estado = 'fallido') AS fallidos,
  count(m.id) FILTER (WHERE m.estado = 'omitido') AS omitidos,
  count(m.id) FILTER (WHERE m.estado = 'cancelado') AS cancelados
FROM comunicaciones.envios e
LEFT JOIN comunicaciones.mensajes m ON m.envio_id = e.id
GROUP BY e.id;

-- ------------------------------------------------------------
-- RLS y permisos
-- ------------------------------------------------------------
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['config', 'plantillas', 'envios', 'mensajes', 'supresiones', 'automatizaciones', 'corridas'] LOOP
    EXECUTE format('ALTER TABLE comunicaciones.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('CREATE POLICY %I ON comunicaciones.%I FOR SELECT TO authenticated USING (comunicaciones.puede_ver())',
                   t || '_lectura', t);
    EXECUTE format('REVOKE ALL ON comunicaciones.%I FROM PUBLIC, anon, authenticated', t);
    EXECUTE format('GRANT SELECT ON comunicaciones.%I TO authenticated, service_role', t);
  END LOOP;
  FOREACH t IN ARRAY ARRAY['config', 'plantillas', 'envios', 'supresiones', 'automatizaciones'] LOOP
    EXECUTE format('CREATE TRIGGER %I AFTER INSERT OR UPDATE OR DELETE ON comunicaciones.%I
                    FOR EACH ROW EXECUTE FUNCTION contabilidad._auditar()', t || '_auditoria', t);
  END LOOP;
END $$;

-- Plantillas, configuración y automatizaciones: edición directa de
-- secretaría (las de sistema no se borran ni cambian de clave).
CREATE POLICY plantillas_escritura ON comunicaciones.plantillas FOR ALL TO authenticated
  USING (comunicaciones.puede_gestionar()) WITH CHECK (comunicaciones.puede_gestionar());
CREATE POLICY config_escritura ON comunicaciones.config FOR UPDATE TO authenticated
  USING (comunicaciones.puede_gestionar() OR contabilidad._tiene_rol(ARRAY['tienda']))
  WITH CHECK (comunicaciones.puede_gestionar() OR contabilidad._tiene_rol(ARRAY['tienda']));
CREATE POLICY automatizaciones_escritura ON comunicaciones.automatizaciones FOR UPDATE TO authenticated
  USING (comunicaciones.puede_gestionar()) WITH CHECK (comunicaciones.puede_gestionar());
CREATE POLICY envios_borrar ON comunicaciones.envios FOR DELETE TO authenticated
  USING (comunicaciones.puede_gestionar());
GRANT INSERT, UPDATE, DELETE ON comunicaciones.plantillas TO authenticated;
GRANT UPDATE ON comunicaciones.config, comunicaciones.automatizaciones TO authenticated;
GRANT DELETE ON comunicaciones.envios TO authenticated;
GRANT SELECT ON comunicaciones.envios_resumen TO authenticated, service_role;

CREATE FUNCTION comunicaciones._plantilla_sistema() RETURNS trigger
LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  IF OLD.sistema AND (TG_OP = 'DELETE' OR NEW.clave <> OLD.clave OR NOT NEW.sistema) THEN
    RAISE EXCEPTION 'Las plantillas del sistema no se borran ni cambian de clave (se pueden desactivar)';
  END IF;
  IF TG_OP = 'UPDATE' THEN
    NEW.updated_at := now();
    NEW.updated_by := contabilidad._usuario();
    RETURN NEW;
  END IF;
  RETURN OLD;
END;
$$;
CREATE TRIGGER plantillas_sistema BEFORE UPDATE OR DELETE ON comunicaciones.plantillas
  FOR EACH ROW EXECUTE FUNCTION comunicaciones._plantilla_sistema();

-- El WhatsApp de la tienda lo ve la tienda pública (botón de contacto).
CREATE FUNCTION public.whatsapp_tienda() RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT jsonb_build_object('numero', whatsapp_tienda, 'mensajes', whatsapp_mensajes) FROM comunicaciones.config
$$;
GRANT EXECUTE ON FUNCTION public.whatsapp_tienda() TO anon, authenticated;

REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA comunicaciones FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION comunicaciones._exigir_gestion(), comunicaciones._mensaje_valido(),
  comunicaciones._envio_valido(), comunicaciones._encolar(text, text, text, text, jsonb, text, boolean, timestamptz, uuid, jsonb),
  comunicaciones._plantilla_sistema(), comunicaciones.tomar_mensajes(),
  comunicaciones.resultado_mensaje(uuid, boolean, text, text, boolean), comunicaciones.omitir_mensaje(uuid, text),
  comunicaciones.registrar_baja(uuid, text), comunicaciones.encolar_transaccional(text, text, text, text, text, text, text, uuid, jsonb)
  FROM authenticated;
GRANT EXECUTE ON FUNCTION comunicaciones.puede_gestionar(), comunicaciones.puede_ver(), comunicaciones.suprimido(text, text),
  comunicaciones.crear_envio(text, text, text, text, jsonb, uuid, jsonb), comunicaciones.aprobar_envio(uuid, timestamptz),
  comunicaciones.cancelar_envio(uuid), comunicaciones.reintentar_fallidos(uuid),
  comunicaciones.suprimir(text, text, text, text), comunicaciones.revocar_supresion(bigint),
  comunicaciones.audiencia_socios(jsonb), comunicaciones.correr_automatizacion(text, text, jsonb, text)
  TO authenticated;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA comunicaciones TO service_role;
