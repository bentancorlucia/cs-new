-- Transferencia con varias disciplinas: cada cuota se paga en la cuenta de
-- su disciplina; la cuota social, en la cuenta elegida en el medio de cobro.
--
-- Precios: social 1.000, Hockey Primera 1.500 (hockey = 7), Rugby Plantel 2.000 (rugby = 13).
--   Hugo  social + Hockey + Rugby, transferencia; la social en la cuenta de rugby
--   Ivo   social + Hockey + Rugby, débito Visa (la social, a cargo de hockey: inscripción más antigua)
--   Juan  social + Hockey + Rugby, transferencia; social en rugby y desde agosto en hockey
BEGIN;
SELECT plan(14);

DO $$ BEGIN PERFORM contabilidad.crear_ejercicio(2026); END $$;
CREATE FUNCTION pg_temp.p(p_cedula text) RETURNS integer LANGUAGE sql AS $$ SELECT id FROM public.padron_socios WHERE cedula = p_cedula $$;

INSERT INTO socios.planes (nombre, tipo, disciplina_id, permite_anual) VALUES
  ('Cuota social', 'social', NULL, true), ('Hockey Primera', 'disciplina', 7, false), ('Rugby Plantel', 'disciplina', 13, false);
CREATE FUNCTION pg_temp.pl(p text) RETURNS integer LANGUAGE sql AS $$ SELECT id FROM socios.planes WHERE nombre = p $$;
INSERT INTO socios.plan_precios (plan_id, vigente_desde, importe_mensual, importe_anual) VALUES
  (pg_temp.pl('Cuota social'), '2026-01-01', 1000, 10800), (pg_temp.pl('Hockey Primera'), '2026-01-01', 1500, NULL),
  (pg_temp.pl('Rugby Plantel'), '2026-01-01', 2000, NULL);

-- Cuota de una persona: tipo 'social', o la disciplina.
CREATE FUNCTION pg_temp.cuota(p_cedula text, p_tipo text, p_periodo date DEFAULT '2026-07-01') RETURNS bigint
LANGUAGE sql AS $$
  SELECT c.id FROM socios.cuotas c
  WHERE c.persona_id = pg_temp.p(p_cedula) AND c.periodo_desde = p_periodo AND c.estado = 'emitida'
    AND CASE p_tipo WHEN 'social' THEN c.tipo = 'social' WHEN 'hockey' THEN c.disciplina_id = 7 ELSE c.disciplina_id = 13 END
$$;
CREATE FUNCTION pg_temp.saldo(p_cuota bigint) RETURNS numeric LANGUAGE sql AS $$ SELECT socios._saldo_cuota(p_cuota) $$;

DO $$
DECLARE
  planes jsonb := jsonb_build_array(jsonb_build_object('plan_id', pg_temp.pl('Cuota social')),
                                    jsonb_build_object('plan_id', pg_temp.pl('Hockey Primera')),
                                    jsonb_build_object('plan_id', pg_temp.pl('Rugby Plantel')));
BEGIN
  PERFORM socios.alta_socio('{"cedula": "91000001", "nombre": "Hugo", "apellido": "Cuenta"}', '2026-07-01', planes,
    '{"medio": "transferencia_disciplina", "disciplina_id": 13}');
  PERFORM socios.alta_socio('{"cedula": "91000002", "nombre": "Ivo", "apellido": "Cuenta"}', '2026-07-01', planes,
    '{"medio": "debito_visa", "tarjeta_ultimos4": "2222"}');
  PERFORM socios.alta_socio('{"cedula": "91000003", "nombre": "Juan", "apellido": "Cuenta"}', '2026-07-01', planes,
    '{"medio": "transferencia_disciplina", "disciplina_id": 13}');
END $$;
DO $$ BEGIN PERFORM socios.emitir_lote('2026-07-01'); END $$;

-- ---------- Quién cubre la social
SELECT is((SELECT disciplina_responsable_id FROM socios.cuotas WHERE id = pg_temp.cuota('91000001', 'social')), 13,
          'transferencia: la social queda a cargo de la cuenta elegida (rugby), no de la inscripción más antigua');
