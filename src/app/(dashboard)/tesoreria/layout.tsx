import { redirect } from "next/navigation";
import { getUserRoles } from "@/lib/supabase/roles";
import { CotizacionBadge } from "@/components/tesoreria/cotizacion-badge";

const ROLES = ["super_admin", "tesorero"];

export default async function TesoreriaLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const roles = await getUserRoles();
  if (!roles.some((r) => ROLES.includes(r))) {
    redirect("/mi-cuenta");
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-end">
        <CotizacionBadge />
      </div>
      {children}
    </div>
  );
}
