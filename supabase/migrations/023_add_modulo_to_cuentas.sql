-- Agregar columna modulo a cuentas_financieras para vincular cuentas a módulos específicos
ALTER TABLE cuentas_financieras ADD COLUMN modulo text DEFAULT NULL;

-- Índice para búsqueda rápida por módulo
CREATE INDEX idx_cuentas_financieras_modulo ON cuentas_financieras(modulo) WHERE modulo IS NOT NULL;
