-- ============================================================
-- Contabilidad — presupuesto económico
--
-- Un presupuesto por ejercicio, con versiones: el borrador se edita,
-- el aprobado queda congelado y una reformulación es una versión nueva
-- (la anterior pasa a "reemplazado"). Importe por cuenta de ingreso o
-- egreso, centro de costo (disciplina / área, opcional) y mes, en pesos.
-- Lo real sale de los asientos confirmados del período, sin apertura,
-- cierre ni refundición, con el signo de presentación de la clase.
-- (ContaSystem: "aprobado" no bloqueaba nada y lo real incluía el
-- asiento de cierre.)
-- ============================================================

CREATE TABLE contabilidad.presupuestos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ejercicio_id uuid NOT NULL REFERENCES contabilidad.ejercicios (id) ON DELETE RESTRICT,
  version integer NOT NULL CHECK (version > 0),
  nombre text NOT NULL,
  estado text NOT NULL DEFAULT 'borrador' CHECK (estado IN ('borrador', 'aprobado', 'reemplazado')),
  notas text,
  creado_por uuid DEFAULT contabilidad._usuario(),
  created_at timestamptz NOT NULL DEFAULT now(),
  aprobado_por uuid,
  aprobado_at timestamptz,
  UNIQUE (ejercicio_id, version),
  CHECK ((estado = 'borrador') = (aprobado_at IS NULL))
);

-- Un solo aprobado vigente y un solo borrador por ejercicio
CREATE UNIQUE INDEX presupuestos_aprobado_unico ON contabilidad.presupuestos (ejercicio_id) WHERE estado = 'aprobado';
CREATE UNIQUE INDEX presupuestos_borrador_unico ON contabilidad.presupuestos (ejercicio_id) WHERE estado = 'borrador';

CREATE TABLE contabilidad.presupuesto_lineas (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  presupuesto_id uuid NOT NULL REFERENCES contabilidad.presupuestos (id) ON DELETE CASCADE,
  cuenta_id uuid NOT NULL REFERENCES contabilidad.cuentas (id) ON DELETE RESTRICT,
  centro_costo_id uuid REFERENCES contabilidad.centros_costo (id) ON DELETE RESTRICT,
  mes smallint NOT NULL CHECK (mes BETWEEN 1 AND 12),
  importe numeric(18, 2) NOT NULL CHECK (importe >= 0)
);

CREATE UNIQUE INDEX presupuesto_lineas_unica ON contabilidad.presupuesto_lineas
  (presupuesto_id, cuenta_id, coalesce(centro_costo_id, '00000000-0000-0000-0000-000000000000'::uuid), mes);

-- Solo cuentas imputables de resultado; un presupuesto aprobado no se toca.
CREATE FUNCTION contabilidad._presupuesto_linea_valida() RETURNS trigger
LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE
  v_estado text;
  v_cuenta contabilidad.cuentas;
  v_id uuid := CASE WHEN TG_OP = 'DELETE' THEN OLD.presupuesto_id ELSE NEW.presupuesto_id END;
BEGIN
  SELECT estado INTO v_estado FROM contabilidad.presupuestos WHERE id = v_id;
  IF v_estado IS NOT NULL AND v_estado <> 'borrador' THEN
    RAISE EXCEPTION 'El presupuesto está %: para cambiarlo, reformulalo (versión nueva)', v_estado;
  END IF;
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  SELECT * INTO v_cuenta FROM contabilidad.cuentas WHERE id = NEW.cuenta_id;
  IF NOT v_cuenta.imputable OR v_cuenta.clase NOT IN ('ingreso', 'egreso') THEN
    RAISE EXCEPTION 'Solo se presupuestan cuentas imputables de ingresos o egresos (%)', v_cuenta.codigo;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER presupuesto_lineas_valida BEFORE INSERT OR UPDATE OR DELETE ON contabilidad.presupuesto_lineas
  FOR EACH ROW EXECUTE FUNCTION contabilidad._presupuesto_linea_valida();

CREATE FUNCTION contabilidad._presupuesto_valido() RETURNS trigger
LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.estado <> 'borrador' THEN
      RAISE EXCEPTION 'Solo se borra un presupuesto en borrador';
    END IF;
    RETURN OLD;
  END IF;
  IF NEW.ejercicio_id <> OLD.ejercicio_id OR NEW.version <> OLD.version THEN
    RAISE EXCEPTION 'El ejercicio y la versión de un presupuesto no cambian';
  END IF;
  -- Borrador: se edita libremente. Aprobado: solo pasa a reemplazado
  -- (cuando se aprueba su reformulación). Reemplazado: queda como está.
  IF OLD.estado = 'borrador' THEN
    RETURN NEW;
  END IF;
  IF OLD.estado = 'aprobado' AND NEW.estado = 'reemplazado'
     AND (to_jsonb(NEW) - 'estado') = (to_jsonb(OLD) - 'estado') THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'Un presupuesto % no se modifica: reformulalo en una versión nueva', OLD.estado;
