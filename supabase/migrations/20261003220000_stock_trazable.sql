-- ============================================================
-- Stock con trazabilidad plena
--
-- El stock solo se mueve por estos caminos, cada uno con documento,
-- responsable, kardex y asiento:
--   compra (recepción) · devolución a proveedor (nota de crédito)
--   venta · cancelación · devolución o cambio de cliente (pedido)
--   recuento físico (faltantes y sobrantes contra lo contado)
--   baja de mercadería tipificada (rotura, vencimiento, robo, uso
--   interno, donación, muestra)
--   inventario inicial (una vez por ítem; tesorero o super_admin)
-- Se elimina el "ajuste" libre de stock.
--
-- La base garantiza que un ítem no cambia de stock ni de valor sin un
-- movimiento en el kardex que lo explique, y cada movimiento y asiento
-- registra quién operó, también cuando la ruta usa service role (las
-- funciones de pedidos reciben p_registrado_por).
-- ============================================================

-- ------------------------------------------------------------
-- Quién opera
-- ------------------------------------------------------------
CREATE FUNCTION contabilidad._usuario() RETURNS uuid
LANGUAGE sql STABLE SET search_path = '' AS $$
  SELECT coalesce(auth.uid(), nullif(current_setting('app.usuario', true), '')::uuid);
$$;
GRANT EXECUTE ON FUNCTION contabilidad._usuario() TO authenticated, service_role;

ALTER TABLE contabilidad.asientos ALTER COLUMN creado_por SET DEFAULT contabilidad._usuario();
ALTER TABLE comercial.movimientos ALTER COLUMN creado_por SET DEFAULT contabilidad._usuario();

