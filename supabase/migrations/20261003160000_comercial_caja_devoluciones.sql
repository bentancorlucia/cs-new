-- ============================================================
-- Comercial — caja del POS y devoluciones / cambios
--
-- Caja: el saldo contable de la cuenta de la caja ES el efectivo que
-- tiene que haber. Al abrir y al cerrar se cuenta; la diferencia va a
-- Faltantes (5.9.02) o Sobrantes (4.7.02) de caja. Las ventas en
-- efectivo del POS exigen una caja abierta. Depósitos al banco, retiros
-- y gastos menores se registran como movimientos con su asiento.
--
-- Devolución / cambio de una venta cobrada (poco frecuente): en una sola
-- operación vuelve la mercadería al costo con que salió, sale la nueva
-- (si es cambio) y se reintegra o cobra la diferencia por caja o banco:
--   D Devoluciones sobre ventas · Mercadería (costo devuelto)
--   H Ventas (lo nuevo) · Costo de ventas (devuelto) · Caja/Banco (neto)
-- ============================================================

INSERT INTO contabilidad.parametros_cuentas (proceso, rol, cuenta_id, descripcion)
SELECT 'caja', v.rol, c.id, v.descripcion FROM (VALUES
  ('faltantes', '5.9.02', 'Faltantes de caja en el arqueo'),
  ('sobrantes', '4.7.02', 'Sobrantes de caja en el arqueo')
) AS v(rol, codigo, descripcion)
JOIN contabilidad.cuentas c ON c.codigo = v.codigo;

-- ------------------------------------------------------------
-- Cajas y sesiones
-- ------------------------------------------------------------
CREATE TABLE comercial.cajas (
  id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  nombre text NOT NULL UNIQUE,
  cuenta_id uuid NOT NULL UNIQUE REFERENCES contabilidad.cuentas (id) ON DELETE RESTRICT,
  activa boolean NOT NULL DEFAULT true
);

INSERT INTO comercial.cajas (nombre, cuenta_id)
SELECT 'Caja POS tienda', contabilidad.cuenta_para('tienda', 'caja', NULL);

CREATE TABLE comercial.caja_sesiones (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  caja_id integer NOT NULL REFERENCES comercial.cajas (id) ON DELETE RESTRICT,
  estado text NOT NULL DEFAULT 'abierta' CHECK (estado IN ('abierta', 'cerrada')),
  abierta_por uuid,
  abierta_at timestamptz NOT NULL DEFAULT now(),
  saldo_inicial numeric(18, 2) NOT NULL,     -- saldo contable al abrir
  contado_inicial numeric(18, 2) NOT NULL CHECK (contado_inicial >= 0),
  cerrada_por uuid,
  cerrada_at timestamptz,
  saldo_final numeric(18, 2),                -- saldo contable al cerrar (lo esperado)
  contado_final numeric(18, 2) CHECK (contado_final >= 0),
  notas text,
  CHECK ((estado = 'cerrada') = (cerrada_at IS NOT NULL AND contado_final IS NOT NULL))
);

CREATE UNIQUE INDEX caja_sesion_abierta ON comercial.caja_sesiones (caja_id) WHERE estado = 'abierta';

