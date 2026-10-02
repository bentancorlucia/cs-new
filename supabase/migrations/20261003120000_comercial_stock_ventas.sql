-- ============================================================
-- Comercial — stock valorizado y contabilización de ventas
--
-- Motor nuevo de stock (schema `comercial`): cada ítem vendible
-- (producto sin variantes o variante) tiene existencia y valor; el
-- kardex guarda cantidad, costo y valor de cada movimiento. Costeo
-- por producto: promedio ponderado móvil o FIFO.
--
-- Las funciones de pedidos que usa la tienda (checkout, POS,
-- aprobación, disciplinas, cancelación) conservan nombre y firma,
-- pero ahora mueven stock por el motor y generan el asiento en la
-- misma transacción:
--   venta cobrada     D Banco/Caja/Disciplina  H Ventas · Señas · Donaciones
--   costo             D Costo de ventas        H Mercadería
--   efectivo de mixto D Caja                   H Señas (hasta aprobar la transferencia)
--   encargue          al cobrar va a Señas; al retirarlo, D Señas H Ventas
--   cancelación       reversión de los asientos + la mercadería vuelve al costo de salida
-- productos.stock_actual / producto_variantes.stock_actual quedan como
-- espejo del motor (los lee el storefront) y no se pueden escribir a mano.
-- ============================================================

CREATE SCHEMA IF NOT EXISTS comercial;
GRANT USAGE ON SCHEMA comercial TO authenticated, service_role;

-- ------------------------------------------------------------
-- Reversión interna (la usan los procesos; revertir_asiento exige tesorero)
-- ------------------------------------------------------------
CREATE FUNCTION contabilidad._revertir(p_id uuid, p_motivo text, p_fecha date) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_orig contabilidad.asientos%ROWTYPE;
  v_id uuid;
  v_proceso text := contabilidad._proceso();
BEGIN
  SELECT * INTO v_orig FROM contabilidad.asientos WHERE id = p_id FOR UPDATE;
  IF v_orig.id IS NULL OR v_orig.estado <> 'confirmado' OR v_orig.revertido_por_id IS NOT NULL THEN
    RAISE EXCEPTION 'El asiento no existe, no está confirmado o ya fue revertido';
  END IF;

  PERFORM set_config('contabilidad.proceso', 'sistema', true);
  INSERT INTO contabilidad.asientos (fecha, descripcion, tipo, asiento_revertido_id, motivo)
  VALUES (greatest(p_fecha, v_orig.fecha),
          'Reversión del asiento ' || v_orig.numero || ': ' || v_orig.descripcion,
          'reversion', v_orig.id, btrim(p_motivo))
  RETURNING id INTO v_id;

  INSERT INTO contabilidad.lineas (
    asiento_id, orden, cuenta_id, descripcion, debe, haber,
    moneda, importe_origen, tc, centro_costo_id, proveedor_id, disciplina_id
  )
  SELECT v_id, l.orden, l.cuenta_id, l.descripcion, l.haber, l.debe,
         l.moneda, l.importe_origen, l.tc, l.centro_costo_id, l.proveedor_id, l.disciplina_id
  FROM contabilidad.lineas l WHERE l.asiento_id = v_orig.id;

  UPDATE contabilidad.asientos SET estado = 'confirmado' WHERE id = v_id;
  UPDATE contabilidad.asientos SET revertido_por_id = v_id WHERE id = v_orig.id;
  PERFORM set_config('contabilidad.proceso', v_proceso, true);
  RETURN v_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION contabilidad._revertir(uuid, text, date) FROM PUBLIC, anon, authenticated;

-- ------------------------------------------------------------
-- Permisos
-- ------------------------------------------------------------
CREATE FUNCTION comercial.puede_ver() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT contabilidad._tiene_rol(ARRAY['super_admin', 'tienda', 'tesorero', 'comision_fiscal']);
$$;

CREATE FUNCTION comercial._exigir_operador() RETURNS void
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_claims text := current_setting('request.jwt.claims', true);
BEGIN
  IF v_claims IS NULL OR v_claims = '' OR (v_claims::jsonb ->> 'role') = 'service_role' THEN
    RETURN;
  END IF;
  IF NOT contabilidad._tiene_rol(ARRAY['super_admin', 'tienda', 'tesorero']) THEN
    RAISE EXCEPTION 'No autorizado: requiere rol tienda o tesorero' USING ERRCODE = '42501';
  END IF;
END;
$$;

-- ------------------------------------------------------------
-- Cuentas de la tienda
-- ------------------------------------------------------------
INSERT INTO contabilidad.cuentas (codigo, nombre, padre_id, nivel, clase, naturaleza, es_disponibilidad, descripcion)
SELECT '1.1.01.07', 'Banco Itaú — tienda', id, 0, 'activo', 'deudora', true,
       'Cuenta corriente 9500100: cobros por transferencia de la tienda online y del POS'
FROM contabilidad.cuentas WHERE codigo = '1.1.01';

CREATE FUNCTION contabilidad._parametro_valido() RETURNS trigger
LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE
  v_c contabilidad.cuentas%ROWTYPE;
BEGIN
  SELECT * INTO v_c FROM contabilidad.cuentas WHERE id = NEW.cuenta_id;
  IF NOT v_c.imputable THEN
    RAISE EXCEPTION 'La cuenta % es agrupadora: no puede usarla un proceso automático', v_c.codigo;
  END IF;
  IF NEW.moneda IS DISTINCT FROM v_c.moneda AND v_c.moneda IS NOT NULL THEN
    RAISE EXCEPTION 'La cuenta % es en %: el parámetro tiene que indicar esa moneda', v_c.codigo, v_c.moneda;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER parametros_cuentas_valida BEFORE INSERT OR UPDATE ON contabilidad.parametros_cuentas
  FOR EACH ROW EXECUTE FUNCTION contabilidad._parametro_valido();

