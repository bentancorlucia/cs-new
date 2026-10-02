-- ============================================================
-- Stock reservado visible para el storefront
--
-- El storefront calculaba lo reservado leyendo pedido_items con la
-- sesión del visitante: un anónimo no ve los pedidos de otros, así que
-- mostraba como disponible stock ya reservado; además contaba encargues
-- (no descuentan stock) y pedidos sin reserva. Esta función devuelve solo
-- cantidades agregadas, sin datos de los pedidos.
-- ============================================================
CREATE FUNCTION public.stock_reservado(p_productos integer[])
RETURNS TABLE (producto_id integer, variante_id integer, cantidad integer)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT pi.producto_id, pi.variante_id, sum(pi.cantidad)::integer
  FROM public.pedido_items pi
  JOIN public.pedidos pe ON pe.id = pi.pedido_id
  WHERE pi.producto_id = ANY (p_productos)
    AND NOT pi.es_encargue
    AND pe.estado = 'pendiente_verificacion'
    AND pe.stock_reservado
  GROUP BY pi.producto_id, pi.variante_id;
$$;

REVOKE EXECUTE ON FUNCTION public.stock_reservado(integer[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.stock_reservado(integer[]) TO anon, authenticated, service_role;
