-- ============================================
-- Migración 046: Conciliación de extractos desde el MCP
-- ============================================
-- Claude lee el estado de cuenta (PDF/CSV/foto de cualquier banco), el MCP
-- compara línea por línea contra el sistema y aplica las correcciones para
-- que el saldo cierre.
--
-- Regla de conciliación: un movimiento está conciliado cuando tiene
-- `extracto_id`, es decir, cuando existe en el estado de cuenta.
--
-- 1. `tesoreria_historial`: registro de cada edición o borrado de
--    movimientos (panel o MCP) con el antes/después y el motivo, para
--    poder revisar o deshacer cualquier cambio.
-- 2. Si se cambia monto, tipo o cuenta de un movimiento conciliado, deja
--    de estar conciliado (ya no coincide con el banco).
-- 3. `extractos_importados.ajuste_donaciones`: el banco muestra el bruto
--    de los pedidos con donación y la transferencia a la Olla del Hogar,
--    pero el sistema solo registra el neto. Se guarda el efecto neto del
--    período para que el saldo cierre igual.
-- 4. `estado_conciliacion_cuenta`: cadena de saldos esperado vs. banco
--    por extracto (calculada al vuelo, nunca queda desactualizada).
-- 5. `aplicar_cambios_tesoreria`: aplica en una sola transacción las
--    correcciones, el saldo inicial, el extracto, las conciliaciones y los
--    movimientos nuevos. Si algo falla, no se aplica nada.
-- 6. Faltaba la policy de UPDATE en extractos_importados (los contadores
--    del panel nunca se actualizaban).
-- 7. Tesorería no podía leer donaciones: sin eso no se reconocen los cobros
--    brutos ni las transferencias a la Olla al conciliar.

-- =====================
-- 1. HISTORIAL
-- =====================

