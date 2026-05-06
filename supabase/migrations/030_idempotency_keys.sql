-- ============================================
-- Migración 030: Idempotency keys para checkout y compra de entradas
-- ============================================
-- Previene la creación de pedidos / compras de entradas duplicados cuando el
-- cliente reenvía la misma operación (doble click, reintento por mala conexión,
-- "volver atrás + reintentar" tras error en subida de comprobante).
--
-- El cliente genera un UUID por intento de compra y lo manda en el body.
-- El servidor hace SELECT por (perfil_id, idempotency_key) antes del INSERT;
-- si existe, devuelve el registro existente. El UNIQUE parcial protege ante
-- race conditions entre dos requests simultáneos.
--
-- Compatibilidad: columna nullable + índice parcial (WHERE NOT NULL) para que
-- las filas existentes y los flujos manuales (POS, admin) sigan funcionando
-- sin pasar key.

-- pedidos
ALTER TABLE pedidos ADD COLUMN idempotency_key VARCHAR(36);
CREATE UNIQUE INDEX pedidos_perfil_idempotency_key_uniq
  ON pedidos (perfil_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

-- entradas (una idempotency_key agrupa N entradas de la misma compra)
ALTER TABLE entradas ADD COLUMN idempotency_key VARCHAR(36);
CREATE UNIQUE INDEX entradas_perfil_idempotency_key_uniq
  ON entradas (perfil_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;
