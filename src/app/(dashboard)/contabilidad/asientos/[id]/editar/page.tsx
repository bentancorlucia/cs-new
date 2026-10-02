import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { permisosContabilidad } from "@/lib/contabilidad/permisos";
import { formatFecha } from "@/lib/contabilidad/formato";
import {
  cargarCatalogosAsiento,
  lineasParaFormulario,
  obtenerAsientoDetalle,
  tcVigente,
} from "@/lib/contabilidad/asientos";
import { AsientoForm } from "@/components/contabilidad/asientos/asiento-form";
import { EncabezadoPagina } from "@/components/contabilidad/asientos/ui-asiento";

export const dynamic = "force-dynamic";

const RE_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function EditarAsientoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!RE_UUID.test(id)) notFound();

  const { puedeEscribir } = await permisosContabilidad();
  if (!puedeEscribir) redirect(`/contabilidad/asientos/${id}`);

  const asiento = await obtenerAsientoDetalle(id);
  if (!asiento) notFound();
  // Solo se editan borradores cargados a mano (o la apertura del primer ejercicio).
  if (asiento.estado !== "borrador" || (asiento.tipo !== "manual" && asiento.tipo !== "apertura")) {
    redirect(`/contabilidad/asientos/${id}`);
  }

  const lineas = lineasParaFormulario(asiento.lineas);
  const [catalogos, tc] = await Promise.all([
    cargarCatalogosAsiento({
      cuentas: lineas.map((l) => l.cuenta_id),
      centros: lineas.flatMap((l) => (l.centro_costo_id ? [l.centro_costo_id] : [])),
      proveedores: lineas.flatMap((l) => (l.proveedor_id !== null ? [l.proveedor_id] : [])),
      disciplinas: lineas.flatMap((l) => (l.disciplina_id !== null ? [l.disciplina_id] : [])),
    }),
    tcVigente(asiento.fecha),
  ]);
  const apertura = asiento.tipo === "apertura";

  return (
    <div className="space-y-5 pb-8">
      <Link
        href={`/contabilidad/asientos/${id}`}
        className="inline-flex items-center gap-1.5 text-xs text-muted-foreground transition-colors hover:text-bordo-800"
      >
        <ArrowLeft className="size-3.5" />
        Volver al asiento
      </Link>
      <EncabezadoPagina
        eyebrow="Borrador"
        titulo={apertura ? "Saldos iniciales" : "Editar asiento"}
        descripcion={
          apertura
            ? `Asiento de apertura${asiento.ejercicio ? ` de ${asiento.ejercicio}` : ""}, fechado el ${formatFecha(asiento.fecha)}.`
            : "Los cambios reemplazan el borrador. Al confirmarlo recibe número y ya no se puede editar."
        }
      />
      <AsientoForm
        tipo={apertura ? "apertura" : "manual"}
        catalogos={catalogos}
        inicial={{ id: asiento.id, fecha: asiento.fecha, descripcion: asiento.descripcion, lineas }}
        fechaInicial={asiento.fecha}
        fechaFija={apertura ? asiento.fecha : undefined}
        tcInicial={tc}
      />
    </div>
  );
}
