-- ============================================================
-- Panel de la disciplina — cambios
--
-- Cada función controla que quien la llama sea representante de esa
-- disciplina (o del club), que la persona sea de la disciplina, y delega
-- en las funciones de secretaría y tesorería. Los triggers dejan el cambio
-- en el registro con la disciplina y el origen.
--
-- Tarjetas: el número completo se valida (Luhn) y se guarda cifrado en
-- Vault solo hasta que tesorería lo carga en el portal del débito; en el
-- medio de cobro quedan los últimos 4 dígitos, el vencimiento y el emisor.
-- ============================================================

CREATE FUNCTION socios._delegar(p_on boolean DEFAULT true) RETURNS void
LANGUAGE sql SET search_path = '' AS $$ SELECT set_config('socios.delegado', CASE WHEN p_on THEN 'on' ELSE 'off' END, true) $$;

-- Número de tarjeta: 13 a 19 dígitos y dígito verificador (Luhn).
CREATE FUNCTION socios._tarjeta_valida(p_numero text) RETURNS boolean
LANGUAGE plpgsql IMMUTABLE SET search_path = '' AS $$
DECLARE
  v text := regexp_replace(coalesce(p_numero, ''), '[^0-9]', '', 'g');
  v_suma integer := 0;
  v_d integer;
  i integer;
BEGIN
  IF length(v) NOT BETWEEN 13 AND 19 THEN
    RETURN false;
  END IF;
  FOR i IN 0 .. length(v) - 1 LOOP
    v_d := substr(v, length(v) - i, 1)::integer;
    IF i % 2 = 1 THEN
      v_d := v_d * 2;
      IF v_d > 9 THEN v_d := v_d - 9; END IF;
    END IF;
    v_suma := v_suma + v_d;
  END LOOP;
  RETURN v_suma % 10 = 0;
END;
$$;

-- Prepara el medio de cobro: si trae el número completo, lo guarda
-- cifrado (lo toma el registro de cambios) y deja solo los últimos 4.
CREATE FUNCTION socios._preparar_medio(p_medio jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_num text := regexp_replace(coalesce(p_medio ->> 'tarjeta_numero', ''), '[^0-9]', '', 'g');
  v_secreto uuid;
BEGIN
  IF p_medio IS NULL THEN
    RETURN NULL;
  END IF;
  IF p_medio ->> 'medio' <> 'debito_visa' THEN
    RETURN p_medio - ARRAY['tarjeta_numero', 'tarjeta_ultimos4', 'tarjeta_vencimiento', 'tarjeta_emisor',
                           'titular_nombre', 'titular_documento'];
  END IF;
  IF v_num <> '' THEN
    IF NOT socios._tarjeta_valida(v_num) THEN
      RAISE EXCEPTION 'El número de tarjeta no es válido: revisalo';
    END IF;
    v_secreto := vault.create_secret(v_num, 'tarjeta_' || gen_random_uuid()::text,
                                     'Número de tarjeta para el débito: se borra cuando tesorería lo aplica');
    PERFORM set_config('socios.tarjeta_secreto', v_secreto::text, true);
    RETURN (p_medio - 'tarjeta_numero') || jsonb_build_object('tarjeta_ultimos4', right(v_num, 4));
  END IF;
  RETURN p_medio - 'tarjeta_numero';
END;
$$;

-- El medio de cobro ahora guarda también el emisor de la tarjeta.
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

CREATE FUNCTION socios._plan_social() RETURNS integer
LANGUAGE sql STABLE SET search_path = '' AS $$
  SELECT id FROM socios.planes WHERE tipo = 'social' AND activo ORDER BY id LIMIT 1
$$;

CREATE FUNCTION socios._exigir_persona_disciplina(p_persona integer, p_disciplina integer) RETURNS void
LANGUAGE plpgsql STABLE SET search_path = '' AS $$
BEGIN
  IF NOT socios._persona_en_disciplina(p_persona, p_disciplina) THEN
    RAISE EXCEPTION 'Esa persona no está en la disciplina' USING ERRCODE = '42501';
  END IF;
END;
$$;

CREATE FUNCTION socios._exigir_plan_disciplina(p_plan integer, p_disciplina integer) RETURNS void
LANGUAGE plpgsql STABLE SET search_path = '' AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM socios.planes WHERE id = p_plan AND disciplina_id = p_disciplina AND activo) THEN
    RAISE EXCEPTION 'El plan no es de la disciplina o está desactivado';
  END IF;
END;
$$;

