/**
 * Cuenta bancaria donde se cobran las ventas de la tienda (checkout web y
 * POS). En contabilidad es la 1.1.01.07 "Banco Itaú — tienda" (parámetro
 * `tienda/banco_cobros`). Si cambia la cuenta, se cambia acá y en ese
 * parámetro.
 */
export const CUENTA_COBRO_TIENDA = {
  banco: "Itaú",
  bancoCorto: "ITAU",
  cuenta: "9500100",
  titular: "Club Seminario",
} as const;

/** El texto menciona el banco de la cuenta de cobro. */
export function esBancoDeCobro(texto: string): boolean {
  return /ita[uú]/i.test(texto);
}
