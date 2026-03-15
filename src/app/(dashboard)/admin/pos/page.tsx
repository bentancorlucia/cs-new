import { redirect } from "next/navigation";
import { getUserRoles } from "@/lib/supabase/roles";
import { POSClient } from "./pos-client";

export const metadata = {
  title: "POS — Club Seminario",
  description: "Punto de venta presencial",
};

export default async function POSPage() {
  const roles = await getUserRoles();
  const hasAccess =
    roles.includes("super_admin") || roles.includes("tienda");

  if (!hasAccess) {
    redirect("/login");
  }

  return <POSClient />;
}
