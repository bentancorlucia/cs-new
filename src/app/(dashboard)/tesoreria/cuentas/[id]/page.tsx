import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Upload } from "lucide-react";
import { createServerClient } from "@/lib/supabase/server";
import { formatearMoneda, type Moneda } from "@/lib/tesoreria/conversion";
import { CuentaDetalleClient } from "@/components/tesoreria/cuenta-detalle-client";

export const dynamic = "force-dynamic";

export default async function CuentaDetallePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createServerClient();

  const { data: cuenta } = await supabase
    .from("cuentas_financieras")
    .select("*")
    .eq("id", Number(id))
    .single();

  if (!cuenta) notFound();

  const [{ data: movimientos }, { data: categorias }] = await Promise.all([
    supabase
      .from("movimientos_financieros")
      .select(
        "*, categorias_financieras!movimientos_financieros_categoria_id_fkey(id, nombre, slug, color, tipo)"
      )
      .eq("cuenta_id", cuenta.id)
      .order("fecha", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(200),
    supabase
      .from("categorias_financieras")
      .select("id, nombre, slug, tipo, padre_id, color")
      .eq("activa", true)
      .order("tipo", { ascending: true })
      .order("nombre", { ascending: true }),
  ]);

  const saldo = Number(cuenta.saldo_actual);
  const moneda = cuenta.moneda as Moneda;
  const esBancaria = cuenta.tipo === "bancaria";
  const sinClasificar = ((movimientos ?? []) as Array<{ clasificado: boolean }>).filter((m) => !m.clasificado).length;

  return (
    <div className="space-y-5">
      <Link
        href="/tesoreria/cuentas"
        className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" />
        Volver a cuentas
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-xs uppercase tracking-editorial text-muted-foreground font-heading">
            {cuenta.banco ?? cuenta.tipo}
          </div>
          <h1 className="font-display text-2xl sm:text-3xl uppercase tracking-tightest text-foreground">
            {cuenta.nombre}
          </h1>
          {cuenta.numero_cuenta && (
            <p className="mt-1 text-sm text-muted-foreground font-body">N° {cuenta.numero_cuenta}</p>
          )}
        </div>
        <div className="text-right">
          <div className="text-xs uppercase tracking-editorial text-muted-foreground font-heading">
            Saldo actual
          </div>
          <div className="font-heading text-3xl text-foreground tabular-nums">
            {formatearMoneda(saldo, moneda)}
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        {esBancaria && (
          <Link
            href={`/tesoreria/cuentas/${cuenta.id}/importar`}
            className="inline-flex items-center gap-2 rounded-full bg-bordo-800 text-white text-sm font-medium px-4 py-2 hover:bg-bordo-900 transition-colors"
          >
            <Upload className="size-4" /> Importar extracto ITAÚ
          </Link>
        )}
        {sinClasificar > 0 && (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 text-amber-800 text-xs font-medium px-3 py-1.5 border border-amber-200">
            <span className="size-1.5 rounded-full bg-amber-500 animate-pulse" />
            {sinClasificar} sin clasificar
          </span>
        )}
      </div>

      <CuentaDetalleClient
        cuentaId={cuenta.id}
        cuentaMoneda={moneda}
        movimientosIniciales={(movimientos ?? []) as never}
        categorias={(categorias ?? []) as never}
      />
    </div>
  );
}