INSERT INTO contabilidad.parametros_cuentas (proceso, rol, cuenta_id, descripcion)
SELECT 'tienda', v.rol, c.id, v.descripcion FROM (VALUES
  ('ventas_socios', '4.4.01', 'Ventas a socios'),
  ('ventas_no_socios', '4.4.02', 'Ventas a no socios'),
  ('ventas_disciplinas', '4.4.03', 'Pedidos mayoristas de disciplinas'),
  ('devoluciones', '4.4.09', 'Devoluciones y bonificaciones sobre ventas'),
  ('costo_ventas', '5.1.01', 'Costo de la mercadería vendida'),
  ('mercaderia', '1.1.05.01', 'Inventario de la tienda'),
  ('ajustes_stock', '5.1.02', 'Mermas y diferencias de inventario'),
  ('senas', '2.1.04.03', 'Cobros a cuenta: encargues y efectivo de pagos mixtos'),
  ('donaciones', '2.1.05.01', 'Donaciones para la Olla del Hogar cobradas con la venta'),
  ('banco_cobros', '1.1.01.07', 'Cuenta donde entran las transferencias de la tienda'),
  ('caja', '1.1.01.03', 'Caja del POS'),
  ('disciplinas', '1.1.04.03', 'Cuenta corriente de cada disciplina')
) AS v(rol, codigo, descripcion)
JOIN contabilidad.cuentas c ON c.codigo = v.codigo;

-- ------------------------------------------------------------
-- Ítems, kardex y capas de costo
-- ------------------------------------------------------------
CREATE TABLE comercial.items (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  producto_id integer NOT NULL REFERENCES public.productos (id) ON DELETE RESTRICT,
  variante_id integer REFERENCES public.producto_variantes (id) ON DELETE RESTRICT,
  metodo_costeo text NOT NULL DEFAULT 'promedio' CHECK (metodo_costeo IN ('promedio', 'fifo')),
  stock integer NOT NULL DEFAULT 0 CHECK (stock >= 0),
  -- Valor contable del stock (a costo). Con stock 0, valor 0.
  valor numeric(18, 2) NOT NULL DEFAULT 0 CHECK (valor >= 0),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (stock > 0 OR valor = 0)
);

CREATE UNIQUE INDEX items_unico ON comercial.items (producto_id, coalesce(variante_id, 0));

CREATE TABLE comercial.movimientos (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  item_id bigint NOT NULL REFERENCES comercial.items (id) ON DELETE RESTRICT,
  fecha date NOT NULL,
  tipo text NOT NULL CHECK (tipo IN ('inventario_inicial', 'compra', 'venta', 'devolucion_venta',
                                     'ajuste', 'devolucion_compra')),
  cantidad integer NOT NULL CHECK (cantidad <> 0),
  costo_unitario numeric(18, 6) NOT NULL CHECK (costo_unitario >= 0),
  -- Mismo signo que la cantidad.
  valor numeric(18, 2) NOT NULL,
  stock_resultante integer NOT NULL CHECK (stock_resultante >= 0),
  valor_resultante numeric(18, 2) NOT NULL CHECK (valor_resultante >= 0),
  origen_tipo text NOT NULL,
  origen_id text NOT NULL,
  motivo text,
  asiento_id uuid REFERENCES contabilidad.asientos (id) ON DELETE RESTRICT,
  creado_por uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (valor = 0 OR sign(valor) = sign(cantidad))
);

CREATE INDEX movimientos_item_idx ON comercial.movimientos (item_id, id);
CREATE INDEX movimientos_origen_idx ON comercial.movimientos (origen_tipo, origen_id);

CREATE TABLE comercial.capas (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  item_id bigint NOT NULL REFERENCES comercial.items (id) ON DELETE RESTRICT,
  movimiento_id bigint NOT NULL REFERENCES comercial.movimientos (id) ON DELETE RESTRICT,
  cantidad_inicial integer NOT NULL CHECK (cantidad_inicial > 0),
  cantidad_restante integer NOT NULL CHECK (cantidad_restante >= 0),
  costo_unitario numeric(18, 6) NOT NULL CHECK (costo_unitario >= 0),
  CHECK (cantidad_restante <= cantidad_inicial)
);

CREATE INDEX capas_item_idx ON comercial.capas (item_id, id) WHERE cantidad_restante > 0;

-- El kardex no se edita ni se borra; solo se le asigna el asiento una vez.
CREATE FUNCTION comercial._movimiento_inmutable() RETURNS trigger
LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.asiento_id IS NULL AND NEW.asiento_id IS NOT NULL
     AND (to_jsonb(NEW) - 'asiento_id') = (to_jsonb(OLD) - 'asiento_id') THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'El kardex no se modifica: se corrige con otro movimiento';
END;
$$;

CREATE TRIGGER movimientos_inmutables BEFORE UPDATE OR DELETE ON comercial.movimientos
  FOR EACH ROW EXECUTE FUNCTION comercial._movimiento_inmutable();

