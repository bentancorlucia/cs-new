-- ============================================
-- Migración 028: Fix pedidos.estado VARCHAR length
-- ============================================
-- El estado 'pendiente_verificacion' (22 chars) excede el VARCHAR(20) original.
-- La migración 019 agregó el valor al CHECK pero no extendió el tipo.

ALTER TABLE pedidos ALTER COLUMN estado TYPE VARCHAR(30);
