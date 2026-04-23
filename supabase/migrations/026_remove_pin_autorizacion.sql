-- ============================================
-- Migración 026: Eliminar PIN de supervisor
-- Los descuentos en POS no requieren autorización por PIN.
-- Se elimina la columna perfiles.pin_autorizacion y
-- pedidos.descuento_autorizado_por (nunca fue leída por la API).
-- ============================================

ALTER TABLE perfiles DROP COLUMN IF EXISTS pin_autorizacion;
ALTER TABLE pedidos DROP COLUMN IF EXISTS descuento_autorizado_por;
