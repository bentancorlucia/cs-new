-- ============================================================
-- Disciplinas — una sola regla para "lo que la disciplina le debe al club"
--
-- Saldo de "Fondos en poder de disciplinas" con su auxiliar, en todos los
-- ejercicios, contando solo la apertura del primero (las siguientes repiten
-- el saldo). La previsualización de la liquidación lo sumaba con todas las
-- aperturas: con más de un ejercicio, la deuda salía duplicada.
-- ============================================================

CREATE FUNCTION socios._deuda_disciplina(p_disciplina integer) RETURNS numeric
LANGUAGE sql STABLE SET search_path = '' AS $$
  SELECT coalesce(sum(l.debe - l.haber), 0)
  FROM contabilidad.lineas l
  JOIN contabilidad.asientos a ON a.id = l.asiento_id
  WHERE l.cuenta_id = contabilidad.cuenta_para('socios', 'disciplinas') AND l.disciplina_id = p_disciplina
    AND a.estado = 'confirmado' AND a.tipo NOT IN ('cierre', 'refundicion')
    AND (a.tipo <> 'apertura'
         OR a.ejercicio_id = (SELECT id FROM contabilidad.ejercicios ORDER BY fecha_inicio LIMIT 1))
$$;
REVOKE EXECUTE ON FUNCTION socios._deuda_disciplina(integer) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION socios.previsualizar_liquidacion_disciplina(p_disciplina integer, p_desde date, p_hasta date)
RETURNS TABLE (cobrado numeric, comision numeric, importe numeric, deuda_disciplina numeric, ya_liquidado boolean)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  PERFORM socios._exigir(ARRAY['tesorero', 'comision_fiscal']);
  SELECT coalesce(sum(a.importe), 0) INTO cobrado
  FROM socios.aplicaciones a JOIN socios.cuotas c ON c.id = a.cuota_id
  WHERE NOT a.anulada AND c.tipo = 'disciplina' AND c.disciplina_id = p_disciplina
    AND a.fecha BETWEEN p_desde AND p_hasta;
  SELECT coalesce(sum(k.importe), 0) INTO comision
  FROM socios.liquidacion_visa_comisiones k JOIN socios.liquidaciones_visa l ON l.id = k.liquidacion_visa_id
  WHERE l.estado = 'vigente' AND k.disciplina_id = p_disciplina AND l.fecha BETWEEN p_desde AND p_hasta;
  importe := cobrado - comision;
  deuda_disciplina := socios._deuda_disciplina(p_disciplina);
  ya_liquidado := EXISTS (SELECT 1 FROM socios.liquidaciones_disciplina
                          WHERE disciplina_id = p_disciplina AND estado = 'vigente'
                            AND daterange(desde, hasta, '[]') && daterange(p_desde, p_hasta, '[]'));
  RETURN NEXT;
END;
$$;

CREATE OR REPLACE FUNCTION socios.pagar_liquidacion_disciplina(
  p_liquidacion bigint, p_fecha date, p_transferir numeric DEFAULT 0, p_cuenta uuid DEFAULT NULL,
  p_compensar numeric DEFAULT 0, p_plan bigint DEFAULT NULL, p_referencia text DEFAULT NULL, p_notas text DEFAULT NULL
) RETURNS bigint
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_l record;
  v_transf numeric := round(coalesce(p_transferir, 0), 2);
  v_comp numeric := round(coalesce(p_compensar, 0), 2);
  v_cuenta uuid;
  v_disp contabilidad.cuentas;
  v_deuda numeric;
  v_nombre text;
  v_id bigint;
  v_asiento uuid;
