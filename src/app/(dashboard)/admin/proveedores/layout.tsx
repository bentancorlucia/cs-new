import { redirect } from "next/navigation";
import { permisosCompras } from "@/lib/comercial/compras";
import { NavCompras } from "@/components/compras/nav-compras";

export default async function ProveedoresLayout({ children }: { children: React.ReactNode }) {
  const { puedeVer } = await permisosCompras();
  if (!puedeVer) redirect("/mi-cuenta");
  return (
    <div className="space-y-5 pb-8">
      <NavCompras />
      {children}
    </div>
  );
}
