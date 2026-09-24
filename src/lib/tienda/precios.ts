// Reglas de precio de la tienda, compartidas por cliente (carrito, POS) y
// servidor (checkout, POS, disciplinas). Cualquier cambio de regla va acá.

export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export interface ProductoPrecio {
  precio: number | string;
  precio_socio?: number | string | null;
}

/** Precio de lista unitario: override de la variante o precio del producto. */
export function precioListaUnitario(
  producto: ProductoPrecio,
  precioOverrideVariante?: number | string | null
): number {
  return round2(Number(precioOverrideVariante ?? producto.precio));
}

/**
 * Precio unitario para socios, o `null` si no hay beneficio de socio.
 *
 * El beneficio se define en el producto (`precio - precio_socio`) y se aplica
 * como monto fijo sobre el precio de la variante, así una variante con
 * recargo (ej. talle especial) conserva su recargo también para socios.
 * En variantes más baratas el descuento se acota al mismo porcentaje que el
 * del producto (nunca queda gratis).
 */
export function precioSocioUnitario(
  producto: ProductoPrecio,
  precioOverrideVariante?: number | string | null
): number | null {
  if (producto.precio_socio == null) return null;
  const precioBase = Number(producto.precio);
  const beneficio = precioBase - Number(producto.precio_socio);
  if (!(beneficio > 0) || !(precioBase > 0)) return null;
  const lista = precioListaUnitario(producto, precioOverrideVariante);
  const pisoProporcional = lista * (Number(producto.precio_socio) / precioBase);
  const socio = round2(Math.max(lista - beneficio, pisoProporcional));
  return socio < lista ? socio : null;
}

export type DescuentoManualTipo = "porcentaje" | "fijo";

/**
 * Descuento manual del POS sobre una base. El porcentaje se redondea al peso
 * (se cobra en efectivo); el fijo se acota a la base.
 */
export function calcularDescuentoManual(
  base: number,
  tipo: DescuentoManualTipo | null | undefined,
  valor: number | null | undefined
): number {
  const v = Number(valor) || 0;
  if (!tipo || v <= 0 || base <= 0) return 0;
  if (tipo === "porcentaje") {
    return Math.min(Math.round(base * (Math.min(v, 100) / 100)), base);
  }
  return round2(Math.min(v, base));
}
