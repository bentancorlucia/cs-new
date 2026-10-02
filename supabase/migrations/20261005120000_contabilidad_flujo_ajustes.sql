-- ============================================================
-- Contabilidad — ajustes al flujo de caja (revisión de la pantalla)
--
-- * El saldo de disponibilidades después del último ejercicio es el de
--   su cierre (antes daba 0 y rompía saldo inicial + flujo = saldo final
--   en el último día del ejercicio).
-- * La diferencia de cambio realizada no es una salida o entrada aparte:
--   se suma al pago o cobro en moneda extranjera (antes la pérdida salía
--   como egreso separado y la ganancia no). Las cuentas de diferencia de
--   cambio realizada pasan a "no mueve fondos" (tampoco se proyectan).
-- ============================================================

UPDATE contabilidad.cuentas SET afecta_caja = false WHERE codigo IN ('4.6.02.01', '5.7.02.01');

CREATE OR REPLACE FUNCTION contabilidad._saldo_cuentas(p_cuentas uuid[], p_fecha date, p_inicio boolean, p_origen boolean)
RETURNS numeric
LANGUAGE plpgsql STABLE SET search_path = '' AS $$
DECLARE
  v_ej contabilidad.ejercicios;
  v_ant date;
  v_saldo numeric;
BEGIN
  SELECT * INTO v_ej FROM contabilidad.ejercicios WHERE p_fecha BETWEEN fecha_inicio AND fecha_fin;
  IF v_ej.id IS NULL THEN
    -- Después del último ejercicio: el saldo al cierre de ese ejercicio.
    -- Antes del primero: no hay nada.
    SELECT * INTO v_ej FROM contabilidad.ejercicios WHERE fecha_fin < p_fecha ORDER BY fecha_fin DESC LIMIT 1;
    IF v_ej.id IS NULL THEN
      RETURN 0;
    END IF;
    RETURN contabilidad._saldo_cuentas(p_cuentas, v_ej.fecha_fin, false, p_origen);
  END IF;
  SELECT coalesce(sum(CASE WHEN NOT p_origen THEN l.debe - l.haber
                           WHEN l.debe > 0 THEN coalesce(l.importe_origen, 0)
                           ELSE -coalesce(l.importe_origen, 0) END), 0)
  INTO v_saldo
  FROM contabilidad.lineas l
  JOIN contabilidad.asientos a ON a.id = l.asiento_id
  WHERE l.cuenta_id = ANY (p_cuentas) AND a.estado = 'confirmado' AND a.ejercicio_id = v_ej.id
    AND a.tipo NOT IN ('cierre', 'refundicion')
    AND (a.fecha < p_fecha OR (NOT p_inicio AND a.fecha = p_fecha) OR a.tipo = 'apertura');

  IF NOT EXISTS (SELECT 1 FROM contabilidad.asientos
                 WHERE ejercicio_id = v_ej.id AND tipo = 'apertura' AND estado = 'confirmado') THEN
    SELECT fecha_fin INTO v_ant FROM contabilidad.ejercicios WHERE fecha_fin = v_ej.fecha_inicio - 1;
    IF v_ant IS NOT NULL THEN
      v_saldo := v_saldo + contabilidad._saldo_cuentas(p_cuentas, v_ant, false, p_origen);
    END IF;
  END IF;
  RETURN v_saldo;
END;
$$;

