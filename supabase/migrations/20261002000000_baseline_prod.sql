-- ============================================================
-- Baseline: estructura real de producción al 2026-10-02
-- Generado con `supabase db dump --linked` (schema public) +
-- trigger de auth.users + buckets y policies de storage.
-- Reemplaza las migraciones 001–046 (ver historial de git en main),
-- que no reproducían producción.
-- ============================================================




SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE EXTENSION IF NOT EXISTS "pg_stat_statements" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "supabase_vault" WITH SCHEMA "vault";






CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA "extensions";






CREATE OR REPLACE FUNCTION "public"."actualizar_deuda_compra"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  IF NEW.estado = 'confirmada' AND OLD.estado = 'borrador' THEN
    UPDATE proveedores
    SET saldo_cuenta_corriente = saldo_cuenta_corriente + NEW.total,
        updated_at = NOW()
    WHERE id = NEW.proveedor_id;
  END IF;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."actualizar_deuda_compra"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."actualizar_saldo_cuenta"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
DECLARE
  delta DECIMAL(14,2);
BEGIN
  IF TG_OP = 'INSERT' THEN
    delta := CASE WHEN NEW.tipo = 'ingreso' THEN NEW.monto ELSE -NEW.monto END;
    UPDATE cuentas_financieras
    SET saldo_actual = saldo_actual + delta, updated_at = NOW()
    WHERE id = NEW.cuenta_id;
  ELSIF TG_OP = 'DELETE' THEN
    delta := CASE WHEN OLD.tipo = 'ingreso' THEN -OLD.monto ELSE OLD.monto END;
    UPDATE cuentas_financieras
    SET saldo_actual = saldo_actual + delta, updated_at = NOW()
    WHERE id = OLD.cuenta_id;
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;


ALTER FUNCTION "public"."actualizar_saldo_cuenta"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."actualizar_saldo_cuenta_rpc"("p_cuenta_id" integer, "p_delta" numeric) RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
  UPDATE cuentas_financieras
  SET saldo_actual = saldo_actual + p_delta, updated_at = NOW()
  WHERE id = p_cuenta_id;
END;
$$;


ALTER FUNCTION "public"."actualizar_saldo_cuenta_rpc"("p_cuenta_id" integer, "p_delta" numeric) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."actualizar_saldo_disciplina"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  IF NEW.tipo = 'disciplina' AND NEW.disciplina_id IS NOT NULL THEN
    UPDATE disciplinas
    SET saldo_cuenta_corriente = saldo_cuenta_corriente + NEW.total
    WHERE id = NEW.disciplina_id;
  END IF;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."actualizar_saldo_disciplina"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."actualizar_saldo_proveedor"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE proveedores
    SET saldo_cuenta_corriente = saldo_cuenta_corriente - NEW.monto,
        updated_at = NOW()
    WHERE id = NEW.proveedor_id;
  END IF;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."actualizar_saldo_proveedor"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."aplicar_cambios_tesoreria"("p_payload" "jsonb") RETURNS "jsonb"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
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


ALTER FUNCTION "public"."aplicar_cambios_tesoreria"("p_payload" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."cancelar_pedido"("p_pedido_id" integer, "p_motivo" "text" DEFAULT NULL::"text", "p_registrado_por" "uuid" DEFAULT NULL::"uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_pedido         pedidos%ROWTYPE;
  v_desconto_stock BOOLEAN;
  r                RECORD;
  v_stock_nuevo    INTEGER;
  v_motivo_stock   TEXT;
  v_hoy            DATE := (NOW() AT TIME ZONE 'America/Montevideo')::date;
  v_cat_devol      INTEGER;
  v_revertidos     INTEGER := 0;
  v_compensados    INTEGER := 0;
BEGIN
  SELECT * INTO v_pedido FROM pedidos WHERE id = p_pedido_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'no_encontrado');
  END IF;

  IF v_pedido.estado = 'cancelado' THEN
    RETURN jsonb_build_object('ok', true, 'ya_cancelado', true);
  END IF;

  -- En 'pendiente' / 'pendiente_verificacion' el stock solo estaba reservado:
  -- alcanza con cambiar el estado para liberarlo.
  v_desconto_stock := v_pedido.estado NOT IN ('pendiente', 'pendiente_verificacion');

  IF v_desconto_stock THEN
    PERFORM 1
      FROM productos
     WHERE id IN (
       SELECT producto_id FROM pedido_items
        WHERE pedido_id = p_pedido_id AND NOT es_encargue
     )
     ORDER BY id
     FOR UPDATE;

    PERFORM 1
      FROM producto_variantes
     WHERE id IN (
       SELECT variante_id FROM pedido_items
        WHERE pedido_id = p_pedido_id AND NOT es_encargue AND variante_id IS NOT NULL
     )
     ORDER BY id
     FOR UPDATE;

    v_motivo_stock := 'Cancelación pedido #'
      || COALESCE(v_pedido.numero_pedido, v_pedido.id::text)
      || COALESCE(': ' || NULLIF(p_motivo, ''), '');

    FOR r IN
      SELECT producto_id, variante_id, SUM(cantidad)::int AS cantidad
        FROM pedido_items
       WHERE pedido_id = p_pedido_id AND NOT es_encargue
       GROUP BY producto_id, variante_id
    LOOP
      IF r.variante_id IS NOT NULL THEN
        UPDATE producto_variantes
           SET stock_actual = stock_actual + r.cantidad
         WHERE id = r.variante_id
        RETURNING stock_actual INTO v_stock_nuevo;
      ELSE
        UPDATE productos
           SET stock_actual = stock_actual + r.cantidad,
               updated_at = NOW()
         WHERE id = r.producto_id
        RETURNING stock_actual INTO v_stock_nuevo;
      END IF;

      IF v_stock_nuevo IS NOT NULL THEN
        INSERT INTO stock_movimientos (
          producto_id, variante_id, tipo, cantidad,
          stock_anterior, stock_nuevo,
          referencia_tipo, referencia_id, motivo, registrado_por
        ) VALUES (
          r.producto_id, r.variante_id, 'devolucion', r.cantidad,
          v_stock_nuevo - r.cantidad, v_stock_nuevo,
          'pedido', p_pedido_id, v_motivo_stock, p_registrado_por
        );
      END IF;
    END LOOP;
  END IF;

  -- Ingresos registrados en tesorería por este pedido: si el movimiento no
  -- está conciliado con un extracto bancario (extracto_id) se borra; si ya
  -- está conciliado se compensa con un egreso "Devoluciones tienda" en la
  -- misma cuenta, para no romper la conciliación.
  FOR r IN
    SELECT m.id, m.cuenta_id, m.monto, m.moneda, m.extracto_id
      FROM movimientos_financieros m
     WHERE m.origen_tipo = 'pedido'
       AND m.origen_id = p_pedido_id
       AND m.tipo = 'ingreso'
  LOOP
    IF r.extracto_id IS NULL THEN
      DELETE FROM movimientos_financieros WHERE id = r.id;
      v_revertidos := v_revertidos + 1;
    ELSE
      IF v_cat_devol IS NULL THEN
        SELECT id INTO v_cat_devol
          FROM categorias_financieras
         WHERE slug = 'devoluciones-tienda';
      END IF;

      INSERT INTO movimientos_financieros (
        cuenta_id, tipo, categoria_id, monto, moneda, fecha,
        descripcion, origen_tipo, origen_id, referencia, registrado_por,
        clasificado
      ) VALUES (
        r.cuenta_id, 'egreso', v_cat_devol, r.monto, r.moneda, v_hoy,
        'Devolución por cancelación — Pedido #'
          || COALESCE(v_pedido.numero_pedido, v_pedido.id::text),
        'pedido', p_pedido_id,
        'DEV-' || COALESCE(v_pedido.numero_pedido, v_pedido.id::text),
        p_registrado_por,
        TRUE
      );
      v_compensados := v_compensados + 1;
    END IF;
  END LOOP;

  -- Donación: si ya se transfirió a la Olla no se toca.
  UPDATE donaciones
     SET estado = 'cancelada'
   WHERE pedido_id = p_pedido_id
     AND estado IN ('pendiente_pago', 'cobrada');

  -- Devolver el uso del promocode.
  IF v_pedido.promocode_id IS NOT NULL THEN
    UPDATE promocodes
       SET usos_actuales = GREATEST(0, usos_actuales - 1),
           updated_at = NOW()
     WHERE id = v_pedido.promocode_id;
  END IF;

  -- Cuenta corriente de la disciplina.
  IF v_pedido.tipo = 'disciplina' AND v_pedido.disciplina_id IS NOT NULL THEN
    UPDATE disciplinas
       SET saldo_cuenta_corriente = COALESCE(saldo_cuenta_corriente, 0) - v_pedido.total
     WHERE id = v_pedido.disciplina_id;
  END IF;

  UPDATE pedidos
     SET estado = 'cancelado',
         stock_reservado = FALSE,
         notas = CASE
           WHEN NULLIF(p_motivo, '') IS NULL THEN notas
           ELSE concat_ws(E'\n', NULLIF(notas, ''), 'Cancelado: ' || p_motivo)
         END,
         updated_at = NOW()
   WHERE id = p_pedido_id;

  RETURN jsonb_build_object(
    'ok', true,
    'estado_anterior', v_pedido.estado,
    'stock_devuelto', v_desconto_stock,
    'movimientos_revertidos', v_revertidos,
    'movimientos_compensados', v_compensados
  );
END
$$;


ALTER FUNCTION "public"."cancelar_pedido"("p_pedido_id" integer, "p_motivo" "text", "p_registrado_por" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."confirmar_reserva_pedido"("p_pedido_id" integer, "p_estado_nuevo" "text", "p_registrado_por" "uuid" DEFAULT NULL::"uuid", "p_estado_esperado" "text" DEFAULT 'pendiente_verificacion'::"text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_pedido       pedidos%ROWTYPE;
  r              RECORD;
  v_stock        INTEGER;
  v_stock_nuevo  INTEGER;
  v_nombre       TEXT;
  v_motivo       TEXT;
  v_faltantes    JSONB := '[]'::jsonb;
BEGIN
  IF p_estado_nuevo NOT IN ('pagado', 'encargado', 'preparando') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'estado_nuevo_invalido');
  END IF;

  SELECT * INTO v_pedido FROM pedidos WHERE id = p_pedido_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'no_encontrado');
  END IF;

  IF v_pedido.estado <> p_estado_esperado THEN
    RETURN jsonb_build_object(
      'ok', false, 'error', 'estado_invalido', 'estado', v_pedido.estado
    );
  END IF;

  PERFORM 1
    FROM productos
   WHERE id IN (
     SELECT producto_id FROM pedido_items
      WHERE pedido_id = p_pedido_id AND NOT es_encargue
   )
   ORDER BY id
   FOR UPDATE;

  PERFORM 1
    FROM producto_variantes
   WHERE id IN (
     SELECT variante_id FROM pedido_items
      WHERE pedido_id = p_pedido_id AND NOT es_encargue AND variante_id IS NOT NULL
   )
   ORDER BY id
   FOR UPDATE;

  -- Validar stock (agrupado por producto/variante).
  FOR r IN
    SELECT producto_id, variante_id, SUM(cantidad)::int AS cantidad
      FROM pedido_items
     WHERE pedido_id = p_pedido_id AND NOT es_encargue
     GROUP BY producto_id, variante_id
  LOOP
    IF r.variante_id IS NOT NULL THEN
      SELECT v.stock_actual, p.nombre || ' - ' || v.nombre
        INTO v_stock, v_nombre
        FROM producto_variantes v
        JOIN productos p ON p.id = v.producto_id
       WHERE v.id = r.variante_id;
    ELSE
      SELECT stock_actual, nombre
        INTO v_stock, v_nombre
        FROM productos
       WHERE id = r.producto_id;
    END IF;

    IF COALESCE(v_stock, 0) < r.cantidad THEN
      v_faltantes := v_faltantes || jsonb_build_object(
        'producto_id', r.producto_id,
        'variante_id', r.variante_id,
        'nombre',      v_nombre,
        'solicitado',  r.cantidad,
        'disponible',  GREATEST(0, COALESCE(v_stock, 0))
      );
    END IF;
  END LOOP;

  IF jsonb_array_length(v_faltantes) > 0 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'stock', 'faltantes', v_faltantes);
  END IF;

  v_motivo := motivo_venta_pedido(v_pedido.tipo, v_pedido.numero_pedido, v_pedido.id);

  FOR r IN
    SELECT producto_id, variante_id, SUM(cantidad)::int AS cantidad
      FROM pedido_items
     WHERE pedido_id = p_pedido_id AND NOT es_encargue
     GROUP BY producto_id, variante_id
  LOOP
    IF r.variante_id IS NOT NULL THEN
      UPDATE producto_variantes
         SET stock_actual = stock_actual - r.cantidad
       WHERE id = r.variante_id
      RETURNING stock_actual INTO v_stock_nuevo;
    ELSE
      UPDATE productos
         SET stock_actual = stock_actual - r.cantidad,
             updated_at = NOW()
       WHERE id = r.producto_id
      RETURNING stock_actual INTO v_stock_nuevo;
    END IF;

    INSERT INTO stock_movimientos (
      producto_id, variante_id, tipo, cantidad,
      stock_anterior, stock_nuevo,
      referencia_tipo, referencia_id, motivo, registrado_por
    ) VALUES (
      r.producto_id, r.variante_id, 'venta', -r.cantidad,
      v_stock_nuevo + r.cantidad, v_stock_nuevo,
      'pedido', p_pedido_id, v_motivo, p_registrado_por
    );
  END LOOP;

  UPDATE pedidos
     SET estado = p_estado_nuevo,
         stock_reservado = FALSE,
         updated_at = NOW()
   WHERE id = p_pedido_id;

  RETURN jsonb_build_object('ok', true, 'estado', p_estado_nuevo);
END
$$;


ALTER FUNCTION "public"."confirmar_reserva_pedido"("p_pedido_id" integer, "p_estado_nuevo" "text", "p_registrado_por" "uuid", "p_estado_esperado" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."costo_proveedor_fallback"("p_producto_id" integer) RETURNS numeric
    LANGUAGE "plpgsql" STABLE
    AS $$
DECLARE
  v_costo DECIMAL(10,2);
BEGIN
  -- 1) Proveedor principal con costo no nulo
  SELECT pp.costo
    INTO v_costo
    FROM producto_proveedores pp
   WHERE pp.producto_id = p_producto_id
     AND pp.es_principal = TRUE
     AND pp.costo IS NOT NULL
   LIMIT 1;

  -- 2) Cualquier proveedor con costo no nulo, el más reciente cargado
  IF v_costo IS NULL THEN
    SELECT pp.costo
      INTO v_costo
      FROM producto_proveedores pp
     WHERE pp.producto_id = p_producto_id
       AND pp.costo IS NOT NULL
     ORDER BY pp.created_at DESC NULLS LAST, pp.id DESC
     LIMIT 1;
  END IF;

  RETURN v_costo;
END;
$$;


ALTER FUNCTION "public"."costo_proveedor_fallback"("p_producto_id" integer) OWNER TO "postgres";


COMMENT ON FUNCTION "public"."costo_proveedor_fallback"("p_producto_id" integer) IS 'Retorna producto_proveedores.costo del principal (o el más reciente con costo) como fallback cuando no hay PPP.';



CREATE OR REPLACE FUNCTION "public"."decrementar_uso_promocode"("p_id" integer) RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_actualizadas INTEGER;
BEGIN
  UPDATE promocodes
     SET usos_actuales = GREATEST(0, usos_actuales - 1),
         updated_at = NOW()
   WHERE id = p_id;

  GET DIAGNOSTICS v_actualizadas = ROW_COUNT;
  RETURN v_actualizadas > 0;
END
$$;


ALTER FUNCTION "public"."decrementar_uso_promocode"("p_id" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."desconciliar_si_cambia_monto"() RETURNS "trigger"
    LANGUAGE "plpgsql"
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


ALTER FUNCTION "public"."desconciliar_si_cambia_monto"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."descontar_stock_pedido"("p_pedido_id" integer, "p_items" "jsonb", "p_registrado_por" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_item             JSONB;
  v_producto_id      INTEGER;
  v_variante_id      INTEGER;
  v_cantidad         INTEGER;
  v_stock            INTEGER;
  v_stock_nuevo      INTEGER;
  v_reservado        INTEGER;
  v_disponible       INTEGER;
  v_producto_nombre  TEXT;
  v_variante_nombre  TEXT;
  v_motivo           TEXT;
  v_faltantes        JSONB := '[]'::jsonb;
BEGIN
  -- 1) Lock productos involucrados (solo los que descuentan stock).
  PERFORM 1
    FROM productos
   WHERE id IN (
     SELECT DISTINCT (i->>'producto_id')::int
       FROM jsonb_array_elements(p_items) AS i
      WHERE COALESCE((i->>'es_encargue')::boolean, false) = false
   )
   ORDER BY id
   FOR UPDATE;

  -- 2) Lock variantes involucradas.
  PERFORM 1
    FROM producto_variantes
   WHERE id IN (
     SELECT DISTINCT (i->>'variante_id')::int
       FROM jsonb_array_elements(p_items) AS i
      WHERE COALESCE((i->>'es_encargue')::boolean, false) = false
        AND NULLIF(i->>'variante_id','') IS NOT NULL
   )
   ORDER BY id
   FOR UPDATE;

  -- 3) Validar disponibilidad contra stock_actual − reservas pendientes.
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    IF COALESCE((v_item->>'es_encargue')::boolean, false) THEN
      CONTINUE;
    END IF;

    v_producto_id := (v_item->>'producto_id')::int;
    v_variante_id := NULLIF(v_item->>'variante_id','')::int;
    v_cantidad    := (v_item->>'cantidad')::int;

    IF v_variante_id IS NOT NULL THEN
      SELECT v.stock_actual, p.nombre, v.nombre
        INTO v_stock, v_producto_nombre, v_variante_nombre
        FROM producto_variantes v
        JOIN productos p ON p.id = v.producto_id
       WHERE v.id = v_variante_id;

      SELECT COALESCE(SUM(pi.cantidad), 0)
        INTO v_reservado
        FROM pedido_items pi
        JOIN pedidos pe ON pe.id = pi.pedido_id
       WHERE pi.variante_id = v_variante_id
         AND pi.es_encargue = FALSE
         AND pe.estado = 'pendiente_verificacion'
         AND pe.stock_reservado = TRUE
         AND pe.id <> p_pedido_id;
    ELSE
      SELECT stock_actual, nombre
        INTO v_stock, v_producto_nombre
        FROM productos
       WHERE id = v_producto_id;
      v_variante_nombre := NULL;

      SELECT COALESCE(SUM(pi.cantidad), 0)
        INTO v_reservado
        FROM pedido_items pi
        JOIN pedidos pe ON pe.id = pi.pedido_id
       WHERE pi.producto_id = v_producto_id
         AND pi.variante_id IS NULL
         AND pi.es_encargue = FALSE
         AND pe.estado = 'pendiente_verificacion'
         AND pe.stock_reservado = TRUE
         AND pe.id <> p_pedido_id;
    END IF;

    v_disponible := GREATEST(0, COALESCE(v_stock, 0) - COALESCE(v_reservado, 0));

    IF v_cantidad > v_disponible THEN
      v_faltantes := v_faltantes || jsonb_build_object(
        'producto_id', v_producto_id,
        'variante_id', v_variante_id,
        'nombre',      v_producto_nombre || COALESCE(' - ' || v_variante_nombre, ''),
        'solicitado',  v_cantidad,
        'disponible',  v_disponible
      );
    END IF;
  END LOOP;

  IF jsonb_array_length(v_faltantes) > 0 THEN
    RETURN jsonb_build_object('ok', false, 'faltantes', v_faltantes);
  END IF;

  -- 4) Insertar pedido_items (incluye encargues).
  INSERT INTO pedido_items (
    pedido_id, producto_id, variante_id, cantidad,
    precio_unitario, subtotal,
    es_encargue, personalizacion, precio_extra_personalizacion
  )
  SELECT
    p_pedido_id,
    (i->>'producto_id')::int,
    NULLIF(i->>'variante_id','')::int,
    (i->>'cantidad')::int,
    (i->>'precio_unitario')::numeric,
    (i->>'subtotal')::numeric,
    COALESCE((i->>'es_encargue')::boolean, false),
    COALESCE(i->'personalizacion', '{}'::jsonb),
    COALESCE((i->>'precio_extra_personalizacion')::numeric, 0)
  FROM jsonb_array_elements(p_items) AS i;

  -- 5) Descontar stock + registrar movimientos (solo items de stock).
  --    El stock del producto padre lo sincroniza el trigger de variantes.
  SELECT motivo_venta_pedido(tipo, numero_pedido, id)
    INTO v_motivo
    FROM pedidos
   WHERE id = p_pedido_id;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    IF COALESCE((v_item->>'es_encargue')::boolean, false) THEN
      CONTINUE;
    END IF;

    v_producto_id := (v_item->>'producto_id')::int;
    v_variante_id := NULLIF(v_item->>'variante_id','')::int;
    v_cantidad    := (v_item->>'cantidad')::int;

    IF v_variante_id IS NOT NULL THEN
      UPDATE producto_variantes
         SET stock_actual = stock_actual - v_cantidad
       WHERE id = v_variante_id
      RETURNING stock_actual INTO v_stock_nuevo;
    ELSE
      UPDATE productos
         SET stock_actual = stock_actual - v_cantidad,
             updated_at = NOW()
       WHERE id = v_producto_id
      RETURNING stock_actual INTO v_stock_nuevo;
    END IF;

    INSERT INTO stock_movimientos (
      producto_id, variante_id, tipo, cantidad,
      stock_anterior, stock_nuevo,
      referencia_tipo, referencia_id, motivo, registrado_por
    ) VALUES (
      v_producto_id, v_variante_id, 'venta', -v_cantidad,
      v_stock_nuevo + v_cantidad, v_stock_nuevo,
      'pedido', p_pedido_id, v_motivo, p_registrado_por
    );
  END LOOP;

  RETURN jsonb_build_object('ok', true);
END
$$;


