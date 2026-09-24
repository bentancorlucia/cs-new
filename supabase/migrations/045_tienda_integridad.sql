-- ============================================
-- Migración 045: Integridad de stock, dinero y estados de la tienda
-- ============================================
-- 1. Permisos: las RPC SECURITY DEFINER de stock/promocodes quedaban
--    ejecutables por cualquier usuario (incluso anon). Solo service_role.
-- 2. Trigger: productos.stock_actual = suma de variantes activas, siempre.
-- 3. `incrementar_stock_item`: la recepción de compras suma al stock en vez
--    de recalcularlo desde stock_deposito (que no refleja las ventas y
--    "deshacía" todo lo vendido).
-- 4. `confirmar_reserva_pedido`: aprobar una transferencia (o un pago) de
--    forma atómica: lock del pedido + validación + descuento de stock.
-- 5. `cancelar_pedido`: libera reserva o repone stock según el estado,
--    revierte (o compensa, si ya está conciliado) ingresos en tesorería, devuelve el uso del promocode,
--    cancela la donación y ajusta la cuenta corriente de disciplinas.
-- 6. `expirar_reservas_pendientes`: cancela pedidos online sin comprobante.
-- 7. `pedidos.fecha_venta`: momento en que el pedido pasó a venta efectiva
--    (base de reportes, alineada con la fecha del ingreso en tesorería).
-- 8. `generar_numero_pedido`: fecha en hora de Uruguay y lock para evitar
--    números duplicados con pedidos simultáneos.
-- 9. Saldo de disciplinas: se revierte si se borra un pedido no cancelado.
-- 10. `descontar_stock_pedido`: motivo del movimiento según el tipo de pedido.

-- ============================================
-- 1. Categoría de egreso para devoluciones
-- ============================================
INSERT INTO categorias_financieras (nombre, slug, tipo, color, icono, orden)
SELECT 'Devoluciones tienda', 'devoluciones-tienda', 'egreso', '#EF4444', 'Undo2', 99
WHERE NOT EXISTS (
  SELECT 1 FROM categorias_financieras WHERE slug = 'devoluciones-tienda'
);

-- `modulo` (mig 024) puede no existir en todas las bases.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public'
       AND table_name = 'categorias_financieras'
       AND column_name = 'modulo'
  ) THEN
    EXECUTE $q$UPDATE categorias_financieras SET modulo = 'tienda'
               WHERE slug = 'devoluciones-tienda'$q$;
  END IF;
END
$$;

-- ============================================
-- 2. Sincronizar stock del producto con sus variantes
-- ============================================
CREATE OR REPLACE FUNCTION trg_fn_sync_stock_producto_variantes()
RETURNS TRIGGER
LANGUAGE plpgsql
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

DROP TRIGGER IF EXISTS trg_sync_stock_producto_variantes ON producto_variantes;
CREATE TRIGGER trg_sync_stock_producto_variantes
  AFTER INSERT OR DELETE OR UPDATE OF stock_actual, activo ON producto_variantes
  FOR EACH ROW
  EXECUTE FUNCTION trg_fn_sync_stock_producto_variantes();

-- Resincronizar productos con variantes (pueden haber quedado desfasados).
UPDATE productos p
   SET stock_actual = COALESCE((
         SELECT SUM(v.stock_actual)
           FROM producto_variantes v
          WHERE v.producto_id = p.id
            AND v.activo = TRUE
       ), 0)
 WHERE EXISTS (SELECT 1 FROM producto_variantes v WHERE v.producto_id = p.id);

