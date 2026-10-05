-- ============================================================
-- Tesorería — cambios de las disciplinas para el débito Visa y
-- representantes
-- ============================================================

-- Quién vio un número de tarjeta y cuándo.
CREATE TABLE socios.tarjetas_consultas (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  cambio_id bigint NOT NULL REFERENCES socios.cambios_disciplina (id) ON DELETE RESTRICT,
  consultado_por uuid DEFAULT auth.uid(),
  consultado_por_nombre text,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE socios.tarjetas_consultas ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON socios.tarjetas_consultas FROM PUBLIC, anon, authenticated;
GRANT SELECT ON socios.tarjetas_consultas TO authenticated, service_role;
CREATE POLICY tarjetas_consultas_lectura ON socios.tarjetas_consultas FOR SELECT TO authenticated USING (socios.puede_leer());

-- Número completo de una tarjeta pendiente de cargar en el portal.
CREATE FUNCTION socios.ver_tarjeta(p_cambio bigint) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_c socios.cambios_disciplina;
  v_num text;
BEGIN
  PERFORM socios._exigir_tesoreria();
  SELECT * INTO v_c FROM socios.cambios_disciplina WHERE id = p_cambio;
  IF v_c.tarjeta_secreto_id IS NULL THEN
    RAISE EXCEPTION 'Ese cambio no tiene un número de tarjeta pendiente (ya se aplicó o no se cargó completo)';
  END IF;
  SELECT decrypted_secret INTO v_num FROM vault.decrypted_secrets WHERE id = v_c.tarjeta_secreto_id;
  INSERT INTO socios.tarjetas_consultas (cambio_id, consultado_por_nombre) VALUES (p_cambio, coalesce(socios._nombre_usuario(), 'Sistema'));
  RETURN v_num;
END;
$$;

-- Marca cambios como cargados en el portal (o descartados): el número de
-- tarjeta se borra.
CREATE FUNCTION socios.marcar_cambios(p_cambios bigint[], p_estado text DEFAULT 'aplicado', p_notas text DEFAULT NULL)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_secretos uuid[];
  v_n integer;
BEGIN
  PERFORM socios._exigir_tesoreria();
  IF p_estado NOT IN ('aplicado', 'descartado') THEN
    RAISE EXCEPTION 'Estado inválido';
  END IF;
  IF p_estado = 'descartado' AND nullif(btrim(p_notas), '') IS NULL THEN
    RAISE EXCEPTION 'Indicá por qué se descarta';
  END IF;
  SELECT array_agg(tarjeta_secreto_id) FILTER (WHERE tarjeta_secreto_id IS NOT NULL) INTO v_secretos
  FROM socios.cambios_disciplina WHERE id = ANY (p_cambios) AND estado_debito = 'pendiente';
  UPDATE socios.cambios_disciplina
     SET estado_debito = p_estado, aplicado_por = auth.uid(), aplicado_at = now(),
         notas_aplicacion = nullif(btrim(p_notas), ''), tarjeta_secreto_id = NULL
   WHERE id = ANY (p_cambios) AND estado_debito = 'pendiente';
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_secretos IS NOT NULL THEN
    DELETE FROM vault.secrets WHERE id = ANY (v_secretos);
  END IF;
  RETURN v_n;
END;
$$;

-- Lista para la pantalla de tesorería (con nombres y sin el secreto).
CREATE FUNCTION socios.cambios_debito(p_desde date DEFAULT NULL, p_hasta date DEFAULT NULL, p_estado text DEFAULT NULL,
                                      p_disciplina integer DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  PERFORM socios._exigir(ARRAY['tesorero', 'secretaria', 'comision_fiscal']);
  RETURN (SELECT coalesce(jsonb_agg(to_jsonb(c) - 'tarjeta_secreto_id' || jsonb_build_object(
            'tarjeta_pendiente', c.tarjeta_secreto_id IS NOT NULL,
            'disciplina', d.nombre,
            'persona', CASE WHEN p.id IS NULL THEN NULL ELSE p.apellido || ', ' || p.nombre END,
            'cedula', p.cedula, 'numero_socio', p.numero_socio,
            'aplicado_por_nombre', (SELECT nullif(btrim(coalesce(pf.nombre, '') || ' ' || coalesce(pf.apellido, '')), '')
                                    FROM public.perfiles pf WHERE pf.id = c.aplicado_por),
            'consultas', (SELECT count(*) FROM socios.tarjetas_consultas t WHERE t.cambio_id = c.id))
          ORDER BY c.created_at DESC, c.id DESC), '[]')
          FROM socios.cambios_disciplina c
          LEFT JOIN public.disciplinas d ON d.id = c.disciplina_id
          LEFT JOIN public.padron_socios p ON p.id = c.persona_id
          WHERE (p_desde IS NULL OR c.created_at >= p_desde)
            AND (p_hasta IS NULL OR c.created_at < p_hasta + 1)
            AND (p_estado IS NULL OR c.estado_debito = p_estado
                 OR (p_estado = 'debito' AND c.afecta_debito))
            AND (p_disciplina IS NULL OR c.disciplina_id = p_disciplina));
END;
$$;

-- ------------------------------------------------------------
-- Representantes (tesorería, secretaría, super_admin)
-- ------------------------------------------------------------
CREATE FUNCTION socios.guardar_representante(p_id bigint, p_disciplina integer, p_datos jsonb) RETURNS bigint
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_id bigint;
  v_antes socios.representantes;
  v_nombre text := btrim(p_datos ->> 'nombre');
BEGIN
  PERFORM socios._exigir(ARRAY['tesorero', 'secretaria']);
  IF nullif(v_nombre, '') IS NULL OR nullif(btrim(p_datos ->> 'email'), '') IS NULL THEN
    RAISE EXCEPTION 'Indicá nombre y correo';
  END IF;
  IF p_id IS NULL THEN
    INSERT INTO socios.representantes (disciplina_id, nombre, email, telefono, cargo, recibe_liquidacion, acceso_panel)
    VALUES (p_disciplina, v_nombre, p_datos ->> 'email', nullif(btrim(p_datos ->> 'telefono'), ''),
            nullif(btrim(p_datos ->> 'cargo'), ''), coalesce((p_datos ->> 'recibe_liquidacion')::boolean, true),
            coalesce((p_datos ->> 'acceso_panel')::boolean, true))
    RETURNING id INTO v_id;
    PERFORM socios._registrar_cambio('representante', NULL, 'Representante nuevo: ' || v_nombre || ' (' || (p_datos ->> 'email') || ')',
      NULL, p_datos, contabilidad._hoy(), false, p_disciplina);
  ELSE
    SELECT * INTO v_antes FROM socios.representantes WHERE id = p_id AND disciplina_id = p_disciplina AND activo FOR UPDATE;
    IF v_antes.id IS NULL THEN
      RAISE EXCEPTION 'El representante no existe';
    END IF;
    UPDATE socios.representantes SET nombre = v_nombre, email = p_datos ->> 'email',
           telefono = nullif(btrim(p_datos ->> 'telefono'), ''), cargo = nullif(btrim(p_datos ->> 'cargo'), ''),
           recibe_liquidacion = coalesce((p_datos ->> 'recibe_liquidacion')::boolean, recibe_liquidacion),
           acceso_panel = coalesce((p_datos ->> 'acceso_panel')::boolean, acceso_panel)
    WHERE id = p_id RETURNING id INTO v_id;
    PERFORM socios._registrar_cambio('representante', NULL, 'Representante modificado: ' || v_nombre,
      to_jsonb(v_antes) - ARRAY['perfil_id', 'creado_por', 'created_at', 'updated_at'], p_datos,
      contabilidad._hoy(), false, p_disciplina);
  END IF;
  RETURN v_id;
END;
$$;

CREATE FUNCTION socios.quitar_representante(p_id bigint) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_r socios.representantes;
BEGIN
  PERFORM socios._exigir(ARRAY['tesorero', 'secretaria']);
  SELECT * INTO v_r FROM socios.representantes WHERE id = p_id AND activo FOR UPDATE;
  IF v_r.id IS NULL THEN
    RAISE EXCEPTION 'El representante no existe';
  END IF;
  UPDATE socios.representantes SET activo = false WHERE id = p_id;
  PERFORM socios._registrar_cambio('representante', NULL, 'Ya no es representante: ' || v_r.nombre || ' (' || v_r.email || ')',
    jsonb_build_object('nombre', v_r.nombre, 'email', v_r.email), NULL, contabilidad._hoy(), false, v_r.disciplina_id);
END;
$$;

-- Destinatarios del resumen de una liquidación.
CREATE FUNCTION socios.destinatarios_liquidacion(p_liquidacion bigint) RETURNS TABLE (nombre text, email text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  PERFORM socios._exigir(ARRAY['tesorero', 'secretaria', 'comision_fiscal']);
  RETURN QUERY SELECT r.nombre, r.email FROM socios.representantes r
               JOIN socios.liquidaciones_disciplina l ON l.disciplina_id = r.disciplina_id
               WHERE l.id = p_liquidacion AND r.activo AND r.recibe_liquidacion ORDER BY r.nombre;
END;
$$;

REVOKE EXECUTE ON FUNCTION socios.ver_tarjeta(bigint), socios.marcar_cambios(bigint[], text, text),
  socios.cambios_debito(date, date, text, integer), socios.guardar_representante(bigint, integer, jsonb),
  socios.quitar_representante(bigint), socios.destinatarios_liquidacion(bigint) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION socios.ver_tarjeta(bigint), socios.marcar_cambios(bigint[], text, text),
  socios.cambios_debito(date, date, text, integer), socios.guardar_representante(bigint, integer, jsonb),
  socios.quitar_representante(bigint), socios.destinatarios_liquidacion(bigint) TO authenticated, service_role;