END;
$$;

CREATE TRIGGER presupuestos_valido BEFORE UPDATE OR DELETE ON contabilidad.presupuestos
  FOR EACH ROW EXECUTE FUNCTION contabilidad._presupuesto_valido();

-- ------------------------------------------------------------
-- Real por cuenta, centro y mes (signo de presentación de la clase)
-- ------------------------------------------------------------
CREATE FUNCTION contabilidad.resultado_real(p_desde date, p_hasta date)
RETURNS TABLE (cuenta_id uuid, centro_costo_id uuid, anio integer, mes integer, importe numeric)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  PERFORM contabilidad._exigir_lectura();
  RETURN QUERY
  SELECT l.cuenta_id, l.centro_costo_id,
         extract(year FROM a.fecha)::integer, extract(month FROM a.fecha)::integer,
         sum(CASE WHEN c.clase = 'egreso' THEN l.debe - l.haber ELSE l.haber - l.debe END)
  FROM contabilidad.lineas l
  JOIN contabilidad.asientos a ON a.id = l.asiento_id
  JOIN contabilidad.cuentas c ON c.id = l.cuenta_id
  WHERE a.estado = 'confirmado' AND a.fecha BETWEEN p_desde AND p_hasta
    AND a.tipo NOT IN ('apertura', 'cierre', 'refundicion')
    AND c.clase IN ('ingreso', 'egreso')
  GROUP BY 1, 2, 3, 4;
END;
$$;

