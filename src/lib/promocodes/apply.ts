import type { Promocode } from "./schemas";

export interface ApplyItem {
  precio: number;
  precioSocio?: number | null;
  precioExtra?: number;
  cantidad: number;
}

export interface ApplyResult {
  /** Subtotal aplicado (al precio que efectivamente se cobra: socio o normal). */
  subtotal: number;
  /** Subtotal a precio normal — útil para mostrar ahorro total al usuario. */
  subtotalNominal: number;
  /** Descuento por promocode aplicado sobre `subtotal`. */
  descuento: number;
  /** Total final a pagar (`subtotal - descuento`). */
  total: number;
  /** Si los items se cobraron a precio_socio. */
  aplicoPrecioSocio: boolean;
  /** Si efectivamente se aplicó el descuento del promocode. */
  aplicoPromocode: boolean;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function calcularDescuento(promo: Promocode, base: number): number {
  if (promo.tipo_descuento === "porcentaje") {
    return round2(base * (Number(promo.valor) / 100));
  }
  return Math.min(round2(Number(promo.valor)), base);
}

function subtotalAt(items: ApplyItem[], usarSocio: boolean): number {
  return round2(
    items.reduce((sum, i) => {
      const precioBase =
        usarSocio && i.precioSocio != null && i.precioSocio < i.precio
          ? Number(i.precioSocio)
          : Number(i.precio);
      return sum + (precioBase + Number(i.precioExtra ?? 0)) * i.cantidad;
    }, 0)
  );
}

/**
 * Calcula el cobro final dado un carrito, condición de socio y un promocode opcional.
 *
 * Reglas:
 * - Sin promo: si es socio se aplica precio_socio (cuando hay).
 * - Promo no-socio: descuento sobre subtotal a precio normal.
 * - Promo + socio + acumulable: descuento sobre subtotal a precio socio.
 * - Promo + socio + no-acumulable: se elige el menor entre (precio socio sin código) y (precio normal con código).
 */
export function aplicarPromocode(params: {
  items: ApplyItem[];
  esSocio: boolean;
  promo: Promocode | null;
}): ApplyResult {
  const { items, esSocio, promo } = params;

  const subtotalNormal = subtotalAt(items, false);
  const subtotalSocio = subtotalAt(items, true);

  if (!promo) {
    const aplicoSocio = esSocio && subtotalSocio < subtotalNormal;
    const subtotal = aplicoSocio ? subtotalSocio : subtotalNormal;
    return {
      subtotal,
      subtotalNominal: subtotalNormal,
      descuento: 0,
      total: subtotal,
      aplicoPrecioSocio: aplicoSocio,
      aplicoPromocode: false,
    };
  }

  if (!esSocio) {
    const descuento = calcularDescuento(promo, subtotalNormal);
    return {
      subtotal: subtotalNormal,
      subtotalNominal: subtotalNormal,
      descuento,
      total: Math.max(0, round2(subtotalNormal - descuento)),
      aplicoPrecioSocio: false,
      aplicoPromocode: true,
    };
  }

  if (promo.acumulable_con_precio_socio) {
    const aplicoSocio = subtotalSocio < subtotalNormal;
    const baseSubtotal = aplicoSocio ? subtotalSocio : subtotalNormal;
    const descuento = calcularDescuento(promo, baseSubtotal);
    return {
      subtotal: baseSubtotal,
      subtotalNominal: subtotalNormal,
      descuento,
      total: Math.max(0, round2(baseSubtotal - descuento)),
      aplicoPrecioSocio: aplicoSocio,
      aplicoPromocode: true,
    };
  }

  // Socio + no-acumulable: best price
  const totalConSocio = subtotalSocio;
  const descCodigo = calcularDescuento(promo, subtotalNormal);
  const totalConCodigo = Math.max(0, round2(subtotalNormal - descCodigo));

  if (totalConSocio <= totalConCodigo) {
    return {
      subtotal: subtotalSocio,
      subtotalNominal: subtotalNormal,
      descuento: 0,
      total: subtotalSocio,
      aplicoPrecioSocio: true,
      aplicoPromocode: false,
    };
  }

  return {
    subtotal: subtotalNormal,
    subtotalNominal: subtotalNormal,
    descuento: descCodigo,
    total: totalConCodigo,
    aplicoPrecioSocio: false,
    aplicoPromocode: true,
  };
}
