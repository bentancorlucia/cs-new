-- ============================================================
-- Contabilidad — correcciones de la auditoría contra ContaSystem
--
--  S1  el cierre no se traba si una cuenta pasó a exigir centro/auxiliar
--  S2  la apertura conserva el signo de la moneda de origen
--  S3  no se reabre un ejercicio si el siguiente tiene meses cerrados
--  S4  un documento cuyo asiento se revirtió se puede volver a contabilizar
--  S5  la revaluación no usa cotizaciones de más de 4 días
--  S6/C3  diferencia de cambio realizada vs no realizada (revaluación)
--  S7  cuentas de sistema validadas por clase
--  S9  tesorería y comisión fiscal leen proveedores y disciplinas
--  C1  los anticipos en USD (no monetarios) no se revalúan
--  C4  el primer ejercicio no se cierra sin apertura (o sin declarar
--      que arrancó sin saldos)
--  C5  la apertura cargada a mano se puede revertir
--  C6/C21  la reapertura no reutiliza números y elimina el ejercicio
--      siguiente vacío
--  C14 contabilidad.cuenta_para(proceso, rol, moneda)
-- ============================================================

-- ------------------------------------------------------------
-- Diferencia de cambio: realizada y no realizada (C3)
-- ------------------------------------------------------------
ALTER TABLE contabilidad.cuentas_sistema DROP CONSTRAINT cuentas_sistema_rol_check;
ALTER TABLE contabilidad.cuentas_sistema ADD CONSTRAINT cuentas_sistema_rol_check CHECK (rol IN (
  'resultado_ejercicio', 'resultados_acumulados',
  'diferencia_cambio_ganada', 'diferencia_cambio_perdida',
  'diferencia_cambio_ganada_realizada', 'diferencia_cambio_perdida_realizada'
));

DO $$
DECLARE
  v_padre record;
BEGIN
  FOR v_padre IN SELECT id, codigo, clase, naturaleza FROM contabilidad.cuentas
                 WHERE codigo IN ('4.6.02', '5.7.02') LOOP
    IF EXISTS (SELECT 1 FROM contabilidad.lineas WHERE cuenta_id = v_padre.id) THEN
      RAISE EXCEPTION 'La cuenta % ya tiene movimientos: separar realizada/no realizada a mano', v_padre.codigo;
    END IF;
    UPDATE contabilidad.cuentas SET imputable = false WHERE id = v_padre.id;
    INSERT INTO contabilidad.cuentas (codigo, nombre, padre_id, nivel, clase, naturaleza)
    VALUES
      (v_padre.codigo || '.01',
       CASE WHEN v_padre.clase = 'ingreso' THEN 'Diferencia de cambio ganada realizada'
            ELSE 'Diferencia de cambio perdida realizada' END,
       v_padre.id, 0, v_padre.clase, v_padre.naturaleza),
      (v_padre.codigo || '.02',
       CASE WHEN v_padre.clase = 'ingreso' THEN 'Diferencia de cambio ganada por revaluación'
            ELSE 'Diferencia de cambio perdida por revaluación' END,
       v_padre.id, 0, v_padre.clase, v_padre.naturaleza);
  END LOOP;
END;
$$;

UPDATE contabilidad.cuentas_sistema s SET cuenta_id = c.id
FROM contabilidad.cuentas c
WHERE (s.rol, c.codigo) IN (('diferencia_cambio_ganada', '4.6.02.02'), ('diferencia_cambio_perdida', '5.7.02.02'));

INSERT INTO contabilidad.cuentas_sistema (rol, cuenta_id)
SELECT v.rol, c.id FROM (VALUES
  ('diferencia_cambio_ganada_realizada', '4.6.02.01'),
  ('diferencia_cambio_perdida_realizada', '5.7.02.01')
) AS v(rol, codigo)
JOIN contabilidad.cuentas c ON c.codigo = v.codigo;

-- ------------------------------------------------------------
-- Cuentas de sistema: clase coherente con el rol (S7)
-- ------------------------------------------------------------
CREATE FUNCTION contabilidad._cuenta_sistema_valida() RETURNS trigger
LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE
  v_c contabilidad.cuentas%ROWTYPE;
  v_clase contabilidad.clase_cuenta;
BEGIN
  SELECT * INTO v_c FROM contabilidad.cuentas WHERE id = NEW.cuenta_id;
  v_clase := CASE
    WHEN NEW.rol IN ('resultado_ejercicio', 'resultados_acumulados') THEN 'patrimonio'
    WHEN NEW.rol LIKE 'diferencia_cambio_ganada%' THEN 'ingreso'
    ELSE 'egreso'
  END;
  IF NOT v_c.imputable OR v_c.clase <> v_clase OR v_c.moneda IS NOT NULL THEN
    RAISE EXCEPTION 'La cuenta de sistema "%" tiene que ser una cuenta imputable de % en pesos', NEW.rol, v_clase;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER cuentas_sistema_valida BEFORE INSERT OR UPDATE ON contabilidad.cuentas_sistema
  FOR EACH ROW EXECUTE FUNCTION contabilidad._cuenta_sistema_valida();

