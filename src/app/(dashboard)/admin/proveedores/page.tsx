import type { Metadata } from "next";
import {
  cargarCatalogoContable,
  diferenciasControl,
  listarProveedores,
  permisosCompras,
} from "@/lib/comercial/compras";
import { ProveedoresLista } from "@/components/compras/proveedores-lista";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Proveedores" };

export default async function ProveedoresPage() {
  const [permisos, proveedores, control, catalogo] = await Promise.all([
    permisosCompras(),
    listarProveedores(),
    diferenciasControl(),
    cargarCatalogoContable(),
  ]);
  return (
    <ProveedoresLista
      proveedores={proveedores}
      diferencias={control.diferencias}
      errorControl={control.error}
      catalogo={catalogo}
      puedeOperar={permisos.puedeOperar}
    />
  );
}