-- ============================================
-- 3. Sumar stock de un ítem (recepción de compras)
-- ============================================
CREATE OR REPLACE FUNCTION incrementar_stock_item(
  p_producto_id INTEGER,
  p_variante_id INTEGER,
  p_cantidad    INTEGER
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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

-- ============================================
-- 4. Motivo de movimiento de stock según el pedido
-- ============================================
CREATE OR REPLACE FUNCTION motivo_venta_pedido(p_tipo TEXT, p_numero TEXT, p_id INTEGER)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE p_tipo
           WHEN 'pos' THEN 'Venta POS'
           WHEN 'disciplina' THEN 'Pedido disciplina'
           ELSE 'Venta online'
         END || ' #' || COALESCE(p_numero, p_id::text);
$$;

-- ============================================
-- 5. descontar_stock_pedido (044) con motivo según tipo
-- ============================================
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

-- ============================================
-- 6. confirmar_reserva_pedido
-- ============================================
-- Pasa un pedido con items ya insertados (reservados) a venta efectiva:
-- descuenta el stock de los items que no son encargue y cambia el estado.
-- El lock sobre el pedido evita aprobaciones dobles (doble click / dos
-- personas): la segunda llamada ve el estado nuevo y devuelve error.
CREATE OR REPLACE FUNCTION confirmar_reserva_pedido(
  p_pedido_id       INTEGER,
  p_estado_nuevo    TEXT,
  p_registrado_por  UUID DEFAULT NULL,
  p_estado_esperado TEXT DEFAULT 'pendiente_verificacion'
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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

-- ============================================
-- 7. cancelar_pedido
-- ============================================
CREATE OR REPLACE FUNCTION cancelar_pedido(
  p_pedido_id      INTEGER,
  p_motivo         TEXT DEFAULT NULL,
  p_registrado_por UUID DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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

-- ============================================
-- 8. expirar_reservas_pendientes
-- ============================================
-- Pedidos online en 'pendiente_verificacion' sin ningún comprobante subido
-- y con más de p_horas de antigüedad: se cancelan y liberan el stock.
CREATE OR REPLACE FUNCTION expirar_reservas_pendientes(p_horas INTEGER DEFAULT 48)
RETURNS TABLE (pedido_id INTEGER)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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

-- ============================================
-- 9. fecha_venta
-- ============================================
ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS fecha_venta TIMESTAMPTZ;

CREATE OR REPLACE FUNCTION trg_fn_pedidos_fecha_venta()
RETURNS TRIGGER
LANGUAGE plpgsql
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

DROP TRIGGER IF EXISTS trg_pedidos_fecha_venta ON pedidos;
CREATE TRIGGER trg_pedidos_fecha_venta
  BEFORE INSERT OR UPDATE OF estado ON pedidos
  FOR EACH ROW
  EXECUTE FUNCTION trg_fn_pedidos_fecha_venta();

-- Backfill: si hubo verificación de comprobante, esa es la fecha de cobro.
UPDATE pedidos p
   SET fecha_venta = COALESCE(
     (SELECT MAX(c.verificado_at)
        FROM comprobantes c
       WHERE c.pedido_id = p.id
         AND c.estado = 'verificado'),
     p.created_at
   )
 WHERE p.fecha_venta IS NULL
   AND p.estado IN ('pagado', 'encargado', 'preparando', 'listo_retiro', 'retirado');

CREATE INDEX IF NOT EXISTS idx_pedidos_fecha_venta
  ON pedidos(fecha_venta) WHERE fecha_venta IS NOT NULL;

-- ============================================
-- 10. Numeración de pedidos
-- ============================================
CREATE OR REPLACE FUNCTION generar_numero_pedido()
RETURNS TRIGGER AS $$
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
$$ LANGUAGE plpgsql;

-- ============================================
-- 11. Saldo de disciplina al borrar un pedido (rollback de creación)
-- ============================================
CREATE OR REPLACE FUNCTION revertir_saldo_disciplina()
RETURNS TRIGGER AS $$
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
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_pedido_disciplina_saldo_delete ON pedidos;
CREATE TRIGGER trg_pedido_disciplina_saldo_delete
  AFTER DELETE ON pedidos
  FOR EACH ROW
  WHEN (OLD.tipo = 'disciplina')
  EXECUTE FUNCTION revertir_saldo_disciplina();

-- ============================================
-- 12. Permisos: solo el backend (service_role) ejecuta estas funciones
-- ============================================
REVOKE EXECUTE ON FUNCTION reservar_stock_pedido(INTEGER, JSONB) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION descontar_stock_pedido(INTEGER, JSONB, UUID) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION incrementar_uso_promocode(INTEGER) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION decrementar_uso_promocode(INTEGER) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION incrementar_stock_item(INTEGER, INTEGER, INTEGER) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION confirmar_reserva_pedido(INTEGER, TEXT, UUID, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION cancelar_pedido(INTEGER, TEXT, UUID) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION expirar_reservas_pendientes(INTEGER) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION reservar_stock_pedido(INTEGER, JSONB) TO service_role;
GRANT EXECUTE ON FUNCTION descontar_stock_pedido(INTEGER, JSONB, UUID) TO service_role;
GRANT EXECUTE ON FUNCTION incrementar_uso_promocode(INTEGER) TO service_role;
GRANT EXECUTE ON FUNCTION decrementar_uso_promocode(INTEGER) TO service_role;
GRANT EXECUTE ON FUNCTION incrementar_stock_item(INTEGER, INTEGER, INTEGER) TO service_role;
GRANT EXECUTE ON FUNCTION confirmar_reserva_pedido(INTEGER, TEXT, UUID, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION cancelar_pedido(INTEGER, TEXT, UUID) TO service_role;
GRANT EXECUTE ON FUNCTION expirar_reservas_pendientes(INTEGER) TO service_role;
