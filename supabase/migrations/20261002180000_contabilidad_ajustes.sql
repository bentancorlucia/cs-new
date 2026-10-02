-- ============================================================
-- Contabilidad — ajustes tras la primera versión de la app
--   · no cerrar un ejercicio antes de que termine
--   · nombres de los usuarios que figuran en asientos, sin abrir
--     public.perfiles (es_staff() no incluye tesorero ni
--     comision_fiscal, y ampliarlo les daría otras tablas)
-- ============================================================

CREATE OR REPLACE FUNCTION contabilidad.cerrar_ejercicio(p_ejercicio uuid) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_ej contabilidad.ejercicios%ROWTYPE;
  v_sig uuid;
  v_id uuid;
  v_res_ej uuid := contabilidad.cuenta_sistema('resultado_ejercicio');
  v_res_acum uuid := contabilidad.cuenta_sistema('resultados_acumulados');
  v_resultado numeric;
  v_n integer;
  v_moneda char(3);
BEGIN
  PERFORM contabilidad._exigir_escritura();

  SELECT * INTO v_ej FROM contabilidad.ejercicios WHERE id = p_ejercicio FOR UPDATE;
  IF v_ej.id IS NULL OR v_ej.estado = 'cerrado' THEN
    RAISE EXCEPTION 'El ejercicio no existe o ya está cerrado';
  END IF;
  -- Desde la app no se cierra un ejercicio que todavía no terminó.
  -- Conexiones directas (tests, scripts de admin) quedan exceptuadas.
  IF contabilidad._hoy() <= v_ej.fecha_fin
     AND coalesce(current_setting('request.jwt.claims', true), '') <> '' THEN
    RAISE EXCEPTION 'El % todavía no terminó: se cierra a partir del %',
      v_ej.nombre, to_char(v_ej.fecha_fin + 1, 'DD/MM/YYYY');
  END IF;
  IF EXISTS (SELECT 1 FROM contabilidad.ejercicios
             WHERE fecha_fin < v_ej.fecha_inicio AND estado = 'abierto') THEN
    RAISE EXCEPTION 'Primero hay que cerrar el ejercicio anterior';
  END IF;
  IF EXISTS (SELECT 1 FROM contabilidad.asientos
             WHERE ejercicio_id = p_ejercicio AND estado = 'borrador') THEN
    RAISE EXCEPTION 'Hay asientos en borrador en el ejercicio';
  END IF;
  FOR v_moneda IN SELECT DISTINCT moneda FROM contabilidad.cuentas WHERE revalua LOOP
    IF NOT EXISTS (SELECT 1 FROM contabilidad.cotizaciones
                   WHERE moneda = v_moneda AND fecha BETWEEN v_ej.fecha_fin - 7 AND v_ej.fecha_fin) THEN
      RAISE EXCEPTION 'Falta la cotización de % de los últimos días del ejercicio', v_moneda;
    END IF;
  END LOOP;

  -- Para revaluar y asentar el cierre, el último período tiene que
  -- estar abierto: se reabren los que estén cerrados (el cierre los
  -- vuelve a cerrar todos al final).
  UPDATE contabilidad.periodos SET estado = 'abierto', cerrado_at = NULL, cerrado_por = NULL
   WHERE ejercicio_id = p_ejercicio AND estado = 'cerrado'
     AND fecha_fin = v_ej.fecha_fin;

  -- 1. Revaluación de moneda extranjera al cierre
  PERFORM contabilidad._revaluar(v_ej.fecha_fin, 'cierre_revaluacion', p_ejercicio::text);

  PERFORM set_config('contabilidad.proceso', 'sistema', true);

  -- 2. Cancelación de resultados contra Superávit/(Déficit) del ejercicio
  INSERT INTO contabilidad.asientos (fecha, descripcion, tipo, origen_tipo, origen_id)
  VALUES (v_ej.fecha_fin, 'Cierre de cuentas de resultado — ' || v_ej.nombre,
          'cierre', 'cierre_resultados', p_ejercicio::text)
  RETURNING id INTO v_id;

  INSERT INTO contabilidad.lineas (asiento_id, orden, cuenta_id, descripcion, debe, haber, centro_costo_id)
  SELECT v_id, row_number() OVER (ORDER BY c.codigo, s.centro_costo_id), s.cuenta_id, NULL,
         greatest(-s.saldo, 0), greatest(s.saldo, 0), s.centro_costo_id
  FROM (
    SELECT l.cuenta_id, l.centro_costo_id, sum(l.debe - l.haber) AS saldo
    FROM contabilidad.lineas l
    JOIN contabilidad.asientos a ON a.id = l.asiento_id
    JOIN contabilidad.cuentas c ON c.id = l.cuenta_id
    WHERE a.ejercicio_id = p_ejercicio AND a.estado = 'confirmado'
      AND c.clase IN ('ingreso', 'egreso')
    GROUP BY l.cuenta_id, l.centro_costo_id
    HAVING sum(l.debe - l.haber) <> 0
  ) s
  JOIN contabilidad.cuentas c ON c.id = s.cuenta_id;
  GET DIAGNOSTICS v_n = ROW_COUNT;

  IF v_n = 0 THEN
    DELETE FROM contabilidad.asientos WHERE id = v_id;
  ELSE
    -- Lo que falta para cuadrar: positivo = egresos > ingresos = déficit
    SELECT sum(haber) - sum(debe) INTO v_resultado FROM contabilidad.lineas WHERE asiento_id = v_id;
    IF v_resultado <> 0 THEN
      INSERT INTO contabilidad.lineas (asiento_id, orden, cuenta_id, descripcion, debe, haber)
      VALUES (v_id, v_n + 1, v_res_ej, 'Resultado del ejercicio',
              greatest(v_resultado, 0), greatest(-v_resultado, 0));
    END IF;
    UPDATE contabilidad.asientos SET estado = 'confirmado' WHERE id = v_id;
  END IF;

  -- 3. Refundición en Superávit/(Déficit) acumulado
  SELECT coalesce(sum(l.debe - l.haber), 0) INTO v_resultado
  FROM contabilidad.lineas l JOIN contabilidad.asientos a ON a.id = l.asiento_id
  WHERE a.ejercicio_id = p_ejercicio AND a.estado = 'confirmado' AND l.cuenta_id = v_res_ej;

  IF v_resultado <> 0 THEN
    INSERT INTO contabilidad.asientos (fecha, descripcion, tipo, origen_tipo, origen_id)
    VALUES (v_ej.fecha_fin, 'Refundición del resultado — ' || v_ej.nombre,
            'refundicion', 'cierre_refundicion', p_ejercicio::text)
    RETURNING id INTO v_id;
    INSERT INTO contabilidad.lineas (asiento_id, orden, cuenta_id, debe, haber) VALUES
      (v_id, 1, v_res_ej, greatest(-v_resultado, 0), greatest(v_resultado, 0)),
      (v_id, 2, v_res_acum, greatest(v_resultado, 0), greatest(-v_resultado, 0));
    UPDATE contabilidad.asientos SET estado = 'confirmado' WHERE id = v_id;
  END IF;

  -- 4. Cierre de períodos y ejercicio
  UPDATE contabilidad.periodos SET estado = 'cerrado', cerrado_at = now(), cerrado_por = auth.uid()
   WHERE ejercicio_id = p_ejercicio AND estado = 'abierto';
  UPDATE contabilidad.ejercicios SET estado = 'cerrado', cerrado_at = now(), cerrado_por = auth.uid()
   WHERE id = p_ejercicio;

  -- 5. Ejercicio siguiente y su apertura
  SELECT id INTO v_sig FROM contabilidad.ejercicios WHERE fecha_inicio = v_ej.fecha_fin + 1;
  IF v_sig IS NULL THEN
    v_sig := contabilidad.crear_ejercicio(extract(year FROM v_ej.fecha_fin + 1)::integer);
  END IF;
  PERFORM set_config('contabilidad.proceso', 'sistema', true);

  INSERT INTO contabilidad.asientos (fecha, descripcion, tipo, origen_tipo, origen_id)
  VALUES (v_ej.fecha_fin + 1, 'Apertura — saldos al ' || to_char(v_ej.fecha_fin, 'DD/MM/YYYY'),
          'apertura', 'apertura', v_sig::text)
  RETURNING id INTO v_id;

  INSERT INTO contabilidad.lineas (asiento_id, orden, cuenta_id, debe, haber, moneda, importe_origen, tc,
                                   centro_costo_id, proveedor_id, disciplina_id)
  SELECT v_id, row_number() OVER (ORDER BY c.codigo, s.proveedor_id, s.disciplina_id, s.centro_costo_id),
         s.cuenta_id, greatest(s.base, 0), greatest(-s.base, 0),
         c.moneda,
         CASE WHEN c.moneda IS NOT NULL THEN abs(s.origen) END,
         CASE WHEN c.moneda IS NOT NULL THEN
           CASE WHEN s.origen <> 0 THEN round(abs(s.base) / abs(s.origen), 10)
                ELSE contabilidad.tc_cierre(c.moneda, v_ej.fecha_fin) END
         END,
         s.centro_costo_id, s.proveedor_id, s.disciplina_id
  FROM (
    SELECT l.cuenta_id, l.proveedor_id, l.disciplina_id, l.centro_costo_id,
           sum(l.debe - l.haber) AS base,
           coalesce(sum(CASE WHEN l.debe > 0 THEN l.importe_origen ELSE -l.importe_origen END), 0) AS origen
    FROM contabilidad.lineas l
    JOIN contabilidad.asientos a ON a.id = l.asiento_id
    JOIN contabilidad.cuentas c ON c.id = l.cuenta_id
    WHERE a.ejercicio_id = p_ejercicio AND a.estado = 'confirmado'
      AND c.clase IN ('activo', 'pasivo', 'patrimonio')
    GROUP BY l.cuenta_id, l.proveedor_id, l.disciplina_id, l.centro_costo_id
    HAVING sum(l.debe - l.haber) <> 0
  ) s
  JOIN contabilidad.cuentas c ON c.id = s.cuenta_id;
  GET DIAGNOSTICS v_n = ROW_COUNT;

  IF v_n = 0 THEN
    DELETE FROM contabilidad.asientos WHERE id = v_id;
  ELSE
    UPDATE contabilidad.asientos SET estado = 'confirmado' WHERE id = v_id;
  END IF;

  PERFORM set_config('contabilidad.proceso', '', true);
  RETURN v_sig;
END;
$$;

CREATE FUNCTION contabilidad.nombres_usuarios(p_ids uuid[])
RETURNS TABLE (id uuid, nombre text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  PERFORM contabilidad._exigir_lectura();
  RETURN QUERY
  SELECT p.id, btrim(p.nombre || ' ' || p.apellido)
  FROM public.perfiles p
  WHERE p.id = ANY (p_ids);
END;
$$;

REVOKE EXECUTE ON FUNCTION contabilidad.nombres_usuarios(uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION contabilidad.nombres_usuarios(uuid[]) TO authenticated, service_role;