ALTER FUNCTION "public"."descontar_stock_pedido"("p_pedido_id" integer, "p_items" "jsonb", "p_registrado_por" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."es_staff"() RETURNS boolean
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    AS $$
BEGIN
  RETURN tiene_algun_rol(ARRAY['super_admin', 'tienda', 'secretaria', 'eventos']);
END;
$$;


ALTER FUNCTION "public"."es_staff"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."estado_conciliacion_cuenta"("p_cuenta_id" integer) RETURNS "jsonb"
    LANGUAGE "plpgsql" STABLE
    SET "search_path" TO 'public'
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


ALTER FUNCTION "public"."estado_conciliacion_cuenta"("p_cuenta_id" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."expirar_reservas_pendientes"("p_horas" integer DEFAULT 48) RETURNS TABLE("pedido_id" integer)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT p.id
      FROM pedidos p
     WHERE p.estado = 'pendiente_verificacion'
       AND p.tipo = 'online'
       AND p.created_at < NOW() - make_interval(hours => p_horas)
       AND NOT EXISTS (SELECT 1 FROM comprobantes c WHERE c.pedido_id = p.id)
     ORDER BY p.id
  LOOP
    PERFORM cancelar_pedido(
      r.id,
      'Vencido: no se recibió el comprobante de transferencia',
      NULL
    );
    pedido_id := r.id;
    RETURN NEXT;
  END LOOP;
END
$$;


ALTER FUNCTION "public"."expirar_reservas_pendientes"("p_horas" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."generar_numero_pedido"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
DECLARE
  fecha_str TEXT;
  secuencia INTEGER;
BEGIN
  fecha_str := TO_CHAR(NOW() AT TIME ZONE 'America/Montevideo', 'YYYYMMDD');

  -- Serializa la numeración del día hasta el commit del INSERT.
  PERFORM pg_advisory_xact_lock(hashtext('generar_numero_pedido:' || fecha_str));

  SELECT COALESCE(MAX(
    CAST(SPLIT_PART(numero_pedido, '-', 3) AS INTEGER)
  ), 0) + 1 INTO secuencia
  FROM pedidos
  WHERE numero_pedido LIKE 'CS-' || fecha_str || '-%';

  NEW.numero_pedido := 'CS-' || fecha_str || '-' || LPAD(secuencia::TEXT, 3, '0');
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."generar_numero_pedido"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."handle_new_user"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  v_cedula TEXT;
  v_telefono TEXT;
  v_padron_id INTEGER;
  v_rol_socio_id INTEGER;
  v_rol_no_socio_id INTEGER;
BEGIN
  -- Normalizar cedula (quitar puntos, guiones, espacios)
  v_cedula := NULLIF(TRIM(REPLACE(REPLACE(REPLACE(
    COALESCE(NEW.raw_user_meta_data->>'cedula', ''), '.', ''), '-', ''), ' ', '')), '');
  v_telefono := NULLIF(TRIM(COALESCE(NEW.raw_user_meta_data->>'telefono', '')), '');

  -- Crear perfil
  INSERT INTO public.perfiles (id, nombre, apellido, cedula, telefono)
  VALUES (
    NEW.id,
    COALESCE(
      NEW.raw_user_meta_data->>'nombre',
      NEW.raw_user_meta_data->>'given_name',
      SPLIT_PART(COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', ''), ' ', 1),
      ''
    ),
    COALESCE(
      NEW.raw_user_meta_data->>'apellido',
      NEW.raw_user_meta_data->>'family_name',
      NULLIF(SPLIT_PART(COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', ''), ' ', 2), ''),
      ''
    ),
    v_cedula,
    v_telefono
  );

  -- Obtener IDs de roles
  SELECT id INTO v_rol_socio_id FROM public.roles WHERE nombre = 'socio';
  SELECT id INTO v_rol_no_socio_id FROM public.roles WHERE nombre = 'no_socio';

  -- Si hay cedula, buscar en el padrón y vincular automáticamente
  IF v_cedula IS NOT NULL AND v_cedula <> '' THEN
    SELECT id INTO v_padron_id
    FROM public.padron_socios
    WHERE cedula = v_cedula
      AND activo = TRUE
      AND perfil_id IS NULL  -- Solo si no está vinculado a otro usuario
    LIMIT 1;

    IF v_padron_id IS NOT NULL THEN
      -- Vincular padrón → perfil
      UPDATE public.padron_socios
      SET perfil_id = NEW.id, vinculado_at = NOW()
      WHERE id = v_padron_id;

      -- Marcar perfil como socio verificado
      UPDATE public.perfiles
      SET es_socio = TRUE,
          socio_verificado = TRUE,
          padron_socio_id = v_padron_id
      WHERE id = NEW.id;

      -- Copiar disciplinas del padrón al perfil
      INSERT INTO public.perfil_disciplinas (perfil_id, disciplina_id, categoria, activa, fecha_ingreso)
      SELECT NEW.id, pd.disciplina_id, pd.categoria, pd.activa, pd.fecha_ingreso
      FROM public.padron_disciplinas pd
      WHERE pd.padron_socio_id = v_padron_id;

      -- Asignar rol socio
      IF v_rol_socio_id IS NOT NULL THEN
        INSERT INTO public.perfil_roles (perfil_id, rol_id)
        VALUES (NEW.id, v_rol_socio_id);
      END IF;

      RETURN NEW;
    END IF;
  END IF;

  -- Si no es socio, asignar rol no_socio
  IF v_rol_no_socio_id IS NOT NULL THEN
    INSERT INTO public.perfil_roles (perfil_id, rol_id)
    VALUES (NEW.id, v_rol_no_socio_id);
  END IF;

  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."handle_new_user"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."handle_padron_socio_deleted"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  v_rol_socio_id INTEGER;
  v_rol_no_socio_id INTEGER;
BEGIN
  IF OLD.perfil_id IS NOT NULL THEN
    UPDATE public.perfiles
    SET es_socio = FALSE,
        socio_verificado = FALSE,
        padron_socio_id = NULL
    WHERE id = OLD.perfil_id;

    SELECT id INTO v_rol_socio_id FROM public.roles WHERE nombre = 'socio';
    IF v_rol_socio_id IS NOT NULL THEN
      DELETE FROM public.perfil_roles
      WHERE perfil_id = OLD.perfil_id AND rol_id = v_rol_socio_id;
    END IF;

    SELECT id INTO v_rol_no_socio_id FROM public.roles WHERE nombre = 'no_socio';
    IF v_rol_no_socio_id IS NOT NULL THEN
      INSERT INTO public.perfil_roles (perfil_id, rol_id)
      VALUES (OLD.perfil_id, v_rol_no_socio_id)
      ON CONFLICT (perfil_id, rol_id) DO NOTHING;
    END IF;
  END IF;

  RETURN OLD;
END;
$$;


ALTER FUNCTION "public"."handle_padron_socio_deleted"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."incrementar_stock_item"("p_producto_id" integer, "p_variante_id" integer, "p_cantidad" integer) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_nuevo INTEGER;
BEGIN
  IF p_variante_id IS NOT NULL THEN
    UPDATE producto_variantes
       SET stock_actual = stock_actual + p_cantidad
     WHERE id = p_variante_id
       AND producto_id = p_producto_id
    RETURNING stock_actual INTO v_nuevo;
  ELSE
    UPDATE productos
       SET stock_actual = stock_actual + p_cantidad,
           updated_at = NOW()
     WHERE id = p_producto_id
    RETURNING stock_actual INTO v_nuevo;
  END IF;

  IF v_nuevo IS NULL THEN
    RETURN jsonb_build_object('ok', false);
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'stock_anterior', v_nuevo - p_cantidad,
    'stock_nuevo', v_nuevo
  );
END
$$;


ALTER FUNCTION "public"."incrementar_stock_item"("p_producto_id" integer, "p_variante_id" integer, "p_cantidad" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."incrementar_uso_promocode"("p_id" integer) RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_actualizadas INTEGER;
BEGIN
  UPDATE promocodes
     SET usos_actuales = usos_actuales + 1,
         updated_at = NOW()
   WHERE id = p_id
     AND activo
     AND NOW() BETWEEN fecha_inicio AND fecha_fin
     AND (usos_max IS NULL OR usos_actuales < usos_max);

  GET DIAGNOSTICS v_actualizadas = ROW_COUNT;
  RETURN v_actualizadas > 0;
END
$$;


ALTER FUNCTION "public"."incrementar_uso_promocode"("p_id" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."motivo_venta_pedido"("p_tipo" "text", "p_numero" "text", "p_id" integer) RETURNS "text"
    LANGUAGE "sql" IMMUTABLE
    AS $$
  SELECT CASE p_tipo
           WHEN 'pos' THEN 'Venta POS'
           WHEN 'disciplina' THEN 'Pedido disciplina'
           ELSE 'Venta online'
         END || ' #' || COALESCE(p_numero, p_id::text);
$$;


ALTER FUNCTION "public"."motivo_venta_pedido"("p_tipo" "text", "p_numero" "text", "p_id" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."popups_set_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."popups_set_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."promocodes_normalize_codigo"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  NEW.codigo := UPPER(TRIM(NEW.codigo));
  RETURN NEW;
END $$;


ALTER FUNCTION "public"."promocodes_normalize_codigo"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."recalcular_costo_promedio"("p_producto_id" integer, "p_variante_id" integer DEFAULT NULL::integer) RETURNS "void"
    LANGUAGE "plpgsql"
    AS $$
DECLARE
  v_ppp DECIMAL(10,2);
BEGIN
  SELECT SUM(ci.cantidad_recibida * ci.costo_unitario)::DECIMAL
         / NULLIF(SUM(ci.cantidad_recibida), 0)
  INTO v_ppp
  FROM compra_items ci
  JOIN compras_proveedor cp ON cp.id = ci.compra_id
  WHERE cp.estado = 'recibida'
    AND ci.cantidad_recibida > 0
    AND ci.producto_id = p_producto_id
    AND (
      (p_variante_id IS NULL AND ci.variante_id IS NULL)
      OR ci.variante_id = p_variante_id
    );

  IF v_ppp IS NULL THEN
    RETURN;
  END IF;

  IF p_variante_id IS NULL THEN
    UPDATE productos
       SET costo_promedio = v_ppp,
           updated_at = NOW()
     WHERE id = p_producto_id;
  ELSE
    UPDATE producto_variantes
       SET costo_promedio = v_ppp
     WHERE id = p_variante_id;
  END IF;
END;
$$;


ALTER FUNCTION "public"."recalcular_costo_promedio"("p_producto_id" integer, "p_variante_id" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."recalcular_stock_producto"("p_producto_id" integer) RETURNS "void"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  -- Recalcular stock de producto (sin variantes)
  UPDATE productos
  SET stock_actual = COALESCE((
    SELECT SUM(cantidad) FROM stock_deposito
    WHERE producto_id = p_producto_id AND variante_id IS NULL
  ), 0),
  updated_at = NOW()
  WHERE id = p_producto_id;

  -- Recalcular stock de cada variante
  UPDATE producto_variantes pv
  SET stock_actual = COALESCE((
    SELECT SUM(cantidad) FROM stock_deposito
    WHERE producto_id = p_producto_id AND variante_id = pv.id
  ), 0)
  WHERE pv.producto_id = p_producto_id;
END;
$$;


ALTER FUNCTION "public"."recalcular_stock_producto"("p_producto_id" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."registrar_historial_movimiento"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
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


ALTER FUNCTION "public"."registrar_historial_movimiento"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."registrar_transferencia_donaciones"("p_fecha" "date", "p_comprobante_url" "text", "p_notas" "text", "p_creado_por" "uuid") RETURNS TABLE("transferencia_id" integer, "monto_total" numeric, "cantidad" integer)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_total DECIMAL(10,2);
  v_cantidad INTEGER;
  v_transferencia_id INTEGER;
BEGIN
  IF NOT tiene_algun_rol(ARRAY['super_admin', 'tienda']) THEN
    RAISE EXCEPTION 'No autorizado';
  END IF;

  SELECT COALESCE(SUM(monto), 0), COUNT(*)
    INTO v_total, v_cantidad
    FROM donaciones
   WHERE estado = 'cobrada' AND transferencia_id IS NULL;

  IF v_cantidad = 0 THEN
    RAISE EXCEPTION 'No hay donaciones pendientes de transferir';
  END IF;

  INSERT INTO donaciones_transferencias
    (fecha_transferencia, monto_total, cantidad_donaciones, comprobante_url, notas, creado_por)
  VALUES
    (p_fecha, v_total, v_cantidad, p_comprobante_url, p_notas, p_creado_por)
  RETURNING id INTO v_transferencia_id;

  UPDATE donaciones
     SET estado = 'transferida',
         transferencia_id = v_transferencia_id
   WHERE estado = 'cobrada' AND transferencia_id IS NULL;

  RETURN QUERY SELECT v_transferencia_id, v_total, v_cantidad;
END
$$;


ALTER FUNCTION "public"."registrar_transferencia_donaciones"("p_fecha" "date", "p_comprobante_url" "text", "p_notas" "text", "p_creado_por" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."reservar_stock_pedido"("p_pedido_id" integer, "p_items" "jsonb") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_item             JSONB;
  v_producto_id      INTEGER;
  v_variante_id      INTEGER;
  v_cantidad         INTEGER;
  v_es_encargue      BOOLEAN;
  v_stock            INTEGER;
  v_reservado        INTEGER;
  v_disponible       INTEGER;
  v_producto_nombre  TEXT;
  v_variante_nombre  TEXT;
  v_faltantes        JSONB := '[]'::jsonb;
BEGIN
  -- 1) Lock de los productos involucrados (solo los que descuentan stock,
  --    es_encargue=false). Orden estable por id para evitar deadlocks.
  PERFORM 1
    FROM productos
   WHERE id IN (
     SELECT DISTINCT (i->>'producto_id')::int
       FROM jsonb_array_elements(p_items) AS i
      WHERE COALESCE((i->>'es_encargue')::boolean, false) = false
   )
   ORDER BY id
   FOR UPDATE;

  -- 2) Lock de las variantes involucradas.
  PERFORM 1
    FROM producto_variantes
   WHERE id IN (
     SELECT DISTINCT (i->>'variante_id')::int
       FROM jsonb_array_elements(p_items) AS i
      WHERE COALESCE((i->>'es_encargue')::boolean, false) = false
        AND NULLIF(i->>'variante_id','') IS NOT NULL
   )
   ORDER BY id
   FOR UPDATE;

  -- 3) Validar disponibilidad de cada ítem.
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_es_encargue := COALESCE((v_item->>'es_encargue')::boolean, false);
    IF v_es_encargue THEN
      CONTINUE;
    END IF;

    v_producto_id := (v_item->>'producto_id')::int;
    v_variante_id := NULLIF(v_item->>'variante_id','')::int;
    v_cantidad    := (v_item->>'cantidad')::int;

    IF v_variante_id IS NOT NULL THEN
      SELECT v.stock_actual, p.nombre, v.nombre
        INTO v_stock, v_producto_nombre, v_variante_nombre
        FROM producto_variantes v
        JOIN productos p ON p.id = v.producto_id
       WHERE v.id = v_variante_id;

      SELECT COALESCE(SUM(pi.cantidad), 0)
        INTO v_reservado
        FROM pedido_items pi
        JOIN pedidos pe ON pe.id = pi.pedido_id
       WHERE pi.variante_id = v_variante_id
         AND pi.es_encargue = FALSE
         AND pe.estado = 'pendiente_verificacion'
         AND pe.stock_reservado = TRUE
         AND pe.id <> p_pedido_id;
    ELSE
      SELECT stock_actual, nombre
        INTO v_stock, v_producto_nombre
        FROM productos
       WHERE id = v_producto_id;
      v_variante_nombre := NULL;

      SELECT COALESCE(SUM(pi.cantidad), 0)
        INTO v_reservado
        FROM pedido_items pi
        JOIN pedidos pe ON pe.id = pi.pedido_id
       WHERE pi.producto_id = v_producto_id
         AND pi.variante_id IS NULL
         AND pi.es_encargue = FALSE
         AND pe.estado = 'pendiente_verificacion'
         AND pe.stock_reservado = TRUE
         AND pe.id <> p_pedido_id;
    END IF;

    v_disponible := GREATEST(0, COALESCE(v_stock, 0) - COALESCE(v_reservado, 0));

    IF v_cantidad > v_disponible THEN
      v_faltantes := v_faltantes || jsonb_build_object(
        'producto_id', v_producto_id,
        'variante_id', v_variante_id,
        'nombre',      v_producto_nombre || COALESCE(' - ' || v_variante_nombre, ''),
        'solicitado',  v_cantidad,
        'disponible',  v_disponible
      );
    END IF;
  END LOOP;

  IF jsonb_array_length(v_faltantes) > 0 THEN
    RETURN jsonb_build_object('ok', false, 'faltantes', v_faltantes);
  END IF;

  -- 4) Insertar los pedido_items dentro de la misma transacción mientras
  --    los productos/variantes siguen lockeados. Esto garantiza que el
  --    próximo caller los vea como reservados al adquirir el lock.
  INSERT INTO pedido_items (
    pedido_id, producto_id, variante_id, cantidad,
    precio_unitario, subtotal,
    es_encargue, personalizacion, precio_extra_personalizacion
  )
  SELECT
    p_pedido_id,
    (i->>'producto_id')::int,
    NULLIF(i->>'variante_id','')::int,
    (i->>'cantidad')::int,
    (i->>'precio_unitario')::numeric,
    (i->>'subtotal')::numeric,
    COALESCE((i->>'es_encargue')::boolean, false),
    COALESCE(i->'personalizacion', '{}'::jsonb),
    COALESCE((i->>'precio_extra_personalizacion')::numeric, 0)
  FROM jsonb_array_elements(p_items) AS i;

  RETURN jsonb_build_object('ok', true);
END
$$;


ALTER FUNCTION "public"."reservar_stock_pedido"("p_pedido_id" integer, "p_items" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."revertir_saldo_disciplina"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  IF OLD.tipo = 'disciplina'
     AND OLD.disciplina_id IS NOT NULL
     AND OLD.estado <> 'cancelado' THEN
    UPDATE disciplinas
       SET saldo_cuenta_corriente = COALESCE(saldo_cuenta_corriente, 0) - OLD.total
     WHERE id = OLD.disciplina_id;
  END IF;
  RETURN OLD;
END;
$$;


ALTER FUNCTION "public"."revertir_saldo_disciplina"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."set_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."tiene_algun_rol"("roles_nombres" "text"[]) RETURNS boolean
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM perfil_roles pr
    JOIN roles r ON r.id = pr.rol_id
    WHERE pr.perfil_id = auth.uid()
    AND r.nombre = ANY(roles_nombres)
  );
END;
$$;


ALTER FUNCTION "public"."tiene_algun_rol"("roles_nombres" "text"[]) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."tiene_rol"("rol_nombre" "text") RETURNS boolean
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM perfil_roles pr
    JOIN roles r ON r.id = pr.rol_id
    WHERE pr.perfil_id = auth.uid()
    AND r.nombre = rol_nombre
  );
END;
$$;


ALTER FUNCTION "public"."tiene_rol"("rol_nombre" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."trg_fn_compra_recibida_actualiza_ppp"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
DECLARE
  r RECORD;
BEGIN
  IF NEW.estado = 'recibida'
     AND (OLD.estado IS DISTINCT FROM 'recibida') THEN
    FOR r IN
      SELECT DISTINCT producto_id, variante_id
        FROM compra_items
       WHERE compra_id = NEW.id
         AND cantidad_recibida > 0
    LOOP
      PERFORM recalcular_costo_promedio(r.producto_id, r.variante_id);
    END LOOP;
  END IF;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."trg_fn_compra_recibida_actualiza_ppp"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."trg_fn_pedido_item_snapshot_costo"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
DECLARE
  v_costo DECIMAL(10,2);
BEGIN
  -- Solo actúa si no se especificó costo explícito.
  IF NEW.costo_unitario_venta IS NOT NULL THEN
    RETURN NEW;
  END IF;

  -- 1) PPP de la variante
  IF NEW.variante_id IS NOT NULL THEN
    SELECT pv.costo_promedio
      INTO v_costo
      FROM producto_variantes pv
     WHERE pv.id = NEW.variante_id;
  END IF;

  -- 2) PPP del producto
  IF v_costo IS NULL THEN
    SELECT p.costo_promedio
      INTO v_costo
      FROM productos p
     WHERE p.id = NEW.producto_id;
  END IF;

  -- 3) Fallback: costo del proveedor principal
  IF v_costo IS NULL THEN
    v_costo := costo_proveedor_fallback(NEW.producto_id);
  END IF;

  NEW.costo_unitario_venta := v_costo;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."trg_fn_pedido_item_snapshot_costo"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."trg_fn_pedidos_fecha_venta"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  IF NEW.estado IN ('pagado', 'encargado', 'preparando', 'listo_retiro', 'retirado') THEN
    IF NEW.fecha_venta IS NULL THEN
      NEW.fecha_venta := NOW();
    END IF;
  ELSIF NEW.estado IN ('pendiente', 'pendiente_verificacion') THEN
    NEW.fecha_venta := NULL;
  END IF;
  -- 'cancelado' conserva la fecha_venta que tuviera.
  RETURN NEW;
END
$$;


ALTER FUNCTION "public"."trg_fn_pedidos_fecha_venta"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."trg_fn_sync_stock_producto_variantes"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
DECLARE
  v_producto_id INTEGER;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_producto_id := OLD.producto_id;
  ELSE
    v_producto_id := NEW.producto_id;
  END IF;

  UPDATE productos p
     SET stock_actual = COALESCE((
           SELECT SUM(v.stock_actual)
             FROM producto_variantes v
            WHERE v.producto_id = v_producto_id
              AND v.activo = TRUE
         ), 0),
         updated_at = NOW()
   WHERE p.id = v_producto_id;

  RETURN NULL;
END
$$;


ALTER FUNCTION "public"."trg_fn_sync_stock_producto_variantes"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_updated_at"() OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."categorias_financieras" (
    "id" integer NOT NULL,
    "nombre" character varying(100) NOT NULL,
    "slug" character varying(100) NOT NULL,
    "tipo" character varying(10) NOT NULL,
    "padre_id" integer,
    "color" character varying(7),
    "icono" character varying(50),
    "presupuesto_mensual" numeric(12,2),
    "orden" integer DEFAULT 0,
    "activa" boolean DEFAULT true,
    "created_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "categorias_financieras_tipo_check" CHECK ((("tipo")::"text" = ANY ((ARRAY['ingreso'::character varying, 'egreso'::character varying])::"text"[])))
);


ALTER TABLE "public"."categorias_financieras" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."categorias_financieras_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."categorias_financieras_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."categorias_financieras_id_seq" OWNED BY "public"."categorias_financieras"."id";



CREATE TABLE IF NOT EXISTS "public"."categorias_producto" (
    "id" integer NOT NULL,
    "nombre" character varying(100) NOT NULL,
    "slug" character varying(100) NOT NULL,
    "descripcion" "text",
    "imagen_url" "text",
    "orden" integer DEFAULT 0,
    "activa" boolean DEFAULT true,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."categorias_producto" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."categorias_producto_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."categorias_producto_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."categorias_producto_id_seq" OWNED BY "public"."categorias_producto"."id";



CREATE TABLE IF NOT EXISTS "public"."compra_items" (
    "id" integer NOT NULL,
    "compra_id" integer NOT NULL,
    "producto_id" integer NOT NULL,
    "variante_id" integer,
    "cantidad" integer NOT NULL,
    "costo_unitario" numeric(10,2) NOT NULL,
    "subtotal" numeric(10,2) NOT NULL,
    "cantidad_recibida" integer DEFAULT 0,
    "created_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "compra_items_cantidad_check" CHECK (("cantidad" > 0))
);


ALTER TABLE "public"."compra_items" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."compra_items_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."compra_items_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."compra_items_id_seq" OWNED BY "public"."compra_items"."id";



CREATE TABLE IF NOT EXISTS "public"."compras_proveedor" (
    "id" integer NOT NULL,
    "numero_compra" character varying(20) NOT NULL,
    "proveedor_id" integer NOT NULL,
    "estado" character varying(20) DEFAULT 'borrador'::character varying NOT NULL,
    "subtotal" numeric(12,2) DEFAULT 0 NOT NULL,
    "impuestos" numeric(12,2) DEFAULT 0,
    "total" numeric(12,2) DEFAULT 0 NOT NULL,
    "moneda" character varying(3) DEFAULT 'UYU'::character varying,
    "fecha_compra" "date" DEFAULT CURRENT_DATE,
    "fecha_recepcion" "date",
    "notas" "text",
    "registrado_por" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "compras_proveedor_estado_check" CHECK ((("estado")::"text" = ANY ((ARRAY['borrador'::character varying, 'confirmada'::character varying, 'recibida'::character varying, 'cancelada'::character varying])::"text"[])))
);


ALTER TABLE "public"."compras_proveedor" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."compras_proveedor_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."compras_proveedor_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."compras_proveedor_id_seq" OWNED BY "public"."compras_proveedor"."id";



CREATE TABLE IF NOT EXISTS "public"."comprobantes" (
    "id" integer NOT NULL,
    "pedido_id" integer NOT NULL,
    "url" "text" NOT NULL,
    "nombre_archivo" character varying(255) NOT NULL,
    "tipo" character varying(10) NOT NULL,
    "tamano_bytes" integer,
    "datos_extraidos" "jsonb",
    "estado" character varying(20) DEFAULT 'pendiente'::character varying NOT NULL,
    "verificado_por" "uuid",
    "verificado_at" timestamp with time zone,
    "motivo_rechazo" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "comprobantes_estado_check" CHECK ((("estado")::"text" = ANY ((ARRAY['pendiente'::character varying, 'verificado'::character varying, 'rechazado'::character varying])::"text"[]))),
    CONSTRAINT "comprobantes_tipo_check" CHECK ((("tipo")::"text" = ANY ((ARRAY['imagen'::character varying, 'pdf'::character varying])::"text"[])))
);


ALTER TABLE "public"."comprobantes" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."comprobantes_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."comprobantes_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."comprobantes_id_seq" OWNED BY "public"."comprobantes"."id";



CREATE TABLE IF NOT EXISTS "public"."contenido_paginas" (
    "id" integer NOT NULL,
    "pagina" character varying(100) NOT NULL,
    "seccion" character varying(100) NOT NULL,
    "titulo" character varying(200),
    "contenido" "text",
    "imagen_url" "text",
    "orden" integer DEFAULT 0,
    "activo" boolean DEFAULT true,
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "updated_by" "uuid"
);


ALTER TABLE "public"."contenido_paginas" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."contenido_paginas_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."contenido_paginas_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."contenido_paginas_id_seq" OWNED BY "public"."contenido_paginas"."id";



CREATE TABLE IF NOT EXISTS "public"."cotizaciones_bcu" (
    "id" integer NOT NULL,
    "fecha" "date" NOT NULL,
    "moneda" character varying(3) DEFAULT 'USD'::character varying NOT NULL,
    "compra" numeric(10,4) NOT NULL,
    "venta" numeric(10,4) NOT NULL,
    "fuente" character varying(50) DEFAULT 'bcu'::character varying NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."cotizaciones_bcu" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."cotizaciones_bcu_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."cotizaciones_bcu_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."cotizaciones_bcu_id_seq" OWNED BY "public"."cotizaciones_bcu"."id";



CREATE TABLE IF NOT EXISTS "public"."cuentas_financieras" (
    "id" integer NOT NULL,
    "nombre" character varying(200) NOT NULL,
    "tipo" character varying(20) NOT NULL,
    "moneda" character varying(3) NOT NULL,
    "banco" character varying(100),
    "numero_cuenta" character varying(50),
    "saldo_actual" numeric(14,2) DEFAULT 0 NOT NULL,
    "saldo_inicial" numeric(14,2) DEFAULT 0 NOT NULL,
    "descripcion" "text",
    "color" character varying(7),
    "activa" boolean DEFAULT true,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "modulo" "text",
    "titular" character varying(200),
    "incluir_en_tesoreria" boolean DEFAULT true NOT NULL,
    CONSTRAINT "cuentas_financieras_moneda_check" CHECK ((("moneda")::"text" = ANY ((ARRAY['UYU'::character varying, 'USD'::character varying])::"text"[]))),
    CONSTRAINT "cuentas_financieras_tipo_check" CHECK ((("tipo")::"text" = ANY ((ARRAY['bancaria'::character varying, 'mercadopago'::character varying, 'caja_chica'::character varying, 'virtual'::character varying])::"text"[])))
);


ALTER TABLE "public"."cuentas_financieras" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."cuentas_financieras_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."cuentas_financieras_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."cuentas_financieras_id_seq" OWNED BY "public"."cuentas_financieras"."id";



CREATE TABLE IF NOT EXISTS "public"."depositos" (
    "id" integer NOT NULL,
    "nombre" character varying(200) NOT NULL,
    "descripcion" "text",
    "ubicacion" character varying(200),
    "activo" boolean DEFAULT true,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."depositos" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."depositos_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."depositos_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."depositos_id_seq" OWNED BY "public"."depositos"."id";



CREATE TABLE IF NOT EXISTS "public"."disciplinas" (
    "id" integer NOT NULL,
    "nombre" character varying(100) NOT NULL,
    "slug" character varying(100) NOT NULL,
    "descripcion" "text",
    "imagen_url" "text",
    "contacto_nombre" character varying(100),
    "contacto_telefono" character varying(20),
    "contacto_email" character varying(100),
    "activa" boolean DEFAULT true,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "saldo_cuenta_corriente" numeric(12,2) DEFAULT 0
);


ALTER TABLE "public"."disciplinas" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."disciplinas_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."disciplinas_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."disciplinas_id_seq" OWNED BY "public"."disciplinas"."id";



CREATE TABLE IF NOT EXISTS "public"."donaciones" (
    "id" integer NOT NULL,
    "pedido_id" integer NOT NULL,
    "monto" numeric(10,2) NOT NULL,
    "estado" character varying(20) DEFAULT 'pendiente_pago'::character varying NOT NULL,
    "transferencia_id" integer,
    "cobrada_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "donaciones_cobrada_at_check" CHECK (((("estado")::"text" = ANY ((ARRAY['pendiente_pago'::character varying, 'cancelada'::character varying])::"text"[])) OR ("cobrada_at" IS NOT NULL))),
    CONSTRAINT "donaciones_estado_check" CHECK ((("estado")::"text" = ANY ((ARRAY['pendiente_pago'::character varying, 'cobrada'::character varying, 'transferida'::character varying, 'cancelada'::character varying])::"text"[]))),
    CONSTRAINT "donaciones_monto_check" CHECK (("monto" > (0)::numeric)),
    CONSTRAINT "donaciones_transferida_check" CHECK (((("estado")::"text" <> 'transferida'::"text") OR ("transferencia_id" IS NOT NULL)))
);


ALTER TABLE "public"."donaciones" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."donaciones_config" (
    "id" integer DEFAULT 1 NOT NULL,
    "activo" boolean DEFAULT false NOT NULL,
    "monto_1" numeric(10,2) DEFAULT 150 NOT NULL,
    "monto_2" numeric(10,2) DEFAULT 300 NOT NULL,
    "monto_3" numeric(10,2) DEFAULT 500 NOT NULL,
    "permitir_monto_custom" boolean DEFAULT true NOT NULL,
    "monto_custom_max" numeric(10,2) DEFAULT 100000 NOT NULL,
    "titulo" character varying(120) DEFAULT 'Olla del Hogar de Cristo'::character varying NOT NULL,
    "descripcion" "text" DEFAULT 'Sumá una donación a tu compra. El 100% va a la Olla del Hogar de Cristo, una iniciativa solidaria que brinda alimento a quienes más lo necesitan.'::"text" NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "updated_by" "uuid",
    CONSTRAINT "donaciones_config_id_check" CHECK (("id" = 1)),
    CONSTRAINT "donaciones_config_monto_1_check" CHECK (("monto_1" > (0)::numeric)),
    CONSTRAINT "donaciones_config_monto_2_check" CHECK (("monto_2" > (0)::numeric)),
    CONSTRAINT "donaciones_config_monto_3_check" CHECK (("monto_3" > (0)::numeric)),
    CONSTRAINT "donaciones_config_monto_custom_max_check" CHECK (("monto_custom_max" > (0)::numeric))
);


ALTER TABLE "public"."donaciones_config" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."donaciones_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."donaciones_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."donaciones_id_seq" OWNED BY "public"."donaciones"."id";



CREATE TABLE IF NOT EXISTS "public"."donaciones_transferencias" (
    "id" integer NOT NULL,
    "fecha_transferencia" "date" NOT NULL,
    "monto_total" numeric(10,2) NOT NULL,
    "cantidad_donaciones" integer NOT NULL,
    "comprobante_url" "text",
    "notas" "text",
    "creado_por" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "donaciones_transferencias_cantidad_donaciones_check" CHECK (("cantidad_donaciones" > 0)),
    CONSTRAINT "donaciones_transferencias_monto_total_check" CHECK (("monto_total" > (0)::numeric))
);


ALTER TABLE "public"."donaciones_transferencias" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."donaciones_transferencias_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."donaciones_transferencias_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."donaciones_transferencias_id_seq" OWNED BY "public"."donaciones_transferencias"."id";



CREATE TABLE IF NOT EXISTS "public"."entradas" (
    "id" integer NOT NULL,
    "codigo" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "evento_id" integer NOT NULL,
    "tipo_entrada_id" integer NOT NULL,
    "lote_id" integer,
    "perfil_id" "uuid",
    "nombre_asistente" character varying(200),
    "cedula_asistente" character varying(20),
    "email_asistente" character varying(200),
    "precio_pagado" numeric(10,2) NOT NULL,
    "moneda" character varying(3) DEFAULT 'UYU'::character varying,
    "estado" character varying(20) DEFAULT 'pendiente'::character varying NOT NULL,
    "metodo_pago" character varying(30),
    "mercadopago_payment_id" "text",
    "qr_url" "text",
    "usado_at" timestamp with time zone,
    "usado_por" "uuid",
    "notas" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "idempotency_key" character varying(36),
    CONSTRAINT "entradas_estado_check" CHECK ((("estado")::"text" = ANY ((ARRAY['pendiente'::character varying, 'pagada'::character varying, 'usada'::character varying, 'cancelada'::character varying, 'reembolsada'::character varying])::"text"[]))),
    CONSTRAINT "entradas_metodo_pago_check" CHECK ((("metodo_pago")::"text" = ANY ((ARRAY['mercadopago'::character varying, 'efectivo'::character varying, 'cortesia'::character varying])::"text"[])))
);


ALTER TABLE "public"."entradas" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."entradas_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."entradas_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."entradas_id_seq" OWNED BY "public"."entradas"."id";



CREATE TABLE IF NOT EXISTS "public"."escaneos_entrada" (
    "id" integer NOT NULL,
    "entrada_id" integer,
    "codigo_escaneado" "uuid" NOT NULL,
    "evento_id" integer NOT NULL,
    "resultado" character varying(20) NOT NULL,
    "escaneado_por" "uuid" NOT NULL,
    "ip_address" "inet",
    "created_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "escaneos_entrada_resultado_check" CHECK ((("resultado")::"text" = ANY ((ARRAY['valido'::character varying, 'ya_usado'::character varying, 'no_encontrado'::character varying, 'evento_incorrecto'::character varying, 'cancelada'::character varying])::"text"[])))
);


ALTER TABLE "public"."escaneos_entrada" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."escaneos_entrada_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."escaneos_entrada_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."escaneos_entrada_id_seq" OWNED BY "public"."escaneos_entrada"."id";



CREATE TABLE IF NOT EXISTS "public"."eventos" (
    "id" integer NOT NULL,
    "titulo" character varying(200) NOT NULL,
    "slug" character varying(200) NOT NULL,
    "descripcion" "text",
    "descripcion_corta" character varying(300),
    "imagen_url" "text",
    "lugar" character varying(200),
    "direccion" "text",
    "fecha_inicio" timestamp with time zone NOT NULL,
    "fecha_fin" timestamp with time zone,
    "capacidad_total" integer,
    "estado" character varying(20) DEFAULT 'borrador'::character varying NOT NULL,
    "es_gratuito" boolean DEFAULT false,
    "requiere_registro" boolean DEFAULT true,
    "creado_por" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "eventos_estado_check" CHECK ((("estado")::"text" = ANY ((ARRAY['borrador'::character varying, 'publicado'::character varying, 'agotado'::character varying, 'finalizado'::character varying, 'cancelado'::character varying])::"text"[])))
);


ALTER TABLE "public"."eventos" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."eventos_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."eventos_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."eventos_id_seq" OWNED BY "public"."eventos"."id";



CREATE TABLE IF NOT EXISTS "public"."extractos_importados" (
    "id" integer NOT NULL,
    "cuenta_id" integer NOT NULL,
    "archivo_nombre" character varying(255) NOT NULL,
    "archivo_hash" "text" NOT NULL,
    "formato" character varying(30) DEFAULT 'itau'::character varying NOT NULL,
    "fecha_desde" "date",
    "fecha_hasta" "date",
    "total_movimientos" integer DEFAULT 0 NOT NULL,
    "movimientos_creados" integer DEFAULT 0 NOT NULL,
    "movimientos_duplicados" integer DEFAULT 0 NOT NULL,
    "saldo_inicial_extracto" numeric(14,2),
    "saldo_final_extracto" numeric(14,2),
    "importado_por" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "ajuste_donaciones" numeric(14,2) DEFAULT 0 NOT NULL
);


ALTER TABLE "public"."extractos_importados" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."extractos_importados_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."extractos_importados_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."extractos_importados_id_seq" OWNED BY "public"."extractos_importados"."id";



CREATE TABLE IF NOT EXISTS "public"."lista_precio_disciplinas" (
    "id" integer NOT NULL,
    "lista_precio_id" integer NOT NULL,
    "disciplina_id" integer NOT NULL
);


ALTER TABLE "public"."lista_precio_disciplinas" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."lista_precio_disciplinas_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."lista_precio_disciplinas_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."lista_precio_disciplinas_id_seq" OWNED BY "public"."lista_precio_disciplinas"."id";



CREATE TABLE IF NOT EXISTS "public"."lista_precio_items" (
    "id" integer NOT NULL,
    "lista_precio_id" integer NOT NULL,
    "producto_id" integer NOT NULL,
    "variante_id" integer,
    "precio" numeric(10,2) NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "lista_precio_items_precio_check" CHECK (("precio" >= (0)::numeric))
);


ALTER TABLE "public"."lista_precio_items" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."lista_precio_items_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."lista_precio_items_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."lista_precio_items_id_seq" OWNED BY "public"."lista_precio_items"."id";



CREATE TABLE IF NOT EXISTS "public"."listas_precio" (
    "id" integer NOT NULL,
    "nombre" character varying(200) NOT NULL,
    "descripcion" "text",
    "activa" boolean DEFAULT true,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."listas_precio" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."listas_precio_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."listas_precio_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."listas_precio_id_seq" OWNED BY "public"."listas_precio"."id";



CREATE TABLE IF NOT EXISTS "public"."lotes_entrada" (
    "id" integer NOT NULL,
    "tipo_entrada_id" integer NOT NULL,
    "nombre" character varying(100) NOT NULL,
    "precio" numeric(10,2) NOT NULL,
    "cantidad" integer NOT NULL,
    "vendidas" integer DEFAULT 0,
    "fecha_inicio" timestamp with time zone NOT NULL,
    "fecha_fin" timestamp with time zone,
    "estado" character varying(20) DEFAULT 'pendiente'::character varying,
    "orden" integer DEFAULT 0,
    "created_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "lotes_entrada_estado_check" CHECK ((("estado")::"text" = ANY ((ARRAY['pendiente'::character varying, 'activo'::character varying, 'agotado'::character varying, 'cerrado'::character varying])::"text"[])))
);


ALTER TABLE "public"."lotes_entrada" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."lotes_entrada_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."lotes_entrada_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."lotes_entrada_id_seq" OWNED BY "public"."lotes_entrada"."id";



CREATE TABLE IF NOT EXISTS "public"."memorias" (
    "id" integer NOT NULL,
    "anio" integer NOT NULL,
    "titulo" character varying(200),
    "archivo_url" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."memorias" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."memorias_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."memorias_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."memorias_id_seq" OWNED BY "public"."memorias"."id";



CREATE TABLE IF NOT EXISTS "public"."movimientos_financieros" (
    "id" integer NOT NULL,
    "cuenta_id" integer NOT NULL,
    "tipo" character varying(10) NOT NULL,
    "categoria_id" integer,
    "subcategoria_id" integer,
    "monto" numeric(14,2) NOT NULL,
    "moneda" character varying(3) NOT NULL,
    "fecha" "date" NOT NULL,
    "descripcion" character varying(500) NOT NULL,
    "comprobante_url" "text",
    "referencia" character varying(100),
    "origen_tipo" character varying(30),
    "origen_id" integer,
    "transferencia_id" integer,
    "tags" "text"[],
    "notas" "text",
    "registrado_por" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "nombre" character varying(200),
    "clasificado" boolean DEFAULT false NOT NULL,
    "extracto_id" integer,
    "hash_dedupe" "text",
    CONSTRAINT "movimientos_financieros_moneda_check" CHECK ((("moneda")::"text" = ANY ((ARRAY['UYU'::character varying, 'USD'::character varying])::"text"[]))),
    CONSTRAINT "movimientos_financieros_monto_check" CHECK (("monto" > (0)::numeric)),
    CONSTRAINT "movimientos_financieros_tipo_check" CHECK ((("tipo")::"text" = ANY ((ARRAY['ingreso'::character varying, 'egreso'::character varying])::"text"[])))
);


ALTER TABLE "public"."movimientos_financieros" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."movimientos_financieros_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."movimientos_financieros_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."movimientos_financieros_id_seq" OWNED BY "public"."movimientos_financieros"."id";



CREATE TABLE IF NOT EXISTS "public"."padron_disciplinas" (
    "id" integer NOT NULL,
    "padron_socio_id" integer NOT NULL,
    "disciplina_id" integer NOT NULL,
    "categoria" character varying(100),
    "activa" boolean DEFAULT true,
    "fecha_ingreso" "date" DEFAULT CURRENT_DATE,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."padron_disciplinas" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."padron_disciplinas_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."padron_disciplinas_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."padron_disciplinas_id_seq" OWNED BY "public"."padron_disciplinas"."id";



CREATE TABLE IF NOT EXISTS "public"."padron_socios" (
    "id" integer NOT NULL,
    "nombre" character varying(100) NOT NULL,
    "apellido" character varying(100) NOT NULL,
    "cedula" character varying(20) NOT NULL,
    "fecha_nacimiento" "date",
    "telefono" character varying(20),
    "activo" boolean DEFAULT true NOT NULL,
    "notas" "text",
    "perfil_id" "uuid",
    "vinculado_at" timestamp with time zone,
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "desactivado_at" timestamp with time zone,
    "activo_since" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."padron_socios" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."padron_socios_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."padron_socios_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."padron_socios_id_seq" OWNED BY "public"."padron_socios"."id";



CREATE TABLE IF NOT EXISTS "public"."pagos_mercadopago" (
    "id" integer NOT NULL,
    "tipo_origen" character varying(20) NOT NULL,
    "origen_id" integer NOT NULL,
    "mercadopago_payment_id" "text" NOT NULL,
    "mercadopago_status" character varying(50),
    "mercadopago_status_detail" "text",
    "monto" numeric(10,2) NOT NULL,
    "moneda" character varying(3) DEFAULT 'UYU'::character varying,
    "metodo" character varying(50),
    "raw_data" "jsonb",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "pagos_mercadopago_tipo_origen_check" CHECK ((("tipo_origen")::"text" = ANY ((ARRAY['pedido'::character varying, 'entrada'::character varying])::"text"[])))
);


ALTER TABLE "public"."pagos_mercadopago" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."pagos_mercadopago_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."pagos_mercadopago_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."pagos_mercadopago_id_seq" OWNED BY "public"."pagos_mercadopago"."id";



CREATE TABLE IF NOT EXISTS "public"."pagos_proveedor" (
    "id" integer NOT NULL,
    "proveedor_id" integer NOT NULL,
    "compra_id" integer,
    "monto" numeric(12,2) NOT NULL,
    "moneda" character varying(3) DEFAULT 'UYU'::character varying,
    "metodo_pago" character varying(30) NOT NULL,
    "referencia" "text",
    "notas" "text",
    "registrado_por" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "pagos_proveedor_metodo_pago_check" CHECK ((("metodo_pago")::"text" = ANY ((ARRAY['efectivo'::character varying, 'transferencia'::character varying, 'cheque'::character varying, 'otro'::character varying])::"text"[])))
);


ALTER TABLE "public"."pagos_proveedor" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."pagos_proveedor_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."pagos_proveedor_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."pagos_proveedor_id_seq" OWNED BY "public"."pagos_proveedor"."id";



CREATE TABLE IF NOT EXISTS "public"."pagos_socios" (
    "id" integer NOT NULL,
    "perfil_id" "uuid" NOT NULL,
    "monto" numeric(10,2) NOT NULL,
    "moneda" character varying(3) DEFAULT 'UYU'::character varying,
    "periodo_mes" integer NOT NULL,
    "periodo_anio" integer NOT NULL,
    "metodo_pago" character varying(30) NOT NULL,
    "referencia_pago" "text",
    "registrado_por" "uuid",
    "notas" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "pagos_socios_metodo_pago_check" CHECK ((("metodo_pago")::"text" = ANY ((ARRAY['efectivo'::character varying, 'mercadopago'::character varying, 'transferencia'::character varying])::"text"[]))),
    CONSTRAINT "pagos_socios_periodo_mes_check" CHECK ((("periodo_mes" >= 1) AND ("periodo_mes" <= 12)))
);


ALTER TABLE "public"."pagos_socios" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."pagos_socios_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."pagos_socios_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."pagos_socios_id_seq" OWNED BY "public"."pagos_socios"."id";



CREATE TABLE IF NOT EXISTS "public"."pedido_items" (
    "id" integer NOT NULL,
    "pedido_id" integer NOT NULL,
    "producto_id" integer NOT NULL,
    "variante_id" integer,
    "cantidad" integer NOT NULL,
    "precio_unitario" numeric(10,2) NOT NULL,
    "subtotal" numeric(10,2) NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "descuento_unitario" numeric(10,2) DEFAULT 0,
    "descuento_tipo" character varying(20),
    "es_encargue" boolean DEFAULT false NOT NULL,
    "personalizacion" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "precio_extra_personalizacion" numeric(10,2) DEFAULT 0 NOT NULL,
    "costo_unitario_venta" numeric(10,2),
    CONSTRAINT "pedido_items_cantidad_check" CHECK (("cantidad" > 0)),
    CONSTRAINT "pedido_items_descuento_tipo_check" CHECK ((("descuento_tipo")::"text" = ANY ((ARRAY['porcentaje'::character varying, 'fijo'::character varying, 'socio'::character varying, 'lista_precio'::character varying])::"text"[])))
);


ALTER TABLE "public"."pedido_items" OWNER TO "postgres";


COMMENT ON COLUMN "public"."pedido_items"."costo_unitario_venta" IS 'Snapshot del PPP al momento de crear el item. Base para cálculo de margen.';



CREATE SEQUENCE IF NOT EXISTS "public"."pedido_items_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."pedido_items_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."pedido_items_id_seq" OWNED BY "public"."pedido_items"."id";



CREATE TABLE IF NOT EXISTS "public"."pedidos" (
    "id" integer NOT NULL,
    "numero_pedido" character varying(30),
    "perfil_id" "uuid",
    "tipo" character varying(10) NOT NULL,
    "estado" character varying(30) DEFAULT 'pendiente'::character varying NOT NULL,
    "subtotal" numeric(10,2) NOT NULL,
    "descuento" numeric(10,2) DEFAULT 0,
    "total" numeric(10,2) NOT NULL,
    "moneda" character varying(3) DEFAULT 'UYU'::character varying,
    "metodo_pago" character varying(30),
    "mercadopago_preference_id" "text",
    "mercadopago_payment_id" "text",
    "nombre_cliente" character varying(200),
    "telefono_cliente" character varying(20),
    "notas" "text",
    "vendedor_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "descuento_tipo" character varying(20),
    "descuento_porcentaje" numeric(5,2),
    "descuento_motivo" "text",
    "disciplina_id" integer,
    "stock_reservado" boolean DEFAULT false,
    "stock_reservado_at" timestamp with time zone,
    "idempotency_key" character varying(36),
    "promocode_id" integer,
    "promocode_codigo" character varying(40),
    "aplico_precio_socio" boolean DEFAULT false NOT NULL,
    "monto_efectivo" numeric(10,2),
    "monto_transferencia" numeric(10,2),
    "email_cliente" character varying(255),
    "fecha_venta" timestamp with time zone,
    CONSTRAINT "pedidos_descuento_tipo_check" CHECK ((("descuento_tipo")::"text" = ANY ((ARRAY['porcentaje'::character varying, 'fijo'::character varying, 'socio'::character varying, 'lista_precio'::character varying])::"text"[]))),
    CONSTRAINT "pedidos_estado_check" CHECK ((("estado")::"text" = ANY ((ARRAY['pendiente'::character varying, 'pendiente_verificacion'::character varying, 'pagado'::character varying, 'encargado'::character varying, 'preparando'::character varying, 'listo_retiro'::character varying, 'retirado'::character varying, 'cancelado'::character varying])::"text"[]))),
    CONSTRAINT "pedidos_metodo_pago_check" CHECK ((("metodo_pago")::"text" = ANY ((ARRAY['mercadopago'::character varying, 'efectivo'::character varying, 'mercadopago_qr'::character varying, 'transferencia'::character varying, 'cuenta_corriente'::character varying, 'mixto'::character varying])::"text"[]))),
    CONSTRAINT "pedidos_pago_mixto_check" CHECK (((("metodo_pago")::"text" IS DISTINCT FROM 'mixto'::"text") OR (("monto_efectivo" > (0)::numeric) AND ("monto_transferencia" > (0)::numeric) AND (("monto_efectivo" + "monto_transferencia") = "total")))),
    CONSTRAINT "pedidos_tipo_check" CHECK ((("tipo")::"text" = ANY ((ARRAY['online'::character varying, 'pos'::character varying, 'disciplina'::character varying])::"text"[])))
);


ALTER TABLE "public"."pedidos" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."pedidos_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."pedidos_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."pedidos_id_seq" OWNED BY "public"."pedidos"."id";



CREATE TABLE IF NOT EXISTS "public"."perfil_roles" (
    "id" integer NOT NULL,
    "perfil_id" "uuid" NOT NULL,
    "rol_id" integer NOT NULL,
    "asignado_por" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."perfil_roles" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."perfil_roles_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."perfil_roles_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."perfil_roles_id_seq" OWNED BY "public"."perfil_roles"."id";



CREATE TABLE IF NOT EXISTS "public"."perfiles" (
    "id" "uuid" NOT NULL,
    "nombre" character varying(100) NOT NULL,
    "apellido" character varying(100) NOT NULL,
    "cedula" character varying(20),
    "telefono" character varying(20),
    "fecha_nacimiento" "date",
    "avatar_url" "text",
    "es_socio" boolean DEFAULT false,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "socio_verificado" boolean DEFAULT false,
    "padron_socio_id" integer
);


ALTER TABLE "public"."perfiles" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."popups" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "title" "text",
    "body" "text",
    "image_url" "text",
    "buttons" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "pages" "jsonb" DEFAULT '["*"]'::"jsonb" NOT NULL,
    "starts_at" timestamp with time zone NOT NULL,
    "ends_at" timestamp with time zone NOT NULL,
    "priority" integer DEFAULT 0 NOT NULL,
    "status" "text" DEFAULT 'draft'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_by" "uuid",
    CONSTRAINT "popups_status_check" CHECK (("status" = ANY (ARRAY['draft'::"text", 'published'::"text"])))
);


ALTER TABLE "public"."popups" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."presupuestos" (
    "id" integer NOT NULL,
    "tipo_periodo" character varying(20) NOT NULL,
    "anio" integer NOT NULL,
    "periodo_numero" integer NOT NULL,
    "fecha_desde" "date" NOT NULL,
    "fecha_hasta" "date" NOT NULL,
    "categoria_id" integer NOT NULL,
    "monto" numeric(14,2) NOT NULL,
    "moneda" character varying(3) DEFAULT 'UYU'::character varying NOT NULL,
    "notas" "text",
    "creado_por" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "presupuestos_moneda_check" CHECK ((("moneda")::"text" = ANY ((ARRAY['UYU'::character varying, 'USD'::character varying])::"text"[]))),
    CONSTRAINT "presupuestos_monto_check" CHECK (("monto" >= (0)::numeric)),
    CONSTRAINT "presupuestos_periodo_numero_check" CHECK ((("periodo_numero" >= 1) AND ("periodo_numero" <= 12))),
    CONSTRAINT "presupuestos_tipo_periodo_check" CHECK ((("tipo_periodo")::"text" = ANY ((ARRAY['anual'::character varying, 'semestral'::character varying, 'cuatrimestral'::character varying, 'trimestral'::character varying, 'mensual'::character varying])::"text"[])))
);


ALTER TABLE "public"."presupuestos" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."presupuestos_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."presupuestos_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."presupuestos_id_seq" OWNED BY "public"."presupuestos"."id";



CREATE TABLE IF NOT EXISTS "public"."producto_imagenes" (
    "id" integer NOT NULL,
    "producto_id" integer NOT NULL,
    "url" "text" NOT NULL,
    "alt_text" character varying(200),
    "orden" integer DEFAULT 0,
    "es_principal" boolean DEFAULT false,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "focal_point" "text" DEFAULT '50% 50%'::"text"
);


ALTER TABLE "public"."producto_imagenes" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."producto_imagenes_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."producto_imagenes_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."producto_imagenes_id_seq" OWNED BY "public"."producto_imagenes"."id";



CREATE TABLE IF NOT EXISTS "public"."producto_proveedores" (
    "id" integer NOT NULL,
    "producto_id" integer NOT NULL,
    "proveedor_id" integer NOT NULL,
    "costo" numeric(10,2),
    "codigo_proveedor" character varying(50),
    "es_principal" boolean DEFAULT false,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."producto_proveedores" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."producto_proveedores_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."producto_proveedores_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."producto_proveedores_id_seq" OWNED BY "public"."producto_proveedores"."id";



CREATE TABLE IF NOT EXISTS "public"."producto_variantes" (
    "id" integer NOT NULL,
    "producto_id" integer NOT NULL,
    "nombre" character varying(100) NOT NULL,
    "sku" character varying(50),
    "precio_override" numeric(10,2),
    "stock_actual" integer DEFAULT 0 NOT NULL,
    "atributos" "jsonb" DEFAULT '{}'::"jsonb",
    "activo" boolean DEFAULT true,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "costo_promedio" numeric(10,2)
);


ALTER TABLE "public"."producto_variantes" OWNER TO "postgres";


COMMENT ON COLUMN "public"."producto_variantes"."costo_promedio" IS 'PPP de la variante. Tiene prioridad sobre productos.costo_promedio si está seteado.';



CREATE SEQUENCE IF NOT EXISTS "public"."producto_variantes_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."producto_variantes_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."producto_variantes_id_seq" OWNED BY "public"."producto_variantes"."id";



CREATE TABLE IF NOT EXISTS "public"."productos" (
    "id" integer NOT NULL,
    "nombre" character varying(200) NOT NULL,
    "slug" character varying(200) NOT NULL,
    "descripcion" "text",
    "descripcion_corta" character varying(300),
    "categoria_id" integer,
    "precio" numeric(10,2) NOT NULL,
    "precio_socio" numeric(10,2),
    "moneda" character varying(3) DEFAULT 'UYU'::character varying,
    "sku" character varying(50),
    "stock_actual" integer DEFAULT 0 NOT NULL,
    "stock_minimo" integer DEFAULT 5,
    "peso" numeric(8,2),
    "activo" boolean DEFAULT true,
    "destacado" boolean DEFAULT false,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "unidad" character varying(10) DEFAULT 'un'::character varying NOT NULL,
    "mto_disponible" boolean DEFAULT false NOT NULL,
    "mto_solo" boolean DEFAULT false NOT NULL,
    "mto_tiempo_fabricacion_dias" integer,
    "mto_campos" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "costo_promedio" numeric(10,2),
    "activo_pos" boolean DEFAULT true NOT NULL,
    CONSTRAINT "productos_mto_solo_requiere_disponible" CHECK (((NOT "mto_solo") OR "mto_disponible")),
    CONSTRAINT "productos_unidad_check" CHECK ((("unidad")::"text" = ANY ((ARRAY['un'::character varying, 'kg'::character varying, 'lt'::character varying, 'mt'::character varying, 'par'::character varying, 'docena'::character varying])::"text"[])))
);


ALTER TABLE "public"."productos" OWNER TO "postgres";


COMMENT ON COLUMN "public"."productos"."activo" IS 'Visible en la tienda web';



COMMENT ON COLUMN "public"."productos"."costo_promedio" IS 'Precio Promedio Ponderado actual. Recalculado por trigger al recibir compras. NULL = sin datos.';



COMMENT ON COLUMN "public"."productos"."activo_pos" IS 'Disponible en el punto de venta (POS)';



CREATE SEQUENCE IF NOT EXISTS "public"."productos_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."productos_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."productos_id_seq" OWNED BY "public"."productos"."id";



CREATE TABLE IF NOT EXISTS "public"."promocodes" (
    "id" integer NOT NULL,
    "codigo" character varying(40) NOT NULL,
    "descripcion" "text",
    "tipo_descuento" character varying(15) NOT NULL,
    "valor" numeric(10,2) NOT NULL,
    "fecha_inicio" timestamp with time zone NOT NULL,
    "fecha_fin" timestamp with time zone NOT NULL,
    "acumulable_con_precio_socio" boolean DEFAULT false NOT NULL,
    "monto_minimo" numeric(10,2),
    "usos_max" integer,
    "usos_actuales" integer DEFAULT 0 NOT NULL,
    "activo" boolean DEFAULT true NOT NULL,
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "promocodes_fechas_check" CHECK (("fecha_fin" > "fecha_inicio")),
    CONSTRAINT "promocodes_monto_minimo_positivo" CHECK ((("monto_minimo" IS NULL) OR ("monto_minimo" > (0)::numeric))),
    CONSTRAINT "promocodes_porcentaje_max" CHECK (((("tipo_descuento")::"text" <> 'porcentaje'::"text") OR ("valor" <= (100)::numeric))),
    CONSTRAINT "promocodes_tipo_descuento_check" CHECK ((("tipo_descuento")::"text" = ANY ((ARRAY['porcentaje'::character varying, 'monto_fijo'::character varying])::"text"[]))),
    CONSTRAINT "promocodes_usos_max_positivo" CHECK ((("usos_max" IS NULL) OR ("usos_max" > 0))),
    CONSTRAINT "promocodes_valor_check" CHECK (("valor" > (0)::numeric))
);


ALTER TABLE "public"."promocodes" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."promocodes_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."promocodes_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."promocodes_id_seq" OWNED BY "public"."promocodes"."id";



CREATE TABLE IF NOT EXISTS "public"."proveedores" (
    "id" integer NOT NULL,
    "nombre" character varying(200) NOT NULL,
    "rut" character varying(20),
    "razon_social" character varying(200),
    "contacto_nombre" character varying(100),
    "contacto_telefono" character varying(20),
    "contacto_email" character varying(100),
    "direccion" "text",
    "notas" "text",
    "saldo_cuenta_corriente" numeric(12,2) DEFAULT 0,
    "activo" boolean DEFAULT true,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."proveedores" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."proveedores_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."proveedores_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."proveedores_id_seq" OWNED BY "public"."proveedores"."id";



CREATE TABLE IF NOT EXISTS "public"."roles" (
    "id" integer NOT NULL,
    "nombre" character varying(50) NOT NULL,
    "descripcion" "text"
);


ALTER TABLE "public"."roles" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."roles_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."roles_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."roles_id_seq" OWNED BY "public"."roles"."id";



CREATE TABLE IF NOT EXISTS "public"."staff" (
    "id" integer NOT NULL,
    "nombre" character varying(100) NOT NULL,
    "apellido" character varying(100) NOT NULL,
    "cedula" character varying(20),
    "cargo" character varying(100) NOT NULL,
    "disciplina_id" integer,
    "telefono" character varying(20),
    "email" character varying(100),
    "descripcion" "text",
    "activo" boolean DEFAULT true NOT NULL,
    "fecha_ingreso" "date" DEFAULT CURRENT_DATE,
    "notas" "text",
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."staff" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."staff_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."staff_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."staff_id_seq" OWNED BY "public"."staff"."id";



CREATE TABLE IF NOT EXISTS "public"."stock_deposito" (
    "id" integer NOT NULL,
    "producto_id" integer NOT NULL,
    "variante_id" integer,
    "deposito_id" integer NOT NULL,
    "cantidad" integer DEFAULT 0 NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "stock_deposito_cantidad_check" CHECK (("cantidad" >= 0))
);


ALTER TABLE "public"."stock_deposito" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."stock_deposito_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."stock_deposito_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."stock_deposito_id_seq" OWNED BY "public"."stock_deposito"."id";



CREATE TABLE IF NOT EXISTS "public"."stock_movimientos" (
    "id" integer NOT NULL,
    "producto_id" integer NOT NULL,
    "variante_id" integer,
    "tipo" character varying(20) NOT NULL,
    "cantidad" integer NOT NULL,
    "stock_anterior" integer NOT NULL,
    "stock_nuevo" integer NOT NULL,
    "referencia_tipo" character varying(20),
    "referencia_id" integer,
    "motivo" "text",
    "registrado_por" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "deposito_id" integer,
    CONSTRAINT "stock_movimientos_tipo_check" CHECK ((("tipo")::"text" = ANY ((ARRAY['entrada'::character varying, 'salida'::character varying, 'ajuste'::character varying, 'venta'::character varying, 'devolucion'::character varying, 'transferencia'::character varying])::"text"[])))
);


ALTER TABLE "public"."stock_movimientos" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."stock_movimientos_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."stock_movimientos_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."stock_movimientos_id_seq" OWNED BY "public"."stock_movimientos"."id";



CREATE TABLE IF NOT EXISTS "public"."tesoreria_historial" (
    "id" bigint NOT NULL,
    "entidad" character varying(30) NOT NULL,
    "entidad_id" integer NOT NULL,
    "accion" character varying(20) NOT NULL,
    "antes" "jsonb",
    "despues" "jsonb",
    "motivo" "text",
    "origen" character varying(20) DEFAULT 'panel'::character varying NOT NULL,
    "usuario_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "tesoreria_historial_accion_check" CHECK ((("accion")::"text" = ANY ((ARRAY['editar'::character varying, 'eliminar'::character varying])::"text"[]))),
    CONSTRAINT "tesoreria_historial_entidad_check" CHECK ((("entidad")::"text" = ANY ((ARRAY['movimiento'::character varying, 'cuenta'::character varying])::"text"[])))
);


ALTER TABLE "public"."tesoreria_historial" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."tesoreria_historial_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."tesoreria_historial_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."tesoreria_historial_id_seq" OWNED BY "public"."tesoreria_historial"."id";



CREATE TABLE IF NOT EXISTS "public"."tipo_entradas" (
    "id" integer NOT NULL,
    "evento_id" integer NOT NULL,
    "nombre" character varying(100) NOT NULL,
    "descripcion" "text",
    "precio" numeric(10,2) DEFAULT 0 NOT NULL,
    "moneda" character varying(3) DEFAULT 'UYU'::character varying,
    "capacidad" integer,
    "solo_socios" boolean DEFAULT false,
    "orden" integer DEFAULT 0,
    "activo" boolean DEFAULT true,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."tipo_entradas" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."tipo_entradas_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."tipo_entradas_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."tipo_entradas_id_seq" OWNED BY "public"."tipo_entradas"."id";



CREATE TABLE IF NOT EXISTS "public"."transferencia_items" (
    "id" integer NOT NULL,
    "transferencia_id" integer NOT NULL,
    "producto_id" integer NOT NULL,
    "variante_id" integer,
    "cantidad" integer NOT NULL,
    CONSTRAINT "transferencia_items_cantidad_check" CHECK (("cantidad" > 0))
);


ALTER TABLE "public"."transferencia_items" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."transferencia_items_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."transferencia_items_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."transferencia_items_id_seq" OWNED BY "public"."transferencia_items"."id";



CREATE TABLE IF NOT EXISTS "public"."transferencias_deposito" (
    "id" integer NOT NULL,
    "deposito_origen_id" integer NOT NULL,
    "deposito_destino_id" integer NOT NULL,
    "estado" character varying(20) DEFAULT 'pendiente'::character varying NOT NULL,
    "notas" "text",
    "registrado_por" "uuid",
    "completada_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "transferencias_deposito_check" CHECK (("deposito_origen_id" <> "deposito_destino_id")),
    CONSTRAINT "transferencias_deposito_estado_check" CHECK ((("estado")::"text" = ANY ((ARRAY['pendiente'::character varying, 'completada'::character varying, 'cancelada'::character varying])::"text"[])))
);


ALTER TABLE "public"."transferencias_deposito" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."transferencias_deposito_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."transferencias_deposito_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."transferencias_deposito_id_seq" OWNED BY "public"."transferencias_deposito"."id";



CREATE TABLE IF NOT EXISTS "public"."transferencias_internas" (
    "id" integer NOT NULL,
    "cuenta_origen_id" integer NOT NULL,
    "cuenta_destino_id" integer NOT NULL,
    "fecha" "date" NOT NULL,
    "monto_origen" numeric(14,2) NOT NULL,
    "moneda_origen" character varying(3) NOT NULL,
    "monto_destino" numeric(14,2) NOT NULL,
    "moneda_destino" character varying(3) NOT NULL,
    "tipo_cambio" numeric(10,4),
    "descripcion" character varying(500),
    "movimiento_egreso_id" integer,
    "movimiento_ingreso_id" integer,
    "registrado_por" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "transferencias_internas_check" CHECK (("cuenta_origen_id" <> "cuenta_destino_id")),
    CONSTRAINT "transferencias_internas_moneda_destino_check" CHECK ((("moneda_destino")::"text" = ANY ((ARRAY['UYU'::character varying, 'USD'::character varying])::"text"[]))),
    CONSTRAINT "transferencias_internas_moneda_origen_check" CHECK ((("moneda_origen")::"text" = ANY ((ARRAY['UYU'::character varying, 'USD'::character varying])::"text"[]))),
    CONSTRAINT "transferencias_internas_monto_destino_check" CHECK (("monto_destino" > (0)::numeric)),
    CONSTRAINT "transferencias_internas_monto_origen_check" CHECK (("monto_origen" > (0)::numeric))
);


ALTER TABLE "public"."transferencias_internas" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."transferencias_internas_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."transferencias_internas_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."transferencias_internas_id_seq" OWNED BY "public"."transferencias_internas"."id";



ALTER TABLE ONLY "public"."categorias_financieras" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."categorias_financieras_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."categorias_producto" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."categorias_producto_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."compra_items" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."compra_items_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."compras_proveedor" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."compras_proveedor_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."comprobantes" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."comprobantes_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."contenido_paginas" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."contenido_paginas_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."cotizaciones_bcu" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."cotizaciones_bcu_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."cuentas_financieras" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."cuentas_financieras_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."depositos" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."depositos_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."disciplinas" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."disciplinas_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."donaciones" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."donaciones_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."donaciones_transferencias" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."donaciones_transferencias_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."entradas" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."entradas_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."escaneos_entrada" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."escaneos_entrada_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."eventos" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."eventos_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."extractos_importados" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."extractos_importados_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."lista_precio_disciplinas" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."lista_precio_disciplinas_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."lista_precio_items" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."lista_precio_items_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."listas_precio" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."listas_precio_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."lotes_entrada" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."lotes_entrada_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."memorias" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."memorias_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."movimientos_financieros" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."movimientos_financieros_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."padron_disciplinas" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."padron_disciplinas_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."padron_socios" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."padron_socios_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."pagos_mercadopago" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."pagos_mercadopago_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."pagos_proveedor" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."pagos_proveedor_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."pagos_socios" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."pagos_socios_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."pedido_items" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."pedido_items_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."pedidos" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."pedidos_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."perfil_roles" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."perfil_roles_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."presupuestos" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."presupuestos_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."producto_imagenes" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."producto_imagenes_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."producto_proveedores" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."producto_proveedores_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."producto_variantes" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."producto_variantes_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."productos" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."productos_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."promocodes" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."promocodes_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."proveedores" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."proveedores_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."roles" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."roles_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."staff" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."staff_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."stock_deposito" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."stock_deposito_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."stock_movimientos" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."stock_movimientos_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."tesoreria_historial" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."tesoreria_historial_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."tipo_entradas" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."tipo_entradas_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."transferencia_items" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."transferencia_items_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."transferencias_deposito" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."transferencias_deposito_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."transferencias_internas" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."transferencias_internas_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."categorias_financieras"
    ADD CONSTRAINT "categorias_financieras_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."categorias_financieras"
    ADD CONSTRAINT "categorias_financieras_slug_key" UNIQUE ("slug");



ALTER TABLE ONLY "public"."categorias_producto"
    ADD CONSTRAINT "categorias_producto_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."categorias_producto"
    ADD CONSTRAINT "categorias_producto_slug_key" UNIQUE ("slug");



ALTER TABLE ONLY "public"."compra_items"
    ADD CONSTRAINT "compra_items_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."compras_proveedor"
    ADD CONSTRAINT "compras_proveedor_numero_compra_key" UNIQUE ("numero_compra");



ALTER TABLE ONLY "public"."compras_proveedor"
    ADD CONSTRAINT "compras_proveedor_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."comprobantes"
    ADD CONSTRAINT "comprobantes_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."contenido_paginas"
    ADD CONSTRAINT "contenido_paginas_pagina_seccion_key" UNIQUE ("pagina", "seccion");



ALTER TABLE ONLY "public"."contenido_paginas"
    ADD CONSTRAINT "contenido_paginas_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."cotizaciones_bcu"
    ADD CONSTRAINT "cotizaciones_bcu_fecha_key" UNIQUE ("fecha");



ALTER TABLE ONLY "public"."cotizaciones_bcu"
    ADD CONSTRAINT "cotizaciones_bcu_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."cuentas_financieras"
    ADD CONSTRAINT "cuentas_financieras_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."depositos"
    ADD CONSTRAINT "depositos_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."disciplinas"
    ADD CONSTRAINT "disciplinas_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."disciplinas"
    ADD CONSTRAINT "disciplinas_slug_key" UNIQUE ("slug");



ALTER TABLE ONLY "public"."donaciones_config"
    ADD CONSTRAINT "donaciones_config_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."donaciones"
    ADD CONSTRAINT "donaciones_pedido_id_key" UNIQUE ("pedido_id");



ALTER TABLE ONLY "public"."donaciones"
    ADD CONSTRAINT "donaciones_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."donaciones_transferencias"
    ADD CONSTRAINT "donaciones_transferencias_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."entradas"
    ADD CONSTRAINT "entradas_codigo_key" UNIQUE ("codigo");



ALTER TABLE ONLY "public"."entradas"
    ADD CONSTRAINT "entradas_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."escaneos_entrada"
    ADD CONSTRAINT "escaneos_entrada_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."eventos"
    ADD CONSTRAINT "eventos_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."eventos"
    ADD CONSTRAINT "eventos_slug_key" UNIQUE ("slug");



ALTER TABLE ONLY "public"."extractos_importados"
    ADD CONSTRAINT "extractos_importados_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."lista_precio_disciplinas"
    ADD CONSTRAINT "lista_precio_disciplinas_lista_precio_id_disciplina_id_key" UNIQUE ("lista_precio_id", "disciplina_id");



ALTER TABLE ONLY "public"."lista_precio_disciplinas"
    ADD CONSTRAINT "lista_precio_disciplinas_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."lista_precio_items"
    ADD CONSTRAINT "lista_precio_items_lista_precio_id_producto_id_variante_id_key" UNIQUE ("lista_precio_id", "producto_id", "variante_id");



ALTER TABLE ONLY "public"."lista_precio_items"
    ADD CONSTRAINT "lista_precio_items_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."listas_precio"
    ADD CONSTRAINT "listas_precio_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."lotes_entrada"
    ADD CONSTRAINT "lotes_entrada_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."memorias"
    ADD CONSTRAINT "memorias_anio_key" UNIQUE ("anio");



ALTER TABLE ONLY "public"."memorias"
    ADD CONSTRAINT "memorias_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."movimientos_financieros"
    ADD CONSTRAINT "movimientos_financieros_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."padron_disciplinas"
    ADD CONSTRAINT "padron_disciplinas_padron_socio_id_disciplina_id_categoria_key" UNIQUE ("padron_socio_id", "disciplina_id", "categoria");



ALTER TABLE ONLY "public"."padron_disciplinas"
    ADD CONSTRAINT "padron_disciplinas_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."padron_socios"
    ADD CONSTRAINT "padron_socios_cedula_key" UNIQUE ("cedula");



ALTER TABLE ONLY "public"."padron_socios"
    ADD CONSTRAINT "padron_socios_perfil_id_key" UNIQUE ("perfil_id");



ALTER TABLE ONLY "public"."padron_socios"
    ADD CONSTRAINT "padron_socios_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."pagos_mercadopago"
    ADD CONSTRAINT "pagos_mercadopago_mercadopago_payment_id_key" UNIQUE ("mercadopago_payment_id");



ALTER TABLE ONLY "public"."pagos_mercadopago"
    ADD CONSTRAINT "pagos_mercadopago_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."pagos_proveedor"
    ADD CONSTRAINT "pagos_proveedor_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."pagos_socios"
    ADD CONSTRAINT "pagos_socios_perfil_id_periodo_mes_periodo_anio_key" UNIQUE ("perfil_id", "periodo_mes", "periodo_anio");



ALTER TABLE ONLY "public"."pagos_socios"
    ADD CONSTRAINT "pagos_socios_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."pedido_items"
    ADD CONSTRAINT "pedido_items_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."pedidos"
    ADD CONSTRAINT "pedidos_numero_pedido_key" UNIQUE ("numero_pedido");



ALTER TABLE ONLY "public"."pedidos"
    ADD CONSTRAINT "pedidos_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."perfil_roles"
    ADD CONSTRAINT "perfil_roles_perfil_id_rol_id_key" UNIQUE ("perfil_id", "rol_id");



ALTER TABLE ONLY "public"."perfil_roles"
    ADD CONSTRAINT "perfil_roles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."perfiles"
    ADD CONSTRAINT "perfiles_cedula_key" UNIQUE ("cedula");



ALTER TABLE ONLY "public"."perfiles"
    ADD CONSTRAINT "perfiles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."popups"
    ADD CONSTRAINT "popups_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."presupuestos"
    ADD CONSTRAINT "presupuestos_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."presupuestos"
    ADD CONSTRAINT "presupuestos_tipo_periodo_anio_periodo_numero_categoria_id__key" UNIQUE ("tipo_periodo", "anio", "periodo_numero", "categoria_id", "moneda");



ALTER TABLE ONLY "public"."producto_imagenes"
    ADD CONSTRAINT "producto_imagenes_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."producto_proveedores"
    ADD CONSTRAINT "producto_proveedores_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."producto_proveedores"
    ADD CONSTRAINT "producto_proveedores_producto_id_proveedor_id_key" UNIQUE ("producto_id", "proveedor_id");



ALTER TABLE ONLY "public"."producto_variantes"
    ADD CONSTRAINT "producto_variantes_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."producto_variantes"
    ADD CONSTRAINT "producto_variantes_sku_key" UNIQUE ("sku");



ALTER TABLE ONLY "public"."productos"
    ADD CONSTRAINT "productos_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."productos"
    ADD CONSTRAINT "productos_sku_key" UNIQUE ("sku");



ALTER TABLE ONLY "public"."productos"
    ADD CONSTRAINT "productos_slug_key" UNIQUE ("slug");



ALTER TABLE ONLY "public"."promocodes"
    ADD CONSTRAINT "promocodes_codigo_key" UNIQUE ("codigo");



ALTER TABLE ONLY "public"."promocodes"
    ADD CONSTRAINT "promocodes_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."proveedores"
    ADD CONSTRAINT "proveedores_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."proveedores"
    ADD CONSTRAINT "proveedores_rut_key" UNIQUE ("rut");



ALTER TABLE ONLY "public"."roles"
    ADD CONSTRAINT "roles_nombre_key" UNIQUE ("nombre");



ALTER TABLE ONLY "public"."roles"
    ADD CONSTRAINT "roles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."staff"
    ADD CONSTRAINT "staff_cedula_key" UNIQUE ("cedula");



ALTER TABLE ONLY "public"."staff"
    ADD CONSTRAINT "staff_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."stock_deposito"
    ADD CONSTRAINT "stock_deposito_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."stock_deposito"
    ADD CONSTRAINT "stock_deposito_producto_id_variante_id_deposito_id_key" UNIQUE ("producto_id", "variante_id", "deposito_id");



ALTER TABLE ONLY "public"."stock_movimientos"
    ADD CONSTRAINT "stock_movimientos_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."tesoreria_historial"
    ADD CONSTRAINT "tesoreria_historial_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."tipo_entradas"
    ADD CONSTRAINT "tipo_entradas_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."transferencia_items"
    ADD CONSTRAINT "transferencia_items_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."transferencias_deposito"
    ADD CONSTRAINT "transferencias_deposito_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."transferencias_internas"
    ADD CONSTRAINT "transferencias_internas_pkey" PRIMARY KEY ("id");



CREATE UNIQUE INDEX "entradas_perfil_idempotency_key_uniq" ON "public"."entradas" USING "btree" ("perfil_id", "idempotency_key") WHERE ("idempotency_key" IS NOT NULL);



CREATE INDEX "idx_categorias_fin_padre" ON "public"."categorias_financieras" USING "btree" ("padre_id");



CREATE INDEX "idx_categorias_fin_tipo" ON "public"."categorias_financieras" USING "btree" ("tipo") WHERE ("activa" = true);



CREATE INDEX "idx_compras_proveedor" ON "public"."compras_proveedor" USING "btree" ("proveedor_id");



CREATE INDEX "idx_comprobantes_pedido_id" ON "public"."comprobantes" USING "btree" ("pedido_id");



CREATE INDEX "idx_cotizaciones_bcu_fecha" ON "public"."cotizaciones_bcu" USING "btree" ("fecha" DESC);



CREATE INDEX "idx_cuentas_financieras_modulo" ON "public"."cuentas_financieras" USING "btree" ("modulo") WHERE ("modulo" IS NOT NULL);



CREATE INDEX "idx_donaciones_estado" ON "public"."donaciones" USING "btree" ("estado");



CREATE INDEX "idx_donaciones_pedido" ON "public"."donaciones" USING "btree" ("pedido_id");



CREATE INDEX "idx_donaciones_pendientes" ON "public"."donaciones" USING "btree" ("estado", "transferencia_id") WHERE ((("estado")::"text" = 'cobrada'::"text") AND ("transferencia_id" IS NULL));



CREATE INDEX "idx_donaciones_transferencia" ON "public"."donaciones" USING "btree" ("transferencia_id") WHERE ("transferencia_id" IS NOT NULL);



CREATE INDEX "idx_donaciones_transferencias_fecha" ON "public"."donaciones_transferencias" USING "btree" ("fecha_transferencia" DESC);



CREATE INDEX "idx_entradas_codigo" ON "public"."entradas" USING "btree" ("codigo");



CREATE INDEX "idx_entradas_evento" ON "public"."entradas" USING "btree" ("evento_id");



CREATE INDEX "idx_entradas_perfil" ON "public"."entradas" USING "btree" ("perfil_id");



CREATE INDEX "idx_eventos_fecha" ON "public"."eventos" USING "btree" ("fecha_inicio") WHERE (("estado")::"text" = 'publicado'::"text");



CREATE INDEX "idx_eventos_slug" ON "public"."eventos" USING "btree" ("slug");



CREATE UNIQUE INDEX "idx_extractos_archivo_hash" ON "public"."extractos_importados" USING "btree" ("cuenta_id", "archivo_hash");



CREATE INDEX "idx_extractos_cuenta" ON "public"."extractos_importados" USING "btree" ("cuenta_id", "created_at" DESC);



CREATE INDEX "idx_lista_precio_disciplinas_disciplina" ON "public"."lista_precio_disciplinas" USING "btree" ("disciplina_id");



CREATE INDEX "idx_lista_precio_items_producto" ON "public"."lista_precio_items" USING "btree" ("producto_id");



CREATE INDEX "idx_lotes_entrada_tipo" ON "public"."lotes_entrada" USING "btree" ("tipo_entrada_id");



CREATE INDEX "idx_movimientos_categoria" ON "public"."movimientos_financieros" USING "btree" ("categoria_id");



CREATE INDEX "idx_movimientos_cuenta" ON "public"."movimientos_financieros" USING "btree" ("cuenta_id");



CREATE INDEX "idx_movimientos_extracto" ON "public"."movimientos_financieros" USING "btree" ("extracto_id") WHERE ("extracto_id" IS NOT NULL);



CREATE INDEX "idx_movimientos_fecha" ON "public"."movimientos_financieros" USING "btree" ("fecha" DESC);



CREATE UNIQUE INDEX "idx_movimientos_hash_dedupe" ON "public"."movimientos_financieros" USING "btree" ("cuenta_id", "hash_dedupe") WHERE ("hash_dedupe" IS NOT NULL);



CREATE INDEX "idx_movimientos_origen" ON "public"."movimientos_financieros" USING "btree" ("origen_tipo", "origen_id");



CREATE INDEX "idx_movimientos_tipo" ON "public"."movimientos_financieros" USING "btree" ("tipo");



CREATE INDEX "idx_padron_activo" ON "public"."padron_socios" USING "btree" ("activo");



CREATE INDEX "idx_padron_cedula" ON "public"."padron_socios" USING "btree" ("cedula");



CREATE INDEX "idx_padron_disciplinas_socio" ON "public"."padron_disciplinas" USING "btree" ("padron_socio_id");



CREATE INDEX "idx_padron_perfil" ON "public"."padron_socios" USING "btree" ("perfil_id") WHERE ("perfil_id" IS NOT NULL);



CREATE INDEX "idx_pagos_proveedor" ON "public"."pagos_proveedor" USING "btree" ("proveedor_id");



CREATE INDEX "idx_pagos_socios_perfil" ON "public"."pagos_socios" USING "btree" ("perfil_id");



CREATE INDEX "idx_pedido_items_pedido_id" ON "public"."pedido_items" USING "btree" ("pedido_id");



CREATE INDEX "idx_pedidos_created_at" ON "public"."pedidos" USING "btree" ("created_at");



CREATE INDEX "idx_pedidos_disciplina" ON "public"."pedidos" USING "btree" ("disciplina_id") WHERE ("disciplina_id" IS NOT NULL);



CREATE INDEX "idx_pedidos_estado" ON "public"."pedidos" USING "btree" ("estado");



CREATE INDEX "idx_pedidos_fecha" ON "public"."pedidos" USING "btree" ("created_at" DESC);



CREATE INDEX "idx_pedidos_fecha_venta" ON "public"."pedidos" USING "btree" ("fecha_venta") WHERE ("fecha_venta" IS NOT NULL);



CREATE INDEX "idx_pedidos_perfil" ON "public"."pedidos" USING "btree" ("perfil_id");



CREATE INDEX "idx_pedidos_promocode_id" ON "public"."pedidos" USING "btree" ("promocode_id") WHERE ("promocode_id" IS NOT NULL);



CREATE INDEX "idx_perfil_roles_perfil" ON "public"."perfil_roles" USING "btree" ("perfil_id");



CREATE INDEX "idx_perfiles_padron_socio" ON "public"."perfiles" USING "btree" ("padron_socio_id") WHERE ("padron_socio_id" IS NOT NULL);



CREATE INDEX "idx_presupuestos_categoria" ON "public"."presupuestos" USING "btree" ("categoria_id");



CREATE INDEX "idx_presupuestos_fechas" ON "public"."presupuestos" USING "btree" ("fecha_desde", "fecha_hasta");



CREATE INDEX "idx_presupuestos_periodo" ON "public"."presupuestos" USING "btree" ("anio", "tipo_periodo", "periodo_numero");



CREATE INDEX "idx_productos_categoria" ON "public"."productos" USING "btree" ("categoria_id") WHERE ("activo" = true);



CREATE INDEX "idx_productos_slug" ON "public"."productos" USING "btree" ("slug");



CREATE INDEX "idx_promocodes_activo" ON "public"."promocodes" USING "btree" ("activo") WHERE "activo";



CREATE INDEX "idx_promocodes_codigo" ON "public"."promocodes" USING "btree" ("codigo");



CREATE INDEX "idx_staff_activo" ON "public"."staff" USING "btree" ("activo");



CREATE INDEX "idx_staff_cedula" ON "public"."staff" USING "btree" ("cedula") WHERE ("cedula" IS NOT NULL);



CREATE INDEX "idx_staff_disciplina" ON "public"."staff" USING "btree" ("disciplina_id");



CREATE INDEX "idx_stock_deposito_deposito" ON "public"."stock_deposito" USING "btree" ("deposito_id");



CREATE INDEX "idx_stock_deposito_producto" ON "public"."stock_deposito" USING "btree" ("producto_id", "deposito_id");



CREATE INDEX "idx_stock_movimientos_producto" ON "public"."stock_movimientos" USING "btree" ("producto_id");



CREATE INDEX "idx_tesoreria_historial_entidad" ON "public"."tesoreria_historial" USING "btree" ("entidad", "entidad_id", "created_at" DESC);



CREATE INDEX "idx_tesoreria_historial_fecha" ON "public"."tesoreria_historial" USING "btree" ("created_at" DESC);



CREATE INDEX "idx_transferencias_destino" ON "public"."transferencias_deposito" USING "btree" ("deposito_destino_id");



CREATE INDEX "idx_transferencias_estado" ON "public"."transferencias_deposito" USING "btree" ("estado");



CREATE INDEX "idx_transferencias_fecha" ON "public"."transferencias_internas" USING "btree" ("fecha" DESC);



CREATE INDEX "idx_transferencias_origen" ON "public"."transferencias_deposito" USING "btree" ("deposito_origen_id");



CREATE UNIQUE INDEX "pedidos_perfil_idempotency_key_uniq" ON "public"."pedidos" USING "btree" ("perfil_id", "idempotency_key") WHERE ("idempotency_key" IS NOT NULL);



CREATE INDEX "popups_active_idx" ON "public"."popups" USING "btree" ("status", "starts_at", "ends_at");



CREATE INDEX "popups_priority_idx" ON "public"."popups" USING "btree" ("priority" DESC, "updated_at" DESC);



CREATE INDEX "productos_mto_idx" ON "public"."productos" USING "btree" ("mto_disponible") WHERE ("mto_disponible" = true);



CREATE OR REPLACE TRIGGER "on_compra_confirmada" AFTER UPDATE ON "public"."compras_proveedor" FOR EACH ROW EXECUTE FUNCTION "public"."actualizar_deuda_compra"();



CREATE OR REPLACE TRIGGER "on_movimiento_financiero" AFTER INSERT OR DELETE ON "public"."movimientos_financieros" FOR EACH ROW EXECUTE FUNCTION "public"."actualizar_saldo_cuenta"();



CREATE OR REPLACE TRIGGER "on_padron_socio_deleted" BEFORE DELETE ON "public"."padron_socios" FOR EACH ROW EXECUTE FUNCTION "public"."handle_padron_socio_deleted"();



CREATE OR REPLACE TRIGGER "on_pago_proveedor" AFTER INSERT ON "public"."pagos_proveedor" FOR EACH ROW EXECUTE FUNCTION "public"."actualizar_saldo_proveedor"();



CREATE OR REPLACE TRIGGER "popups_set_updated_at" BEFORE UPDATE ON "public"."popups" FOR EACH ROW EXECUTE FUNCTION "public"."popups_set_updated_at"();



CREATE OR REPLACE TRIGGER "promocodes_normalize_codigo_trigger" BEFORE INSERT OR UPDATE OF "codigo" ON "public"."promocodes" FOR EACH ROW EXECUTE FUNCTION "public"."promocodes_normalize_codigo"();



CREATE OR REPLACE TRIGGER "promocodes_updated_at" BEFORE UPDATE ON "public"."promocodes" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at"();



CREATE OR REPLACE TRIGGER "set_comprobantes_updated_at" BEFORE UPDATE ON "public"."comprobantes" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at"();



CREATE OR REPLACE TRIGGER "set_numero_pedido" BEFORE INSERT ON "public"."pedidos" FOR EACH ROW WHEN (("new"."numero_pedido" IS NULL)) EXECUTE FUNCTION "public"."generar_numero_pedido"();



CREATE OR REPLACE TRIGGER "set_updated_at_compras" BEFORE UPDATE ON "public"."compras_proveedor" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at"();



CREATE OR REPLACE TRIGGER "set_updated_at_entradas" BEFORE UPDATE ON "public"."entradas" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at"();



CREATE OR REPLACE TRIGGER "set_updated_at_eventos" BEFORE UPDATE ON "public"."eventos" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at"();



CREATE OR REPLACE TRIGGER "set_updated_at_padron_socios" BEFORE UPDATE ON "public"."padron_socios" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at"();



CREATE OR REPLACE TRIGGER "set_updated_at_pagos_mp" BEFORE UPDATE ON "public"."pagos_mercadopago" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at"();



CREATE OR REPLACE TRIGGER "set_updated_at_pedidos" BEFORE UPDATE ON "public"."pedidos" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at"();



CREATE OR REPLACE TRIGGER "set_updated_at_perfiles" BEFORE UPDATE ON "public"."perfiles" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at"();



CREATE OR REPLACE TRIGGER "set_updated_at_productos" BEFORE UPDATE ON "public"."productos" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at"();



CREATE OR REPLACE TRIGGER "set_updated_at_proveedores" BEFORE UPDATE ON "public"."proveedores" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at"();



CREATE OR REPLACE TRIGGER "set_updated_at_staff" BEFORE UPDATE ON "public"."staff" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at"();



CREATE OR REPLACE TRIGGER "trg_compra_recibida_actualiza_ppp" AFTER UPDATE OF "estado" ON "public"."compras_proveedor" FOR EACH ROW EXECUTE FUNCTION "public"."trg_fn_compra_recibida_actualiza_ppp"();



CREATE OR REPLACE TRIGGER "trg_desconciliar_movimiento" BEFORE UPDATE ON "public"."movimientos_financieros" FOR EACH ROW EXECUTE FUNCTION "public"."desconciliar_si_cambia_monto"();



CREATE OR REPLACE TRIGGER "trg_historial_movimiento" AFTER DELETE OR UPDATE ON "public"."movimientos_financieros" FOR EACH ROW EXECUTE FUNCTION "public"."registrar_historial_movimiento"();



CREATE OR REPLACE TRIGGER "trg_pedido_disciplina_saldo" AFTER INSERT ON "public"."pedidos" FOR EACH ROW WHEN ((("new"."tipo")::"text" = 'disciplina'::"text")) EXECUTE FUNCTION "public"."actualizar_saldo_disciplina"();



CREATE OR REPLACE TRIGGER "trg_pedido_disciplina_saldo_delete" AFTER DELETE ON "public"."pedidos" FOR EACH ROW WHEN ((("old"."tipo")::"text" = 'disciplina'::"text")) EXECUTE FUNCTION "public"."revertir_saldo_disciplina"();



CREATE OR REPLACE TRIGGER "trg_pedido_item_snapshot_costo" BEFORE INSERT ON "public"."pedido_items" FOR EACH ROW EXECUTE FUNCTION "public"."trg_fn_pedido_item_snapshot_costo"();



CREATE OR REPLACE TRIGGER "trg_pedidos_fecha_venta" BEFORE INSERT OR UPDATE OF "estado" ON "public"."pedidos" FOR EACH ROW EXECUTE FUNCTION "public"."trg_fn_pedidos_fecha_venta"();



CREATE OR REPLACE TRIGGER "trg_presupuestos_updated_at" BEFORE UPDATE ON "public"."presupuestos" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_sync_stock_producto_variantes" AFTER INSERT OR DELETE OR UPDATE OF "stock_actual", "activo" ON "public"."producto_variantes" FOR EACH ROW EXECUTE FUNCTION "public"."trg_fn_sync_stock_producto_variantes"();



ALTER TABLE ONLY "public"."categorias_financieras"
    ADD CONSTRAINT "categorias_financieras_padre_id_fkey" FOREIGN KEY ("padre_id") REFERENCES "public"."categorias_financieras"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."compra_items"
    ADD CONSTRAINT "compra_items_compra_id_fkey" FOREIGN KEY ("compra_id") REFERENCES "public"."compras_proveedor"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."compra_items"
    ADD CONSTRAINT "compra_items_producto_id_fkey" FOREIGN KEY ("producto_id") REFERENCES "public"."productos"("id");



ALTER TABLE ONLY "public"."compra_items"
    ADD CONSTRAINT "compra_items_variante_id_fkey" FOREIGN KEY ("variante_id") REFERENCES "public"."producto_variantes"("id");



ALTER TABLE ONLY "public"."compras_proveedor"
    ADD CONSTRAINT "compras_proveedor_proveedor_id_fkey" FOREIGN KEY ("proveedor_id") REFERENCES "public"."proveedores"("id");



ALTER TABLE ONLY "public"."compras_proveedor"
    ADD CONSTRAINT "compras_proveedor_registrado_por_fkey" FOREIGN KEY ("registrado_por") REFERENCES "public"."perfiles"("id");



ALTER TABLE ONLY "public"."comprobantes"
    ADD CONSTRAINT "comprobantes_pedido_id_fkey" FOREIGN KEY ("pedido_id") REFERENCES "public"."pedidos"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."comprobantes"
    ADD CONSTRAINT "comprobantes_verificado_por_fkey" FOREIGN KEY ("verificado_por") REFERENCES "public"."perfiles"("id");



ALTER TABLE ONLY "public"."contenido_paginas"
    ADD CONSTRAINT "contenido_paginas_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "public"."perfiles"("id");



ALTER TABLE ONLY "public"."donaciones_config"
    ADD CONSTRAINT "donaciones_config_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "public"."perfiles"("id");



ALTER TABLE ONLY "public"."donaciones"
    ADD CONSTRAINT "donaciones_pedido_id_fkey" FOREIGN KEY ("pedido_id") REFERENCES "public"."pedidos"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."donaciones"
    ADD CONSTRAINT "donaciones_transferencia_id_fkey" FOREIGN KEY ("transferencia_id") REFERENCES "public"."donaciones_transferencias"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."donaciones_transferencias"
    ADD CONSTRAINT "donaciones_transferencias_creado_por_fkey" FOREIGN KEY ("creado_por") REFERENCES "public"."perfiles"("id");



ALTER TABLE ONLY "public"."entradas"
    ADD CONSTRAINT "entradas_evento_id_fkey" FOREIGN KEY ("evento_id") REFERENCES "public"."eventos"("id");



ALTER TABLE ONLY "public"."entradas"
    ADD CONSTRAINT "entradas_lote_id_fkey" FOREIGN KEY ("lote_id") REFERENCES "public"."lotes_entrada"("id");



ALTER TABLE ONLY "public"."entradas"
    ADD CONSTRAINT "entradas_perfil_id_fkey" FOREIGN KEY ("perfil_id") REFERENCES "public"."perfiles"("id");



ALTER TABLE ONLY "public"."entradas"
    ADD CONSTRAINT "entradas_tipo_entrada_id_fkey" FOREIGN KEY ("tipo_entrada_id") REFERENCES "public"."tipo_entradas"("id");



ALTER TABLE ONLY "public"."entradas"
    ADD CONSTRAINT "entradas_usado_por_fkey" FOREIGN KEY ("usado_por") REFERENCES "public"."perfiles"("id");



ALTER TABLE ONLY "public"."escaneos_entrada"
    ADD CONSTRAINT "escaneos_entrada_entrada_id_fkey" FOREIGN KEY ("entrada_id") REFERENCES "public"."entradas"("id");



ALTER TABLE ONLY "public"."escaneos_entrada"
    ADD CONSTRAINT "escaneos_entrada_escaneado_por_fkey" FOREIGN KEY ("escaneado_por") REFERENCES "public"."perfiles"("id");



ALTER TABLE ONLY "public"."escaneos_entrada"
    ADD CONSTRAINT "escaneos_entrada_evento_id_fkey" FOREIGN KEY ("evento_id") REFERENCES "public"."eventos"("id");



ALTER TABLE ONLY "public"."eventos"
    ADD CONSTRAINT "eventos_creado_por_fkey" FOREIGN KEY ("creado_por") REFERENCES "public"."perfiles"("id");



ALTER TABLE ONLY "public"."extractos_importados"
    ADD CONSTRAINT "extractos_importados_cuenta_id_fkey" FOREIGN KEY ("cuenta_id") REFERENCES "public"."cuentas_financieras"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."extractos_importados"
    ADD CONSTRAINT "extractos_importados_importado_por_fkey" FOREIGN KEY ("importado_por") REFERENCES "public"."perfiles"("id");



ALTER TABLE ONLY "public"."movimientos_financieros"
    ADD CONSTRAINT "fk_movimientos_extracto" FOREIGN KEY ("extracto_id") REFERENCES "public"."extractos_importados"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."lista_precio_disciplinas"
    ADD CONSTRAINT "lista_precio_disciplinas_disciplina_id_fkey" FOREIGN KEY ("disciplina_id") REFERENCES "public"."disciplinas"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."lista_precio_disciplinas"
    ADD CONSTRAINT "lista_precio_disciplinas_lista_precio_id_fkey" FOREIGN KEY ("lista_precio_id") REFERENCES "public"."listas_precio"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."lista_precio_items"
    ADD CONSTRAINT "lista_precio_items_lista_precio_id_fkey" FOREIGN KEY ("lista_precio_id") REFERENCES "public"."listas_precio"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."lista_precio_items"
    ADD CONSTRAINT "lista_precio_items_producto_id_fkey" FOREIGN KEY ("producto_id") REFERENCES "public"."productos"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."lista_precio_items"
    ADD CONSTRAINT "lista_precio_items_variante_id_fkey" FOREIGN KEY ("variante_id") REFERENCES "public"."producto_variantes"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."lotes_entrada"
    ADD CONSTRAINT "lotes_entrada_tipo_entrada_id_fkey" FOREIGN KEY ("tipo_entrada_id") REFERENCES "public"."tipo_entradas"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."movimientos_financieros"
    ADD CONSTRAINT "movimientos_financieros_categoria_id_fkey" FOREIGN KEY ("categoria_id") REFERENCES "public"."categorias_financieras"("id");



ALTER TABLE ONLY "public"."movimientos_financieros"
    ADD CONSTRAINT "movimientos_financieros_cuenta_id_fkey" FOREIGN KEY ("cuenta_id") REFERENCES "public"."cuentas_financieras"("id");



ALTER TABLE ONLY "public"."movimientos_financieros"
    ADD CONSTRAINT "movimientos_financieros_registrado_por_fkey" FOREIGN KEY ("registrado_por") REFERENCES "public"."perfiles"("id");



ALTER TABLE ONLY "public"."movimientos_financieros"
    ADD CONSTRAINT "movimientos_financieros_subcategoria_id_fkey" FOREIGN KEY ("subcategoria_id") REFERENCES "public"."categorias_financieras"("id");



ALTER TABLE ONLY "public"."padron_disciplinas"
    ADD CONSTRAINT "padron_disciplinas_disciplina_id_fkey" FOREIGN KEY ("disciplina_id") REFERENCES "public"."disciplinas"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."padron_disciplinas"
    ADD CONSTRAINT "padron_disciplinas_padron_socio_id_fkey" FOREIGN KEY ("padron_socio_id") REFERENCES "public"."padron_socios"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."padron_socios"
    ADD CONSTRAINT "padron_socios_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."perfiles"("id");



ALTER TABLE ONLY "public"."padron_socios"
    ADD CONSTRAINT "padron_socios_perfil_id_fkey" FOREIGN KEY ("perfil_id") REFERENCES "public"."perfiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."pagos_proveedor"
    ADD CONSTRAINT "pagos_proveedor_compra_id_fkey" FOREIGN KEY ("compra_id") REFERENCES "public"."compras_proveedor"("id");



ALTER TABLE ONLY "public"."pagos_proveedor"
    ADD CONSTRAINT "pagos_proveedor_proveedor_id_fkey" FOREIGN KEY ("proveedor_id") REFERENCES "public"."proveedores"("id");



ALTER TABLE ONLY "public"."pagos_proveedor"
    ADD CONSTRAINT "pagos_proveedor_registrado_por_fkey" FOREIGN KEY ("registrado_por") REFERENCES "public"."perfiles"("id");



ALTER TABLE ONLY "public"."pagos_socios"
    ADD CONSTRAINT "pagos_socios_perfil_id_fkey" FOREIGN KEY ("perfil_id") REFERENCES "public"."perfiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."pagos_socios"
    ADD CONSTRAINT "pagos_socios_registrado_por_fkey" FOREIGN KEY ("registrado_por") REFERENCES "public"."perfiles"("id");



ALTER TABLE ONLY "public"."pedido_items"
    ADD CONSTRAINT "pedido_items_pedido_id_fkey" FOREIGN KEY ("pedido_id") REFERENCES "public"."pedidos"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."pedido_items"
    ADD CONSTRAINT "pedido_items_producto_id_fkey" FOREIGN KEY ("producto_id") REFERENCES "public"."productos"("id");



ALTER TABLE ONLY "public"."pedido_items"
    ADD CONSTRAINT "pedido_items_variante_id_fkey" FOREIGN KEY ("variante_id") REFERENCES "public"."producto_variantes"("id");



ALTER TABLE ONLY "public"."pedidos"
    ADD CONSTRAINT "pedidos_disciplina_id_fkey" FOREIGN KEY ("disciplina_id") REFERENCES "public"."disciplinas"("id");



ALTER TABLE ONLY "public"."pedidos"
    ADD CONSTRAINT "pedidos_perfil_id_fkey" FOREIGN KEY ("perfil_id") REFERENCES "public"."perfiles"("id");



ALTER TABLE ONLY "public"."pedidos"
    ADD CONSTRAINT "pedidos_promocode_id_fkey" FOREIGN KEY ("promocode_id") REFERENCES "public"."promocodes"("id");



ALTER TABLE ONLY "public"."pedidos"
    ADD CONSTRAINT "pedidos_vendedor_id_fkey" FOREIGN KEY ("vendedor_id") REFERENCES "public"."perfiles"("id");



ALTER TABLE ONLY "public"."perfil_roles"
    ADD CONSTRAINT "perfil_roles_asignado_por_fkey" FOREIGN KEY ("asignado_por") REFERENCES "public"."perfiles"("id");



ALTER TABLE ONLY "public"."perfil_roles"
    ADD CONSTRAINT "perfil_roles_perfil_id_fkey" FOREIGN KEY ("perfil_id") REFERENCES "public"."perfiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."perfil_roles"
    ADD CONSTRAINT "perfil_roles_rol_id_fkey" FOREIGN KEY ("rol_id") REFERENCES "public"."roles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."perfiles"
    ADD CONSTRAINT "perfiles_id_fkey" FOREIGN KEY ("id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."perfiles"
    ADD CONSTRAINT "perfiles_padron_socio_id_fkey" FOREIGN KEY ("padron_socio_id") REFERENCES "public"."padron_socios"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."popups"
    ADD CONSTRAINT "popups_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."presupuestos"
    ADD CONSTRAINT "presupuestos_categoria_id_fkey" FOREIGN KEY ("categoria_id") REFERENCES "public"."categorias_financieras"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."presupuestos"
    ADD CONSTRAINT "presupuestos_creado_por_fkey" FOREIGN KEY ("creado_por") REFERENCES "public"."perfiles"("id");



ALTER TABLE ONLY "public"."producto_imagenes"
    ADD CONSTRAINT "producto_imagenes_producto_id_fkey" FOREIGN KEY ("producto_id") REFERENCES "public"."productos"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."producto_proveedores"
    ADD CONSTRAINT "producto_proveedores_producto_id_fkey" FOREIGN KEY ("producto_id") REFERENCES "public"."productos"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."producto_proveedores"
    ADD CONSTRAINT "producto_proveedores_proveedor_id_fkey" FOREIGN KEY ("proveedor_id") REFERENCES "public"."proveedores"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."producto_variantes"
    ADD CONSTRAINT "producto_variantes_producto_id_fkey" FOREIGN KEY ("producto_id") REFERENCES "public"."productos"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."productos"
    ADD CONSTRAINT "productos_categoria_id_fkey" FOREIGN KEY ("categoria_id") REFERENCES "public"."categorias_producto"("id");



ALTER TABLE ONLY "public"."promocodes"
    ADD CONSTRAINT "promocodes_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."perfiles"("id");



ALTER TABLE ONLY "public"."staff"
    ADD CONSTRAINT "staff_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."perfiles"("id");



ALTER TABLE ONLY "public"."staff"
    ADD CONSTRAINT "staff_disciplina_id_fkey" FOREIGN KEY ("disciplina_id") REFERENCES "public"."disciplinas"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."stock_deposito"
    ADD CONSTRAINT "stock_deposito_deposito_id_fkey" FOREIGN KEY ("deposito_id") REFERENCES "public"."depositos"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."stock_deposito"
    ADD CONSTRAINT "stock_deposito_producto_id_fkey" FOREIGN KEY ("producto_id") REFERENCES "public"."productos"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."stock_deposito"
    ADD CONSTRAINT "stock_deposito_variante_id_fkey" FOREIGN KEY ("variante_id") REFERENCES "public"."producto_variantes"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."stock_movimientos"
    ADD CONSTRAINT "stock_movimientos_deposito_id_fkey" FOREIGN KEY ("deposito_id") REFERENCES "public"."depositos"("id");



ALTER TABLE ONLY "public"."stock_movimientos"
    ADD CONSTRAINT "stock_movimientos_producto_id_fkey" FOREIGN KEY ("producto_id") REFERENCES "public"."productos"("id");



ALTER TABLE ONLY "public"."stock_movimientos"
    ADD CONSTRAINT "stock_movimientos_registrado_por_fkey" FOREIGN KEY ("registrado_por") REFERENCES "public"."perfiles"("id");



ALTER TABLE ONLY "public"."stock_movimientos"
    ADD CONSTRAINT "stock_movimientos_variante_id_fkey" FOREIGN KEY ("variante_id") REFERENCES "public"."producto_variantes"("id");



ALTER TABLE ONLY "public"."tesoreria_historial"
    ADD CONSTRAINT "tesoreria_historial_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "public"."perfiles"("id");



ALTER TABLE ONLY "public"."tipo_entradas"
    ADD CONSTRAINT "tipo_entradas_evento_id_fkey" FOREIGN KEY ("evento_id") REFERENCES "public"."eventos"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."transferencia_items"
    ADD CONSTRAINT "transferencia_items_producto_id_fkey" FOREIGN KEY ("producto_id") REFERENCES "public"."productos"("id");



ALTER TABLE ONLY "public"."transferencia_items"
    ADD CONSTRAINT "transferencia_items_transferencia_id_fkey" FOREIGN KEY ("transferencia_id") REFERENCES "public"."transferencias_deposito"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."transferencia_items"
    ADD CONSTRAINT "transferencia_items_variante_id_fkey" FOREIGN KEY ("variante_id") REFERENCES "public"."producto_variantes"("id");



ALTER TABLE ONLY "public"."transferencias_deposito"
    ADD CONSTRAINT "transferencias_deposito_deposito_destino_id_fkey" FOREIGN KEY ("deposito_destino_id") REFERENCES "public"."depositos"("id");



ALTER TABLE ONLY "public"."transferencias_deposito"
    ADD CONSTRAINT "transferencias_deposito_deposito_origen_id_fkey" FOREIGN KEY ("deposito_origen_id") REFERENCES "public"."depositos"("id");



ALTER TABLE ONLY "public"."transferencias_deposito"
    ADD CONSTRAINT "transferencias_deposito_registrado_por_fkey" FOREIGN KEY ("registrado_por") REFERENCES "public"."perfiles"("id");



ALTER TABLE ONLY "public"."transferencias_internas"
    ADD CONSTRAINT "transferencias_internas_cuenta_destino_id_fkey" FOREIGN KEY ("cuenta_destino_id") REFERENCES "public"."cuentas_financieras"("id");



ALTER TABLE ONLY "public"."transferencias_internas"
    ADD CONSTRAINT "transferencias_internas_cuenta_origen_id_fkey" FOREIGN KEY ("cuenta_origen_id") REFERENCES "public"."cuentas_financieras"("id");



ALTER TABLE ONLY "public"."transferencias_internas"
    ADD CONSTRAINT "transferencias_internas_movimiento_egreso_id_fkey" FOREIGN KEY ("movimiento_egreso_id") REFERENCES "public"."movimientos_financieros"("id");



ALTER TABLE ONLY "public"."transferencias_internas"
    ADD CONSTRAINT "transferencias_internas_movimiento_ingreso_id_fkey" FOREIGN KEY ("movimiento_ingreso_id") REFERENCES "public"."movimientos_financieros"("id");



ALTER TABLE ONLY "public"."transferencias_internas"
    ADD CONSTRAINT "transferencias_internas_registrado_por_fkey" FOREIGN KEY ("registrado_por") REFERENCES "public"."perfiles"("id");



CREATE POLICY "Admin gestiona contenido" ON "public"."contenido_paginas" USING ("public"."tiene_rol"('super_admin'::"text"));



CREATE POLICY "Admin gestiona memorias" ON "public"."memorias" USING ("public"."tiene_rol"('super_admin'::"text"));



CREATE POLICY "Admin y secretaría asignan roles" ON "public"."perfil_roles" FOR INSERT WITH CHECK ("public"."tiene_algun_rol"(ARRAY['super_admin'::"text", 'secretaria'::"text"]));



CREATE POLICY "Admin y secretaría eliminan roles" ON "public"."perfil_roles" FOR DELETE USING ("public"."tiene_algun_rol"(ARRAY['super_admin'::"text", 'secretaria'::"text"]));



CREATE POLICY "Cotizaciones: actualizar tesorero" ON "public"."cotizaciones_bcu" FOR UPDATE USING ("public"."tiene_algun_rol"(ARRAY['super_admin'::"text", 'tesorero'::"text"])) WITH CHECK ("public"."tiene_algun_rol"(ARRAY['super_admin'::"text", 'tesorero'::"text"]));



CREATE POLICY "Cotizaciones: escritura tesorero" ON "public"."cotizaciones_bcu" FOR INSERT WITH CHECK ("public"."tiene_algun_rol"(ARRAY['super_admin'::"text", 'tesorero'::"text"]));



CREATE POLICY "Cotizaciones: lectura staff" ON "public"."cotizaciones_bcu" FOR SELECT USING ("public"."tiene_algun_rol"(ARRAY['super_admin'::"text", 'tesorero'::"text", 'tienda'::"text", 'secretaria'::"text", 'eventos'::"text"]));



CREATE POLICY "Extractos: actualizar tesorero" ON "public"."extractos_importados" FOR UPDATE USING ("public"."tiene_algun_rol"(ARRAY['super_admin'::"text", 'tesorero'::"text"])) WITH CHECK ("public"."tiene_algun_rol"(ARRAY['super_admin'::"text", 'tesorero'::"text"]));



CREATE POLICY "Extractos: crear tesorero" ON "public"."extractos_importados" FOR INSERT WITH CHECK ("public"."tiene_algun_rol"(ARRAY['super_admin'::"text", 'tesorero'::"text"]));



CREATE POLICY "Extractos: eliminar tesorero" ON "public"."extractos_importados" FOR DELETE USING ("public"."tiene_algun_rol"(ARRAY['super_admin'::"text", 'tesorero'::"text"]));



CREATE POLICY "Extractos: lectura tesorero" ON "public"."extractos_importados" FOR SELECT USING ("public"."tiene_algun_rol"(ARRAY['super_admin'::"text", 'tesorero'::"text"]));



CREATE POLICY "Historial tesorería: lectura tesorero" ON "public"."tesoreria_historial" FOR SELECT USING ("public"."tiene_algun_rol"(ARRAY['super_admin'::"text", 'tesorero'::"text"]));



CREATE POLICY "Insertar items de pedido" ON "public"."pedido_items" FOR INSERT WITH CHECK (true);



CREATE POLICY "Presupuestos: actualizar tesorero" ON "public"."presupuestos" FOR UPDATE USING ("public"."tiene_algun_rol"(ARRAY['super_admin'::"text", 'tesorero'::"text"])) WITH CHECK ("public"."tiene_algun_rol"(ARRAY['super_admin'::"text", 'tesorero'::"text"]));



CREATE POLICY "Presupuestos: crear tesorero" ON "public"."presupuestos" FOR INSERT WITH CHECK ("public"."tiene_algun_rol"(ARRAY['super_admin'::"text", 'tesorero'::"text"]));



CREATE POLICY "Presupuestos: eliminar tesorero" ON "public"."presupuestos" FOR DELETE USING ("public"."tiene_algun_rol"(ARRAY['super_admin'::"text", 'tesorero'::"text"]));



CREATE POLICY "Presupuestos: lectura tesorero" ON "public"."presupuestos" FOR SELECT USING ("public"."tiene_algun_rol"(ARRAY['super_admin'::"text", 'tesorero'::"text"]));



CREATE POLICY "Scanner registra escaneos" ON "public"."escaneos_entrada" FOR INSERT WITH CHECK ("public"."tiene_algun_rol"(ARRAY['super_admin'::"text", 'eventos'::"text", 'scanner'::"text"]));



CREATE POLICY "Secretaría actualiza padrón" ON "public"."padron_socios" FOR UPDATE USING ("public"."tiene_algun_rol"(ARRAY['super_admin'::"text", 'secretaria'::"text"]));



CREATE POLICY "Secretaría actualiza perfiles" ON "public"."perfiles" FOR UPDATE USING ("public"."tiene_algun_rol"(ARRAY['super_admin'::"text", 'secretaria'::"text"]));



CREATE POLICY "Secretaría actualiza staff" ON "public"."staff" FOR UPDATE USING ("public"."tiene_algun_rol"(ARRAY['super_admin'::"text", 'secretaria'::"text"]));



CREATE POLICY "Secretaría elimina del padrón" ON "public"."padron_socios" FOR DELETE USING ("public"."tiene_algun_rol"(ARRAY['super_admin'::"text", 'secretaria'::"text"]));



CREATE POLICY "Secretaría elimina staff" ON "public"."staff" FOR DELETE USING ("public"."tiene_algun_rol"(ARRAY['super_admin'::"text", 'secretaria'::"text"]));



CREATE POLICY "Secretaría gestiona disciplinas" ON "public"."disciplinas" USING ("public"."tiene_algun_rol"(ARRAY['super_admin'::"text", 'secretaria'::"text"]));



CREATE POLICY "Secretaría gestiona disciplinas del padrón" ON "public"."padron_disciplinas" USING ("public"."tiene_algun_rol"(ARRAY['super_admin'::"text", 'secretaria'::"text"]));



CREATE POLICY "Secretaría inserta en padrón" ON "public"."padron_socios" FOR INSERT WITH CHECK ("public"."tiene_algun_rol"(ARRAY['super_admin'::"text", 'secretaria'::"text"]));



CREATE POLICY "Secretaría inserta perfiles" ON "public"."perfiles" FOR INSERT WITH CHECK ("public"."tiene_algun_rol"(ARRAY['super_admin'::"text", 'secretaria'::"text"]));



CREATE POLICY "Secretaría inserta staff" ON "public"."staff" FOR INSERT WITH CHECK ("public"."tiene_algun_rol"(ARRAY['super_admin'::"text", 'secretaria'::"text"]));



CREATE POLICY "Secretaría registra pagos" ON "public"."pagos_socios" FOR INSERT WITH CHECK ("public"."tiene_algun_rol"(ARRAY['super_admin'::"text", 'secretaria'::"text"]));



CREATE POLICY "Secretaría ve staff" ON "public"."staff" FOR SELECT USING ("public"."tiene_algun_rol"(ARRAY['super_admin'::"text", 'secretaria'::"text"]));



CREATE POLICY "Sistema inserta pagos MP" ON "public"."pagos_mercadopago" FOR INSERT WITH CHECK (true);



CREATE POLICY "Socio ve sus pagos" ON "public"."pagos_socios" FOR SELECT USING (("auth"."uid"() = "perfil_id"));



CREATE POLICY "Staff actualiza entradas" ON "public"."entradas" FOR UPDATE USING ("public"."tiene_algun_rol"(ARRAY['super_admin'::"text", 'eventos'::"text", 'scanner'::"text"]));



CREATE POLICY "Staff de eventos gestiona eventos" ON "public"."eventos" USING ("public"."tiene_algun_rol"(ARRAY['super_admin'::"text", 'eventos'::"text"]));



CREATE POLICY "Staff de eventos gestiona lotes" ON "public"."lotes_entrada" USING ("public"."tiene_algun_rol"(ARRAY['super_admin'::"text", 'eventos'::"text"]));



CREATE POLICY "Staff de eventos gestiona tipos" ON "public"."tipo_entradas" USING ("public"."tiene_algun_rol"(ARRAY['super_admin'::"text", 'eventos'::"text"]));



CREATE POLICY "Staff de eventos ve escaneos" ON "public"."escaneos_entrada" FOR SELECT USING ("public"."tiene_algun_rol"(ARRAY['super_admin'::"text", 'eventos'::"text", 'scanner'::"text"]));



CREATE POLICY "Staff de eventos ve todas las entradas" ON "public"."entradas" FOR SELECT USING ("public"."tiene_algun_rol"(ARRAY['super_admin'::"text", 'eventos'::"text", 'scanner'::"text"]));



CREATE POLICY "Staff de tienda crea movimientos" ON "public"."stock_movimientos" FOR INSERT WITH CHECK ("public"."tiene_algun_rol"(ARRAY['super_admin'::"text", 'tienda'::"text"]));



CREATE POLICY "Staff de tienda ve compras" ON "public"."compras_proveedor" FOR SELECT USING ("public"."tiene_algun_rol"(ARRAY['super_admin'::"text", 'tienda'::"text"]));



CREATE POLICY "Staff de tienda ve items de compra" ON "public"."compra_items" FOR SELECT USING ("public"."tiene_algun_rol"(ARRAY['super_admin'::"text", 'tienda'::"text"]));



CREATE POLICY "Staff de tienda ve movimientos de stock" ON "public"."stock_movimientos" FOR SELECT USING ("public"."tiene_algun_rol"(ARRAY['super_admin'::"text", 'tienda'::"text"]));



CREATE POLICY "Staff de tienda ve pagos a proveedores" ON "public"."pagos_proveedor" FOR SELECT USING ("public"."tiene_algun_rol"(ARRAY['super_admin'::"text", 'tienda'::"text"]));



CREATE POLICY "Staff de tienda ve proveedores" ON "public"."proveedores" FOR SELECT USING ("public"."tiene_algun_rol"(ARRAY['super_admin'::"text", 'tienda'::"text"]));



CREATE POLICY "Staff de tienda ve relaciones proveedor-producto" ON "public"."producto_proveedores" FOR SELECT USING ("public"."tiene_algun_rol"(ARRAY['super_admin'::"text", 'tienda'::"text"]));



CREATE POLICY "Staff de tienda ve todos los items" ON "public"."pedido_items" FOR SELECT USING ("public"."tiene_algun_rol"(ARRAY['super_admin'::"text", 'tienda'::"text"]));



CREATE POLICY "Staff de tienda ve todos los pedidos" ON "public"."pedidos" FOR SELECT USING ("public"."tiene_algun_rol"(ARRAY['super_admin'::"text", 'tienda'::"text"]));



CREATE POLICY "Staff ve disciplinas del padrón" ON "public"."padron_disciplinas" FOR SELECT USING ("public"."tiene_algun_rol"(ARRAY['super_admin'::"text", 'secretaria'::"text"]));



CREATE POLICY "Staff ve pagos MP" ON "public"."pagos_mercadopago" FOR SELECT USING ("public"."tiene_algun_rol"(ARRAY['super_admin'::"text", 'tienda'::"text", 'eventos'::"text"]));



CREATE POLICY "Staff ve todas las categorías" ON "public"."categorias_producto" FOR SELECT USING ("public"."tiene_algun_rol"(ARRAY['super_admin'::"text", 'tienda'::"text"]));



CREATE POLICY "Staff ve todas las disciplinas" ON "public"."disciplinas" FOR SELECT USING ("public"."es_staff"());



CREATE POLICY "Staff ve todas las variantes" ON "public"."producto_variantes" FOR SELECT USING ("public"."tiene_algun_rol"(ARRAY['super_admin'::"text", 'tienda'::"text"]));



CREATE POLICY "Staff ve todo el padrón" ON "public"."padron_socios" FOR SELECT USING ("public"."tiene_algun_rol"(ARRAY['super_admin'::"text", 'secretaria'::"text"]));



CREATE POLICY "Staff ve todos los eventos" ON "public"."eventos" FOR SELECT USING ("public"."tiene_algun_rol"(ARRAY['super_admin'::"text", 'eventos'::"text"]));



CREATE POLICY "Staff ve todos los lotes" ON "public"."lotes_entrada" FOR SELECT USING ("public"."tiene_algun_rol"(ARRAY['super_admin'::"text", 'eventos'::"text"]));



CREATE POLICY "Staff ve todos los pagos de socios" ON "public"."pagos_socios" FOR SELECT USING ("public"."tiene_algun_rol"(ARRAY['super_admin'::"text", 'secretaria'::"text"]));



CREATE POLICY "Staff ve todos los perfiles" ON "public"."perfiles" FOR SELECT USING ("public"."es_staff"());



CREATE POLICY "Staff ve todos los productos" ON "public"."productos" FOR SELECT USING ("public"."tiene_algun_rol"(ARRAY['super_admin'::"text", 'tienda'::"text"]));



CREATE POLICY "Staff ve todos los roles de perfiles" ON "public"."perfil_roles" FOR SELECT USING ("public"."es_staff"());



CREATE POLICY "Staff ve todos los tipos de entrada" ON "public"."tipo_entradas" FOR SELECT USING ("public"."tiene_algun_rol"(ARRAY['super_admin'::"text", 'eventos'::"text"]));



CREATE POLICY "Tesorería: actualizar categorías" ON "public"."categorias_financieras" FOR UPDATE USING ("public"."tiene_algun_rol"(ARRAY['super_admin'::"text", 'tesorero'::"text"])) WITH CHECK ("public"."tiene_algun_rol"(ARRAY['super_admin'::"text", 'tesorero'::"text"]));



CREATE POLICY "Tesorería: actualizar cuentas" ON "public"."cuentas_financieras" FOR UPDATE USING ("public"."tiene_algun_rol"(ARRAY['super_admin'::"text", 'tesorero'::"text"])) WITH CHECK ("public"."tiene_algun_rol"(ARRAY['super_admin'::"text", 'tesorero'::"text"]));



CREATE POLICY "Tesorería: actualizar movimientos" ON "public"."movimientos_financieros" FOR UPDATE USING ("public"."tiene_algun_rol"(ARRAY['super_admin'::"text", 'tesorero'::"text"])) WITH CHECK ("public"."tiene_algun_rol"(ARRAY['super_admin'::"text", 'tesorero'::"text"]));



CREATE POLICY "Tesorería: crear categorías" ON "public"."categorias_financieras" FOR INSERT WITH CHECK ("public"."tiene_algun_rol"(ARRAY['super_admin'::"text", 'tesorero'::"text"]));



CREATE POLICY "Tesorería: crear cuentas" ON "public"."cuentas_financieras" FOR INSERT WITH CHECK ("public"."tiene_algun_rol"(ARRAY['super_admin'::"text", 'tesorero'::"text"]));



CREATE POLICY "Tesorería: crear movimientos" ON "public"."movimientos_financieros" FOR INSERT WITH CHECK ("public"."tiene_algun_rol"(ARRAY['super_admin'::"text", 'tesorero'::"text"]));



CREATE POLICY "Tesorería: eliminar movimientos" ON "public"."movimientos_financieros" FOR DELETE USING ("public"."tiene_algun_rol"(ARRAY['super_admin'::"text", 'tesorero'::"text"]));



CREATE POLICY "Tesorería: lectura categorías" ON "public"."categorias_financieras" FOR SELECT USING ("public"."tiene_algun_rol"(ARRAY['super_admin'::"text", 'tesorero'::"text"]));



CREATE POLICY "Tesorería: lectura cuentas" ON "public"."cuentas_financieras" FOR SELECT USING ("public"."tiene_algun_rol"(ARRAY['super_admin'::"text", 'tesorero'::"text"]));



CREATE POLICY "Tesorería: lectura movimientos" ON "public"."movimientos_financieros" FOR SELECT USING ("public"."tiene_algun_rol"(ARRAY['super_admin'::"text", 'tesorero'::"text"]));



CREATE POLICY "Tienda actualiza pedidos" ON "public"."pedidos" FOR UPDATE USING ("public"."tiene_algun_rol"(ARRAY['super_admin'::"text", 'tienda'::"text"]));



CREATE POLICY "Tienda gestiona categorías" ON "public"."categorias_producto" USING ("public"."tiene_algun_rol"(ARRAY['super_admin'::"text", 'tienda'::"text"]));



CREATE POLICY "Tienda gestiona compras" ON "public"."compras_proveedor" USING ("public"."tiene_algun_rol"(ARRAY['super_admin'::"text", 'tienda'::"text"]));



CREATE POLICY "Tienda gestiona imágenes" ON "public"."producto_imagenes" USING ("public"."tiene_algun_rol"(ARRAY['super_admin'::"text", 'tienda'::"text"]));



CREATE POLICY "Tienda gestiona items de compra" ON "public"."compra_items" USING ("public"."tiene_algun_rol"(ARRAY['super_admin'::"text", 'tienda'::"text"]));



CREATE POLICY "Tienda gestiona productos" ON "public"."productos" USING ("public"."tiene_algun_rol"(ARRAY['super_admin'::"text", 'tienda'::"text"]));



CREATE POLICY "Tienda gestiona proveedores" ON "public"."proveedores" USING ("public"."tiene_algun_rol"(ARRAY['super_admin'::"text", 'tienda'::"text"]));



CREATE POLICY "Tienda gestiona relaciones" ON "public"."producto_proveedores" USING ("public"."tiene_algun_rol"(ARRAY['super_admin'::"text", 'tienda'::"text"]));



CREATE POLICY "Tienda gestiona variantes" ON "public"."producto_variantes" USING ("public"."tiene_algun_rol"(ARRAY['super_admin'::"text", 'tienda'::"text"]));



CREATE POLICY "Tienda registra pagos a proveedores" ON "public"."pagos_proveedor" FOR INSERT WITH CHECK ("public"."tiene_algun_rol"(ARRAY['super_admin'::"text", 'tienda'::"text"]));



CREATE POLICY "Todos pueden ver roles" ON "public"."roles" FOR SELECT USING (true);



CREATE POLICY "Todos ven categorías activas" ON "public"."categorias_producto" FOR SELECT USING (("activa" = true));



CREATE POLICY "Todos ven contenido activo" ON "public"."contenido_paginas" FOR SELECT USING (("activo" = true));



CREATE POLICY "Todos ven disciplinas activas" ON "public"."disciplinas" FOR SELECT USING (("activa" = true));



CREATE POLICY "Todos ven eventos publicados" ON "public"."eventos" FOR SELECT USING ((("estado")::"text" = 'publicado'::"text"));



CREATE POLICY "Todos ven imágenes de productos" ON "public"."producto_imagenes" FOR SELECT USING (true);



CREATE POLICY "Todos ven lotes activos de eventos publicados" ON "public"."lotes_entrada" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM ("public"."tipo_entradas" "te"
     JOIN "public"."eventos" "e" ON (("e"."id" = "te"."evento_id")))
  WHERE (("te"."id" = "lotes_entrada"."tipo_entrada_id") AND (("e"."estado")::"text" = 'publicado'::"text")))));



CREATE POLICY "Todos ven memorias" ON "public"."memorias" FOR SELECT USING (true);



CREATE POLICY "Todos ven productos activos" ON "public"."productos" FOR SELECT USING (("activo" = true));



CREATE POLICY "Todos ven tipos de entrada de eventos publicados" ON "public"."tipo_entradas" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."eventos" "e"
  WHERE (("e"."id" = "tipo_entradas"."evento_id") AND (("e"."estado")::"text" = 'publicado'::"text")))));



CREATE POLICY "Todos ven variantes de productos activos" ON "public"."producto_variantes" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."productos" "p"
  WHERE (("p"."id" = "producto_variantes"."producto_id") AND ("p"."activo" = true)))));



CREATE POLICY "Transferencias: actualizar tesorero" ON "public"."transferencias_internas" FOR UPDATE USING ("public"."tiene_algun_rol"(ARRAY['super_admin'::"text", 'tesorero'::"text"])) WITH CHECK ("public"."tiene_algun_rol"(ARRAY['super_admin'::"text", 'tesorero'::"text"]));



CREATE POLICY "Transferencias: crear tesorero" ON "public"."transferencias_internas" FOR INSERT WITH CHECK ("public"."tiene_algun_rol"(ARRAY['super_admin'::"text", 'tesorero'::"text"]));



CREATE POLICY "Transferencias: eliminar tesorero" ON "public"."transferencias_internas" FOR DELETE USING ("public"."tiene_algun_rol"(ARRAY['super_admin'::"text", 'tesorero'::"text"]));



CREATE POLICY "Transferencias: lectura tesorero" ON "public"."transferencias_internas" FOR SELECT USING ("public"."tiene_algun_rol"(ARRAY['super_admin'::"text", 'tesorero'::"text"]));



CREATE POLICY "Usuario actualiza su perfil" ON "public"."perfiles" FOR UPDATE USING (("auth"."uid"() = "id")) WITH CHECK (("auth"."uid"() = "id"));



CREATE POLICY "Usuario ve items de sus pedidos" ON "public"."pedido_items" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."pedidos" "p"
  WHERE (("p"."id" = "pedido_items"."pedido_id") AND ("p"."perfil_id" = "auth"."uid"())))));



CREATE POLICY "Usuario ve su registro vinculado" ON "public"."padron_socios" FOR SELECT USING (("auth"."uid"() = "perfil_id"));



CREATE POLICY "Usuario ve sus disciplinas del padrón" ON "public"."padron_disciplinas" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."padron_socios" "ps"
  WHERE (("ps"."id" = "padron_disciplinas"."padron_socio_id") AND ("ps"."perfil_id" = "auth"."uid"())))));



