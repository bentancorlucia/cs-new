-- ============================================================
-- POS: idempotencia de la venta y saldo de caja legible
--   · El índice existente (perfil_id, idempotency_key) no frena
--     duplicados del POS, donde perfil_id suele ser NULL.
--   · El efectivo esperado de una caja = saldo contable de su cuenta;
--     lo ve quien puede ver la tienda (tienda, tesorero, super_admin,
--     comision_fiscal).
-- ============================================================
CREATE UNIQUE INDEX pedidos_pos_idempotency ON public.pedidos (idempotency_key)
  WHERE tipo = 'pos' AND idempotency_key IS NOT NULL;

CREATE FUNCTION comercial.saldo_caja(p_caja integer) RETURNS numeric
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NOT (comercial.puede_ver() OR current_setting('request.jwt.claims', true) IS NULL
          OR (current_setting('request.jwt.claims', true)::jsonb ->> 'role') = 'service_role') THEN
    RAISE EXCEPTION 'No autorizado' USING ERRCODE = '42501';
  END IF;
  RETURN comercial._saldo_caja(p_caja);
END;
$$;
REVOKE EXECUTE ON FUNCTION comercial.saldo_caja(integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION comercial.saldo_caja(integer) TO authenticated, service_role;
