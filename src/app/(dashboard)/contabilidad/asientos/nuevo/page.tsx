import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { permisosContabilidad } from "@/lib/contabilidad/permisos";
import { formatFecha, hoyUruguay } from "@/lib/contabilidad/formato";
import {
  cargarCatalogosAsiento,
  esFechaIso,
  estadoAperturaInicial,
  tcVigente,
} from "@/lib/contabilidad/asientos";
import { AsientoForm } from "@/components/contabilidad/asientos/asiento-form";
import { EncabezadoPagina } from "@/components/contabilidad/asientos/ui-asiento";
import { AvisoSimple } from "@/components/contabilidad/asientos/aviso-simple";

export const dynamic = "force-dynamic";

export default async function NuevoAsientoPage({
  searchParams,
}: {
  searchParams: Promise<{ tipo?: string; fecha?: string }>;
}) {
  const { puedeEscribir } = await permisosContabilidad();
  if (!puedeEscribir) redirect("/contabilidad/asientos");

  const sp = await searchParams;
  const apertura = sp.tipo === "apertura";
  let fecha = esFechaIso(sp.fecha) ? sp.fecha : hoyUruguay();
  let ejercicioNombre: string | null = null;

  if (apertura) {
    const estado = await estadoAperturaInicial();
    if (!estado) {
      return (
        <AvisoSimple
          titulo="Todavía no hay ejercicios"
          texto="Para cargar los saldos iniciales primero creá el ejercicio contable."
          href="/contabilidad/ejercicios"
          accion="Ir a ejercicios"
        />
      );
    }
    if (estado.apertura) {
      redirect(
        estado.apertura.estado === "borrador"
          ? `/contabilidad/asientos/${estado.apertura.id}/editar`
          : `/contabilidad/asientos/${estado.apertura.id}`
      );
    }
    if (estado.ejercicio.estado !== "abierto") {
      return (
        <AvisoSimple
          titulo="El ejercicio está cerrado"
          texto={`${estado.ejercicio.nombre} ya está cerrado: no se le pueden cargar saldos iniciales.`}
          href="/contabilidad/ejercicios"
          accion="Ir a ejercicios"
        />
      );
    }
    fecha = estado.ejercicio.fecha_inicio;
    ejercicioNombre = estado.ejercicio.nombre;
  }

  const [catalogos, tc] = await Promise.all([cargarCatalogosAsiento(), tcVigente(fecha)]);

  return (
    <div className="space-y-5 pb-8">
      <Link
        href="/contabilidad/asientos"
        className="inline-flex items-center gap-1.5 text-xs text-muted-foreground transition-colors hover:text-bordo-800"
      >
        <ArrowLeft className="size-3.5" />
        Libro diario
      </Link>
      <EncabezadoPagina
        eyebrow={apertura ? "Apertura" : "Libro diario"}
        titulo={apertura ? "Saldos iniciales" : "Nuevo asiento"}
        descripcion={
          apertura
            ? `Asiento de apertura de ${ejercicioNombre}, fechado el ${formatFecha(fecha)}. Cargá el saldo de cada cuenta de activo, pasivo y patrimonio.`
            : "Cargá las líneas: el debe y el haber tienen que sumar lo mismo para confirmar."
        }
      />
      <AsientoForm
        tipo={apertura ? "apertura" : "manual"}
        catalogos={catalogos}
        fechaInicial={fecha}
        fechaFija={apertura ? fecha : undefined}
        tcInicial={tc}
      />
    </div>
  );
}