CREATE POLICY "Usuario ve sus entradas" ON "public"."entradas" FOR SELECT USING (("auth"."uid"() = "perfil_id"));



CREATE POLICY "Usuario ve sus pedidos" ON "public"."pedidos" FOR SELECT USING (("auth"."uid"() = "perfil_id"));



CREATE POLICY "Usuario ve sus propios roles" ON "public"."perfil_roles" FOR SELECT USING (("auth"."uid"() = "perfil_id"));



CREATE POLICY "Usuarios compran entradas" ON "public"."entradas" FOR INSERT WITH CHECK ((("auth"."uid"() = "perfil_id") OR "public"."tiene_algun_rol"(ARRAY['super_admin'::"text", 'eventos'::"text"])));



CREATE POLICY "Usuarios crean pedidos" ON "public"."pedidos" FOR INSERT WITH CHECK ((("auth"."uid"() = "perfil_id") OR "public"."tiene_algun_rol"(ARRAY['super_admin'::"text", 'tienda'::"text"])));



CREATE POLICY "Usuarios ven su propio perfil" ON "public"."perfiles" FOR SELECT USING (("auth"."uid"() = "id"));



ALTER TABLE "public"."categorias_financieras" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."categorias_producto" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."compra_items" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."compras_proveedor" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."comprobantes" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "comprobantes_insert_own" ON "public"."comprobantes" FOR INSERT TO "authenticated" WITH CHECK (("pedido_id" IN ( SELECT "pedidos"."id"
   FROM "public"."pedidos"
  WHERE ("pedidos"."perfil_id" = "auth"."uid"()))));



