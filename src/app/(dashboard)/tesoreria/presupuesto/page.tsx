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
        <h2 className="font-heading text-xl text-bordo-900">Presupuesto</h2>
        <p className="text-sm text-muted-foreground">
          Definí el plan financiero por período y compará contra lo ejecutado.
        </p>
      </div>
      <PresupuestoCliente categorias={(categorias ?? []) as never} />
    </div>
  );
}
