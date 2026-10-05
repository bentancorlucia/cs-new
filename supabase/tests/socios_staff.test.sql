-- Staff: vínculos por período, permisos de representantes y registro de cambios.
BEGIN;
SELECT plan(31);

CREATE FUNCTION pg_temp.p(p_cedula text) RETURNS integer LANGUAGE sql SECURITY DEFINER AS $$ SELECT id FROM public.padron_socios WHERE cedula = p_cedula $$;
-- Lee como postgres (la representante no ve el padrón: solo el panel).
CREATE FUNCTION pg_temp.v(p_sql text) RETURNS text LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE r text; BEGIN EXECUTE p_sql INTO r; RETURN r; END $$;
CREATE FUNCTION pg_temp.como(p_usuario text) RETURNS void LANGUAGE sql AS $$
  SELECT set_config('request.jwt.claims', json_build_object('sub', p_usuario, 'role', 'authenticated')::text, true)
$$;
CREATE FUNCTION pg_temp.st(p_cedula text, p_disciplina integer) RETURNS bigint LANGUAGE sql SECURITY DEFINER AS $$
  SELECT id FROM socios.staff WHERE persona_id = pg_temp.p(p_cedula) AND disciplina_id IS NOT DISTINCT FROM p_disciplina
  ORDER BY id DESC LIMIT 1
$$;

SELECT hasnt_table('public', 'staff', 'la tabla vieja de staff ya no existe: sus filas pasaron a socios.staff');

