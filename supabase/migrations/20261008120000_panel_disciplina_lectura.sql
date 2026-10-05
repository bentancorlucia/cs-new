-- ============================================================
-- Panel de la disciplina — lecturas
-- Las usan los representantes (solo su disciplina) y el club. Devuelven
-- jsonb para que el panel no necesite acceso directo a las tablas.
-- ============================================================

-- Disciplinas a las que entra el usuario.
CREATE FUNCTION socios.mis_disciplinas()
RETURNS TABLE (disciplina_id integer, nombre text, slug text, representante boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT d.id, d.nombre::text, d.slug::text, socios._es_representante(d.id)
  FROM public.disciplinas d
  WHERE socios._es_representante(d.id)
     OR contabilidad._tiene_rol(ARRAY['super_admin', 'secretaria', 'tesorero', 'comision_fiscal'])
  ORDER BY socios._es_representante(d.id) DESC, d.nombre
$$;

-- ¿La persona está (o estuvo) en la disciplina?
CREATE FUNCTION socios._persona_en_disciplina(p_persona integer, p_disciplina integer, p_vigente boolean DEFAULT true)
RETURNS boolean
LANGUAGE sql STABLE SET search_path = '' AS $$
  SELECT EXISTS (SELECT 1 FROM socios.suscripciones s JOIN socios.planes pl ON pl.id = s.plan_id
                 WHERE s.persona_id = p_persona AND pl.disciplina_id = p_disciplina
                   AND (NOT p_vigente OR s.hasta IS NULL OR s.hasta >= contabilidad._hoy()))
$$;

-- Socios de la disciplina con sus planes, medio de cobro y situación.
CREATE FUNCTION socios.disc_socios(p_disciplina integer, p_historico boolean DEFAULT false) RETURNS jsonb
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

-- Planes de la disciplina: precios (vigente y próximos), inscriptos, y la
-- cuota social (lo que paga el socio es social + plan).
CREATE FUNCTION socios.disc_planes(p_disciplina integer) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_hoy date := contabilidad._hoy();
  v_mes date := date_trunc('month', contabilidad._hoy())::date;
BEGIN
  PERFORM socios._exigir_lectura_disciplina(p_disciplina);
  RETURN jsonb_build_object(
    'cuota_social', (SELECT max((socios.precio_vigente(id, v_mes)).importe_mensual) FROM socios.planes
                     WHERE tipo = 'social' AND activo),
    'planes', (SELECT coalesce(jsonb_agg(jsonb_build_object(
        'plan_id', pl.id, 'nombre', pl.nombre, 'activo', pl.activo, 'permite_anual', pl.permite_anual,
        'precio_vigente', (socios.precio_vigente(pl.id, v_mes)).importe_mensual,
        'precios', (SELECT coalesce(jsonb_agg(jsonb_build_object('vigente_desde', pp.vigente_desde,
                       'importe_mensual', pp.importe_mensual, 'importe_anual', pp.importe_anual) ORDER BY pp.vigente_desde DESC), '[]')
                    FROM socios.plan_precios pp WHERE pp.plan_id = pl.id),
        'inscriptos', (SELECT count(DISTINCT s.persona_id) FROM socios.suscripciones s
                       WHERE s.plan_id = pl.id AND s.desde <= v_hoy AND (s.hasta IS NULL OR s.hasta >= v_hoy)),
        'con_debito', (SELECT count(DISTINCT s.persona_id) FROM socios.suscripciones s
                       WHERE s.plan_id = pl.id AND s.desde <= v_hoy AND (s.hasta IS NULL OR s.hasta >= v_hoy)
                         AND socios._tiene_debito(s.persona_id, v_hoy))
      ) ORDER BY pl.activo DESC, pl.nombre), '[]')
      FROM socios.planes pl WHERE pl.disciplina_id = p_disciplina));
END;
$$;

-- Resumen de una liquidación: también para los representantes de esa disciplina.
CREATE OR REPLACE FUNCTION socios.resumen_liquidacion(p_liquidacion bigint) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  PERFORM socios._exigir_lectura_disciplina((SELECT disciplina_id FROM socios.liquidaciones_disciplina WHERE id = p_liquidacion));
  RETURN socios._resumen_liquidacion(p_liquidacion);
END;
$$;

CREATE FUNCTION socios.disc_liquidaciones(p_disciplina integer) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  PERFORM socios._exigir_lectura_disciplina(p_disciplina);
  RETURN (SELECT coalesce(jsonb_agg(socios._resumen_liquidacion(id) - 'detalle' ORDER BY periodo DESC, id DESC), '[]')
          FROM socios.liquidaciones_disciplina WHERE disciplina_id = p_disciplina AND estado = 'vigente');
END;
$$;

-- Cuenta con el club: saldos, movimientos (compras en la tienda,
-- liquidaciones, pagos, préstamos) y planes de pago.
CREATE FUNCTION socios.disc_cuenta(p_disciplina integer) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_out jsonb;
BEGIN
  PERFORM socios._exigir_lectura_disciplina(p_disciplina);
  PERFORM set_config('socios.delegado', 'on', true);
  SELECT jsonb_build_object(
    'saldos', (SELECT to_jsonb(s) FROM socios.saldos_disciplinas() s WHERE s.disciplina_id = p_disciplina),
    'movimientos', (SELECT coalesce(jsonb_agg(to_jsonb(m) ORDER BY m.fecha DESC, m.numero DESC NULLS LAST), '[]')
                    FROM socios.cuenta_corriente_disciplina(p_disciplina) m),
    'planes_pago', (SELECT coalesce(jsonb_agg(to_jsonb(r) || jsonb_build_object('cuotas',
                      (SELECT coalesce(jsonb_agg(to_jsonb(c) ORDER BY c.numero), '[]') FROM socios.plan_pago_cuotas_saldo c
                       WHERE c.plan_id = r.id)) ORDER BY r.created_at DESC), '[]')
                    FROM socios.planes_pago_resumen r WHERE r.disciplina_id = p_disciplina),
    'liquidaciones_pendientes', (SELECT coalesce(jsonb_agg(jsonb_build_object('id', l.id, 'periodo', l.periodo,
                                   'importe', l.importe, 'saldo', l.saldo) ORDER BY l.periodo), '[]')
                                 FROM socios.liquidaciones_disciplina_saldo l
                                 WHERE l.disciplina_id = p_disciplina AND l.estado = 'vigente' AND l.saldo > 0)
  ) INTO v_out;
  PERFORM set_config('socios.delegado', 'off', true);
  RETURN v_out;
END;
$$;

-- Registro de cambios de la disciplina (sin el número de tarjeta).
CREATE FUNCTION socios.disc_cambios(p_disciplina integer, p_limite integer DEFAULT 500) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  PERFORM socios._exigir_lectura_disciplina(p_disciplina);
  RETURN (SELECT coalesce(jsonb_agg(to_jsonb(c) - 'tarjeta_secreto_id'
                                    || jsonb_build_object('tarjeta_pendiente', c.tarjeta_secreto_id IS NOT NULL)
                                    ORDER BY c.created_at DESC, c.id DESC), '[]')
          FROM (SELECT * FROM socios.cambios_disciplina WHERE disciplina_id = p_disciplina
                ORDER BY created_at DESC, id DESC LIMIT p_limite) c);
END;
$$;

-- Tablero de la disciplina.
CREATE FUNCTION socios.disc_resumen(p_disciplina integer) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_hoy date := contabilidad._hoy();
  v_mes date := date_trunc('month', contabilidad._hoy())::date;
  v_out jsonb;
BEGIN
  PERFORM socios._exigir_lectura_disciplina(p_disciplina);
  PERFORM set_config('socios.delegado', 'on', true);
  SELECT jsonb_build_object(
    'disciplina', (SELECT jsonb_build_object('id', id, 'nombre', nombre, 'slug', slug, 'activa', activa)
                   FROM public.disciplinas WHERE id = p_disciplina),
    'socios', (SELECT count(DISTINCT s.persona_id) FROM socios.suscripciones s JOIN socios.planes pl ON pl.id = s.plan_id
               WHERE pl.disciplina_id = p_disciplina AND s.desde <= v_hoy AND (s.hasta IS NULL OR s.hasta >= v_hoy)),
    'altas_mes', (SELECT count(*) FROM socios.cambios_disciplina WHERE disciplina_id = p_disciplina
                  AND tipo = 'inscripcion' AND vigencia >= v_mes),
    'bajas_mes', (SELECT count(*) FROM socios.cambios_disciplina WHERE disciplina_id = p_disciplina
                  AND tipo = 'fin_inscripcion' AND vigencia >= v_mes),
    'con_debito', (SELECT count(DISTINCT s.persona_id) FROM socios.suscripciones s JOIN socios.planes pl ON pl.id = s.plan_id
                   WHERE pl.disciplina_id = p_disciplina AND s.desde <= v_hoy AND (s.hasta IS NULL OR s.hasta >= v_hoy)
                     AND socios._tiene_debito(s.persona_id, v_hoy)),
    'morosos', (SELECT count(*) FROM socios.situacion(v_hoy) st
                WHERE NOT st.al_dia AND socios._persona_en_disciplina(st.persona_id, p_disciplina)),
    'deuda_socios', (SELECT coalesce(sum(s.saldo), 0) FROM socios.cuotas c JOIN socios.cuotas_saldo s ON s.id = c.id
                     WHERE c.tipo = 'disciplina' AND c.disciplina_id = p_disciplina AND c.estado = 'emitida'
                       AND c.fecha_vencimiento < v_hoy),
    'cuenta', (SELECT to_jsonb(s) FROM socios.saldos_disciplinas() s WHERE s.disciplina_id = p_disciplina),
    'ultima_liquidacion', (SELECT socios._resumen_liquidacion(id) - 'detalle' FROM socios.liquidaciones_disciplina
                           WHERE disciplina_id = p_disciplina AND estado = 'vigente' ORDER BY periodo DESC LIMIT 1),
    'cambios_pendientes', (SELECT count(*) FROM socios.cambios_disciplina WHERE disciplina_id = p_disciplina
                           AND estado_debito = 'pendiente'),
    'representantes', (SELECT coalesce(jsonb_agg(jsonb_build_object('id', id, 'nombre', nombre, 'email', email,
                         'cargo', cargo, 'recibe_liquidacion', recibe_liquidacion, 'acceso_panel', acceso_panel,
                         'con_cuenta', perfil_id IS NOT NULL) ORDER BY nombre), '[]')
                       FROM socios.representantes WHERE disciplina_id = p_disciplina AND activo)
  ) INTO v_out;
  PERFORM set_config('socios.delegado', 'off', true);
  RETURN v_out;
END;
$$;

REVOKE EXECUTE ON FUNCTION socios._persona_en_disciplina(integer, integer, boolean) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION socios.mis_disciplinas(), socios.disc_socios(integer, boolean), socios.disc_planes(integer),
  socios.disc_liquidaciones(integer), socios.disc_cuenta(integer), socios.disc_cambios(integer, integer),
  socios.disc_resumen(integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION socios.mis_disciplinas(), socios.disc_socios(integer, boolean), socios.disc_planes(integer),
  socios.disc_liquidaciones(integer), socios.disc_cuenta(integer), socios.disc_cambios(integer, integer),
  socios.disc_resumen(integer) TO authenticated, service_role;
