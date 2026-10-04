-- ============================================================
-- Disciplinas — la liquidación es deuda del club, el pago es otro asiento
--
-- Antes la liquidación se registraba ya pagada (transferencia y/o
-- compensación en el mismo asiento). Ahora son dos momentos:
--   1. Liquidación: Debe transferencias a disciplinas (gasto, centro de la
--      disciplina) / Haber "Liquidaciones a pagar a disciplinas" (pasivo,
--      auxiliar disciplina): el club le debe a la disciplina.
--   2. Pago de la liquidación (total o en partes): Debe liquidaciones a
--      pagar / Haber banco (transferencia) y/o Haber fondos en poder de la
--      disciplina (compensación de lo que la disciplina le debe al club,
--      imputable a un plan de pago).
-- Préstamos y otros movimientos: asientos manuales sobre las cuentas de la
-- disciplina; la cuenta corriente los muestra.
--
-- Cuenta corriente = las dos cuentas de la disciplina; saldo neto
-- Σ(debe − haber): + la disciplina le debe al club, − el club le debe a la
-- disciplina.
-- ============================================================

INSERT INTO contabilidad.cuentas (codigo, nombre, padre_id, nivel, clase, naturaleza, imputable, requiere_auxiliar)
SELECT '2.1.07.02', 'Liquidaciones a pagar a disciplinas', id, 0, 'pasivo', 'acreedora', true, 'disciplina'
FROM contabilidad.cuentas WHERE codigo = '2.1.07';

INSERT INTO contabilidad.parametros_cuentas (proceso, rol, cuenta_id, descripcion)
SELECT 'socios', 'liquidaciones_a_pagar', id, 'Lo liquidado a cada disciplina, hasta que se le paga'
FROM contabilidad.cuentas WHERE codigo = '2.1.07.02';

-- La liquidación ya no lleva pago: se quitan las columnas del pago.
DO $$
DECLARE c record;
BEGIN
  FOR c IN SELECT conname FROM pg_constraint
           WHERE conrelid = 'socios.liquidaciones_disciplina'::regclass AND contype = 'c'
             AND pg_get_constraintdef(oid) ~ 'compensado|transferido|cuenta_id' LOOP
    EXECUTE format('ALTER TABLE socios.liquidaciones_disciplina DROP CONSTRAINT %I', c.conname);
  END LOOP;
END $$;
ALTER TABLE socios.liquidaciones_disciplina DROP COLUMN compensado, DROP COLUMN transferido, DROP COLUMN cuenta_id;

CREATE TABLE socios.pagos_liquidacion (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  liquidacion_id bigint NOT NULL REFERENCES socios.liquidaciones_disciplina (id) ON DELETE RESTRICT,
  fecha date NOT NULL,
  transferido numeric(14, 2) NOT NULL DEFAULT 0 CHECK (transferido >= 0),
  cuenta_id uuid REFERENCES contabilidad.cuentas (id) ON DELETE RESTRICT,
  compensado numeric(14, 2) NOT NULL DEFAULT 0 CHECK (compensado >= 0),
  referencia text,
  notas text,
  asiento_id uuid NOT NULL REFERENCES contabilidad.asientos (id) ON DELETE RESTRICT,
  estado text NOT NULL DEFAULT 'vigente' CHECK (estado IN ('vigente', 'anulado')),
  motivo_anulacion text,
  anulado_por uuid,
  anulado_at timestamptz,
  creado_por uuid DEFAULT contabilidad._usuario(),
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (transferido + compensado > 0),
  CHECK ((transferido > 0) = (cuenta_id IS NOT NULL)),
  CHECK ((estado = 'anulado') = (anulado_at IS NOT NULL AND motivo_anulacion IS NOT NULL))
);
CREATE INDEX pagos_liquidacion_liquidacion_idx ON socios.pagos_liquidacion (liquidacion_id);
CREATE TRIGGER pagos_liquidacion_valido BEFORE UPDATE OR DELETE ON socios.pagos_liquidacion
  FOR EACH ROW EXECUTE FUNCTION socios._documento_valido();

-- Lo compensado en un pago se imputa a un plan desde el pago.
ALTER TABLE socios.plan_pago_aplicaciones
  ADD COLUMN pago_liquidacion_id bigint REFERENCES socios.pagos_liquidacion (id) ON DELETE RESTRICT;
DO $$
DECLARE c record;
BEGIN
  FOR c IN SELECT conname FROM pg_constraint
           WHERE conrelid = 'socios.plan_pago_aplicaciones'::regclass AND contype = 'c'
             AND pg_get_constraintdef(oid) ~ 'cobro_id' LOOP
    EXECUTE format('ALTER TABLE socios.plan_pago_aplicaciones DROP CONSTRAINT %I', c.conname);
  END LOOP;
