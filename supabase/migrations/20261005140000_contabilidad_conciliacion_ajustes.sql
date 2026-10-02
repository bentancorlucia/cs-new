-- ============================================================
-- Contabilidad — ajustes a la conciliación (revisión de la pantalla)
--
-- * Registrar en libros un movimiento ya registrado y desconciliado
--   reutiliza su asiento (antes fallaba con la clave única de origen).
-- * Sugerencias de pares asiento / reversión de la misma cuenta, que se
--   concilian entre sí (suman cero) sin movimiento del banco.
-- ============================================================

-- Registra en los libros un movimiento del banco que no estaba (comisión,
-- interés, débito automático) y lo deja conciliado. Si ya se había
-- registrado (y se desconcilió), vuelve a conciliar ese mismo asiento. La contrapartida es
-- en pesos o en la misma moneda que la cuenta; p_extra completa su línea
-- (centro_costo_id, proveedor_id, disciplina_id).
CREATE OR REPLACE FUNCTION contabilidad.contabilizar_movimiento_extracto(
  p_movimiento bigint, p_contrapartida uuid, p_descripcion text DEFAULT NULL, p_extra jsonb DEFAULT '{}'
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_m contabilidad.extracto_movimientos;
  v_e contabilidad.extractos;
  v_banco contabilidad.cuentas;
  v_contra contabilidad.cuentas;
  v_tc numeric;
  v_abs numeric;
  v_asiento uuid;
  v_linea bigint;
BEGIN
  PERFORM contabilidad._exigir_escritura();
  SELECT * INTO v_m FROM contabilidad.extracto_movimientos WHERE id = p_movimiento;
  SELECT * INTO v_e FROM contabilidad.extractos WHERE id = v_m.extracto_id;
  IF v_m.id IS NULL THEN
    RAISE EXCEPTION 'Movimiento inexistente';
  END IF;
  IF EXISTS (SELECT 1 FROM contabilidad.conciliacion_movimientos WHERE movimiento_id = p_movimiento) THEN
    RAISE EXCEPTION 'El movimiento ya está conciliado';
  END IF;
  SELECT * INTO v_banco FROM contabilidad.cuentas WHERE id = v_e.cuenta_id;
  SELECT * INTO v_contra FROM contabilidad.cuentas WHERE id = p_contrapartida;
  IF v_contra.id IS NULL OR v_contra.id = v_banco.id THEN
    RAISE EXCEPTION 'Elegí la cuenta de contrapartida';
  END IF;
  IF v_contra.moneda IS NOT NULL AND v_contra.moneda IS DISTINCT FROM v_banco.moneda THEN
    RAISE EXCEPTION 'La contrapartida está en otra moneda: registralo con un asiento manual';
  END IF;

  -- Ya se registró antes (y se desconcilió): se reutiliza ese asiento.
  SELECT a.id INTO v_asiento FROM contabilidad.asientos a
  WHERE a.origen_tipo = 'extracto' AND a.origen_id = v_m.id::text AND a.estado = 'confirmado'
    AND a.tipo <> 'reversion' AND a.revertido_por_id IS NULL;
  IF v_asiento IS NOT NULL THEN
    SELECT id INTO v_linea FROM contabilidad.lineas WHERE asiento_id = v_asiento AND cuenta_id = v_banco.id;
    PERFORM contabilidad.conciliar(v_e.id, ARRAY[p_movimiento], ARRAY[v_linea]);
    RETURN v_asiento;
  END IF;

  v_abs := abs(v_m.importe);
  IF v_banco.moneda IS NOT NULL THEN
    v_tc := contabilidad.tc_vigente(v_banco.moneda, v_m.fecha);
    IF v_tc IS NULL THEN
      RAISE EXCEPTION 'No hay cotización de % para el %', v_banco.moneda, to_char(v_m.fecha, 'DD/MM/YYYY');
    END IF;
  END IF;

  v_asiento := contabilidad._asiento_automatico(
    v_m.fecha,
    coalesce(nullif(btrim(p_descripcion), ''), v_m.concepto),
    'extracto', v_m.id::text,
    jsonb_build_array(
      jsonb_build_object('cuenta_id', v_banco.id, 'lado', CASE WHEN v_m.importe > 0 THEN 'debe' ELSE 'haber' END,
                         'importe', v_abs, 'tc', v_tc, 'descripcion', v_m.concepto),
      coalesce(p_extra, '{}') || jsonb_build_object(
        'cuenta_id', v_contra.id, 'lado', CASE WHEN v_m.importe > 0 THEN 'haber' ELSE 'debe' END,
        'importe', CASE WHEN v_contra.moneda IS NULL AND v_tc IS NOT NULL THEN round(v_abs * v_tc, 2) ELSE v_abs END,
        'tc', CASE WHEN v_contra.moneda IS NOT NULL THEN v_tc END)));

  SELECT id INTO v_linea FROM contabilidad.lineas WHERE asiento_id = v_asiento AND cuenta_id = v_banco.id;
  PERFORM contabilidad.conciliar(v_e.id, ARRAY[p_movimiento], ARRAY[v_linea]);
  RETURN v_asiento;
END;
$$;

CREATE FUNCTION contabilidad.sugerir_reversiones(p_extracto uuid)
RETURNS TABLE (linea_id bigint, linea_reversion_id bigint)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_e contabilidad.extractos;
BEGIN
  PERFORM contabilidad._exigir_lectura();
  SELECT * INTO v_e FROM contabilidad.extractos WHERE id = p_extracto;
  RETURN QUERY
  SELECT lo.id, lr.id
  FROM contabilidad.asientos o
  JOIN contabilidad.asientos r ON r.id = o.revertido_por_id AND r.estado = 'confirmado'
  JOIN contabilidad.lineas lo ON lo.asiento_id = o.id AND lo.cuenta_id = v_e.cuenta_id
  JOIN contabilidad.lineas lr ON lr.asiento_id = r.id AND lr.cuenta_id = lo.cuenta_id AND lr.orden = lo.orden
  WHERE o.estado = 'confirmado' AND r.fecha <= v_e.fecha_hasta
    AND o.tipo NOT IN ('apertura', 'cierre', 'refundicion', 'revaluacion')
    AND NOT EXISTS (SELECT 1 FROM contabilidad.conciliacion_lineas c WHERE c.linea_id IN (lo.id, lr.id))
  ORDER BY o.fecha, lo.id;
END;
$$;
REVOKE EXECUTE ON FUNCTION contabilidad.sugerir_reversiones(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION contabilidad.sugerir_reversiones(uuid) TO authenticated, service_role;
