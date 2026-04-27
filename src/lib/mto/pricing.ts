import type { MtoCampo, MtoValores } from "@/types/mto";

/**
 * Suma todos los sobrecargos aplicables según los valores ingresados.
 * - Para texto/número: aplica `campo.precio_extra` si el campo está completado.
 * - Para select/talle: aplica `opcion.precio_extra` de la opción seleccionada.
 * No descuenta nada por valores vacíos o campos no encontrados.
 */
export function calcularPrecioExtra(
  campos: MtoCampo[],
  valores: MtoValores
): number {
  let extra = 0;

  for (const campo of campos) {
    const raw = valores[campo.key];
    const filled = raw !== undefined && raw !== null && raw !== "";
    if (!filled) continue;

    if (campo.tipo === "select" || campo.tipo === "talle") {
      const opcion = campo.opciones?.find((o) => o.valor === String(raw));
      if (opcion?.precio_extra) extra += opcion.precio_extra;
    } else if (campo.precio_extra) {
      extra += campo.precio_extra;
    }
  }

  return Math.round(extra * 100) / 100;
}

/**
 * Genera un resumen legible de la personalización para mostrar en el carrito,
 * pedido, emails, etc. Devuelve pares { label, valor } en el orden original
 * de los campos, omitiendo los vacíos.
 */
export function resumirPersonalizacion(
  campos: MtoCampo[],
  valores: MtoValores
): Array<{ key: string; label: string; valor: string }> {
  const resumen: Array<{ key: string; label: string; valor: string }> = [];

  for (const campo of campos) {
    const raw = valores[campo.key];
    if (raw === undefined || raw === null || raw === "") continue;

    let valorStr = String(raw);
    if (campo.tipo === "select" || campo.tipo === "talle") {
      const opcion = campo.opciones?.find((o) => o.valor === String(raw));
      if (opcion) valorStr = opcion.label;
    }

    resumen.push({ key: campo.key, label: campo.label, valor: valorStr });
  }

  return resumen;
}
