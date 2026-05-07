import { createServerClient } from "@/lib/supabase/server";
import { CategoriasCliente } from "@/components/tesoreria/categorias-cliente";

export const dynamic = "force-dynamic";

export default async function CategoriasPage() {
  const supabase = await createServerClient();
  const { data: categorias } = await supabase
    .from("categorias_financieras")
    .select("*")
    .order("tipo", { ascending: true })
    .order("orden", { ascending: true })
    .order("nombre", { ascending: true });

  return (
    <div className="relative -mx-2 sm:mx-0">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 -top-12 h-64 opacity-60"
        style={{
          background:
            "radial-gradient(ellipse 60% 100% at 12% 0%, rgba(115,13,50,0.10) 0%, transparent 70%), radial-gradient(ellipse 50% 80% at 90% 0%, rgba(247,182,67,0.14) 0%, transparent 70%)",
        }}
      />

      <div className="relative space-y-8 px-2 sm:px-0 pb-12">
        <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="space-y-3">
            <div className="flex items-center gap-3 text-[10px] uppercase tracking-editorial text-bordo-700">
              <span className="inline-flex items-center gap-2">
                <span className="size-1.5 rounded-full bg-bordo-700" />
                Tesorería
              </span>
              <span className="h-px w-6 bg-bordo-300" />
              <span className="text-muted-foreground">Plan de cuentas</span>
            </div>
            <h2 className="font-heading text-4xl lg:text-5xl text-bordo-900 leading-[1.05] tracking-tight">
              Categorías
              <span className="text-bordo-300">.</span>
            </h2>
            <p className="text-sm text-muted-foreground max-w-xl leading-relaxed">
              Estructura jerárquica de ingresos y egresos para clasificar movimientos y armar
              presupuesto. Cada partida hereda el color de su categoría madre.
            </p>
          </div>

          <div className="hidden lg:flex flex-col items-end gap-1 text-right shrink-0">
            <span className="text-[10px] uppercase tracking-editorial text-muted-foreground">
              Plan vigente
            </span>
            <span className="font-heading text-sm text-foreground tabular-nums">
              {new Date().toLocaleDateString("es-UY", {
                year: "numeric",
                month: "long",
              })}
            </span>
          </div>
        </header>

        <CategoriasCliente categoriasIniciales={(categorias ?? []) as never} />
      </div>
    </div>
  );
}
