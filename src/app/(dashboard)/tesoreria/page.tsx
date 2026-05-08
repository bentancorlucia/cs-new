import Link from "next/link";
import { ArrowRight, Wallet, ArrowLeftRight, BarChart3, FileSpreadsheet, Tag } from "lucide-react";
import { createServerClient } from "@/lib/supabase/server";
import { getCotizacionVigente } from "@/lib/tesoreria/bcu";
import { convertir, formatearMoneda } from "@/lib/tesoreria/conversion";

export const dynamic = "force-dynamic";

export default async function TesoreriaHome() {
  const supabase = await createServerClient();
  const [cotizacion, { data: cuentas }, { count: sinClasificar }] = await Promise.all([
    getCotizacionVigente(),
    supabase
      .from("cuentas_financieras")
      .select("id, nombre, moneda, saldo_actual, color, banco, tipo")
      .eq("activa", true)
      .eq("incluir_en_tesoreria", true),
    supabase
      .from("movimientos_financieros")
      .select("id", { count: "exact", head: true })
      .eq("clasificado", false),
  ]);

  let totalUYU = 0;
  let totalUSD = 0;
  for (const c of cuentas ?? []) {
    const saldo = Number(c.saldo_actual);
    if (c.moneda === "UYU") {
      totalUYU += saldo;
      const usd = convertir(saldo, "UYU", "USD", cotizacion);
      if (usd !== null) totalUSD += usd;
    } else {
      totalUSD += saldo;
      const uyu = convertir(saldo, "USD", "UYU", cotizacion);
      if (uyu !== null) totalUYU += uyu;
    }
  }

  const accesos = [
    { href: "/tesoreria/cuentas", label: "Cuentas", icon: Wallet, desc: "Saldos, importar extracto" },
    { href: "/tesoreria/movimientos", label: "Movimientos", icon: ArrowLeftRight, desc: "Clasificar y anotar" },
    { href: "/tesoreria/categorias", label: "Categorías", icon: Tag, desc: "Ingresos y egresos" },
    { href: "/tesoreria/transferencias", label: "Transferencias", icon: ArrowLeftRight, desc: "Entre cuentas" },
    { href: "/tesoreria/presupuesto", label: "Presupuesto", icon: BarChart3, desc: "Anual, semestral, mensual" },
    { href: "/tesoreria/reportes", label: "Reportes", icon: FileSpreadsheet, desc: "Panorama y proyecciones" },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl sm:text-3xl uppercase tracking-tightest text-foreground">
          Resumen
        </h1>
        <p className="mt-1 text-sm text-muted-foreground font-body">
          Saldos consolidados y accesos rápidos a los módulos financieros.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <KpiCard
          label="Total consolidado UYU"
          valor={formatearMoneda(totalUYU, "UYU")}
          sub={`≈ ${formatearMoneda(totalUSD, "USD")}`}
        />
        <KpiCard
          label="Total consolidado USD"
          valor={formatearMoneda(totalUSD, "USD")}
          sub={`≈ ${formatearMoneda(totalUYU, "UYU")}`}
        />
        <KpiCard
          label="Movimientos sin clasificar"
          valor={(sinClasificar ?? 0).toString()}
          sub={sinClasificar ? "Pendientes de categorizar" : "Todo clasificado 🎉"}
          highlight={!!sinClasificar}
        />
      </div>

      <div>
        <h2 className="font-heading text-lg text-bordo-900 mb-3">Módulos</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {accesos.map(({ href, label, icon: Icon, desc }) => (
            <Link
              key={href}
              href={href}
              className="group rounded-2xl border border-linea bg-white p-4 hover:border-bordo-200 hover:shadow-card transition-all"
            >
              <div className="flex items-center justify-between">
                <div className="flex size-9 items-center justify-center rounded-full bg-bordo-50 text-bordo-700">
                  <Icon className="size-4" />
                </div>
                <ArrowRight className="size-4 text-muted-foreground group-hover:text-bordo-700 group-hover:translate-x-1 transition-all" />
              </div>
              <div className="mt-3 font-heading text-base text-foreground">{label}</div>
              <div className="text-xs text-muted-foreground">{desc}</div>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}

function KpiCard({
  label,
  valor,
  sub,
  highlight,
}: {
  label: string;
  valor: string;
  sub: string;
  highlight?: boolean;
}) {
  return (
    <div className={`rounded-2xl border bg-white p-5 ${highlight ? "border-amber-200 bg-amber-50/40" : "border-linea"}`}>
      <div className="text-xs uppercase tracking-editorial text-muted-foreground font-heading">
        {label}
      </div>
      <div className="font-heading text-2xl text-foreground mt-1 tabular-nums">{valor}</div>
      <div className="text-xs text-muted-foreground mt-1">{sub}</div>
    </div>
  );
}