-- Usuarios: una representante de la disciplina 7, un tesorero, una persona sin rol.
INSERT INTO auth.users (id, instance_id, aud, role, email, raw_user_meta_data) VALUES
  ('00000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   'repre@example.com', '{"nombre": "Rita", "apellido": "Presentante"}'),
  ('00000000-0000-0000-0000-0000000000e2', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   'teso@example.com', '{"nombre": "Teo", "apellido": "Rero"}'),
  ('00000000-0000-0000-0000-0000000000e3', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   'nadie@example.com', '{"nombre": "Na", "apellido": "Die"}');
INSERT INTO public.perfil_roles (perfil_id, rol_id)
SELECT '00000000-0000-0000-0000-0000000000e2', id FROM public.roles WHERE nombre = 'tesorero';
DO $$ BEGIN PERFORM socios.guardar_representante(NULL, 7, '{"nombre": "Rita Presentante", "email": "repre@example.com"}'); END $$;

-- El club (secretaría): staff de rugby y personal sin disciplina.
DO $$ BEGIN
  PERFORM socios.alta_staff(13, '{"cedula": "80000001", "nombre": "Rolo", "apellido": "Rugby"}', 'entrenador', 'Primera');
  PERFORM socios.alta_staff(NULL, '{"cedula": "8.000.000-2", "nombre": "Ana", "apellido": "Ministra"}', 'administrativo');
END $$;
SELECT is((SELECT disciplina_id IS NULL AND origen = 'club' FROM socios.cambios_disciplina
           WHERE persona_id = pg_temp.p('80000002') AND tipo = 'staff_alta'), true,
          'el personal del club queda en el registro sin disciplina, como cambio del club');
SELECT is((SELECT activo::text || '/' || socios.es_socio_en(id, contabilidad._hoy())::text
           FROM public.padron_socios WHERE cedula = '80000002'), 'false/false',
          'la persona nueva del staff queda en el padrón sin ser socia');

-- ---------- Como representante de la disciplina 7
SELECT pg_temp.como('00000000-0000-0000-0000-0000000000e1');
SET LOCAL ROLE authenticated;

SELECT lives_ok($$ SELECT socios.alta_staff(7, '{"cedula": "80000003", "nombre": "Ema", "apellido": "Entrena",
  "email": "Ema@Example.com", "telefono": "099 111 222"}', 'entrenador', 'Sub-14') $$,
  'la representante da de alta a una entrenadora de su disciplina');
SELECT is(pg_temp.v($$SELECT email || ' ' || telefono FROM public.padron_socios WHERE cedula = '80000003'$$),
          'ema@example.com 099 111 222', 'con su contacto en el padrón (el correo en minúsculas)');
SELECT is(pg_temp.v($$SELECT origen || '/' || disciplina_id || '/' || hecho_por_nombre FROM socios.cambios_disciplina
                      WHERE persona_id = (SELECT id FROM public.padron_socios WHERE cedula = '80000003')$$),
          'representante/7/Rita Presentante', 'el alta queda en el registro de la disciplina con quién la hizo');

SELECT throws_like($$ SELECT socios.alta_staff(7, '{"cedula": "80000003"}', 'entrenador', 'sub-14') $$,
  '%ya tiene esa función%', 'la misma función y categoría dos veces en el mismo período no');
SELECT lives_ok($$ SELECT socios.alta_staff(7, '{"cedula": "80000003"}', 'entrenador', 'Sub-16', contabilidad._hoy() - 30) $$,
  'otra categoría es otro vínculo');

-- Una persona que ya está en el padrón: se usan sus datos y solo se completa lo que falta.
SELECT lives_ok($$ SELECT socios.alta_staff(7, '{"cedula": "80000001", "nombre": "Otro", "apellido": "Nombre",
  "email": "rolo@example.com"}', 'preparador_fisico') $$,
  'el entrenador de rugby también es preparador físico en la 7');
SELECT is(pg_temp.v($$SELECT nombre || ' ' || apellido || ' ' || email FROM public.padron_socios WHERE cedula = '80000001'$$),
          'Rolo Rugby rolo@example.com', 'no le cambia el nombre, pero le completa el correo que faltaba');

SELECT is(jsonb_array_length(socios.disc_staff(7)), 3, 'el panel muestra los tres vínculos de la disciplina');
SELECT is((SELECT count(*) FROM socios.staff), 3::bigint, 'por RLS, la representante solo ve el staff de su disciplina');

SELECT throws_ok($$ SELECT socios.alta_staff(13, '{"cedula": "80000009", "nombre": "X", "apellido": "Y"}', 'delegado') $$,
  '42501', NULL, 'no da de alta en otra disciplina');
SELECT throws_ok($$ SELECT socios.alta_staff(NULL, '{"cedula": "80000009", "nombre": "X", "apellido": "Y"}', 'mantenimiento') $$,
  '42501', NULL, 'ni personal del club');
SELECT throws_ok($$ SELECT socios.baja_staff(pg_temp.st('80000001', 13), contabilidad._hoy()) $$,
  '42501', NULL, 'ni da de baja al staff de otra disciplina');
SELECT throws_ok($$ SELECT socios.disc_staff(13) $$, '42501', NULL, 'ni lo ve');
SELECT throws_ok($$ SELECT socios.staff_club() $$, '42501', NULL, 'ni ve la lista de todo el club');
SELECT throws_ok($$ INSERT INTO socios.staff (persona_id, disciplina_id, funcion, desde) VALUES (1, 7, 'otro', current_date) $$,
  '42501', NULL, 'no escribe la tabla directo: solo por las funciones');

-- Baja, anulación y edición.
SELECT lives_ok($$ SELECT socios.baja_staff((SELECT id FROM socios.staff WHERE detalle = 'Sub-16'),
  contabilidad._hoy() - 1, 'Deja la categoría') $$, 'da de baja un vínculo');
SELECT is(jsonb_array_length(socios.disc_staff(7)), 2, 'que sale de la lista de vigentes');
SELECT is((SELECT e ->> 'estado' FROM jsonb_array_elements(socios.disc_staff(7, true)) e WHERE e ->> 'detalle' = 'Sub-16'),
          'baja', 'y queda en el histórico');
SELECT throws_like($$ SELECT socios.baja_staff((SELECT id FROM socios.staff WHERE detalle = 'Sub-16'), contabilidad._hoy()) $$,
  '%Ya tiene baja%', 'no se da de baja dos veces');
SELECT lives_ok($$ SELECT socios.anular_baja_staff((SELECT id FROM socios.staff WHERE detalle = 'Sub-16')) $$,
  'una baja por error se anula');
SELECT is(jsonb_array_length(socios.disc_staff(7)), 3, 'y vuelve a estar vigente');

SELECT throws_like($$ SELECT socios.editar_staff((SELECT id FROM socios.staff WHERE detalle = 'Sub-14'), 'entrenador', 'Sub-14', contabilidad._hoy(),
  NULL, '{"email": "sin arroba"}') $$, '%correo no es válido%', 'un correo mal escrito se rechaza');
SELECT lives_ok($$ SELECT socios.editar_staff((SELECT id FROM socios.staff WHERE detalle = 'Sub-14'), 'coordinador', 'Formativas',
  contabilidad._hoy(), 'Coordina de sub-10 a sub-14', '{"telefono": "098 000 000"}') $$, 'edita función, detalle y teléfono');
SELECT is((SELECT despues ->> 'funcion' || ' ' || (despues ->> 'telefono') || ' / ' || (antes ->> 'telefono')
           FROM socios.cambios_disciplina WHERE tipo = 'staff_cambio' AND despues ? 'funcion'),
          'coordinador 098 000 000 / 099 111 222', 'el cambio guarda antes y después');

SELECT lives_ok($$ SELECT socios.eliminar_staff(pg_temp.st('80000001', 7)) $$, 'quita un vínculo cargado por error');
SELECT is((SELECT count(*) FROM socios.cambios_disciplina WHERE tipo = 'staff_baja' AND descripcion LIKE '%por error%'),
          1::bigint, 'y el registro lo conserva');
RESET ROLE;

-- ---------- Tesorería ve todo; alguien sin rol, nada.
SELECT pg_temp.como('00000000-0000-0000-0000-0000000000e2');
SET LOCAL ROLE authenticated;
SELECT is(jsonb_array_length(socios.staff_club()), 4, 'tesorería ve el staff de todo el club, también el personal sin disciplina');
RESET ROLE;
SELECT pg_temp.como('00000000-0000-0000-0000-0000000000e3');
SET LOCAL ROLE authenticated;
SELECT throws_ok($$ SELECT socios.disc_staff(7) $$, '42501', NULL, 'alguien sin rol no ve el staff');
RESET ROLE;

SELECT * FROM finish();
ROLLBACK;
