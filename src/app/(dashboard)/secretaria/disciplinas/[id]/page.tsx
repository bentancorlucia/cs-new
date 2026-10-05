import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { createServerClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createSociosClient } from "@/lib/socios/server";
import { createContabilidadClient } from "@/lib/contabilidad/server";
import { permisosCuotas } from "@/lib/socios/cuotas-permisos";
import { cuentasDisponibilidad, cuentasPorDefecto } from "@/lib/socios/cuotas";
import {
  cuentaCorrienteDisciplina,
  leerFichaDisciplina,
  liquidacionesDeDisciplina,
  pagosDisciplina,
  pedidosDeDisciplina,
  planesPagoDisciplina,
  sociosDeDisciplina,
} from "@/lib/socios/disciplinas";
import { leerCambiosDebito, leerRepresentantes, type CambioDebito, type Representante } from "@/lib/socios/cambios-debito";
import { hoyUruguay } from "@/lib/contabilidad/formato";
import { DetalleDisciplina, type DatosTesoreria, type Pestana } from "@/components/socios/disciplinas/detalle";

export const dynamic = "force-dynamic";

type Params = Promise<{ id: string }>;
type SearchParams = Promise<Record<string, string | string[] | undefined>>;

const PESTANAS: Pestana[] = ["resumen", "cuenta", "planes", "socios", "representantes", "cambios"];

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { id } = await params;
  const n = Number(id);
  if (!Number.isInteger(n) || n <= 0) return { title: "Disciplina" };
  const ficha = await leerFichaDisciplina(await createServerClient(), n).catch(() => null);
  return { title: ficha?.nombre ?? "Disciplina" };
}

export default async function DisciplinaPage({ params, searchParams }: { params: Params; searchParams: SearchParams }) {
  const permisos = await permisosCuotas();
  if (!permisos.puedeVer) redirect("/mi-cuenta");
  const { id } = await params;
  const disciplinaId = Number(id);
  if (!Number.isInteger(disciplinaId) || disciplinaId <= 0) notFound();
  const sp = await searchParams;
  const pedida = typeof sp.tab === "string" ? (sp.tab as Pestana) : "resumen";

  const hoy = hoyUruguay();
  const [padron, so] = await Promise.all([createServerClient(), createSociosClient()]);
  const ficha = await leerFichaDisciplina(padron, disciplinaId);
  if (!ficha) notFound();

  let socios = null;
  let errorSocios: string | null = null;
  try {
    socios = await sociosDeDisciplina(so, padron, disciplinaId, hoy);
  } catch (e) {
    errorSocios = e instanceof Error ? e.message : "error inesperado";
  }

  // Representantes y registro de cambios: los leen secretaría, tesorería y Comisión Fiscal.
  const [representantes, cambios] = await Promise.all([
    leerRepresentantes(so, disciplinaId).then(
      (datos): { datos: Representante[]; error: string | null } => ({ datos, error: null }),
      (e: unknown) => ({ datos: [], error: e instanceof Error ? e.message : "error inesperado" })
    ),
    leerCambiosDebito(so, { disciplina: disciplinaId }).then(
      (datos): { datos: CambioDebito[]; error: string | null } => ({ datos, error: null }),
      (e: unknown) => ({ datos: [], error: e instanceof Error ? e.message : "error inesperado" })
    ),
  ]);

  let tesoreria: DatosTesoreria | null = null;
  let errorTesoreria: string | null = null;
  if (permisos.verTesoreria) {
    try {
      const conta = await createContabilidadClient();
      // Los pedidos no los ve la tesorería por RLS: se leen con el cliente de
      // servicio, ya validado el permiso (verTesoreria).
      const admin = createAdminClient();
      const [movimientos, planes, liquidaciones, pedidos, cuentas, defecto] = await Promise.all([
        cuentaCorrienteDisciplina(so, disciplinaId),
        planesPagoDisciplina(so, disciplinaId, hoy),
        liquidacionesDeDisciplina(so, padron, disciplinaId),
        pedidosDeDisciplina(admin, so, disciplinaId),
        cuentasDisponibilidad(conta),
        cuentasPorDefecto(conta),
      ]);
      const pagos = await pagosDisciplina(so, disciplinaId, planes);
      tesoreria = { movimientos, planes, liquidaciones, pedidos, pagos, cuentas, cuentaDefecto: defecto.banco };
    } catch (e) {
      errorTesoreria = e instanceof Error ? e.message : "error inesperado";
    }
  }

  const disponibles = PESTANAS.filter((p) => permisos.verTesoreria || (p !== "cuenta" && p !== "planes"));
  const pestana = disponibles.includes(pedida) ? pedida : "resumen";

  return (
    <DetalleDisciplina
      key={disciplinaId}
      disciplina={{
        id: ficha.id,
        nombre: ficha.nombre,
        slug: ficha.slug,
        descripcion: ficha.descripcion,
        imagen_url: ficha.imagen_url,
        contacto_nombre: ficha.contacto_nombre,
        contacto_telefono: ficha.contacto_telefono,
        contacto_email: ficha.contacto_email,
        activa: ficha.activa ?? true,
      }}
      socios={socios}
      errorSocios={errorSocios}
      tesoreria={tesoreria}
      errorTesoreria={errorTesoreria}
      pestanaInicial={pestana}
      hoy={hoy}
      puedeGestionar={permisos.puedeGestionar}
      verTesoreria={permisos.verTesoreria}
      puedeTesoreria={permisos.puedeTesoreria}
      representantes={representantes.datos}
      errorRepresentantes={representantes.error}
      cambios={cambios.datos}
      errorCambios={cambios.error}
      puedeEditarRepresentantes={permisos.puedeGestionar || permisos.puedeTesoreria}
    />
  );
}