-- ------------------------------------------------------------
-- Anticipos en USD: partida no monetaria (C1)
-- ------------------------------------------------------------
UPDATE contabilidad.cuentas SET revalua = false WHERE codigo = '1.1.04.05';

-- ------------------------------------------------------------
-- Re-contabilizar un documento revertido (S4)
-- ------------------------------------------------------------
DROP INDEX contabilidad.asientos_origen_unico;
CREATE UNIQUE INDEX asientos_origen_unico ON contabilidad.asientos (origen_tipo, origen_id)
  WHERE origen_tipo IS NOT NULL AND tipo <> 'reversion' AND revertido_por_id IS NULL;

-- ------------------------------------------------------------
-- Ejercicio sin saldos iniciales (C4)
-- ------------------------------------------------------------
ALTER TABLE contabilidad.ejercicios ADD COLUMN sin_saldos_iniciales boolean NOT NULL DEFAULT false;

CREATE FUNCTION contabilidad.declarar_sin_saldos_iniciales(p_ejercicio uuid, p_valor boolean) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  PERFORM contabilidad._exigir_escritura();
  IF EXISTS (SELECT 1 FROM contabilidad.ejercicios e
             WHERE e.fecha_fin < (SELECT fecha_inicio FROM contabilidad.ejercicios WHERE id = p_ejercicio)) THEN
    RAISE EXCEPTION 'Solo el primer ejercicio puede arrancar sin saldos iniciales';
  END IF;
  UPDATE contabilidad.ejercicios SET sin_saldos_iniciales = p_valor
   WHERE id = p_ejercicio AND estado = 'abierto';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'El ejercicio no existe o está cerrado';
  END IF;
END;
$$;

-- ------------------------------------------------------------
-- Cuenta de un proceso automático (C14): la de la moneda o la genérica
-- ------------------------------------------------------------
ALTER TABLE contabilidad.parametros_cuentas
  ADD CONSTRAINT parametros_cuentas_nombres CHECK (proceso ~ '^[a-z_.]+$' AND rol ~ '^[a-z_]+$');

CREATE FUNCTION contabilidad.cuenta_para(p_proceso text, p_rol text, p_moneda char(3) DEFAULT NULL) RETURNS uuid
LANGUAGE plpgsql STABLE SET search_path = '' AS $$
DECLARE
  v_id uuid;
BEGIN
  SELECT cuenta_id INTO v_id FROM contabilidad.parametros_cuentas
  WHERE proceso = p_proceso AND rol = p_rol
    AND (moneda = p_moneda OR moneda IS NULL)
  ORDER BY moneda IS NULL
  LIMIT 1;
  IF v_id IS NULL THEN
    RAISE EXCEPTION 'Falta configurar la cuenta "%" del proceso "%"%', p_rol, p_proceso,
      CASE WHEN p_moneda IS NOT NULL THEN ' en ' || p_moneda ELSE '' END;
  END IF;
  RETURN v_id;
END;
$$;

-- ------------------------------------------------------------
-- Revaluación: cotización reciente y realizada / no realizada (S5, S6)
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION contabilidad._revaluar(p_fecha date, p_origen_tipo text, p_origen_id text) RETURNS uuid
LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE
  v_ej contabilidad.ejercicios%ROWTYPE;
  v_lineas jsonb := '[]'::jsonb;
  -- [ganada no realizada, perdida no realizada, ganada realizada, perdida realizada]
  v_dif numeric[] := ARRAY[0, 0, 0, 0];
  r record;
  v_tc numeric;
  v_tc_fecha date;
  v_ajuste numeric;
  v_id uuid;
  v_n integer := 0;
  v_rol text;
  i integer;
