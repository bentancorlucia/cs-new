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
        <h2 className="font-heading text-xl text-bordo-900">Transferencias</h2>
        <p className="text-sm text-muted-foreground">
          Movimiento de fondos entre cuentas. Cuando cruzan monedas, se calcula el tipo de cambio
          automáticamente.
        </p>
      </div>
      <TransferenciasCliente cuentas={(cuentas ?? []) as never} cotizacion={cotizacion} />
    </div>
  );
}
