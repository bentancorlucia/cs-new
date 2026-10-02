-- ============================================================
-- Contabilidad — flujo de caja y conciliación bancaria
--
-- Flujo de caja (método directo): por cada asiento, la variación de las
-- disponibilidades se atribuye a sus contrapartidas. Se excluyen apertura,
-- cierre y refundición; la revaluación de moneda extranjera va aparte.
-- En asientos mixtos se neutraliza la parte que no movió caja (ContaSystem
-- atribuía el asiento completo y mostraba la apertura como flujo):
--   * una venta muestra el cobro de la venta, no el costo ni la baja del
--     stock que se compensan entre sí;
--   * un pago a proveedor con diferencia de cambio muestra el pago neto;
--   * un cobro con comisión descontada muestra el ingreso bruto y la
--     comisión como egreso.
--
-- Conciliación bancaria: extractos encadenados por cuenta (cada uno
-- empieza donde terminó el anterior y su saldo inicial es el final de
-- aquel), con saldos declarados por el banco y movimientos que tienen que
-- cerrar. Cada movimiento del banco y cada línea de los libros se concilia
-- una sola vez; un extracto cerrado no se toca y un asiento conciliado no
-- se revierte sin desconciliarlo antes. (ContaSystem derivaba el saldo
-- del banco de los libros y permitía anular asientos conciliados.)
-- ============================================================

-- ------------------------------------------------------------
-- Cuentas de resultado que no mueven caja (para proyectar el flujo
-- desde el presupuesto)
-- ------------------------------------------------------------
ALTER TABLE contabilidad.cuentas ADD COLUMN afecta_caja boolean NOT NULL DEFAULT true;
ALTER TABLE contabilidad.cuentas ADD CONSTRAINT cuentas_afecta_caja_resultado
  CHECK (afecta_caja OR clase IN ('ingreso', 'egreso'));
COMMENT ON COLUMN contabilidad.cuentas.afecta_caja IS
  'Falso en resultados sin movimiento de fondos (amortizaciones, revaluación, mermas, incobrables)';
UPDATE contabilidad.cuentas SET afecta_caja = false
WHERE codigo IN ('5.6.01', '4.6.02.02', '5.7.02.02', '5.1.02', '5.9.01');

-- ------------------------------------------------------------
-- Saldo de un conjunto de cuentas
-- ------------------------------------------------------------
-- p_inicio = true: al empezar el día p_fecha (contando la apertura del
-- ejercicio); false: al terminar el día. p_origen = true: en la moneda de
-- la cuenta (todas tienen que ser de la misma). Si el ejercicio todavía no
-- tiene apertura (el anterior sin cerrar), arrastra el saldo del anterior.
CREATE FUNCTION contabilidad._saldo_cuentas(p_cuentas uuid[], p_fecha date, p_inicio boolean, p_origen boolean)
RETURNS numeric
LANGUAGE plpgsql STABLE SET search_path = '' AS $$
DECLARE
  v_ej contabilidad.ejercicios;
  v_ant date;
  v_saldo numeric;
BEGIN
  SELECT * INTO v_ej FROM contabilidad.ejercicios WHERE p_fecha BETWEEN fecha_inicio AND fecha_fin;
  IF v_ej.id IS NULL THEN
    RETURN 0;
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

-- Saldo de las disponibilidades (o de una) al empezar el día p_fecha.
CREATE FUNCTION contabilidad.saldo_disponibilidades(p_fecha date, p_disponibilidad uuid DEFAULT NULL)
RETURNS numeric
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  PERFORM contabilidad._exigir_lectura();
  RETURN contabilidad._saldo_cuentas(
    ARRAY(SELECT id FROM contabilidad.cuentas
          WHERE CASE WHEN p_disponibilidad IS NULL THEN es_disponibilidad ELSE id = p_disponibilidad END),
    p_fecha, true, false);
END;
$$;

