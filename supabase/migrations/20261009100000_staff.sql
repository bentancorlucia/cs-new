-- ============================================================
-- Staff: entrenadores, preparadores, delegados, dirigentes y personal
--
-- * La persona es la del padrón (public.padron_socios, cédula única): el
--   staff no es otra lista de gente. Puede no ser socio.
-- * Cada vínculo es un período (desde/hasta) con una función de una lista
--   cerrada y un detalle libre (categoría, plantel). Una persona puede
--   estar en varias disciplinas o tener varias funciones. Sin disciplina:
--   personal del club (lo gestiona secretaría).
-- * Lo paga cada disciplina: acá no hay importes ni asientos.
-- * Los representantes dan de alta, de baja y editan el staff de su
--   disciplina; queda en el registro de cambios de la disciplina.
-- * Reemplaza a public.staff (se copian sus filas y se borra).
-- ============================================================

CREATE TABLE socios.staff (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  persona_id integer NOT NULL REFERENCES public.padron_socios (id) ON DELETE RESTRICT,
  -- NULL: personal del club, sin disciplina.
  disciplina_id integer REFERENCES public.disciplinas (id) ON DELETE RESTRICT,
  funcion text NOT NULL CHECK (funcion IN ('entrenador', 'asistente', 'preparador_fisico', 'coordinador', 'delegado',
                                           'dirigente', 'salud', 'utilero', 'administrativo', 'mantenimiento', 'otro')),
  -- Categoría, plantel o cargo exacto ("Primera", "Sub-14", "Secretario").
  detalle text CHECK (detalle IS NULL OR length(btrim(detalle)) BETWEEN 1 AND 120),
  desde date NOT NULL,
  hasta date,
  motivo_fin text,
  notas text,
  creado_por uuid DEFAULT contabilidad._usuario(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (hasta IS NULL OR hasta >= desde),
  CHECK (hasta IS NOT NULL OR motivo_fin IS NULL)
);
CREATE INDEX staff_persona_idx ON socios.staff (persona_id);
CREATE INDEX staff_disciplina_idx ON socios.staff (disciplina_id) WHERE hasta IS NULL;

-- La misma persona no tiene dos veces la misma función (y detalle) en la
-- misma disciplina en períodos que se pisan. Entrenar dos categorías son
-- dos vínculos.
CREATE FUNCTION socios._staff_valido() RETURNS trigger
LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  NEW.detalle := nullif(btrim(NEW.detalle), '');
  NEW.notas := nullif(btrim(NEW.notas), '');
  NEW.motivo_fin := nullif(btrim(NEW.motivo_fin), '');
  NEW.updated_at := now();
  IF EXISTS (SELECT 1 FROM socios.staff s
             WHERE s.persona_id = NEW.persona_id AND s.id <> NEW.id AND s.funcion = NEW.funcion
               AND s.disciplina_id IS NOT DISTINCT FROM NEW.disciplina_id
               AND lower(coalesce(s.detalle, '')) = lower(coalesce(NEW.detalle, ''))
               AND daterange(s.desde, s.hasta, '[]') && daterange(NEW.desde, NEW.hasta, '[]')) THEN
    RAISE EXCEPTION 'Esa persona ya tiene esa función en ese período: para otra categoría, indicala en el detalle';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER staff_valido BEFORE INSERT OR UPDATE ON socios.staff
  FOR EACH ROW EXECUTE FUNCTION socios._staff_valido();

CREATE FUNCTION socios._nombre_funcion_staff(p_funcion text) RETURNS text
LANGUAGE sql IMMUTABLE SET search_path = '' AS $$
  SELECT CASE p_funcion
    WHEN 'entrenador' THEN 'Entrenador/a'
    WHEN 'asistente' THEN 'Asistente técnico/a'
    WHEN 'preparador_fisico' THEN 'Preparador/a físico/a'
    WHEN 'coordinador' THEN 'Coordinador/a'
    WHEN 'delegado' THEN 'Delegado/a'
    WHEN 'dirigente' THEN 'Dirigente'
    WHEN 'salud' THEN 'Salud'
    WHEN 'utilero' THEN 'Utilero/a'
    WHEN 'administrativo' THEN 'Administrativo/a'
    WHEN 'mantenimiento' THEN 'Mantenimiento'
    ELSE 'Otro' END
$$;

-- "Pérez, Juan — Entrenador/a (Sub-14)"
CREATE FUNCTION socios._texto_staff(p socios.staff) RETURNS text
LANGUAGE sql STABLE SET search_path = '' AS $$
  SELECT socios._nombre(p.persona_id) || ' — ' || socios._nombre_funcion_staff(p.funcion)
         || coalesce(' (' || p.detalle || ')', '')
$$;

-- ------------------------------------------------------------
-- Registro de cambios: tres tipos nuevos
-- ------------------------------------------------------------
ALTER TABLE socios.cambios_disciplina DROP CONSTRAINT cambios_disciplina_tipo_check;
ALTER TABLE socios.cambios_disciplina ADD CONSTRAINT cambios_disciplina_tipo_check
  CHECK (tipo IN ('alta', 'reingreso', 'baja_club', 'baja_anulada', 'inscripcion', 'fin_inscripcion',
                  'medio_cobro', 'tarjeta', 'datos', 'plan_nuevo', 'precio', 'cobro', 'representante',
                  'staff_alta', 'staff_baja', 'staff_cambio'));

-- ------------------------------------------------------------
-- Acceso: el staff de una disciplina lo gestionan sus representantes y
-- el club; el personal sin disciplina, secretaría.
-- ------------------------------------------------------------
CREATE FUNCTION socios._exigir_staff(p_disciplina integer) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF p_disciplina IS NOT NULL THEN
    RETURN socios._exigir_disciplina(p_disciplina);
  END IF;
  PERFORM socios._exigir_secretaria();
  PERFORM set_config('socios.cambio_disciplina', '', true);
  PERFORM set_config('socios.cambio_origen', 'club', true);
  RETURN 'club';
END;
$$;

CREATE FUNCTION socios._email_valido(p text) RETURNS text
LANGUAGE plpgsql IMMUTABLE SET search_path = '' AS $$
DECLARE
  v text := nullif(lower(btrim(p)), '');
BEGIN
  IF v IS NOT NULL AND v !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' THEN
    RAISE EXCEPTION 'El correo no es válido';
  END IF;
  RETURN v;
END;
$$;

-- ------------------------------------------------------------
-- Alta. Si la cédula no está en el padrón, crea la persona (sin hacerla
-- socia); si está, usa sus datos y solo completa el correo o el teléfono
-- que falten.
-- p_persona: {cedula, nombre, apellido, email?, telefono?}
-- ------------------------------------------------------------
CREATE FUNCTION socios.alta_staff(
  p_disciplina integer, p_persona jsonb, p_funcion text, p_detalle text DEFAULT NULL,
  p_desde date DEFAULT NULL, p_notas text DEFAULT NULL
) RETURNS bigint
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_cedula text := regexp_replace(coalesce(p_persona ->> 'cedula', ''), '[^0-9]', '', 'g');
  v_desde date := coalesce(p_desde, contabilidad._hoy());
  v_email text := socios._email_valido(p_persona ->> 'email');
  v_tel text := nullif(btrim(p_persona ->> 'telefono'), '');
  v_persona integer;
  v_fila socios.staff;
BEGIN
  PERFORM socios._exigir_staff(p_disciplina);
  IF v_cedula = '' THEN
    RAISE EXCEPTION 'Falta la cédula';
  END IF;
  IF v_desde > contabilidad._hoy() + 90 THEN
    RAISE EXCEPTION 'La fecha de inicio no puede ser de más de tres meses adelante';
  END IF;

  SELECT id INTO v_persona FROM public.padron_socios WHERE cedula = v_cedula FOR UPDATE;
  IF v_persona IS NULL THEN
    IF nullif(btrim(p_persona ->> 'nombre'), '') IS NULL OR nullif(btrim(p_persona ->> 'apellido'), '') IS NULL THEN
      RAISE EXCEPTION 'Faltan nombre y apellido';
    END IF;
    INSERT INTO public.padron_socios (nombre, apellido, cedula, telefono, email, activo, created_by)
    VALUES (btrim(p_persona ->> 'nombre'), btrim(p_persona ->> 'apellido'), v_cedula, v_tel, v_email, false, auth.uid())
    RETURNING id INTO v_persona;
  ELSIF v_email IS NOT NULL OR v_tel IS NOT NULL THEN
    UPDATE public.padron_socios
       SET email = coalesce(email, v_email), telefono = coalesce(telefono, v_tel)
     WHERE id = v_persona AND ((email IS NULL AND v_email IS NOT NULL) OR (telefono IS NULL AND v_tel IS NOT NULL));
  END IF;

  INSERT INTO socios.staff (persona_id, disciplina_id, funcion, detalle, desde, notas)
  VALUES (v_persona, p_disciplina, p_funcion, p_detalle, v_desde, p_notas)
  RETURNING * INTO v_fila;

  PERFORM socios._registrar_cambio('staff_alta', v_persona, 'Alta en el staff: ' || socios._texto_staff(v_fila),
    NULL, jsonb_build_object('funcion', v_fila.funcion, 'detalle', v_fila.detalle, 'desde', v_fila.desde),
    v_fila.desde, false, p_disciplina);
  RETURN v_fila.id;
END;
$$;

-- ------------------------------------------------------------
-- Baja: cierra el período (no se borra).
-- ------------------------------------------------------------
CREATE FUNCTION socios.baja_staff(p_staff bigint, p_hasta date, p_motivo text DEFAULT NULL) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v socios.staff;
BEGIN
  SELECT * INTO v FROM socios.staff WHERE id = p_staff FOR UPDATE;
  IF v.id IS NULL THEN
    RAISE EXCEPTION 'No se encontró esa persona en el staff';
  END IF;
  PERFORM socios._exigir_staff(v.disciplina_id);
  IF v.hasta IS NOT NULL THEN
    RAISE EXCEPTION 'Ya tiene baja desde el %', to_char(v.hasta, 'DD/MM/YYYY');
  END IF;
  IF p_hasta IS NULL OR p_hasta < v.desde THEN
    RAISE EXCEPTION 'La baja no puede ser anterior al inicio (%)', to_char(v.desde, 'DD/MM/YYYY');
  END IF;
  UPDATE socios.staff SET hasta = p_hasta, motivo_fin = coalesce(nullif(btrim(p_motivo), ''), 'Baja')
  WHERE id = p_staff;
  PERFORM socios._registrar_cambio('staff_baja', v.persona_id, 'Baja del staff: ' || socios._texto_staff(v),
    NULL, jsonb_strip_nulls(jsonb_build_object('hasta', p_hasta, 'motivo', nullif(btrim(p_motivo), ''))),
    p_hasta + 1, false, v.disciplina_id);
END;
$$;

-- Anula una baja cargada por error: el período vuelve a quedar abierto.
CREATE FUNCTION socios.anular_baja_staff(p_staff bigint) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v socios.staff;
BEGIN
  SELECT * INTO v FROM socios.staff WHERE id = p_staff FOR UPDATE;
  IF v.id IS NULL THEN
    RAISE EXCEPTION 'No se encontró esa persona en el staff';
  END IF;
  PERFORM socios._exigir_staff(v.disciplina_id);
  IF v.hasta IS NULL THEN
    RAISE EXCEPTION 'No tiene baja';
  END IF;
  UPDATE socios.staff SET hasta = NULL, motivo_fin = NULL WHERE id = p_staff;
  PERFORM socios._registrar_cambio('staff_cambio', v.persona_id, 'Se anuló la baja del staff: ' || socios._texto_staff(v),
    jsonb_strip_nulls(jsonb_build_object('hasta', v.hasta, 'motivo', v.motivo_fin)), NULL, v.hasta, false, v.disciplina_id);
END;
$$;

-- ------------------------------------------------------------
-- Edición: función, detalle, notas, inicio y (opcional) el contacto de
-- la persona. p_contacto: {email?, telefono?} (solo las claves presentes).
-- ------------------------------------------------------------
CREATE FUNCTION socios.editar_staff(
  p_staff bigint, p_funcion text, p_detalle text, p_desde date, p_notas text DEFAULT NULL, p_contacto jsonb DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v socios.staff;
  v_nueva socios.staff;
  v_per public.padron_socios;
  v_email text;
  v_tel text;
  v_antes jsonb := '{}';
  v_despues jsonb := '{}';
BEGIN
  SELECT * INTO v FROM socios.staff WHERE id = p_staff FOR UPDATE;
  IF v.id IS NULL THEN
    RAISE EXCEPTION 'No se encontró esa persona en el staff';
  END IF;
  PERFORM socios._exigir_staff(v.disciplina_id);
  IF p_desde IS NULL OR (v.hasta IS NOT NULL AND p_desde > v.hasta) THEN
    RAISE EXCEPTION 'La fecha de inicio no puede ser posterior a la baja';
  END IF;
  IF p_contacto ? 'email' THEN
    v_email := socios._email_valido(p_contacto ->> 'email');
  END IF;

  UPDATE socios.staff SET funcion = p_funcion, detalle = p_detalle, desde = p_desde, notas = p_notas
  WHERE id = p_staff
  RETURNING * INTO v_nueva;
  IF v_nueva.funcion <> v.funcion THEN
    v_antes := v_antes || jsonb_build_object('funcion', v.funcion);
    v_despues := v_despues || jsonb_build_object('funcion', v_nueva.funcion);
  END IF;
  IF v_nueva.detalle IS DISTINCT FROM v.detalle THEN
    v_antes := v_antes || jsonb_build_object('detalle', v.detalle);
    v_despues := v_despues || jsonb_build_object('detalle', v_nueva.detalle);
  END IF;
  IF v_nueva.desde <> v.desde THEN
    v_antes := v_antes || jsonb_build_object('desde', v.desde);
    v_despues := v_despues || jsonb_build_object('desde', v_nueva.desde);
  END IF;

  IF p_contacto IS NOT NULL THEN
    SELECT * INTO v_per FROM public.padron_socios WHERE id = v.persona_id FOR UPDATE;
    v_email := CASE WHEN p_contacto ? 'email' THEN v_email ELSE v_per.email END;
    v_tel := CASE WHEN p_contacto ? 'telefono' THEN nullif(btrim(p_contacto ->> 'telefono'), '') ELSE v_per.telefono END;
    IF v_email IS DISTINCT FROM v_per.email OR v_tel IS DISTINCT FROM v_per.telefono THEN
      UPDATE public.padron_socios SET email = v_email, telefono = v_tel WHERE id = v.persona_id;
      IF v_email IS DISTINCT FROM v_per.email THEN
        v_antes := v_antes || jsonb_build_object('email', v_per.email);
        v_despues := v_despues || jsonb_build_object('email', v_email);
      END IF;
      IF v_tel IS DISTINCT FROM v_per.telefono THEN
        v_antes := v_antes || jsonb_build_object('telefono', v_per.telefono);
        v_despues := v_despues || jsonb_build_object('telefono', v_tel);
      END IF;
    END IF;
  END IF;

  IF v_despues <> '{}' THEN
    PERFORM socios._registrar_cambio('staff_cambio', v.persona_id, 'Cambio en el staff: ' || socios._texto_staff(v_nueva),
      v_antes, v_despues, NULL, false, v.disciplina_id);
  END IF;
END;
$$;

-- Quita un vínculo cargado por error (el registro de cambios lo conserva).
CREATE FUNCTION socios.eliminar_staff(p_staff bigint) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v socios.staff;
BEGIN
  SELECT * INTO v FROM socios.staff WHERE id = p_staff FOR UPDATE;
  IF v.id IS NULL THEN
    RAISE EXCEPTION 'No se encontró esa persona en el staff';
  END IF;
  PERFORM socios._exigir_staff(v.disciplina_id);
  DELETE FROM socios.staff WHERE id = p_staff;
  PERFORM socios._registrar_cambio('staff_baja', v.persona_id, 'Se quitó del staff (cargado por error): ' || socios._texto_staff(v),
    jsonb_build_object('funcion', v.funcion, 'detalle', v.detalle, 'desde', v.desde, 'hasta', v.hasta), NULL,
    NULL, false, v.disciplina_id);
END;
$$;

-- ------------------------------------------------------------
-- Lecturas
-- ------------------------------------------------------------
CREATE FUNCTION socios._staff_lista(p_disciplina integer, p_todas boolean, p_historico boolean) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  WITH hoy AS (SELECT contabilidad._hoy() AS d)
  SELECT coalesce(jsonb_agg(jsonb_build_object(
      'id', s.id, 'persona_id', p.id, 'nombre', p.nombre, 'apellido', p.apellido, 'cedula', p.cedula,
      'email', p.email, 'telefono', p.telefono,
      'disciplina_id', s.disciplina_id, 'disciplina', d.nombre,
      'funcion', s.funcion, 'detalle', s.detalle, 'desde', s.desde, 'hasta', s.hasta, 'motivo_fin', s.motivo_fin,
      'notas', s.notas,
      'estado', CASE WHEN s.desde > h.d THEN 'programado' WHEN s.hasta IS NULL OR s.hasta >= h.d THEN 'vigente' ELSE 'baja' END,
      'socio', socios.es_socio_en(p.id, h.d),
      'con_cuenta', p.perfil_id IS NOT NULL
    ) ORDER BY (s.hasta IS NOT NULL AND s.hasta < h.d),
               array_position(ARRAY['coordinador', 'entrenador', 'asistente', 'preparador_fisico', 'delegado', 'salud',
                                    'utilero', 'dirigente', 'administrativo', 'mantenimiento', 'otro'], s.funcion),
               p.apellido, p.nombre, s.desde DESC), '[]')
  FROM socios.staff s
  CROSS JOIN hoy h
  JOIN public.padron_socios p ON p.id = s.persona_id
  LEFT JOIN public.disciplinas d ON d.id = s.disciplina_id
  WHERE (p_todas OR s.disciplina_id = p_disciplina)
    AND (p_historico OR s.hasta IS NULL OR s.hasta >= h.d)
$$;

-- Staff de una disciplina (panel): sus representantes y el club.
CREATE FUNCTION socios.disc_staff(p_disciplina integer, p_historico boolean DEFAULT false) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  PERFORM socios._exigir_lectura_disciplina(p_disciplina);
  RETURN socios._staff_lista(p_disciplina, false, p_historico);
END;
$$;

-- Todo el staff del club (secretaría, tesorería, Comisión Fiscal).
CREATE FUNCTION socios.staff_club(p_historico boolean DEFAULT false) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  PERFORM socios._exigir(ARRAY['secretaria', 'tesorero', 'comision_fiscal']);
  RETURN socios._staff_lista(NULL, true, p_historico);
END;
$$;

-- ------------------------------------------------------------
-- RLS y permisos
-- ------------------------------------------------------------
ALTER TABLE socios.staff ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON socios.staff FROM PUBLIC, anon, authenticated;
GRANT SELECT ON socios.staff TO authenticated, service_role;
CREATE POLICY staff_lectura ON socios.staff FOR SELECT TO authenticated
  USING (socios.puede_leer() OR (disciplina_id IS NOT NULL AND socios._es_representante(disciplina_id)));
CREATE TRIGGER staff_auditoria AFTER INSERT OR UPDATE OR DELETE ON socios.staff
  FOR EACH ROW EXECUTE FUNCTION contabilidad._auditar();

REVOKE EXECUTE ON FUNCTION socios._staff_valido(), socios._exigir_staff(integer), socios._email_valido(text),
  socios._nombre_funcion_staff(text),
  socios._texto_staff(socios.staff), socios._staff_lista(integer, boolean, boolean)
  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION socios.alta_staff(integer, jsonb, text, text, date, text),
  socios.baja_staff(bigint, date, text), socios.anular_baja_staff(bigint),
  socios.editar_staff(bigint, text, text, date, text, jsonb), socios.eliminar_staff(bigint),
  socios.disc_staff(integer, boolean), socios.staff_club(boolean)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION socios.alta_staff(integer, jsonb, text, text, date, text),
  socios.baja_staff(bigint, date, text), socios.anular_baja_staff(bigint),
  socios.editar_staff(bigint, text, text, date, text, jsonb), socios.eliminar_staff(bigint),
  socios.disc_staff(integer, boolean), socios.staff_club(boolean)
  TO authenticated, service_role;

-- ------------------------------------------------------------
-- Datos de public.staff → socios.staff (la función sale del cargo, que
-- queda como detalle). Las filas sin cédula no tienen persona: se avisan.
-- ------------------------------------------------------------
DO $$
DECLARE
  r record;
  v_cedula text;
  v_persona integer;
  v_desde date;
  v_cargo text;
  v_funcion text;
BEGIN
  FOR r IN SELECT * FROM public.staff ORDER BY id LOOP
    v_cedula := regexp_replace(coalesce(r.cedula, ''), '[^0-9]', '', 'g');
    IF v_cedula = '' THEN
      RAISE WARNING 'Staff % (% %) sin cédula: no se copia', r.id, r.nombre, r.apellido;
      CONTINUE;
    END IF;
    SELECT id INTO v_persona FROM public.padron_socios WHERE cedula = v_cedula;
    IF v_persona IS NULL THEN
      INSERT INTO public.padron_socios (nombre, apellido, cedula, telefono, email, activo, created_by)
      VALUES (btrim(r.nombre), btrim(r.apellido), v_cedula, nullif(btrim(r.telefono), ''),
              nullif(lower(btrim(r.email)), ''), false, r.created_by)
      RETURNING id INTO v_persona;
    ELSE
      UPDATE public.padron_socios
         SET email = coalesce(email, nullif(lower(btrim(r.email)), '')),
             telefono = coalesce(telefono, nullif(btrim(r.telefono), ''))
       WHERE id = v_persona AND (email IS NULL OR telefono IS NULL);
    END IF;
    v_cargo := lower(btrim(r.cargo));
    v_funcion := CASE
      WHEN v_cargo ~ 'prep' THEN 'preparador_fisico'
      WHEN v_cargo ~ 'asist|ayudant' THEN 'asistente'
      WHEN v_cargo ~ 'coordin' THEN 'coordinador'
      WHEN v_cargo ~ 'entren|t[eé]cnic|^dt\M|profe' THEN 'entrenador'
      WHEN v_cargo ~ 'delegad' THEN 'delegado'
      WHEN v_cargo ~ 'administr' THEN 'administrativo'
      WHEN v_cargo ~ 'presiden|secretari|tesorer|vocal|dirig|comisi' THEN 'dirigente'
      WHEN v_cargo ~ 'm[eé]dic|fisio|kinesi|nutri|psic' THEN 'salud'
      WHEN v_cargo ~ 'utiler' THEN 'utilero'
      WHEN v_cargo ~ 'manten|conserj|limpi|seren|porter|cancha' THEN 'mantenimiento'
      ELSE 'otro' END;
    v_desde := coalesce(r.fecha_ingreso, r.created_at::date, contabilidad._hoy());
    INSERT INTO socios.staff (persona_id, disciplina_id, funcion, detalle, desde, hasta, motivo_fin, notas,
                              creado_por, created_at)
    VALUES (v_persona, r.disciplina_id, v_funcion, left(btrim(r.cargo), 120), v_desde,
            CASE WHEN NOT r.activo THEN greatest(v_desde, coalesce(r.updated_at::date, contabilidad._hoy())) END,
            CASE WHEN NOT r.activo THEN 'Inactivo en el sistema anterior' END,
            nullif(concat_ws(E'\n', nullif(btrim(r.descripcion), ''), nullif(btrim(r.notas), '')), ''),
            r.created_by, coalesce(r.created_at, now()));
  END LOOP;
END;
$$;

DROP TABLE public.staff;
