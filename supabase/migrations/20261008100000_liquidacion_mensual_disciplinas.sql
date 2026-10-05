-- ============================================================
-- Disciplinas — liquidación mensual como la lleva tesorería
-- (planilla "LIQUIDACION 2025 - DEBITO VISA")
--
-- Cada mes, por disciplina:
--   Cobrado por débito Visa de sus socios (la cuota entera: social + disciplina)
--   − gastos del débito (comisión + IVA de la comisión), en proporción a lo
--     cobrado (sobre la cuota entera, también la parte social)
--   − cuota social de cada socio de la disciplina, aunque la tarjeta haya
--     rebotado o pague por otro medio: la que no se cobró la pone la
--     disciplina (ella le cobra al socio)
--   + cuotas de la disciplina cobradas por otros medios (club o cuenta de la
--     disciplina)
--   = a pagar a la disciplina, o a depositar si da negativo.
--
-- En los libros:
--   * La cuota social de un socio de disciplinas queda a cargo de una sola
--     disciplina: la de su inscripción más antigua del mes
--     (cuotas.disciplina_responsable_id).
--   * Visa: la comisión y su IVA van por separado; los gastos de cada
--     disciplina son los de todo lo cobrado de sus socios (cuota social
--     incluida) por su porcentaje.
--   * Liquidación (un asiento):
--       Debe transferencias a disciplinas (centro): cuotas de la disciplina
--         cobradas − gastos del débito
--       Haber cuotas sociales a cobrar: la social impaga del mes, que pone
--         la disciplina (cobro "a cargo de la disciplina" en cada cuota)
--       Haber liquidaciones a pagar (si da a favor de la disciplina) o
--       Debe fondos en poder de la disciplina (si tiene que depositar).
--   * Período = mes del débito. El Visa de ese mes cuenta entero (aunque se
--     acredite al mes siguiente); lo demás, por fecha de aplicación.
-- ============================================================

-- ------------------------------------------------------------
-- Débito Visa: comisión e IVA por separado
-- ------------------------------------------------------------
ALTER TABLE socios.liquidaciones_visa ADD COLUMN iva numeric(14, 2) NOT NULL DEFAULT 0 CHECK (iva >= 0);
ALTER TABLE socios.liquidaciones_visa DROP CONSTRAINT liquidaciones_visa_check;
ALTER TABLE socios.liquidaciones_visa ADD CONSTRAINT liquidaciones_visa_gastos CHECK (comision >= 0 AND comision + iva < bruto);

-- Gastos de cada disciplina: lo cobrado de sus socios y su parte de
-- comisión e IVA (importe = comisión + IVA).
ALTER TABLE socios.liquidacion_visa_comisiones
  ADD COLUMN cobrado numeric(14, 2) NOT NULL DEFAULT 0 CHECK (cobrado >= 0),
  ADD COLUMN comision numeric(14, 2) NOT NULL DEFAULT 0 CHECK (comision >= 0),
  ADD COLUMN iva numeric(14, 2) NOT NULL DEFAULT 0 CHECK (iva >= 0);
UPDATE socios.liquidacion_visa_comisiones SET comision = importe WHERE true;
ALTER TABLE socios.liquidacion_visa_comisiones ADD CONSTRAINT liquidacion_visa_comisiones_suma CHECK (importe = comision + iva);

-- ------------------------------------------------------------
-- Cuota social: qué disciplina responde por ella
-- ------------------------------------------------------------
ALTER TABLE socios.cuotas ADD COLUMN disciplina_responsable_id integer REFERENCES public.disciplinas (id) ON DELETE RESTRICT;
ALTER TABLE socios.cuotas ADD CONSTRAINT cuotas_responsable_social CHECK (disciplina_responsable_id IS NULL OR tipo = 'social');
CREATE INDEX cuotas_responsable_idx ON socios.cuotas (disciplina_responsable_id, periodo_desde)
  WHERE disciplina_responsable_id IS NOT NULL;

-- La disciplina de la inscripción más antigua de la persona en el período.
CREATE FUNCTION socios._disciplina_principal(p_persona integer, p_desde date, p_hasta date) RETURNS integer
LANGUAGE sql STABLE SET search_path = '' AS $$
  SELECT pl.disciplina_id
  FROM socios.suscripciones s JOIN socios.planes pl ON pl.id = s.plan_id
  WHERE s.persona_id = p_persona AND pl.tipo = 'disciplina'
    AND s.desde <= p_hasta AND (s.hasta IS NULL OR s.hasta >= p_desde)
  ORDER BY s.desde, s.id
  LIMIT 1
$$;

CREATE FUNCTION socios._cuota_responsable() RETURNS trigger
LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  IF NEW.tipo = 'social' AND NEW.periodicidad = 'mensual' THEN
    NEW.disciplina_responsable_id := socios._disciplina_principal(NEW.persona_id, NEW.periodo_desde, NEW.periodo_hasta);
  ELSE
    NEW.disciplina_responsable_id := NULL;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER cuotas_responsable BEFORE INSERT ON socios.cuotas
  FOR EACH ROW EXECUTE FUNCTION socios._cuota_responsable();

ALTER TABLE socios.cuotas DISABLE TRIGGER cuotas_valida;
UPDATE socios.cuotas SET disciplina_responsable_id = socios._disciplina_principal(persona_id, periodo_desde, periodo_hasta)
WHERE tipo = 'social' AND periodicidad = 'mensual';
ALTER TABLE socios.cuotas ENABLE TRIGGER cuotas_valida;

-- ------------------------------------------------------------
-- Cobros: la cuota social que pone la disciplina al liquidar
-- ------------------------------------------------------------
ALTER TABLE socios.cobros ADD COLUMN liquidacion_disciplina_id bigint
  REFERENCES socios.liquidaciones_disciplina (id) ON DELETE RESTRICT;