-- El método de costeo cambia solo sin stock.
CREATE FUNCTION comercial._item_valida() RETURNS trigger
LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  IF NEW.metodo_costeo <> OLD.metodo_costeo AND OLD.stock > 0 THEN
    RAISE EXCEPTION 'El método de costeo se cambia sin stock';
  END IF;
  IF NEW.producto_id <> OLD.producto_id OR NEW.variante_id IS DISTINCT FROM OLD.variante_id THEN
    RAISE EXCEPTION 'Un ítem no cambia de producto';
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER items_valida BEFORE UPDATE ON comercial.items
  FOR EACH ROW EXECUTE FUNCTION comercial._item_valida();

-- Espejo en public: stock_actual solo lo escribe el motor.
CREATE FUNCTION comercial._stock_publico_protegido() RETURNS trigger
LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  IF coalesce(current_setting('comercial.sincronizando', true), '') = 'on' THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'INSERT' AND coalesce(NEW.stock_actual, 0) <> 0 THEN
    RAISE EXCEPTION 'El stock inicial se carga con un ajuste de stock o una compra, no en la ficha del producto';
  END IF;
  IF TG_OP = 'UPDATE' AND NEW.stock_actual IS DISTINCT FROM OLD.stock_actual THEN
    RAISE EXCEPTION 'El stock no se edita en la ficha: se mueve con ventas, compras o ajustes';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER productos_stock_protegido BEFORE INSERT OR UPDATE OF stock_actual ON public.productos
  FOR EACH ROW EXECUTE FUNCTION comercial._stock_publico_protegido();
CREATE TRIGGER variantes_stock_protegido BEFORE INSERT OR UPDATE OF stock_actual ON public.producto_variantes
  FOR EACH ROW EXECUTE FUNCTION comercial._stock_publico_protegido();

-- search_path = public: dispara triggers de public (suma de variantes,
-- updated_at) escritos con nombres sin schema.
CREATE FUNCTION comercial._sincronizar_publico(p_item comercial.items) RETURNS void
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  PERFORM set_config('comercial.sincronizando', 'on', true);
  IF p_item.variante_id IS NOT NULL THEN
    UPDATE public.producto_variantes SET stock_actual = p_item.stock WHERE id = p_item.variante_id;
  ELSE
    UPDATE public.productos SET stock_actual = p_item.stock, updated_at = now() WHERE id = p_item.producto_id;
  END IF;
  PERFORM set_config('comercial.sincronizando', '', true);
END;
$$;

-- Ítem de un producto/variante, bloqueado para actualizar. Si no existe
-- se crea; si el producto ya tenía stock de antes del motor, entra como
-- inventario inicial al último costo conocido (sin asiento: forma parte
-- de la apertura contable).
CREATE FUNCTION comercial._item(p_producto integer, p_variante integer) RETURNS comercial.items
LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE
  v_item comercial.items;
  v_stock integer;
  v_costo numeric;
  v_mov bigint;
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

  IF p_variante IS NOT NULL THEN
    SELECT stock_actual, costo_promedio INTO v_stock, v_costo FROM public.producto_variantes WHERE id = p_variante;
  ELSE
    SELECT stock_actual, costo_promedio INTO v_stock, v_costo FROM public.productos WHERE id = p_producto;
  END IF;
  IF coalesce(v_stock, 0) > 0 AND v_item.stock = 0 THEN
    v_costo := coalesce(v_costo,
      (SELECT costo_promedio FROM public.productos WHERE id = p_producto),
      (SELECT pp.costo FROM public.producto_proveedores pp WHERE pp.producto_id = p_producto
        ORDER BY pp.es_principal DESC, pp.id LIMIT 1), 0);
    INSERT INTO comercial.movimientos (item_id, fecha, tipo, cantidad, costo_unitario, valor,
                                       stock_resultante, valor_resultante, origen_tipo, origen_id, motivo)
    VALUES (v_item.id, contabilidad._hoy(), 'inventario_inicial', v_stock, v_costo, round(v_stock * v_costo, 2),
            v_stock, round(v_stock * v_costo, 2), 'migracion', v_item.id::text,
            'Stock existente al activar el motor de costos')
    RETURNING id INTO v_mov;
    INSERT INTO comercial.capas (item_id, movimiento_id, cantidad_inicial, cantidad_restante, costo_unitario)
    VALUES (v_item.id, v_mov, v_stock, v_stock, v_costo);
    UPDATE comercial.items SET stock = v_stock, valor = round(v_stock * v_costo, 2)
    WHERE id = v_item.id RETURNING * INTO v_item;
  END IF;
  RETURN v_item;
END;
$$;

-- Entrada de stock a un costo. Devuelve el valor que entra.
CREATE FUNCTION comercial._entrada(
  p_item bigint, p_cantidad integer, p_costo numeric, p_fecha date, p_tipo text,
  p_origen_tipo text, p_origen_id text, p_motivo text DEFAULT NULL
) RETURNS numeric
LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE
  v_item comercial.items;
  v_valor numeric := round(p_cantidad * p_costo, 2);
  v_mov bigint;
BEGIN
  IF p_cantidad <= 0 OR p_costo < 0 THEN
    RAISE EXCEPTION 'Entrada de stock inválida';
  END IF;
  SELECT * INTO v_item FROM comercial.items WHERE id = p_item FOR UPDATE;

  INSERT INTO comercial.movimientos (item_id, fecha, tipo, cantidad, costo_unitario, valor,
                                     stock_resultante, valor_resultante, origen_tipo, origen_id, motivo)
  VALUES (p_item, p_fecha, p_tipo, p_cantidad, p_costo, v_valor,
          v_item.stock + p_cantidad, v_item.valor + v_valor, p_origen_tipo, p_origen_id, p_motivo)
  RETURNING id INTO v_mov;

  INSERT INTO comercial.capas (item_id, movimiento_id, cantidad_inicial, cantidad_restante, costo_unitario)
  VALUES (p_item, v_mov, p_cantidad, p_cantidad, p_costo);

  UPDATE comercial.items SET stock = stock + p_cantidad, valor = valor + v_valor
  WHERE id = p_item RETURNING * INTO v_item;
  PERFORM comercial._sincronizar_publico(v_item);
  RETURN v_valor;
