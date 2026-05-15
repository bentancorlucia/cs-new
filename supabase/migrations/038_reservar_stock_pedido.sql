-- ============================================
-- Migración 038: RPC atómica para reservar stock de un pedido
-- ============================================
-- Resuelve la race condition del checkout: dos pedidos simultáneos podían
-- pasar la validación contra `stock_actual` crudo y oversellear.
--
-- La función toma FOR UPDATE sobre las filas de productos/variantes
-- involucradas, lo que serializa cualquier otro checkout concurrente sobre
-- los mismos ítems. Dentro del lock calcula stock_disponible como
--   stock_actual − sum(cantidad de pedido_items en OTROS pedidos con
--                      estado='pendiente_verificacion' y stock_reservado=TRUE)
-- e inserta los `pedido_items` dentro de la misma transacción, de modo que
-- al liberar el lock el siguiente caller ya ve esas reservas.
--
-- Si algún ítem no tiene stock suficiente, devuelve {ok:false, faltantes:[...]}
-- y NO inserta nada. El caller debe borrar el pedido huérfano.

CREATE OR REPLACE FUNCTION reservar_stock_pedido(
  p_pedido_id INTEGER,
  p_items     JSONB
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

GRANT EXECUTE ON FUNCTION reservar_stock_pedido(INTEGER, JSONB) TO authenticated, service_role;

-- Helper para decrementar uso de promocode si el pedido se cae por falta de stock.
-- Se mantiene el piso en 0 por seguridad.
CREATE OR REPLACE FUNCTION decrementar_uso_promocode(p_id INTEGER)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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

GRANT EXECUTE ON FUNCTION decrementar_uso_promocode(INTEGER) TO authenticated, service_role;
