-- ============================================
-- Migración 042: Pago mixto en POS (efectivo + transferencia)
-- ============================================
-- Un pedido POS puede cobrarse parte en efectivo y parte por transferencia.
-- - La parte en efectivo entra a caja al momento de la venta.
-- - La parte por transferencia queda "Por conciliar" hasta verificar el
--   comprobante (igual que una transferencia normal).
-- Invariante: monto_efectivo + monto_transferencia = total.

ALTER TABLE pedidos
  ADD COLUMN IF NOT EXISTS monto_efectivo DECIMAL(10,2),
  ADD COLUMN IF NOT EXISTS monto_transferencia DECIMAL(10,2);

-- Agregar 'mixto' al CHECK de metodo_pago. Se re-incluye 'cuenta_corriente'
-- (agregado en 016 y perdido en 019) que usan los pedidos de disciplina.
ALTER TABLE pedidos DROP CONSTRAINT IF EXISTS pedidos_metodo_pago_check;
ALTER TABLE pedidos ADD CONSTRAINT pedidos_metodo_pago_check
  CHECK (metodo_pago IN (
    'mercadopago', 'efectivo', 'mercadopago_qr', 'transferencia',
    'cuenta_corriente', 'mixto'
  ));

ALTER TABLE pedidos DROP CONSTRAINT IF EXISTS pedidos_pago_mixto_check;
ALTER TABLE pedidos ADD CONSTRAINT pedidos_pago_mixto_check
  CHECK (
    metodo_pago IS DISTINCT FROM 'mixto'
    OR (
      monto_efectivo > 0
      AND monto_transferencia > 0
      AND monto_efectivo + monto_transferencia = total
    )
  );