CREATE OR REPLACE FUNCTION contabilidad._asiento_antes() RETURNS trigger
LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE
  v_proceso text := contabilidad._proceso();
  v_lineas integer;
  v_debe numeric;
  v_haber numeric;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.estado <> 'borrador' OR NEW.numero IS NOT NULL THEN
      RAISE EXCEPTION 'Los asientos se crean como borrador y se confirman después de cargar las líneas';
    END IF;
    IF NEW.tipo IN ('apertura', 'cierre', 'refundicion', 'revaluacion', 'reversion')
       AND v_proceso <> 'sistema' THEN
      RAISE EXCEPTION 'Los asientos de tipo % solo los genera el sistema', NEW.tipo;
    END IF;
    SELECT o_periodo, o_ejercicio INTO NEW.periodo_id, NEW.ejercicio_id
      FROM contabilidad._periodo_para(NEW.fecha);
    NEW.confirmado_por := NULL;
    NEW.confirmado_at := NULL;
    NEW.revertido_por_id := NULL;
    RETURN NEW;
  END IF;

  IF TG_OP = 'DELETE' THEN
    IF v_proceso = 'reapertura' AND OLD.tipo IN ('apertura', 'cierre', 'refundicion', 'revaluacion') THEN
      RETURN OLD;
    END IF;
    IF OLD.estado <> 'borrador' THEN
      RAISE EXCEPTION 'El asiento % está confirmado: no se borra, se revierte', OLD.numero;
    END IF;
    IF NOT contabilidad._periodo_abierto(OLD.periodo_id) THEN
      RAISE EXCEPTION 'El período del asiento está cerrado';
    END IF;
    RETURN OLD;
  END IF;

  -- UPDATE
  IF OLD.estado = 'confirmado' THEN
    -- Única modificación posible: marcarlo como revertido (lo hace la
    -- función de reversión).
    IF v_proceso = 'sistema'
       AND OLD.revertido_por_id IS NULL AND NEW.revertido_por_id IS NOT NULL
       AND (to_jsonb(NEW) - 'revertido_por_id') = (to_jsonb(OLD) - 'revertido_por_id') THEN
      RETURN NEW;
    END IF;
    RAISE EXCEPTION 'El asiento % está confirmado y no se puede modificar: revertilo', OLD.numero;
  END IF;

  IF NOT contabilidad._periodo_abierto(OLD.periodo_id) THEN
    RAISE EXCEPTION 'El período del asiento está cerrado';
  END IF;
  IF NEW.tipo <> OLD.tipo OR NEW.origen_tipo IS DISTINCT FROM OLD.origen_tipo
     OR NEW.origen_id IS DISTINCT FROM OLD.origen_id
     OR NEW.asiento_revertido_id IS DISTINCT FROM OLD.asiento_revertido_id
     OR NEW.revertido_por_id IS NOT NULL
     OR NEW.creado_por IS DISTINCT FROM OLD.creado_por
     OR NEW.created_at <> OLD.created_at THEN
    RAISE EXCEPTION 'No se puede cambiar el tipo ni el origen de un asiento';
  END IF;
  IF NEW.fecha <> OLD.fecha THEN
    SELECT o_periodo, o_ejercicio INTO NEW.periodo_id, NEW.ejercicio_id
      FROM contabilidad._periodo_para(NEW.fecha);
    IF NEW.tipo = 'apertura' THEN
      RAISE EXCEPTION 'La fecha del asiento de apertura no se cambia';
    END IF;
  ELSIF NEW.periodo_id <> OLD.periodo_id OR NEW.ejercicio_id <> OLD.ejercicio_id THEN
    RAISE EXCEPTION 'El período se deriva de la fecha';
  END IF;

  IF NEW.estado = 'confirmado' THEN
    SELECT count(*), coalesce(sum(debe), 0), coalesce(sum(haber), 0)
      INTO v_lineas, v_debe, v_haber
    FROM contabilidad.lineas WHERE asiento_id = NEW.id;

    IF v_lineas < 2 THEN
      RAISE EXCEPTION 'Un asiento necesita al menos dos líneas';
    END IF;
    IF v_debe <> v_haber THEN
      RAISE EXCEPTION 'El asiento no cuadra: debe % ≠ haber %', v_debe, v_haber;
    END IF;
    IF NEW.tipo <> 'apertura' AND EXISTS (
      SELECT 1 FROM contabilidad.asientos a
      WHERE a.ejercicio_id = NEW.ejercicio_id AND a.tipo = 'apertura'
        AND a.revertido_por_id IS NULL AND a.fecha > NEW.fecha
    ) THEN
      RAISE EXCEPTION 'La fecha es anterior al asiento de apertura del ejercicio';
    END IF;

    INSERT INTO contabilidad.numeradores AS n (ejercicio_id, ultimo)
    VALUES (NEW.ejercicio_id, 1)
    ON CONFLICT (ejercicio_id) DO UPDATE SET ultimo = n.ultimo + 1
    RETURNING ultimo INTO NEW.numero;

    NEW.confirmado_at := now();
    NEW.confirmado_por := contabilidad._usuario();
  ELSE
    NEW.numero := NULL;
    NEW.confirmado_at := NULL;
    NEW.confirmado_por := NULL;
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION contabilidad._auditar() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_antes jsonb := CASE WHEN TG_OP <> 'INSERT' THEN to_jsonb(OLD) END;
  v_despues jsonb := CASE WHEN TG_OP <> 'DELETE' THEN to_jsonb(NEW) END;
BEGIN
  INSERT INTO contabilidad.auditoria (tabla, registro_id, accion, antes, despues, usuario_id, proceso)
  VALUES (
    TG_TABLE_NAME,
    coalesce(v_despues, v_antes) ->> CASE WHEN TG_TABLE_NAME IN ('cotizaciones') THEN 'fecha'
                                          WHEN TG_TABLE_NAME IN ('cuentas_sistema') THEN 'rol'
                                          WHEN TG_TABLE_NAME IN ('config') THEN 'id'
                                          WHEN TG_TABLE_NAME IN ('numeradores') THEN 'ejercicio_id'
                                          ELSE 'id' END,
    TG_OP, v_antes, v_despues, contabilidad._usuario(), nullif(contabilidad._proceso(), '')
  );
  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION comercial._item(p_producto integer, p_variante integer) RETURNS comercial.items
LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE
  v_item comercial.items;
BEGIN
  IF p_variante IS NULL AND EXISTS (SELECT 1 FROM public.producto_variantes WHERE producto_id = p_producto) THEN
    RAISE EXCEPTION 'El producto % tiene variantes: indicá cuál', p_producto;
  END IF;
  IF p_variante IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.producto_variantes WHERE id = p_variante AND producto_id = p_producto
  ) THEN
    RAISE EXCEPTION 'La variante % no es del producto %', p_variante, p_producto;
  END IF;

  SELECT * INTO v_item FROM comercial.items
  WHERE producto_id = p_producto AND coalesce(variante_id, 0) = coalesce(p_variante, 0)
  FOR UPDATE;
  IF v_item.id IS NOT NULL THEN
    RETURN v_item;
  END IF;

  INSERT INTO comercial.items (producto_id, variante_id) VALUES (p_producto, p_variante)
  ON CONFLICT DO NOTHING;
  SELECT * INTO v_item FROM comercial.items
  WHERE producto_id = p_producto AND coalesce(variante_id, 0) = coalesce(p_variante, 0)
  FOR UPDATE;

  -- Stock anterior al motor sin inicializar: no se crea en silencio.
  IF (p_variante IS NOT NULL AND (SELECT stock_actual FROM public.producto_variantes WHERE id = p_variante) > 0)
     OR (p_variante IS NULL AND (SELECT stock_actual FROM public.productos WHERE id = p_producto) > 0) THEN
    RAISE EXCEPTION 'El producto % tiene stock sin registrar en el kardex: cargalo como inventario inicial', p_producto;
  END IF;
  RETURN v_item;
END;
$$;

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
  -- Quién opera (las rutas llaman con service role, sin auth.uid())
  PERFORM set_config('app.usuario', coalesce(p_registrado_por::text, ''), true);
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

  -- 5) Salida por el motor de costos (kardex valorizado) y asiento de la
  --    venta en la misma transacción. Efectivo del POS → caja; pedido de
  --    disciplina → su cuenta corriente.
  SELECT motivo_venta_pedido(tipo, numero_pedido, id)
    INTO v_motivo
    FROM pedidos
   WHERE id = p_pedido_id;

  PERFORM comercial._contabilizar_venta(
    p_pedido_id,
    CASE WHEN (SELECT tipo FROM pedidos WHERE id = p_pedido_id) = 'disciplina' THEN 'disciplina' ELSE 'caja' END,
    comercial._salida_pedido(p_pedido_id, v_motivo));

  -- Kardex viejo (lo leen las pantallas actuales de stock)
  INSERT INTO stock_movimientos (
    producto_id, variante_id, tipo, cantidad, stock_anterior, stock_nuevo,
    referencia_tipo, referencia_id, motivo, registrado_por
  )
  SELECT i.producto_id, i.variante_id, 'venta', -i.cantidad,
         coalesce(v.stock_actual, p.stock_actual) + i.cantidad, coalesce(v.stock_actual, p.stock_actual),
         'pedido', p_pedido_id, v_motivo, p_registrado_por
  FROM pedido_items i
  JOIN productos p ON p.id = i.producto_id
  LEFT JOIN producto_variantes v ON v.id = i.variante_id
  WHERE i.pedido_id = p_pedido_id AND NOT i.es_encargue;

  RETURN jsonb_build_object('ok', true);
