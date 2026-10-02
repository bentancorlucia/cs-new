import { createComercialClient } from "@/lib/comercial/server";
import type { Metadata } from "next";
import { RecuentosLista, type RecuentoResumen } from "@/components/stock/recuentos-lista";
import { nombreUsuario, type EstadoRecuento } from "@/lib/comercial/stock";
import { leerPaginado } from "@/lib/contabilidad/reportes";
import { nombresUsuarios, permisosStock, type FilaRecuento, type FilaRecuentoItem } from "../_lib/extra";

export const metadata: Metadata = { title: "Recuentos" };
export const dynamic = "force-dynamic";

export default async function RecuentosPage() {
  const { puedeOperar } = await permisosStock();
  const com = await createComercialClient();
  const [rec, items] = await Promise.all([
    leerPaginado<FilaRecuento>((a, b) =>
      com.from("recuentos").select("*").order("created_at", { ascending: false }).range(a, b)
    ),
    leerPaginado<Pick<FilaRecuentoItem, "recuento_id" | "diferencia" | "valor">>((a, b) =>
      com.from("recuento_items").select("recuento_id, diferencia, valor").order("id").range(a, b)
    ),
  ]);
  const nombres = await nombresUsuarios(rec.filas.flatMap((r) => [r.creado_por, r.confirmado_por]));

  const porRecuento = new Map<number, { contados: number; faltante: number; sobrante: number; conDiferencia: number }>();
  for (const i of items.filas) {
    const t = porRecuento.get(i.recuento_id) ?? { contados: 0, faltante: 0, sobrante: 0, conDiferencia: 0 };
    t.contados++;
    const v = Number(i.valor ?? 0);
    if (v < 0) t.faltante -= v;
    if (v > 0) t.sobrante += v;
    if (i.diferencia) t.conDiferencia++;
    porRecuento.set(i.recuento_id, t);
  }

  const recuentos: RecuentoResumen[] = rec.filas.map((r) => ({
    id: r.id,
    numero: r.numero,
    estado: r.estado as EstadoRecuento,
    notas: r.notas,
    creado: r.created_at,
    creadoPor: nombreUsuario(r.creado_por, nombres),
    confirmado: r.confirmado_at,
    confirmadoPor: nombreUsuario(r.confirmado_por, nombres),
    asientoId: r.asiento_id,
    ...(porRecuento.get(r.id) ?? { contados: 0, faltante: 0, sobrante: 0, conDiferencia: 0 }),
  }));

  return <RecuentosLista recuentos={recuentos} puedeOperar={puedeOperar} verCostos={puedeOperar} error={rec.error ?? items.error} />;
}
