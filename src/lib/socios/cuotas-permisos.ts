import { permisosSocios } from "./server";

/**
 * Permisos de la sección Cuotas y cobranza:
 *  - puedeVer: leer el padrón y sus cuotas (secretaría, tesorería y Comisión Fiscal).
 *  - puedeCobrar: registrar cobros (tesorería).
 *  - puedeTesoreria: emitir, anular, débito, notas de crédito, liquidaciones, configuración.
 *  - verTesoreria: entrar a Cuotas de socios (tesorería y Comisión Fiscal, esta sin botones de escritura).
 */
export async function permisosCuotas() {
  const p = await permisosSocios();
  return {
    ...p,
    verTesoreria: p.puedeTesoreria || p.roles.includes("comision_fiscal"),
  };
}

export type PermisosCuotas = Awaited<ReturnType<typeof permisosCuotas>>;