-- ------------------------------------------------------------
-- Operaciones
-- ------------------------------------------------------------
-- Crea el borrador de un ejercicio. Base para precargar: 'vacio',
-- 'ejercicio_anterior' (lo real del año anterior, mes a mes) o
-- 'promedio' (promedio mensual de los últimos p_meses meses reales,
-- repetido en los 12 meses). Con un aprobado vigente, es su reformulación
-- y parte de sus importes salvo que se pida otra base.
CREATE FUNCTION contabilidad.crear_presupuesto(
  p_ejercicio uuid, p_base text DEFAULT 'vacio', p_meses integer DEFAULT 3, p_nombre text DEFAULT NULL
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
    v_hasta := least(contabilidad._hoy(), v_ej.fecha_inicio - 1);
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

-- p_lineas: [{ cuenta_id, centro_costo_id?, mes, importe }] — reemplaza
-- las celdas indicadas (importe 0 = borrar la celda).
CREATE FUNCTION contabilidad.guardar_presupuesto_lineas(p_presupuesto uuid, p_lineas jsonb) RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_l jsonb;
  v_n integer := 0;
BEGIN
  PERFORM contabilidad._exigir_escritura();
  FOR v_l IN SELECT * FROM jsonb_array_elements(coalesce(p_lineas, '[]')) LOOP
    DELETE FROM contabilidad.presupuesto_lineas
    WHERE presupuesto_id = p_presupuesto AND cuenta_id = (v_l ->> 'cuenta_id')::uuid
      AND coalesce(centro_costo_id, '00000000-0000-0000-0000-000000000000'::uuid)
          = coalesce((v_l ->> 'centro_costo_id')::uuid, '00000000-0000-0000-0000-000000000000'::uuid)
      AND mes = (v_l ->> 'mes')::smallint;
    IF coalesce((v_l ->> 'importe')::numeric, 0) > 0 THEN
      INSERT INTO contabilidad.presupuesto_lineas (presupuesto_id, cuenta_id, centro_costo_id, mes, importe)
      VALUES (p_presupuesto, (v_l ->> 'cuenta_id')::uuid, (v_l ->> 'centro_costo_id')::uuid,
              (v_l ->> 'mes')::smallint, round((v_l ->> 'importe')::numeric, 2));
    END IF;
    v_n := v_n + 1;
  END LOOP;
  RETURN v_n;
END;
$$;

CREATE FUNCTION contabilidad.aprobar_presupuesto(p_presupuesto uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_p contabilidad.presupuestos;
BEGIN
  PERFORM contabilidad._exigir_escritura();
  SELECT * INTO v_p FROM contabilidad.presupuestos WHERE id = p_presupuesto FOR UPDATE;
  IF v_p.estado IS DISTINCT FROM 'borrador' THEN
    RAISE EXCEPTION 'Solo se aprueba un borrador';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM contabilidad.presupuesto_lineas WHERE presupuesto_id = p_presupuesto) THEN
    RAISE EXCEPTION 'El presupuesto está vacío';
  END IF;
  UPDATE contabilidad.presupuestos SET estado = 'reemplazado'
  WHERE ejercicio_id = v_p.ejercicio_id AND estado = 'aprobado';
  UPDATE contabilidad.presupuestos SET estado = 'aprobado', aprobado_por = contabilidad._usuario(), aprobado_at = now()
  WHERE id = p_presupuesto;
END;
$$;

CREATE FUNCTION contabilidad.eliminar_presupuesto(p_presupuesto uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  PERFORM contabilidad._exigir_escritura();
  DELETE FROM contabilidad.presupuestos WHERE id = p_presupuesto;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Presupuesto inexistente';
  END IF;
END;
$$;

-- Presupuestado contra real por cuenta (y centro si se pide) en un rango
-- de meses del ejercicio del presupuesto.
CREATE FUNCTION contabilidad.ejecucion_presupuesto(
  p_presupuesto uuid, p_mes_desde integer DEFAULT 1, p_mes_hasta integer DEFAULT 12, p_por_centro boolean DEFAULT false
) RETURNS TABLE (cuenta_id uuid, centro_costo_id uuid, presupuestado numeric, ejecutado numeric, desvio numeric)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_ej contabilidad.ejercicios;
BEGIN
  PERFORM contabilidad._exigir_lectura();
  SELECT e.* INTO v_ej FROM contabilidad.ejercicios e
  JOIN contabilidad.presupuestos p ON p.ejercicio_id = e.id WHERE p.id = p_presupuesto;
  IF v_ej.id IS NULL THEN
    RAISE EXCEPTION 'Presupuesto inexistente';
  END IF;
  RETURN QUERY
  WITH pres AS (
    SELECT pl.cuenta_id, CASE WHEN p_por_centro THEN pl.centro_costo_id END AS centro, sum(pl.importe) AS importe
    FROM contabilidad.presupuesto_lineas pl
    WHERE pl.presupuesto_id = p_presupuesto AND pl.mes BETWEEN p_mes_desde AND p_mes_hasta
    GROUP BY 1, 2
  ), re AS (
    SELECT r.cuenta_id, CASE WHEN p_por_centro THEN r.centro_costo_id END AS centro, sum(r.importe) AS importe
    FROM contabilidad.resultado_real(v_ej.fecha_inicio, v_ej.fecha_fin) r
    WHERE r.mes BETWEEN p_mes_desde AND p_mes_hasta
    GROUP BY 1, 2
  )
  SELECT coalesce(pres.cuenta_id, re.cuenta_id), coalesce(pres.centro, re.centro),
         coalesce(pres.importe, 0), coalesce(re.importe, 0), coalesce(re.importe, 0) - coalesce(pres.importe, 0)
  FROM pres FULL JOIN re ON re.cuenta_id = pres.cuenta_id AND re.centro IS NOT DISTINCT FROM pres.centro;
END;
$$;

-- ------------------------------------------------------------
-- RLS, auditoría y permisos
-- ------------------------------------------------------------
ALTER TABLE contabilidad.presupuestos ENABLE ROW LEVEL SECURITY;
ALTER TABLE contabilidad.presupuesto_lineas ENABLE ROW LEVEL SECURITY;
CREATE POLICY presupuestos_lectura ON contabilidad.presupuestos FOR SELECT TO authenticated USING (contabilidad.puede_leer());
CREATE POLICY presupuesto_lineas_lectura ON contabilidad.presupuesto_lineas FOR SELECT TO authenticated USING (contabilidad.puede_leer());
CREATE TRIGGER presupuestos_auditoria AFTER INSERT OR UPDATE OR DELETE ON contabilidad.presupuestos
  FOR EACH ROW EXECUTE FUNCTION contabilidad._auditar();
CREATE TRIGGER presupuesto_lineas_auditoria AFTER INSERT OR UPDATE OR DELETE ON contabilidad.presupuesto_lineas
  FOR EACH ROW EXECUTE FUNCTION contabilidad._auditar();

REVOKE ALL ON contabilidad.presupuestos, contabilidad.presupuesto_lineas FROM PUBLIC, anon, authenticated;
GRANT SELECT ON contabilidad.presupuestos, contabilidad.presupuesto_lineas TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION contabilidad._presupuesto_linea_valida(), contabilidad._presupuesto_valido()
  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION contabilidad.resultado_real(date, date),
  contabilidad.crear_presupuesto(uuid, text, integer, text),
  contabilidad.guardar_presupuesto_lineas(uuid, jsonb), contabilidad.aprobar_presupuesto(uuid),
  contabilidad.eliminar_presupuesto(uuid), contabilidad.ejecucion_presupuesto(uuid, integer, integer, boolean)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION contabilidad.resultado_real(date, date),
  contabilidad.crear_presupuesto(uuid, text, integer, text),
  contabilidad.guardar_presupuesto_lineas(uuid, jsonb), contabilidad.aprobar_presupuesto(uuid),
  contabilidad.eliminar_presupuesto(uuid), contabilidad.ejecucion_presupuesto(uuid, integer, integer, boolean)
  TO authenticated, service_role;
