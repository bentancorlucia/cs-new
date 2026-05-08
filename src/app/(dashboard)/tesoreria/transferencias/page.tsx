import { createServerClient } from "@/lib/supabase/server";
import { getCotizacionVigente } from "@/lib/tesoreria/bcu";
import { TransferenciasCliente } from "@/components/tesoreria/transferencias-cliente";

export const dynamic = "force-dynamic";

export default async function TransferenciasPage() {
  const supabase = await createServerClient();
  const [{ data: cuentas }, cotizacion] = await Promise.all([
    supabase
      .from("cuentas_financieras")
      .select("id, nombre, moneda, color, saldo_actual")
      .eq("activa", true)
      .order("nombre", { ascending: true }),
    getCotizacionVigente(),
  ]);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-display text-2xl sm:text-3xl uppercase tracking-tightest text-foreground">
          Transferencias
        </h1>
        <p className="mt-1 text-sm text-muted-foreground font-body">
          Movimiento de fondos entre cuentas. Cuando cruzan monedas, se calcula el tipo de cambio
          automáticamente.
        </p>
      </div>
      <TransferenciasCliente cuentas={(cuentas ?? []) as never} cotizacion={cotizacion} />
    </div>
  );
}