CREATE POLICY "comprobantes_select_admin" ON "public"."comprobantes" FOR SELECT TO "authenticated" USING (("auth"."uid"() IN ( SELECT "pr"."perfil_id"
   FROM ("public"."perfil_roles" "pr"
     JOIN "public"."roles" "r" ON (("r"."id" = "pr"."rol_id")))
  WHERE (("r"."nombre")::"text" = ANY ((ARRAY['super_admin'::character varying, 'tienda'::character varying])::"text"[])))));



CREATE POLICY "comprobantes_select_own" ON "public"."comprobantes" FOR SELECT TO "authenticated" USING (("pedido_id" IN ( SELECT "pedidos"."id"
   FROM "public"."pedidos"
  WHERE ("pedidos"."perfil_id" = "auth"."uid"()))));



CREATE POLICY "comprobantes_update_admin" ON "public"."comprobantes" FOR UPDATE TO "authenticated" USING (("auth"."uid"() IN ( SELECT "pr"."perfil_id"
   FROM ("public"."perfil_roles" "pr"
     JOIN "public"."roles" "r" ON (("r"."id" = "pr"."rol_id")))
  WHERE (("r"."nombre")::"text" = ANY ((ARRAY['super_admin'::character varying, 'tienda'::character varying])::"text"[])))));



