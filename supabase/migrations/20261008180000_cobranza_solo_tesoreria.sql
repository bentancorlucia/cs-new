-- ============================================================
-- Cobranza: solo tesorería (y super_admin) registra cobros.
-- Secretaría gestiona el padrón y ya no entra a Cuotas de socios.
-- El panel de la disciplina sigue registrando cobros en su cuenta
-- (disc_registrar_cobro delega con socios.delegado).
-- ============================================================
CREATE OR REPLACE FUNCTION socios._exigir_cobranza() RETURNS void
LANGUAGE sql STABLE SET search_path = '' AS $$ SELECT socios._exigir(ARRAY['tesorero']) $$;