BEGIN
  SELECT * INTO v_ej FROM contabilidad.ejercicios e WHERE p_fecha BETWEEN e.fecha_inicio AND e.fecha_fin;

  FOR r IN
    SELECT c.id, c.codigo, c.moneda, l.proveedor_id, l.disciplina_id, l.centro_costo_id,
           sum(l.debe - l.haber) AS base,
           sum(CASE WHEN l.debe > 0 THEN l.importe_origen ELSE -l.importe_origen END) AS origen
    FROM contabilidad.lineas l
    JOIN contabilidad.asientos a ON a.id = l.asiento_id
    JOIN contabilidad.cuentas c ON c.id = l.cuenta_id
    WHERE c.revalua AND a.estado = 'confirmado'
      AND a.fecha BETWEEN v_ej.fecha_inicio AND p_fecha
    GROUP BY c.id, c.codigo, c.moneda, l.proveedor_id, l.disciplina_id, l.centro_costo_id
  LOOP
    SELECT tasa, fecha INTO v_tc, v_tc_fecha FROM contabilidad.cotizaciones
    WHERE moneda = r.moneda AND fecha <= p_fecha ORDER BY fecha DESC LIMIT 1;
    IF v_tc IS NULL OR p_fecha - v_tc_fecha > 4 THEN
      RAISE EXCEPTION 'Falta la cotización de % al % (la última cargada es del %)',
        r.moneda, to_char(p_fecha, 'DD/MM/YYYY'), coalesce(to_char(v_tc_fecha, 'DD/MM/YYYY'), '—');
    END IF;
    v_ajuste := round(r.origen * v_tc, 2) - r.base;
    CONTINUE WHEN v_ajuste = 0;

    v_n := v_n + 1;
    v_lineas := v_lineas || jsonb_build_object(
      'cuenta_id', r.id, 'debe', greatest(v_ajuste, 0), 'haber', greatest(-v_ajuste, 0),
      'moneda', r.moneda, 'tc', v_tc,
      'proveedor_id', r.proveedor_id, 'disciplina_id', r.disciplina_id,
      'centro_costo_id', r.centro_costo_id,
      'descripcion', CASE WHEN r.origen = 0 THEN 'Diferencia realizada (partida cancelada)'
                          ELSE 'Revaluación a ' || v_tc END);
    -- Sin saldo en origen la partida ya se canceló: la diferencia es realizada.
    i := CASE WHEN r.origen = 0 THEN 3 ELSE 1 END + CASE WHEN v_ajuste > 0 THEN 0 ELSE 1 END;
    v_dif[i] := v_dif[i] + abs(v_ajuste);
  END LOOP;

  IF v_n = 0 THEN
    RETURN NULL;
  END IF;

  PERFORM set_config('contabilidad.proceso', 'sistema', true);
  INSERT INTO contabilidad.asientos (fecha, descripcion, tipo, origen_tipo, origen_id)
  VALUES (p_fecha, 'Revaluación de saldos en moneda extranjera al ' || to_char(p_fecha, 'DD/MM/YYYY'),
          'revaluacion', p_origen_tipo, p_origen_id)
  RETURNING id INTO v_id;

  INSERT INTO contabilidad.lineas (asiento_id, orden, cuenta_id, descripcion, debe, haber,
                                   moneda, importe_origen, tc, centro_costo_id, proveedor_id, disciplina_id)
  SELECT v_id, o, (e ->> 'cuenta_id')::uuid, e ->> 'descripcion',
         (e ->> 'debe')::numeric, (e ->> 'haber')::numeric,
         e ->> 'moneda', 0, (e ->> 'tc')::numeric,
         (e ->> 'centro_costo_id')::uuid, (e ->> 'proveedor_id')::integer, (e ->> 'disciplina_id')::integer
  FROM jsonb_array_elements(v_lineas) WITH ORDINALITY AS t(e, o);

  FOR i IN 1..4 LOOP
    CONTINUE WHEN v_dif[i] = 0;
    v_rol := (ARRAY['diferencia_cambio_ganada', 'diferencia_cambio_perdida',
                    'diferencia_cambio_ganada_realizada', 'diferencia_cambio_perdida_realizada'])[i];
    v_n := v_n + 1;
    INSERT INTO contabilidad.lineas (asiento_id, orden, cuenta_id, descripcion, debe, haber)
    VALUES (v_id, v_n, contabilidad.cuenta_sistema(v_rol),
            CASE WHEN i <= 2 THEN 'Diferencia de cambio por revaluación' ELSE 'Diferencia de cambio realizada' END,
            CASE WHEN i % 2 = 0 THEN v_dif[i] ELSE 0 END,
            CASE WHEN i % 2 = 1 THEN v_dif[i] ELSE 0 END);
  END LOOP;

  UPDATE contabilidad.asientos SET estado = 'confirmado' WHERE id = v_id;
  RETURN v_id;
END;
$$;

-- ------------------------------------------------------------
-- Funciones corregidas (S1, S2, S3, C4, C5, C6, C15, C21)
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION contabilidad._cuenta_valida() RETURNS trigger
LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE
  v_padre contabilidad.cuentas%ROWTYPE;
  v_clase_codigo contabilidad.clase_cuenta;