END;
$$;

-- Salida de stock al costo del método del ítem. Devuelve el valor que
-- sale (positivo). Promedio: proporcional al valor; FIFO: consume capas.
-- En los dos casos valor_salida = valor_antes − valor_después, así no
-- quedan residuos de redondeo.
CREATE FUNCTION comercial._salida(
  p_item bigint, p_cantidad integer, p_fecha date, p_tipo text,
  p_origen_tipo text, p_origen_id text, p_motivo text DEFAULT NULL
) RETURNS numeric
LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE
  v_item comercial.items;
  v_nuevo_valor numeric;
  v_valor numeric;
  v_resta integer := p_cantidad;
  v_toma integer;
  c record;
BEGIN
  IF p_cantidad <= 0 THEN
    RAISE EXCEPTION 'Salida de stock inválida';
  END IF;
  SELECT * INTO v_item FROM comercial.items WHERE id = p_item FOR UPDATE;
  IF v_item.stock < p_cantidad THEN
    RAISE EXCEPTION 'Stock insuficiente: hay %, se necesitan %', v_item.stock, p_cantidad
      USING ERRCODE = 'P0001', HINT = 'stock';
  END IF;

  -- Las capas se consumen en orden con los dos métodos (en promedio
  -- solo sirven para saber qué queda; el valor sale proporcional).
  FOR c IN SELECT id, cantidad_restante FROM comercial.capas
           WHERE item_id = p_item AND cantidad_restante > 0 ORDER BY id LOOP
    EXIT WHEN v_resta = 0;
    v_toma := least(v_resta, c.cantidad_restante);
    UPDATE comercial.capas SET cantidad_restante = cantidad_restante - v_toma WHERE id = c.id;
    v_resta := v_resta - v_toma;
  END LOOP;

  IF v_item.metodo_costeo = 'fifo' THEN
    SELECT coalesce(sum(round(cantidad_restante * costo_unitario, 2)), 0) INTO v_nuevo_valor
    FROM comercial.capas WHERE item_id = p_item AND cantidad_restante > 0;
  ELSE
    v_nuevo_valor := round(v_item.valor * (v_item.stock - p_cantidad) / v_item.stock, 2);
  END IF;
  v_valor := v_item.valor - v_nuevo_valor;

  INSERT INTO comercial.movimientos (item_id, fecha, tipo, cantidad, costo_unitario, valor,
                                     stock_resultante, valor_resultante, origen_tipo, origen_id, motivo)
  VALUES (p_item, p_fecha, p_tipo, -p_cantidad, round(v_valor / p_cantidad, 6), -v_valor,
          v_item.stock - p_cantidad, v_nuevo_valor, p_origen_tipo, p_origen_id, p_motivo);

  UPDATE comercial.items SET stock = stock - p_cantidad, valor = v_nuevo_valor
  WHERE id = p_item RETURNING * INTO v_item;
  PERFORM comercial._sincronizar_publico(v_item);
  RETURN v_valor;
END;
$$;

CREATE FUNCTION comercial._vincular_asiento(p_origen_tipo text, p_origen_id text, p_asiento uuid) RETURNS void
LANGUAGE sql SET search_path = '' AS $$
  UPDATE comercial.movimientos SET asiento_id = p_asiento
  WHERE origen_tipo = p_origen_tipo AND origen_id = p_origen_id AND asiento_id IS NULL;
$$;

