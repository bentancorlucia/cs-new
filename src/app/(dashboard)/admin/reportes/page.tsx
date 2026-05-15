import { ReportesCliente } from "@/components/tienda/reportes-cliente";

export const dynamic = "force-dynamic";

export default function ReportesPage() {
  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-display text-2xl sm:text-3xl uppercase tracking-tightest text-foreground">
          Reportes
        </h1>
        <p className="mt-1 text-sm text-muted-foreground font-body">
          Tienda, donaciones y promocodes. Rango de fechas editable, exportable a PDF y Excel.
        </p>
      </div>
      <ReportesCliente />
    </div>
  );
}
