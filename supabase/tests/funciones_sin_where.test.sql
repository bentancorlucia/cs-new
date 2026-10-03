-- Las conexiones de la API cargan pg-safeupdate: un UPDATE o DELETE sin
-- WHERE falla desde el sitio aunque ande en los tests (que corren por
-- conexión directa). Este test revisa el código de las funciones.
BEGIN;
SELECT plan(1);

SELECT is(
  (SELECT string_agg(n.nspname || '.' || p.proname || ': ' || left(regexp_replace(m[1], '\s+', ' ', 'g'), 80), E'\n')
   FROM pg_proc p
   JOIN pg_namespace n ON n.oid = p.pronamespace
   CROSS JOIN LATERAL regexp_matches(p.prosrc, '((?:UPDATE\s+[a-z_."]+\s+(?:[a-z_]+\s+)?SET|DELETE\s+FROM)\s[^;]*;)', 'gi') AS m
   WHERE n.nspname IN ('contabilidad', 'comercial', 'socios', 'comunicaciones')
     AND m[1] !~* '\mWHERE\M'),
  NULL,
  'ninguna función hace UPDATE o DELETE sin WHERE'
);

SELECT * FROM finish();
ROLLBACK;