BEGIN
  v_clase_codigo := (ARRAY['activo', 'pasivo', 'patrimonio', 'ingreso', 'egreso']
                     ::contabilidad.clase_cuenta[])[left(NEW.codigo, 1)::int];

  IF NEW.padre_id IS NULL THEN
    IF NEW.codigo !~ '^[1-5]$' THEN
      RAISE EXCEPTION 'La cuenta % necesita cuenta padre', NEW.codigo;
    END IF;
    NEW.nivel := 1;
    NEW.clase := v_clase_codigo;
  ELSE
    SELECT * INTO v_padre FROM contabilidad.cuentas WHERE id = NEW.padre_id;
    IF v_padre.imputable THEN
      RAISE EXCEPTION 'La cuenta padre % es imputable: convertila en agrupadora antes de agregarle cuentas',
        v_padre.codigo;
    END IF;
    IF NEW.codigo NOT LIKE v_padre.codigo || '.%'
       OR position('.' IN substr(NEW.codigo, length(v_padre.codigo) + 2)) > 0 THEN
      RAISE EXCEPTION 'El código % no corresponde a una subcuenta directa de %', NEW.codigo, v_padre.codigo;
    END IF;
    NEW.nivel := v_padre.nivel + 1;
    NEW.clase := v_padre.clase;
    IF NEW.corriente IS NULL THEN
      NEW.corriente := v_padre.corriente;
    END IF;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF NEW.codigo <> OLD.codigo
       AND EXISTS (SELECT 1 FROM contabilidad.cuentas WHERE padre_id = OLD.id) THEN
      RAISE EXCEPTION 'No se puede cambiar el código de una cuenta con subcuentas';
    END IF;
    IF NEW.imputable AND NOT OLD.imputable
       AND EXISTS (SELECT 1 FROM contabilidad.cuentas WHERE padre_id = OLD.id) THEN
      RAISE EXCEPTION 'La cuenta % tiene subcuentas: no puede ser imputable', OLD.codigo;
    END IF;
    -- Sin llamar a otras funciones: este trigger corre con el usuario
    -- que edita el plan de cuentas.
    IF EXISTS (SELECT 1 FROM contabilidad.lineas l WHERE l.cuenta_id = OLD.id) THEN
      IF NEW.padre_id IS DISTINCT FROM OLD.padre_id
         OR NEW.clase <> OLD.clase
         OR NEW.naturaleza <> OLD.naturaleza
         OR NEW.moneda IS DISTINCT FROM OLD.moneda
         OR NEW.imputable <> OLD.imputable
         OR NEW.requiere_auxiliar IS DISTINCT FROM OLD.requiere_auxiliar THEN
        RAISE EXCEPTION 'La cuenta % tiene movimientos: no se puede cambiar su ubicación, clase, naturaleza, moneda, imputabilidad ni auxiliar',
          OLD.codigo;
      END IF;
      IF NEW.requiere_centro_costo AND NOT OLD.requiere_centro_costo
         AND EXISTS (SELECT 1 FROM contabilidad.lineas l
                     WHERE l.cuenta_id = OLD.id AND l.centro_costo_id IS NULL) THEN
        RAISE EXCEPTION 'La cuenta % tiene movimientos sin centro de costo: no puede pasar a exigirlo',
          OLD.codigo;
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION contabilidad._linea_antes() RETURNS trigger
LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE
  v_asiento contabilidad.asientos%ROWTYPE;
  v_cuenta contabilidad.cuentas%ROWTYPE;
  v_asiento_id uuid := CASE WHEN TG_OP = 'DELETE' THEN OLD.asiento_id ELSE NEW.asiento_id END;
  v_copia boolean := false;
BEGIN
  SELECT * INTO v_asiento FROM contabilidad.asientos WHERE id = v_asiento_id;

  IF TG_OP = 'DELETE' THEN
    -- Borrado en cascada: el asiento ya pasó su propio control.
    IF v_asiento.id IS NULL OR contabilidad._proceso() = 'reapertura' THEN
      RETURN OLD;
    END IF;
    IF v_asiento.estado <> 'borrador' THEN
      RAISE EXCEPTION 'Las líneas de un asiento confirmado no se modifican';
    END IF;
    RETURN OLD;
  END IF;

  IF v_asiento.estado <> 'borrador' THEN
    RAISE EXCEPTION 'Las líneas de un asiento confirmado no se modifican';
  END IF;
  IF TG_OP = 'UPDATE' AND NEW.asiento_id <> OLD.asiento_id THEN
    RAISE EXCEPTION 'Una línea no se mueve de asiento';
  END IF;

  SELECT * INTO v_cuenta FROM contabilidad.cuentas WHERE id = NEW.cuenta_id;
  IF NOT v_cuenta.imputable THEN
    RAISE EXCEPTION 'La cuenta % % es agrupadora: elegí una subcuenta', v_cuenta.codigo, v_cuenta.nombre;
  END IF;
  IF NOT v_cuenta.activa AND v_asiento.tipo NOT IN ('cierre', 'apertura', 'revaluacion', 'reversion') THEN
    RAISE EXCEPTION 'La cuenta % % está inactiva', v_cuenta.codigo, v_cuenta.nombre;
  END IF;

  IF v_cuenta.moneda IS NULL THEN
    IF NEW.moneda IS NOT NULL THEN
      RAISE EXCEPTION 'La cuenta % es en moneda funcional: la línea no lleva moneda de origen', v_cuenta.codigo;
    END IF;
  ELSE
    IF NEW.moneda IS DISTINCT FROM v_cuenta.moneda THEN
      RAISE EXCEPTION 'La cuenta % es en %: la línea debe llevar el importe en esa moneda',
        v_cuenta.codigo, v_cuenta.moneda;
    END IF;
    IF NEW.importe_origen = 0 AND v_asiento.tipo NOT IN ('revaluacion', 'apertura', 'reversion') THEN
      RAISE EXCEPTION 'Importe en % igual a cero en la cuenta %', v_cuenta.moneda, v_cuenta.codigo;
    END IF;
  END IF;

  -- Cierre, apertura, reversión y revaluación copian líneas que ya
  -- existen: no se les vuelve a exigir auxiliar ni centro (sí se
  -- rechaza un auxiliar que la cuenta no lleva).
  IF v_asiento.tipo IN ('cierre', 'apertura', 'reversion', 'revaluacion') THEN
    v_copia := true;
  END IF;

  IF v_cuenta.requiere_auxiliar = 'proveedor' AND NEW.proveedor_id IS NULL AND NOT v_copia THEN
    RAISE EXCEPTION 'La cuenta % exige indicar el proveedor', v_cuenta.codigo;
  END IF;
  IF v_cuenta.requiere_auxiliar IS DISTINCT FROM 'proveedor' AND NEW.proveedor_id IS NOT NULL THEN
    RAISE EXCEPTION 'La cuenta % no lleva proveedor', v_cuenta.codigo;
  END IF;
  IF v_cuenta.requiere_auxiliar = 'disciplina' AND NEW.disciplina_id IS NULL AND NOT v_copia THEN
    RAISE EXCEPTION 'La cuenta % exige indicar la disciplina', v_cuenta.codigo;
  END IF;
  IF v_cuenta.requiere_auxiliar IS DISTINCT FROM 'disciplina' AND NEW.disciplina_id IS NOT NULL THEN
    RAISE EXCEPTION 'La cuenta % no lleva disciplina', v_cuenta.codigo;
  END IF;
  IF v_cuenta.requiere_centro_costo AND NEW.centro_costo_id IS NULL AND NOT v_copia THEN
    RAISE EXCEPTION 'La cuenta % exige centro de costo', v_cuenta.codigo;
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION contabilidad.revertir_asiento(p_id uuid, p_motivo text, p_fecha date DEFAULT NULL) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_orig contabilidad.asientos%ROWTYPE;
  v_id uuid;
  v_fecha date;
