import { permisosContabilidad } from "@/lib/contabilidad/permisos";
import { hoyUruguay } from "@/lib/contabilidad/formato";
import {
  estadoAperturaInicial,
  leerFiltros,
  listarLibroDiario,
  POR_PAGINA,
  totalesLibro,
} from "@/lib/contabilidad/asientos";
import { LibroDiario } from "@/components/contabilidad/asientos/libro-diario";

export const dynamic = "force-dynamic";

export default async function LibroDiarioPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const filtros = leerFiltros(await searchParams);

  const [{ puedeEscribir }, lista, totales, apertura] = await Promise.all([
    permisosContabilidad(),
    listarLibroDiario(filtros),
    totalesLibro(filtros).catch(() => null),
    estadoAperturaInicial(),
  ]);

  // Acceso a los saldos iniciales: solo el primer ejercicio (sin anterior),
  // abierto y sin asiento de apertura confirmado.
  let ctaApertura: { href: string; continuar: boolean; ejercicio: string } | null = null;
  if (puedeEscribir && apertura && apertura.ejercicio.estado === "abierto") {
    if (!apertura.apertura) {
      ctaApertura = {
        href: "/contabilidad/asientos/nuevo?tipo=apertura",
        continuar: false,
        ejercicio: apertura.ejercicio.nombre,
      };
    } else if (apertura.apertura.estado === "borrador") {
      ctaApertura = {
        href: `/contabilidad/asientos/${apertura.apertura.id}/editar`,
        continuar: true,
        ejercicio: apertura.ejercicio.nombre,
      };
    }
  }

  return (
    <LibroDiario
      asientos={lista.asientos}
      total={lista.total}
      error={lista.error}
      filtros={filtros}
      porPagina={POR_PAGINA}
      totales={totales}
      puedeEscribir={puedeEscribir}
      ctaApertura={ctaApertura}
      hoy={hoyUruguay()}
    />
  );
}
