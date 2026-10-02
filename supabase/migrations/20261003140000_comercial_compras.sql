-- ============================================================
-- Comercial — compras y cuenta corriente con proveedores
--
-- Cuenta corriente de todo el club (no solo de la tienda):
--   orden de compra  → aprobación (tienda o tesorero), sin asiento
--   recepción        D Mercadería                 H Mercadería recibida a facturar (aux. proveedor)
--   factura          D Recibida a facturar / gasto H Proveedores UYU|USD (aux. proveedor)
--                    (contado: H Caja/Banco)
--   nota de crédito  D Proveedores                 H gasto / Mercadería (devolución)
--   pago             D Proveedores (al TC de cada factura) · Anticipos (lo no aplicado)
--                    H Caja/Banco (al TC del pago) · diferencia de cambio realizada
--   aplicar anticipo D Proveedores                 H Anticipos (+ diferencia de cambio)
-- Saldo de cada documento = total − aplicaciones vigentes. Control:
-- saldo por proveedor según documentos = mayor de Proveedores por auxiliar.
-- ============================================================

-- ------------------------------------------------------------
-- Parámetros contables del proceso "compras"
-- ------------------------------------------------------------
INSERT INTO contabilidad.parametros_cuentas (proceso, rol, moneda, cuenta_id, descripcion)
SELECT 'compras', v.rol, v.moneda, c.id, v.descripcion FROM (VALUES
  ('mercaderia', NULL, '1.1.05.01', 'Inventario de la tienda'),
  ('recibido_a_facturar', NULL, '2.1.01.03', 'Mercadería recibida pendiente de factura'),
  ('proveedores', 'UYU', '2.1.01.01', 'Deuda con proveedores en pesos'),
  ('proveedores', 'USD', '2.1.01.02', 'Deuda con proveedores en dólares'),
  ('anticipos', 'UYU', '1.1.04.04', 'Anticipos y saldos a favor en pesos'),
  ('anticipos', 'USD', '1.1.04.05', 'Anticipos y saldos a favor en dólares'),
  ('ajustes_stock', NULL, '5.1.02', 'Diferencias al devolver mercadería')
) AS v(rol, moneda, codigo, descripcion)
JOIN contabilidad.cuentas c ON c.codigo = v.codigo;

-- La moneda funcional se guarda como NULL en parametros (como en cuentas)
UPDATE contabilidad.parametros_cuentas SET moneda = NULL
WHERE proceso = 'compras' AND moneda = 'UYU';

CREATE FUNCTION comercial._cuenta_compras(p_rol text, p_moneda char(3)) RETURNS uuid
LANGUAGE sql STABLE SET search_path = '' AS $$
  SELECT contabilidad.cuenta_para('compras', p_rol,
    CASE WHEN p_moneda = contabilidad.moneda_funcional() THEN NULL ELSE p_moneda END);
$$;

-- TC de un documento: el indicado o el vigente (día hábil anterior)
CREATE FUNCTION comercial._tc(p_moneda char(3), p_fecha date, p_tc numeric) RETURNS numeric
LANGUAGE plpgsql STABLE SET search_path = '' AS $$
DECLARE
  v_tc numeric;
BEGIN
  IF p_moneda = contabilidad.moneda_funcional() THEN
    RETURN 1;
  END IF;
  v_tc := coalesce(p_tc, contabilidad.tc_vigente(p_moneda, p_fecha));
  IF v_tc IS NULL OR v_tc <= 0 THEN
    RAISE EXCEPTION 'No hay cotización de % anterior al %', p_moneda, to_char(p_fecha, 'DD/MM/YYYY');
  END IF;
  RETURN v_tc;
END;
$$;