CREATE OR REPLACE FUNCTION contabilidad._flujo_asiento(p_asiento uuid, p_disponibilidad uuid DEFAULT NULL)
RETURNS TABLE (cuenta_id uuid, centro_costo_id uuid, importe numeric)
LANGUAGE sql STABLE SET search_path = '' AS $$
  WITH l0 AS (
    SELECT l.cuenta_id, l.centro_costo_id, l.debe, l.haber,
           CASE WHEN p_disponibilidad IS NULL THEN c.es_disponibilidad ELSE l.cuenta_id = p_disponibilidad END AS disp,
           c.clase NOT IN ('ingreso', 'egreso') AS patrimonial,
           c.clase IN ('ingreso', 'egreso') AND NOT c.afecta_caja AS no_monetaria
    FROM contabilidad.lineas l JOIN contabilidad.cuentas c ON c.id = l.cuenta_id
    WHERE l.asiento_id = p_asiento
  ), t AS (
    -- La partida patrimonial principal del asiento (la deuda que se paga,
    -- el crédito que se cobra).
    SELECT cuenta_id, centro_costo_id FROM l0
    WHERE NOT disp AND patrimonial ORDER BY abs(debe - haber) DESC, cuenta_id LIMIT 1
  ), l AS (
    -- Los resultados que no mueven fondos (diferencia de cambio realizada)
    -- se suman a esa partida: un pago con diferencia de cambio, ganada o
    -- perdida, se ve como el pago neto al proveedor.
    SELECT CASE WHEN l0.no_monetaria AND t.cuenta_id IS NOT NULL THEN t.cuenta_id ELSE l0.cuenta_id END AS cuenta_id,
           CASE WHEN l0.no_monetaria AND t.cuenta_id IS NOT NULL THEN t.centro_costo_id ELSE l0.centro_costo_id END AS centro_costo_id,
           l0.debe, l0.haber, l0.disp,
           l0.patrimonial OR (l0.no_monetaria AND t.cuenta_id IS NOT NULL) AS patrimonial
    FROM l0 LEFT JOIN t ON true
  ), d AS (
    SELECT coalesce(sum(debe - haber) FILTER (WHERE disp), 0) AS d FROM l
  ), k AS (
    -- m > 0: fuente; m < 0: no fuente (en el sentido del movimiento de caja)
    SELECT l.cuenta_id, l.centro_costo_id, bool_or(l.patrimonial) AS patrimonial,
           sum(l.haber - l.debe) * sign(d.d) AS m, sign(d.d) AS s
    FROM l CROSS JOIN d
    WHERE NOT l.disp AND d.d <> 0
    GROUP BY l.cuenta_id, l.centro_costo_id, d.d
  ), tot AS (
    SELECT coalesce(sum(m) FILTER (WHERE m > 0 AND patrimonial), 0) AS fp,
           coalesce(sum(m) FILTER (WHERE m > 0 AND NOT patrimonial), 0) AS fr,
           coalesce(-sum(m) FILTER (WHERE m < 0 AND patrimonial), 0) AS np,
           coalesce(-sum(m) FILTER (WHERE m < 0 AND NOT patrimonial), 0) AS nr
    FROM k
  ), a AS (
    SELECT tot.*, least(nr, fp) AS a_ FROM tot
  ), b AS (
    SELECT a.*, least(np, fp - a_) AS b_ FROM a
  ), x AS (
    SELECT b.*, least(np - b_, fr) AS c_ FROM b
  )
  , r AS (
    SELECT k.cuenta_id, k.centro_costo_id,
           round(k.s * CASE
             WHEN k.m > 0 AND k.patrimonial THEN k.m - (x.a_ + x.b_) * k.m / x.fp
             WHEN k.m > 0 THEN k.m - x.c_ * k.m / x.fr
             WHEN k.patrimonial THEN k.m * (1 - (x.b_ + x.c_) / x.np)
             ELSE k.m * (1 - x.a_ / x.nr)
           END, 2) AS v
    FROM k CROSS JOIN x
    WHERE k.m <> 0
  ), q AS (
    -- El centavo del prorrateo va a la contrapartida mayor.
    SELECT r.*, row_number() OVER (ORDER BY abs(r.v) DESC, r.cuenta_id) AS n, sum(r.v) OVER () AS total
    FROM r
  )
  SELECT q.cuenta_id, q.centro_costo_id, q.v + CASE WHEN q.n = 1 THEN d.d - q.total ELSE 0 END
  FROM q CROSS JOIN d
  WHERE q.v + CASE WHEN q.n = 1 THEN d.d - q.total ELSE 0 END <> 0
$$;