BEGIN
  PERFORM contabilidad._exigir_escritura();
  IF p_motivo IS NULL OR length(btrim(p_motivo)) < 3 THEN
    RAISE EXCEPTION 'Indicá el motivo de la reversión';
  END IF;

  SELECT * INTO v_orig FROM contabilidad.asientos WHERE id = p_id FOR UPDATE;
  IF v_orig.id IS NULL OR v_orig.estado <> 'confirmado' THEN
    RAISE EXCEPTION 'Solo se revierten asientos confirmados';
  END IF;
  IF v_orig.revertido_por_id IS NOT NULL THEN
    RAISE EXCEPTION 'El asiento % ya fue revertido', v_orig.numero;
  END IF;
  -- La apertura cargada a mano (primer ejercicio) sí se revierte; la que
  -- genera el cierre se deshace reabriendo el ejercicio anterior.
  IF v_orig.tipo IN ('cierre', 'refundicion', 'reversion')
     OR (v_orig.tipo = 'apertura' AND v_orig.origen_tipo IS NOT NULL)
     OR v_orig.origen_tipo LIKE 'cierre\_%' THEN
    RAISE EXCEPTION 'Este asiento lo generó el sistema: se deshace reabriendo el ejercicio';
  END IF;

  v_fecha := coalesce(p_fecha, contabilidad._hoy());
  IF v_fecha < v_orig.fecha THEN
    RAISE EXCEPTION 'La reversión no puede ser anterior al asiento original';
  END IF;

  PERFORM set_config('contabilidad.proceso', 'sistema', true);

  INSERT INTO contabilidad.asientos (fecha, descripcion, tipo, asiento_revertido_id, motivo)
  VALUES (v_fecha, 'Reversión del asiento ' || v_orig.numero || ': ' || v_orig.descripcion,
          'reversion', v_orig.id, btrim(p_motivo))
  RETURNING id INTO v_id;

  INSERT INTO contabilidad.lineas (
    asiento_id, orden, cuenta_id, descripcion, debe, haber,
    moneda, importe_origen, tc, centro_costo_id, proveedor_id, disciplina_id
  )
  SELECT v_id, l.orden, l.cuenta_id, l.descripcion, l.haber, l.debe,
         l.moneda, l.importe_origen, l.tc, l.centro_costo_id, l.proveedor_id, l.disciplina_id
  FROM contabilidad.lineas l WHERE l.asiento_id = v_orig.id;

  UPDATE contabilidad.asientos SET estado = 'confirmado' WHERE id = v_id;
  UPDATE contabilidad.asientos SET revertido_por_id = v_id WHERE id = v_orig.id;

  PERFORM set_config('contabilidad.proceso', '', true);
  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION contabilidad.reabrir_ejercicio(p_ejercicio uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_ej contabilidad.ejercicios%ROWTYPE;
  v_sig uuid;
BEGIN
  PERFORM contabilidad._exigir_escritura();
  SELECT * INTO v_ej FROM contabilidad.ejercicios WHERE id = p_ejercicio FOR UPDATE;
  IF v_ej.id IS NULL OR v_ej.estado <> 'cerrado' THEN
    RAISE EXCEPTION 'El ejercicio no está cerrado';
  END IF;
  IF EXISTS (SELECT 1 FROM contabilidad.ejercicios
             WHERE fecha_inicio > v_ej.fecha_fin AND estado = 'cerrado') THEN
    RAISE EXCEPTION 'Hay un ejercicio posterior cerrado: se reabren del más nuevo al más viejo';
  END IF;
  SELECT id INTO v_sig FROM contabilidad.ejercicios WHERE fecha_inicio = v_ej.fecha_fin + 1;
  IF v_sig IS NOT NULL AND EXISTS (
    SELECT 1 FROM contabilidad.asientos WHERE ejercicio_id = v_sig AND tipo <> 'apertura'
  ) THEN
    RAISE EXCEPTION 'El ejercicio siguiente ya tiene movimientos: no se puede reabrir';
  END IF;
  IF v_sig IS NOT NULL AND EXISTS (
    SELECT 1 FROM contabilidad.periodos WHERE ejercicio_id = v_sig AND estado = 'cerrado'
  ) THEN
    RAISE EXCEPTION 'El ejercicio siguiente tiene meses cerrados: reabrilos primero';
  END IF;

  PERFORM set_config('contabilidad.proceso', 'reapertura', true);

  DELETE FROM contabilidad.asientos
   WHERE (ejercicio_id = v_sig AND tipo = 'apertura')
      OR (ejercicio_id = p_ejercicio
          AND origen_tipo IN ('cierre_revaluacion', 'cierre_resultados', 'cierre_refundicion'));

  -- Los números ya emitidos no se reutilizan: quedan como hueco y la
  -- auditoría registra qué se deshizo. El ejercicio siguiente, que quedó
  -- vacío, se elimina (no se puede asentar en él con el anterior abierto).
  IF v_sig IS NOT NULL THEN
    DELETE FROM contabilidad.numeradores WHERE ejercicio_id = v_sig;
    DELETE FROM contabilidad.periodos WHERE ejercicio_id = v_sig;
    DELETE FROM contabilidad.ejercicios WHERE id = v_sig;
  END IF;

  UPDATE contabilidad.ejercicios SET estado = 'abierto', cerrado_at = NULL, cerrado_por = NULL
   WHERE id = p_ejercicio;
  UPDATE contabilidad.periodos SET estado = 'abierto', cerrado_at = NULL, cerrado_por = NULL
   WHERE ejercicio_id = p_ejercicio AND fecha_fin = v_ej.fecha_fin;

  PERFORM set_config('contabilidad.proceso', '', true);
END;
$$;

CREATE OR REPLACE FUNCTION contabilidad.cerrar_ejercicio(p_ejercicio uuid) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_ej contabilidad.ejercicios%ROWTYPE;
  v_sig uuid;
  v_id uuid;
  v_res_ej uuid := contabilidad.cuenta_sistema('resultado_ejercicio');
  v_res_acum uuid := contabilidad.cuenta_sistema('resultados_acumulados');
  v_resultado numeric;
  v_n integer;
  v_moneda char(3);
  r record;
  v_tc numeric;
  v_valuado numeric;
BEGIN
  PERFORM contabilidad._exigir_escritura();

  SELECT * INTO v_ej FROM contabilidad.ejercicios WHERE id = p_ejercicio FOR UPDATE;
  IF v_ej.id IS NULL OR v_ej.estado = 'cerrado' THEN
    RAISE EXCEPTION 'El ejercicio no existe o ya está cerrado';
  END IF;
  -- Desde la app no se cierra un ejercicio que todavía no terminó.
  -- Conexiones directas (tests, scripts de admin) quedan exceptuadas.
  IF contabilidad._hoy() <= v_ej.fecha_fin
     AND coalesce(current_setting('request.jwt.claims', true), '') <> '' THEN
    RAISE EXCEPTION 'El % todavía no terminó: se cierra a partir del %',
      v_ej.nombre, to_char(v_ej.fecha_fin + 1, 'DD/MM/YYYY');
  END IF;
  IF EXISTS (SELECT 1 FROM contabilidad.ejercicios
             WHERE fecha_fin < v_ej.fecha_inicio AND estado = 'abierto') THEN
    RAISE EXCEPTION 'Primero hay que cerrar el ejercicio anterior';
  END IF;
  IF EXISTS (SELECT 1 FROM contabilidad.asientos
             WHERE ejercicio_id = p_ejercicio AND estado = 'borrador') THEN
    RAISE EXCEPTION 'Hay asientos en borrador en el ejercicio';
  END IF;
  -- El primer ejercicio necesita su apertura (o la declaración de que
  -- arrancó sin saldos); los siguientes la reciben del cierre anterior.
  IF NOT EXISTS (SELECT 1 FROM contabilidad.ejercicios WHERE fecha_fin < v_ej.fecha_inicio)
     AND NOT v_ej.sin_saldos_iniciales
     AND NOT EXISTS (SELECT 1 FROM contabilidad.asientos
                     WHERE ejercicio_id = p_ejercicio AND tipo = 'apertura'
                       AND estado = 'confirmado' AND revertido_por_id IS NULL) THEN
    RAISE EXCEPTION 'El ejercicio no tiene asiento de apertura: cargá los saldos iniciales o marcá que arrancó sin saldos';
  END IF;
  FOR v_moneda IN SELECT DISTINCT moneda FROM contabilidad.cuentas WHERE revalua LOOP
    IF NOT EXISTS (SELECT 1 FROM contabilidad.cotizaciones
                   WHERE moneda = v_moneda AND fecha BETWEEN v_ej.fecha_fin - 4 AND v_ej.fecha_fin) THEN
      RAISE EXCEPTION 'Falta la cotización de % de los últimos días del ejercicio', v_moneda;
    END IF;
  END LOOP;

  -- Para revaluar y asentar el cierre, el último período tiene que
  -- estar abierto: se reabren los que estén cerrados (el cierre los
  -- vuelve a cerrar todos al final).
  UPDATE contabilidad.periodos SET estado = 'abierto', cerrado_at = NULL, cerrado_por = NULL
   WHERE ejercicio_id = p_ejercicio AND estado = 'cerrado'
     AND fecha_fin = v_ej.fecha_fin;

  -- 1. Revaluación de moneda extranjera al cierre
  PERFORM contabilidad._revaluar(v_ej.fecha_fin, 'cierre_revaluacion', p_ejercicio::text);

  PERFORM set_config('contabilidad.proceso', 'sistema', true);

  -- 2. Cancelación de resultados contra Superávit/(Déficit) del ejercicio
  INSERT INTO contabilidad.asientos (fecha, descripcion, tipo, origen_tipo, origen_id)
  VALUES (v_ej.fecha_fin, 'Cierre de cuentas de resultado — ' || v_ej.nombre,
          'cierre', 'cierre_resultados', p_ejercicio::text)
  RETURNING id INTO v_id;

  INSERT INTO contabilidad.lineas (asiento_id, orden, cuenta_id, descripcion, debe, haber, centro_costo_id)
  SELECT v_id, row_number() OVER (ORDER BY c.codigo, s.centro_costo_id), s.cuenta_id, NULL,
         greatest(-s.saldo, 0), greatest(s.saldo, 0), s.centro_costo_id
  FROM (
    SELECT l.cuenta_id, l.centro_costo_id, sum(l.debe - l.haber) AS saldo
    FROM contabilidad.lineas l
    JOIN contabilidad.asientos a ON a.id = l.asiento_id
    JOIN contabilidad.cuentas c ON c.id = l.cuenta_id
    WHERE a.ejercicio_id = p_ejercicio AND a.estado = 'confirmado'
      AND c.clase IN ('ingreso', 'egreso')
    GROUP BY l.cuenta_id, l.centro_costo_id
    HAVING sum(l.debe - l.haber) <> 0
  ) s
  JOIN contabilidad.cuentas c ON c.id = s.cuenta_id;
  GET DIAGNOSTICS v_n = ROW_COUNT;

  IF v_n = 0 THEN
    DELETE FROM contabilidad.asientos WHERE id = v_id;
  ELSE
    -- Lo que falta para cuadrar: positivo = egresos > ingresos = déficit
    SELECT sum(haber) - sum(debe) INTO v_resultado FROM contabilidad.lineas WHERE asiento_id = v_id;
    IF v_resultado <> 0 THEN
      INSERT INTO contabilidad.lineas (asiento_id, orden, cuenta_id, descripcion, debe, haber)
      VALUES (v_id, v_n + 1, v_res_ej, 'Resultado del ejercicio',
              greatest(v_resultado, 0), greatest(-v_resultado, 0));
    END IF;
    UPDATE contabilidad.asientos SET estado = 'confirmado' WHERE id = v_id;
  END IF;

  -- 3. Refundición en Superávit/(Déficit) acumulado
  SELECT coalesce(sum(l.debe - l.haber), 0) INTO v_resultado
  FROM contabilidad.lineas l JOIN contabilidad.asientos a ON a.id = l.asiento_id
  WHERE a.ejercicio_id = p_ejercicio AND a.estado = 'confirmado' AND l.cuenta_id = v_res_ej;

  IF v_resultado <> 0 THEN
    INSERT INTO contabilidad.asientos (fecha, descripcion, tipo, origen_tipo, origen_id)
    VALUES (v_ej.fecha_fin, 'Refundición del resultado — ' || v_ej.nombre,
            'refundicion', 'cierre_refundicion', p_ejercicio::text)
    RETURNING id INTO v_id;
    INSERT INTO contabilidad.lineas (asiento_id, orden, cuenta_id, debe, haber) VALUES
      (v_id, 1, v_res_ej, greatest(-v_resultado, 0), greatest(v_resultado, 0)),
      (v_id, 2, v_res_acum, greatest(v_resultado, 0), greatest(-v_resultado, 0));
    UPDATE contabilidad.asientos SET estado = 'confirmado' WHERE id = v_id;
  END IF;

  -- 4. Cierre de períodos y ejercicio
  UPDATE contabilidad.periodos SET estado = 'cerrado', cerrado_at = now(), cerrado_por = auth.uid()
   WHERE ejercicio_id = p_ejercicio AND estado = 'abierto';
  UPDATE contabilidad.ejercicios SET estado = 'cerrado', cerrado_at = now(), cerrado_por = auth.uid()
   WHERE id = p_ejercicio;

  -- 5. Ejercicio siguiente y su apertura
  SELECT id INTO v_sig FROM contabilidad.ejercicios WHERE fecha_inicio = v_ej.fecha_fin + 1;
  IF v_sig IS NULL THEN
    v_sig := contabilidad.crear_ejercicio(extract(year FROM v_ej.fecha_fin + 1)::integer);
  END IF;
  PERFORM set_config('contabilidad.proceso', 'sistema', true);

  INSERT INTO contabilidad.asientos (fecha, descripcion, tipo, origen_tipo, origen_id)
  VALUES (v_ej.fecha_fin + 1, 'Apertura — saldos al ' || to_char(v_ej.fecha_fin, 'DD/MM/YYYY'),
          'apertura', 'apertura', v_sig::text)
  RETURNING id INTO v_id;

  -- Saldos patrimoniales por cuenta y auxiliar. En cuentas en moneda
  -- extranjera la cantidad en origen se valúa a la cotización del cierre
  -- y, si queda un residuo en pesos (cuentas que no revalúan), va en una
  -- línea aparte con importe de origen 0: así se conservan el signo de los
  -- dólares y el valor en pesos.
  v_n := 0;
  FOR r IN
    SELECT l.cuenta_id, c.codigo, c.moneda, l.proveedor_id, l.disciplina_id, l.centro_costo_id,
           sum(l.debe - l.haber) AS base,
           coalesce(sum(CASE WHEN l.debe > 0 THEN l.importe_origen ELSE -l.importe_origen END), 0) AS origen
    FROM contabilidad.lineas l
    JOIN contabilidad.asientos a ON a.id = l.asiento_id
    JOIN contabilidad.cuentas c ON c.id = l.cuenta_id
    WHERE a.ejercicio_id = p_ejercicio AND a.estado = 'confirmado'
      AND c.clase IN ('activo', 'pasivo', 'patrimonio')
    GROUP BY l.cuenta_id, c.codigo, c.moneda, l.proveedor_id, l.disciplina_id, l.centro_costo_id
    HAVING sum(l.debe - l.haber) <> 0
        OR coalesce(sum(CASE WHEN l.debe > 0 THEN l.importe_origen ELSE -l.importe_origen END), 0) <> 0
    ORDER BY c.codigo, l.proveedor_id, l.disciplina_id, l.centro_costo_id
  LOOP
    IF r.moneda IS NULL THEN
      v_n := v_n + 1;
      INSERT INTO contabilidad.lineas (asiento_id, orden, cuenta_id, debe, haber,
                                       centro_costo_id, proveedor_id, disciplina_id)
      VALUES (v_id, v_n, r.cuenta_id, greatest(r.base, 0), greatest(-r.base, 0),
              r.centro_costo_id, r.proveedor_id, r.disciplina_id);
      CONTINUE;
    END IF;

    v_tc := contabilidad.tc_cierre(r.moneda, v_ej.fecha_fin);
    v_valuado := 0;
    IF r.origen <> 0 THEN
      v_valuado := sign(r.origen) * round(abs(r.origen) * v_tc, 2);
      v_n := v_n + 1;
      INSERT INTO contabilidad.lineas (asiento_id, orden, cuenta_id, debe, haber, moneda, importe_origen, tc,
                                       centro_costo_id, proveedor_id, disciplina_id)
      VALUES (v_id, v_n, r.cuenta_id, greatest(v_valuado, 0), greatest(-v_valuado, 0),
              r.moneda, abs(r.origen), v_tc, r.centro_costo_id, r.proveedor_id, r.disciplina_id);
    END IF;
    IF r.base - v_valuado <> 0 THEN
      v_n := v_n + 1;
      INSERT INTO contabilidad.lineas (asiento_id, orden, cuenta_id, descripcion, debe, haber,
                                       moneda, importe_origen, tc,
                                       centro_costo_id, proveedor_id, disciplina_id)
      VALUES (v_id, v_n, r.cuenta_id, 'Diferencia de valuación arrastrada',
              greatest(r.base - v_valuado, 0), greatest(v_valuado - r.base, 0),
              r.moneda, 0, v_tc, r.centro_costo_id, r.proveedor_id, r.disciplina_id);
    END IF;
  END LOOP;

  IF v_n = 0 THEN
    DELETE FROM contabilidad.asientos WHERE id = v_id;
  ELSE
    UPDATE contabilidad.asientos SET estado = 'confirmado' WHERE id = v_id;
  END IF;

  PERFORM set_config('contabilidad.proceso', '', true);
  RETURN v_sig;
END;
$$;

-- ------------------------------------------------------------
-- Tesorería y comisión fiscal leen proveedores y disciplinas (S9)
-- ------------------------------------------------------------
CREATE POLICY "Contabilidad ve proveedores" ON public.proveedores
  FOR SELECT TO authenticated USING (contabilidad.puede_leer());
CREATE POLICY "Contabilidad ve disciplinas" ON public.disciplinas
  FOR SELECT TO authenticated USING (contabilidad.puede_leer());

-- ------------------------------------------------------------
-- Permisos
-- ------------------------------------------------------------
REVOKE EXECUTE ON FUNCTION contabilidad._cuenta_sistema_valida(), contabilidad.cuenta_para(text, text, char)
  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION contabilidad.declarar_sin_saldos_iniciales(uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION contabilidad.declarar_sin_saldos_iniciales(uuid, boolean) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION contabilidad.cuenta_para(text, text, char) TO service_role;