END
$$;

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
  -- Quién opera (las rutas llaman con service role, sin auth.uid())
  PERFORM set_config('app.usuario', coalesce(p_registrado_por::text, ''), true);
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

    v_stock := COALESCE(v_stock, 0) - COALESCE((
      SELECT SUM(pi.cantidad) FROM pedido_items pi JOIN pedidos pe ON pe.id = pi.pedido_id
       WHERE pi.producto_id = r.producto_id
         AND COALESCE(pi.variante_id, 0) = COALESCE(r.variante_id, 0)
         AND NOT pi.es_encargue AND pe.estado = 'pendiente_verificacion'
         AND pe.stock_reservado AND pe.id <> p_pedido_id), 0);

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

  -- Salida por el motor de costos y asiento de la venta (cobro por
  -- transferencia a la cuenta bancaria de la tienda).
  PERFORM comercial._contabilizar_venta(p_pedido_id, 'banco', comercial._salida_pedido(p_pedido_id, v_motivo));

  INSERT INTO stock_movimientos (
    producto_id, variante_id, tipo, cantidad, stock_anterior, stock_nuevo,
    referencia_tipo, referencia_id, motivo, registrado_por
  )
  SELECT i.producto_id, i.variante_id, 'venta', -i.cantidad,
         coalesce(v.stock_actual, p.stock_actual) + i.cantidad, coalesce(v.stock_actual, p.stock_actual),
         'pedido', p_pedido_id, v_motivo, p_registrado_por
  FROM pedido_items i
  JOIN productos p ON p.id = i.producto_id
  LEFT JOIN producto_variantes v ON v.id = i.variante_id
  WHERE i.pedido_id = p_pedido_id AND NOT i.es_encargue;

  UPDATE pedidos
     SET estado = p_estado_nuevo,
         stock_reservado = FALSE,
         updated_at = NOW()
   WHERE id = p_pedido_id;

  RETURN jsonb_build_object('ok', true, 'estado', p_estado_nuevo);
END
$$;

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
  v_anulacion      JSONB;
BEGIN
  -- Quién opera (las rutas llaman con service role, sin auth.uid())
  PERFORM set_config('app.usuario', coalesce(p_registrado_por::text, ''), true);
  SELECT * INTO v_pedido FROM pedidos WHERE id = p_pedido_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'no_encontrado');
  END IF;

  IF v_pedido.estado = 'cancelado' THEN
    RETURN jsonb_build_object('ok', true, 'ya_cancelado', true);
  END IF;

  -- En 'pendiente' / 'pendiente_verificacion' el stock solo estaba reservado:
  -- alcanza con cambiar el estado para liberarlo.
  -- Asientos del pedido y mercadería: reversión y devolución al mismo
  -- costo con que salió (el motor sabe qué salió por el kardex).
  v_anulacion := comercial._anular_pedido(p_pedido_id, p_motivo);
  v_desconto_stock := (v_anulacion ->> 'unidades_devueltas')::int > 0;

  IF v_desconto_stock THEN
    v_motivo_stock := 'Cancelación pedido #'
      || COALESCE(v_pedido.numero_pedido, v_pedido.id::text)
      || COALESCE(': ' || NULLIF(p_motivo, ''), '');
    INSERT INTO stock_movimientos (
      producto_id, variante_id, tipo, cantidad, stock_anterior, stock_nuevo,
      referencia_tipo, referencia_id, motivo, registrado_por
    )
    SELECT i.producto_id, i.variante_id, 'devolucion', i.cantidad,
           coalesce(v.stock_actual, p.stock_actual) - i.cantidad, coalesce(v.stock_actual, p.stock_actual),
           'pedido', p_pedido_id, v_motivo_stock, p_registrado_por
    FROM pedido_items i
    JOIN productos p ON p.id = i.producto_id
    LEFT JOIN producto_variantes v ON v.id = i.variante_id
    WHERE i.pedido_id = p_pedido_id AND NOT i.es_encargue;
  END IF;

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
    'asientos_revertidos', (v_anulacion ->> 'asientos_revertidos')::int
  );
END
$$;

