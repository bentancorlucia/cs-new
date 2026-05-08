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
        <h1 className="font-display text-2xl sm:text-3xl uppercase tracking-tightest text-foreground">
          Movimientos
        </h1>
        <p className="mt-1 text-sm text-muted-foreground font-body">
          Vista consolidada de todos los movimientos. Clasificá los que vienen de extractos importados.
        </p>
      </div>

      <MovimientosCliente cuentas={(cuentas ?? []) as never} categorias={(categorias ?? []) as never} />
    </div>
  );
}
