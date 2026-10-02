-- ============================================================
-- Recuentos e inventario inicial: ajustes tras probar las pantallas
--   · Un sobrante sin costo conocido entraba a $0: ahora toma promedio,
--     último costo, el indicado al contar, el de otros talles o el
--     último costo previo al motor; sin ninguno, no se confirma.
--   · Se puede quitar un producto de un recuento en borrador.
--   · El inventario inicial del corte incluye los productos con stock
--     anterior al motor: la cantidad y el costo reales reemplazan a los
--     viejos (comercial.costos_previos queda como sugerencia).
-- ============================================================
CREATE TABLE IF NOT EXISTS comercial.costos_previos (
  producto_id integer NOT NULL REFERENCES public.productos (id) ON DELETE CASCADE,
  variante_id integer REFERENCES public.producto_variantes (id) ON DELETE CASCADE,
  costo numeric(18, 6) NOT NULL CHECK (costo >= 0)
);
ALTER TABLE comercial.costos_previos ENABLE ROW LEVEL SECURITY;
CREATE POLICY costos_previos_lectura ON comercial.costos_previos FOR SELECT TO authenticated USING (comercial.puede_ver());
REVOKE ALL ON comercial.costos_previos FROM PUBLIC, anon, authenticated;
GRANT SELECT ON comercial.costos_previos TO authenticated, service_role;

ALTER TABLE comercial.recuento_items ADD COLUMN costo_unitario numeric(18, 6) CHECK (costo_unitario >= 0);

-- Ítem para cargar inventario inicial: valida producto/variante y lo crea
-- aunque el producto tenga stock anterior al motor.
CREATE FUNCTION comercial._item_para_inventario(p_producto integer, p_variante integer) RETURNS comercial.items
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
  INSERT INTO comercial.items (producto_id, variante_id) VALUES (p_producto, p_variante) ON CONFLICT DO NOTHING;
  SELECT * INTO v_item FROM comercial.items
  WHERE producto_id = p_producto AND coalesce(variante_id, 0) = coalesce(p_variante, 0) FOR UPDATE;
  RETURN v_item;
END;
$$;
REVOKE EXECUTE ON FUNCTION comercial._item_para_inventario(integer, integer) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION comercial.guardar_recuento(p_id bigint, p_conteos jsonb, p_notas text DEFAULT NULL) RETURNS bigint
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
    INSERT INTO comercial.recuento_items (recuento_id, item_id, contado, costo_unitario)
    VALUES (v_id, v_item.id, (v_c ->> 'contado')::int, (v_c ->> 'costo_unitario')::numeric)
    ON CONFLICT (recuento_id, item_id) DO UPDATE SET contado = EXCLUDED.contado,
      costo_unitario = coalesce(EXCLUDED.costo_unitario, comercial.recuento_items.costo_unitario);
  END LOOP;
  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION comercial.confirmar_recuento(p_id bigint) RETURNS jsonb
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
      -- Costo del sobrante: promedio vigente, último costo del ítem, el
      -- indicado al contar, el de otros talles del producto o el último
      -- costo conocido antes del motor. Sin ninguno, no se confirma.
      v_costo := coalesce(
        CASE WHEN v_item.stock > 0 THEN v_item.valor / v_item.stock END,
        (SELECT costo_unitario FROM comercial.movimientos WHERE item_id = v_item.id
           AND costo_unitario > 0 ORDER BY id DESC LIMIT 1),
        ri.costo_unitario,
        (SELECT sum(i.valor) / nullif(sum(i.stock), 0) FROM comercial.items i
           WHERE i.producto_id = v_item.producto_id AND i.id <> v_item.id AND i.stock > 0),
        (SELECT cp.costo FROM comercial.costos_previos cp WHERE cp.producto_id = v_item.producto_id
           AND coalesce(cp.variante_id, 0) = coalesce(v_item.variante_id, 0) LIMIT 1));
      IF v_costo IS NULL THEN
        RAISE EXCEPTION 'No hay costo para valuar el sobrante del ítem %: indicalo en el recuento', v_item.id;
      END IF;
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
    -- Incluye productos con stock anterior al motor (todavía sin ítem):
    -- la cantidad cargada reemplaza a la vieja.
    v_item := comercial._item_para_inventario((v_i ->> 'producto_id')::int, nullif(v_i ->> 'variante_id', '')::int);
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

CREATE FUNCTION comercial.quitar_de_recuento(p_id bigint, p_producto integer, p_variante integer DEFAULT NULL) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  PERFORM comercial._exigir_operador();
  IF NOT EXISTS (SELECT 1 FROM comercial.recuentos WHERE id = p_id AND estado = 'borrador') THEN
    RAISE EXCEPTION 'Solo se edita un recuento en borrador';
  END IF;
  DELETE FROM comercial.recuento_items ri USING comercial.items i
  WHERE ri.recuento_id = p_id AND ri.item_id = i.id
    AND i.producto_id = p_producto AND coalesce(i.variante_id, 0) = coalesce(p_variante, 0);
END;
$$;
REVOKE EXECUTE ON FUNCTION comercial.quitar_de_recuento(bigint, integer, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION comercial.quitar_de_recuento(bigint, integer, integer) TO authenticated, service_role;
