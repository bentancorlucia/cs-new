-- ============================================================
-- Compras: accesos y fin del circuito viejo
--   · El tesorero crea y edita proveedores (cuenta corriente de todo el
--     club); antes solo tienda.
--   · El rol tienda lee los catálogos contables que usan sus pantallas
--     (plan de cuentas, centros de costo, cotizaciones), sin ver asientos.
--   · Fuera compras_proveedor / compra_items / pagos_proveedor (en
--     producción: 0 compras y 0 pagos), sus triggers y el saldo de
--     proveedor calculado aparte: la deuda sale de los documentos y del
--     mayor (comercial.control_proveedores).
-- ============================================================
CREATE POLICY "Compras gestiona proveedores" ON public.proveedores
  FOR ALL TO authenticated USING (comercial.puede_operar()) WITH CHECK (comercial.puede_operar());

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['monedas', 'cuentas', 'centros_costo', 'cotizaciones', 'parametros_cuentas'] LOOP
    EXECUTE format('CREATE POLICY %I ON contabilidad.%I FOR SELECT TO authenticated USING (comercial.puede_ver())',
                   t || '_lectura_comercial', t);
  END LOOP;
END;
$$;
GRANT EXECUTE ON FUNCTION contabilidad.tc_vigente(char, date), contabilidad.tc_cierre(char, date),
  contabilidad.moneda_funcional() TO authenticated;

DROP TABLE public.compra_items;
DROP TABLE public.pagos_proveedor;
DROP TABLE public.compras_proveedor;
DROP FUNCTION public.recalcular_costo_promedio(integer, integer);
DROP FUNCTION public.trg_fn_compra_recibida_actualiza_ppp();
DROP FUNCTION public.actualizar_deuda_compra();
DROP FUNCTION public.actualizar_saldo_proveedor();
ALTER TABLE public.proveedores DROP COLUMN saldo_cuenta_corriente;
