import type { CartPromocode } from "@/hooks/use-cart";

/**
 * Calcula el descuento del promocode sobre un subtotal dado (cliente).
 * Devuelve un monto >= 0 acotado al subtotal.
 */
export function calcularDescuentoPromocode(
  promo: CartPromocode,
  subtotal: number
): number {
  if (subtotal <= 0) return 0;
  if (promo.tipo_descuento === "porcentaje") {
    return Math.round(subtotal * (promo.valor / 100) * 100) / 100;
  }
  return Math.min(promo.valor, subtotal);
}

/**
 * Preview del cobro final dado un carrito en cliente.
 * Devuelve subtotal, descuentos y total final aplicando la regla "best price"
 * cuando el código es no-acumulable y hay precio socio.
 */
export function previewPromocode(params: {
  totalNormal: number;
  totalSocio: number;
  esSocio: boolean;
  promo: CartPromocode | null;
}): {
  subtotal: number;
  descuentoSocio: number;
  descuentoCodigo: number;
  total: number;
  aplicoPrecioSocio: boolean;
  aplicoPromocode: boolean;
} {
  const { totalNormal, totalSocio, esSocio, promo } = params;

  if (!promo) {
    if (esSocio && totalSocio < totalNormal) {
      return {
        subtotal: totalNormal,
        descuentoSocio: totalNormal - totalSocio,
        descuentoCodigo: 0,
        total: totalSocio,
        aplicoPrecioSocio: true,
        aplicoPromocode: false,
      };
    }
    return {
      subtotal: totalNormal,
      descuentoSocio: 0,
      descuentoCodigo: 0,
      total: totalNormal,
      aplicoPrecioSocio: false,
      aplicoPromocode: false,
    };
  }

  if (!esSocio) {
    const descuentoCodigo = calcularDescuentoPromocode(promo, totalNormal);
    return {
      subtotal: totalNormal,
      descuentoSocio: 0,
      descuentoCodigo,
      total: Math.max(0, totalNormal - descuentoCodigo),
      aplicoPrecioSocio: false,
      aplicoPromocode: true,
    };
  }

  if (promo.acumulable_con_precio_socio) {
    const base = Math.min(totalSocio, totalNormal);
    const descuentoCodigo = calcularDescuentoPromocode(promo, base);
    return {
      subtotal: totalNormal,
      descuentoSocio: totalNormal - base,
      descuentoCodigo,
      total: Math.max(0, base - descuentoCodigo),
      aplicoPrecioSocio: base === totalSocio && totalSocio < totalNormal,
      aplicoPromocode: true,
    };
  }

  // No acumulable + socio: best price
  const totalConSocio = totalSocio;
  const descCodigo = calcularDescuentoPromocode(promo, totalNormal);
  const totalConCodigo = Math.max(0, totalNormal - descCodigo);

  if (totalConSocio <= totalConCodigo) {
    return {
      subtotal: totalNormal,
      descuentoSocio: totalNormal - totalSocio,
      descuentoCodigo: 0,
      total: totalSocio,
      aplicoPrecioSocio: true,
      aplicoPromocode: false,
    };
  }
  return {
    subtotal: totalNormal,
    descuentoSocio: 0,
    descuentoCodigo: descCodigo,
    total: totalConCodigo,
    aplicoPrecioSocio: false,
    aplicoPromocode: true,
  };
}