ALTER TABLE socios.cobros DROP CONSTRAINT cobros_medio_check, DROP CONSTRAINT cobros_check, DROP CONSTRAINT cobros_check1;
ALTER TABLE socios.cobros
  ADD CONSTRAINT cobros_medio_check CHECK (medio IN ('debito_visa', 'transferencia_club', 'transferencia_disciplina',
                                                    'efectivo', 'liquidacion_disciplina')),
  ADD CONSTRAINT cobros_disciplina CHECK ((medio IN ('transferencia_disciplina', 'liquidacion_disciplina')) = (disciplina_id IS NOT NULL)),
  ADD CONSTRAINT cobros_cuenta CHECK ((medio IN ('transferencia_disciplina', 'liquidacion_disciplina')) = (cuenta_id IS NULL)),
  ADD CONSTRAINT cobros_liquidacion_disciplina CHECK ((medio = 'liquidacion_disciplina') = (liquidacion_disciplina_id IS NOT NULL));
CREATE INDEX cobros_liquidacion_disciplina_idx ON socios.cobros (liquidacion_disciplina_id) WHERE liquidacion_disciplina_id IS NOT NULL;
-- La referencia de estos cobros es descriptiva (se repite en cada socio):
-- no es una referencia bancaria.
DROP INDEX socios.cobros_referencia_unica;
CREATE UNIQUE INDEX cobros_referencia_unica ON socios.cobros (medio, lower(btrim(referencia)))
  WHERE referencia IS NOT NULL AND estado = 'vigente' AND medio NOT IN ('debito_visa', 'liquidacion_disciplina');

-- ------------------------------------------------------------
-- Liquidaciones: mensuales y con el detalle de la planilla
-- ------------------------------------------------------------
ALTER TABLE socios.liquidaciones_disciplina
  DROP CONSTRAINT liquidaciones_disciplina_check1,
  DROP CONSTRAINT liquidaciones_disciplina_importe_check,
  ADD COLUMN periodo date,
  -- Débito Visa de sus socios: todo (social incluida) y la parte social.
  ADD COLUMN visa_cobrado numeric(14, 2) NOT NULL DEFAULT 0,
  ADD COLUMN visa_social numeric(14, 2) NOT NULL DEFAULT 0,
  -- Cuotas de la disciplina cobradas por otros medios.
  ADD COLUMN otros_cobrado numeric(14, 2) NOT NULL DEFAULT 0,
  ADD COLUMN gastos_comision numeric(14, 2) NOT NULL DEFAULT 0,
  ADD COLUMN gastos_iva numeric(14, 2) NOT NULL DEFAULT 0,
  -- Cuota social impaga del mes que pone la disciplina.
  ADD COLUMN social_a_cargo numeric(14, 2) NOT NULL DEFAULT 0,
  ADD COLUMN socios integer NOT NULL DEFAULT 0,
  ADD COLUMN cuota_social numeric(12, 2) NOT NULL DEFAULT 0,
  -- Lo que la disciplina tiene que depositar (resultado negativo).
  ADD COLUMN a_depositar numeric(14, 2) NOT NULL DEFAULT 0,
  ADD COLUMN detalle jsonb NOT NULL DEFAULT '[]';

ALTER TABLE socios.liquidaciones_disciplina DISABLE TRIGGER liquidaciones_disciplina_valido;
UPDATE socios.liquidaciones_disciplina SET periodo = date_trunc('month', desde)::date WHERE periodo IS NULL;
ALTER TABLE socios.liquidaciones_disciplina ENABLE TRIGGER liquidaciones_disciplina_valido;

ALTER TABLE socios.liquidaciones_disciplina
  ALTER COLUMN periodo SET NOT NULL,
  ADD CONSTRAINT liquidaciones_disciplina_periodo CHECK (periodo = date_trunc('month', periodo)::date),
  ADD CONSTRAINT liquidaciones_disciplina_importes CHECK (
    importe >= 0 AND a_depositar >= 0 AND (importe = 0 OR a_depositar = 0)
    AND visa_cobrado >= 0 AND visa_social >= 0 AND otros_cobrado >= 0 AND social_a_cargo >= 0
    AND gastos_comision >= 0 AND gastos_iva >= 0),
  -- A pagar − a depositar = cuotas de la disciplina cobradas − gastos − social que pone.
  ADD CONSTRAINT liquidaciones_disciplina_resultado CHECK (importe - a_depositar = cobrado - comision - social_a_cargo);
CREATE UNIQUE INDEX liquidaciones_disciplina_mes ON socios.liquidaciones_disciplina (disciplina_id, periodo)
  WHERE estado = 'vigente';

-- La vista de saldos se rehace para tomar las columnas nuevas (l.*).
DROP VIEW socios.liquidaciones_disciplina_saldo;
CREATE VIEW socios.liquidaciones_disciplina_saldo WITH (security_invoker = true) AS
SELECT l.*,
  coalesce(p.transferido, 0) AS transferido,
  coalesce(p.compensado, 0) AS compensado,
  CASE WHEN l.estado = 'anulada' THEN 0
       ELSE l.importe - coalesce(p.transferido, 0) - coalesce(p.compensado, 0) END AS saldo
FROM socios.liquidaciones_disciplina l
LEFT JOIN (SELECT liquidacion_id, sum(transferido) AS transferido, sum(compensado) AS compensado
           FROM socios.pagos_liquidacion WHERE estado = 'vigente' GROUP BY liquidacion_id) p
  ON p.liquidacion_id = l.id;
GRANT SELECT ON socios.liquidaciones_disciplina_saldo TO authenticated, service_role;