ALTER TABLE "public"."contenido_paginas" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."cotizaciones_bcu" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."cuentas_financieras" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."depositos" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "depositos_all" ON "public"."depositos" USING ("public"."tiene_algun_rol"(ARRAY['super_admin'::"text", 'tienda'::"text"]));



CREATE POLICY "depositos_select" ON "public"."depositos" FOR SELECT USING (true);



ALTER TABLE "public"."disciplinas" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."donaciones" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "donaciones admin insert" ON "public"."donaciones" FOR INSERT TO "authenticated" WITH CHECK ("public"."tiene_algun_rol"(ARRAY['super_admin'::"text", 'tienda'::"text"]));



CREATE POLICY "donaciones admin select" ON "public"."donaciones" FOR SELECT TO "authenticated" USING ("public"."tiene_algun_rol"(ARRAY['super_admin'::"text", 'tienda'::"text"]));



CREATE POLICY "donaciones admin update" ON "public"."donaciones" FOR UPDATE TO "authenticated" USING ("public"."tiene_algun_rol"(ARRAY['super_admin'::"text", 'tienda'::"text"])) WITH CHECK ("public"."tiene_algun_rol"(ARRAY['super_admin'::"text", 'tienda'::"text"]));



CREATE POLICY "donaciones lectura dueno pedido" ON "public"."donaciones" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."pedidos" "p"
  WHERE (("p"."id" = "donaciones"."pedido_id") AND ("p"."perfil_id" = "auth"."uid"())))));



