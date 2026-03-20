-- Fix: numero_pedido VARCHAR(20) es muy corto para el formato CS-YYYYMMDD-NNN
-- Hay que dropear el trigger que depende de la columna antes de alterar el tipo

DROP TRIGGER IF EXISTS set_numero_pedido ON pedidos;

ALTER TABLE pedidos ALTER COLUMN numero_pedido TYPE VARCHAR(30);

CREATE TRIGGER set_numero_pedido
  BEFORE INSERT ON pedidos
  FOR EACH ROW
  WHEN (NEW.numero_pedido IS NULL)
  EXECUTE FUNCTION generar_numero_pedido();