-- ------------------------------------------------------------
-- Qué entra en la liquidación de un mes
-- ------------------------------------------------------------
-- Una aplicación es "del débito" si es la del propio cobro Visa (mismo
-- asiento); las de saldo a favor van por su fecha como cualquier otra.
CREATE FUNCTION socios._aplicaciones_liquidables(p_disciplina integer, p_periodo date)
RETURNS TABLE (aplicacion_id bigint, persona_id integer, cuota_id bigint, cuota_tipo text, via text, importe numeric)
LANGUAGE sql STABLE SET search_path = '' AS $$
  WITH m AS (SELECT date_trunc('month', p_periodo)::date AS ini,
                    (date_trunc('month', p_periodo) + interval '1 month - 1 day')::date AS fin)
  -- Débito Visa del mes: cuotas de la disciplina y sociales a su cargo.
  SELECT a.id, a.persona_id, c.id, c.tipo, 'visa', a.importe
  FROM socios.aplicaciones a
  JOIN socios.cobros b ON b.id = a.cobro_id
  JOIN socios.liquidaciones_visa v ON v.id = b.liquidacion_visa_id
  JOIN socios.cuotas c ON c.id = a.cuota_id
  CROSS JOIN m
  WHERE NOT a.anulada AND b.estado = 'vigente' AND v.estado = 'vigente' AND v.periodo = m.ini
    AND a.asiento_id = b.asiento_id
    AND ((c.tipo = 'disciplina' AND c.disciplina_id = p_disciplina) OR c.disciplina_responsable_id = p_disciplina)
  UNION ALL
  -- Otros medios en el mes: solo las cuotas de la disciplina (la social
  -- cobrada por el club es del club; la cobrada en la cuenta de la
  -- disciplina ya es deuda de ella).
  SELECT a.id, a.persona_id, c.id, c.tipo, 'otro', a.importe
  FROM socios.aplicaciones a
  JOIN socios.cobros b ON b.id = a.cobro_id
  JOIN socios.cuotas c ON c.id = a.cuota_id
  CROSS JOIN m
  WHERE NOT a.anulada AND a.fecha BETWEEN m.ini AND m.fin
    AND c.tipo = 'disciplina' AND c.disciplina_id = p_disciplina
    AND b.medio <> 'liquidacion_disciplina'
    AND NOT (b.medio = 'debito_visa' AND a.asiento_id = b.asiento_id)
$$;

-- Cuotas sociales del mes a cargo de la disciplina que siguen impagas.
CREATE FUNCTION socios._social_impaga(p_disciplina integer, p_periodo date)
RETURNS TABLE (cuota_id bigint, persona_id integer, cuenta_cobrar_id uuid, saldo numeric)
LANGUAGE sql STABLE SET search_path = '' AS $$
  SELECT c.id, c.persona_id, c.cuenta_cobrar_id, s.saldo
  FROM socios.cuotas c JOIN socios.cuotas_saldo s ON s.id = c.id
  WHERE c.disciplina_responsable_id = p_disciplina AND c.estado = 'emitida' AND c.periodicidad = 'mensual'
    AND c.periodo_desde = date_trunc('month', p_periodo)::date AND s.saldo > 0
$$;

-- Socios de la disciplina en el mes (inscripción vigente en algún día).
CREATE FUNCTION socios._socios_disciplina_mes(p_disciplina integer, p_periodo date)
RETURNS TABLE (persona_id integer, planes text)
LANGUAGE sql STABLE SET search_path = '' AS $$
  SELECT s.persona_id, string_agg(DISTINCT pl.nombre, ', ')
  FROM socios.suscripciones s JOIN socios.planes pl ON pl.id = s.plan_id
  WHERE pl.disciplina_id = p_disciplina
    AND s.desde <= (date_trunc('month', p_periodo) + interval '1 month - 1 day')::date
    AND (s.hasta IS NULL OR s.hasta >= date_trunc('month', p_periodo)::date)
  GROUP BY s.persona_id
$$;

-- Detalle por persona (para el resumen y el mail a la disciplina).
CREATE FUNCTION socios._detalle_liquidacion(p_disciplina integer, p_periodo date) RETURNS jsonb
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

