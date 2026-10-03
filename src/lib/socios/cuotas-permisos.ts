import { permisosSocios } from "./server";

/**
 * Permisos de la sección Cuotas y cobranza:
 *  - puedeVer: secretaría, tesorería y Comisión Fiscal.
 *  - puedeCobrar: registrar cobros (secretaría y tesorería).
 *  - puedeTesoreria: emitir, anular, débito, notas de crédito, liquidaciones, configuración.
 *  - verTesoreria: ver las pantallas de tesorería (tesorería y Comisión Fiscal, sin botones de escritura).
 */
export async function permisosCuotas() {
  const p = await permisosSocios();
  return {
    ...p,
    verTesoreria: p.puedeTesoreria || p.roles.includes("comision_fiscal"),
  };
}

export type PermisosCuotas = Awaited<ReturnType<typeof permisosCuotas>>;
