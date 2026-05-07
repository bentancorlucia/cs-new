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
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-heading text-2xl text-bordo-900">Tesorería</h1>
          <p className="text-sm text-muted-foreground">
            Cuentas, movimientos, presupuesto y reportes financieros del club.
          </p>
        </div>
        <CotizacionBadge />
      </div>
      {children}
    </div>
  );
}
