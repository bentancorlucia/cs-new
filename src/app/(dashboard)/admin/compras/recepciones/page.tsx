import type { Metadata } from "next";
import { listarRecepciones, permisosCompras } from "@/lib/comercial/compras";
import { RecepcionesLista } from "@/components/compras/recepciones";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Recepciones" };

export default async function RecepcionesPage() {
  const [permisos, recepciones] = await Promise.all([permisosCompras(), listarRecepciones()]);
  return <RecepcionesLista recepciones={recepciones} puedeOperar={permisos.puedeOperar} />;
}
