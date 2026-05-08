import { createServerClient } from "@/lib/supabase/server";
import { MovimientosCliente } from "@/components/tesoreria/movimientos-cliente";

export const dynamic = "force-dynamic";

export default async function MovimientosPage() {
  const supabase = await createServerClient();

  const [{ data: cuentas }, { data: categorias }] = await Promise.all([
    supabase
      .from("cuentas_financieras")
      .select("id, nombre, tipo, moneda, color, banco, modulo")
      .eq("activa", true)
      .order("nombre", { ascending: true }),
    supabase
      .from("categorias_financieras")
      .select("id, nombre, slug, tipo, padre_id, color")
      .eq("activa", true)
      .order("tipo", { ascending: true })
      .order("nombre", { ascending: true }),
  ]);

  return (
    <div className="space-y-5">
      <div>
        <h2 className="font-heading text-xl text-bordo-900">Movimientos</h2>
        <p className="text-sm text-muted-foreground">
          Vista consolidada de todos los movimientos. Clasificá los que vienen de extractos importados.
        </p>
      </div>

      <MovimientosCliente cuentas={(cuentas ?? []) as never} categorias={(categorias ?? []) as never} />
    </div>
  );
}
