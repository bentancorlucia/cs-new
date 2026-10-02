-- ============================================================
-- Correcciones de tienda encontradas al probar las pantallas
--   · registrar_transferencia_donaciones fallaba siempre: la columna de
--     salida transferencia_id chocaba con donaciones.transferencia_id.
--   · Esa función confía en p_creado_por: solo la ejecuta el servidor
--     (service role), nunca un usuario por la API.
-- ============================================================
CREATE OR REPLACE FUNCTION "public"."registrar_transferencia_donaciones"("p_fecha" "date", "p_comprobante_url" "text", "p_notas" "text", "p_creado_por" "uuid") RETURNS TABLE("transferencia_id" integer, "monto_total" numeric, "cantidad" integer)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
#variable_conflict use_column
DECLARE
  v_total DECIMAL(10,2);
  v_cantidad INTEGER;
  v_transferencia_id INTEGER;
BEGIN
  -- Con service role no hay auth.uid(): se valida a quien registra.
  IF NOT EXISTS (
    SELECT 1 FROM perfil_roles pr JOIN roles r ON r.id = pr.rol_id
     WHERE pr.perfil_id = COALESCE(auth.uid(), p_creado_por)
       AND r.nombre IN ('super_admin', 'tienda', 'tesorero')
  ) THEN
    RAISE EXCEPTION 'No autorizado';
  END IF;

  SELECT COALESCE(SUM(monto), 0), COUNT(*)
    INTO v_total, v_cantidad
    FROM donaciones
   WHERE estado = 'cobrada' AND transferencia_id IS NULL;

  IF v_cantidad = 0 THEN
    RAISE EXCEPTION 'No hay donaciones pendientes de transferir';
  END IF;

  INSERT INTO donaciones_transferencias
    (fecha_transferencia, monto_total, cantidad_donaciones, comprobante_url, notas, creado_por)
  VALUES
    (p_fecha, v_total, v_cantidad, p_comprobante_url, p_notas, p_creado_por)
  RETURNING id INTO v_transferencia_id;

  UPDATE donaciones
     SET estado = 'transferida',
         transferencia_id = v_transferencia_id
   WHERE estado = 'cobrada' AND transferencia_id IS NULL;

  -- Sale del banco de la tienda y cancela el pasivo con la Olla.
  PERFORM contabilidad._asiento_automatico(p_fecha,
    'Transferencia de donaciones a la Olla del Hogar (' || v_cantidad || ' donaciones)',
    'donaciones_transferencia', v_transferencia_id::text, jsonb_build_array(
      jsonb_build_object('cuenta_id', comercial._cuenta('donaciones'), 'lado', 'debe', 'importe', v_total),
      jsonb_build_object('cuenta_id', comercial._cuenta('banco_cobros'), 'lado', 'haber', 'importe', v_total)));

  RETURN QUERY SELECT v_transferencia_id, v_total, v_cantidad;
END
$$;

REVOKE EXECUTE ON FUNCTION public.registrar_transferencia_donaciones(date, text, text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.registrar_transferencia_donaciones(date, text, text, uuid) TO service_role;

-- ------------------------------------------------------------
-- Suma de stock de variantes en el producto: escribe el espejo de
-- stock_actual, así que corre marcado como sincronización del motor
-- (si no, el trigger que protege stock_actual la rechaza al activar o
-- desactivar una variante con stock).
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.trg_fn_sync_stock_producto_variantes() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
DECLARE
  v_producto_id INTEGER;
  v_previo TEXT := coalesce(current_setting('comercial.sincronizando', true), '');
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_producto_id := OLD.producto_id;
  ELSE
    v_producto_id := NEW.producto_id;
  END IF;

  PERFORM set_config('comercial.sincronizando', 'on', true);
  UPDATE productos p
     SET stock_actual = COALESCE((
           SELECT SUM(v.stock_actual)
             FROM producto_variantes v
            WHERE v.producto_id = v_producto_id
              AND v.activo = TRUE
         ), 0),
         updated_at = NOW()
   WHERE p.id = v_producto_id;
  PERFORM set_config('comercial.sincronizando', v_previo, true);

  RETURN NULL;
END
$$;

DROP TRIGGER trg_sync_stock_producto_variantes ON public.producto_variantes;
CREATE TRIGGER trg_sync_stock_producto_variantes
  AFTER INSERT OR DELETE OR UPDATE OF stock_actual, activo ON public.producto_variantes
  FOR EACH ROW EXECUTE FUNCTION public.trg_fn_sync_stock_producto_variantes();

-- ------------------------------------------------------------
-- Un solo lugar con stock: fuera depósitos y transferencias entre
-- depósitos (pantallas y APIs ya borradas; en producción, 1 depósito
-- y 0 transferencias)
-- ------------------------------------------------------------
ALTER TABLE public.stock_movimientos DROP COLUMN deposito_id;
DROP TABLE public.transferencia_items;
DROP TABLE public.transferencias_deposito;
DROP TABLE public.stock_deposito;
DROP TABLE public.depositos;