BEGIN
  PERFORM socios._exigir_tesoreria();
  SELECT * INTO v_l FROM socios.liquidaciones_disciplina_saldo WHERE id = p_liquidacion;
  IF v_l.id IS NULL OR v_l.estado <> 'vigente' THEN
    RAISE EXCEPTION 'La liquidación no existe o está anulada';
  END IF;
  PERFORM 1 FROM socios.liquidaciones_disciplina WHERE id = p_liquidacion FOR UPDATE;
  IF v_transf < 0 OR v_comp < 0 OR v_transf + v_comp = 0 THEN
    RAISE EXCEPTION 'Indicá cuánto se transfiere y/o cuánto se compensa';
  END IF;
  IF v_transf + v_comp > v_l.saldo THEN
    RAISE EXCEPTION 'Se paga más que el saldo de la liquidación (%)', v_l.saldo;
  END IF;
  IF p_fecha IS NULL OR p_fecha > contabilidad._hoy() OR p_fecha < v_l.fecha THEN
    RAISE EXCEPTION 'La fecha del pago no puede ser futura ni anterior a la liquidación';
  END IF;
  IF v_comp > 0 THEN
    v_deuda := socios._deuda_disciplina(v_l.disciplina_id);
    IF v_comp > greatest(v_deuda, 0) THEN
      RAISE EXCEPTION 'No se puede compensar más que lo que la disciplina le debe al club (%)', greatest(v_deuda, 0);
    END IF;
  END IF;
  IF v_transf > 0 THEN
    v_cuenta := coalesce(p_cuenta, contabilidad.cuenta_para('socios', 'banco_cobros'));
    SELECT * INTO v_disp FROM contabilidad.cuentas WHERE id = v_cuenta;
    IF NOT coalesce(v_disp.es_disponibilidad, false) OR v_disp.moneda IS NOT NULL THEN
      RAISE EXCEPTION 'El pago sale de una cuenta de caja o banco en pesos';
    END IF;
  END IF;
  SELECT nombre INTO v_nombre FROM public.disciplinas WHERE id = v_l.disciplina_id;

  v_id := nextval(pg_get_serial_sequence('socios.pagos_liquidacion', 'id'));
  v_asiento := contabilidad._asiento_automatico(p_fecha,
    'Pago de liquidación a ' || v_nombre || coalesce(' (' || nullif(btrim(p_referencia), '') || ')', ''),
    'pago_liquidacion', v_id::text,
    jsonb_build_array(jsonb_build_object('cuenta_id', contabilidad.cuenta_para('socios', 'liquidaciones_a_pagar'),
                                         'lado', 'debe', 'importe', v_transf + v_comp,
                                         'disciplina_id', v_l.disciplina_id))
    || CASE WHEN v_transf > 0 THEN jsonb_build_array(jsonb_build_object(
         'cuenta_id', v_cuenta, 'lado', 'haber', 'importe', v_transf, 'descripcion', 'Transferencia a ' || v_nombre))
       ELSE '[]' END
    || CASE WHEN v_comp > 0 THEN jsonb_build_array(jsonb_build_object(
         'cuenta_id', contabilidad.cuenta_para('socios', 'disciplinas'), 'lado', 'haber', 'importe', v_comp,
         'disciplina_id', v_l.disciplina_id, 'descripcion', 'Compensación de la deuda de la disciplina'))
       ELSE '[]' END);
  INSERT INTO socios.pagos_liquidacion (id, liquidacion_id, fecha, transferido, cuenta_id, compensado, referencia, notas,
                                        asiento_id)
  OVERRIDING SYSTEM VALUE
  VALUES (v_id, p_liquidacion, p_fecha, v_transf, v_cuenta, v_comp, nullif(btrim(p_referencia), ''),
          nullif(btrim(p_notas), ''), v_asiento);
  IF p_plan IS NOT NULL THEN
    IF v_comp = 0 THEN
      RAISE EXCEPTION 'Para imputar a un plan de pago hay que compensar parte de la deuda';
    END IF;
    PERFORM socios._aplicar_a_plan(p_plan, v_l.disciplina_id, v_comp, p_fecha, NULL, v_id);
  END IF;
  RETURN v_id;
END;
$$;
