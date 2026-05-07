import { ReportesCliente } from "@/components/tesoreria/reportes-cliente";

export const dynamic = "force-dynamic";

export default function ReportesPage() {
  return (
    <div className="space-y-5">
      <div>
        <h2 className="font-heading text-xl text-bordo-900">Reportes</h2>
        <p className="text-sm text-muted-foreground">
          Panorama actual, proyecciones y comparación histórica del club.
        </p>
      </div>
      <ReportesCliente />
    </div>
  );
}