-- ------------------------------------------------------------
-- Ningún cambio de stock sin movimiento en el kardex
-- ------------------------------------------------------------
CREATE FUNCTION comercial._item_explicado() RETURNS trigger
LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE
  v_ultimo comercial.movimientos;
BEGIN
  IF NEW.stock = OLD.stock AND NEW.valor = OLD.valor THEN
    RETURN NEW;
  END IF;
  SELECT * INTO v_ultimo FROM comercial.movimientos WHERE item_id = NEW.id ORDER BY id DESC LIMIT 1;
  IF v_ultimo.id IS NULL OR v_ultimo.stock_resultante <> NEW.stock OR v_ultimo.valor_resultante <> NEW.valor THEN
    RAISE EXCEPTION 'El stock del ítem % cambió sin un movimiento en el kardex que lo explique', NEW.id;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER items_explicado BEFORE UPDATE OF stock, valor ON comercial.items
  FOR EACH ROW EXECUTE FUNCTION comercial._item_explicado();

ALTER TABLE comercial.movimientos DROP CONSTRAINT movimientos_tipo_check;
ALTER TABLE comercial.movimientos ADD CONSTRAINT movimientos_tipo_check CHECK (tipo IN (
  'inventario_inicial', 'compra', 'venta', 'devolucion_venta', 'devolucion_compra', 'recuento', 'baja',
  'ajuste'  -- histórico: ya no se genera
));

DROP FUNCTION comercial.ajustar_stock(integer, integer, integer, text, numeric);

-- ------------------------------------------------------------
-- Inventario inicial: una vez por ítem, tesorero o super_admin
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION comercial.cargar_inventario_inicial(p_items jsonb) RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_i jsonb;
  v_item comercial.items;
  v_n integer := 0;
  v_claims text := current_setting('request.jwt.claims', true);
BEGIN
  IF NOT (v_claims IS NULL OR v_claims = '' OR (v_claims::jsonb ->> 'role') = 'service_role'
          OR contabilidad._tiene_rol(ARRAY['super_admin', 'tesorero'])) THEN
    RAISE EXCEPTION 'El inventario inicial lo carga el tesorero' USING ERRCODE = '42501';
  END IF;
  FOR v_i IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    IF (v_i ->> 'cantidad')::int IS NULL OR (v_i ->> 'cantidad')::int <= 0
       OR (v_i ->> 'costo_unitario')::numeric IS NULL OR (v_i ->> 'costo_unitario')::numeric < 0 THEN
      RAISE EXCEPTION 'Cantidad y costo del producto % inválidos', v_i ->> 'producto_id';
    END IF;
    v_item := comercial._item((v_i ->> 'producto_id')::int, nullif(v_i ->> 'variante_id', '')::int);
    IF EXISTS (SELECT 1 FROM comercial.movimientos WHERE item_id = v_item.id) THEN
      RAISE EXCEPTION 'El producto % ya tiene movimientos de stock: las diferencias se registran con un recuento',
        v_i ->> 'producto_id';
    END IF;
    PERFORM comercial._entrada(v_item.id, (v_i ->> 'cantidad')::int, (v_i ->> 'costo_unitario')::numeric,
                               contabilidad._hoy(), 'inventario_inicial', 'inventario_inicial', v_item.id::text,
                               coalesce(nullif(btrim(v_i ->> 'motivo'), ''), 'Inventario inicial'));
    v_n := v_n + 1;
  END LOOP;
  RETURN v_n;
END;
$$;

-- ------------------------------------------------------------
-- Bajas de mercadería
-- ------------------------------------------------------------
CREATE SEQUENCE comercial.numero_baja;