-- ------------------------------------------------------------
-- Flujo de un asiento
-- ------------------------------------------------------------
-- Devuelve cuánto entró (+) o salió (−) de las disponibilidades por cada
-- contrapartida (cuenta y centro de costo). Las contrapartidas "fuente"
-- son las del lado opuesto a la caja; las del mismo lado ("no fuente")
-- son la parte que no movió fondos y se neutralizan en este orden:
--   A. resultados no fuente contra patrimoniales fuente (costo de venta
--      contra mercadería, diferencia de cambio contra la deuda pagada);
--   B. patrimoniales no fuente contra patrimoniales fuente (proveedor
--      contra mercadería en una compra pagada en parte);
--   C. patrimoniales no fuente contra resultados fuente (seña aplicada
--      a una venta);
--   D. lo que queda de resultados no fuente se muestra bruto (comisión
--      descontada de un cobro).
-- Por construcción la suma es la variación de las disponibilidades.
CREATE FUNCTION contabilidad._flujo_asiento(p_asiento uuid, p_disponibilidad uuid DEFAULT NULL)
RETURNS TABLE (cuenta_id uuid, centro_costo_id uuid, importe numeric)
LANGUAGE sql STABLE SET search_path = '' AS $$
  WITH l AS (
    SELECT l.cuenta_id, l.centro_costo_id, l.debe, l.haber,
           CASE WHEN p_disponibilidad IS NULL THEN c.es_disponibilidad ELSE l.cuenta_id = p_disponibilidad END AS disp,
           c.clase NOT IN ('ingreso', 'egreso') AS patrimonial
    FROM contabilidad.lineas l JOIN contabilidad.cuentas c ON c.id = l.cuenta_id
    WHERE l.asiento_id = p_asiento
  ), d AS (
    SELECT coalesce(sum(debe - haber) FILTER (WHERE disp), 0) AS d FROM l
  ), k AS (
    -- m > 0: fuente; m < 0: no fuente (en el sentido del movimiento de caja)
    SELECT l.cuenta_id, l.centro_costo_id, bool_or(l.patrimonial) AS patrimonial,
           sum(l.haber - l.debe) * sign(d.d) AS m, sign(d.d) AS s
    FROM l CROSS JOIN d
    WHERE NOT l.disp AND d.d <> 0
    GROUP BY l.cuenta_id, l.centro_costo_id, d.d
  ), t AS (
    SELECT coalesce(sum(m) FILTER (WHERE m > 0 AND patrimonial), 0) AS fp,
           coalesce(sum(m) FILTER (WHERE m > 0 AND NOT patrimonial), 0) AS fr,
           coalesce(-sum(m) FILTER (WHERE m < 0 AND patrimonial), 0) AS np,
           coalesce(-sum(m) FILTER (WHERE m < 0 AND NOT patrimonial), 0) AS nr
    FROM k
  ), a AS (
    SELECT t.*, least(nr, fp) AS a_ FROM t
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

-- Flujo de fondos por mes y contrapartida en un rango. La revaluación de
-- las disponibilidades en moneda extranjera sale en una fila aparte
-- (cuenta_id nula, revaluacion = true).
-- Saldo final = saldo_disponibilidades(p_desde) + suma de las filas.
CREATE FUNCTION contabilidad.flujo_caja(p_desde date, p_hasta date, p_disponibilidad uuid DEFAULT NULL)
RETURNS TABLE (anio integer, mes integer, cuenta_id uuid, centro_costo_id uuid, importe numeric, revaluacion boolean)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  PERFORM contabilidad._exigir_lectura();
  IF p_hasta < p_desde THEN
    RAISE EXCEPTION 'El rango de fechas está invertido';
  END IF;
  RETURN QUERY
  WITH a AS (
    SELECT id, fecha, tipo FROM contabilidad.asientos
    WHERE estado = 'confirmado' AND fecha BETWEEN p_desde AND p_hasta
      AND tipo NOT IN ('apertura', 'cierre', 'refundicion')
  )
  SELECT extract(year FROM a.fecha)::integer, extract(month FROM a.fecha)::integer,
         f.cuenta_id, f.centro_costo_id, sum(f.importe), false
  FROM a CROSS JOIN LATERAL contabilidad._flujo_asiento(a.id, p_disponibilidad) f
  WHERE a.tipo <> 'revaluacion'
  GROUP BY 1, 2, 3, 4
  HAVING sum(f.importe) <> 0
  UNION ALL
  SELECT extract(year FROM a.fecha)::integer, extract(month FROM a.fecha)::integer,
         NULL::uuid, NULL::uuid, sum(l.debe - l.haber), true
  FROM a
  JOIN contabilidad.lineas l ON l.asiento_id = a.id
  JOIN contabilidad.cuentas c ON c.id = l.cuenta_id
  WHERE a.tipo = 'revaluacion'
    AND CASE WHEN p_disponibilidad IS NULL THEN c.es_disponibilidad ELSE l.cuenta_id = p_disponibilidad END
  GROUP BY 1, 2
  HAVING sum(l.debe - l.haber) <> 0;
END;
$$;

-- ------------------------------------------------------------
-- Conciliación bancaria
-- ------------------------------------------------------------
CREATE TABLE contabilidad.extractos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cuenta_id uuid NOT NULL REFERENCES contabilidad.cuentas (id) ON DELETE RESTRICT,
  fecha_desde date NOT NULL,
  fecha_hasta date NOT NULL,
  -- En la moneda de la cuenta, tal como los informa el banco.
  saldo_inicial numeric(18, 2) NOT NULL,
  saldo_final numeric(18, 2) NOT NULL,
  archivo text,
  notas text,
  estado text NOT NULL DEFAULT 'abierto' CHECK (estado IN ('abierto', 'cerrado')),
  creado_por uuid DEFAULT contabilidad._usuario(),
  created_at timestamptz NOT NULL DEFAULT now(),
  cerrado_por uuid,
  cerrado_at timestamptz,
  CHECK (fecha_hasta >= fecha_desde),
  CHECK ((estado = 'cerrado') = (cerrado_at IS NOT NULL)),
  UNIQUE (cuenta_id, fecha_desde)
);

