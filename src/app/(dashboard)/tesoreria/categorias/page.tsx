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
      <div className="relative space-y-8 px-2 sm:px-0 pb-12">
        <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h1 className="font-display text-2xl sm:text-3xl uppercase tracking-tightest text-foreground">
              Categorías
            </h1>
            <p className="mt-1 text-sm text-muted-foreground font-body max-w-xl">
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