CREATE TABLE IF NOT EXISTS tesoreria_historial (
  id BIGSERIAL PRIMARY KEY,
  entidad VARCHAR(30) NOT NULL CHECK (entidad IN ('movimiento', 'cuenta')),
  entidad_id INTEGER NOT NULL,
  accion VARCHAR(20) NOT NULL CHECK (accion IN ('editar', 'eliminar')),
  antes JSONB,
  despues JSONB,
  motivo TEXT,
  origen VARCHAR(20) NOT NULL DEFAULT 'panel',
  usuario_id UUID REFERENCES perfiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tesoreria_historial_entidad
  ON tesoreria_historial(entidad, entidad_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_tesoreria_historial_fecha
  ON tesoreria_historial(created_at DESC);

ALTER TABLE tesoreria_historial ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Historial tesorería: lectura tesorero"
  ON tesoreria_historial FOR SELECT
  USING (tiene_algun_rol(ARRAY['super_admin', 'tesorero']));

-- Las filas las escribe el trigger (SECURITY DEFINER); nadie las edita.

CREATE OR REPLACE FUNCTION registrar_historial_movimiento()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_origen TEXT := COALESCE(NULLIF(current_setting('app.origen', true), ''), 'panel');
  v_motivo TEXT := NULLIF(current_setting('app.motivo', true), '');
BEGIN
  IF TG_OP = 'UPDATE' THEN
    -- Solo registrar si cambió algo relevante (no updated_at).
    IF (to_jsonb(OLD) - 'updated_at') = (to_jsonb(NEW) - 'updated_at') THEN
      RETURN NEW;
    END IF;
    INSERT INTO tesoreria_historial (entidad, entidad_id, accion, antes, despues, motivo, origen, usuario_id)
    VALUES ('movimiento', OLD.id, 'editar', to_jsonb(OLD), to_jsonb(NEW), v_motivo, v_origen, auth.uid());
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    INSERT INTO tesoreria_historial (entidad, entidad_id, accion, antes, despues, motivo, origen, usuario_id)
    VALUES ('movimiento', OLD.id, 'eliminar', to_jsonb(OLD), NULL, v_motivo, v_origen, auth.uid());
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_historial_movimiento ON movimientos_financieros;
CREATE TRIGGER trg_historial_movimiento
  AFTER UPDATE OR DELETE ON movimientos_financieros
  FOR EACH ROW EXECUTE FUNCTION registrar_historial_movimiento();

-- =====================
-- 2. DESCONCILIAR SI CAMBIA LA PLATA
-- =====================

CREATE OR REPLACE FUNCTION desconciliar_si_cambia_monto()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD.extracto_id IS NOT NULL
     AND NEW.extracto_id IS NOT DISTINCT FROM OLD.extracto_id
     AND (NEW.monto <> OLD.monto OR NEW.tipo <> OLD.tipo OR NEW.cuenta_id <> OLD.cuenta_id)
  THEN
    NEW.extracto_id := NULL;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_desconciliar_movimiento ON movimientos_financieros;
CREATE TRIGGER trg_desconciliar_movimiento
  BEFORE UPDATE ON movimientos_financieros
  FOR EACH ROW EXECUTE FUNCTION desconciliar_si_cambia_monto();

-- =====================
-- 3. EXTRACTOS: donaciones + policy UPDATE
-- =====================

ALTER TABLE extractos_importados
  ADD COLUMN IF NOT EXISTS ajuste_donaciones DECIMAL(14,2) NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_movimientos_extracto
  ON movimientos_financieros(extracto_id) WHERE extracto_id IS NOT NULL;

DROP POLICY IF EXISTS "Extractos: actualizar tesorero" ON extractos_importados;
CREATE POLICY "Extractos: actualizar tesorero"
  ON extractos_importados FOR UPDATE
  USING (tiene_algun_rol(ARRAY['super_admin', 'tesorero']))
  WITH CHECK (tiene_algun_rol(ARRAY['super_admin', 'tesorero']));

DROP POLICY IF EXISTS "donaciones tesoreria select" ON donaciones;
CREATE POLICY "donaciones tesoreria select" ON donaciones
  FOR SELECT TO authenticated
  USING (tiene_algun_rol(ARRAY['tesorero']));

DROP POLICY IF EXISTS "donaciones_transferencias tesoreria select" ON donaciones_transferencias;
CREATE POLICY "donaciones_transferencias tesoreria select" ON donaciones_transferencias
  FOR SELECT TO authenticated
  USING (tiene_algun_rol(ARRAY['tesorero']));

-- Categorías para ajustes de conciliación (solo si el usuario los pide).
INSERT INTO categorias_financieras (nombre, slug, tipo, color, icono, orden) VALUES
  ('Ajuste de conciliación (ingreso)', 'ajuste-conciliacion-ingreso', 'ingreso', '#6B7280', 'Scale', 99),
  ('Ajuste de conciliación (egreso)', 'ajuste-conciliacion-egreso', 'egreso', '#6B7280', 'Scale', 99)
ON CONFLICT (slug) DO NOTHING;

-- =====================
-- 4. ESTADO DE CONCILIACIÓN
-- =====================
-- base = saldo_inicial de la cuenta + movimientos sin conciliar anteriores
--        al primer extracto (ya están reflejados en el saldo de apertura).
-- Para cada extracto, en orden: esperado_cierre = base + Σ movimientos
-- conciliados con los extractos hasta ese + Σ ajuste_donaciones.
-- diferencia = saldo final del banco − esperado_cierre (0 = cierra).

CREATE OR REPLACE FUNCTION estado_conciliacion_cuenta(p_cuenta_id INTEGER)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
DECLARE
  v_cuenta      RECORD;
  v_inicio      DATE;
  v_fin         DATE;
  v_base        NUMERIC := 0;
  v_acum        NUMERIC;
  v_prev_final  NUMERIC := NULL;
  v_ext         RECORD;
  v_suma_ext    NUMERIC;
  v_extractos   JSONB := '[]'::jsonb;
  v_pend_n      INTEGER;
  v_pend_suma   NUMERIC;
BEGIN
  SELECT id, nombre, moneda, saldo_inicial, saldo_actual
    INTO v_cuenta
    FROM cuentas_financieras
   WHERE id = p_cuenta_id;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  SELECT MIN(fecha_desde), MAX(fecha_hasta)
    INTO v_inicio, v_fin
    FROM extractos_importados
   WHERE cuenta_id = p_cuenta_id;

  SELECT v_cuenta.saldo_inicial + COALESCE(SUM(CASE WHEN tipo = 'ingreso' THEN monto ELSE -monto END), 0)
    INTO v_base
    FROM movimientos_financieros
   WHERE cuenta_id = p_cuenta_id
     AND extracto_id IS NULL
     AND v_inicio IS NOT NULL
     AND fecha < v_inicio;

  v_acum := v_base;

  FOR v_ext IN
    SELECT *
      FROM extractos_importados
     WHERE cuenta_id = p_cuenta_id
     ORDER BY fecha_hasta NULLS LAST, fecha_desde, id
  LOOP
    SELECT COALESCE(SUM(CASE WHEN tipo = 'ingreso' THEN monto ELSE -monto END), 0)
      INTO v_suma_ext
      FROM movimientos_financieros
     WHERE extracto_id = v_ext.id;

    v_extractos := v_extractos || jsonb_build_object(
      'extracto_id',          v_ext.id,
      'archivo',              v_ext.archivo_nombre,
      'desde',                v_ext.fecha_desde,
      'hasta',                v_ext.fecha_hasta,
      'saldo_inicial_banco',  v_ext.saldo_inicial_extracto,
      'saldo_final_banco',    v_ext.saldo_final_extracto,
      'apertura_esperada',    v_acum,
      'diferencia_apertura',  v_ext.saldo_inicial_extracto - v_acum,
      'continuidad_ok',       v_prev_final IS NULL OR v_ext.saldo_inicial_extracto IS NULL
                                OR v_ext.saldo_inicial_extracto = v_prev_final,
      'movimientos_conciliados', (SELECT COUNT(*) FROM movimientos_financieros WHERE extracto_id = v_ext.id),
      'ajuste_donaciones',    v_ext.ajuste_donaciones,
      'cierre_esperado',      v_acum + v_suma_ext + v_ext.ajuste_donaciones,
      'diferencia',           v_ext.saldo_final_extracto - (v_acum + v_suma_ext + v_ext.ajuste_donaciones),
      'cierra',               v_ext.saldo_final_extracto IS NOT NULL
                                AND v_ext.saldo_final_extracto = v_acum + v_suma_ext + v_ext.ajuste_donaciones
    );

    v_acum := v_acum + v_suma_ext + v_ext.ajuste_donaciones;
    v_prev_final := v_ext.saldo_final_extracto;
  END LOOP;

  -- Partidas del sistema que el banco todavía no mostró, dentro del
  -- período cubierto por extractos (en tránsito o errores de carga).
  SELECT COUNT(*), COALESCE(SUM(CASE WHEN tipo = 'ingreso' THEN monto ELSE -monto END), 0)
    INTO v_pend_n, v_pend_suma
    FROM movimientos_financieros
   WHERE cuenta_id = p_cuenta_id
     AND extracto_id IS NULL
     AND v_inicio IS NOT NULL
     AND fecha >= v_inicio
     AND fecha <= v_fin;

  RETURN jsonb_build_object(
    'cuenta_id',       v_cuenta.id,
    'cuenta',          v_cuenta.nombre,
    'moneda',          v_cuenta.moneda,
    'saldo_inicial',   v_cuenta.saldo_inicial,
    'saldo_actual',    v_cuenta.saldo_actual,
    'conciliada_desde', v_inicio,
    'conciliada_hasta', v_fin,
    'base_apertura',   v_base,
    'extractos',       v_extractos,
    'pendientes_sin_conciliar', jsonb_build_object('cantidad', v_pend_n, 'efecto_neto', v_pend_suma)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION estado_conciliacion_cuenta(INTEGER) TO authenticated, service_role;

-- =====================
-- 5. APLICAR CAMBIOS (atómico)
-- =====================
-- p_payload:
-- {
--   "cuenta_id": 1,
--   "origen": "mcp",
--   "correcciones": [
--     {"accion":"editar","movimiento_id":10,"cambios":{"monto":1500},"motivo":"..."},
--     {"accion":"eliminar","movimiento_id":11,"motivo":"..."}
--   ],
--   "ajustar_saldo_inicial": true | false, "motivo_saldo_inicial": "...",
--   "extracto": {archivo_nombre, archivo_hash, formato, fecha_desde, fecha_hasta,
--                saldo_inicial, saldo_final, total_movimientos, ajuste_donaciones} | null,
--   "conciliar": [{"movimiento_id":12,"monto":1500,"tipo":"egreso","fecha":null,"referencia":"...","motivo":"..."}],
--   "crear": [{tipo, monto, fecha, descripcion, referencia, hash_dedupe, categoria_id, nombre, notas, origen_tipo, en_extracto}]
-- }
-- ajustar_saldo_inicial (solo con el extracto más antiguo de la cuenta): al
-- final, fija el saldo inicial para que la apertura del sistema sea igual a
-- la del banco. Se calcula después de aplicar todo, así contempla
-- movimientos corregidos, eliminados o conciliados en el mismo paso.
-- Movimientos protegidos (generados por tienda, transferencias o pagos a
-- proveedores): solo se pueden conciliar o recategorizar; montos, fechas y
-- borrado se corrigen desde su propio panel.

CREATE OR REPLACE FUNCTION aplicar_cambios_tesoreria(p_payload JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_cuenta_id    INTEGER := (p_payload->>'cuenta_id')::int;
  v_cuenta       RECORD;
  v_origen       TEXT := COALESCE(p_payload->>'origen', 'panel');
  v_item         JSONB;
  v_mov          RECORD;
  v_cambios      JSONB;
  v_protegido    BOOLEAN;
  v_extracto_id  INTEGER := NULL;
  v_ext          JSONB := p_payload->'extracto';
  v_inicio       DATE;
  v_base         NUMERIC;
  v_delta_saldo  NUMERIC := 0;
  v_editados     INTEGER := 0;
  v_eliminados   INTEGER := 0;
  v_conciliados  INTEGER := 0;
  v_creados      INTEGER := 0;
  v_ids_creados  INTEGER[] := '{}';
  v_new_id       INTEGER;
BEGIN
  IF NOT tiene_algun_rol(ARRAY['super_admin', 'tesorero']) THEN
    RAISE EXCEPTION 'No autorizado: requiere rol tesorero';
  END IF;

  SELECT id, moneda, saldo_inicial, saldo_actual
    INTO v_cuenta
    FROM cuentas_financieras
   WHERE id = v_cuenta_id
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Cuenta % no encontrada', v_cuenta_id;
  END IF;

  PERFORM set_config('app.origen', v_origen, true);

  -- 1) Correcciones sobre movimientos existentes.
  FOR v_item IN SELECT * FROM jsonb_array_elements(COALESCE(p_payload->'correcciones', '[]'::jsonb))
  LOOP
    SELECT * INTO v_mov
      FROM movimientos_financieros
     WHERE id = (v_item->>'movimiento_id')::int
     FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Movimiento % no existe', v_item->>'movimiento_id';
    END IF;
    IF v_mov.cuenta_id <> v_cuenta_id THEN
      RAISE EXCEPTION 'Movimiento % no pertenece a la cuenta %', v_mov.id, v_cuenta_id;
    END IF;

    v_protegido := v_mov.transferencia_id IS NOT NULL
      OR v_mov.origen_tipo IN ('pedido', 'transferencia', 'pago_proveedor');

    PERFORM set_config('app.motivo', COALESCE(v_item->>'motivo', ''), true);

    IF v_item->>'accion' = 'eliminar' THEN
      IF v_protegido THEN
        RAISE EXCEPTION 'Movimiento % (origen %) no se puede eliminar desde acá', v_mov.id, COALESCE(v_mov.origen_tipo, 'transferencia');
      END IF;
      DELETE FROM movimientos_financieros WHERE id = v_mov.id;
      v_eliminados := v_eliminados + 1;

    ELSIF v_item->>'accion' = 'editar' THEN
      v_cambios := COALESCE(v_item->'cambios', '{}'::jsonb);
      IF v_protegido AND (v_cambios ?| ARRAY['monto', 'tipo', 'fecha']) THEN
        RAISE EXCEPTION 'Movimiento % (origen %): monto, tipo y fecha se corrigen desde su panel', v_mov.id, COALESCE(v_mov.origen_tipo, 'transferencia');
      END IF;

      UPDATE movimientos_financieros SET
        monto           = CASE WHEN v_cambios ? 'monto' THEN (v_cambios->>'monto')::numeric ELSE monto END,
        tipo            = CASE WHEN v_cambios ? 'tipo' THEN v_cambios->>'tipo' ELSE tipo END,
        fecha           = CASE WHEN v_cambios ? 'fecha' THEN (v_cambios->>'fecha')::date ELSE fecha END,
        descripcion     = CASE WHEN v_cambios ? 'descripcion' THEN v_cambios->>'descripcion' ELSE descripcion END,
        nombre          = CASE WHEN v_cambios ? 'nombre' THEN NULLIF(v_cambios->>'nombre', '') ELSE nombre END,
        notas           = CASE WHEN v_cambios ? 'notas' THEN NULLIF(v_cambios->>'notas', '') ELSE notas END,
        categoria_id    = CASE WHEN v_cambios ? 'categoria_id' THEN NULLIF(v_cambios->>'categoria_id', '')::int ELSE categoria_id END,
        subcategoria_id = CASE WHEN v_cambios ? 'subcategoria_id' THEN NULLIF(v_cambios->>'subcategoria_id', '')::int ELSE subcategoria_id END,
        clasificado     = CASE WHEN v_cambios ? 'categoria_id' THEN NULLIF(v_cambios->>'categoria_id', '') IS NOT NULL ELSE clasificado END,
        updated_at      = NOW()
      WHERE id = v_mov.id;
      v_editados := v_editados + 1;
    ELSE
      RAISE EXCEPTION 'Acción de corrección desconocida: %', v_item->>'accion';
    END IF;
  END LOOP;

  -- 3) Registro del extracto.
  IF v_ext IS NOT NULL AND jsonb_typeof(v_ext) = 'object' THEN
    INSERT INTO extractos_importados (
      cuenta_id, archivo_nombre, archivo_hash, formato,
      fecha_desde, fecha_hasta, total_movimientos,
      movimientos_creados, movimientos_duplicados,
      saldo_inicial_extracto, saldo_final_extracto,
      ajuste_donaciones, importado_por
    ) VALUES (
      v_cuenta_id,
      v_ext->>'archivo_nombre',
      v_ext->>'archivo_hash',
      COALESCE(v_ext->>'formato', 'mcp'),
      (v_ext->>'fecha_desde')::date,
      (v_ext->>'fecha_hasta')::date,
      COALESCE((v_ext->>'total_movimientos')::int, 0),
      0, 0,
      (v_ext->>'saldo_inicial')::numeric,
      (v_ext->>'saldo_final')::numeric,
      COALESCE((v_ext->>'ajuste_donaciones')::numeric, 0),
      auth.uid()
    )
    RETURNING id INTO v_extracto_id;
  END IF;

  -- 4) Conciliar movimientos existentes con líneas del extracto.
  FOR v_item IN SELECT * FROM jsonb_array_elements(COALESCE(p_payload->'conciliar', '[]'::jsonb))
  LOOP
    IF v_extracto_id IS NULL THEN
      RAISE EXCEPTION 'Para conciliar hace falta un extracto';
    END IF;

    SELECT * INTO v_mov
      FROM movimientos_financieros
     WHERE id = (v_item->>'movimiento_id')::int
     FOR UPDATE;
    IF NOT FOUND OR v_mov.cuenta_id <> v_cuenta_id THEN
      RAISE EXCEPTION 'Movimiento % no existe en la cuenta %', v_item->>'movimiento_id', v_cuenta_id;
    END IF;
    IF v_mov.extracto_id IS NOT NULL THEN
      RAISE EXCEPTION 'Movimiento % ya está conciliado con el extracto %', v_mov.id, v_mov.extracto_id;
    END IF;

    v_protegido := v_mov.transferencia_id IS NOT NULL
      OR v_mov.origen_tipo IN ('pedido', 'transferencia', 'pago_proveedor');

    IF v_protegido AND (
      (v_item ? 'monto' AND v_item->>'monto' IS NOT NULL AND (v_item->>'monto')::numeric <> v_mov.monto)
      OR (v_item ? 'tipo' AND v_item->>'tipo' IS NOT NULL AND v_item->>'tipo' <> v_mov.tipo)
      OR (v_item ? 'fecha' AND v_item->>'fecha' IS NOT NULL AND (v_item->>'fecha')::date <> v_mov.fecha)
    ) THEN
      RAISE EXCEPTION 'Movimiento % (origen %): no se puede cambiar monto/tipo/fecha al conciliar', v_mov.id, COALESCE(v_mov.origen_tipo, 'transferencia');
    END IF;

    PERFORM set_config('app.motivo', COALESCE(v_item->>'motivo', 'Conciliado con extracto'), true);

    UPDATE movimientos_financieros SET
      monto       = COALESCE((v_item->>'monto')::numeric, monto),
      tipo        = COALESCE(v_item->>'tipo', tipo),
      fecha       = COALESCE((v_item->>'fecha')::date, fecha),
      referencia  = COALESCE(referencia, NULLIF(v_item->>'referencia', '')),
      extracto_id = v_extracto_id,
      updated_at  = NOW()
    WHERE id = v_mov.id;
    v_conciliados := v_conciliados + 1;
  END LOOP;

  -- 5) Movimientos nuevos (líneas del banco que no estaban en el sistema,
  --    o ajustes explícitos).
  FOR v_item IN SELECT * FROM jsonb_array_elements(COALESCE(p_payload->'crear', '[]'::jsonb))
  LOOP
    INSERT INTO movimientos_financieros (
      cuenta_id, tipo, categoria_id, monto, moneda, fecha,
      descripcion, nombre, notas, referencia, hash_dedupe,
      origen_tipo, extracto_id, clasificado, registrado_por
    ) VALUES (
      v_cuenta_id,
      v_item->>'tipo',
      NULLIF(v_item->>'categoria_id', '')::int,
      (v_item->>'monto')::numeric,
      v_cuenta.moneda,
      (v_item->>'fecha')::date,
      LEFT(v_item->>'descripcion', 500),
      NULLIF(v_item->>'nombre', ''),
      NULLIF(v_item->>'notas', ''),
      NULLIF(v_item->>'referencia', ''),
      NULLIF(v_item->>'hash_dedupe', ''),
      NULLIF(v_item->>'origen_tipo', ''),
      CASE WHEN COALESCE((v_item->>'en_extracto')::boolean, true) THEN v_extracto_id ELSE NULL END,
      NULLIF(v_item->>'categoria_id', '') IS NOT NULL,
      auth.uid()
    )
    RETURNING id INTO v_new_id;
    v_ids_creados := v_ids_creados || v_new_id;
    v_creados := v_creados + 1;
  END LOOP;

  -- 6) Saldo inicial de la cuenta (backfill: apertura del primer extracto).
  IF COALESCE((p_payload->>'ajustar_saldo_inicial')::boolean, false) THEN
    IF v_extracto_id IS NULL THEN
      RAISE EXCEPTION 'El saldo inicial se ajusta junto con el extracto más antiguo de la cuenta';
    END IF;
    SELECT MIN(fecha_desde) INTO v_inicio FROM extractos_importados WHERE cuenta_id = v_cuenta_id;
    IF v_inicio < (v_ext->>'fecha_desde')::date THEN
      RAISE EXCEPTION 'Solo se ajusta el saldo inicial con el extracto más antiguo (ya hay extractos desde %)', v_inicio;
    END IF;

    SELECT c.saldo_inicial + COALESCE((
             SELECT SUM(CASE WHEN m.tipo = 'ingreso' THEN m.monto ELSE -m.monto END)
               FROM movimientos_financieros m
              WHERE m.cuenta_id = v_cuenta_id
                AND m.extracto_id IS NULL
                AND m.fecha < v_inicio
           ), 0)
      INTO v_base
      FROM cuentas_financieras c
     WHERE c.id = v_cuenta_id;

    v_delta_saldo := (v_ext->>'saldo_inicial')::numeric - v_base;
    IF v_delta_saldo <> 0 THEN
      INSERT INTO tesoreria_historial (entidad, entidad_id, accion, antes, despues, motivo, origen, usuario_id)
      SELECT 'cuenta', id, 'editar',
             jsonb_build_object('saldo_inicial', saldo_inicial),
             jsonb_build_object('saldo_inicial', saldo_inicial + v_delta_saldo),
             COALESCE(p_payload->>'motivo_saldo_inicial', 'Apertura según extracto'), v_origen, auth.uid()
        FROM cuentas_financieras
       WHERE id = v_cuenta_id;
      UPDATE cuentas_financieras
         SET saldo_inicial = saldo_inicial + v_delta_saldo,
             saldo_actual  = saldo_actual + v_delta_saldo,
             updated_at    = NOW()
       WHERE id = v_cuenta_id;
    END IF;
  END IF;

  IF v_extracto_id IS NOT NULL THEN
    UPDATE extractos_importados
       SET movimientos_creados = v_creados,
           movimientos_duplicados = GREATEST(0, total_movimientos - v_creados - v_conciliados)
     WHERE id = v_extracto_id;
  END IF;

  RETURN jsonb_build_object(
    'ok',          true,
    'extracto_id', v_extracto_id,
    'editados',    v_editados,
    'eliminados',  v_eliminados,
    'conciliados', v_conciliados,
    'creados',     v_creados,
    'saldo_inicial_ajustado_en', v_delta_saldo,
    'ids_creados', to_jsonb(v_ids_creados)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION aplicar_cambios_tesoreria(JSONB) TO authenticated, service_role;
