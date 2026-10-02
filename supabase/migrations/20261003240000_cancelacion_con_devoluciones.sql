-- ============================================================
-- Un pedido con devoluciones o cambios no se cancela entero
--
-- La cancelación devolvía al stock todo lo vendido según el kardex,
-- incluidas las unidades que ya habían vuelto por una devolución (stock
-- duplicado) y sin revertir el asiento de la devolución.
-- ============================================================
CREATE OR REPLACE FUNCTION comercial._anular_pedido(p_pedido integer, p_motivo text) RETURNS jsonb
LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE
  r record;
  v_revertidos integer := 0;
  v_devueltos integer := 0;
  v_rev uuid;
  v_mercaderia_rev uuid;
BEGIN
  -- Con devoluciones o cambios ya registrados, cancelar devolvería dos
  -- veces lo ya devuelto: lo que queda se resuelve con otra devolución.
  IF EXISTS (SELECT 1 FROM comercial.devoluciones WHERE pedido_id = p_pedido) THEN
    RAISE EXCEPTION 'El pedido tiene devoluciones o cambios registrados: no se cancela, registrá una devolución por lo que queda';
  END IF;

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
