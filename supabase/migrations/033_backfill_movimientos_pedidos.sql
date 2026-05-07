-- =====================
-- 033: Backfill movimientos financieros para pedidos cobrados existentes
-- =====================
-- Inserta un movimiento_financiero por cada pedido ya cobrado que no tenga
-- uno asociado. Idempotente: el WHERE NOT EXISTS evita duplicados si se
-- corre más de una vez. El trigger on_movimiento_financiero recalcula saldo.

WITH cuentas_tienda AS (
  SELECT
    (SELECT id FROM cuentas_financieras WHERE modulo='tienda' AND tipo='caja_chica' AND activa=true LIMIT 1) AS caja_chica_id,
    (SELECT id FROM cuentas_financieras WHERE modulo='tienda' AND tipo='bancaria'   AND activa=true LIMIT 1) AS bancaria_id
),
cats AS (
  SELECT
    (SELECT id FROM categorias_financieras WHERE slug='ventas-pos')    AS ventas_pos_id,
    (SELECT id FROM categorias_financieras WHERE slug='ventas-online') AS ventas_online_id
)
INSERT INTO movimientos_financieros (
  cuenta_id, tipo, categoria_id, monto, moneda, fecha,
  descripcion, origen_tipo, origen_id, referencia, registrado_por
)
SELECT
  CASE WHEN p.metodo_pago = 'efectivo' THEN ct.caja_chica_id ELSE ct.bancaria_id END,
  'ingreso',
  CASE WHEN p.tipo = 'pos' THEN c.ventas_pos_id ELSE c.ventas_online_id END,
  p.total,
  'UYU',
  COALESCE(p.created_at::date, CURRENT_DATE),
  CASE
    WHEN p.metodo_pago = 'efectivo'      THEN 'Venta POS efectivo — Pedido #' || p.numero_pedido
    WHEN p.metodo_pago = 'transferencia' THEN 'Transferencia verificada — Pedido #' || p.numero_pedido
    WHEN p.metodo_pago LIKE 'mercadopago%' THEN 'Pago MercadoPago — Pedido #' || p.numero_pedido
    ELSE 'Venta — Pedido #' || p.numero_pedido
  END,
  'pedido',
  p.id,
  CASE
    WHEN p.metodo_pago = 'efectivo'      THEN 'POS-'    || p.numero_pedido
    WHEN p.metodo_pago = 'transferencia' THEN 'TRANSF-' || p.numero_pedido
    WHEN p.metodo_pago LIKE 'mercadopago%' THEN 'MP-'   || p.numero_pedido
    ELSE 'VENTA-' || p.numero_pedido
  END,
  p.vendedor_id
FROM pedidos p
CROSS JOIN cuentas_tienda ct
CROSS JOIN cats c
WHERE p.estado IN ('pagado','preparando','encargado','listo_retiro','retirado')
  AND p.total IS NOT NULL
  AND p.total > 0
  AND NOT EXISTS (
    SELECT 1 FROM movimientos_financieros m
    WHERE m.origen_tipo = 'pedido' AND m.origen_id = p.id
  );

-- Backfill pagos a proveedor (egresos)
WITH cuentas_tienda AS (
  SELECT
    (SELECT id FROM cuentas_financieras WHERE modulo='tienda' AND tipo='caja_chica' AND activa=true LIMIT 1) AS caja_chica_id,
    (SELECT id FROM cuentas_financieras WHERE modulo='tienda' AND tipo='bancaria'   AND activa=true LIMIT 1) AS bancaria_id
),
cats AS (
  SELECT
    (SELECT id FROM categorias_financieras WHERE slug='compras-proveedores') AS compras_id,
    (SELECT id FROM categorias_financieras WHERE slug='mercaderia-tienda')   AS mercaderia_id
)
INSERT INTO movimientos_financieros (
  cuenta_id, tipo, categoria_id, subcategoria_id, monto, moneda, fecha,
  descripcion, origen_tipo, origen_id, referencia, registrado_por
)
SELECT
  CASE WHEN pp.metodo_pago = 'efectivo' THEN ct.caja_chica_id ELSE ct.bancaria_id END,
  'egreso',
  c.compras_id,
  c.mercaderia_id,
  pp.monto,
  'UYU',
  COALESCE(pp.created_at::date, CURRENT_DATE),
  'Pago a ' || COALESCE(prov.nombre, 'Proveedor #' || pp.proveedor_id) ||
    COALESCE(' — Compra #' || cp.numero_compra, ''),
  'pago_proveedor',
  pp.id,
  COALESCE(pp.referencia, 'PAG-' || pp.id),
  pp.registrado_por
FROM pagos_proveedor pp
LEFT JOIN proveedores       prov ON prov.id = pp.proveedor_id
LEFT JOIN compras_proveedor cp   ON cp.id   = pp.compra_id
CROSS JOIN cuentas_tienda ct
CROSS JOIN cats c
WHERE NOT EXISTS (
  SELECT 1 FROM movimientos_financieros m
  WHERE m.origen_tipo = 'pago_proveedor' AND m.origen_id = pp.id
);
