import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { createContabilidadClient } from "@/lib/contabilidad/server";
import { permisosContabilidad } from "@/lib/contabilidad/permisos";
import { hoyUruguay } from "@/lib/contabilidad/formato";
import { sumarDias } from "@/lib/contabilidad/conciliacion";
import { EncabezadoPagina } from "@/components/contabilidad/asientos/ui-asiento";
import { AvisoSimple } from "@/components/contabilidad/asientos/aviso-simple";
import { ImportarExtracto } from "@/components/contabilidad/conciliacion/importar-extracto";

export const dynamic = "force-dynamic";

export default async function ImportarExtractoPage({
  searchParams,
}: {
  searchParams: Promise<{ cuenta?: string }>;
}) {
  const [{ puedeEscribir }, sp] = await Promise.all([permisosContabilidad(), searchParams]);
  if (!puedeEscribir) redirect("/contabilidad/conciliacion");
  if (!sp.cuenta || !/^[0-9a-f-]{36}$/i.test(sp.cuenta)) redirect("/contabilidad/conciliacion");

  const db = await createContabilidadClient();
  const [{ data: cuenta }, { data: ultimo }] = await Promise.all([
    db
      .from("cuentas")
      .select("id, codigo, nombre, moneda, imputable, es_disponibilidad, activa")
      .eq("id", sp.cuenta)
      .maybeSingle(),
    db
      .from("extractos")
      .select("id, fecha_desde, fecha_hasta, saldo_final, estado")
      .eq("cuenta_id", sp.cuenta)
      .order("fecha_hasta", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  if (!cuenta || !cuenta.es_disponibilidad || !cuenta.imputable) {
    return (
      <AvisoSimple
        titulo="Cuenta no válida"
        texto="Los extractos se cargan sobre una cuenta imputable de caja o banco."
        href="/contabilidad/conciliacion"
        accion="Volver a conciliación"
      />
    );
  }

  return (
    <div className="space-y-5 pb-8">
      <Link
        href={`/contabilidad/conciliacion?cuenta=${cuenta.id}`}
        className="inline-flex items-center gap-1.5 text-xs text-muted-foreground transition-colors hover:text-bordo-800"
      >
        <ArrowLeft className="size-3.5" />
        Conciliación bancaria
      </Link>
      <EncabezadoPagina
        eyebrow={`${cuenta.codigo} · ${cuenta.nombre}`}
        titulo="Importar extracto"
        descripcion="Subí el CSV del banco o cargá los movimientos a mano. Antes de guardar se verifica que el extracto cierre."
      />
      <ImportarExtracto
        cuenta={{
          id: cuenta.id,
          codigo: cuenta.codigo,
          nombre: cuenta.nombre,
          moneda: cuenta.moneda?.trim() || null,
        }}
        anterior={
          ultimo
            ? {
                id: ultimo.id,
                fechaDesde: ultimo.fecha_desde,
                fechaHasta: ultimo.fecha_hasta,
                saldoFinal: Number(ultimo.saldo_final),
                proximoDesde: sumarDias(ultimo.fecha_hasta, 1),
              }
            : null
        }
        hoy={hoyUruguay()}
      />
    </div>
  );
}
