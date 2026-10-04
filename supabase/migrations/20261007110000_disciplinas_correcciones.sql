-- ============================================================
-- Disciplinas — correcciones de la revisión de pantallas
--
-- * Las vistas de planes de pago usaban contabilidad._hoy(), que solo
--   ejecutaba postgres: fallaban para cualquier usuario del sitio. Las
--   vistas usan la fecha de Uruguay directamente (y _hoy() queda
--   disponible para authenticated, es solo la fecha).
-- * Imputar a un plan ya pago no aborta el pago o la liquidación: el
--   importe queda a cuenta de la deuda general.
-- * Las cuotas impagas de un plan cancelado figuran como "cancelada", no
--   como vencidas.
-- ============================================================

GRANT EXECUTE ON FUNCTION contabilidad._hoy() TO authenticated, service_role;

DROP VIEW socios.planes_pago_resumen;
DROP VIEW socios.plan_pago_cuotas_saldo;

CREATE VIEW socios.plan_pago_cuotas_saldo WITH (security_invoker = true) AS
SELECT c.*,
  coalesce(a.pagado, 0) AS pagado,
  c.importe - coalesce(a.pagado, 0) AS saldo,
  CASE WHEN c.importe - coalesce(a.pagado, 0) <= 0 THEN 'pagada'
       WHEN p.estado = 'cancelado' THEN 'cancelada'
       WHEN c.vencimiento < (now() AT TIME ZONE 'America/Montevideo')::date THEN 'vencida'
       WHEN coalesce(a.pagado, 0) > 0 THEN 'parcial'
       ELSE 'pendiente' END AS situacion
FROM socios.plan_pago_cuotas c
JOIN socios.planes_pago p ON p.id = c.plan_id
LEFT JOIN (SELECT cuota_id, sum(importe) AS pagado FROM socios.plan_pago_aplicaciones WHERE NOT anulada GROUP BY cuota_id) a
  ON a.cuota_id = c.id;

CREATE VIEW socios.planes_pago_resumen WITH (security_invoker = true) AS
SELECT p.*,
  coalesce(sum(s.pagado), 0) AS pagado,
  coalesce(sum(s.saldo), 0) AS saldo,
  count(s.id) AS cuotas,
  count(s.id) FILTER (WHERE s.situacion = 'pagada') AS cuotas_pagadas,
  count(s.id) FILTER (WHERE s.situacion = 'vencida') AS cuotas_vencidas,
  coalesce(sum(s.saldo) FILTER (WHERE s.situacion = 'vencida'), 0) AS saldo_vencido,
  min(s.vencimiento) FILTER (WHERE s.saldo > 0 AND p.estado = 'vigente') AS proximo_vencimiento,
  CASE WHEN p.estado = 'cancelado' THEN 'cancelado'
       WHEN coalesce(sum(s.saldo), 0) <= 0 THEN 'cumplido'
       WHEN count(s.id) FILTER (WHERE s.situacion = 'vencida') > 0 THEN 'atrasado'
       ELSE 'al_dia' END AS situacion
FROM socios.planes_pago p
LEFT JOIN socios.plan_pago_cuotas_saldo s ON s.plan_id = p.id
GROUP BY p.id;

GRANT SELECT ON socios.plan_pago_cuotas_saldo, socios.planes_pago_resumen TO authenticated, service_role;

CREATE OR REPLACE FUNCTION socios._aplicar_a_plan(
  p_plan bigint, p_disciplina integer, p_importe numeric, p_fecha date, p_cobro bigint, p_liquidacion bigint
) RETURNS numeric
LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE
  v_p socios.planes_pago;
  v_resto numeric := p_importe;
  v_aplica numeric;
  r record;
BEGIN
  SELECT * INTO v_p FROM socios.planes_pago WHERE id = p_plan FOR UPDATE;
  IF v_p.id IS NULL OR v_p.estado <> 'vigente' THEN
    RAISE EXCEPTION 'El plan de pago no existe o está cancelado';
  END IF;
  IF v_p.disciplina_id <> p_disciplina THEN
    RAISE EXCEPTION 'El plan de pago es de otra disciplina';
  END IF;
  FOR r IN SELECT id, saldo FROM socios.plan_pago_cuotas_saldo WHERE plan_id = p_plan AND saldo > 0 ORDER BY numero LOOP
    EXIT WHEN v_resto <= 0;
    v_aplica := least(r.saldo, v_resto);
    INSERT INTO socios.plan_pago_aplicaciones (cuota_id, cobro_id, liquidacion_id, fecha, importe)
    VALUES (r.id, p_cobro, p_liquidacion, p_fecha, v_aplica);
    v_resto := v_resto - v_aplica;
  END LOOP;
  -- Lo que excede al plan queda a cuenta de la deuda general de la disciplina.
  RETURN p_importe - v_resto;
END;
$$;
