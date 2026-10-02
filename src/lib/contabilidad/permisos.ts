import { getUserRoles } from "@/lib/supabase/roles";

export const ROLES_LECTURA = ["super_admin", "tesorero", "comision_fiscal"];
export const ROLES_ESCRITURA = ["super_admin", "tesorero"];

export async function permisosContabilidad() {
  const roles = await getUserRoles();
  return {
    roles,
    puedeLeer: roles.some((r) => ROLES_LECTURA.includes(r)),
    puedeEscribir: roles.some((r) => ROLES_ESCRITURA.includes(r)),
  };
}

/** Para Server Actions: corta antes de llegar a la base. La base vuelve a validar. */
export async function exigirEscritura() {
  const { puedeEscribir } = await permisosContabilidad();
  if (!puedeEscribir) {
    throw new Error("No autorizado: requiere rol tesorero");
  }
}