CREATE TABLE comercial.bajas (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  numero text NOT NULL UNIQUE DEFAULT 'BAJA-' || lpad(nextval('comercial.numero_baja')::text, 5, '0'),
  fecha date NOT NULL DEFAULT contabilidad._hoy(),
  tipo text NOT NULL CHECK (tipo IN ('rotura', 'vencimiento', 'robo_extravio', 'uso_interno', 'donacion', 'muestra', 'otro')),
  descripcion text NOT NULL CHECK (length(btrim(descripcion)) >= 5),
  centro_costo_id uuid REFERENCES contabilidad.centros_costo (id),
  asiento_id uuid REFERENCES contabilidad.asientos (id),
  creado_por uuid DEFAULT contabilidad._usuario(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE comercial.baja_items (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  baja_id bigint NOT NULL REFERENCES comercial.bajas (id) ON DELETE RESTRICT,
  item_id bigint NOT NULL REFERENCES comercial.items (id) ON DELETE RESTRICT,
  cantidad integer NOT NULL CHECK (cantidad > 0),
  valor numeric(18, 2) NOT NULL CHECK (valor >= 0)
);


-- p_items: [{ producto_id, variante_id?, cantidad }]
CREATE FUNCTION comercial.registrar_baja(
  p_tipo text, p_descripcion text, p_items jsonb, p_centro_costo uuid DEFAULT NULL
) RETURNS bigint
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_id bigint;
  v_i jsonb;
  v_item comercial.items;
  v_valor numeric;
  v_total numeric := 0;
  v_asiento uuid;
BEGIN
  PERFORM comercial._exigir_operador();
  IF p_items IS NULL OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'La baja no tiene productos';
  END IF;
  INSERT INTO comercial.bajas (tipo, descripcion, centro_costo_id)
  VALUES (p_tipo, btrim(p_descripcion), coalesce(p_centro_costo,
          (SELECT id FROM contabilidad.centros_costo WHERE codigo = 'TIENDA')))
  RETURNING id INTO v_id;
  FOR v_i IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    v_item := comercial._item((v_i ->> 'producto_id')::int, nullif(v_i ->> 'variante_id', '')::int);
    v_valor := comercial._salida(v_item.id, (v_i ->> 'cantidad')::int, contabilidad._hoy(), 'baja',
                                 'baja', v_id::text, initcap(replace(p_tipo, '_', ' ')) || ': ' || btrim(p_descripcion));
    INSERT INTO comercial.baja_items (baja_id, item_id, cantidad, valor)
    VALUES (v_id, v_item.id, (v_i ->> 'cantidad')::int, v_valor);
    v_total := v_total + v_valor;
  END LOOP;
  IF v_total > 0 THEN
    v_asiento := contabilidad._asiento_automatico(contabilidad._hoy(),
      'Baja de mercadería (' || replace(p_tipo, '_', ' ') || '): ' || btrim(p_descripcion),
      'baja', v_id::text, jsonb_build_array(
        jsonb_build_object('cuenta_id', comercial._cuenta('ajustes_stock'), 'lado', 'debe', 'importe', v_total,
                           'centro_costo_id', (SELECT centro_costo_id FROM comercial.bajas WHERE id = v_id)),
        jsonb_build_object('cuenta_id', comercial._cuenta('mercaderia'), 'lado', 'haber', 'importe', v_total)));
    UPDATE comercial.bajas SET asiento_id = v_asiento WHERE id = v_id;
    PERFORM comercial._vincular_asiento('baja', v_id::text, v_asiento);
  END IF;
  RETURN v_id;
END;
$$;

-- ------------------------------------------------------------
-- Recuentos físicos
-- ------------------------------------------------------------
CREATE SEQUENCE comercial.numero_recuento;

CREATE TABLE comercial.recuentos (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  numero text NOT NULL UNIQUE DEFAULT 'RECU-' || lpad(nextval('comercial.numero_recuento')::text, 5, '0'),
  estado text NOT NULL DEFAULT 'borrador' CHECK (estado IN ('borrador', 'confirmado', 'descartado')),
  notas text,
  creado_por uuid DEFAULT contabilidad._usuario(),
  created_at timestamptz NOT NULL DEFAULT now(),
  confirmado_por uuid,
  confirmado_at timestamptz,
  asiento_id uuid REFERENCES contabilidad.asientos (id),
  CHECK ((estado = 'confirmado') = (confirmado_at IS NOT NULL))
);

CREATE TABLE comercial.recuento_items (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  recuento_id bigint NOT NULL REFERENCES comercial.recuentos (id) ON DELETE CASCADE,
  item_id bigint NOT NULL REFERENCES comercial.items (id) ON DELETE RESTRICT,
  contado integer NOT NULL CHECK (contado >= 0),
  -- al confirmar
  stock_sistema integer,
  diferencia integer,
  valor numeric(18, 2),
  UNIQUE (recuento_id, item_id)
);

-- Guarda (o reemplaza) lo contado de un recuento en borrador.
--   p_conteos: [{ producto_id, variante_id?, contado }]
CREATE FUNCTION comercial.guardar_recuento(p_id bigint, p_conteos jsonb, p_notas text DEFAULT NULL) RETURNS bigint
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_id bigint := p_id;
  v_c jsonb;
  v_item comercial.items;
BEGIN
  PERFORM comercial._exigir_operador();
  IF v_id IS NULL THEN
    INSERT INTO comercial.recuentos (notas) VALUES (p_notas) RETURNING id INTO v_id;
  ELSE
    UPDATE comercial.recuentos SET notas = coalesce(p_notas, notas) WHERE id = v_id AND estado = 'borrador';
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Solo se edita un recuento en borrador';
    END IF;
  END IF;
  FOR v_c IN SELECT * FROM jsonb_array_elements(coalesce(p_conteos, '[]')) LOOP
    v_item := comercial._item((v_c ->> 'producto_id')::int, nullif(v_c ->> 'variante_id', '')::int);
    INSERT INTO comercial.recuento_items (recuento_id, item_id, contado)
    VALUES (v_id, v_item.id, (v_c ->> 'contado')::int)
    ON CONFLICT (recuento_id, item_id) DO UPDATE SET contado = EXCLUDED.contado;
  END LOOP;
  RETURN v_id;
END;
$$;

-- Confirma: compara lo contado con el stock de ese momento y registra
-- las diferencias (faltante al costo vigente, sobrante al costo
-- promedio o último costo) con un solo asiento.
CREATE FUNCTION comercial.confirmar_recuento(p_id bigint) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_r comercial.recuentos;
  ri record;
  v_item comercial.items;
  v_dif integer;
  v_costo numeric;
  v_valor numeric;
  v_faltante numeric := 0;
  v_sobrante numeric := 0;
  v_lineas jsonb := '[]'::jsonb;
  v_asiento uuid;
  v_centro uuid := (SELECT id FROM contabilidad.centros_costo WHERE codigo = 'TIENDA');
BEGIN
  PERFORM comercial._exigir_operador();
  SELECT * INTO v_r FROM comercial.recuentos WHERE id = p_id FOR UPDATE;
  IF v_r.estado IS DISTINCT FROM 'borrador' THEN
    RAISE EXCEPTION 'El recuento no está en borrador';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM comercial.recuento_items WHERE recuento_id = p_id) THEN
    RAISE EXCEPTION 'El recuento no tiene productos contados';
  END IF;

  FOR ri IN SELECT * FROM comercial.recuento_items WHERE recuento_id = p_id ORDER BY item_id LOOP
    SELECT * INTO v_item FROM comercial.items WHERE id = ri.item_id FOR UPDATE;
    v_dif := ri.contado - v_item.stock;
    v_valor := 0;
    IF v_dif < 0 THEN
      v_valor := -comercial._salida(v_item.id, -v_dif, contabilidad._hoy(), 'recuento', 'recuento', p_id::text,
                                    'Faltante en recuento ' || v_r.numero);
      v_faltante := v_faltante - v_valor;
    ELSIF v_dif > 0 THEN
      v_costo := coalesce(CASE WHEN v_item.stock > 0 THEN v_item.valor / v_item.stock END,
                          (SELECT costo_unitario FROM comercial.movimientos WHERE item_id = v_item.id
                             AND costo_unitario > 0 ORDER BY id DESC LIMIT 1), 0);
      v_valor := comercial._entrada(v_item.id, v_dif, v_costo, contabilidad._hoy(), 'recuento', 'recuento', p_id::text,
                                    'Sobrante en recuento ' || v_r.numero);
      v_sobrante := v_sobrante + v_valor;
    END IF;
    UPDATE comercial.recuento_items SET stock_sistema = v_item.stock, diferencia = v_dif, valor = v_valor
    WHERE id = ri.id;
  END LOOP;

  IF v_faltante > 0 THEN
    v_lineas := v_lineas
      || jsonb_build_object('cuenta_id', comercial._cuenta('ajustes_stock'), 'lado', 'debe', 'importe', v_faltante,
                            'centro_costo_id', v_centro, 'descripcion', 'Faltantes de inventario')
      || jsonb_build_object('cuenta_id', comercial._cuenta('mercaderia'), 'lado', 'haber', 'importe', v_faltante);
  END IF;
  IF v_sobrante > 0 THEN
    v_lineas := v_lineas
      || jsonb_build_object('cuenta_id', comercial._cuenta('mercaderia'), 'lado', 'debe', 'importe', v_sobrante)
      || jsonb_build_object('cuenta_id', comercial._cuenta('ajustes_stock'), 'lado', 'haber', 'importe', v_sobrante,
                            'centro_costo_id', v_centro, 'descripcion', 'Sobrantes de inventario');
  END IF;
  IF jsonb_array_length(v_lineas) > 0 THEN
    v_asiento := contabilidad._asiento_automatico(contabilidad._hoy(), 'Recuento de inventario ' || v_r.numero,
      'recuento', p_id::text, v_lineas);
    PERFORM comercial._vincular_asiento('recuento', p_id::text, v_asiento);
  END IF;

  UPDATE comercial.recuentos SET estado = 'confirmado', confirmado_por = contabilidad._usuario(),
         confirmado_at = now(), asiento_id = v_asiento
  WHERE id = p_id;
  RETURN jsonb_build_object('faltante', v_faltante, 'sobrante', v_sobrante, 'asiento_id', v_asiento);
END;
$$;

CREATE FUNCTION comercial.descartar_recuento(p_id bigint) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  PERFORM comercial._exigir_operador();
  UPDATE comercial.recuentos SET estado = 'descartado' WHERE id = p_id AND estado = 'borrador';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Solo se descarta un recuento en borrador';
  END IF;
END;
$$;

-- ------------------------------------------------------------
-- RLS y permisos
-- ------------------------------------------------------------
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['bajas', 'baja_items', 'recuentos', 'recuento_items'] LOOP
    EXECUTE format('ALTER TABLE comercial.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('CREATE POLICY %I ON comercial.%I FOR SELECT TO authenticated USING (comercial.puede_ver())',
                   t || '_lectura', t);
  END LOOP;
END;
$$;
REVOKE ALL ON comercial.bajas, comercial.baja_items, comercial.recuentos, comercial.recuento_items FROM PUBLIC, anon, authenticated;
GRANT SELECT ON comercial.bajas, comercial.baja_items, comercial.recuentos, comercial.recuento_items TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION comercial._item_explicado() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION comercial.registrar_baja(text, text, jsonb, uuid), comercial.guardar_recuento(bigint, jsonb, text),
  comercial.confirmar_recuento(bigint), comercial.descartar_recuento(bigint) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION comercial.registrar_baja(text, text, jsonb, uuid), comercial.guardar_recuento(bigint, jsonb, text),
  comercial.confirmar_recuento(bigint), comercial.descartar_recuento(bigint) TO authenticated, service_role;