CREATE TABLE comercial.caja_movimientos (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  sesion_id bigint NOT NULL REFERENCES comercial.caja_sesiones (id) ON DELETE RESTRICT,
  tipo text NOT NULL CHECK (tipo IN ('deposito_banco', 'retiro', 'ingreso', 'gasto', 'arqueo')),
  importe numeric(18, 2) NOT NULL CHECK (importe > 0),
  -- entrada (true) o salida de efectivo
  entra boolean NOT NULL,
  descripcion text NOT NULL,
  asiento_id uuid REFERENCES contabilidad.asientos (id),
  creado_por uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE FUNCTION comercial._saldo_caja(p_caja integer) RETURNS numeric
LANGUAGE sql STABLE SET search_path = '' AS $$
  SELECT coalesce(sum(l.debe - l.haber), 0)
  FROM contabilidad.lineas l
  JOIN contabilidad.asientos a ON a.id = l.asiento_id
  WHERE a.estado = 'confirmado'
    AND l.cuenta_id = (SELECT cuenta_id FROM comercial.cajas WHERE id = p_caja)
    AND a.ejercicio_id = (SELECT e.id FROM contabilidad.ejercicios e
                          WHERE contabilidad._hoy() BETWEEN e.fecha_inicio AND e.fecha_fin);
$$;

-- Diferencia de arqueo contra el saldo contable.
CREATE FUNCTION comercial._arqueo(p_sesion bigint, p_contado numeric, p_momento text) RETURNS numeric
LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE
  v_s comercial.caja_sesiones;
  v_caja comercial.cajas;
  v_dif numeric;
  v_asiento uuid;
BEGIN
  SELECT * INTO v_s FROM comercial.caja_sesiones WHERE id = p_sesion;
  SELECT * INTO v_caja FROM comercial.cajas WHERE id = v_s.caja_id;
  v_dif := p_contado - comercial._saldo_caja(v_s.caja_id);
  IF v_dif <> 0 THEN
    v_asiento := contabilidad._asiento_automatico(contabilidad._hoy(),
      CASE WHEN v_dif > 0 THEN 'Sobrante' ELSE 'Faltante' END || ' de caja al ' || p_momento || ' — ' || v_caja.nombre,
      'caja_arqueo', p_sesion || ':' || p_momento, jsonb_build_array(
        jsonb_build_object('cuenta_id', v_caja.cuenta_id, 'lado', CASE WHEN v_dif > 0 THEN 'debe' ELSE 'haber' END,
                           'importe', abs(v_dif)),
        jsonb_build_object('cuenta_id', contabilidad.cuenta_para('caja', CASE WHEN v_dif > 0 THEN 'sobrantes' ELSE 'faltantes' END, NULL),
                           'lado', CASE WHEN v_dif > 0 THEN 'haber' ELSE 'debe' END, 'importe', abs(v_dif))));
    INSERT INTO comercial.caja_movimientos (sesion_id, tipo, importe, entra, descripcion, asiento_id)
    VALUES (p_sesion, 'arqueo', abs(v_dif), v_dif > 0,
            CASE WHEN v_dif > 0 THEN 'Sobrante' ELSE 'Faltante' END || ' al ' || p_momento, v_asiento);
  END IF;
  RETURN v_dif;
END;
$$;

CREATE FUNCTION comercial.abrir_caja(p_caja integer, p_contado numeric, p_notas text DEFAULT NULL) RETURNS bigint
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_id bigint;
BEGIN
  PERFORM comercial._exigir_operador();
  IF NOT EXISTS (SELECT 1 FROM comercial.cajas WHERE id = p_caja AND activa) THEN
    RAISE EXCEPTION 'Caja inexistente o inactiva';
  END IF;
  IF EXISTS (SELECT 1 FROM comercial.caja_sesiones WHERE caja_id = p_caja AND estado = 'abierta') THEN
    RAISE EXCEPTION 'La caja ya está abierta';
  END IF;
  INSERT INTO comercial.caja_sesiones (caja_id, abierta_por, saldo_inicial, contado_inicial, notas)
  VALUES (p_caja, auth.uid(), comercial._saldo_caja(p_caja), p_contado, p_notas)
  RETURNING id INTO v_id;
  PERFORM comercial._arqueo(v_id, p_contado, 'abrir');
  RETURN v_id;
END;
$$;

-- p_tipo: deposito_banco (sale a una cuenta bancaria), retiro / gasto
-- (sale contra la cuenta indicada), ingreso (entra contra la cuenta
-- indicada, p. ej. cambio traído del banco).
CREATE FUNCTION comercial.movimiento_caja(
  p_sesion bigint, p_tipo text, p_importe numeric, p_cuenta_contrapartida uuid, p_descripcion text,
  p_centro_costo uuid DEFAULT NULL
) RETURNS bigint
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_s comercial.caja_sesiones;
  v_caja comercial.cajas;
  v_entra boolean := p_tipo = 'ingreso';
  v_asiento uuid;
  v_id bigint;
BEGIN
  PERFORM comercial._exigir_operador();
  SELECT * INTO v_s FROM comercial.caja_sesiones WHERE id = p_sesion FOR UPDATE;
  IF v_s.estado IS DISTINCT FROM 'abierta' THEN
    RAISE EXCEPTION 'La caja no está abierta';
  END IF;
  IF p_tipo NOT IN ('deposito_banco', 'retiro', 'ingreso', 'gasto') OR p_importe IS NULL OR p_importe <= 0
     OR p_descripcion IS NULL OR length(btrim(p_descripcion)) < 3 THEN
    RAISE EXCEPTION 'Movimiento de caja inválido';
  END IF;
  IF NOT v_entra AND p_importe > comercial._saldo_caja(v_s.caja_id) THEN
    RAISE EXCEPTION 'No hay ese efectivo en la caja';
  END IF;
  IF p_tipo = 'deposito_banco' AND NOT EXISTS (
    SELECT 1 FROM contabilidad.cuentas WHERE id = p_cuenta_contrapartida AND es_disponibilidad AND moneda IS NULL
  ) THEN
    RAISE EXCEPTION 'El depósito va a una cuenta bancaria en pesos';
  END IF;
  SELECT * INTO v_caja FROM comercial.cajas WHERE id = v_s.caja_id;
  INSERT INTO comercial.caja_movimientos (sesion_id, tipo, importe, entra, descripcion)
  VALUES (p_sesion, p_tipo, p_importe, v_entra, btrim(p_descripcion)) RETURNING id INTO v_id;
  v_asiento := contabilidad._asiento_automatico(contabilidad._hoy(),
    initcap(replace(p_tipo, '_', ' ')) || ' — ' || btrim(p_descripcion),
    'caja_movimiento', v_id::text, jsonb_build_array(
      jsonb_build_object('cuenta_id', v_caja.cuenta_id, 'lado', CASE WHEN v_entra THEN 'debe' ELSE 'haber' END,
                         'importe', p_importe),
      jsonb_build_object('cuenta_id', p_cuenta_contrapartida, 'lado', CASE WHEN v_entra THEN 'haber' ELSE 'debe' END,
                         'importe', p_importe, 'centro_costo_id', p_centro_costo)));
  UPDATE comercial.caja_movimientos SET asiento_id = v_asiento WHERE id = v_id;
  RETURN v_id;
END;
$$;

CREATE FUNCTION comercial.cerrar_caja(p_sesion bigint, p_contado numeric, p_notas text DEFAULT NULL) RETURNS numeric
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_s comercial.caja_sesiones;
  v_dif numeric;
BEGIN
  PERFORM comercial._exigir_operador();
  SELECT * INTO v_s FROM comercial.caja_sesiones WHERE id = p_sesion FOR UPDATE;
  IF v_s.estado IS DISTINCT FROM 'abierta' THEN
    RAISE EXCEPTION 'La caja no está abierta';
  END IF;
  IF p_contado IS NULL OR p_contado < 0 THEN
    RAISE EXCEPTION 'Indicá el efectivo contado';
  END IF;
  UPDATE comercial.caja_sesiones SET saldo_final = comercial._saldo_caja(v_s.caja_id) WHERE id = p_sesion;
  v_dif := comercial._arqueo(p_sesion, p_contado, 'cerrar');
  UPDATE comercial.caja_sesiones
     SET estado = 'cerrada', cerrada_por = auth.uid(), cerrada_at = now(), contado_final = p_contado,
         notas = coalesce(p_notas, notas)
   WHERE id = p_sesion;
  RETURN v_dif;
END;
$$;

-- Resumen de una sesión: lo que entró y salió de la caja en ese lapso.
CREATE FUNCTION comercial.resumen_caja(p_sesion bigint) RETURNS TABLE (
  concepto text, entradas numeric, salidas numeric, cantidad bigint
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_s comercial.caja_sesiones;
  v_cuenta uuid;
BEGIN
  IF NOT (comercial.puede_ver() OR current_setting('request.jwt.claims', true) IS NULL) THEN
    RAISE EXCEPTION 'No autorizado' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v_s FROM comercial.caja_sesiones WHERE id = p_sesion;
  SELECT cuenta_id INTO v_cuenta FROM comercial.cajas WHERE id = v_s.caja_id;
  RETURN QUERY
  SELECT CASE a.origen_tipo
           WHEN 'pedido_venta' THEN 'Ventas en efectivo'
           WHEN 'pedido_efectivo' THEN 'Efectivo de pagos mixtos'
           WHEN 'devolucion_venta' THEN 'Devoluciones y cambios'
           WHEN 'caja_movimiento' THEN 'Movimientos de caja'
           WHEN 'caja_arqueo' THEN 'Diferencias de arqueo'
           WHEN NULL THEN 'Asientos manuales'
           ELSE coalesce(a.origen_tipo, 'Asientos manuales') END,
         sum(l.debe), sum(l.haber), count(DISTINCT a.id)
  FROM contabilidad.lineas l
  JOIN contabilidad.asientos a ON a.id = l.asiento_id
  WHERE l.cuenta_id = v_cuenta AND a.estado = 'confirmado'
    AND a.created_at >= v_s.abierta_at AND a.created_at <= coalesce(v_s.cerrada_at, now())
  GROUP BY 1 ORDER BY 1;
END;
$$;

-- Las ventas en efectivo del POS exigen una caja abierta.
CREATE FUNCTION comercial._exigir_caja_abierta() RETURNS void
LANGUAGE plpgsql STABLE SET search_path = '' AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM comercial.caja_sesiones s JOIN comercial.cajas c ON c.id = s.caja_id
    WHERE s.estado = 'abierta' AND c.cuenta_id = comercial._cuenta('caja')
  ) THEN
    RAISE EXCEPTION 'Abrí la caja antes de cobrar en efectivo';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION comercial._contabilizar_efectivo_mixto(p_pedido integer) RETURNS uuid
LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE
  v_p public.pedidos;
BEGIN
  SELECT * INTO v_p FROM public.pedidos WHERE id = p_pedido;
  IF v_p.metodo_pago <> 'mixto' OR coalesce(v_p.monto_efectivo, 0) <= 0 THEN
    RETURN NULL;
  END IF;
  PERFORM comercial._exigir_caja_abierta();
  RETURN contabilidad._asiento_automatico(contabilidad._hoy(),
    'Efectivo a cuenta — ' || public.motivo_venta_pedido(v_p.tipo, v_p.numero_pedido, v_p.id),
    'pedido_efectivo', p_pedido::text, jsonb_build_array(
      jsonb_build_object('cuenta_id', comercial._cuenta('caja'), 'lado', 'debe', 'importe', v_p.monto_efectivo),
      jsonb_build_object('cuenta_id', comercial._cuenta('senas'), 'lado', 'haber', 'importe', v_p.monto_efectivo)));
END;
$$;

-- La venta en efectivo también exige caja abierta.
CREATE OR REPLACE FUNCTION comercial._contabilizar_venta(p_pedido integer, p_medio text, p_costo numeric) RETURNS uuid
LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE
  v_p public.pedidos;
  v_donacion numeric;
  v_base numeric;
  v_enc numeric;
  v_neto numeric;
  v_ventas numeric;
  v_encargues numeric;
  v_efectivo_previo numeric := 0;
  v_cuenta_ingreso uuid;
  v_centro uuid;
  v_lineas jsonb := '[]'::jsonb;
  v_id uuid;
BEGIN
  IF p_medio = 'caja' THEN
    PERFORM comercial._exigir_caja_abierta();
  END IF;
  SELECT * INTO v_p FROM public.pedidos WHERE id = p_pedido;
  SELECT coalesce(sum(monto), 0) INTO v_donacion FROM public.donaciones
  WHERE pedido_id = p_pedido AND estado <> 'cancelada';
  SELECT coalesce(sum(subtotal) FILTER (WHERE NOT es_encargue), 0),
         coalesce(sum(subtotal) FILTER (WHERE es_encargue), 0)
    INTO v_base, v_enc
  FROM public.pedido_items WHERE pedido_id = p_pedido;

  v_neto := v_p.total - v_donacion;
  IF v_neto < 0 THEN
    RAISE EXCEPTION 'El pedido % tiene una donación mayor que su total', p_pedido;
  END IF;
  -- El descuento del pedido se reparte en proporción entre stock y encargues.
  v_ventas := CASE WHEN v_base + v_enc = 0 THEN v_neto ELSE round(v_neto * v_base / (v_base + v_enc), 2) END;
  v_encargues := v_neto - v_ventas;

  v_cuenta_ingreso := comercial._cuenta(CASE
    WHEN v_p.tipo = 'disciplina' THEN 'ventas_disciplinas'
    WHEN v_p.aplico_precio_socio THEN 'ventas_socios'
    ELSE 'ventas_no_socios' END);
  v_centro := comercial._centro_venta(v_p);

  IF v_p.metodo_pago = 'mixto' THEN
    SELECT coalesce(sum(l.haber), 0) INTO v_efectivo_previo
    FROM contabilidad.asientos a JOIN contabilidad.lineas l ON l.asiento_id = a.id
    WHERE a.origen_tipo = 'pedido_efectivo' AND a.origen_id = p_pedido::text
      AND a.revertido_por_id IS NULL AND l.cuenta_id = comercial._cuenta('senas');
  END IF;

  -- Debe: lo cobrado
  IF p_medio = 'disciplina' THEN
    IF v_p.disciplina_id IS NULL THEN
      RAISE EXCEPTION 'El pedido de disciplina % no indica la disciplina', p_pedido;
    END IF;
    v_lineas := v_lineas || jsonb_build_object('cuenta_id', comercial._cuenta('disciplinas'), 'lado', 'debe',
      'importe', v_p.total, 'disciplina_id', v_p.disciplina_id);
  ELSE
    IF v_p.total - v_efectivo_previo > 0 THEN
      v_lineas := v_lineas || jsonb_build_object(
        'cuenta_id', comercial._cuenta(CASE WHEN p_medio = 'caja' THEN 'caja' ELSE 'banco_cobros' END),
        'lado', 'debe', 'importe', v_p.total - v_efectivo_previo);
    END IF;
    IF v_efectivo_previo > 0 THEN
      v_lineas := v_lineas || jsonb_build_object('cuenta_id', comercial._cuenta('senas'), 'lado', 'debe',
        'importe', v_efectivo_previo, 'descripcion', 'Efectivo cobrado al vender');
    END IF;
  END IF;

  -- Haber: venta, encargues (seña hasta retirarlos) y donación
  IF v_ventas > 0 THEN
    v_lineas := v_lineas || jsonb_build_object('cuenta_id', v_cuenta_ingreso, 'lado', 'haber',
      'importe', v_ventas, 'centro_costo_id', v_centro);
  END IF;
  IF v_encargues > 0 THEN
    v_lineas := v_lineas || jsonb_build_object('cuenta_id', comercial._cuenta('senas'), 'lado', 'haber',
      'importe', v_encargues, 'descripcion', 'Encargue: se reconoce como venta al retirarlo');
  END IF;
  IF v_donacion > 0 THEN
    v_lineas := v_lineas || jsonb_build_object('cuenta_id', comercial._cuenta('donaciones'), 'lado', 'haber',
      'importe', v_donacion);
  END IF;

  -- Costo de lo vendido
  IF p_costo > 0 THEN
    v_lineas := v_lineas
      || jsonb_build_object('cuenta_id', comercial._cuenta('costo_ventas'), 'lado', 'debe',
           'importe', p_costo, 'centro_costo_id', v_centro)
      || jsonb_build_object('cuenta_id', comercial._cuenta('mercaderia'), 'lado', 'haber', 'importe', p_costo);
  END IF;

  IF jsonb_array_length(v_lineas) = 0 THEN
    RETURN NULL;  -- pedido sin importe ni costo: no hay nada que asentar
  END IF;

  v_id := contabilidad._asiento_automatico(contabilidad._hoy(),
    public.motivo_venta_pedido(v_p.tipo, v_p.numero_pedido, v_p.id),
    'pedido_venta', p_pedido::text, v_lineas);
  PERFORM comercial._vincular_asiento('pedido', p_pedido::text, v_id);

  INSERT INTO comercial.ventas (pedido_id, fecha, cuenta_ingreso_id, monto_ventas, monto_encargues,
                                monto_donacion, costo, asiento_id)
  VALUES (p_pedido, contabilidad._hoy(), v_cuenta_ingreso, v_ventas, v_encargues, v_donacion, p_costo, v_id)
  ON CONFLICT (pedido_id) DO UPDATE SET
    fecha = EXCLUDED.fecha, cuenta_ingreso_id = EXCLUDED.cuenta_ingreso_id,
    monto_ventas = EXCLUDED.monto_ventas, monto_encargues = EXCLUDED.monto_encargues,
    monto_donacion = EXCLUDED.monto_donacion, costo = EXCLUDED.costo,
    asiento_id = EXCLUDED.asiento_id, asiento_entrega_id = NULL, anulada = false;
  RETURN v_id;
END;
$$;

-- ------------------------------------------------------------
-- Devoluciones y cambios
-- ------------------------------------------------------------
CREATE TABLE comercial.devoluciones (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  pedido_id integer NOT NULL REFERENCES public.pedidos (id) ON DELETE RESTRICT,
  fecha date NOT NULL,
  medio text NOT NULL CHECK (medio IN ('caja', 'banco')),
  importe_devuelto numeric(18, 2) NOT NULL CHECK (importe_devuelto >= 0),
  importe_nuevo numeric(18, 2) NOT NULL CHECK (importe_nuevo >= 0),
  -- positivo: el cliente paga la diferencia; negativo: se le reintegra
  neto numeric(18, 2) NOT NULL,
  motivo text NOT NULL,
  asiento_id uuid REFERENCES contabilidad.asientos (id),
  creado_por uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE comercial.devolucion_items (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  devolucion_id bigint NOT NULL REFERENCES comercial.devoluciones (id) ON DELETE RESTRICT,
  -- devuelto: referencia al ítem vendido; nuevo (cambio): producto entregado
  pedido_item_id integer REFERENCES public.pedido_items (id) ON DELETE RESTRICT,
  item_id bigint NOT NULL REFERENCES comercial.items (id) ON DELETE RESTRICT,
  cantidad integer NOT NULL CHECK (cantidad > 0),
  importe numeric(18, 2) NOT NULL CHECK (importe >= 0),
  costo numeric(18, 2) NOT NULL CHECK (costo >= 0),
  es_nuevo boolean NOT NULL
);

-- p_devueltos: [{ pedido_item_id, cantidad }]
-- p_nuevos (cambio): [{ producto_id, variante_id?, cantidad, precio_unitario }]
CREATE FUNCTION comercial.registrar_devolucion(
  p_pedido integer, p_devueltos jsonb, p_medio text, p_motivo text, p_nuevos jsonb DEFAULT '[]'
) RETURNS bigint
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_p public.pedidos;
  v_v comercial.ventas;
  v_id bigint;
  v_ref text;
  v_factor numeric;
  v_base numeric;
  d jsonb;
  v_pi public.pedido_items;
  v_ya integer;
  v_item comercial.items;
  v_costo_unit numeric;
  v_importe numeric;
  v_valor numeric;
  v_devuelto numeric := 0;
  v_costo_devuelto numeric := 0;
  v_nuevo numeric := 0;
  v_costo_nuevo numeric := 0;
  v_neto numeric;
  v_lineas jsonb := '[]'::jsonb;
  v_centro uuid;
  v_asiento uuid;
BEGIN
  PERFORM comercial._exigir_operador();
  IF p_medio NOT IN ('caja', 'banco') OR p_motivo IS NULL OR length(btrim(p_motivo)) < 3 THEN
    RAISE EXCEPTION 'Indicá el medio (caja o banco) y el motivo';
  END IF;
  SELECT * INTO v_p FROM public.pedidos WHERE id = p_pedido FOR UPDATE;
  SELECT * INTO v_v FROM comercial.ventas WHERE pedido_id = p_pedido;
  IF v_v.pedido_id IS NULL OR v_v.anulada THEN
    RAISE EXCEPTION 'El pedido no tiene una venta vigente';
  END IF;
  IF p_medio = 'caja' THEN
    PERFORM comercial._exigir_caja_abierta();
  END IF;

  -- Precio efectivo de lo vendido: subtotales de stock ajustados por el
  -- descuento del pedido (lo mismo que se asentó como venta).
  SELECT coalesce(sum(subtotal), 0) INTO v_base FROM public.pedido_items WHERE pedido_id = p_pedido AND NOT es_encargue;
  v_factor := CASE WHEN v_base > 0 THEN v_v.monto_ventas / v_base ELSE 0 END;

  INSERT INTO comercial.devoluciones (pedido_id, fecha, medio, importe_devuelto, importe_nuevo, neto, motivo)
  VALUES (p_pedido, contabilidad._hoy(), p_medio, 0, 0, 0, btrim(p_motivo)) RETURNING id INTO v_id;
  v_ref := v_id::text;

  FOR d IN SELECT * FROM jsonb_array_elements(coalesce(p_devueltos, '[]')) LOOP
    SELECT * INTO v_pi FROM public.pedido_items WHERE id = (d ->> 'pedido_item_id')::int AND pedido_id = p_pedido;
    IF v_pi.id IS NULL OR v_pi.es_encargue THEN
      RAISE EXCEPTION 'Ítem inexistente o encargue (los encargues no se devuelven por acá)';
    END IF;
    SELECT coalesce(sum(cantidad), 0) INTO v_ya FROM comercial.devolucion_items
    WHERE pedido_item_id = v_pi.id AND NOT es_nuevo;
    IF (d ->> 'cantidad')::int <= 0 OR v_ya + (d ->> 'cantidad')::int > v_pi.cantidad THEN
      RAISE EXCEPTION 'Se devuelven más unidades que las vendidas (quedan %)', v_pi.cantidad - v_ya;
    END IF;
    v_item := comercial._item(v_pi.producto_id, v_pi.variante_id);
    -- Vuelve al costo con que salió
    SELECT -sum(valor) / -sum(cantidad) INTO v_costo_unit FROM comercial.movimientos
    WHERE origen_tipo = 'pedido' AND origen_id = p_pedido::text AND item_id = v_item.id AND tipo = 'venta';
    v_valor := comercial._entrada(v_item.id, (d ->> 'cantidad')::int, coalesce(v_costo_unit, 0),
                                  contabilidad._hoy(), 'devolucion_venta', 'devolucion_venta', v_ref, btrim(p_motivo));
    v_importe := round(v_pi.subtotal / v_pi.cantidad * (d ->> 'cantidad')::int * v_factor, 2);
    INSERT INTO comercial.devolucion_items (devolucion_id, pedido_item_id, item_id, cantidad, importe, costo, es_nuevo)
    VALUES (v_id, v_pi.id, v_item.id, (d ->> 'cantidad')::int, v_importe, v_valor, false);
    v_devuelto := v_devuelto + v_importe;
    v_costo_devuelto := v_costo_devuelto + v_valor;
  END LOOP;

  FOR d IN SELECT * FROM jsonb_array_elements(coalesce(p_nuevos, '[]')) LOOP
    v_item := comercial._item((d ->> 'producto_id')::int, nullif(d ->> 'variante_id', '')::int);
    v_valor := comercial._salida(v_item.id, (d ->> 'cantidad')::int, contabilidad._hoy(), 'venta',
                                 'devolucion_venta', v_ref, 'Cambio: ' || btrim(p_motivo));
    v_importe := round((d ->> 'precio_unitario')::numeric * (d ->> 'cantidad')::int, 2);
    INSERT INTO comercial.devolucion_items (devolucion_id, item_id, cantidad, importe, costo, es_nuevo)
    VALUES (v_id, v_item.id, (d ->> 'cantidad')::int, v_importe, v_valor, true);
    v_nuevo := v_nuevo + v_importe;
    v_costo_nuevo := v_costo_nuevo + v_valor;
  END LOOP;

  IF v_devuelto = 0 AND v_nuevo = 0 THEN
    RAISE EXCEPTION 'No hay nada para devolver ni cambiar';
  END IF;
  v_neto := v_nuevo - v_devuelto;
  v_centro := comercial._centro_venta(v_p);

  IF v_devuelto > 0 THEN
    v_lineas := v_lineas || jsonb_build_object('cuenta_id', comercial._cuenta('devoluciones'), 'lado', 'debe',
      'importe', v_devuelto, 'centro_costo_id', v_centro);
  END IF;
  IF v_nuevo > 0 THEN
    v_lineas := v_lineas || jsonb_build_object('cuenta_id', v_v.cuenta_ingreso_id, 'lado', 'haber',
      'importe', v_nuevo, 'centro_costo_id', v_centro);
  END IF;
  IF v_neto <> 0 THEN
    v_lineas := v_lineas || jsonb_build_object(
      'cuenta_id', comercial._cuenta(CASE WHEN p_medio = 'caja' THEN 'caja' ELSE 'banco_cobros' END),
      'lado', CASE WHEN v_neto > 0 THEN 'debe' ELSE 'haber' END, 'importe', abs(v_neto));
  END IF;
  -- Costo: lo devuelto vuelve a Mercadería, lo nuevo sale
  IF v_costo_devuelto - v_costo_nuevo <> 0 THEN
    v_lineas := v_lineas
      || jsonb_build_object('cuenta_id', comercial._cuenta('mercaderia'),
           'lado', CASE WHEN v_costo_devuelto > v_costo_nuevo THEN 'debe' ELSE 'haber' END,
           'importe', abs(v_costo_devuelto - v_costo_nuevo))
      || jsonb_build_object('cuenta_id', comercial._cuenta('costo_ventas'),
           'lado', CASE WHEN v_costo_devuelto > v_costo_nuevo THEN 'haber' ELSE 'debe' END,
           'importe', abs(v_costo_devuelto - v_costo_nuevo), 'centro_costo_id', v_centro);
  END IF;

  IF jsonb_array_length(v_lineas) > 0 THEN
    v_asiento := contabilidad._asiento_automatico(contabilidad._hoy(),
      CASE WHEN v_nuevo > 0 THEN 'Cambio' ELSE 'Devolución' END || ' — '
        || public.motivo_venta_pedido(v_p.tipo, v_p.numero_pedido, v_p.id),
      'devolucion_venta', v_ref, v_lineas);
    PERFORM comercial._vincular_asiento('devolucion_venta', v_ref, v_asiento);
  END IF;

  UPDATE comercial.devoluciones
     SET importe_devuelto = v_devuelto, importe_nuevo = v_nuevo, neto = v_neto, asiento_id = v_asiento
   WHERE id = v_id;
  RETURN v_id;
END;
$$;

-- ------------------------------------------------------------
-- RLS y permisos
-- ------------------------------------------------------------
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['cajas', 'caja_sesiones', 'caja_movimientos', 'devoluciones', 'devolucion_items'] LOOP
    EXECUTE format('ALTER TABLE comercial.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('CREATE POLICY %I ON comercial.%I FOR SELECT TO authenticated USING (comercial.puede_ver())',
                   t || '_lectura', t);
  END LOOP;
END;
$$;

REVOKE ALL ON comercial.cajas, comercial.caja_sesiones, comercial.caja_movimientos,
              comercial.devoluciones, comercial.devolucion_items FROM PUBLIC, anon, authenticated;
GRANT SELECT ON comercial.cajas, comercial.caja_sesiones, comercial.caja_movimientos,
                comercial.devoluciones, comercial.devolucion_items TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION comercial._saldo_caja(integer), comercial._arqueo(bigint, numeric, text),
  comercial._exigir_caja_abierta(), comercial._contabilizar_efectivo_mixto(integer) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION comercial.abrir_caja(integer, numeric, text),
  comercial.movimiento_caja(bigint, text, numeric, uuid, text, uuid),
  comercial.cerrar_caja(bigint, numeric, text), comercial.resumen_caja(bigint),
  comercial.registrar_devolucion(integer, jsonb, text, text, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION comercial.abrir_caja(integer, numeric, text),
  comercial.movimiento_caja(bigint, text, numeric, uuid, text, uuid),
  comercial.cerrar_caja(bigint, numeric, text), comercial.resumen_caja(bigint),
  comercial.registrar_devolucion(integer, jsonb, text, text, jsonb) TO authenticated, service_role;