CREATE POLICY "donaciones tesoreria select" ON "public"."donaciones" FOR SELECT TO "authenticated" USING ("public"."tiene_algun_rol"(ARRAY['tesorero'::"text"]));



ALTER TABLE "public"."donaciones_config" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "donaciones_config admin update" ON "public"."donaciones_config" FOR UPDATE TO "authenticated" USING ("public"."tiene_algun_rol"(ARRAY['super_admin'::"text", 'tienda'::"text"])) WITH CHECK ("public"."tiene_algun_rol"(ARRAY['super_admin'::"text", 'tienda'::"text"]));



CREATE POLICY "donaciones_config lectura authenticated" ON "public"."donaciones_config" FOR SELECT TO "authenticated" USING (true);



ALTER TABLE "public"."donaciones_transferencias" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "donaciones_transferencias admin insert" ON "public"."donaciones_transferencias" FOR INSERT TO "authenticated" WITH CHECK ("public"."tiene_algun_rol"(ARRAY['super_admin'::"text", 'tienda'::"text"]));



CREATE POLICY "donaciones_transferencias admin select" ON "public"."donaciones_transferencias" FOR SELECT TO "authenticated" USING ("public"."tiene_algun_rol"(ARRAY['super_admin'::"text", 'tienda'::"text"]));



