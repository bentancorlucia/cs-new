import { redirect } from "next/navigation";
import { permisosContabilidad } from "@/lib/contabilidad/permisos";

export default async function ContabilidadLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { puedeLeer } = await permisosContabilidad();
  if (!puedeLeer) {
    redirect("/mi-cuenta");
  }

  return <div className="space-y-6">{children}</div>;
}
