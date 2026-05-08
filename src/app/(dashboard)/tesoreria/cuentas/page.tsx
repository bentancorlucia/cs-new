import Link from "next/link";
import { Plus } from "lucide-react";
import { createServerClient } from "@/lib/supabase/server";
import { getCotizacionVigente } from "@/lib/tesoreria/bcu";
import { CuentasGrid } from "@/components/tesoreria/cuentas-grid";

export const dynamic = "force-dynamic";

export default async function CuentasPage() {
  const supabase = await createServerClient();
  const [{ data: cuentas }, cotizacion] = await Promise.all([
    supabase
      .from("cuentas_financieras")
      .select("id, nombre, tipo, moneda, banco, numero_cuenta, titular, descripcion, saldo_actual, saldo_inicial, color, modulo")
      .eq("activa", true)
      .order("tipo", { ascending: true })
      .order("nombre", { ascending: true }),
    getCotizacionVigente(),
  ]);

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="font-display text-2xl sm:text-3xl uppercase tracking-tightest text-foreground">
            Cuentas
          </h1>
          <p className="mt-1 text-sm text-muted-foreground font-body">
            Cuentas bancarias ITAÚ y caja chica. Cliquea para ver movimientos e importar extractos.
          </p>
        </div>
        <Link
          href="/tesoreria/cuentas/nueva"
          className="inline-flex items-center gap-2 rounded-full bg-bordo-800 text-white text-sm font-medium px-4 py-2 hover:bg-bordo-900 transition-colors"
        >
          <Plus className="size-4" /> Nueva cuenta
        </Link>
      </div>

      <CuentasGrid cuentas={(cuentas ?? []) as never} cotizacion={cotizacion} />
    </div>
  );
}