-- ------------------------------------------------------------
-- Previsualizar el mes de una disciplina
-- ------------------------------------------------------------
DROP FUNCTION socios.previsualizar_liquidacion_disciplina(integer, date, date);
CREATE FUNCTION socios.previsualizar_liquidacion_disciplina(p_disciplina integer, p_periodo date)
RETURNS TABLE (
  periodo date, visa_cargada boolean, socios_mes integer, cuota_social numeric,
  visa_cobrado numeric, visa_social numeric, otros_cobrado numeric,
  gastos_comision numeric, gastos_iva numeric, social_a_cargo numeric,
  cobrado numeric, comision numeric, resultado numeric, a_pagar numeric, a_depositar numeric,
  deuda_disciplina numeric, ya_liquidado boolean
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
#variable_conflict use_column
DECLARE
  v_ini date := date_trunc('month', p_periodo)::date;
BEGIN
  PERFORM socios._exigir(ARRAY['tesorero', 'comision_fiscal', 'secretaria']);
  periodo := v_ini;
  visa_cargada := EXISTS (SELECT 1 FROM socios.liquidaciones_visa WHERE estado = 'vigente' AND liquidaciones_visa.periodo = v_ini);
  SELECT count(*) INTO socios_mes FROM socios._socios_disciplina_mes(p_disciplina, v_ini);
  SELECT coalesce(max((socios.precio_vigente(pl.id, v_ini)).importe_mensual), 0) INTO cuota_social
  FROM socios.planes pl WHERE pl.tipo = 'social' AND pl.activo;
  SELECT coalesce(sum(a.importe) FILTER (WHERE a.via = 'visa'), 0),
         coalesce(sum(a.importe) FILTER (WHERE a.via = 'visa' AND a.cuota_tipo = 'social'), 0),
         coalesce(sum(a.importe) FILTER (WHERE a.via = 'otro'), 0)
    INTO visa_cobrado, visa_social, otros_cobrado
  FROM socios._aplicaciones_liquidables(p_disciplina, v_ini) a;
  SELECT coalesce(sum(k.comision), 0), coalesce(sum(k.iva), 0) INTO gastos_comision, gastos_iva
  FROM socios.liquidacion_visa_comisiones k JOIN socios.liquidaciones_visa v ON v.id = k.liquidacion_visa_id
  WHERE v.estado = 'vigente' AND v.periodo = v_ini AND k.disciplina_id = p_disciplina;
  SELECT coalesce(sum(i.saldo), 0) INTO social_a_cargo FROM socios._social_impaga(p_disciplina, v_ini) i;
  cobrado := visa_cobrado - visa_social + otros_cobrado;
  comision := gastos_comision + gastos_iva;
  resultado := cobrado - comision - social_a_cargo;
  a_pagar := greatest(resultado, 0);
  a_depositar := greatest(-resultado, 0);
  deuda_disciplina := socios._deuda_disciplina(p_disciplina);
  ya_liquidado := EXISTS (SELECT 1 FROM socios.liquidaciones_disciplina l
                          WHERE l.disciplina_id = p_disciplina AND l.estado = 'vigente'
                            AND daterange(l.desde, l.hasta, '[]')
                                && daterange(v_ini, (v_ini + interval '1 month - 1 day')::date, '[]'));
  RETURN NEXT;
END;
$$;

-- Todas las disciplinas del mes (pantalla de tesorería).
CREATE FUNCTION socios.previsualizar_liquidaciones_mes(p_periodo date)
RETURNS TABLE (
  disciplina_id integer, disciplina text, periodo date, visa_cargada boolean, socios_mes integer, cuota_social numeric,
  visa_cobrado numeric, visa_social numeric, otros_cobrado numeric,
  gastos_comision numeric, gastos_iva numeric, social_a_cargo numeric,
  cobrado numeric, comision numeric, resultado numeric, a_pagar numeric, a_depositar numeric,
  deuda_disciplina numeric, ya_liquidado boolean, liquidacion_id bigint
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
#variable_conflict use_column
DECLARE
  d record;
  p record;
BEGIN
  PERFORM socios._exigir(ARRAY['tesorero', 'comision_fiscal', 'secretaria']);
  FOR d IN SELECT id, nombre FROM public.disciplinas ORDER BY nombre LOOP
    SELECT * INTO p FROM socios.previsualizar_liquidacion_disciplina(d.id, p_periodo);
    CONTINUE WHEN p.socios_mes = 0 AND p.visa_cobrado = 0 AND p.otros_cobrado = 0 AND p.social_a_cargo = 0
                  AND NOT p.ya_liquidado;
    disciplina_id := d.id; disciplina := d.nombre;
    periodo := p.periodo; visa_cargada := p.visa_cargada; socios_mes := p.socios_mes; cuota_social := p.cuota_social;
    visa_cobrado := p.visa_cobrado; visa_social := p.visa_social; otros_cobrado := p.otros_cobrado;
    gastos_comision := p.gastos_comision; gastos_iva := p.gastos_iva; social_a_cargo := p.social_a_cargo;
    cobrado := p.cobrado; comision := p.comision; resultado := p.resultado; a_pagar := p.a_pagar;
    a_depositar := p.a_depositar; deuda_disciplina := p.deuda_disciplina; ya_liquidado := p.ya_liquidado;
    SELECT l.id INTO liquidacion_id FROM socios.liquidaciones_disciplina l
    WHERE l.disciplina_id = d.id AND l.periodo = p.periodo AND l.estado = 'vigente';
    RETURN NEXT;
  END LOOP;
END;
$$;

-- ------------------------------------------------------------
-- Liquidar
-- ------------------------------------------------------------
DROP FUNCTION socios.liquidar_disciplina(integer, date, date, date, text);

CREATE FUNCTION socios._liquidar_disciplina(p_disciplina integer, p_periodo date, p_fecha date, p_notas text)
RETURNS bigint
LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE
  v_ini date := date_trunc('month', p_periodo)::date;
  v_fin date := (date_trunc('month', p_periodo) + interval '1 month - 1 day')::date;
  v_p record;
  v_id bigint;
  v_asiento uuid;
  v_nombre text;
  v_neto_disc numeric;
  v_lineas jsonb := '[]';
  v_cobro bigint;
  r record;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('socios.liquidacion_disciplina'), p_disciplina);
  SELECT * INTO v_p FROM socios.previsualizar_liquidacion_disciplina(p_disciplina, v_ini);
  IF v_p.ya_liquidado THEN
    RAISE EXCEPTION 'Ese mes ya se liquidó a la disciplina';
  END IF;
  IF p_fecha IS NULL OR p_fecha < v_ini THEN
    RAISE EXCEPTION 'La fecha de la liquidación no puede ser anterior al mes que se liquida';
  END IF;
  v_neto_disc := v_p.cobrado - v_p.comision;
  IF v_neto_disc = 0 AND v_p.social_a_cargo = 0 THEN
    RAISE EXCEPTION 'No hay nada para liquidar en el mes';
  END IF;
  SELECT nombre INTO v_nombre FROM public.disciplinas WHERE id = p_disciplina;
  v_id := nextval(pg_get_serial_sequence('socios.liquidaciones_disciplina', 'id'));

  -- Cuotas de la disciplina cobradas, menos los gastos del débito.
  IF v_neto_disc <> 0 THEN
    v_lineas := v_lineas || jsonb_build_object('cuenta_id', contabilidad.cuenta_para('socios', 'liquidacion_disciplinas'),
      'lado', CASE WHEN v_neto_disc > 0 THEN 'debe' ELSE 'haber' END, 'importe', abs(v_neto_disc),
      'centro_costo_id', socios._centro_disciplina(p_disciplina),
      'descripcion', 'Cuotas cobradas de ' || v_nombre || ' menos gastos del débito');
  END IF;
  -- La cuota social impaga del mes la pone la disciplina.
  SELECT v_lineas || coalesce(jsonb_agg(jsonb_build_object('cuenta_id', cuenta_cobrar_id, 'lado', 'haber',
           'importe', total, 'descripcion', 'Cuota social a cargo de ' || v_nombre)), '[]')
    INTO v_lineas
  FROM (SELECT cuenta_cobrar_id, sum(saldo) AS total FROM socios._social_impaga(p_disciplina, v_ini)
        GROUP BY cuenta_cobrar_id) x;
  -- Resultado: deuda del club con la disciplina, o de la disciplina con el club.
  IF v_p.resultado > 0 THEN
    v_lineas := v_lineas || jsonb_build_object('cuenta_id', contabilidad.cuenta_para('socios', 'liquidaciones_a_pagar'),
      'lado', 'haber', 'importe', v_p.resultado, 'disciplina_id', p_disciplina, 'descripcion', 'A pagar a ' || v_nombre);
  ELSIF v_p.resultado < 0 THEN
    v_lineas := v_lineas || jsonb_build_object('cuenta_id', contabilidad.cuenta_para('socios', 'disciplinas'),
      'lado', 'debe', 'importe', -v_p.resultado, 'disciplina_id', p_disciplina,
      'descripcion', v_nombre || ' tiene que depositar');
  END IF;

  v_asiento := contabilidad._asiento_automatico(p_fecha,
    'Liquidación de cuotas a ' || v_nombre || ' ' || to_char(v_ini, 'MM/YYYY'),
    'liquidacion_disciplina', v_id::text, v_lineas);

  INSERT INTO socios.liquidaciones_disciplina (
    id, disciplina_id, periodo, desde, hasta, fecha, cobrado, comision, importe, a_depositar,
    visa_cobrado, visa_social, otros_cobrado, gastos_comision, gastos_iva, social_a_cargo, socios, cuota_social,
    detalle, notas, asiento_id)
  OVERRIDING SYSTEM VALUE
  VALUES (v_id, p_disciplina, v_ini, v_ini, v_fin, p_fecha, v_p.cobrado, v_p.comision, v_p.a_pagar, v_p.a_depositar,
          v_p.visa_cobrado, v_p.visa_social, v_p.otros_cobrado, v_p.gastos_comision, v_p.gastos_iva, v_p.social_a_cargo,
          v_p.socios_mes, v_p.cuota_social, socios._detalle_liquidacion(p_disciplina, v_ini),
          nullif(btrim(p_notas), ''), v_asiento);

  -- Cada cuota social impaga queda cobrada "a cargo de la disciplina".
  FOR r IN SELECT persona_id, jsonb_agg(jsonb_build_object('cuota_id', cuota_id, 'importe', saldo)) AS cuotas,
                  sum(saldo) AS total
           FROM socios._social_impaga(p_disciplina, v_ini) GROUP BY persona_id LOOP
    INSERT INTO socios.cobros (persona_id, fecha, medio, disciplina_id, importe, referencia, liquidacion_disciplina_id, asiento_id)
    VALUES (r.persona_id, p_fecha, 'liquidacion_disciplina', p_disciplina, r.total,
            'Cuota social ' || to_char(v_ini, 'MM/YYYY') || ' a cargo de ' || v_nombre, v_id, v_asiento)
    RETURNING id INTO v_cobro;
    INSERT INTO socios.aplicaciones (cobro_id, cuota_id, persona_id, importe, fecha, asiento_id)
    SELECT v_cobro, (e ->> 'cuota_id')::bigint, r.persona_id, (e ->> 'importe')::numeric, p_fecha, v_asiento
    FROM jsonb_array_elements(r.cuotas) e;
  END LOOP;
  RETURN v_id;
END;
$$;

CREATE FUNCTION socios.liquidar_disciplina(p_disciplina integer, p_periodo date, p_fecha date, p_notas text DEFAULT NULL)
RETURNS bigint
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  PERFORM socios._exigir_tesoreria();
  RETURN socios._liquidar_disciplina(p_disciplina, p_periodo, p_fecha, p_notas);
END;
$$;

-- Liquida en un paso todas las disciplinas del mes que tienen algo.
CREATE FUNCTION socios.liquidar_disciplinas_mes(p_periodo date, p_fecha date, p_disciplinas integer[] DEFAULT NULL)
RETURNS bigint[]
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_ids bigint[] := '{}';
  p record;
BEGIN
  PERFORM socios._exigir_tesoreria();
  FOR p IN SELECT * FROM socios.previsualizar_liquidaciones_mes(p_periodo)
           WHERE NOT ya_liquidado AND (cobrado - comision <> 0 OR social_a_cargo <> 0)
             AND (p_disciplinas IS NULL OR disciplina_id = ANY (p_disciplinas)) LOOP
    v_ids := v_ids || socios._liquidar_disciplina(p.disciplina_id, p_periodo, p_fecha, NULL);
  END LOOP;
  IF cardinality(v_ids) = 0 THEN
    RAISE EXCEPTION 'No hay disciplinas para liquidar en ese mes';
  END IF;
  RETURN v_ids;
END;
$$;

CREATE OR REPLACE FUNCTION socios.anular_liquidacion_disciplina(p_liquidacion bigint, p_motivo text, p_fecha date DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_l socios.liquidaciones_disciplina;
  v_cobros bigint[];
  v_fecha date := coalesce(p_fecha, contabilidad._hoy());
BEGIN
  PERFORM socios._exigir_tesoreria();
  IF nullif(btrim(p_motivo), '') IS NULL THEN
    RAISE EXCEPTION 'Indicá el motivo';
  END IF;
  SELECT * INTO v_l FROM socios.liquidaciones_disciplina WHERE id = p_liquidacion FOR UPDATE;
  IF v_l.id IS NULL OR v_l.estado <> 'vigente' THEN
    RAISE EXCEPTION 'La liquidación no existe o ya está anulada';
  END IF;
  IF EXISTS (SELECT 1 FROM socios.pagos_liquidacion WHERE liquidacion_id = p_liquidacion AND estado = 'vigente') THEN
    RAISE EXCEPTION 'La liquidación tiene pagos: anulalos primero';
  END IF;
  SELECT array_agg(id) INTO v_cobros FROM socios.cobros
  WHERE liquidacion_disciplina_id = p_liquidacion AND estado = 'vigente';
  PERFORM contabilidad._revertir(v_l.asiento_id, p_motivo, v_fecha);
  IF v_cobros IS NOT NULL THEN
    UPDATE socios.aplicaciones SET anulada = true WHERE cobro_id = ANY (v_cobros) AND NOT anulada;
    UPDATE socios.cobros SET estado = 'anulado', motivo_anulacion = btrim(p_motivo),
           anulado_por = contabilidad._usuario(), anulado_at = now()
    WHERE id = ANY (v_cobros);
  END IF;
  UPDATE socios.plan_pago_aplicaciones SET anulada = true WHERE liquidacion_id = p_liquidacion AND NOT anulada;
  UPDATE socios.liquidaciones_disciplina SET estado = 'anulada', motivo_anulacion = btrim(p_motivo),
         anulado_por = contabilidad._usuario(), anulado_at = now()
  WHERE id = p_liquidacion;
END;
$$;

-- La cuota social que pone la disciplina se anula con su liquidación.
CREATE OR REPLACE FUNCTION socios.anular_cobro(p_cobro bigint, p_motivo text, p_fecha date DEFAULT NULL) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_c socios.cobros;
  v_fecha date := coalesce(p_fecha, contabilidad._hoy());
BEGIN
  PERFORM socios._exigir_tesoreria();
  IF nullif(btrim(p_motivo), '') IS NULL THEN
    RAISE EXCEPTION 'Indicá el motivo';
  END IF;
  SELECT * INTO v_c FROM socios.cobros WHERE id = p_cobro FOR UPDATE;
  IF v_c.id IS NULL OR v_c.estado <> 'vigente' THEN
    RAISE EXCEPTION 'El cobro no existe o ya está anulado';
  END IF;
  IF v_c.medio = 'debito_visa' THEN
    RAISE EXCEPTION 'Los cobros del débito se anulan con su liquidación';
  END IF;
  IF v_c.medio = 'liquidacion_disciplina' THEN
    RAISE EXCEPTION 'La cuota social a cargo de la disciplina se anula con la liquidación de la disciplina';
  END IF;
  PERFORM socios._anular_aplicaciones_externas(ARRAY[p_cobro], p_motivo, v_fecha);
  PERFORM contabilidad._revertir(v_c.asiento_id, p_motivo, v_fecha);
  UPDATE socios.aplicaciones SET anulada = true WHERE cobro_id = p_cobro AND NOT anulada;
  UPDATE socios.cobros SET estado = 'anulado', motivo_anulacion = btrim(p_motivo),
         anulado_por = contabilidad._usuario(), anulado_at = now()
  WHERE id = p_cobro;
  PERFORM socios._aplicar_saldo_a_favor(v_c.persona_id, v_fecha);
END;
$$;

-- Un cobro no puede caer en un mes ya liquidado de su disciplina: el
-- débito, por su mes; lo demás, por la fecha de la aplicación.
CREATE OR REPLACE FUNCTION socios._aplicacion_no_liquidada() RETURNS trigger
LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE
  v_c socios.cuotas;
  v_b socios.cobros;
  v_disc integer;
  v_mes date;
BEGIN
  SELECT * INTO v_c FROM socios.cuotas WHERE id = NEW.cuota_id;
  SELECT * INTO v_b FROM socios.cobros WHERE id = NEW.cobro_id;
  IF v_b.medio = 'liquidacion_disciplina' THEN
    RETURN NEW;
  END IF;
  IF v_b.medio = 'debito_visa' AND NEW.asiento_id = v_b.asiento_id THEN
    SELECT periodo INTO v_mes FROM socios.liquidaciones_visa WHERE id = v_b.liquidacion_visa_id;
    v_disc := coalesce(v_c.disciplina_id, v_c.disciplina_responsable_id);
    IF v_disc IS NOT NULL AND EXISTS (
      SELECT 1 FROM socios.liquidaciones_disciplina
      WHERE disciplina_id = v_disc AND estado = 'vigente' AND periodo = v_mes
    ) THEN
      RAISE EXCEPTION 'El débito de % ya se liquidó a la disciplina: anulá esa liquidación primero', to_char(v_mes, 'MM/YYYY');
    END IF;
    RETURN NEW;
  END IF;
  IF v_c.tipo = 'disciplina' AND EXISTS (
    SELECT 1 FROM socios.liquidaciones_disciplina
    WHERE disciplina_id = v_c.disciplina_id AND estado = 'vigente' AND NEW.fecha BETWEEN desde AND hasta
  ) THEN
    RAISE EXCEPTION 'El % ya se liquidó a la disciplina: registrá el cobro con fecha posterior', to_char(NEW.fecha, 'DD/MM/YYYY');
  END IF;
  RETURN NEW;
END;
$$;

-- ------------------------------------------------------------
-- Débito Visa con IVA aparte y gastos por disciplina sobre la cuota entera
-- ------------------------------------------------------------
DROP FUNCTION socios.aplicar_liquidacion_visa(date, date, numeric, jsonb, jsonb, uuid, text);
CREATE FUNCTION socios.aplicar_liquidacion_visa(
  p_periodo date, p_fecha date, p_comision numeric, p_cobrados jsonb, p_rechazados jsonb DEFAULT '[]',
  p_cuenta uuid DEFAULT NULL, p_archivo text DEFAULT NULL, p_iva numeric DEFAULT 0
) RETURNS bigint
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_ini date := date_trunc('month', p_periodo)::date;
  v_cuenta uuid := coalesce(p_cuenta, contabilidad.cuenta_para('socios', 'banco_cobros'));
  v_cfg socios.config;
  v_id bigint;
  v_bruto numeric;
  v_comision numeric := round(coalesce(p_comision, 0), 2);
  v_iva numeric := round(coalesce(p_iva, 0), 2);
  v_e jsonb;
  v_reparto jsonb;
  v_todos jsonb := '[]';
  v_cobros jsonb := '[]';
  v_cobro bigint;
  v_asiento uuid;
  v_lineas jsonb;
  v_cuenta_comision uuid := contabilidad.cuenta_para('socios', 'comision_cobranza');
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
  IF v_comision < 0 OR v_iva < 0 OR v_comision + v_iva >= v_bruto THEN
    RAISE EXCEPTION 'La comisión o el IVA no son válidos';
  END IF;

  v_id := nextval(pg_get_serial_sequence('socios.liquidaciones_visa', 'id'));
  FOR v_e IN SELECT * FROM jsonb_array_elements(p_cobrados) LOOP
    v_reparto := socios._repartir((v_e ->> 'persona_id')::integer, round((v_e ->> 'importe')::numeric, 2), p_fecha);
    v_cobros := v_cobros || jsonb_build_object('persona_id', (v_e ->> 'persona_id')::integer,
      'importe', round((v_e ->> 'importe')::numeric, 2), 'referencia', v_e ->> 'referencia', 'reparto', v_reparto);
    v_todos := v_todos || v_reparto;
  END LOOP;

  -- Gastos (comisión e IVA) de cada disciplina: en proporción a lo cobrado
  -- de sus socios (cuotas de la disciplina y sociales a su cargo), por su
  -- porcentaje. El resto (socios sin disciplina, saldo a favor) es del club.
  CREATE TEMP TABLE IF NOT EXISTS _gastos (disciplina_id integer, cobrado numeric, comision numeric, iva numeric) ON COMMIT DROP;
  DELETE FROM _gastos WHERE true;
  INSERT INTO _gastos
  SELECT d, cob,
         round(v_comision * cob / v_bruto * pct / 100, 2),
         round(v_iva * cob / v_bruto * pct / 100, 2)
  FROM (SELECT y.d, y.cob, coalesce(dc.porcentaje_comision, 100) AS pct
        FROM (SELECT coalesce(c.disciplina_id, c.disciplina_responsable_id) AS d, sum((e ->> 'importe')::numeric) AS cob
              FROM jsonb_array_elements(v_todos) e JOIN socios.cuotas c ON c.id = (e ->> 'cuota_id')::bigint
              WHERE coalesce(c.disciplina_id, c.disciplina_responsable_id) IS NOT NULL
              GROUP BY 1) y
        LEFT JOIN socios.disciplinas_cobranza dc ON dc.disciplina_id = y.d) x;
  INSERT INTO _gastos
  SELECT NULL, v_bruto - coalesce(sum(cobrado), 0), v_comision - coalesce(sum(comision), 0), v_iva - coalesce(sum(iva), 0)
  FROM _gastos;
  DELETE FROM _gastos WHERE comision = 0 AND iva = 0 AND cobrado = 0;

  SELECT jsonb_agg(l) INTO v_lineas FROM (
    SELECT jsonb_build_object('cuenta_id', v_cuenta, 'lado', 'debe', 'importe', v_bruto - v_comision - v_iva,
                              'descripcion', 'Acreditación débito Visa') AS l
    UNION ALL
    SELECT jsonb_build_object('cuenta_id', v_cuenta_comision, 'lado', 'debe', 'importe', g.comision,
             'descripcion', 'Comisión del débito',
             'centro_costo_id', CASE WHEN g.disciplina_id IS NULL THEN v_cfg.centro_club_id
                                     ELSE socios._centro_disciplina(g.disciplina_id) END)
    FROM _gastos g WHERE g.comision > 0
    UNION ALL
    SELECT jsonb_build_object('cuenta_id', v_cuenta_comision, 'lado', 'debe', 'importe', g.iva,
             'descripcion', 'IVA de la comisión',
             'centro_costo_id', CASE WHEN g.disciplina_id IS NULL THEN v_cfg.centro_club_id
                                     ELSE socios._centro_disciplina(g.disciplina_id) END)
    FROM _gastos g WHERE g.iva > 0
  ) x;
  v_lineas := v_lineas || socios._lineas_haber(v_todos, v_bruto, NULL);

  v_asiento := contabilidad._asiento_automatico(p_fecha, 'Débito automático Visa ' || to_char(v_ini, 'MM/YYYY'),
                                                'liquidacion_visa', v_id::text, v_lineas);
  INSERT INTO socios.liquidaciones_visa (id, periodo, fecha, cuenta_id, bruto, comision, iva, archivo, asiento_id)
  OVERRIDING SYSTEM VALUE
  VALUES (v_id, v_ini, p_fecha, v_cuenta, v_bruto, v_comision, v_iva, nullif(btrim(p_archivo), ''), v_asiento);
  INSERT INTO socios.liquidacion_visa_comisiones (liquidacion_visa_id, disciplina_id, cobrado, comision, iva, importe)
  SELECT v_id, disciplina_id, cobrado, comision, iva, comision + iva FROM _gastos;

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

-- El débito de un mes ya liquidado a una disciplina no se anula.
CREATE OR REPLACE FUNCTION socios.anular_liquidacion_visa(p_liquidacion bigint, p_motivo text, p_fecha date DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_l socios.liquidaciones_visa;
  v_fecha date := coalesce(p_fecha, contabilidad._hoy());
  v_cobros bigint[];
BEGIN
  PERFORM socios._exigir_tesoreria();
  IF nullif(btrim(p_motivo), '') IS NULL THEN
    RAISE EXCEPTION 'Indicá el motivo';
  END IF;
  SELECT * INTO v_l FROM socios.liquidaciones_visa WHERE id = p_liquidacion FOR UPDATE;
  IF v_l.id IS NULL OR v_l.estado <> 'vigente' THEN
    RAISE EXCEPTION 'La liquidación no existe o ya está anulada';
  END IF;
  IF EXISTS (SELECT 1 FROM socios.liquidaciones_disciplina ld WHERE ld.estado = 'vigente' AND ld.periodo = v_l.periodo) THEN
    RAISE EXCEPTION 'El débito de % ya se liquidó a disciplinas: anulá esas liquidaciones primero', to_char(v_l.periodo, 'MM/YYYY');
  END IF;
  SELECT array_agg(id) INTO v_cobros FROM socios.cobros WHERE liquidacion_visa_id = p_liquidacion AND estado = 'vigente';
  PERFORM socios._anular_aplicaciones_externas(v_cobros, p_motivo, v_fecha);
  PERFORM contabilidad._revertir(v_l.asiento_id, p_motivo, v_fecha);
  UPDATE socios.aplicaciones SET anulada = true WHERE cobro_id = ANY (v_cobros) AND NOT anulada;
  UPDATE socios.cobros SET estado = 'anulado', motivo_anulacion = btrim(p_motivo),
         anulado_por = contabilidad._usuario(), anulado_at = now()
  WHERE id = ANY (v_cobros);
  UPDATE socios.liquidaciones_visa SET estado = 'anulada', motivo_anulacion = btrim(p_motivo),
         anulado_por = contabilidad._usuario(), anulado_at = now()
  WHERE id = p_liquidacion;
END;
$$;

-- ------------------------------------------------------------
-- Resumen de una liquidación (pantalla, mail a la disciplina, panel)
-- ------------------------------------------------------------
CREATE FUNCTION socios._resumen_liquidacion(p_liquidacion bigint) RETURNS jsonb
LANGUAGE sql STABLE SET search_path = '' AS $$
  SELECT jsonb_build_object(
    'id', l.id, 'disciplina_id', l.disciplina_id, 'disciplina', d.nombre, 'periodo', l.periodo, 'fecha', l.fecha,
    'estado', l.estado, 'socios', l.socios, 'cuota_social', l.cuota_social,
    'visa_cobrado', l.visa_cobrado, 'visa_social', l.visa_social, 'otros_cobrado', l.otros_cobrado,
    'gastos_comision', l.gastos_comision, 'gastos_iva', l.gastos_iva, 'social_a_cargo', l.social_a_cargo,
    'cobrado', l.cobrado, 'comision', l.comision, 'a_pagar', l.importe, 'a_depositar', l.a_depositar,
    'pagado', s.transferido + s.compensado, 'saldo', s.saldo,
    'visa_fecha', (SELECT max(v.fecha) FROM socios.liquidaciones_visa v WHERE v.estado = 'vigente' AND v.periodo = l.periodo),
    'notas', l.notas, 'detalle', l.detalle)
  FROM socios.liquidaciones_disciplina_saldo s
  JOIN socios.liquidaciones_disciplina l ON l.id = s.id
  JOIN public.disciplinas d ON d.id = l.disciplina_id
  WHERE l.id = p_liquidacion
$$;

CREATE FUNCTION socios.resumen_liquidacion(p_liquidacion bigint) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  PERFORM socios._exigir(ARRAY['tesorero', 'comision_fiscal', 'secretaria']);
  RETURN socios._resumen_liquidacion(p_liquidacion);
END;
$$;

-- ------------------------------------------------------------
-- Permisos
-- ------------------------------------------------------------
REVOKE EXECUTE ON FUNCTION socios._disciplina_principal(integer, date, date), socios._cuota_responsable(),
  socios._aplicaciones_liquidables(integer, date), socios._social_impaga(integer, date),
  socios._socios_disciplina_mes(integer, date), socios._detalle_liquidacion(integer, date),
  socios._liquidar_disciplina(integer, date, date, text), socios._resumen_liquidacion(bigint)
  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION socios.previsualizar_liquidacion_disciplina(integer, date),
  socios.previsualizar_liquidaciones_mes(date), socios.liquidar_disciplina(integer, date, date, text),
  socios.liquidar_disciplinas_mes(date, date, integer[]),
  socios.aplicar_liquidacion_visa(date, date, numeric, jsonb, jsonb, uuid, text, numeric),
  socios.resumen_liquidacion(bigint)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION socios.previsualizar_liquidacion_disciplina(integer, date),
  socios.previsualizar_liquidaciones_mes(date), socios.liquidar_disciplina(integer, date, date, text),
  socios.liquidar_disciplinas_mes(date, date, integer[]),
  socios.aplicar_liquidacion_visa(date, date, numeric, jsonb, jsonb, uuid, text, numeric),
  socios.resumen_liquidacion(bigint)
  TO authenticated, service_role;
