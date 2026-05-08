import { createServerClient } from "@/lib/supabase/server";
import { PresupuestoCliente } from "@/components/tesoreria/presupuesto-cliente";

export const dynamic = "force-dynamic";

export default async function PresupuestoPage() {
  const supabase = await createServerClient();
  const { data: categorias } = await supabase
    .from("categorias_financieras")
    .select("id, nombre, slug, tipo, padre_id, color")
    .eq("activa", true)
    .order("tipo", { ascending: true })
    .order("nombre", { ascending: true });

  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-display text-2xl sm:text-3xl uppercase tracking-tightest text-foreground">
          Presupuesto
        </h1>
        <p className="mt-1 text-sm text-muted-foreground font-body">
          Definí el plan financiero por período y compará contra lo ejecutado.
        </p>
      </div>
      <PresupuestoCliente categorias={(categorias ?? []) as never} />
    </div>
  );
}