CREATE POLICY "donaciones_transferencias admin update" ON "public"."donaciones_transferencias" FOR UPDATE TO "authenticated" USING ("public"."tiene_algun_rol"(ARRAY['super_admin'::"text", 'tienda'::"text"])) WITH CHECK ("public"."tiene_algun_rol"(ARRAY['super_admin'::"text", 'tienda'::"text"]));



CREATE POLICY "donaciones_transferencias tesoreria select" ON "public"."donaciones_transferencias" FOR SELECT TO "authenticated" USING ("public"."tiene_algun_rol"(ARRAY['tesorero'::"text"]));



ALTER TABLE "public"."entradas" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."escaneos_entrada" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."eventos" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."extractos_importados" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."lista_precio_disciplinas" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "lista_precio_disciplinas_all" ON "public"."lista_precio_disciplinas" USING ("public"."tiene_algun_rol"(ARRAY['super_admin'::"text", 'tienda'::"text"]));



CREATE POLICY "lista_precio_disciplinas_select" ON "public"."lista_precio_disciplinas" FOR SELECT USING (true);



ALTER TABLE "public"."lista_precio_items" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "lista_precio_items_all" ON "public"."lista_precio_items" USING ("public"."tiene_algun_rol"(ARRAY['super_admin'::"text", 'tienda'::"text"]));



CREATE POLICY "lista_precio_items_select" ON "public"."lista_precio_items" FOR SELECT USING (true);



ALTER TABLE "public"."listas_precio" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "listas_precio_all" ON "public"."listas_precio" USING ("public"."tiene_algun_rol"(ARRAY['super_admin'::"text", 'tienda'::"text"]));



CREATE POLICY "listas_precio_select" ON "public"."listas_precio" FOR SELECT USING (true);



ALTER TABLE "public"."lotes_entrada" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."memorias" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."movimientos_financieros" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."padron_disciplinas" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."padron_socios" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."pagos_mercadopago" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."pagos_proveedor" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."pagos_socios" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."pedido_items" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."pedidos" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."perfil_roles" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."perfiles" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."popups" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "popups_admin_delete" ON "public"."popups" FOR DELETE USING ("public"."tiene_algun_rol"(ARRAY['super_admin'::"text", 'secretaria'::"text"]));



CREATE POLICY "popups_admin_insert" ON "public"."popups" FOR INSERT WITH CHECK ("public"."tiene_algun_rol"(ARRAY['super_admin'::"text", 'secretaria'::"text"]));



CREATE POLICY "popups_admin_read" ON "public"."popups" FOR SELECT USING ("public"."tiene_algun_rol"(ARRAY['super_admin'::"text", 'secretaria'::"text"]));



CREATE POLICY "popups_admin_update" ON "public"."popups" FOR UPDATE USING ("public"."tiene_algun_rol"(ARRAY['super_admin'::"text", 'secretaria'::"text"])) WITH CHECK ("public"."tiene_algun_rol"(ARRAY['super_admin'::"text", 'secretaria'::"text"]));



CREATE POLICY "popups_public_read" ON "public"."popups" FOR SELECT USING ((("status" = 'published'::"text") AND (("now"() >= "starts_at") AND ("now"() <= "ends_at"))));



ALTER TABLE "public"."presupuestos" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."producto_imagenes" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."producto_proveedores" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."producto_variantes" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."productos" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."promocodes" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "promocodes admin delete" ON "public"."promocodes" FOR DELETE TO "authenticated" USING ("public"."tiene_algun_rol"(ARRAY['super_admin'::"text", 'tienda'::"text"]));



CREATE POLICY "promocodes admin insert" ON "public"."promocodes" FOR INSERT TO "authenticated" WITH CHECK ("public"."tiene_algun_rol"(ARRAY['super_admin'::"text", 'tienda'::"text"]));



CREATE POLICY "promocodes admin select" ON "public"."promocodes" FOR SELECT TO "authenticated" USING ("public"."tiene_algun_rol"(ARRAY['super_admin'::"text", 'tienda'::"text"]));



CREATE POLICY "promocodes admin update" ON "public"."promocodes" FOR UPDATE TO "authenticated" USING ("public"."tiene_algun_rol"(ARRAY['super_admin'::"text", 'tienda'::"text"])) WITH CHECK ("public"."tiene_algun_rol"(ARRAY['super_admin'::"text", 'tienda'::"text"]));



CREATE POLICY "promocodes lectura validacion vigentes" ON "public"."promocodes" FOR SELECT TO "authenticated" USING (("activo" AND (("now"() >= "fecha_inicio") AND ("now"() <= "fecha_fin"))));



ALTER TABLE "public"."proveedores" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."roles" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."staff" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."stock_deposito" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "stock_deposito_all" ON "public"."stock_deposito" USING ("public"."tiene_algun_rol"(ARRAY['super_admin'::"text", 'tienda'::"text"]));



CREATE POLICY "stock_deposito_select" ON "public"."stock_deposito" FOR SELECT USING (true);



ALTER TABLE "public"."stock_movimientos" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."tesoreria_historial" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."tipo_entradas" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."transferencia_items" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "transferencia_items_all" ON "public"."transferencia_items" USING ("public"."tiene_algun_rol"(ARRAY['super_admin'::"text", 'tienda'::"text"]));



CREATE POLICY "transferencia_items_select" ON "public"."transferencia_items" FOR SELECT USING (true);



CREATE POLICY "transferencias_all" ON "public"."transferencias_deposito" USING ("public"."tiene_algun_rol"(ARRAY['super_admin'::"text", 'tienda'::"text"]));



ALTER TABLE "public"."transferencias_deposito" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."transferencias_internas" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "transferencias_select" ON "public"."transferencias_deposito" FOR SELECT USING (true);





ALTER PUBLICATION "supabase_realtime" OWNER TO "postgres";






GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";






















































































































































GRANT ALL ON FUNCTION "public"."actualizar_deuda_compra"() TO "anon";
GRANT ALL ON FUNCTION "public"."actualizar_deuda_compra"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."actualizar_deuda_compra"() TO "service_role";



GRANT ALL ON FUNCTION "public"."actualizar_saldo_cuenta"() TO "anon";
GRANT ALL ON FUNCTION "public"."actualizar_saldo_cuenta"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."actualizar_saldo_cuenta"() TO "service_role";



GRANT ALL ON FUNCTION "public"."actualizar_saldo_cuenta_rpc"("p_cuenta_id" integer, "p_delta" numeric) TO "anon";
GRANT ALL ON FUNCTION "public"."actualizar_saldo_cuenta_rpc"("p_cuenta_id" integer, "p_delta" numeric) TO "authenticated";
GRANT ALL ON FUNCTION "public"."actualizar_saldo_cuenta_rpc"("p_cuenta_id" integer, "p_delta" numeric) TO "service_role";



GRANT ALL ON FUNCTION "public"."actualizar_saldo_disciplina"() TO "anon";
GRANT ALL ON FUNCTION "public"."actualizar_saldo_disciplina"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."actualizar_saldo_disciplina"() TO "service_role";



GRANT ALL ON FUNCTION "public"."actualizar_saldo_proveedor"() TO "anon";
GRANT ALL ON FUNCTION "public"."actualizar_saldo_proveedor"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."actualizar_saldo_proveedor"() TO "service_role";



