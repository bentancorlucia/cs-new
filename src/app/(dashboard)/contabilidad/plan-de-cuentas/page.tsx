import { createContabilidadClient } from "@/lib/contabilidad/server";
import { createServerClient } from "@/lib/supabase/server";
import { permisosContabilidad } from "@/lib/contabilidad/permisos";
import {
  compararCodigos,
  type CentroCostoPlan,
  type CuentaPlan,
} from "@/lib/contabilidad/plan-cuentas";
import { PlanCuentasCliente } from "@/components/contabilidad/plan-cuentas/plan-cuentas-cliente";

export const dynamic = "force-dynamic";

export default async function PlanDeCuentasPage() {
  const [{ puedeEscribir }, contabilidad, publico] = await Promise.all([
    permisosContabilidad(),
    createContabilidadClient(),
    createServerClient(),
  ]);

  const [cuentasRes, sistemaRes, parametrosRes, centrosRes, disciplinasRes] = await Promise.all([
    // `lineas(count)` cuenta los movimientos de cada cuenta en una sola consulta
    // (un select de lineas.cuenta_id quedaría cortado por el max_rows de PostgREST).
    contabilidad
      .from("cuentas")
      .select(
        "id, codigo, nombre, padre_id, nivel, clase, naturaleza, imputable, moneda, es_disponibilidad, revalua, requiere_auxiliar, requiere_centro_costo, activa, descripcion, lineas(count)"
      ),
    contabilidad.from("cuentas_sistema").select("rol, cuenta_id"),
    contabilidad.from("parametros_cuentas").select("cuenta_id"),
    contabilidad
      .from("centros_costo")
      .select("id, codigo, nombre, disciplina_id, activo")
      .order("codigo"),
    publico.from("disciplinas").select("id, nombre"),
  ]);

  const error =
    cuentasRes.error ?? sistemaRes.error ?? parametrosRes.error ?? centrosRes.error ?? null;

  const rolPorCuenta = new Map((sistemaRes.data ?? []).map((s) => [s.cuenta_id, s.rol]));
  const conParametros = new Set((parametrosRes.data ?? []).map((p) => p.cuenta_id));

  const cuentas: CuentaPlan[] = (cuentasRes.data ?? [])
    .map(({ lineas, ...c }) => ({
      ...c,
      tieneMovimientos: (lineas?.[0]?.count ?? 0) > 0,
      rolSistema: rolPorCuenta.get(c.id) ?? null,
      enParametros: conParametros.has(c.id),
    }))
    .sort((a, b) => compararCodigos(a.codigo, b.codigo));

  const nombreDisciplina = new Map((disciplinasRes.data ?? []).map((d) => [d.id, d.nombre]));
  const centros: CentroCostoPlan[] = (centrosRes.data ?? []).map((c) => ({
    ...c,
    disciplinaNombre: c.disciplina_id ? (nombreDisciplina.get(c.disciplina_id) ?? null) : null,
  }));

  return (
    <div className="space-y-6 pb-12">
      <header className="flex flex-col gap-2 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-[10px] uppercase tracking-editorial text-bordo-700 font-heading">
            Contabilidad
          </p>
          <h1 className="font-display text-2xl sm:text-3xl uppercase tracking-tightest text-foreground">
            Plan de cuentas
          </h1>
          <p className="mt-1 text-sm text-muted-foreground font-body max-w-2xl">
            Estructura jerárquica de cuentas para la partida doble y centros de costo para
            analizar resultados por disciplina y área del club.
          </p>
        </div>
        {!puedeEscribir && (
          <span className="w-fit rounded-full border border-linea bg-white px-3 py-1 text-[10px] uppercase tracking-editorial text-muted-foreground font-heading">
            Solo lectura
          </span>
        )}
      </header>

      {error ? (
        <div className="rounded-2xl border border-bordo-200 bg-bordo-50/50 p-6 text-sm text-bordo-900">
          No se pudo cargar el plan de cuentas: {error.message}
        </div>
      ) : (
        <PlanCuentasCliente cuentas={cuentas} centros={centros} puedeEscribir={puedeEscribir} />
      )}
    </div>
  );
}
