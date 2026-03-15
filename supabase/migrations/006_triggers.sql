-- ============================================
-- Migración 006: Triggers
-- ============================================

-- Trigger: crear perfil automáticamente al registrarse
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.perfiles (id, nombre, apellido)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'nombre', ''),
    COALESCE(NEW.raw_user_meta_data->>'apellido', '')
  );

  -- Asignar rol no_socio automáticamente
  INSERT INTO public.perfil_roles (perfil_id, rol_id)
  SELECT NEW.id, r.id FROM public.roles r WHERE r.nombre = 'no_socio';

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Trigger: generar número de pedido
CREATE OR REPLACE FUNCTION generar_numero_pedido()
RETURNS TRIGGER AS $$
DECLARE
  fecha_str TEXT;
  secuencia INTEGER;
BEGIN
  fecha_str := TO_CHAR(NOW(), 'YYYYMMDD');
  SELECT COALESCE(MAX(
    CAST(SPLIT_PART(numero_pedido, '-', 3) AS INTEGER)
  ), 0) + 1 INTO secuencia
  FROM pedidos
  WHERE numero_pedido LIKE 'CS-' || fecha_str || '-%';

  NEW.numero_pedido := 'CS-' || fecha_str || '-' || LPAD(secuencia::TEXT, 3, '0');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_numero_pedido
  BEFORE INSERT ON pedidos
  FOR EACH ROW
  WHEN (NEW.numero_pedido IS NULL)
  EXECUTE FUNCTION generar_numero_pedido();

-- Trigger: actualizar saldo proveedor al pagar
CREATE OR REPLACE FUNCTION actualizar_saldo_proveedor()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE proveedores
    SET saldo_cuenta_corriente = saldo_cuenta_corriente - NEW.monto,
        updated_at = NOW()
    WHERE id = NEW.proveedor_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER on_pago_proveedor
  AFTER INSERT ON pagos_proveedor
  FOR EACH ROW EXECUTE FUNCTION actualizar_saldo_proveedor();

-- Trigger: aumentar deuda al confirmar compra
CREATE OR REPLACE FUNCTION actualizar_deuda_compra()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.estado = 'confirmada' AND OLD.estado = 'borrador' THEN
    UPDATE proveedores
    SET saldo_cuenta_corriente = saldo_cuenta_corriente + NEW.total,
        updated_at = NOW()
    WHERE id = NEW.proveedor_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER on_compra_confirmada
  AFTER UPDATE ON compras_proveedor
  FOR EACH ROW EXECUTE FUNCTION actualizar_deuda_compra();

-- Trigger: updated_at automático
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_updated_at_perfiles
  BEFORE UPDATE ON perfiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER set_updated_at_productos
  BEFORE UPDATE ON productos
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER set_updated_at_pedidos
  BEFORE UPDATE ON pedidos
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER set_updated_at_proveedores
  BEFORE UPDATE ON proveedores
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER set_updated_at_compras
  BEFORE UPDATE ON compras_proveedor
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER set_updated_at_eventos
  BEFORE UPDATE ON eventos
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER set_updated_at_entradas
  BEFORE UPDATE ON entradas
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER set_updated_at_pagos_mp
  BEFORE UPDATE ON pagos_mercadopago
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