-- ------------------------------------------------------------
-- Ventas contabilizadas
-- ------------------------------------------------------------
CREATE TABLE comercial.ventas (
  pedido_id integer PRIMARY KEY REFERENCES public.pedidos (id) ON DELETE RESTRICT,
  fecha date NOT NULL,
  cuenta_ingreso_id uuid NOT NULL REFERENCES contabilidad.cuentas (id),
  monto_ventas numeric(18, 2) NOT NULL CHECK (monto_ventas >= 0),
  monto_encargues numeric(18, 2) NOT NULL CHECK (monto_encargues >= 0),
  monto_donacion numeric(18, 2) NOT NULL CHECK (monto_donacion >= 0),
  costo numeric(18, 2) NOT NULL CHECK (costo >= 0),
  asiento_id uuid NOT NULL REFERENCES contabilidad.asientos (id),
  asiento_entrega_id uuid REFERENCES contabilidad.asientos (id),
  anulada boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE FUNCTION comercial._cuenta(p_rol text) RETURNS uuid
LANGUAGE sql STABLE SET search_path = '' AS $$
  SELECT contabilidad.cuenta_para('tienda', p_rol, NULL);
$$;

CREATE FUNCTION comercial._centro_venta(p_pedido public.pedidos) RETURNS uuid
LANGUAGE sql STABLE SET search_path = '' AS $$
  SELECT coalesce(
    (SELECT id FROM contabilidad.centros_costo WHERE disciplina_id = p_pedido.disciplina_id
       AND p_pedido.tipo = 'disciplina'),
    (SELECT id FROM contabilidad.centros_costo WHERE codigo = 'TIENDA'));
$$;

-- Salida de la mercadería de un pedido (ítems que no son encargue).
-- Guarda el costo real en pedido_items y devuelve el costo total.
CREATE FUNCTION comercial._salida_pedido(p_pedido integer, p_motivo text) RETURNS numeric
LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE
  r record;
  v_item comercial.items;
  v_valor numeric;
  v_total numeric := 0;
BEGIN
  FOR r IN SELECT id, producto_id, variante_id, cantidad FROM public.pedido_items
           WHERE pedido_id = p_pedido AND NOT es_encargue
           ORDER BY producto_id, coalesce(variante_id, 0), id LOOP
    v_item := comercial._item(r.producto_id, r.variante_id);
    v_valor := comercial._salida(v_item.id, r.cantidad, contabilidad._hoy(), 'venta',
                                 'pedido', p_pedido::text, p_motivo);
    UPDATE public.pedido_items SET costo_unitario_venta = round(v_valor / r.cantidad, 2) WHERE id = r.id;
    v_total := v_total + v_valor;
  END LOOP;
  RETURN v_total;
END;
$$;

-- Asiento de la venta de un pedido. p_medio: 'banco' (transferencia),
-- 'caja' (efectivo del POS) o 'disciplina' (cuenta corriente). En un
-- pago mixto, el efectivo ya entró a Señas al vender y acá se aplica.
CREATE FUNCTION comercial._contabilizar_venta(p_pedido integer, p_medio text, p_costo numeric) RETURNS uuid
LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE
  v_p public.pedidos;
  v_donacion numeric;
  v_base numeric;
  v_enc numeric;
  v_neto numeric;
  v_ventas numeric;
  v_encargues numeric;
  v_efectivo_previo numeric := 0;
  v_cuenta_ingreso uuid;
  v_centro uuid;
  v_lineas jsonb := '[]'::jsonb;
  v_id uuid;
BEGIN
  SELECT * INTO v_p FROM public.pedidos WHERE id = p_pedido;
  SELECT coalesce(sum(monto), 0) INTO v_donacion FROM public.donaciones
  WHERE pedido_id = p_pedido AND estado <> 'cancelada';
  SELECT coalesce(sum(subtotal) FILTER (WHERE NOT es_encargue), 0),
         coalesce(sum(subtotal) FILTER (WHERE es_encargue), 0)
    INTO v_base, v_enc
  FROM public.pedido_items WHERE pedido_id = p_pedido;

  v_neto := v_p.total - v_donacion;
  IF v_neto < 0 THEN
    RAISE EXCEPTION 'El pedido % tiene una donación mayor que su total', p_pedido;
  END IF;
  -- El descuento del pedido se reparte en proporción entre stock y encargues.
  v_ventas := CASE WHEN v_base + v_enc = 0 THEN v_neto ELSE round(v_neto * v_base / (v_base + v_enc), 2) END;
  v_encargues := v_neto - v_ventas;

  v_cuenta_ingreso := comercial._cuenta(CASE
    WHEN v_p.tipo = 'disciplina' THEN 'ventas_disciplinas'
    WHEN v_p.aplico_precio_socio THEN 'ventas_socios'
    ELSE 'ventas_no_socios' END);
  v_centro := comercial._centro_venta(v_p);

  IF v_p.metodo_pago = 'mixto' THEN
    SELECT coalesce(sum(l.haber), 0) INTO v_efectivo_previo
    FROM contabilidad.asientos a JOIN contabilidad.lineas l ON l.asiento_id = a.id
    WHERE a.origen_tipo = 'pedido_efectivo' AND a.origen_id = p_pedido::text
      AND a.revertido_por_id IS NULL AND l.cuenta_id = comercial._cuenta('senas');
  END IF;

  -- Debe: lo cobrado
  IF p_medio = 'disciplina' THEN
    IF v_p.disciplina_id IS NULL THEN
      RAISE EXCEPTION 'El pedido de disciplina % no indica la disciplina', p_pedido;
    END IF;
    v_lineas := v_lineas || jsonb_build_object('cuenta_id', comercial._cuenta('disciplinas'), 'lado', 'debe',
      'importe', v_p.total, 'disciplina_id', v_p.disciplina_id);
  ELSE
    IF v_p.total - v_efectivo_previo > 0 THEN
      v_lineas := v_lineas || jsonb_build_object(
        'cuenta_id', comercial._cuenta(CASE WHEN p_medio = 'caja' THEN 'caja' ELSE 'banco_cobros' END),
        'lado', 'debe', 'importe', v_p.total - v_efectivo_previo);
    END IF;
    IF v_efectivo_previo > 0 THEN
      v_lineas := v_lineas || jsonb_build_object('cuenta_id', comercial._cuenta('senas'), 'lado', 'debe',
        'importe', v_efectivo_previo, 'descripcion', 'Efectivo cobrado al vender');
    END IF;
  END IF;

  -- Haber: venta, encargues (seña hasta retirarlos) y donación
  IF v_ventas > 0 THEN
    v_lineas := v_lineas || jsonb_build_object('cuenta_id', v_cuenta_ingreso, 'lado', 'haber',
      'importe', v_ventas, 'centro_costo_id', v_centro);
  END IF;
  IF v_encargues > 0 THEN
    v_lineas := v_lineas || jsonb_build_object('cuenta_id', comercial._cuenta('senas'), 'lado', 'haber',
      'importe', v_encargues, 'descripcion', 'Encargue: se reconoce como venta al retirarlo');
  END IF;
  IF v_donacion > 0 THEN
    v_lineas := v_lineas || jsonb_build_object('cuenta_id', comercial._cuenta('donaciones'), 'lado', 'haber',
      'importe', v_donacion);
  END IF;

  -- Costo de lo vendido
  IF p_costo > 0 THEN
    v_lineas := v_lineas
      || jsonb_build_object('cuenta_id', comercial._cuenta('costo_ventas'), 'lado', 'debe',
           'importe', p_costo, 'centro_costo_id', v_centro)
      || jsonb_build_object('cuenta_id', comercial._cuenta('mercaderia'), 'lado', 'haber', 'importe', p_costo);
  END IF;

  IF jsonb_array_length(v_lineas) = 0 THEN
    RETURN NULL;  -- pedido sin importe ni costo: no hay nada que asentar
  END IF;

  v_id := contabilidad._asiento_automatico(contabilidad._hoy(),
    public.motivo_venta_pedido(v_p.tipo, v_p.numero_pedido, v_p.id),
    'pedido_venta', p_pedido::text, v_lineas);
  PERFORM comercial._vincular_asiento('pedido', p_pedido::text, v_id);

  INSERT INTO comercial.ventas (pedido_id, fecha, cuenta_ingreso_id, monto_ventas, monto_encargues,
                                monto_donacion, costo, asiento_id)
  VALUES (p_pedido, contabilidad._hoy(), v_cuenta_ingreso, v_ventas, v_encargues, v_donacion, p_costo, v_id)
  ON CONFLICT (pedido_id) DO UPDATE SET
    fecha = EXCLUDED.fecha, cuenta_ingreso_id = EXCLUDED.cuenta_ingreso_id,
    monto_ventas = EXCLUDED.monto_ventas, monto_encargues = EXCLUDED.monto_encargues,
    monto_donacion = EXCLUDED.monto_donacion, costo = EXCLUDED.costo,
    asiento_id = EXCLUDED.asiento_id, asiento_entrega_id = NULL, anulada = false;
  RETURN v_id;
END;
$$;

-- Efectivo de un pago mixto, cobrado en el POS antes de verificar la
-- transferencia: queda como seña.
CREATE FUNCTION comercial._contabilizar_efectivo_mixto(p_pedido integer) RETURNS uuid
LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE
  v_p public.pedidos;
BEGIN
  SELECT * INTO v_p FROM public.pedidos WHERE id = p_pedido;
  IF v_p.metodo_pago <> 'mixto' OR coalesce(v_p.monto_efectivo, 0) <= 0 THEN
    RETURN NULL;
  END IF;
  RETURN contabilidad._asiento_automatico(contabilidad._hoy(),
    'Efectivo a cuenta — ' || public.motivo_venta_pedido(v_p.tipo, v_p.numero_pedido, v_p.id),
    'pedido_efectivo', p_pedido::text, jsonb_build_array(
      jsonb_build_object('cuenta_id', comercial._cuenta('caja'), 'lado', 'debe', 'importe', v_p.monto_efectivo),
      jsonb_build_object('cuenta_id', comercial._cuenta('senas'), 'lado', 'haber', 'importe', v_p.monto_efectivo)));
END;
$$;

-- Encargue retirado: la seña pasa a venta.
CREATE FUNCTION comercial._reconocer_encargue() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_v comercial.ventas;
  v_id uuid;
BEGIN
  SELECT * INTO v_v FROM comercial.ventas WHERE pedido_id = NEW.id FOR UPDATE;
  IF v_v.pedido_id IS NULL OR v_v.anulada OR v_v.monto_encargues = 0 OR v_v.asiento_entrega_id IS NOT NULL THEN
    RETURN NULL;
  END IF;
  v_id := contabilidad._asiento_automatico(contabilidad._hoy(),
    'Entrega de encargue — ' || public.motivo_venta_pedido(NEW.tipo, NEW.numero_pedido, NEW.id),
    'pedido_entrega', NEW.id::text, jsonb_build_array(
      jsonb_build_object('cuenta_id', comercial._cuenta('senas'), 'lado', 'debe', 'importe', v_v.monto_encargues),
      jsonb_build_object('cuenta_id', v_v.cuenta_ingreso_id, 'lado', 'haber', 'importe', v_v.monto_encargues,
                         'centro_costo_id', comercial._centro_venta(NEW))));
  UPDATE comercial.ventas SET asiento_entrega_id = v_id WHERE pedido_id = NEW.id;
  RETURN NULL;
END;
$$;

CREATE TRIGGER pedidos_encargue_retirado AFTER UPDATE OF estado ON public.pedidos
  FOR EACH ROW WHEN (NEW.estado = 'retirado' AND OLD.estado IS DISTINCT FROM 'retirado')
  EXECUTE FUNCTION comercial._reconocer_encargue();

-- Cancelación: revierte los asientos del pedido y devuelve la mercadería
-- al mismo costo con que salió.
CREATE FUNCTION comercial._anular_pedido(p_pedido integer, p_motivo text) RETURNS jsonb
LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE
  r record;
  v_revertidos integer := 0;
  v_devueltos integer := 0;
  v_rev uuid;
  v_mercaderia_rev uuid;
BEGIN
  -- Asientos del pedido vigentes, del más nuevo al más viejo
  FOR r IN SELECT id, origen_tipo FROM contabilidad.asientos
           WHERE origen_id = p_pedido::text
             AND origen_tipo IN ('pedido_entrega', 'pedido_venta', 'pedido_efectivo')
             AND revertido_por_id IS NULL AND estado = 'confirmado'
           ORDER BY created_at DESC LOOP
    v_rev := contabilidad._revertir(r.id, coalesce(nullif(p_motivo, ''), 'Pedido cancelado'), contabilidad._hoy());
    IF r.origen_tipo = 'pedido_venta' THEN
      v_mercaderia_rev := v_rev;
    END IF;
    v_revertidos := v_revertidos + 1;
  END LOOP;

  -- Mercadería: vuelve al costo de salida (la reversión del asiento de
  -- venta ya acreditó el costo de ventas por el mismo importe)
  FOR r IN SELECT item_id, -sum(cantidad)::int AS cantidad, -sum(valor) AS valor
           FROM comercial.movimientos
           WHERE origen_tipo = 'pedido' AND origen_id = p_pedido::text AND tipo = 'venta'
           GROUP BY item_id ORDER BY item_id LOOP
    PERFORM comercial._entrada(r.item_id, r.cantidad, r.valor / r.cantidad, contabilidad._hoy(),
                               'devolucion_venta', 'pedido_cancelacion', p_pedido::text,
                               'Cancelación del pedido ' || p_pedido);
    v_devueltos := v_devueltos + r.cantidad;
  END LOOP;
  IF v_mercaderia_rev IS NOT NULL THEN
    PERFORM comercial._vincular_asiento('pedido_cancelacion', p_pedido::text, v_mercaderia_rev);
  END IF;

  UPDATE comercial.ventas SET anulada = true WHERE pedido_id = p_pedido;
  RETURN jsonb_build_object('asientos_revertidos', v_revertidos, 'unidades_devueltas', v_devueltos);
END;
$$;


-- ------------------------------------------------------------
-- Funciones de pedidos que usa la tienda (mismo nombre y firma)
-- ------------------------------------------------------------
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

  -- Pago mixto en el POS: el efectivo ya se cobró. Queda como seña hasta
  -- que se verifique la transferencia.
  PERFORM comercial._contabilizar_efectivo_mixto(p_pedido_id);

  RETURN jsonb_build_object('ok', true);
END
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

CREATE OR REPLACE FUNCTION "public"."registrar_transferencia_donaciones"("p_fecha" "date", "p_comprobante_url" "text", "p_notas" "text", "p_creado_por" "uuid") RETURNS TABLE("transferencia_id" integer, "monto_total" numeric, "cantidad" integer)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_total DECIMAL(10,2);
  v_cantidad INTEGER;
  v_transferencia_id INTEGER;
BEGIN
  -- Con service role no hay auth.uid(): se valida a quien registra.
  IF NOT EXISTS (
    SELECT 1 FROM perfil_roles pr JOIN roles r ON r.id = pr.rol_id
     WHERE pr.perfil_id = COALESCE(auth.uid(), p_creado_por)
       AND r.nombre IN ('super_admin', 'tienda', 'tesorero')
  ) THEN
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

  -- Sale del banco de la tienda y cancela el pasivo con la Olla.
  PERFORM contabilidad._asiento_automatico(p_fecha,
    'Transferencia de donaciones a la Olla del Hogar (' || v_cantidad || ' donaciones)',
    'donaciones_transferencia', v_transferencia_id::text, jsonb_build_array(
      jsonb_build_object('cuenta_id', comercial._cuenta('donaciones'), 'lado', 'debe', 'importe', v_total),
      jsonb_build_object('cuenta_id', comercial._cuenta('banco_cobros'), 'lado', 'haber', 'importe', v_total)));

  RETURN QUERY SELECT v_transferencia_id, v_total, v_cantidad;
END
$$;

CREATE OR REPLACE FUNCTION "public"."incrementar_stock_item"("p_producto_id" integer, "p_variante_id" integer, "p_cantidad" integer) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  RAISE EXCEPTION 'La recepción de compras pasó al módulo nuevo de compras (entra al stock con su costo)';
END
$$;

-- ------------------------------------------------------------
-- Ajustes de stock e inventario inicial
-- ------------------------------------------------------------
-- p_cantidad positiva = sobrante (entra al costo indicado o al costo
-- promedio vigente), negativa = merma. Asiento contra Ajustes y mermas.
CREATE FUNCTION comercial.ajustar_stock(
  p_producto integer, p_variante integer, p_cantidad integer, p_motivo text,
  p_costo_unitario numeric DEFAULT NULL
) RETURNS bigint
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_item comercial.items;
  v_valor numeric;
  v_costo numeric;
  v_ref text := gen_random_uuid()::text;
  v_mov bigint;
  v_id uuid;
BEGIN
  PERFORM comercial._exigir_operador();
  IF p_cantidad = 0 OR p_motivo IS NULL OR length(btrim(p_motivo)) < 3 THEN
    RAISE EXCEPTION 'Indicá la cantidad y el motivo del ajuste';
  END IF;
  v_item := comercial._item(p_producto, p_variante);
  IF p_cantidad > 0 THEN
    v_costo := coalesce(p_costo_unitario,
                        CASE WHEN v_item.stock > 0 THEN v_item.valor / v_item.stock END,
                        (SELECT costo_unitario FROM comercial.movimientos WHERE item_id = v_item.id
                           ORDER BY id DESC LIMIT 1), 0);
    v_valor := comercial._entrada(v_item.id, p_cantidad, v_costo, contabilidad._hoy(), 'ajuste',
                                  'ajuste_stock', v_ref, btrim(p_motivo));
  ELSE
    v_valor := -comercial._salida(v_item.id, -p_cantidad, contabilidad._hoy(), 'ajuste',
                                  'ajuste_stock', v_ref, btrim(p_motivo));
  END IF;

  IF v_valor <> 0 THEN
    v_id := contabilidad._asiento_automatico(contabilidad._hoy(), 'Ajuste de stock: ' || btrim(p_motivo),
      'ajuste_stock', v_ref, jsonb_build_array(
        jsonb_build_object('cuenta_id', comercial._cuenta('mercaderia'),
                           'lado', CASE WHEN v_valor > 0 THEN 'debe' ELSE 'haber' END, 'importe', abs(v_valor)),
        jsonb_build_object('cuenta_id', comercial._cuenta('ajustes_stock'),
                           'lado', CASE WHEN v_valor > 0 THEN 'haber' ELSE 'debe' END, 'importe', abs(v_valor),
                           'centro_costo_id', (SELECT id FROM contabilidad.centros_costo WHERE codigo = 'TIENDA'))));
    PERFORM comercial._vincular_asiento('ajuste_stock', v_ref, v_id);
  END IF;

  SELECT id INTO v_mov FROM comercial.movimientos WHERE origen_tipo = 'ajuste_stock' AND origen_id = v_ref;
  RETURN v_mov;
END;
$$;

-- Carga de inventario al arrancar (sin asiento: el valor va en la
-- apertura contable). Solo para ítems que todavía no tienen movimientos.
--   [{ producto_id, variante_id?, cantidad, costo_unitario }]
CREATE FUNCTION comercial.cargar_inventario_inicial(p_items jsonb) RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_i jsonb;
  v_item comercial.items;
  v_n integer := 0;
BEGIN
  PERFORM comercial._exigir_operador();
  FOR v_i IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    v_item := comercial._item((v_i ->> 'producto_id')::int, nullif(v_i ->> 'variante_id', '')::int);
    IF EXISTS (SELECT 1 FROM comercial.movimientos WHERE item_id = v_item.id) THEN
      RAISE EXCEPTION 'El producto % ya tiene movimientos de stock', v_i ->> 'producto_id';
    END IF;
    PERFORM comercial._entrada(v_item.id, (v_i ->> 'cantidad')::int, (v_i ->> 'costo_unitario')::numeric,
                               contabilidad._hoy(), 'inventario_inicial', 'inventario_inicial', v_item.id::text,
                               'Inventario inicial');
    v_n := v_n + 1;
  END LOOP;
  RETURN v_n;
END;
$$;

CREATE FUNCTION comercial.cambiar_metodo_costeo(p_producto integer, p_metodo text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_item record;
BEGIN
  PERFORM comercial._exigir_operador();
  FOR v_item IN SELECT * FROM public.producto_variantes WHERE producto_id = p_producto LOOP
    PERFORM comercial._item(p_producto, v_item.id);
  END LOOP;
  IF NOT EXISTS (SELECT 1 FROM public.producto_variantes WHERE producto_id = p_producto) THEN
    PERFORM comercial._item(p_producto, NULL);
  END IF;
  UPDATE comercial.items SET metodo_costeo = p_metodo WHERE producto_id = p_producto;
END;
$$;

-- ------------------------------------------------------------
-- Controles
-- ------------------------------------------------------------
-- Valor del stock según el kardex vs saldo de Mercadería en el mayor.
CREATE FUNCTION comercial.control_mercaderia() RETURNS TABLE (
  valor_stock numeric, saldo_contable numeric, diferencia numeric, movimientos_sin_asiento bigint
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NOT (comercial.puede_ver() OR current_setting('request.jwt.claims', true) IS NULL) THEN
    RAISE EXCEPTION 'No autorizado' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
  WITH v AS (SELECT coalesce(sum(i.valor), 0) AS valor FROM comercial.items i),
       s AS (SELECT coalesce(sum(l.debe - l.haber), 0) AS saldo
             FROM contabilidad.lineas l JOIN contabilidad.asientos a ON a.id = l.asiento_id
             WHERE a.estado = 'confirmado' AND l.cuenta_id = comercial._cuenta('mercaderia')
               AND a.ejercicio_id = (SELECT e.id FROM contabilidad.ejercicios e
                                     WHERE contabilidad._hoy() BETWEEN e.fecha_inicio AND e.fecha_fin))
  SELECT v.valor, s.saldo, v.valor - s.saldo,
         (SELECT count(*) FROM comercial.movimientos m WHERE m.asiento_id IS NULL
            AND m.tipo NOT IN ('inventario_inicial'))
  FROM v, s;
END;
$$;

-- ------------------------------------------------------------
-- RLS y permisos
-- ------------------------------------------------------------
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['items', 'movimientos', 'capas', 'ventas'] LOOP
    EXECUTE format('ALTER TABLE comercial.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('CREATE POLICY %I ON comercial.%I FOR SELECT TO authenticated USING (comercial.puede_ver())',
                   t || '_lectura', t);
  END LOOP;
END;
$$;

REVOKE ALL ON ALL TABLES IN SCHEMA comercial FROM PUBLIC, anon, authenticated;
GRANT SELECT ON ALL TABLES IN SCHEMA comercial TO authenticated, service_role;
REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA comercial FROM PUBLIC, anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA comercial REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;
GRANT EXECUTE ON FUNCTION
  comercial.puede_ver(),
  comercial.ajustar_stock(integer, integer, integer, text, numeric),
  comercial.cargar_inventario_inicial(jsonb),
  comercial.cambiar_metodo_costeo(integer, text),
  comercial.control_mercaderia()
TO authenticated, service_role;