-- ------------------------------------------------------------
-- Datos comerciales del proveedor
-- ------------------------------------------------------------
CREATE TABLE comercial.proveedores_condiciones (
  proveedor_id integer PRIMARY KEY REFERENCES public.proveedores (id) ON DELETE CASCADE,
  moneda char(3) NOT NULL DEFAULT 'UYU' REFERENCES contabilidad.monedas (codigo),
  plazo_dias integer NOT NULL DEFAULT 30 CHECK (plazo_dias BETWEEN 0 AND 365),
  cuenta_gasto_id uuid REFERENCES contabilidad.cuentas (id) ON DELETE SET NULL,
  centro_costo_id uuid REFERENCES contabilidad.centros_costo (id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- ------------------------------------------------------------
-- Órdenes de compra
-- ------------------------------------------------------------
CREATE SEQUENCE comercial.numero_orden_compra;
CREATE SEQUENCE comercial.numero_recepcion;
CREATE SEQUENCE comercial.numero_orden_pago;

CREATE TABLE comercial.ordenes_compra (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  numero text NOT NULL UNIQUE DEFAULT 'OC-' || lpad(nextval('comercial.numero_orden_compra')::text, 5, '0'),
  proveedor_id integer NOT NULL REFERENCES public.proveedores (id) ON DELETE RESTRICT,
  fecha date NOT NULL DEFAULT contabilidad._hoy(),
  moneda char(3) NOT NULL DEFAULT 'UYU' REFERENCES contabilidad.monedas (codigo),
  estado text NOT NULL DEFAULT 'borrador'
    CHECK (estado IN ('borrador', 'aprobada', 'recibida_parcial', 'recibida', 'cancelada')),
  notas text,
  aprobada_por uuid,
  aprobada_at timestamptz,
  creado_por uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((estado IN ('borrador', 'cancelada')) OR aprobada_at IS NOT NULL)
);

CREATE TABLE comercial.orden_compra_items (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  orden_id bigint NOT NULL REFERENCES comercial.ordenes_compra (id) ON DELETE CASCADE,
  producto_id integer NOT NULL REFERENCES public.productos (id) ON DELETE RESTRICT,
  variante_id integer REFERENCES public.producto_variantes (id) ON DELETE RESTRICT,
  cantidad integer NOT NULL CHECK (cantidad > 0),
  costo_unitario numeric(18, 4) NOT NULL CHECK (costo_unitario >= 0),
  cantidad_recibida integer NOT NULL DEFAULT 0 CHECK (cantidad_recibida >= 0),
  CHECK (cantidad_recibida <= cantidad)
);

-- ------------------------------------------------------------
-- Recepciones
-- ------------------------------------------------------------
CREATE TABLE comercial.recepciones (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  numero text NOT NULL UNIQUE DEFAULT 'REC-' || lpad(nextval('comercial.numero_recepcion')::text, 5, '0'),
  proveedor_id integer NOT NULL REFERENCES public.proveedores (id) ON DELETE RESTRICT,
  orden_id bigint REFERENCES comercial.ordenes_compra (id) ON DELETE RESTRICT,
  fecha date NOT NULL,
  moneda char(3) NOT NULL REFERENCES contabilidad.monedas (codigo),
  tc numeric(20, 10) NOT NULL CHECK (tc > 0),
  remito text,
  estado text NOT NULL DEFAULT 'confirmada' CHECK (estado IN ('confirmada', 'anulada')),
  idempotency_key text UNIQUE,
  asiento_id uuid REFERENCES contabilidad.asientos (id),
  creado_por uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE comercial.recepcion_items (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  recepcion_id bigint NOT NULL REFERENCES comercial.recepciones (id) ON DELETE RESTRICT,
  orden_item_id bigint REFERENCES comercial.orden_compra_items (id) ON DELETE RESTRICT,
  item_id bigint NOT NULL REFERENCES comercial.items (id) ON DELETE RESTRICT,
  cantidad integer NOT NULL CHECK (cantidad > 0),
  -- costo en la moneda de la recepción y su valor en pesos
  costo_unitario numeric(18, 4) NOT NULL CHECK (costo_unitario >= 0),
  valor numeric(18, 2) NOT NULL CHECK (valor >= 0),
  cantidad_facturada integer NOT NULL DEFAULT 0 CHECK (cantidad_facturada >= 0),
  CHECK (cantidad_facturada <= cantidad)
);

-- ------------------------------------------------------------
-- Documentos del proveedor (facturas, notas de crédito y débito)
-- ------------------------------------------------------------
CREATE TABLE comercial.documentos_proveedor (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  proveedor_id integer NOT NULL REFERENCES public.proveedores (id) ON DELETE RESTRICT,
  tipo text NOT NULL CHECK (tipo IN ('factura', 'nota_credito', 'nota_debito')),
  contado boolean NOT NULL DEFAULT false,
  serie text NOT NULL DEFAULT '',
  numero text NOT NULL CHECK (length(btrim(numero)) > 0),
  fecha date NOT NULL,
  vencimiento date,
  moneda char(3) NOT NULL REFERENCES contabilidad.monedas (codigo),
  tc numeric(20, 10) NOT NULL CHECK (tc > 0),
  total numeric(18, 2) NOT NULL CHECK (total > 0),
  -- contado: de dónde salió la plata
  cuenta_pago_id uuid REFERENCES contabilidad.cuentas (id),
  estado text NOT NULL DEFAULT 'vigente' CHECK (estado IN ('vigente', 'anulado')),
  notas text,
  asiento_id uuid REFERENCES contabilidad.asientos (id),
  creado_por uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (NOT contado OR (tipo = 'factura' AND cuenta_pago_id IS NOT NULL)),
  CHECK (vencimiento IS NULL OR vencimiento >= fecha),
  UNIQUE (proveedor_id, tipo, serie, numero)
);

CREATE TABLE comercial.documento_proveedor_lineas (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  documento_id bigint NOT NULL REFERENCES comercial.documentos_proveedor (id) ON DELETE RESTRICT,
  tipo text NOT NULL CHECK (tipo IN ('recepcion', 'gasto', 'devolucion')),
  recepcion_item_id bigint REFERENCES comercial.recepcion_items (id) ON DELETE RESTRICT,
  item_id bigint REFERENCES comercial.items (id) ON DELETE RESTRICT,
  cantidad integer CHECK (cantidad > 0),
  cuenta_id uuid REFERENCES contabilidad.cuentas (id) ON DELETE RESTRICT,
  centro_costo_id uuid REFERENCES contabilidad.centros_costo (id) ON DELETE RESTRICT,
  descripcion text,
  -- en la moneda del documento
  importe numeric(18, 2) NOT NULL CHECK (importe > 0),
  CHECK ((tipo = 'recepcion') = (recepcion_item_id IS NOT NULL)),
  CHECK ((tipo = 'gasto') = (cuenta_id IS NOT NULL)),
  CHECK ((tipo = 'devolucion') = (item_id IS NOT NULL)),
  CHECK (tipo = 'gasto' OR cantidad IS NOT NULL)
);

-- ------------------------------------------------------------
-- Órdenes de pago y aplicaciones
-- ------------------------------------------------------------
CREATE TABLE comercial.ordenes_pago (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  numero text NOT NULL UNIQUE DEFAULT 'OP-' || lpad(nextval('comercial.numero_orden_pago')::text, 5, '0'),
  proveedor_id integer NOT NULL REFERENCES public.proveedores (id) ON DELETE RESTRICT,
  moneda char(3) NOT NULL REFERENCES contabilidad.monedas (codigo),
  importe numeric(18, 2) NOT NULL CHECK (importe > 0),
  cuenta_pago_id uuid NOT NULL REFERENCES contabilidad.cuentas (id),
  estado text NOT NULL DEFAULT 'pendiente' CHECK (estado IN ('pendiente', 'pagada', 'anulada')),
  fecha_pago date,
  tc numeric(20, 10) CHECK (tc > 0),
  referencia text,
  notas text,
  asiento_id uuid REFERENCES contabilidad.asientos (id),
  creado_por uuid DEFAULT auth.uid(),
  pagada_por uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((estado = 'pagada') = (fecha_pago IS NOT NULL AND tc IS NOT NULL) OR estado = 'anulada')
);

-- Una aplicación cancela parte de un documento (factura / nota de
-- débito) con un pago o con una nota de crédito.
CREATE TABLE comercial.aplicaciones_proveedor (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  documento_id bigint NOT NULL REFERENCES comercial.documentos_proveedor (id) ON DELETE RESTRICT,
  orden_pago_id bigint REFERENCES comercial.ordenes_pago (id) ON DELETE RESTRICT,
  nota_credito_id bigint REFERENCES comercial.documentos_proveedor (id) ON DELETE RESTRICT,
  importe numeric(18, 2) NOT NULL CHECK (importe > 0),
  fecha date NOT NULL,
  vigente boolean NOT NULL DEFAULT true,
  asiento_id uuid REFERENCES contabilidad.asientos (id),
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((orden_pago_id IS NULL) <> (nota_credito_id IS NULL))
);

CREATE INDEX aplicaciones_documento_idx ON comercial.aplicaciones_proveedor (documento_id) WHERE vigente;
CREATE INDEX aplicaciones_pago_idx ON comercial.aplicaciones_proveedor (orden_pago_id) WHERE vigente;

-- ------------------------------------------------------------
-- Saldos
-- ------------------------------------------------------------
-- Saldo pendiente de un documento, en su moneda.
CREATE FUNCTION comercial.saldo_documento(p_documento bigint) RETURNS numeric
LANGUAGE sql STABLE SET search_path = '' AS $$
  SELECT CASE
    WHEN d.estado = 'anulado' OR d.contado THEN 0
    WHEN d.tipo = 'nota_credito' THEN
      d.total - coalesce((SELECT sum(a.importe) FROM comercial.aplicaciones_proveedor a
                          WHERE a.nota_credito_id = d.id AND a.vigente), 0)
    ELSE
      d.total - coalesce((SELECT sum(a.importe) FROM comercial.aplicaciones_proveedor a
                          WHERE a.documento_id = d.id AND a.vigente), 0)
  END
  FROM comercial.documentos_proveedor d WHERE d.id = p_documento;
$$;

-- Lo no aplicado de un pago (anticipo / saldo a favor), en su moneda.
CREATE FUNCTION comercial.saldo_pago(p_pago bigint) RETURNS numeric
LANGUAGE sql STABLE SET search_path = '' AS $$
  SELECT CASE WHEN p.estado <> 'pagada' THEN 0 ELSE
    p.importe - coalesce((SELECT sum(a.importe) FROM comercial.aplicaciones_proveedor a
                          WHERE a.orden_pago_id = p.id AND a.vigente), 0) END
  FROM comercial.ordenes_pago p WHERE p.id = p_pago;
$$;

-- ------------------------------------------------------------
-- Órdenes de compra
-- ------------------------------------------------------------
--   p_items: [{ producto_id, variante_id?, cantidad, costo_unitario }]
CREATE FUNCTION comercial.guardar_orden_compra(
  p_id bigint, p_proveedor integer, p_fecha date, p_moneda char(3), p_items jsonb, p_notas text DEFAULT NULL
) RETURNS bigint
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_id bigint := p_id;
  v_i jsonb;
BEGIN
  PERFORM comercial._exigir_operador();
  IF p_items IS NULL OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'La orden no tiene ítems';
  END IF;
  IF v_id IS NULL THEN
    INSERT INTO comercial.ordenes_compra (proveedor_id, fecha, moneda, notas)
    VALUES (p_proveedor, p_fecha, p_moneda, p_notas) RETURNING id INTO v_id;
  ELSE
    UPDATE comercial.ordenes_compra SET proveedor_id = p_proveedor, fecha = p_fecha, moneda = p_moneda, notas = p_notas
    WHERE id = v_id AND estado = 'borrador';
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Solo se edita una orden en borrador';
    END IF;
    DELETE FROM comercial.orden_compra_items WHERE orden_id = v_id;
  END IF;
  FOR v_i IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    -- valida producto/variante
    PERFORM comercial._item((v_i ->> 'producto_id')::int, nullif(v_i ->> 'variante_id', '')::int);
    INSERT INTO comercial.orden_compra_items (orden_id, producto_id, variante_id, cantidad, costo_unitario)
    VALUES (v_id, (v_i ->> 'producto_id')::int, nullif(v_i ->> 'variante_id', '')::int,
            (v_i ->> 'cantidad')::int, (v_i ->> 'costo_unitario')::numeric);
  END LOOP;
  RETURN v_id;
END;
$$;

CREATE FUNCTION comercial.aprobar_orden_compra(p_id bigint) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  PERFORM comercial._exigir_operador();
  UPDATE comercial.ordenes_compra SET estado = 'aprobada', aprobada_por = auth.uid(), aprobada_at = now()
  WHERE id = p_id AND estado = 'borrador';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'La orden no está en borrador';
  END IF;
END;
$$;

CREATE FUNCTION comercial.cancelar_orden_compra(p_id bigint) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  PERFORM comercial._exigir_operador();
  IF EXISTS (SELECT 1 FROM comercial.recepciones WHERE orden_id = p_id AND estado = 'confirmada') THEN
    RAISE EXCEPTION 'La orden ya tiene recepciones: se cierra, no se cancela';
  END IF;
  UPDATE comercial.ordenes_compra SET estado = 'cancelada' WHERE id = p_id AND estado IN ('borrador', 'aprobada');
  IF NOT FOUND THEN
    RAISE EXCEPTION 'La orden no se puede cancelar';
  END IF;
END;
$$;

-- ------------------------------------------------------------
-- Recepción de mercadería
-- ------------------------------------------------------------
--   p_items: [{ orden_item_id? | producto_id + variante_id?, cantidad, costo_unitario? }]
-- Con orden: el costo es el de la orden (salvo que se indique otro) y no
-- se recibe más que lo pendiente. Idempotente por p_idempotency_key.
CREATE FUNCTION comercial.recibir_mercaderia(
  p_proveedor integer, p_orden bigint, p_fecha date, p_moneda char(3), p_items jsonb,
  p_remito text DEFAULT NULL, p_tc numeric DEFAULT NULL, p_idempotency_key text DEFAULT NULL
) RETURNS bigint
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_id bigint;
  v_orden comercial.ordenes_compra;
  v_tc numeric;
  v_i jsonb;
  v_oi comercial.orden_compra_items;
  v_item comercial.items;
  v_cant integer;
  v_costo numeric;
  v_valor numeric;
  v_total numeric := 0;
  v_asiento uuid;
  v_ref text;
BEGIN
  PERFORM comercial._exigir_operador();
  IF p_idempotency_key IS NOT NULL THEN
    SELECT id INTO v_id FROM comercial.recepciones WHERE idempotency_key = p_idempotency_key;
    IF v_id IS NOT NULL THEN
      RETURN v_id;
    END IF;
  END IF;
  IF p_items IS NULL OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'La recepción no tiene ítems';
  END IF;

  IF p_orden IS NOT NULL THEN
    SELECT * INTO v_orden FROM comercial.ordenes_compra WHERE id = p_orden FOR UPDATE;
    IF v_orden.estado NOT IN ('aprobada', 'recibida_parcial') THEN
      RAISE EXCEPTION 'La orden % no está aprobada', v_orden.numero;
    END IF;
    IF v_orden.proveedor_id <> p_proveedor OR v_orden.moneda <> p_moneda THEN
      RAISE EXCEPTION 'La recepción tiene que ser del mismo proveedor y moneda que la orden';
    END IF;
  END IF;

  v_tc := comercial._tc(p_moneda, p_fecha, p_tc);
  INSERT INTO comercial.recepciones (proveedor_id, orden_id, fecha, moneda, tc, remito, idempotency_key)
  VALUES (p_proveedor, p_orden, p_fecha, p_moneda, v_tc, p_remito, p_idempotency_key)
  RETURNING id INTO v_id;
  v_ref := v_id::text;

  FOR v_i IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    v_cant := (v_i ->> 'cantidad')::int;
    IF v_cant IS NULL OR v_cant <= 0 THEN
      RAISE EXCEPTION 'Cantidad inválida';
    END IF;
    v_oi := NULL;
    IF v_i ? 'orden_item_id' THEN
      SELECT * INTO v_oi FROM comercial.orden_compra_items
      WHERE id = (v_i ->> 'orden_item_id')::bigint AND orden_id = p_orden FOR UPDATE;
      IF v_oi.id IS NULL THEN
        RAISE EXCEPTION 'El ítem no es de la orden';
      END IF;
      IF v_oi.cantidad_recibida + v_cant > v_oi.cantidad THEN
        RAISE EXCEPTION 'Se reciben más unidades que las pendientes de la orden (pendientes: %)',
          v_oi.cantidad - v_oi.cantidad_recibida;
      END IF;
      UPDATE comercial.orden_compra_items SET cantidad_recibida = cantidad_recibida + v_cant WHERE id = v_oi.id;
      v_item := comercial._item(v_oi.producto_id, v_oi.variante_id);
      v_costo := coalesce((v_i ->> 'costo_unitario')::numeric, v_oi.costo_unitario);
    ELSE
      IF p_orden IS NOT NULL THEN
        RAISE EXCEPTION 'Con orden de compra, cada ítem indica su línea de la orden';
      END IF;
      v_item := comercial._item((v_i ->> 'producto_id')::int, nullif(v_i ->> 'variante_id', '')::int);
      v_costo := (v_i ->> 'costo_unitario')::numeric;
      IF v_costo IS NULL OR v_costo < 0 THEN
        RAISE EXCEPTION 'Indicá el costo unitario';
      END IF;
    END IF;

    v_valor := comercial._entrada(v_item.id, v_cant, round(v_costo * v_tc, 6), p_fecha, 'compra',
                                  'recepcion', v_ref, 'Recepción de mercadería');
    INSERT INTO comercial.recepcion_items (recepcion_id, orden_item_id, item_id, cantidad, costo_unitario, valor)
    VALUES (v_id, v_oi.id, v_item.id, v_cant, v_costo, v_valor);
    v_total := v_total + v_valor;
  END LOOP;

  IF v_total > 0 THEN
    v_asiento := contabilidad._asiento_automatico(p_fecha,
      'Recepción ' || (SELECT numero FROM comercial.recepciones WHERE id = v_id) || ' — '
        || (SELECT nombre FROM public.proveedores WHERE id = p_proveedor),
      'recepcion', v_ref, jsonb_build_array(
        jsonb_build_object('cuenta_id', comercial._cuenta_compras('mercaderia', NULL), 'lado', 'debe', 'importe', v_total),
        jsonb_build_object('cuenta_id', comercial._cuenta_compras('recibido_a_facturar', NULL), 'lado', 'haber',
                           'importe', v_total, 'proveedor_id', p_proveedor)));
    UPDATE comercial.recepciones SET asiento_id = v_asiento WHERE id = v_id;
    PERFORM comercial._vincular_asiento('recepcion', v_ref, v_asiento);
  END IF;

  IF p_orden IS NOT NULL THEN
    UPDATE comercial.ordenes_compra SET estado = CASE
      WHEN NOT EXISTS (SELECT 1 FROM comercial.orden_compra_items WHERE orden_id = p_orden AND cantidad_recibida < cantidad)
        THEN 'recibida' ELSE 'recibida_parcial' END
    WHERE id = p_orden;
  END IF;
  RETURN v_id;
END;
$$;

-- ------------------------------------------------------------
-- Documentos del proveedor
-- ------------------------------------------------------------
-- p_lineas: [{ tipo: 'recepcion', recepcion_item_id, cantidad, importe }
--          | { tipo: 'gasto', cuenta_id, centro_costo_id?, descripcion?, importe }
--          | { tipo: 'devolucion', producto_id, variante_id?, cantidad, importe }]  (solo NC)
-- importe en la moneda del documento. Factura contado: p_cuenta_pago.
CREATE FUNCTION comercial.registrar_documento_proveedor(
  p_proveedor integer, p_tipo text, p_serie text, p_numero text, p_fecha date,
  p_moneda char(3), p_lineas jsonb, p_vencimiento date DEFAULT NULL, p_tc numeric DEFAULT NULL,
  p_cuenta_pago uuid DEFAULT NULL, p_notas text DEFAULT NULL
) RETURNS bigint
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_id bigint;
  v_tc numeric;
  v_total numeric := 0;
  v_l jsonb;
  v_ri comercial.recepcion_items;
  v_rec comercial.recepciones;
  v_item comercial.items;
  v_cuenta contabilidad.cuentas;
  v_lineas jsonb := '[]'::jsonb;
  v_base numeric := 0;       -- pesos de las líneas de la factura (debe en facturas, haber en NC)
  v_total_base numeric;      -- pesos de la contrapartida
  v_valor numeric;
  v_dif numeric;
  v_asiento uuid;
  v_cp uuid;
  v_signo text;
  v_contra text;
  v_ref text;
  v_plazo integer;
  v_nombre text;
BEGIN
  PERFORM comercial._exigir_operador();
  IF p_tipo NOT IN ('factura', 'nota_credito', 'nota_debito') THEN
    RAISE EXCEPTION 'Tipo de documento inválido';
  END IF;
  IF p_lineas IS NULL OR jsonb_array_length(p_lineas) = 0 THEN
    RAISE EXCEPTION 'El documento no tiene líneas';
  END IF;
  v_tc := comercial._tc(p_moneda, p_fecha, p_tc);
  SELECT plazo_dias INTO v_plazo FROM comercial.proveedores_condiciones WHERE proveedor_id = p_proveedor;
  SELECT nombre INTO v_nombre FROM public.proveedores WHERE id = p_proveedor;

  SELECT coalesce(sum((l ->> 'importe')::numeric), 0) INTO v_total FROM jsonb_array_elements(p_lineas) l;

  INSERT INTO comercial.documentos_proveedor (proveedor_id, tipo, contado, serie, numero, fecha, vencimiento,
                                              moneda, tc, total, cuenta_pago_id, notas)
  VALUES (p_proveedor, p_tipo, p_cuenta_pago IS NOT NULL, coalesce(btrim(p_serie), ''), btrim(p_numero), p_fecha,
          CASE WHEN p_cuenta_pago IS NOT NULL OR p_tipo = 'nota_credito' THEN NULL
               ELSE coalesce(p_vencimiento, p_fecha + coalesce(v_plazo, 30)) END,
          p_moneda, v_tc, v_total, p_cuenta_pago, p_notas)
  RETURNING id INTO v_id;
  v_ref := v_id::text;

  -- En una nota de crédito las líneas van al haber; en factura/ND al debe.
  v_signo := CASE WHEN p_tipo = 'nota_credito' THEN 'haber' ELSE 'debe' END;
  v_contra := CASE WHEN p_tipo = 'nota_credito' THEN 'debe' ELSE 'haber' END;

  FOR v_l IN SELECT * FROM jsonb_array_elements(p_lineas) LOOP
    IF (v_l ->> 'importe')::numeric IS NULL OR (v_l ->> 'importe')::numeric <= 0 THEN
      RAISE EXCEPTION 'Importe de línea inválido';
    END IF;

    IF v_l ->> 'tipo' = 'recepcion' THEN
      IF p_tipo <> 'factura' THEN
        RAISE EXCEPTION 'Solo una factura se imputa a una recepción';
      END IF;
      SELECT * INTO v_ri FROM comercial.recepcion_items WHERE id = (v_l ->> 'recepcion_item_id')::bigint FOR UPDATE;
      SELECT * INTO v_rec FROM comercial.recepciones WHERE id = v_ri.recepcion_id;
      IF v_rec.proveedor_id <> p_proveedor OR v_rec.estado <> 'confirmada' THEN
        RAISE EXCEPTION 'La recepción no es de este proveedor o está anulada';
      END IF;
      IF v_rec.moneda <> p_moneda THEN
        RAISE EXCEPTION 'La factura tiene que estar en la moneda de la recepción';
      END IF;
      IF v_ri.cantidad_facturada + (v_l ->> 'cantidad')::int > v_ri.cantidad THEN
        RAISE EXCEPTION 'Se facturan más unidades que las recibidas';
      END IF;
      UPDATE comercial.recepcion_items SET cantidad_facturada = cantidad_facturada + (v_l ->> 'cantidad')::int
      WHERE id = v_ri.id;
      -- Recibida a facturar se cancela al valor en que entró (proporcional)
      v_valor := round(v_ri.valor * (v_l ->> 'cantidad')::int / v_ri.cantidad, 2);
      INSERT INTO comercial.documento_proveedor_lineas (documento_id, tipo, recepcion_item_id, cantidad, importe)
      VALUES (v_id, 'recepcion', v_ri.id, (v_l ->> 'cantidad')::int, (v_l ->> 'importe')::numeric);
      v_lineas := v_lineas || jsonb_build_object(
        'cuenta_id', comercial._cuenta_compras('recibido_a_facturar', NULL), 'lado', 'debe',
        'importe', v_valor, 'proveedor_id', p_proveedor);
      -- Diferencia de precio (en la moneda del documento) contra lo
      -- recibido: a costo de ventas. La de tipo de cambio queda para el
      -- cierre del asiento (diferencia de cambio realizada).
      v_dif := round(((v_l ->> 'importe')::numeric - (v_l ->> 'cantidad')::int * v_ri.costo_unitario) * v_tc, 2);
      IF v_dif <> 0 THEN
        v_lineas := v_lineas || jsonb_build_object(
          'cuenta_id', comercial._cuenta('costo_ventas'), 'lado', CASE WHEN v_dif > 0 THEN 'debe' ELSE 'haber' END,
          'importe', abs(v_dif), 'descripcion', 'Diferencia de precio con la recepción',
          'centro_costo_id', (SELECT id FROM contabilidad.centros_costo WHERE codigo = 'TIENDA'));
      END IF;
      v_base := v_base + v_valor + v_dif;

    ELSIF v_l ->> 'tipo' = 'gasto' THEN
      SELECT * INTO v_cuenta FROM contabilidad.cuentas WHERE id = (v_l ->> 'cuenta_id')::uuid;
      IF v_cuenta.id IS NULL THEN
        RAISE EXCEPTION 'Cuenta de gasto inexistente';
      END IF;
      INSERT INTO comercial.documento_proveedor_lineas (documento_id, tipo, cuenta_id, centro_costo_id, descripcion, importe)
      VALUES (v_id, 'gasto', v_cuenta.id, (v_l ->> 'centro_costo_id')::uuid, v_l ->> 'descripcion',
              (v_l ->> 'importe')::numeric);
      v_valor := round((v_l ->> 'importe')::numeric * v_tc, 2);
      v_lineas := v_lineas || jsonb_build_object(
        'cuenta_id', v_cuenta.id, 'lado', v_signo, 'importe', v_valor,
        'centro_costo_id', (v_l ->> 'centro_costo_id')::uuid, 'descripcion', v_l ->> 'descripcion');
      v_base := v_base + v_valor;

    ELSIF v_l ->> 'tipo' = 'devolucion' THEN
      IF p_tipo <> 'nota_credito' THEN
        RAISE EXCEPTION 'La devolución de mercadería va en una nota de crédito';
      END IF;
      v_item := comercial._item((v_l ->> 'producto_id')::int, nullif(v_l ->> 'variante_id', '')::int);
      v_valor := comercial._salida(v_item.id, (v_l ->> 'cantidad')::int, p_fecha, 'devolucion_compra',
                                   'documento_proveedor', v_ref, 'Devolución al proveedor');
      INSERT INTO comercial.documento_proveedor_lineas (documento_id, tipo, item_id, cantidad, importe)
      VALUES (v_id, 'devolucion', v_item.id, (v_l ->> 'cantidad')::int, (v_l ->> 'importe')::numeric);
      v_lineas := v_lineas || jsonb_build_object(
        'cuenta_id', comercial._cuenta_compras('mercaderia', NULL), 'lado', 'haber', 'importe', v_valor);
      -- Lo que el proveedor acredita de más o de menos respecto del costo
      v_dif := round((v_l ->> 'importe')::numeric * v_tc, 2) - v_valor;
      IF v_dif <> 0 THEN
        v_lineas := v_lineas || jsonb_build_object(
          'cuenta_id', comercial._cuenta_compras('ajustes_stock', NULL),
          'lado', CASE WHEN v_dif > 0 THEN 'haber' ELSE 'debe' END, 'importe', abs(v_dif),
          'descripcion', 'Diferencia entre lo acreditado y el costo devuelto');
      END IF;
      v_base := v_base + v_valor + v_dif;
    ELSE
      RAISE EXCEPTION 'Tipo de línea inválido';
    END IF;
  END LOOP;

  -- Contrapartida: Proveedores (o Caja/Banco si es contado)
  v_total_base := round(v_total * v_tc, 2);
  IF p_cuenta_pago IS NOT NULL THEN
    SELECT * INTO v_cuenta FROM contabilidad.cuentas WHERE id = p_cuenta_pago;
    IF NOT v_cuenta.es_disponibilidad OR coalesce(v_cuenta.moneda, contabilidad.moneda_funcional()) <> p_moneda THEN
      RAISE EXCEPTION 'La cuenta de pago tiene que ser una caja o banco en %', p_moneda;
    END IF;
    v_cp := p_cuenta_pago;
    v_lineas := v_lineas || jsonb_build_object('cuenta_id', v_cp, 'lado', v_contra, 'importe', v_total, 'tc', v_tc);
  ELSE
    v_cp := comercial._cuenta_compras('proveedores', p_moneda);
    v_lineas := v_lineas || jsonb_build_object('cuenta_id', v_cp, 'lado', v_contra,
      'importe', v_total, 'tc', v_tc, 'proveedor_id', p_proveedor);
  END IF;

  -- Recepciones en USD valuadas a otro TC: diferencia de cambio realizada
  v_dif := v_total_base - v_base;
  IF v_dif <> 0 THEN
    IF p_tipo = 'nota_credito' THEN
      v_dif := -v_dif;
    END IF;
    v_lineas := v_lineas || jsonb_build_object(
      'cuenta_id', contabilidad.cuenta_sistema(CASE WHEN v_dif > 0 THEN 'diferencia_cambio_perdida_realizada'
                                                    ELSE 'diferencia_cambio_ganada_realizada' END),
      'lado', CASE WHEN v_dif > 0 THEN 'debe' ELSE 'haber' END, 'importe', abs(v_dif),
      'descripcion', 'Diferencia de cambio entre recepción y factura');
  END IF;

  v_asiento := contabilidad._asiento_automatico(p_fecha,
    initcap(replace(p_tipo, '_', ' ')) || ' ' || btrim(coalesce(p_serie, '') || ' ' || p_numero) || ' — ' || v_nombre,
    'documento_proveedor', v_ref, v_lineas);
  UPDATE comercial.documentos_proveedor SET asiento_id = v_asiento WHERE id = v_id;
  PERFORM comercial._vincular_asiento('documento_proveedor', v_ref, v_asiento);
  RETURN v_id;
END;
$$;

-- Anular un documento: sin aplicaciones vigentes. Revierte el asiento y
-- devuelve lo facturado de las recepciones / la mercadería devuelta.
CREATE FUNCTION comercial.anular_documento_proveedor(p_id bigint, p_motivo text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_d comercial.documentos_proveedor;
  r record;
  v_rev uuid;
BEGIN
  PERFORM comercial._exigir_operador();
  SELECT * INTO v_d FROM comercial.documentos_proveedor WHERE id = p_id FOR UPDATE;
  IF v_d.id IS NULL OR v_d.estado <> 'vigente' THEN
    RAISE EXCEPTION 'El documento no existe o ya está anulado';
  END IF;
  IF EXISTS (SELECT 1 FROM comercial.aplicaciones_proveedor
             WHERE (documento_id = p_id OR nota_credito_id = p_id) AND vigente) THEN
    RAISE EXCEPTION 'El documento tiene pagos o notas de crédito aplicados: anulá primero esas aplicaciones';
  END IF;
  v_rev := contabilidad._revertir(v_d.asiento_id, coalesce(nullif(p_motivo, ''), 'Documento anulado'), contabilidad._hoy());

  FOR r IN SELECT * FROM comercial.documento_proveedor_lineas WHERE documento_id = p_id LOOP
    IF r.tipo = 'recepcion' THEN
      UPDATE comercial.recepcion_items SET cantidad_facturada = cantidad_facturada - r.cantidad
      WHERE id = r.recepcion_item_id;
    ELSIF r.tipo = 'devolucion' THEN
      PERFORM comercial._entrada(r.item_id, r.cantidad,
        (SELECT -valor / -cantidad FROM comercial.movimientos
          WHERE origen_tipo = 'documento_proveedor' AND origen_id = p_id::text AND item_id = r.item_id
          ORDER BY id LIMIT 1),
        contabilidad._hoy(), 'compra', 'documento_proveedor_anulacion', p_id::text, 'Anulación de devolución');
    END IF;
  END LOOP;
  PERFORM comercial._vincular_asiento('documento_proveedor_anulacion', p_id::text, v_rev);
  UPDATE comercial.documentos_proveedor SET estado = 'anulado' WHERE id = p_id;
END;
$$;

-- Aplicar una nota de crédito a una factura (misma moneda, sin asiento:
-- las dos ya están en Proveedores).
CREATE FUNCTION comercial.aplicar_nota_credito(p_nota bigint, p_documento bigint, p_importe numeric) RETURNS bigint
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_n comercial.documentos_proveedor;
  v_d comercial.documentos_proveedor;
  v_id bigint;
BEGIN
  PERFORM comercial._exigir_operador();
  SELECT * INTO v_n FROM comercial.documentos_proveedor WHERE id = p_nota FOR UPDATE;
  SELECT * INTO v_d FROM comercial.documentos_proveedor WHERE id = p_documento FOR UPDATE;
  IF v_n.tipo <> 'nota_credito' OR v_d.tipo = 'nota_credito' OR v_n.proveedor_id <> v_d.proveedor_id
     OR v_n.moneda <> v_d.moneda OR v_n.estado <> 'vigente' OR v_d.estado <> 'vigente' THEN
    RAISE EXCEPTION 'La nota de crédito y el documento tienen que ser vigentes, del mismo proveedor y moneda';
  END IF;
  IF p_importe <= 0 OR p_importe > comercial.saldo_documento(p_nota) OR p_importe > comercial.saldo_documento(p_documento) THEN
    RAISE EXCEPTION 'El importe supera el saldo de la nota o del documento';
  END IF;
  INSERT INTO comercial.aplicaciones_proveedor (documento_id, nota_credito_id, importe, fecha)
  VALUES (p_documento, p_nota, p_importe, contabilidad._hoy()) RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

-- ------------------------------------------------------------
-- Órdenes de pago
-- ------------------------------------------------------------
-- p_aplicaciones: [{ documento_id, importe }] (misma moneda que el pago).
-- Lo no aplicado queda como anticipo / saldo a favor.
CREATE FUNCTION comercial.crear_orden_pago(
  p_proveedor integer, p_moneda char(3), p_importe numeric, p_cuenta_pago uuid,
  p_aplicaciones jsonb DEFAULT '[]', p_referencia text DEFAULT NULL, p_notas text DEFAULT NULL
) RETURNS bigint
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_id bigint;
  v_cuenta contabilidad.cuentas;
  v_a jsonb;
  v_sum numeric := 0;
BEGIN
  PERFORM comercial._exigir_operador();
  SELECT * INTO v_cuenta FROM contabilidad.cuentas WHERE id = p_cuenta_pago;
  IF NOT coalesce(v_cuenta.es_disponibilidad, false)
     OR coalesce(v_cuenta.moneda, contabilidad.moneda_funcional()) <> p_moneda THEN
    RAISE EXCEPTION 'La cuenta de pago tiene que ser una caja o banco en %', p_moneda;
  END IF;
  INSERT INTO comercial.ordenes_pago (proveedor_id, moneda, importe, cuenta_pago_id, referencia, notas)
  VALUES (p_proveedor, p_moneda, p_importe, p_cuenta_pago, p_referencia, p_notas) RETURNING id INTO v_id;
  FOR v_a IN SELECT * FROM jsonb_array_elements(coalesce(p_aplicaciones, '[]')) LOOP
    v_sum := v_sum + (v_a ->> 'importe')::numeric;
  END LOOP;
  IF v_sum > p_importe THEN
    RAISE EXCEPTION 'Lo aplicado supera el importe del pago';
  END IF;
  -- Las aplicaciones se guardan como no vigentes hasta pagar
  INSERT INTO comercial.aplicaciones_proveedor (documento_id, orden_pago_id, importe, fecha, vigente)
  SELECT (a ->> 'documento_id')::bigint, v_id, (a ->> 'importe')::numeric, contabilidad._hoy(), false
  FROM jsonb_array_elements(coalesce(p_aplicaciones, '[]')) a;
  RETURN v_id;
END;
$$;

-- Paga una orden: valida saldos, activa las aplicaciones y asienta.
CREATE FUNCTION comercial.pagar_orden(p_id bigint, p_fecha date DEFAULT NULL, p_tc numeric DEFAULT NULL) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_p comercial.ordenes_pago;
  v_fecha date;
  v_tc numeric;
  r record;
  v_lineas jsonb := '[]'::jsonb;
  v_base_aplicado numeric := 0;
  v_aplicado numeric := 0;
  v_anticipo numeric;
  v_dif numeric;
  v_asiento uuid;
  v_nombre text;
BEGIN
  PERFORM comercial._exigir_operador();
  SELECT * INTO v_p FROM comercial.ordenes_pago WHERE id = p_id FOR UPDATE;
  IF v_p.id IS NULL OR v_p.estado <> 'pendiente' THEN
    RAISE EXCEPTION 'La orden de pago no está pendiente';
  END IF;
  v_fecha := coalesce(p_fecha, contabilidad._hoy());
  v_tc := comercial._tc(v_p.moneda, v_fecha, p_tc);
  SELECT nombre INTO v_nombre FROM public.proveedores WHERE id = v_p.proveedor_id;

  FOR r IN SELECT a.id, a.importe, d.id AS doc_id, d.tc AS doc_tc, d.moneda, d.proveedor_id, d.estado, d.tipo, d.contado
           FROM comercial.aplicaciones_proveedor a
           JOIN comercial.documentos_proveedor d ON d.id = a.documento_id
           WHERE a.orden_pago_id = p_id ORDER BY d.id FOR UPDATE OF d LOOP
    IF r.proveedor_id <> v_p.proveedor_id OR r.moneda <> v_p.moneda OR r.estado <> 'vigente'
       OR r.tipo = 'nota_credito' OR r.contado THEN
      RAISE EXCEPTION 'Documento % no aplicable a este pago', r.doc_id;
    END IF;
    IF r.importe > comercial.saldo_documento(r.doc_id) THEN
      RAISE EXCEPTION 'El pago supera el saldo pendiente del documento %', r.doc_id;
    END IF;
    UPDATE comercial.aplicaciones_proveedor SET vigente = true, fecha = v_fecha WHERE id = r.id;
    -- La deuda se cancela al TC con que se registró el documento
    v_lineas := v_lineas || jsonb_build_object(
      'cuenta_id', comercial._cuenta_compras('proveedores', v_p.moneda), 'lado', 'debe',
      'importe', r.importe, 'tc', r.doc_tc, 'proveedor_id', v_p.proveedor_id);
    v_base_aplicado := v_base_aplicado + round(r.importe * r.doc_tc, 2);
    v_aplicado := v_aplicado + r.importe;
  END LOOP;

  v_anticipo := v_p.importe - v_aplicado;
  IF v_anticipo > 0 THEN
    v_lineas := v_lineas || jsonb_build_object(
      'cuenta_id', comercial._cuenta_compras('anticipos', v_p.moneda), 'lado', 'debe',
      'importe', v_anticipo, 'tc', v_tc, 'proveedor_id', v_p.proveedor_id,
      'descripcion', 'Anticipo / saldo a favor');
  END IF;
  v_lineas := v_lineas || jsonb_build_object('cuenta_id', v_p.cuenta_pago_id, 'lado', 'haber',
    'importe', v_p.importe, 'tc', v_tc);

  -- Pagar a otro TC que el de la factura: diferencia de cambio realizada
  v_dif := round(v_aplicado * v_tc, 2) - v_base_aplicado
           + (round(v_p.importe * v_tc, 2) - round(v_aplicado * v_tc, 2) - round(v_anticipo * v_tc, 2));
  IF v_dif <> 0 THEN
    v_lineas := v_lineas || jsonb_build_object(
      'cuenta_id', contabilidad.cuenta_sistema(CASE WHEN v_dif > 0 THEN 'diferencia_cambio_perdida_realizada'
                                                    ELSE 'diferencia_cambio_ganada_realizada' END),
      'lado', CASE WHEN v_dif > 0 THEN 'debe' ELSE 'haber' END, 'importe', abs(v_dif),
      'descripcion', 'Diferencia de cambio del pago');
  END IF;

  v_asiento := contabilidad._asiento_automatico(v_fecha, 'Pago ' || v_p.numero || ' — ' || v_nombre,
    'orden_pago', p_id::text, v_lineas);
  UPDATE comercial.ordenes_pago SET estado = 'pagada', fecha_pago = v_fecha, tc = v_tc,
         asiento_id = v_asiento, pagada_por = auth.uid()
  WHERE id = p_id;
  UPDATE comercial.aplicaciones_proveedor SET asiento_id = v_asiento WHERE orden_pago_id = p_id AND vigente;
  RETURN v_asiento;
END;
$$;

-- Aplicar después lo que quedó a favor de un pago (anticipo) a una factura.
CREATE FUNCTION comercial.aplicar_anticipo(p_pago bigint, p_documento bigint, p_importe numeric) RETURNS bigint
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_p comercial.ordenes_pago;
  v_d comercial.documentos_proveedor;
  v_id bigint;
  v_dif numeric;
  v_lineas jsonb;
  v_asiento uuid;
BEGIN
  PERFORM comercial._exigir_operador();
  SELECT * INTO v_p FROM comercial.ordenes_pago WHERE id = p_pago FOR UPDATE;
  SELECT * INTO v_d FROM comercial.documentos_proveedor WHERE id = p_documento FOR UPDATE;
  IF v_p.estado <> 'pagada' OR v_d.estado <> 'vigente' OR v_d.tipo = 'nota_credito' OR v_d.contado
     OR v_p.proveedor_id <> v_d.proveedor_id OR v_p.moneda <> v_d.moneda THEN
    RAISE EXCEPTION 'El anticipo y el documento tienen que ser del mismo proveedor y moneda';
  END IF;
  IF p_importe <= 0 OR p_importe > comercial.saldo_pago(p_pago) OR p_importe > comercial.saldo_documento(p_documento) THEN
    RAISE EXCEPTION 'El importe supera el saldo del anticipo o del documento';
  END IF;
  INSERT INTO comercial.aplicaciones_proveedor (documento_id, orden_pago_id, importe, fecha)
  VALUES (p_documento, p_pago, p_importe, contabilidad._hoy()) RETURNING id INTO v_id;

  v_lineas := jsonb_build_array(
    jsonb_build_object('cuenta_id', comercial._cuenta_compras('proveedores', v_d.moneda), 'lado', 'debe',
                       'importe', p_importe, 'tc', v_d.tc, 'proveedor_id', v_d.proveedor_id),
    jsonb_build_object('cuenta_id', comercial._cuenta_compras('anticipos', v_p.moneda), 'lado', 'haber',
                       'importe', p_importe, 'tc', v_p.tc, 'proveedor_id', v_p.proveedor_id));
  v_dif := round(p_importe * v_p.tc, 2) - round(p_importe * v_d.tc, 2);
  IF v_dif <> 0 THEN
    v_lineas := v_lineas || jsonb_build_object(
      'cuenta_id', contabilidad.cuenta_sistema(CASE WHEN v_dif > 0 THEN 'diferencia_cambio_perdida_realizada'
                                                    ELSE 'diferencia_cambio_ganada_realizada' END),
      'lado', CASE WHEN v_dif > 0 THEN 'debe' ELSE 'haber' END, 'importe', abs(v_dif));
  END IF;
  v_asiento := contabilidad._asiento_automatico(contabilidad._hoy(),
    'Aplicación de anticipo ' || v_p.numero, 'aplicacion_anticipo', v_id::text, v_lineas);
  UPDATE comercial.aplicaciones_proveedor SET asiento_id = v_asiento WHERE id = v_id;
  RETURN v_id;
END;
$$;

-- Anular un pago: revierte su asiento y libera lo que había aplicado.
CREATE FUNCTION comercial.anular_orden_pago(p_id bigint, p_motivo text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_p comercial.ordenes_pago;
  r record;
BEGIN
  PERFORM comercial._exigir_operador();
  SELECT * INTO v_p FROM comercial.ordenes_pago WHERE id = p_id FOR UPDATE;
  IF v_p.id IS NULL OR v_p.estado = 'anulada' THEN
    RAISE EXCEPTION 'La orden de pago no existe o ya está anulada';
  END IF;
  IF v_p.estado = 'pagada' THEN
    -- Primero las aplicaciones posteriores de su anticipo
    FOR r IN SELECT id, asiento_id FROM comercial.aplicaciones_proveedor
             WHERE orden_pago_id = p_id AND vigente AND asiento_id IS DISTINCT FROM v_p.asiento_id LOOP
      PERFORM contabilidad._revertir(r.asiento_id, coalesce(nullif(p_motivo, ''), 'Pago anulado'), contabilidad._hoy());
    END LOOP;
    PERFORM contabilidad._revertir(v_p.asiento_id, coalesce(nullif(p_motivo, ''), 'Pago anulado'), contabilidad._hoy());
  END IF;
  UPDATE comercial.aplicaciones_proveedor SET vigente = false WHERE orden_pago_id = p_id;
  UPDATE comercial.ordenes_pago SET estado = 'anulada' WHERE id = p_id;
END;
$$;

-- ------------------------------------------------------------
-- Estado de cuenta y control contra el mayor
-- ------------------------------------------------------------
-- Saldo por proveedor y moneda según documentos (positivo = le debemos)
-- y según el mayor (Proveedores − Anticipos, por auxiliar).
CREATE FUNCTION comercial.control_proveedores() RETURNS TABLE (
  proveedor_id integer, moneda char(3), saldo_documentos numeric, saldo_contable numeric, diferencia numeric
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NOT (comercial.puede_ver() OR current_setting('request.jwt.claims', true) IS NULL) THEN
    RAISE EXCEPTION 'No autorizado' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
  WITH docs AS (
    SELECT d.proveedor_id, d.moneda,
           sum(CASE WHEN d.tipo = 'nota_credito' THEN -1 ELSE 1 END * comercial.saldo_documento(d.id)) AS saldo
    FROM comercial.documentos_proveedor d WHERE d.estado = 'vigente' AND NOT d.contado
    GROUP BY 1, 2
  ), anticipos AS (
    SELECT p.proveedor_id, p.moneda, sum(comercial.saldo_pago(p.id)) AS saldo
    FROM comercial.ordenes_pago p WHERE p.estado = 'pagada' GROUP BY 1, 2
  ), doc AS (
    SELECT coalesce(d.proveedor_id, a.proveedor_id) AS proveedor_id, coalesce(d.moneda, a.moneda) AS moneda,
           coalesce(d.saldo, 0) - coalesce(a.saldo, 0) AS saldo
    FROM docs d FULL JOIN anticipos a ON a.proveedor_id = d.proveedor_id AND a.moneda = d.moneda
  ), mayor AS (
    SELECT l.proveedor_id, coalesce(c.moneda, contabilidad.moneda_funcional()) AS moneda,
           -sum(CASE WHEN c.moneda IS NULL THEN l.debe - l.haber
                     ELSE CASE WHEN l.debe > 0 THEN l.importe_origen ELSE -l.importe_origen END END) AS saldo
    FROM contabilidad.lineas l
    JOIN contabilidad.asientos a ON a.id = l.asiento_id
    JOIN contabilidad.cuentas c ON c.id = l.cuenta_id
    WHERE a.estado = 'confirmado' AND l.proveedor_id IS NOT NULL
      AND l.cuenta_id IN (SELECT pc.cuenta_id FROM contabilidad.parametros_cuentas pc
                          WHERE pc.proceso = 'compras' AND pc.rol IN ('proveedores', 'anticipos'))
      AND a.ejercicio_id = (SELECT e.id FROM contabilidad.ejercicios e
                            WHERE contabilidad._hoy() BETWEEN e.fecha_inicio AND e.fecha_fin)
    GROUP BY 1, 2
  )
  SELECT coalesce(doc.proveedor_id, mayor.proveedor_id), coalesce(doc.moneda, mayor.moneda),
         coalesce(doc.saldo, 0), coalesce(mayor.saldo, 0), coalesce(doc.saldo, 0) - coalesce(mayor.saldo, 0)
  FROM doc FULL JOIN mayor ON mayor.proveedor_id = doc.proveedor_id AND mayor.moneda = doc.moneda;
END;
$$;

-- ------------------------------------------------------------
-- RLS y permisos
-- ------------------------------------------------------------
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['proveedores_condiciones', 'ordenes_compra', 'orden_compra_items', 'recepciones',
                           'recepcion_items', 'documentos_proveedor', 'documento_proveedor_lineas',
                           'ordenes_pago', 'aplicaciones_proveedor'] LOOP
    EXECUTE format('ALTER TABLE comercial.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('CREATE POLICY %I ON comercial.%I FOR SELECT TO authenticated USING (comercial.puede_ver())',
                   t || '_lectura', t);
  END LOOP;
END;
$$;

-- Condiciones del proveedor: escritura directa para tienda/tesorero
CREATE FUNCTION comercial.puede_operar() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT contabilidad._tiene_rol(ARRAY['super_admin', 'tienda', 'tesorero']);
$$;
CREATE POLICY proveedores_condiciones_escritura ON comercial.proveedores_condiciones
  FOR ALL TO authenticated USING (comercial.puede_operar()) WITH CHECK (comercial.puede_operar());

REVOKE ALL ON ALL TABLES IN SCHEMA comercial FROM PUBLIC, anon, authenticated;
GRANT SELECT ON ALL TABLES IN SCHEMA comercial TO authenticated, service_role;
GRANT INSERT, UPDATE, DELETE ON comercial.proveedores_condiciones TO authenticated;
REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA comercial FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION
  comercial.puede_ver(),
  comercial.puede_operar(),
  comercial.ajustar_stock(integer, integer, integer, text, numeric),
  comercial.cargar_inventario_inicial(jsonb),
  comercial.cambiar_metodo_costeo(integer, text),
  comercial.control_mercaderia(),
  comercial.saldo_documento(bigint),
  comercial.saldo_pago(bigint),
  comercial.guardar_orden_compra(bigint, integer, date, char, jsonb, text),
  comercial.aprobar_orden_compra(bigint),
  comercial.cancelar_orden_compra(bigint),
  comercial.recibir_mercaderia(integer, bigint, date, char, jsonb, text, numeric, text),
  comercial.registrar_documento_proveedor(integer, text, text, text, date, char, jsonb, date, numeric, uuid, text),
  comercial.anular_documento_proveedor(bigint, text),
  comercial.aplicar_nota_credito(bigint, bigint, numeric),
  comercial.crear_orden_pago(integer, char, numeric, uuid, jsonb, text, text),
  comercial.pagar_orden(bigint, date, numeric),
  comercial.aplicar_anticipo(bigint, bigint, numeric),
  comercial.anular_orden_pago(bigint, text),
  comercial.control_proveedores()
TO authenticated, service_role;