CREATE TABLE contabilidad.extracto_movimientos (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  extracto_id uuid NOT NULL REFERENCES contabilidad.extractos (id) ON DELETE CASCADE,
  orden integer NOT NULL,
  fecha date NOT NULL,
  concepto text NOT NULL CHECK (length(btrim(concepto)) > 0),
  referencia text,
  -- Positivo: entra a la cuenta (crédito del banco); negativo: sale.
  importe numeric(18, 2) NOT NULL CHECK (importe <> 0),
  saldo numeric(18, 2),
  UNIQUE (extracto_id, orden)
);

CREATE TABLE contabilidad.conciliaciones (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  extracto_id uuid NOT NULL REFERENCES contabilidad.extractos (id) ON DELETE CASCADE,
  creado_por uuid DEFAULT contabilidad._usuario(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE contabilidad.conciliacion_movimientos (
  conciliacion_id bigint NOT NULL REFERENCES contabilidad.conciliaciones (id) ON DELETE CASCADE,
  movimiento_id bigint NOT NULL UNIQUE REFERENCES contabilidad.extracto_movimientos (id) ON DELETE CASCADE,
  PRIMARY KEY (conciliacion_id, movimiento_id)
);

CREATE TABLE contabilidad.conciliacion_lineas (
  conciliacion_id bigint NOT NULL REFERENCES contabilidad.conciliaciones (id) ON DELETE CASCADE,
  linea_id bigint NOT NULL UNIQUE REFERENCES contabilidad.lineas (id) ON DELETE RESTRICT,
  PRIMARY KEY (conciliacion_id, linea_id)
);

CREATE INDEX extracto_movimientos_extracto_idx ON contabilidad.extracto_movimientos (extracto_id);
CREATE INDEX conciliaciones_extracto_idx ON contabilidad.conciliaciones (extracto_id);

-- Importe de una línea en la moneda de su cuenta (+ debe, − haber).
CREATE FUNCTION contabilidad._importe_en_moneda(p_linea contabilidad.lineas) RETURNS numeric
LANGUAGE sql IMMUTABLE SET search_path = '' AS $$
  SELECT CASE WHEN p_linea.moneda IS NULL THEN p_linea.debe - p_linea.haber
              WHEN p_linea.debe > 0 THEN coalesce(p_linea.importe_origen, 0)
              ELSE -coalesce(p_linea.importe_origen, 0) END
$$;

-- Un extracto cerrado no cambia; sus datos del banco no cambian nunca.
CREATE FUNCTION contabilidad._extracto_valido() RETURNS trigger
LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.estado = 'cerrado' THEN
      RAISE EXCEPTION 'Un extracto cerrado no se borra: reabrilo primero';
    END IF;
    RETURN OLD;
  END IF;
  IF (NEW.cuenta_id, NEW.fecha_desde, NEW.fecha_hasta, NEW.saldo_inicial, NEW.saldo_final)
     IS DISTINCT FROM (OLD.cuenta_id, OLD.fecha_desde, OLD.fecha_hasta, OLD.saldo_inicial, OLD.saldo_final) THEN
    RAISE EXCEPTION 'Los datos del banco de un extracto no se modifican: borralo e importalo de nuevo';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER extractos_valido BEFORE UPDATE OR DELETE ON contabilidad.extractos
  FOR EACH ROW EXECUTE FUNCTION contabilidad._extracto_valido();

-- Movimientos y vínculos solo cambian con el extracto abierto; los
-- movimientos no se editan (se borra el extracto y se importa de nuevo).
CREATE FUNCTION contabilidad._extracto_abierto() RETURNS trigger
LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE
  v_fila jsonb := to_jsonb(CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END);
  v_extracto uuid;
  v_estado text;
BEGIN
  IF TG_TABLE_NAME = 'extracto_movimientos' AND TG_OP = 'UPDATE' THEN
    RAISE EXCEPTION 'Los movimientos de un extracto no se editan';
  END IF;
  IF v_fila ? 'extracto_id' THEN
    v_extracto := (v_fila ->> 'extracto_id')::uuid;
  ELSE
    SELECT extracto_id INTO v_extracto FROM contabilidad.conciliaciones
    WHERE id = (v_fila ->> 'conciliacion_id')::bigint;
  END IF;
  SELECT estado INTO v_estado FROM contabilidad.extractos WHERE id = v_extracto;
  -- Sin extracto: es el borrado en cascada de uno abierto.
  IF v_estado = 'cerrado' THEN
    RAISE EXCEPTION 'El extracto está cerrado: reabrilo para cambiar la conciliación';
  END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$;

CREATE TRIGGER extracto_movimientos_abierto BEFORE INSERT OR UPDATE OR DELETE ON contabilidad.extracto_movimientos
  FOR EACH ROW EXECUTE FUNCTION contabilidad._extracto_abierto();
CREATE TRIGGER conciliaciones_abierto BEFORE INSERT OR UPDATE OR DELETE ON contabilidad.conciliaciones
  FOR EACH ROW EXECUTE FUNCTION contabilidad._extracto_abierto();
CREATE TRIGGER conciliacion_movimientos_abierto BEFORE INSERT OR UPDATE OR DELETE ON contabilidad.conciliacion_movimientos
  FOR EACH ROW EXECUTE FUNCTION contabilidad._extracto_abierto();
CREATE TRIGGER conciliacion_lineas_abierto BEFORE INSERT OR UPDATE OR DELETE ON contabilidad.conciliacion_lineas
  FOR EACH ROW EXECUTE FUNCTION contabilidad._extracto_abierto();

-- Un asiento con líneas conciliadas no se revierte.
CREATE FUNCTION contabilidad._asiento_no_conciliado() RETURNS trigger
LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE
  v_extracto contabilidad.extractos;
BEGIN
  IF NEW.revertido_por_id IS NOT NULL AND OLD.revertido_por_id IS NULL THEN
    SELECT e.* INTO v_extracto
    FROM contabilidad.conciliacion_lineas cl
    JOIN contabilidad.lineas l ON l.id = cl.linea_id
    JOIN contabilidad.conciliaciones c ON c.id = cl.conciliacion_id
    JOIN contabilidad.extractos e ON e.id = c.extracto_id
    WHERE l.asiento_id = NEW.id
    LIMIT 1;
    IF v_extracto.id IS NOT NULL THEN
      RAISE EXCEPTION 'El asiento % está conciliado con el extracto del % al %: desconcilialo antes de revertirlo',
        OLD.numero, to_char(v_extracto.fecha_desde, 'DD/MM/YYYY'), to_char(v_extracto.fecha_hasta, 'DD/MM/YYYY');
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER asientos_no_conciliado BEFORE UPDATE OF revertido_por_id ON contabilidad.asientos
  FOR EACH ROW EXECUTE FUNCTION contabilidad._asiento_no_conciliado();

-- ------------------------------------------------------------
-- Operaciones de conciliación
-- ------------------------------------------------------------
-- p_movimientos: [{ fecha, concepto, referencia?, importe (+ entra / − sale), saldo? }]
-- en el orden del extracto. Tiene que seguir al último extracto de la
-- cuenta y cerrar: saldo inicial + movimientos = saldo final, y cada saldo
-- informado por fila tiene que coincidir con el acumulado.
CREATE FUNCTION contabilidad.importar_extracto(
  p_cuenta uuid, p_desde date, p_hasta date, p_saldo_inicial numeric, p_saldo_final numeric,
  p_movimientos jsonb, p_archivo text DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_cuenta contabilidad.cuentas;
  v_ultimo contabilidad.extractos;
  v_id uuid;
  v_m jsonb;
  v_i integer;
  v_acum numeric := p_saldo_inicial;
  v_importe numeric;
  v_fecha date;
BEGIN
  PERFORM contabilidad._exigir_escritura();
  SELECT * INTO v_cuenta FROM contabilidad.cuentas WHERE id = p_cuenta FOR UPDATE;
  IF v_cuenta.id IS NULL OR NOT v_cuenta.es_disponibilidad OR NOT v_cuenta.imputable THEN
    RAISE EXCEPTION 'Los extractos se cargan sobre una cuenta de caja o banco';
  END IF;
  IF p_desde IS NULL OR p_hasta IS NULL OR p_hasta < p_desde THEN
    RAISE EXCEPTION 'El período del extracto no es válido';
  END IF;
  IF p_saldo_inicial IS NULL OR p_saldo_final IS NULL THEN
    RAISE EXCEPTION 'Indicá los saldos inicial y final que informa el banco';
  END IF;

  SELECT * INTO v_ultimo FROM contabilidad.extractos WHERE cuenta_id = p_cuenta
  ORDER BY fecha_hasta DESC LIMIT 1;
  IF v_ultimo.id IS NOT NULL THEN
    IF p_desde <> v_ultimo.fecha_hasta + 1 THEN
      RAISE EXCEPTION 'Los extractos van seguidos: este tiene que empezar el % (el anterior termina el %)',
        to_char(v_ultimo.fecha_hasta + 1, 'DD/MM/YYYY'), to_char(v_ultimo.fecha_hasta, 'DD/MM/YYYY');
    END IF;
    IF round(p_saldo_inicial, 2) <> v_ultimo.saldo_final THEN
      RAISE EXCEPTION 'El saldo inicial (%) no coincide con el saldo final del extracto anterior (%)',
        round(p_saldo_inicial, 2), v_ultimo.saldo_final;
    END IF;
  END IF;

  INSERT INTO contabilidad.extractos (cuenta_id, fecha_desde, fecha_hasta, saldo_inicial, saldo_final, archivo)
  VALUES (p_cuenta, p_desde, p_hasta, round(p_saldo_inicial, 2), round(p_saldo_final, 2), nullif(btrim(p_archivo), ''))
  RETURNING id INTO v_id;

  FOR v_m, v_i IN SELECT e, o FROM jsonb_array_elements(coalesce(p_movimientos, '[]')) WITH ORDINALITY AS t(e, o) LOOP
    v_fecha := (v_m ->> 'fecha')::date;
    v_importe := round((v_m ->> 'importe')::numeric, 2);
    IF v_fecha IS NULL OR v_fecha NOT BETWEEN p_desde AND p_hasta THEN
      RAISE EXCEPTION 'Movimiento %: la fecha está fuera del período del extracto', v_i;
    END IF;
    IF v_importe IS NULL OR v_importe = 0 THEN
      RAISE EXCEPTION 'Movimiento %: falta el importe', v_i;
    END IF;
    v_acum := v_acum + v_importe;
    IF v_m ->> 'saldo' IS NOT NULL AND round((v_m ->> 'saldo')::numeric, 2) <> v_acum THEN
      RAISE EXCEPTION 'Movimiento % (%): el saldo informado (%) no coincide con el acumulado (%)',
        v_i, v_m ->> 'concepto', round((v_m ->> 'saldo')::numeric, 2), v_acum;
    END IF;
    INSERT INTO contabilidad.extracto_movimientos (extracto_id, orden, fecha, concepto, referencia, importe, saldo)
    VALUES (v_id, v_i, v_fecha, btrim(v_m ->> 'concepto'), nullif(btrim(v_m ->> 'referencia'), ''), v_importe,
            round((v_m ->> 'saldo')::numeric, 2));
  END LOOP;

  IF v_acum <> round(p_saldo_final, 2) THEN
    RAISE EXCEPTION 'El extracto no cierra: saldo inicial % + movimientos % = %, pero el banco informa %',
      round(p_saldo_inicial, 2), v_acum - round(p_saldo_inicial, 2), v_acum, round(p_saldo_final, 2);
  END IF;
  RETURN v_id;
END;
$$;

-- Solo se borra el último extracto de la cuenta, y abierto.
CREATE FUNCTION contabilidad.eliminar_extracto(p_extracto uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_e contabilidad.extractos;
BEGIN
  PERFORM contabilidad._exigir_escritura();
  SELECT * INTO v_e FROM contabilidad.extractos WHERE id = p_extracto FOR UPDATE;
  IF v_e.id IS NULL THEN
    RAISE EXCEPTION 'Extracto inexistente';
  END IF;
  IF EXISTS (SELECT 1 FROM contabilidad.extractos WHERE cuenta_id = v_e.cuenta_id AND fecha_desde > v_e.fecha_hasta) THEN
    RAISE EXCEPTION 'Solo se borra el último extracto de la cuenta';
  END IF;
  DELETE FROM contabilidad.extractos WHERE id = p_extracto;
END;
$$;

-- Vincula movimientos del extracto con líneas de los libros de la misma
-- cuenta. Tienen que sumar lo mismo (en la moneda de la cuenta). Un grupo
-- solo de líneas que suman cero (un asiento y su reversión) también vale.
CREATE FUNCTION contabilidad.conciliar(p_extracto uuid, p_movimientos bigint[], p_lineas bigint[]) RETURNS bigint
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_e contabilidad.extractos;
  v_id bigint;
  v_mov numeric;
  v_lin numeric;
  v_n integer;
BEGIN
  PERFORM contabilidad._exigir_escritura();
  SELECT * INTO v_e FROM contabilidad.extractos WHERE id = p_extracto FOR UPDATE;
  IF v_e.id IS NULL THEN
    RAISE EXCEPTION 'Extracto inexistente';
  END IF;
  IF v_e.estado <> 'abierto' THEN
    RAISE EXCEPTION 'El extracto está cerrado: reabrilo para cambiar la conciliación';
  END IF;
  p_movimientos := coalesce(p_movimientos, '{}');
  p_lineas := coalesce(p_lineas, '{}');
  IF cardinality(p_movimientos) + cardinality(p_lineas) = 0 THEN
    RAISE EXCEPTION 'Elegí qué conciliar';
  END IF;
  IF cardinality(ARRAY(SELECT DISTINCT unnest(p_movimientos))) <> cardinality(p_movimientos)
     OR cardinality(ARRAY(SELECT DISTINCT unnest(p_lineas))) <> cardinality(p_lineas) THEN
    RAISE EXCEPTION 'Hay movimientos o líneas repetidos';
  END IF;

  SELECT count(*), coalesce(sum(m.importe), 0) INTO v_n, v_mov
  FROM contabilidad.extracto_movimientos m WHERE m.id = ANY (p_movimientos) AND m.extracto_id = p_extracto;
  IF v_n <> cardinality(p_movimientos) THEN
    RAISE EXCEPTION 'Hay movimientos que no son de este extracto';
  END IF;
  IF EXISTS (SELECT 1 FROM contabilidad.conciliacion_movimientos WHERE movimiento_id = ANY (p_movimientos)) THEN
    RAISE EXCEPTION 'Hay movimientos del banco que ya están conciliados';
  END IF;

  SELECT count(*), coalesce(sum(contabilidad._importe_en_moneda(l)), 0) INTO v_n, v_lin
  FROM contabilidad.lineas l
  JOIN contabilidad.asientos a ON a.id = l.asiento_id
  WHERE l.id = ANY (p_lineas) AND l.cuenta_id = v_e.cuenta_id AND a.estado = 'confirmado'
    AND a.tipo NOT IN ('apertura', 'cierre', 'refundicion', 'revaluacion') AND a.fecha <= v_e.fecha_hasta;
  IF v_n <> cardinality(p_lineas) THEN
    RAISE EXCEPTION 'Hay líneas que no son de esta cuenta, no están confirmadas o son posteriores al extracto';
  END IF;
  IF EXISTS (SELECT 1 FROM contabilidad.conciliacion_lineas WHERE linea_id = ANY (p_lineas)) THEN
    RAISE EXCEPTION 'Hay líneas de los libros que ya están conciliadas';
  END IF;

  IF v_mov <> v_lin THEN
    RAISE EXCEPTION 'No coincide: banco % / libros %', v_mov, v_lin;
  END IF;

  INSERT INTO contabilidad.conciliaciones (extracto_id) VALUES (p_extracto) RETURNING id INTO v_id;
  INSERT INTO contabilidad.conciliacion_movimientos (conciliacion_id, movimiento_id)
  SELECT v_id, unnest(p_movimientos);
  INSERT INTO contabilidad.conciliacion_lineas (conciliacion_id, linea_id)
  SELECT v_id, unnest(p_lineas);
  RETURN v_id;
END;
$$;

CREATE FUNCTION contabilidad.desconciliar(p_conciliacion bigint) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  PERFORM contabilidad._exigir_escritura();
  DELETE FROM contabilidad.conciliaciones WHERE id = p_conciliacion;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Conciliación inexistente';
  END IF;
END;
$$;

-- Coincidencias 1 a 1 por importe exacto y fecha cercana, las más
-- cercanas primero. Solo sugiere: se aplican con conciliar().
CREATE FUNCTION contabilidad.sugerir_conciliacion(p_extracto uuid, p_dias integer DEFAULT 7)
RETURNS TABLE (movimiento_id bigint, linea_id bigint, dias integer)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_e contabilidad.extractos;
  v_movs bigint[] := '{}';
  v_lins bigint[] := '{}';
  r record;
BEGIN
  PERFORM contabilidad._exigir_lectura();
  SELECT * INTO v_e FROM contabilidad.extractos WHERE id = p_extracto;
  FOR r IN
    SELECT m.id AS mov, l.id AS lin, abs(m.fecha - a.fecha) AS d
    FROM contabilidad.extracto_movimientos m
    JOIN contabilidad.lineas l ON l.cuenta_id = v_e.cuenta_id
    JOIN contabilidad.asientos a ON a.id = l.asiento_id
    WHERE m.extracto_id = p_extracto
      AND a.estado = 'confirmado' AND a.tipo NOT IN ('apertura', 'cierre', 'refundicion', 'revaluacion')
      AND a.fecha <= v_e.fecha_hasta AND abs(m.fecha - a.fecha) <= p_dias
      AND contabilidad._importe_en_moneda(l) = m.importe
      AND NOT EXISTS (SELECT 1 FROM contabilidad.conciliacion_movimientos cm WHERE cm.movimiento_id = m.id)
      AND NOT EXISTS (SELECT 1 FROM contabilidad.conciliacion_lineas cl WHERE cl.linea_id = l.id)
    ORDER BY abs(m.fecha - a.fecha), m.orden, l.id
  LOOP
    IF NOT r.mov = ANY (v_movs) AND NOT r.lin = ANY (v_lins) THEN
      v_movs := v_movs || r.mov;
      v_lins := v_lins || r.lin;
      movimiento_id := r.mov;
      linea_id := r.lin;
      dias := r.d;
      RETURN NEXT;
    END IF;
  END LOOP;
END;
$$;

-- Registra en los libros un movimiento del banco que no estaba (comisión,
-- interés, débito automático) y lo deja conciliado. La contrapartida es
-- en pesos o en la misma moneda que la cuenta; p_extra completa su línea
-- (centro_costo_id, proveedor_id, disciplina_id).
CREATE FUNCTION contabilidad.contabilizar_movimiento_extracto(
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

-- Estado de la conciliación al cierre del extracto:
--   saldo según libros = saldo según banco + partidas pendientes
--                        + diferencia inicial
-- Partidas pendientes: líneas de la cuenta desde el primer extracto que no
-- están conciliadas en extractos hasta esta fecha (cheques no cobrados,
-- depósitos en tránsito). Diferencia inicial: entre libros y banco al
-- empezar el primer extracto, menos lo anterior a él que ya se concilió.
-- "diferencia" es lo que queda sin explicar (tiene que ser 0).
CREATE FUNCTION contabilidad.resumen_conciliacion(p_extracto uuid)
RETURNS TABLE (
  saldo_banco numeric, saldo_libros numeric, pendientes numeric, cantidad_pendientes integer,
  diferencia_inicial numeric, movimientos_sin_conciliar integer, diferencia numeric
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_e contabilidad.extractos;
  v_primero contabilidad.extractos;
  v_origen boolean;
BEGIN
  PERFORM contabilidad._exigir_lectura();
  SELECT * INTO v_e FROM contabilidad.extractos WHERE id = p_extracto;
  IF v_e.id IS NULL THEN
    RAISE EXCEPTION 'Extracto inexistente';
  END IF;
  SELECT * INTO v_primero FROM contabilidad.extractos WHERE cuenta_id = v_e.cuenta_id ORDER BY fecha_desde LIMIT 1;
  SELECT moneda IS NOT NULL INTO v_origen FROM contabilidad.cuentas WHERE id = v_e.cuenta_id;

  saldo_banco := v_e.saldo_final;
  saldo_libros := contabilidad._saldo_cuentas(ARRAY[v_e.cuenta_id], v_e.fecha_hasta, false, v_origen);

  SELECT coalesce(sum(contabilidad._importe_en_moneda(l)), 0), count(*)
  INTO pendientes, cantidad_pendientes
  FROM contabilidad.lineas l
  JOIN contabilidad.asientos a ON a.id = l.asiento_id
  WHERE l.cuenta_id = v_e.cuenta_id AND a.estado = 'confirmado'
    AND a.tipo NOT IN ('apertura', 'cierre', 'refundicion', 'revaluacion')
    AND a.fecha BETWEEN v_primero.fecha_desde AND v_e.fecha_hasta
    AND NOT EXISTS (
      SELECT 1 FROM contabilidad.conciliacion_lineas cl
      JOIN contabilidad.conciliaciones c ON c.id = cl.conciliacion_id
      JOIN contabilidad.extractos e ON e.id = c.extracto_id
      WHERE cl.linea_id = l.id AND e.fecha_hasta <= v_e.fecha_hasta);

  diferencia_inicial := contabilidad._saldo_cuentas(ARRAY[v_e.cuenta_id], v_primero.fecha_desde, true, v_origen)
    - v_primero.saldo_inicial
    - coalesce((
        SELECT sum(contabilidad._importe_en_moneda(l))
        FROM contabilidad.conciliacion_lineas cl
        JOIN contabilidad.lineas l ON l.id = cl.linea_id
        JOIN contabilidad.asientos a ON a.id = l.asiento_id
        JOIN contabilidad.conciliaciones c ON c.id = cl.conciliacion_id
        JOIN contabilidad.extractos e ON e.id = c.extracto_id
        WHERE l.cuenta_id = v_e.cuenta_id AND a.fecha < v_primero.fecha_desde AND e.fecha_hasta <= v_e.fecha_hasta), 0);

  SELECT count(*) INTO movimientos_sin_conciliar
  FROM contabilidad.extracto_movimientos m
  JOIN contabilidad.extractos e ON e.id = m.extracto_id
  WHERE e.cuenta_id = v_e.cuenta_id AND e.fecha_hasta <= v_e.fecha_hasta
    AND NOT EXISTS (SELECT 1 FROM contabilidad.conciliacion_movimientos cm WHERE cm.movimiento_id = m.id);

  diferencia := saldo_libros - saldo_banco - pendientes - diferencia_inicial;
  RETURN NEXT;
END;
$$;

-- Se cierra en orden: el anterior cerrado y todos los movimientos del
-- banco conciliados.
CREATE FUNCTION contabilidad.cerrar_extracto(p_extracto uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_e contabilidad.extractos;
  v_n integer;
BEGIN
  PERFORM contabilidad._exigir_escritura();
  SELECT * INTO v_e FROM contabilidad.extractos WHERE id = p_extracto FOR UPDATE;
  IF v_e.estado IS DISTINCT FROM 'abierto' THEN
    RAISE EXCEPTION 'El extracto no existe o ya está cerrado';
  END IF;
  IF EXISTS (SELECT 1 FROM contabilidad.extractos
             WHERE cuenta_id = v_e.cuenta_id AND fecha_hasta < v_e.fecha_desde AND estado = 'abierto') THEN
    RAISE EXCEPTION 'Cerrá primero los extractos anteriores de la cuenta';
  END IF;
  SELECT count(*) INTO v_n FROM contabilidad.extracto_movimientos m
  WHERE m.extracto_id = p_extracto
    AND NOT EXISTS (SELECT 1 FROM contabilidad.conciliacion_movimientos cm WHERE cm.movimiento_id = m.id);
  IF v_n > 0 THEN
    RAISE EXCEPTION 'Faltan % movimientos del banco por conciliar', v_n;
  END IF;
  UPDATE contabilidad.extractos SET estado = 'cerrado', cerrado_por = contabilidad._usuario(), cerrado_at = now()
  WHERE id = p_extracto;
END;
$$;

CREATE FUNCTION contabilidad.reabrir_extracto(p_extracto uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_e contabilidad.extractos;
BEGIN
  PERFORM contabilidad._exigir_escritura();
  SELECT * INTO v_e FROM contabilidad.extractos WHERE id = p_extracto FOR UPDATE;
  IF v_e.estado IS DISTINCT FROM 'cerrado' THEN
    RAISE EXCEPTION 'El extracto no existe o no está cerrado';
  END IF;
  IF EXISTS (SELECT 1 FROM contabilidad.extractos
             WHERE cuenta_id = v_e.cuenta_id AND fecha_desde > v_e.fecha_hasta AND estado = 'cerrado') THEN
    RAISE EXCEPTION 'Hay un extracto posterior cerrado: se reabren del más nuevo al más viejo';
  END IF;
  UPDATE contabilidad.extractos SET estado = 'abierto', cerrado_por = NULL, cerrado_at = NULL WHERE id = p_extracto;
END;
$$;

-- ------------------------------------------------------------
-- RLS, auditoría y permisos
-- ------------------------------------------------------------
ALTER TABLE contabilidad.extractos ENABLE ROW LEVEL SECURITY;
ALTER TABLE contabilidad.extracto_movimientos ENABLE ROW LEVEL SECURITY;
ALTER TABLE contabilidad.conciliaciones ENABLE ROW LEVEL SECURITY;
ALTER TABLE contabilidad.conciliacion_movimientos ENABLE ROW LEVEL SECURITY;
ALTER TABLE contabilidad.conciliacion_lineas ENABLE ROW LEVEL SECURITY;
CREATE POLICY extractos_lectura ON contabilidad.extractos FOR SELECT TO authenticated USING (contabilidad.puede_leer());
CREATE POLICY extracto_movimientos_lectura ON contabilidad.extracto_movimientos FOR SELECT TO authenticated USING (contabilidad.puede_leer());
CREATE POLICY conciliaciones_lectura ON contabilidad.conciliaciones FOR SELECT TO authenticated USING (contabilidad.puede_leer());
CREATE POLICY conciliacion_movimientos_lectura ON contabilidad.conciliacion_movimientos FOR SELECT TO authenticated USING (contabilidad.puede_leer());
CREATE POLICY conciliacion_lineas_lectura ON contabilidad.conciliacion_lineas FOR SELECT TO authenticated USING (contabilidad.puede_leer());

CREATE TRIGGER extractos_auditoria AFTER INSERT OR UPDATE OR DELETE ON contabilidad.extractos
  FOR EACH ROW EXECUTE FUNCTION contabilidad._auditar();
CREATE TRIGGER conciliaciones_auditoria AFTER INSERT OR UPDATE OR DELETE ON contabilidad.conciliaciones
  FOR EACH ROW EXECUTE FUNCTION contabilidad._auditar();

REVOKE ALL ON contabilidad.extractos, contabilidad.extracto_movimientos, contabilidad.conciliaciones,
  contabilidad.conciliacion_movimientos, contabilidad.conciliacion_lineas FROM PUBLIC, anon, authenticated;
GRANT SELECT ON contabilidad.extractos, contabilidad.extracto_movimientos, contabilidad.conciliaciones,
  contabilidad.conciliacion_movimientos, contabilidad.conciliacion_lineas TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION contabilidad._saldo_cuentas(uuid[], date, boolean, boolean),
  contabilidad._flujo_asiento(uuid, uuid), contabilidad._importe_en_moneda(contabilidad.lineas),
  contabilidad._extracto_valido(), contabilidad._extracto_abierto(), contabilidad._asiento_no_conciliado()
  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION contabilidad.saldo_disponibilidades(date, uuid), contabilidad.flujo_caja(date, date, uuid),
  contabilidad.importar_extracto(uuid, date, date, numeric, numeric, jsonb, text), contabilidad.eliminar_extracto(uuid),
  contabilidad.conciliar(uuid, bigint[], bigint[]), contabilidad.desconciliar(bigint),
  contabilidad.sugerir_conciliacion(uuid, integer), contabilidad.contabilizar_movimiento_extracto(bigint, uuid, text, jsonb),
  contabilidad.resumen_conciliacion(uuid), contabilidad.cerrar_extracto(uuid), contabilidad.reabrir_extracto(uuid)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION contabilidad.saldo_disponibilidades(date, uuid), contabilidad.flujo_caja(date, date, uuid),
  contabilidad.importar_extracto(uuid, date, date, numeric, numeric, jsonb, text), contabilidad.eliminar_extracto(uuid),
  contabilidad.conciliar(uuid, bigint[], bigint[]), contabilidad.desconciliar(bigint),
  contabilidad.sugerir_conciliacion(uuid, integer), contabilidad.contabilizar_movimiento_extracto(bigint, uuid, text, jsonb),
  contabilidad.resumen_conciliacion(uuid), contabilidad.cerrar_extracto(uuid), contabilidad.reabrir_extracto(uuid)
  TO authenticated, service_role;
