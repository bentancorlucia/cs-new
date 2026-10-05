import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createSociosClient, permisosSocios } from "@/lib/socios/server";
import { listarDisciplinas } from "@/lib/socios/padron";
import { leerStaffClub } from "@/lib/socios/staff";
import { hoyUruguay } from "@/lib/contabilidad/formato";
import { PaginaStaff } from "@/components/socios/staff/pagina";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Staff" };

export default async function StaffPage() {
  const permisos = await permisosSocios();
  if (!permisos.puedeVer) redirect("/mi-cuenta");
  const db = await createSociosClient();
  const [staff, disciplinas] = await Promise.all([
    leerStaffClub(db).catch((e: unknown) => (e instanceof Error ? e : new Error("Error inesperado"))),
    listarDisciplinas().catch(() => []),
  ]);
  if (staff instanceof Error) {
    return (
      <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">No se pudo leer el staff: {staff.message}</div>
    );
  }
  return (
    <PaginaStaff
      staff={staff}
      disciplinas={disciplinas}
      // Secretaría gestiona todo; tesorería, el staff de las disciplinas (como en sus paneles).
      gestionaClub={permisos.puedeGestionar}
      gestionaDisciplinas={permisos.puedeGestionar || permisos.puedeTesoreria}
      hoy={hoyUruguay()}
    />
  );
}
