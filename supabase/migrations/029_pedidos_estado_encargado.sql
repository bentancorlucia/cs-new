-- ============================================
-- Migración 029: Estado 'encargado' para pedidos MTO
-- ============================================
-- Cuando un pedido tiene items bajo encargue, al verificar el pago no pasa
-- directo a 'preparando' sino a 'encargado' (esperando que llegue el producto
-- del proveedor / fabricación). Luego pasa manualmente a 'preparando'.

ALTER TABLE pedidos DROP CONSTRAINT IF EXISTS pedidos_estado_check;
ALTER TABLE pedidos ADD CONSTRAINT pedidos_estado_check
  CHECK (estado IN (
    'pendiente',
    'pendiente_verificacion',
    'pagado',
    'encargado',
    'preparando',
    'listo_retiro',
    'retirado',
    'cancelado'
  ));