GRANT ALL ON FUNCTION "public"."aplicar_cambios_tesoreria"("p_payload" "jsonb") TO "anon";
GRANT ALL ON FUNCTION "public"."aplicar_cambios_tesoreria"("p_payload" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."aplicar_cambios_tesoreria"("p_payload" "jsonb") TO "service_role";



REVOKE ALL ON FUNCTION "public"."cancelar_pedido"("p_pedido_id" integer, "p_motivo" "text", "p_registrado_por" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."cancelar_pedido"("p_pedido_id" integer, "p_motivo" "text", "p_registrado_por" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."confirmar_reserva_pedido"("p_pedido_id" integer, "p_estado_nuevo" "text", "p_registrado_por" "uuid", "p_estado_esperado" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."confirmar_reserva_pedido"("p_pedido_id" integer, "p_estado_nuevo" "text", "p_registrado_por" "uuid", "p_estado_esperado" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."costo_proveedor_fallback"("p_producto_id" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."costo_proveedor_fallback"("p_producto_id" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."costo_proveedor_fallback"("p_producto_id" integer) TO "service_role";



REVOKE ALL ON FUNCTION "public"."decrementar_uso_promocode"("p_id" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."decrementar_uso_promocode"("p_id" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."desconciliar_si_cambia_monto"() TO "anon";
GRANT ALL ON FUNCTION "public"."desconciliar_si_cambia_monto"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."desconciliar_si_cambia_monto"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."descontar_stock_pedido"("p_pedido_id" integer, "p_items" "jsonb", "p_registrado_por" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."descontar_stock_pedido"("p_pedido_id" integer, "p_items" "jsonb", "p_registrado_por" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."es_staff"() TO "anon";
GRANT ALL ON FUNCTION "public"."es_staff"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."es_staff"() TO "service_role";



GRANT ALL ON FUNCTION "public"."estado_conciliacion_cuenta"("p_cuenta_id" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."estado_conciliacion_cuenta"("p_cuenta_id" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."estado_conciliacion_cuenta"("p_cuenta_id" integer) TO "service_role";



REVOKE ALL ON FUNCTION "public"."expirar_reservas_pendientes"("p_horas" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."expirar_reservas_pendientes"("p_horas" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."generar_numero_pedido"() TO "anon";
GRANT ALL ON FUNCTION "public"."generar_numero_pedido"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."generar_numero_pedido"() TO "service_role";



GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "anon";
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "service_role";



GRANT ALL ON FUNCTION "public"."handle_padron_socio_deleted"() TO "anon";
GRANT ALL ON FUNCTION "public"."handle_padron_socio_deleted"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."handle_padron_socio_deleted"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."incrementar_stock_item"("p_producto_id" integer, "p_variante_id" integer, "p_cantidad" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."incrementar_stock_item"("p_producto_id" integer, "p_variante_id" integer, "p_cantidad" integer) TO "service_role";



REVOKE ALL ON FUNCTION "public"."incrementar_uso_promocode"("p_id" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."incrementar_uso_promocode"("p_id" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."motivo_venta_pedido"("p_tipo" "text", "p_numero" "text", "p_id" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."motivo_venta_pedido"("p_tipo" "text", "p_numero" "text", "p_id" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."motivo_venta_pedido"("p_tipo" "text", "p_numero" "text", "p_id" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."popups_set_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."popups_set_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."popups_set_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."promocodes_normalize_codigo"() TO "anon";
GRANT ALL ON FUNCTION "public"."promocodes_normalize_codigo"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."promocodes_normalize_codigo"() TO "service_role";



GRANT ALL ON FUNCTION "public"."recalcular_costo_promedio"("p_producto_id" integer, "p_variante_id" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."recalcular_costo_promedio"("p_producto_id" integer, "p_variante_id" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."recalcular_costo_promedio"("p_producto_id" integer, "p_variante_id" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."recalcular_stock_producto"("p_producto_id" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."recalcular_stock_producto"("p_producto_id" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."recalcular_stock_producto"("p_producto_id" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."registrar_historial_movimiento"() TO "anon";
GRANT ALL ON FUNCTION "public"."registrar_historial_movimiento"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."registrar_historial_movimiento"() TO "service_role";



GRANT ALL ON FUNCTION "public"."registrar_transferencia_donaciones"("p_fecha" "date", "p_comprobante_url" "text", "p_notas" "text", "p_creado_por" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."registrar_transferencia_donaciones"("p_fecha" "date", "p_comprobante_url" "text", "p_notas" "text", "p_creado_por" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."registrar_transferencia_donaciones"("p_fecha" "date", "p_comprobante_url" "text", "p_notas" "text", "p_creado_por" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."reservar_stock_pedido"("p_pedido_id" integer, "p_items" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."reservar_stock_pedido"("p_pedido_id" integer, "p_items" "jsonb") TO "service_role";



GRANT ALL ON FUNCTION "public"."revertir_saldo_disciplina"() TO "anon";
GRANT ALL ON FUNCTION "public"."revertir_saldo_disciplina"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."revertir_saldo_disciplina"() TO "service_role";



GRANT ALL ON FUNCTION "public"."set_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."set_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."tiene_algun_rol"("roles_nombres" "text"[]) TO "anon";
GRANT ALL ON FUNCTION "public"."tiene_algun_rol"("roles_nombres" "text"[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."tiene_algun_rol"("roles_nombres" "text"[]) TO "service_role";



GRANT ALL ON FUNCTION "public"."tiene_rol"("rol_nombre" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."tiene_rol"("rol_nombre" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."tiene_rol"("rol_nombre" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."trg_fn_compra_recibida_actualiza_ppp"() TO "anon";
GRANT ALL ON FUNCTION "public"."trg_fn_compra_recibida_actualiza_ppp"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."trg_fn_compra_recibida_actualiza_ppp"() TO "service_role";



GRANT ALL ON FUNCTION "public"."trg_fn_pedido_item_snapshot_costo"() TO "anon";
GRANT ALL ON FUNCTION "public"."trg_fn_pedido_item_snapshot_costo"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."trg_fn_pedido_item_snapshot_costo"() TO "service_role";



GRANT ALL ON FUNCTION "public"."trg_fn_pedidos_fecha_venta"() TO "anon";
GRANT ALL ON FUNCTION "public"."trg_fn_pedidos_fecha_venta"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."trg_fn_pedidos_fecha_venta"() TO "service_role";



GRANT ALL ON FUNCTION "public"."trg_fn_sync_stock_producto_variantes"() TO "anon";
GRANT ALL ON FUNCTION "public"."trg_fn_sync_stock_producto_variantes"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."trg_fn_sync_stock_producto_variantes"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_updated_at"() TO "service_role";


















GRANT ALL ON TABLE "public"."categorias_financieras" TO "anon";
GRANT ALL ON TABLE "public"."categorias_financieras" TO "authenticated";
GRANT ALL ON TABLE "public"."categorias_financieras" TO "service_role";



GRANT ALL ON SEQUENCE "public"."categorias_financieras_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."categorias_financieras_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."categorias_financieras_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."categorias_producto" TO "anon";
GRANT ALL ON TABLE "public"."categorias_producto" TO "authenticated";
GRANT ALL ON TABLE "public"."categorias_producto" TO "service_role";



GRANT ALL ON SEQUENCE "public"."categorias_producto_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."categorias_producto_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."categorias_producto_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."compra_items" TO "anon";
GRANT ALL ON TABLE "public"."compra_items" TO "authenticated";
GRANT ALL ON TABLE "public"."compra_items" TO "service_role";



GRANT ALL ON SEQUENCE "public"."compra_items_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."compra_items_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."compra_items_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."compras_proveedor" TO "anon";
GRANT ALL ON TABLE "public"."compras_proveedor" TO "authenticated";
GRANT ALL ON TABLE "public"."compras_proveedor" TO "service_role";



GRANT ALL ON SEQUENCE "public"."compras_proveedor_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."compras_proveedor_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."compras_proveedor_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."comprobantes" TO "anon";
GRANT ALL ON TABLE "public"."comprobantes" TO "authenticated";
GRANT ALL ON TABLE "public"."comprobantes" TO "service_role";



GRANT ALL ON SEQUENCE "public"."comprobantes_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."comprobantes_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."comprobantes_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."contenido_paginas" TO "anon";
GRANT ALL ON TABLE "public"."contenido_paginas" TO "authenticated";
GRANT ALL ON TABLE "public"."contenido_paginas" TO "service_role";



GRANT ALL ON SEQUENCE "public"."contenido_paginas_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."contenido_paginas_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."contenido_paginas_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."cotizaciones_bcu" TO "anon";
GRANT ALL ON TABLE "public"."cotizaciones_bcu" TO "authenticated";
GRANT ALL ON TABLE "public"."cotizaciones_bcu" TO "service_role";



GRANT ALL ON SEQUENCE "public"."cotizaciones_bcu_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."cotizaciones_bcu_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."cotizaciones_bcu_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."cuentas_financieras" TO "anon";
GRANT ALL ON TABLE "public"."cuentas_financieras" TO "authenticated";
GRANT ALL ON TABLE "public"."cuentas_financieras" TO "service_role";



GRANT ALL ON SEQUENCE "public"."cuentas_financieras_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."cuentas_financieras_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."cuentas_financieras_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."depositos" TO "anon";
GRANT ALL ON TABLE "public"."depositos" TO "authenticated";
GRANT ALL ON TABLE "public"."depositos" TO "service_role";



GRANT ALL ON SEQUENCE "public"."depositos_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."depositos_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."depositos_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."disciplinas" TO "anon";
GRANT ALL ON TABLE "public"."disciplinas" TO "authenticated";
GRANT ALL ON TABLE "public"."disciplinas" TO "service_role";



GRANT ALL ON SEQUENCE "public"."disciplinas_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."disciplinas_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."disciplinas_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."donaciones" TO "anon";
GRANT ALL ON TABLE "public"."donaciones" TO "authenticated";
GRANT ALL ON TABLE "public"."donaciones" TO "service_role";



GRANT ALL ON TABLE "public"."donaciones_config" TO "anon";
GRANT ALL ON TABLE "public"."donaciones_config" TO "authenticated";
GRANT ALL ON TABLE "public"."donaciones_config" TO "service_role";



GRANT ALL ON SEQUENCE "public"."donaciones_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."donaciones_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."donaciones_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."donaciones_transferencias" TO "anon";
GRANT ALL ON TABLE "public"."donaciones_transferencias" TO "authenticated";
GRANT ALL ON TABLE "public"."donaciones_transferencias" TO "service_role";



GRANT ALL ON SEQUENCE "public"."donaciones_transferencias_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."donaciones_transferencias_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."donaciones_transferencias_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."entradas" TO "anon";
GRANT ALL ON TABLE "public"."entradas" TO "authenticated";
GRANT ALL ON TABLE "public"."entradas" TO "service_role";



GRANT ALL ON SEQUENCE "public"."entradas_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."entradas_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."entradas_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."escaneos_entrada" TO "anon";
GRANT ALL ON TABLE "public"."escaneos_entrada" TO "authenticated";
GRANT ALL ON TABLE "public"."escaneos_entrada" TO "service_role";



GRANT ALL ON SEQUENCE "public"."escaneos_entrada_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."escaneos_entrada_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."escaneos_entrada_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."eventos" TO "anon";
GRANT ALL ON TABLE "public"."eventos" TO "authenticated";
GRANT ALL ON TABLE "public"."eventos" TO "service_role";



GRANT ALL ON SEQUENCE "public"."eventos_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."eventos_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."eventos_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."extractos_importados" TO "anon";
GRANT ALL ON TABLE "public"."extractos_importados" TO "authenticated";
GRANT ALL ON TABLE "public"."extractos_importados" TO "service_role";



GRANT ALL ON SEQUENCE "public"."extractos_importados_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."extractos_importados_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."extractos_importados_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."lista_precio_disciplinas" TO "anon";
GRANT ALL ON TABLE "public"."lista_precio_disciplinas" TO "authenticated";
GRANT ALL ON TABLE "public"."lista_precio_disciplinas" TO "service_role";



GRANT ALL ON SEQUENCE "public"."lista_precio_disciplinas_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."lista_precio_disciplinas_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."lista_precio_disciplinas_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."lista_precio_items" TO "anon";
GRANT ALL ON TABLE "public"."lista_precio_items" TO "authenticated";
GRANT ALL ON TABLE "public"."lista_precio_items" TO "service_role";



GRANT ALL ON SEQUENCE "public"."lista_precio_items_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."lista_precio_items_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."lista_precio_items_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."listas_precio" TO "anon";
GRANT ALL ON TABLE "public"."listas_precio" TO "authenticated";
GRANT ALL ON TABLE "public"."listas_precio" TO "service_role";



GRANT ALL ON SEQUENCE "public"."listas_precio_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."listas_precio_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."listas_precio_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."lotes_entrada" TO "anon";
GRANT ALL ON TABLE "public"."lotes_entrada" TO "authenticated";
GRANT ALL ON TABLE "public"."lotes_entrada" TO "service_role";



GRANT ALL ON SEQUENCE "public"."lotes_entrada_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."lotes_entrada_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."lotes_entrada_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."memorias" TO "anon";
GRANT ALL ON TABLE "public"."memorias" TO "authenticated";
GRANT ALL ON TABLE "public"."memorias" TO "service_role";



GRANT ALL ON SEQUENCE "public"."memorias_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."memorias_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."memorias_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."movimientos_financieros" TO "anon";
GRANT ALL ON TABLE "public"."movimientos_financieros" TO "authenticated";
GRANT ALL ON TABLE "public"."movimientos_financieros" TO "service_role";



GRANT ALL ON SEQUENCE "public"."movimientos_financieros_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."movimientos_financieros_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."movimientos_financieros_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."padron_disciplinas" TO "anon";
GRANT ALL ON TABLE "public"."padron_disciplinas" TO "authenticated";
GRANT ALL ON TABLE "public"."padron_disciplinas" TO "service_role";



GRANT ALL ON SEQUENCE "public"."padron_disciplinas_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."padron_disciplinas_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."padron_disciplinas_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."padron_socios" TO "anon";
GRANT ALL ON TABLE "public"."padron_socios" TO "authenticated";
GRANT ALL ON TABLE "public"."padron_socios" TO "service_role";



GRANT ALL ON SEQUENCE "public"."padron_socios_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."padron_socios_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."padron_socios_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."pagos_mercadopago" TO "anon";
GRANT ALL ON TABLE "public"."pagos_mercadopago" TO "authenticated";
GRANT ALL ON TABLE "public"."pagos_mercadopago" TO "service_role";



GRANT ALL ON SEQUENCE "public"."pagos_mercadopago_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."pagos_mercadopago_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."pagos_mercadopago_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."pagos_proveedor" TO "anon";
GRANT ALL ON TABLE "public"."pagos_proveedor" TO "authenticated";
GRANT ALL ON TABLE "public"."pagos_proveedor" TO "service_role";



GRANT ALL ON SEQUENCE "public"."pagos_proveedor_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."pagos_proveedor_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."pagos_proveedor_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."pagos_socios" TO "anon";
GRANT ALL ON TABLE "public"."pagos_socios" TO "authenticated";
GRANT ALL ON TABLE "public"."pagos_socios" TO "service_role";



GRANT ALL ON SEQUENCE "public"."pagos_socios_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."pagos_socios_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."pagos_socios_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."pedido_items" TO "anon";
GRANT ALL ON TABLE "public"."pedido_items" TO "authenticated";
GRANT ALL ON TABLE "public"."pedido_items" TO "service_role";



GRANT ALL ON SEQUENCE "public"."pedido_items_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."pedido_items_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."pedido_items_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."pedidos" TO "anon";
GRANT ALL ON TABLE "public"."pedidos" TO "authenticated";
GRANT ALL ON TABLE "public"."pedidos" TO "service_role";



GRANT ALL ON SEQUENCE "public"."pedidos_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."pedidos_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."pedidos_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."perfil_roles" TO "anon";
GRANT ALL ON TABLE "public"."perfil_roles" TO "authenticated";
GRANT ALL ON TABLE "public"."perfil_roles" TO "service_role";



GRANT ALL ON SEQUENCE "public"."perfil_roles_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."perfil_roles_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."perfil_roles_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."perfiles" TO "anon";
GRANT ALL ON TABLE "public"."perfiles" TO "authenticated";
GRANT ALL ON TABLE "public"."perfiles" TO "service_role";



GRANT ALL ON TABLE "public"."popups" TO "anon";
GRANT ALL ON TABLE "public"."popups" TO "authenticated";
GRANT ALL ON TABLE "public"."popups" TO "service_role";



GRANT ALL ON TABLE "public"."presupuestos" TO "anon";
GRANT ALL ON TABLE "public"."presupuestos" TO "authenticated";
GRANT ALL ON TABLE "public"."presupuestos" TO "service_role";



GRANT ALL ON SEQUENCE "public"."presupuestos_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."presupuestos_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."presupuestos_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."producto_imagenes" TO "anon";
GRANT ALL ON TABLE "public"."producto_imagenes" TO "authenticated";
GRANT ALL ON TABLE "public"."producto_imagenes" TO "service_role";



GRANT ALL ON SEQUENCE "public"."producto_imagenes_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."producto_imagenes_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."producto_imagenes_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."producto_proveedores" TO "anon";
GRANT ALL ON TABLE "public"."producto_proveedores" TO "authenticated";
GRANT ALL ON TABLE "public"."producto_proveedores" TO "service_role";



GRANT ALL ON SEQUENCE "public"."producto_proveedores_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."producto_proveedores_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."producto_proveedores_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."producto_variantes" TO "anon";
GRANT ALL ON TABLE "public"."producto_variantes" TO "authenticated";
GRANT ALL ON TABLE "public"."producto_variantes" TO "service_role";



GRANT ALL ON SEQUENCE "public"."producto_variantes_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."producto_variantes_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."producto_variantes_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."productos" TO "anon";
GRANT ALL ON TABLE "public"."productos" TO "authenticated";
GRANT ALL ON TABLE "public"."productos" TO "service_role";



GRANT ALL ON SEQUENCE "public"."productos_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."productos_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."productos_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."promocodes" TO "anon";
GRANT ALL ON TABLE "public"."promocodes" TO "authenticated";
GRANT ALL ON TABLE "public"."promocodes" TO "service_role";



GRANT ALL ON SEQUENCE "public"."promocodes_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."promocodes_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."promocodes_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."proveedores" TO "anon";
GRANT ALL ON TABLE "public"."proveedores" TO "authenticated";
GRANT ALL ON TABLE "public"."proveedores" TO "service_role";



GRANT ALL ON SEQUENCE "public"."proveedores_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."proveedores_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."proveedores_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."roles" TO "anon";
GRANT ALL ON TABLE "public"."roles" TO "authenticated";
GRANT ALL ON TABLE "public"."roles" TO "service_role";



GRANT ALL ON SEQUENCE "public"."roles_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."roles_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."roles_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."staff" TO "anon";
GRANT ALL ON TABLE "public"."staff" TO "authenticated";
GRANT ALL ON TABLE "public"."staff" TO "service_role";



GRANT ALL ON SEQUENCE "public"."staff_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."staff_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."staff_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."stock_deposito" TO "anon";
GRANT ALL ON TABLE "public"."stock_deposito" TO "authenticated";
GRANT ALL ON TABLE "public"."stock_deposito" TO "service_role";



GRANT ALL ON SEQUENCE "public"."stock_deposito_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."stock_deposito_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."stock_deposito_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."stock_movimientos" TO "anon";
GRANT ALL ON TABLE "public"."stock_movimientos" TO "authenticated";
GRANT ALL ON TABLE "public"."stock_movimientos" TO "service_role";



GRANT ALL ON SEQUENCE "public"."stock_movimientos_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."stock_movimientos_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."stock_movimientos_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."tesoreria_historial" TO "anon";
GRANT ALL ON TABLE "public"."tesoreria_historial" TO "authenticated";
GRANT ALL ON TABLE "public"."tesoreria_historial" TO "service_role";



GRANT ALL ON SEQUENCE "public"."tesoreria_historial_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."tesoreria_historial_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."tesoreria_historial_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."tipo_entradas" TO "anon";
GRANT ALL ON TABLE "public"."tipo_entradas" TO "authenticated";
GRANT ALL ON TABLE "public"."tipo_entradas" TO "service_role";



GRANT ALL ON SEQUENCE "public"."tipo_entradas_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."tipo_entradas_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."tipo_entradas_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."transferencia_items" TO "anon";
GRANT ALL ON TABLE "public"."transferencia_items" TO "authenticated";
GRANT ALL ON TABLE "public"."transferencia_items" TO "service_role";



GRANT ALL ON SEQUENCE "public"."transferencia_items_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."transferencia_items_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."transferencia_items_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."transferencias_deposito" TO "anon";
GRANT ALL ON TABLE "public"."transferencias_deposito" TO "authenticated";
GRANT ALL ON TABLE "public"."transferencias_deposito" TO "service_role";



GRANT ALL ON SEQUENCE "public"."transferencias_deposito_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."transferencias_deposito_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."transferencias_deposito_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."transferencias_internas" TO "anon";
GRANT ALL ON TABLE "public"."transferencias_internas" TO "authenticated";
GRANT ALL ON TABLE "public"."transferencias_internas" TO "service_role";



GRANT ALL ON SEQUENCE "public"."transferencias_internas_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."transferencias_internas_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."transferencias_internas_id_seq" TO "service_role";









ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";
































-- ------------------------------------------------------------
-- auth: alta de perfil al crear usuario
-- ------------------------------------------------------------
CREATE OR REPLACE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ------------------------------------------------------------
-- storage: buckets
-- ------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types) VALUES
  ('productos',    'productos',    true,  5242880,  ARRAY['image/jpeg','image/png','image/webp','image/avif']),
  ('eventos',      'eventos',      true,  5242880,  ARRAY['image/jpeg','image/png','image/webp','image/avif']),
  ('avatars',      'avatars',      true,  2097152,  ARRAY['image/jpeg','image/png','image/webp']),
  ('memorias',     'memorias',     true,  20971520, ARRAY['application/pdf']),
  ('documentos',   'documentos',   true,  20971520, ARRAY['application/pdf']),
  ('comprobantes', 'comprobantes', false, NULL,     NULL),
  ('extractos',    'extractos',    false, NULL,     NULL),
  ('reportes',     'reportes',     false, NULL,     NULL),
  ('popups',       'popups',       true,  5242880,  ARRAY['image/jpeg','image/png','image/webp','image/avif'])
ON CONFLICT (id) DO NOTHING;

-- ------------------------------------------------------------
-- storage: policies (copia fiel de producción)
-- ------------------------------------------------------------
CREATE POLICY avatars_public_read ON storage.objects FOR SELECT USING (bucket_id = 'avatars');
CREATE POLICY avatars_user_delete ON storage.objects FOR DELETE USING (bucket_id = 'avatars' AND auth.role() = 'authenticated');
CREATE POLICY avatars_user_insert ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'avatars' AND auth.role() = 'authenticated');
CREATE POLICY avatars_user_update ON storage.objects FOR UPDATE USING (bucket_id = 'avatars' AND auth.role() = 'authenticated');
CREATE POLICY comprobantes_storage_insert ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'comprobantes' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY comprobantes_storage_select_admin ON storage.objects FOR SELECT USING (
  bucket_id = 'comprobantes' AND auth.uid() IN (
    SELECT pr.perfil_id FROM public.perfil_roles pr JOIN public.roles r ON r.id = pr.rol_id
    WHERE r.nombre::text = ANY (ARRAY['super_admin','tienda'])
  )
);
CREATE POLICY comprobantes_storage_select_own ON storage.objects FOR SELECT USING (bucket_id = 'comprobantes' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY documentos_public_read ON storage.objects FOR SELECT USING (bucket_id = 'documentos');
CREATE POLICY documentos_staff_insert ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'documentos' AND auth.role() = 'authenticated');
CREATE POLICY eventos_public_read ON storage.objects FOR SELECT USING (bucket_id = 'eventos');
CREATE POLICY eventos_staff_delete ON storage.objects FOR DELETE USING (bucket_id = 'eventos' AND auth.role() = 'authenticated');
CREATE POLICY eventos_staff_insert ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'eventos' AND auth.role() = 'authenticated');
CREATE POLICY memorias_public_read ON storage.objects FOR SELECT USING (bucket_id = 'memorias');
CREATE POLICY memorias_staff_insert ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'memorias' AND auth.role() = 'authenticated');
CREATE POLICY popups_public_read_storage ON storage.objects FOR SELECT USING (bucket_id = 'popups');
CREATE POLICY popups_staff_delete_storage ON storage.objects FOR DELETE USING (bucket_id = 'popups' AND auth.role() = 'authenticated');
CREATE POLICY popups_staff_insert_storage ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'popups' AND auth.role() = 'authenticated');
CREATE POLICY popups_staff_update_storage ON storage.objects FOR UPDATE USING (bucket_id = 'popups' AND auth.role() = 'authenticated');
CREATE POLICY productos_public_read ON storage.objects FOR SELECT USING (bucket_id = 'productos');
CREATE POLICY productos_staff_delete ON storage.objects FOR DELETE USING (bucket_id = 'productos' AND auth.role() = 'authenticated');
CREATE POLICY productos_staff_insert ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'productos' AND auth.role() = 'authenticated');
CREATE POLICY productos_staff_update ON storage.objects FOR UPDATE USING (bucket_id = 'productos' AND auth.role() = 'authenticated');

-- El dump vacía search_path para toda la sesión; se restaura para lo que corra después (seed).
SELECT pg_catalog.set_config('search_path', '"$user", public, extensions', false);