END $$;
ALTER TABLE socios.plan_pago_aplicaciones ADD CONSTRAINT plan_pago_aplicaciones_origen
  CHECK (num_nonnulls(cobro_id, liquidacion_id, pago_liquidacion_id) = 1);

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

-- ------------------------------------------------------------
-- Imputar a un plan (ahora también desde un pago de liquidación)
-- ------------------------------------------------------------
DROP FUNCTION socios._aplicar_a_plan(bigint, integer, numeric, date, bigint, bigint);
CREATE FUNCTION socios._aplicar_a_plan(
  p_plan bigint, p_disciplina integer, p_importe numeric, p_fecha date, p_cobro bigint, p_pago_liquidacion bigint
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
    INSERT INTO socios.plan_pago_aplicaciones (cuota_id, cobro_id, pago_liquidacion_id, fecha, importe)
    VALUES (r.id, p_cobro, p_pago_liquidacion, p_fecha, v_aplica);
    v_resto := v_resto - v_aplica;
  END LOOP;
  -- Lo que excede al plan queda a cuenta de la deuda general de la disciplina.
  RETURN p_importe - v_resto;
END;
$$;
REVOKE EXECUTE ON FUNCTION socios._aplicar_a_plan(bigint, integer, numeric, date, bigint, bigint) FROM PUBLIC, anon, authenticated;

-- ------------------------------------------------------------
-- Liquidar: genera la deuda del club con la disciplina
-- ------------------------------------------------------------
DROP FUNCTION socios.liquidar_disciplina(integer, date, date, date, numeric, uuid, text, bigint);
CREATE FUNCTION socios.liquidar_disciplina(
  p_disciplina integer, p_desde date, p_hasta date, p_fecha date, p_notas text DEFAULT NULL
) RETURNS bigint
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_p record;
  v_id bigint;
  v_asiento uuid;
  v_nombre text;
BEGIN
  PERFORM socios._exigir_tesoreria();
  PERFORM pg_advisory_xact_lock(hashtext('socios.liquidacion_disciplina'), p_disciplina);
  SELECT * INTO v_p FROM socios.previsualizar_liquidacion_disciplina(p_disciplina, p_desde, p_hasta);
  IF v_p.ya_liquidado THEN
    RAISE EXCEPTION 'Ese período ya se liquidó (total o parcialmente) a la disciplina';
  END IF;
  IF v_p.importe <= 0 THEN
    RAISE EXCEPTION 'No hay nada para liquidar en el período';
  END IF;
  SELECT nombre INTO v_nombre FROM public.disciplinas WHERE id = p_disciplina;

  v_id := nextval(pg_get_serial_sequence('socios.liquidaciones_disciplina', 'id'));
  v_asiento := contabilidad._asiento_automatico(p_fecha,
    'Liquidación de cuotas a ' || v_nombre || ' ' || to_char(p_desde, 'DD/MM') || '–' || to_char(p_hasta, 'DD/MM/YYYY'),
    'liquidacion_disciplina', v_id::text,
    jsonb_build_array(
      jsonb_build_object('cuenta_id', contabilidad.cuenta_para('socios', 'liquidacion_disciplinas'),
                         'lado', 'debe', 'importe', v_p.importe,
                         'centro_costo_id', socios._centro_disciplina(p_disciplina)),
      jsonb_build_object('cuenta_id', contabilidad.cuenta_para('socios', 'liquidaciones_a_pagar'),
                         'lado', 'haber', 'importe', v_p.importe, 'disciplina_id', p_disciplina,
                         'descripcion', 'A pagar a ' || v_nombre)));

  INSERT INTO socios.liquidaciones_disciplina (id, disciplina_id, desde, hasta, fecha, cobrado, comision, importe,
                                               notas, asiento_id)
  OVERRIDING SYSTEM VALUE
  VALUES (v_id, p_disciplina, p_desde, p_hasta, p_fecha, v_p.cobrado, v_p.comision, v_p.importe,
          nullif(btrim(p_notas), ''), v_asiento);
  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION socios.anular_liquidacion_disciplina(p_liquidacion bigint, p_motivo text, p_fecha date DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_l socios.liquidaciones_disciplina;
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
  PERFORM contabilidad._revertir(v_l.asiento_id, p_motivo, coalesce(p_fecha, contabilidad._hoy()));
  UPDATE socios.plan_pago_aplicaciones SET anulada = true WHERE liquidacion_id = p_liquidacion AND NOT anulada;
  UPDATE socios.liquidaciones_disciplina SET estado = 'anulada', motivo_anulacion = btrim(p_motivo),
         anulado_por = contabilidad._usuario(), anulado_at = now()
  WHERE id = p_liquidacion;
END;
$$;

-- ------------------------------------------------------------
-- Pagar una liquidación (total o en partes)
-- ------------------------------------------------------------
--   Debe liquidaciones a pagar (disciplina)
--   Haber banco/caja (lo transferido)
--   Haber fondos en poder de la disciplina (lo compensado de su deuda)
CREATE FUNCTION socios.pagar_liquidacion_disciplina(
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
    -- Deuda de la disciplina (todos los ejercicios; solo la primera apertura).
    SELECT coalesce(sum(debe - haber), 0) INTO v_deuda
    FROM (SELECT l.debe, l.haber FROM contabilidad.lineas l JOIN contabilidad.asientos a ON a.id = l.asiento_id
          JOIN contabilidad.ejercicios e ON e.id = a.ejercicio_id
          WHERE a.estado = 'confirmado' AND l.disciplina_id = v_l.disciplina_id
            AND l.cuenta_id = contabilidad.cuenta_para('socios', 'disciplinas')
            AND a.tipo NOT IN ('cierre', 'refundicion')
            AND (a.tipo <> 'apertura' OR e.fecha_inicio = (SELECT min(fecha_inicio) FROM contabilidad.ejercicios))) x;
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

CREATE FUNCTION socios.anular_pago_liquidacion(p_pago bigint, p_motivo text, p_fecha date DEFAULT NULL) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_p socios.pagos_liquidacion;
BEGIN
  PERFORM socios._exigir_tesoreria();
  IF nullif(btrim(p_motivo), '') IS NULL THEN
    RAISE EXCEPTION 'Indicá el motivo';
  END IF;
  SELECT * INTO v_p FROM socios.pagos_liquidacion WHERE id = p_pago FOR UPDATE;
  IF v_p.id IS NULL OR v_p.estado <> 'vigente' THEN
    RAISE EXCEPTION 'El pago no existe o ya está anulado';
  END IF;
  PERFORM contabilidad._revertir(v_p.asiento_id, p_motivo, greatest(coalesce(p_fecha, contabilidad._hoy()), v_p.fecha));
  UPDATE socios.plan_pago_aplicaciones SET anulada = true WHERE pago_liquidacion_id = p_pago AND NOT anulada;
  UPDATE socios.pagos_liquidacion SET estado = 'anulado', motivo_anulacion = btrim(p_motivo),
         anulado_por = contabilidad._usuario(), anulado_at = now()
  WHERE id = p_pago;
END;
$$;

-- ------------------------------------------------------------
-- Cuenta corriente con las dos cuentas
-- ------------------------------------------------------------
DROP FUNCTION socios.cuenta_corriente_disciplina(integer);
CREATE FUNCTION socios.cuenta_corriente_disciplina(p_disciplina integer)
RETURNS TABLE (
  fecha date, asiento_id uuid, numero integer, tipo text, descripcion text, cuenta text,
  debe numeric, haber numeric, saldo numeric, origen_tipo text, origen_id text, pedido_id integer
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_debe_club uuid := contabilidad.cuenta_para('socios', 'disciplinas');
  v_debe_disc uuid := contabilidad.cuenta_para('socios', 'liquidaciones_a_pagar');
  v_primer uuid;
BEGIN
  PERFORM socios._exigir(ARRAY['tesorero', 'comision_fiscal']);
  SELECT id INTO v_primer FROM contabilidad.ejercicios ORDER BY fecha_inicio LIMIT 1;
  RETURN QUERY
  WITH m AS (
    SELECT a.fecha AS f, a.id AS asiento, a.numero AS num,
      CASE
        WHEN a.tipo = 'apertura' THEN 'saldo_inicial'
        WHEN a.tipo = 'reversion' THEN 'anulacion'
        WHEN a.origen_tipo IN ('pedido', 'pedido_venta', 'pedido_entrega', 'pedido_efectivo') THEN 'compra_tienda'
        WHEN a.origen_tipo LIKE 'devolucion%' OR a.origen_tipo = 'pedido_cancelacion' THEN 'devolucion_tienda'
        WHEN a.origen_tipo = 'cobro_socio' THEN 'cuota_cobrada'
        WHEN a.origen_tipo = 'liquidacion_disciplina' THEN 'liquidacion'
        WHEN a.origen_tipo = 'pago_liquidacion' AND l.cuenta_id = v_debe_club THEN 'compensacion'
        WHEN a.origen_tipo = 'pago_liquidacion' THEN 'pago_liquidacion'
        WHEN a.origen_tipo = 'cobro_disciplina' THEN 'pago'
        WHEN a.tipo = 'manual' THEN 'manual'
        ELSE 'otro'
      END AS t,
      coalesce(nullif(l.descripcion, ''), a.descripcion) AS d,
      CASE WHEN l.cuenta_id = v_debe_club THEN 'disciplina_debe' ELSE 'club_debe' END AS c,
      l.debe AS de, l.haber AS ha, a.origen_tipo AS ot, a.origen_id AS oi, l.id AS lid,
      CASE WHEN a.origen_tipo IN ('pedido', 'pedido_venta', 'pedido_entrega', 'pedido_efectivo') AND a.origen_id ~ '^[0-9]+$'
           THEN a.origen_id::integer END AS ped
    FROM contabilidad.lineas l
    JOIN contabilidad.asientos a ON a.id = l.asiento_id
    WHERE l.cuenta_id IN (v_debe_club, v_debe_disc) AND l.disciplina_id = p_disciplina AND a.estado = 'confirmado'
      AND a.tipo NOT IN ('cierre', 'refundicion')
      AND (a.tipo <> 'apertura' OR a.ejercicio_id = v_primer)
  )
  SELECT m.f, m.asiento, m.num, m.t, m.d, m.c, m.de, m.ha,
         sum(m.de - m.ha) OVER (ORDER BY m.f, m.num NULLS LAST, m.lid ROWS UNBOUNDED PRECEDING),
         m.ot, m.oi, m.ped
  FROM m ORDER BY m.f, m.num NULLS LAST, m.lid;
END;
$$;

DROP FUNCTION socios.saldos_disciplinas();
CREATE FUNCTION socios.saldos_disciplinas()
RETURNS TABLE (disciplina_id integer, debe_al_club numeric, club_le_debe numeric, saldo numeric, ultimo_movimiento date)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_debe_club uuid := contabilidad.cuenta_para('socios', 'disciplinas');
  v_debe_disc uuid := contabilidad.cuenta_para('socios', 'liquidaciones_a_pagar');
  v_primer uuid;
BEGIN
  PERFORM socios._exigir(ARRAY['tesorero', 'comision_fiscal']);
  SELECT id INTO v_primer FROM contabilidad.ejercicios ORDER BY fecha_inicio LIMIT 1;
  RETURN QUERY
  SELECT l.disciplina_id,
         coalesce(sum(l.debe - l.haber) FILTER (WHERE l.cuenta_id = v_debe_club), 0),
         coalesce(sum(l.haber - l.debe) FILTER (WHERE l.cuenta_id = v_debe_disc), 0),
         sum(l.debe - l.haber),
         max(a.fecha)
  FROM contabilidad.lineas l
  JOIN contabilidad.asientos a ON a.id = l.asiento_id
  WHERE l.cuenta_id IN (v_debe_club, v_debe_disc) AND l.disciplina_id IS NOT NULL AND a.estado = 'confirmado'
    AND a.tipo NOT IN ('cierre', 'refundicion') AND (a.tipo <> 'apertura' OR a.ejercicio_id = v_primer)
  GROUP BY l.disciplina_id;
END;
$$;

-- ------------------------------------------------------------
-- RLS y permisos
-- ------------------------------------------------------------
ALTER TABLE socios.pagos_liquidacion ENABLE ROW LEVEL SECURITY;
CREATE POLICY pagos_liquidacion_lectura ON socios.pagos_liquidacion FOR SELECT TO authenticated USING (socios.puede_leer());
REVOKE ALL ON socios.pagos_liquidacion FROM PUBLIC, anon, authenticated;
GRANT SELECT ON socios.pagos_liquidacion, socios.liquidaciones_disciplina_saldo TO authenticated, service_role;
CREATE TRIGGER pagos_liquidacion_auditoria AFTER INSERT OR UPDATE OR DELETE ON socios.pagos_liquidacion
  FOR EACH ROW EXECUTE FUNCTION contabilidad._auditar();

REVOKE EXECUTE ON FUNCTION socios.liquidar_disciplina(integer, date, date, date, text),
  socios.pagar_liquidacion_disciplina(bigint, date, numeric, uuid, numeric, bigint, text, text),
  socios.anular_pago_liquidacion(bigint, text, date),
  socios.cuenta_corriente_disciplina(integer), socios.saldos_disciplinas() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION socios.liquidar_disciplina(integer, date, date, date, text),
  socios.pagar_liquidacion_disciplina(bigint, date, numeric, uuid, numeric, bigint, text, text),
  socios.anular_pago_liquidacion(bigint, text, date),
  socios.cuenta_corriente_disciplina(integer), socios.saldos_disciplinas() TO authenticated, service_role;
