-- ============================================
-- Migración 031: Eliminar módulo de Tesorería
-- Solo se eliminan tablas/objetos exclusivos de tesorería.
-- Las tablas compartidas con el panel de tienda
-- (cuentas_financieras, categorias_financieras,
--  movimientos_financieros, conciliaciones,
--  conciliacion_items, comprobantes) se conservan.
-- ============================================

-- 1. Triggers/funciones exclusivos de tesorería
DROP TRIGGER IF EXISTS check_periodo_cerrado ON movimientos_financieros;
DROP FUNCTION IF EXISTS proteger_periodo_cerrado();

-- 2. Tablas exclusivas (orden inverso a las FKs)
DROP TABLE IF EXISTS arqueos_caja CASCADE;
DROP TABLE IF EXISTS presupuestos CASCADE;
DROP TABLE IF EXISTS cierres_mensuales CASCADE;
DROP TABLE IF EXISTS transferencias_internas CASCADE;
