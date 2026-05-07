import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { createServerClient } from "@/lib/supabase/server";
import { ImportarExtractoCliente } from "@/components/tesoreria/importar-extracto-cliente";

export const dynamic = "force-dynamic";

export default async function ImportarPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createServerClient();
  const { data: cuenta } = await supabase
    .from("cuentas_financieras")
    .select("id, nombre, banco, moneda, tipo")
    .eq("id", Number(id))
    .single();

  if (!cuenta) notFound();
  if (cuenta.tipo !== "bancaria") {
    return (
      <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-amber-900">
        Solo cuentas bancarias admiten import de extracto.
      </div>
    );
  }

  return (
    <div className="space-y-5 max-w-4xl">
      <Link
        href={`/tesoreria/cuentas/${cuenta.id}`}
        className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" /> Volver a la cuenta
      </Link>

      <div>
        <h2 className="font-heading text-xl text-bordo-900">Importar extracto</h2>
        <p className="text-sm text-muted-foreground">
          {cuenta.nombre} · {cuenta.banco ?? cuenta.tipo} · {cuenta.moneda}
        </p>
      </div>

      <ImportarExtractoCliente cuentaId={cuenta.id} cuentaNombre={cuenta.nombre} />
    </div>
  );
}
