-- ============================================================
-- Fuera la tesorería vieja (libro de caja sin partida doble)
--
-- La reemplazan el schema `contabilidad` y la tienda contabilizada.
-- Ya nada la usa: ni la tienda (cancelar_pedido se reescribió), ni el
-- MCP (pasó a herramientas de contabilidad), ni pantallas.
--
-- En producción esto corre en el corte, después de exportar sus datos
-- (139 movimientos de pedidos y saldos de 4 cuentas) para referencia;
-- los saldos de apertura los carga el tesorero en contabilidad.
-- ============================================================
DROP FUNCTION public.aplicar_cambios_tesoreria(jsonb);
DROP FUNCTION public.estado_conciliacion_cuenta(integer);
DROP FUNCTION public.actualizar_saldo_cuenta_rpc(integer, numeric);

DROP TABLE public.transferencias_internas;
DROP TABLE public.tesoreria_historial;
DROP TABLE public.movimientos_financieros;
DROP TABLE public.extractos_importados;
DROP TABLE public.presupuestos;
DROP TABLE public.categorias_financieras;
DROP TABLE public.cuentas_financieras;
DROP TABLE public.cotizaciones_bcu;

DROP FUNCTION public.actualizar_saldo_cuenta();
DROP FUNCTION public.registrar_historial_movimiento();
DROP FUNCTION public.desconciliar_si_cambia_monto();
