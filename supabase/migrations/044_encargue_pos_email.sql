-- ============================================
-- Migración 044: Encargues desde el POS + email para avisos
-- ============================================
-- 1. `pedidos.email_cliente`: email de contacto para clientes presenciales
--    sin cuenta. Los avisos por mail (confirmación, listo para retirar,
--    cancelación) usan el email de la cuenta si hay `perfil_id`, y si no
--    este campo.
-- 2. `descontar_stock_pedido` (mig 039) no salteaba los items de encargue:
--    ahora que el POS puede vender bajo encargue en efectivo, esos items se
--    insertan pero no se validan ni descuentan contra stock (igual que
--    `reservar_stock_pedido`).

ALTER TABLE pedidos
  ADD COLUMN IF NOT EXISTS email_cliente VARCHAR(255);

CREATE OR REPLACE FUNCTION descontar_stock_pedido(
  p_pedido_id        INTEGER,
  p_items            JSONB,
  p_registrado_por   UUID
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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
  v_numero_pedido    TEXT;
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
  SELECT numero_pedido INTO v_numero_pedido FROM pedidos WHERE id = p_pedido_id;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    IF COALESCE((v_item->>'es_encargue')::boolean, false) THEN
      CONTINUE;
    END IF;

    v_producto_id := (v_item->>'producto_id')::int;
    v_variante_id := NULLIF(v_item->>'variante_id','')::int;
    v_cantidad    := (v_item->>'cantidad')::int;

    IF v_variante_id IS NOT NULL THEN
      SELECT stock_actual INTO v_stock FROM producto_variantes WHERE id = v_variante_id;
      v_stock_nuevo := v_stock - v_cantidad;

      UPDATE producto_variantes
         SET stock_actual = v_stock_nuevo
       WHERE id = v_variante_id;

      -- Recalcular stock del producto padre = suma de variantes activas.
      UPDATE productos p
         SET stock_actual = COALESCE((
               SELECT SUM(stock_actual)
                 FROM producto_variantes
                WHERE producto_id = p.id
                  AND activo = TRUE
             ), 0),
             updated_at = NOW()
       WHERE p.id = v_producto_id;

      INSERT INTO stock_movimientos (
        producto_id, variante_id, tipo, cantidad,
        stock_anterior, stock_nuevo,
        referencia_tipo, referencia_id, motivo, registrado_por
      ) VALUES (
        v_producto_id, v_variante_id, 'venta', -v_cantidad,
        v_stock, v_stock_nuevo,
        'pedido', p_pedido_id,
        'Venta POS #' || COALESCE(v_numero_pedido, p_pedido_id::text),
        p_registrado_por
      );
    ELSE
      SELECT stock_actual INTO v_stock FROM productos WHERE id = v_producto_id;
      v_stock_nuevo := v_stock - v_cantidad;

      UPDATE productos
         SET stock_actual = v_stock_nuevo,
             updated_at = NOW()
       WHERE id = v_producto_id;

      INSERT INTO stock_movimientos (
        producto_id, variante_id, tipo, cantidad,
        stock_anterior, stock_nuevo,
        referencia_tipo, referencia_id, motivo, registrado_por
      ) VALUES (
        v_producto_id, NULL, 'venta', -v_cantidad,
        v_stock, v_stock_nuevo,
        'pedido', p_pedido_id,
        'Venta POS #' || COALESCE(v_numero_pedido, p_pedido_id::text),
        p_registrado_por
      );
    END IF;
  END LOOP;

  RETURN jsonb_build_object('ok', true);
END
$$;

GRANT EXECUTE ON FUNCTION descontar_stock_pedido(INTEGER, JSONB, UUID) TO authenticated, service_role;
