-- ============================================================
-- Contabilidad — ajustes al presupuesto (revisión de la pantalla)
--
-- * La base "promedio" toma los últimos meses cerrados (antes solo los
--   anteriores al ejercicio, y contaba el mes en curso incompleto).
-- * Renombrar un borrador y editar sus notas.
-- ============================================================

-- Crea el borrador de un ejercicio. Base para precargar: 'vacio',
-- 'ejercicio_anterior' (lo real del año anterior, mes a mes), 'promedio'
-- (promedio mensual de los últimos p_meses meses cerrados, repetido en los
-- 12 meses; p_hasta fija el último mes, por defecto el último cerrado) o
-- 'vigente' (reformulación: copia el aprobado).
DROP FUNCTION contabilidad.crear_presupuesto(uuid, text, integer, text);

CREATE FUNCTION contabilidad.crear_presupuesto(
  p_ejercicio uuid, p_base text DEFAULT 'vacio', p_meses integer DEFAULT 3, p_nombre text DEFAULT NULL,
  p_hasta date DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_ej contabilidad.ejercicios;
  v_ant contabilidad.ejercicios;
  v_aprobado uuid;
  v_version integer;
  v_id uuid;
  v_hasta date;
BEGIN
  PERFORM contabilidad._exigir_escritura();
  SELECT * INTO v_ej FROM contabilidad.ejercicios WHERE id = p_ejercicio;
  IF v_ej.id IS NULL THEN
    RAISE EXCEPTION 'Ejercicio inexistente';
  END IF;
  IF p_base NOT IN ('vacio', 'ejercicio_anterior', 'promedio', 'vigente') THEN
    RAISE EXCEPTION 'Base de presupuesto inválida';
  END IF;
  IF EXISTS (SELECT 1 FROM contabilidad.presupuestos WHERE ejercicio_id = p_ejercicio AND estado = 'borrador') THEN
    RAISE EXCEPTION 'Ya hay un borrador de presupuesto para este ejercicio: editalo o eliminalo';
  END IF;
  SELECT id INTO v_aprobado FROM contabilidad.presupuestos WHERE ejercicio_id = p_ejercicio AND estado = 'aprobado';
  SELECT coalesce(max(version), 0) + 1 INTO v_version FROM contabilidad.presupuestos WHERE ejercicio_id = p_ejercicio;

  INSERT INTO contabilidad.presupuestos (ejercicio_id, version, nombre)
  VALUES (p_ejercicio, v_version,
          coalesce(nullif(btrim(p_nombre), ''),
                   'Presupuesto ' || extract(year FROM v_ej.fecha_inicio) ||
                   CASE WHEN v_version > 1 THEN ' — versión ' || v_version ELSE '' END))
  RETURNING id INTO v_id;

  IF p_base = 'vigente' THEN
    IF v_aprobado IS NULL THEN
      RAISE EXCEPTION 'No hay presupuesto aprobado para reformular';
    END IF;
    INSERT INTO contabilidad.presupuesto_lineas (presupuesto_id, cuenta_id, centro_costo_id, mes, importe)
    SELECT v_id, cuenta_id, centro_costo_id, mes, importe FROM contabilidad.presupuesto_lineas
    WHERE presupuesto_id = v_aprobado;
  ELSIF p_base = 'ejercicio_anterior' THEN
    SELECT * INTO v_ant FROM contabilidad.ejercicios WHERE fecha_fin = v_ej.fecha_inicio - 1;
    IF v_ant.id IS NULL THEN
      RAISE EXCEPTION 'No hay ejercicio anterior para tomar de base';
    END IF;
    INSERT INTO contabilidad.presupuesto_lineas (presupuesto_id, cuenta_id, centro_costo_id, mes, importe)
    SELECT v_id, r.cuenta_id, r.centro_costo_id, r.mes, greatest(r.importe, 0)
    FROM contabilidad.resultado_real(v_ant.fecha_inicio, v_ant.fecha_fin) r
    JOIN contabilidad.cuentas c ON c.id = r.cuenta_id
    WHERE r.importe > 0 AND c.activa;
  ELSIF p_base = 'promedio' THEN
    -- Último mes cerrado (el mes en curso está incompleto), también si es
    -- del mismo ejercicio: permite reformular a mitad de año.
    v_hasta := coalesce(p_hasta, (date_trunc('month', contabilidad._hoy()) - interval '1 day')::date);
    IF p_meses IS NULL OR p_meses < 1 OR p_meses > 24 THEN
      RAISE EXCEPTION 'La cantidad de meses del promedio tiene que estar entre 1 y 24';
    END IF;
    INSERT INTO contabilidad.presupuesto_lineas (presupuesto_id, cuenta_id, centro_costo_id, mes, importe)
    SELECT v_id, p.cuenta_id, p.centro_costo_id, m.mes, p.promedio
    FROM (
      SELECT r.cuenta_id, r.centro_costo_id, round(sum(r.importe) / p_meses, 2) AS promedio
      FROM contabilidad.resultado_real((date_trunc('month', v_hasta) - make_interval(months => p_meses - 1))::date,
                                       v_hasta) r
      JOIN contabilidad.cuentas c ON c.id = r.cuenta_id
      WHERE c.activa
      GROUP BY 1, 2
      HAVING sum(r.importe) > 0
    ) p
    CROSS JOIN generate_series(1, 12) AS m(mes);
  END IF;
  RETURN v_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION contabilidad.crear_presupuesto(uuid, text, integer, text, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION contabilidad.crear_presupuesto(uuid, text, integer, text, date) TO authenticated, service_role;

CREATE FUNCTION contabilidad.actualizar_presupuesto(p_presupuesto uuid, p_nombre text, p_notas text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  PERFORM contabilidad._exigir_escritura();
  IF nullif(btrim(p_nombre), '') IS NULL THEN
    RAISE EXCEPTION 'El nombre no puede quedar vacío';
  END IF;
  -- El trigger impide tocar un aprobado o reemplazado.
  UPDATE contabilidad.presupuestos SET nombre = btrim(p_nombre), notas = nullif(btrim(p_notas), '')
  WHERE id = p_presupuesto;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Presupuesto inexistente';
  END IF;
END;
$$;
REVOKE EXECUTE ON FUNCTION contabilidad.actualizar_presupuesto(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION contabilidad.actualizar_presupuesto(uuid, text, text) TO authenticated, service_role;