-- ------------------------------------------------------------
-- Alta: socio nuevo (o reingreso) en la disciplina, o un socio que se suma
-- ------------------------------------------------------------
CREATE FUNCTION socios.disc_alta_socio(
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
    IF p_medio IS NOT NULL THEN
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

-- ------------------------------------------------------------
-- Baja de la disciplina (y, si se elige, del club)
-- ------------------------------------------------------------
CREATE FUNCTION socios.disc_baja(
  p_disciplina integer, p_persona integer, p_hasta date, p_baja_club boolean DEFAULT false, p_motivo text DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  r record;
BEGIN
  PERFORM socios._exigir_disciplina(p_disciplina);
  PERFORM socios._exigir_persona_disciplina(p_persona, p_disciplina);
  IF p_hasta IS NULL OR p_hasta < date_trunc('month', contabilidad._hoy())::date - 31 THEN
    RAISE EXCEPTION 'La baja no puede ser de más de un mes atrás';
  END IF;
  PERFORM socios._delegar();
  IF p_baja_club THEN
    IF EXISTS (SELECT 1 FROM socios.suscripciones s JOIN socios.planes pl ON pl.id = s.plan_id
               WHERE s.persona_id = p_persona AND pl.disciplina_id IS NOT NULL AND pl.disciplina_id <> p_disciplina
                 AND (s.hasta IS NULL OR s.hasta > p_hasta)) THEN
      RAISE EXCEPTION 'Esa persona está en otra disciplina: solo se la puede sacar de la tuya';
    END IF;
    PERFORM socios.dar_baja(p_persona, p_hasta, (SELECT id FROM socios.motivos_baja WHERE nombre = 'Renuncia'),
                            coalesce(nullif(btrim(p_motivo), ''), 'Baja pedida por la disciplina'), NULL);
  ELSE
    FOR r IN SELECT s.id FROM socios.suscripciones s JOIN socios.planes pl ON pl.id = s.plan_id
             WHERE s.persona_id = p_persona AND pl.disciplina_id = p_disciplina
               AND (s.hasta IS NULL OR s.hasta > p_hasta) LOOP
      PERFORM socios.finalizar_inscripcion(r.id, p_hasta, coalesce(nullif(btrim(p_motivo), ''), 'Deja la disciplina'));
    END LOOP;
  END IF;
  PERFORM socios._delegar(false);
END;
$$;

-- ------------------------------------------------------------
-- Cambio de plan (categoría) dentro de la disciplina
-- ------------------------------------------------------------
CREATE FUNCTION socios.disc_cambiar_plan(p_disciplina integer, p_suscripcion bigint, p_plan integer, p_desde date)
RETURNS bigint
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_id bigint;
BEGIN
  PERFORM socios._exigir_disciplina(p_disciplina);
  PERFORM socios._exigir_plan_disciplina(p_plan, p_disciplina);
  IF NOT EXISTS (SELECT 1 FROM socios.suscripciones s JOIN socios.planes pl ON pl.id = s.plan_id
                 WHERE s.id = p_suscripcion AND pl.disciplina_id = p_disciplina
                   AND (s.hasta IS NULL OR s.hasta >= contabilidad._hoy())) THEN
    RAISE EXCEPTION 'La inscripción no es de la disciplina o ya terminó' USING ERRCODE = '42501';
  END IF;
  PERFORM socios._delegar();
  v_id := socios.cambiar_plan(p_suscripcion, p_plan, p_desde, 'mensual');
  PERFORM socios._delegar(false);
  RETURN v_id;
END;
$$;

-- ------------------------------------------------------------
-- Medio de cobro y tarjeta
-- ------------------------------------------------------------
CREATE FUNCTION socios.disc_cambiar_medio(p_disciplina integer, p_persona integer, p_medio jsonb, p_desde date)
RETURNS bigint
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_id bigint;
BEGIN
  PERFORM socios._exigir_disciplina(p_disciplina);
  PERFORM socios._exigir_persona_disciplina(p_persona, p_disciplina);
  IF p_medio ->> 'medio' = 'transferencia_disciplina' AND (p_medio ->> 'disciplina_id')::integer <> p_disciplina THEN
    RAISE EXCEPTION 'Solo se puede indicar el pago en la cuenta de tu disciplina';
  END IF;
  PERFORM socios._delegar();
  v_id := socios.cambiar_medio_cobro(p_persona, p_medio, p_desde);
  PERFORM socios._delegar(false);
  RETURN v_id;
END;
$$;

-- ------------------------------------------------------------
-- Datos de contacto
-- ------------------------------------------------------------
CREATE FUNCTION socios.disc_actualizar_datos(p_disciplina integer, p_persona integer, p_datos jsonb) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_antes public.padron_socios;
  v_despues public.padron_socios;
  v_cambios jsonb;
BEGIN
  PERFORM socios._exigir_disciplina(p_disciplina);
  PERFORM socios._exigir_persona_disciplina(p_persona, p_disciplina);
  IF nullif(btrim(p_datos ->> 'email'), '') IS NOT NULL AND btrim(p_datos ->> 'email') !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' THEN
    RAISE EXCEPTION 'El correo no es válido';
  END IF;
  SELECT * INTO v_antes FROM public.padron_socios WHERE id = p_persona FOR UPDATE;
  UPDATE public.padron_socios SET
    email = CASE WHEN p_datos ? 'email' THEN nullif(lower(btrim(p_datos ->> 'email')), '') ELSE email END,
    telefono = CASE WHEN p_datos ? 'telefono' THEN nullif(btrim(p_datos ->> 'telefono'), '') ELSE telefono END,
    direccion = CASE WHEN p_datos ? 'direccion' THEN nullif(btrim(p_datos ->> 'direccion'), '') ELSE direccion END,
    fecha_nacimiento = CASE WHEN p_datos ? 'fecha_nacimiento' THEN nullif(p_datos ->> 'fecha_nacimiento', '')::date
                            ELSE fecha_nacimiento END,
    updated_at = now()
  WHERE id = p_persona
  RETURNING * INTO v_despues;
  SELECT jsonb_object_agg(k, to_jsonb(v_despues) -> k) INTO v_cambios
  FROM unnest(ARRAY['email', 'telefono', 'direccion', 'fecha_nacimiento']) k
  WHERE (to_jsonb(v_antes) -> k) IS DISTINCT FROM (to_jsonb(v_despues) -> k);
  IF v_cambios IS NOT NULL THEN
    PERFORM socios._registrar_cambio('datos', p_persona, 'Datos de ' || socios._nombre(p_persona) || ': '
                                     || (SELECT string_agg(k, ', ') FROM jsonb_object_keys(v_cambios) k),
      (SELECT jsonb_object_agg(k, to_jsonb(v_antes) -> k) FROM jsonb_object_keys(v_cambios) k),
      v_cambios, contabilidad._hoy(), false);
  END IF;
END;
$$;

-- ------------------------------------------------------------
-- Planes y precios de la disciplina
-- ------------------------------------------------------------
CREATE FUNCTION socios.disc_crear_plan(p_disciplina integer, p_nombre text, p_importe numeric, p_desde date)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_id integer;
  v_desde date := date_trunc('month', p_desde)::date;
BEGIN
  PERFORM socios._exigir_disciplina(p_disciplina);
  IF nullif(btrim(p_nombre), '') IS NULL OR coalesce(p_importe, 0) <= 0 THEN
    RAISE EXCEPTION 'Indicá el nombre y la cuota del plan';
  END IF;
  IF v_desde < date_trunc('month', contabilidad._hoy())::date THEN
    RAISE EXCEPTION 'El plan rige desde este mes o uno posterior';
  END IF;
  INSERT INTO socios.planes (nombre, tipo, disciplina_id, permite_anual) VALUES (btrim(p_nombre), 'disciplina', p_disciplina, false)
  RETURNING id INTO v_id;
  INSERT INTO socios.plan_precios (plan_id, vigente_desde, importe_mensual) VALUES (v_id, v_desde, round(p_importe, 2));
  PERFORM socios._registrar_cambio('plan_nuevo', NULL, 'Plan nuevo: ' || btrim(p_nombre) || ' — ' || socios._pesos(p_importe)
                                   || ' desde ' || to_char(v_desde, 'MM/YYYY'),
    NULL, jsonb_build_object('plan_id', v_id, 'plan', btrim(p_nombre), 'importe', round(p_importe, 2)), v_desde, false);
  RETURN v_id;
END;
$$;

CREATE FUNCTION socios.disc_nuevo_precio(p_disciplina integer, p_plan integer, p_importe numeric, p_desde date)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_desde date := date_trunc('month', p_desde)::date;
  v_plan socios.planes;
  v_antes numeric;
  v_debito integer;
BEGIN
  PERFORM socios._exigir_disciplina(p_disciplina);
  PERFORM socios._exigir_plan_disciplina(p_plan, p_disciplina);
  IF coalesce(p_importe, 0) <= 0 THEN
    RAISE EXCEPTION 'Indicá la cuota';
  END IF;
  IF v_desde < date_trunc('month', contabilidad._hoy())::date THEN
    RAISE EXCEPTION 'El precio nuevo rige desde este mes o uno posterior (los meses ya emitidos no cambian)';
  END IF;
  IF EXISTS (SELECT 1 FROM socios.cuotas WHERE plan_id = p_plan AND periodo_desde >= v_desde AND estado = 'emitida') THEN
    RAISE EXCEPTION 'Ya se emitieron cuotas de ese mes: el precio nuevo tiene que regir desde el mes siguiente';
  END IF;
  SELECT * INTO v_plan FROM socios.planes WHERE id = p_plan;
  v_antes := (socios.precio_vigente(p_plan, v_desde)).importe_mensual;
  SELECT count(DISTINCT s.persona_id) INTO v_debito FROM socios.suscripciones s
  WHERE s.plan_id = p_plan AND (s.hasta IS NULL OR s.hasta >= v_desde) AND socios._tiene_debito(s.persona_id, v_desde);
  INSERT INTO socios.plan_precios (plan_id, vigente_desde, importe_mensual) VALUES (p_plan, v_desde, round(p_importe, 2))
  ON CONFLICT (plan_id, vigente_desde) DO UPDATE SET importe_mensual = EXCLUDED.importe_mensual;
  PERFORM socios._registrar_cambio('precio', NULL,
    v_plan.nombre || ': ' || coalesce(socios._pesos(v_antes), '—') || ' → ' || socios._pesos(p_importe) || ' desde '
      || to_char(v_desde, 'MM/YYYY') || CASE WHEN v_debito > 0 THEN ' (' || v_debito || ' con débito)' ELSE '' END,
    jsonb_build_object('plan', v_plan.nombre, 'importe', v_antes),
    jsonb_build_object('plan_id', p_plan, 'plan', v_plan.nombre, 'importe', round(p_importe, 2), 'con_debito', v_debito),
    v_desde, v_debito > 0);
END;
$$;

-- ------------------------------------------------------------
-- Cobro que recibió la disciplina en su cuenta
-- ------------------------------------------------------------
CREATE FUNCTION socios.disc_registrar_cobro(
  p_disciplina integer, p_persona integer, p_fecha date, p_importe numeric, p_referencia text DEFAULT NULL
) RETURNS bigint
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_id bigint;
BEGIN
  PERFORM socios._exigir_disciplina(p_disciplina);
  IF NOT socios._persona_en_disciplina(p_persona, p_disciplina, false) THEN
    RAISE EXCEPTION 'Esa persona no está en la disciplina' USING ERRCODE = '42501';
  END IF;
  PERFORM socios._delegar();
  v_id := socios.registrar_cobro(p_persona, p_fecha, 'transferencia_disciplina', p_importe, NULL, p_disciplina, p_referencia);
  PERFORM socios._delegar(false);
  PERFORM socios._registrar_cambio('cobro', p_persona, 'Cobro de ' || socios._nombre(p_persona) || ' en la cuenta de la disciplina: '
                                   || socios._pesos(p_importe),
    NULL, jsonb_build_object('cobro_id', v_id, 'importe', round(p_importe, 2), 'referencia', p_referencia), p_fecha, false);
  RETURN v_id;
END;
$$;

-- ------------------------------------------------------------
-- Permisos
-- ------------------------------------------------------------
REVOKE EXECUTE ON FUNCTION socios._delegar(boolean), socios._tarjeta_valida(text), socios._preparar_medio(jsonb),
  socios._plan_social(), socios._exigir_persona_disciplina(integer, integer), socios._exigir_plan_disciplina(integer, integer)
  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION socios.disc_alta_socio(integer, jsonb, date, integer, jsonb),
  socios.disc_baja(integer, integer, date, boolean, text), socios.disc_cambiar_plan(integer, bigint, integer, date),
  socios.disc_cambiar_medio(integer, integer, jsonb, date), socios.disc_actualizar_datos(integer, integer, jsonb),
  socios.disc_crear_plan(integer, text, numeric, date), socios.disc_nuevo_precio(integer, integer, numeric, date),
  socios.disc_registrar_cobro(integer, integer, date, numeric, text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION socios.disc_alta_socio(integer, jsonb, date, integer, jsonb),
  socios.disc_baja(integer, integer, date, boolean, text), socios.disc_cambiar_plan(integer, bigint, integer, date),
  socios.disc_cambiar_medio(integer, integer, jsonb, date), socios.disc_actualizar_datos(integer, integer, jsonb),
  socios.disc_crear_plan(integer, text, numeric, date), socios.disc_nuevo_precio(integer, integer, numeric, date),
  socios.disc_registrar_cobro(integer, integer, date, numeric, text)
  TO authenticated, service_role;
