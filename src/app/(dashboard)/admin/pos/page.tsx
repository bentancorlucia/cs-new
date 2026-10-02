import { redirect } from "next/navigation";
import { permisosComercial } from "@/lib/comercial/server";
import { leerCatalogosCaja, leerEstadoCaja } from "@/lib/comercial/caja";
import { catalogoPos } from "./datos";
import { PosClient } from "./pos-client";

export const metadata = {
  title: "POS",
  description: "Punto de venta presencial con caja",
};

export const dynamic = "force-dynamic";

export default async function POSPage() {
  const { puedeOperar } = await permisosComercial();
  if (!puedeOperar) redirect("/login");

  const [catalogo, estado] = await Promise.all([catalogoPos(), leerEstadoCaja()]);
  const catalogos = await leerCatalogosCaja(estado.caja?.cuenta_id ?? null);

  return (
    <PosClient
      productosIniciales={catalogo.productos}
      categorias={catalogo.categorias}
      estadoInicial={estado}
      catalogosCaja={catalogos}
    />
  );
}