SELECT is((SELECT disciplina_responsable_id FROM socios.cuotas WHERE id = pg_temp.cuota('91000002', 'social')), 7,
          'débito Visa: la social sigue a cargo de la inscripción más antigua (hockey)');
SELECT is((socios.cuota_social_de(pg_temp.p('91000001'), '2026-07-15') ->> 'disciplina_id')::integer, 13,
          'la ficha dice que la social de Hugo se paga en rugby');

-- ---------- Cobro en la cuenta de hockey: solo la cuota de hockey
DO $$ BEGIN PERFORM socios.registrar_cobro(pg_temp.p('91000001'), '2026-07-10', 'transferencia_disciplina', 3000, p_disciplina => 7); END $$;
SELECT is(pg_temp.saldo(pg_temp.cuota('91000001', 'hockey')), 0.00::numeric, 'el pago en la cuenta de hockey cubre la cuota de hockey');
SELECT is(pg_temp.saldo(pg_temp.cuota('91000001', 'social')), 1000.00::numeric, '...pero no la social, que se paga en rugby');
SELECT is(pg_temp.saldo(pg_temp.cuota('91000001', 'rugby')), 2000.00::numeric, '...ni la de rugby');
SELECT is((SELECT saldo_a_favor FROM socios.cobros_saldo WHERE persona_id = pg_temp.p('91000001') AND disciplina_id = 7),
          1500.00::numeric, 'lo que sobra queda como saldo a favor');
SELECT throws_like(
  format($$ SELECT socios.registrar_cobro(%s, '2026-07-10', 'transferencia_disciplina', 1000, p_disciplina => 7, p_cuotas => ARRAY[%s]) $$,
         pg_temp.p('91000001'), pg_temp.cuota('91000001', 'social')),
  '%solo se pagan sus cuotas%', 'en la cuenta de hockey no se puede pagar la social que va a rugby');

-- ---------- Cobro en la cuenta de rugby: la de rugby y la social
DO $$ BEGIN PERFORM socios.registrar_cobro(pg_temp.p('91000001'), '2026-07-12', 'transferencia_disciplina', 3000, p_disciplina => 13); END $$;
SELECT is(pg_temp.saldo(pg_temp.cuota('91000001', 'social')) + pg_temp.saldo(pg_temp.cuota('91000001', 'rugby')), 0.00::numeric,
          'el pago en la cuenta de rugby cubre la social y la de rugby');

-- ---------- Cambio de cuenta de la social desde agosto
DO $$ BEGIN PERFORM socios.cambiar_medio_cobro(pg_temp.p('91000003'), '{"medio": "transferencia_disciplina", "disciplina_id": 7}', '2026-08-01'); END $$;
DO $$ BEGIN PERFORM socios.emitir_lote('2026-08-01'); END $$;
SELECT is((SELECT disciplina_responsable_id FROM socios.cuotas WHERE id = pg_temp.cuota('91000003', 'social')), 13,
          'la social de julio de Juan sigue en rugby (las cuotas emitidas no cambian)');
SELECT is((SELECT disciplina_responsable_id FROM socios.cuotas WHERE id = pg_temp.cuota('91000003', 'social', '2026-08-01')), 7,
          'la de agosto ya va a hockey');

-- ---------- El saldo a favor de hockey solo se aplica a cuotas de hockey
SELECT is(pg_temp.saldo(pg_temp.cuota('91000001', 'hockey', '2026-08-01')), 0.00::numeric,
          'el saldo a favor de la cuenta de hockey paga la cuota de hockey de agosto');
SELECT is(pg_temp.saldo(pg_temp.cuota('91000001', 'social', '2026-08-01')), 1000.00::numeric,
          '...y no la social de agosto, que se paga en rugby');
SELECT is(pg_temp.saldo(pg_temp.cuota('91000001', 'rugby', '2026-08-01')), 2000.00::numeric,
          '...ni la de rugby');

SELECT * FROM finish();
ROLLBACK;
