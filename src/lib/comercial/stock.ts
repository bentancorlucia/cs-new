/**
 * Stock valorizado: utilidades puras (sirven en el servidor y en el
 * navegador). La existencia y el valor viven en `comercial.items`; el
 * kardex en `comercial.movimientos`. Nada de esto escribe stock: eso lo
 * hacen solo las funciones de la base (ajustar_stock, compras, ventas…).
 */

export type MetodoCosteo = "promedio" | "fifo";

export const NOMBRE_METODO: Record<MetodoCosteo, string> = {
  promedio: "Promedio ponderado",
  fifo: "FIFO (primero entrado, primero salido)",
};

export const TIPOS_MOVIMIENTO = [
  "inventario_inicial",
  "compra",
  "venta",
  "devolucion_venta",
  "ajuste",
  "devolucion_compra",
] as const;

export type TipoMovimiento = (typeof TIPOS_MOVIMIENTO)[number];

export const NOMBRE_TIPO_MOVIMIENTO: Record<string, string> = {
  inventario_inicial: "Inventario inicial",
  compra: "Compra",
  venta: "Venta",
  devolucion_venta: "Devolución de venta",
  ajuste: "Ajuste",
  devolucion_compra: "Devolución a proveedor",
};

/** Costo promedio vigente de un ítem (valor / stock). */
export function costoPromedio(stock: number, valor: number): number | null {
  return stock > 0 ? Number(valor) / stock : null;
}

/**
 * Número escrito a la uruguaya o como lo exporta Excel:
 *   1500 · "1500" · "1.500" · "1.500,50" · "1500,5" · "1500.50" · "$ 1.500"
 * Un punto seguido de exactamente tres dígitos es separador de miles
 * ("1.500" = mil quinientos, no 1,5). Devuelve null si no es un número.
 */
export function parseNumeroUY(valor: unknown): number | null {
  if (typeof valor === "number") return Number.isFinite(valor) ? valor : null;
  if (valor === null || valor === undefined) return null;
  let t = String(valor).replace(/\s|\$|US/gi, "").trim();
  if (!t) return null;
  let negativo = false;
  if (t.startsWith("-")) {
    negativo = true;
    t = t.slice(1);
  }
  if (t.includes(",")) {
    // coma decimal: los puntos son de miles
    if ((t.match(/,/g) ?? []).length > 1) return null;
    t = t.replace(/\./g, "").replace(",", ".");
  } else {
    const puntos = (t.match(/\./g) ?? []).length;
    if (puntos > 1 || /^\d{1,3}\.\d{3}$/.test(t)) t = t.replace(/\./g, "");
  }
  if (!/^\d*\.?\d*$/.test(t) || t === "." || t === "") return null;
  const n = Number(t);
  if (!Number.isFinite(n)) return null;
  return negativo ? -n : n;
}

/** Entero ≥ 0 (o null) a partir de una celda. */
export function parseEnteroUY(valor: unknown): number | null {
  const n = parseNumeroUY(valor);
  if (n === null || !Number.isInteger(n)) return null;
  return n;
}

export interface OrigenResuelto {
  etiqueta: string;
  href: string | null;
}

/**
 * Texto y link del documento que originó un movimiento del kardex.
 * `pedidoDe` resuelve los ids que no son del pedido (devoluciones) y
 * `numeroPedido` el número visible.
 */
export function origenMovimiento(
  origenTipo: string,
  origenId: string,
  extra: {
    numeroPedido?: Map<string, string | null>;
    pedidoDeDevolucion?: Map<string, number>;
  } = {}
): OrigenResuelto {
  const nro = (id: string) => extra.numeroPedido?.get(id) ?? `#${id}`;
  switch (origenTipo) {
    case "pedido":
      return { etiqueta: `Pedido ${nro(origenId)}`, href: `/admin/pedidos/${origenId}` };
    case "pedido_cancelacion":
      return { etiqueta: `Cancelación del pedido ${nro(origenId)}`, href: `/admin/pedidos/${origenId}` };
    case "devolucion_venta": {
      const pedido = extra.pedidoDeDevolucion?.get(origenId);
      return pedido
        ? { etiqueta: `Devolución del pedido ${nro(String(pedido))}`, href: `/admin/pedidos/${pedido}` }
        : { etiqueta: `Devolución #${origenId}`, href: null };
    }
    case "recepcion":
      return { etiqueta: `Recepción #${origenId}`, href: `/admin/compras/recepciones/${origenId}` };
    case "documento_proveedor":
      return { etiqueta: `Documento de proveedor #${origenId}`, href: `/admin/compras/documentos/${origenId}` };
    case "documento_proveedor_anulacion":
      return { etiqueta: `Anulación del documento #${origenId}`, href: `/admin/compras/documentos/${origenId}` };
    case "ajuste_stock":
      return { etiqueta: "Ajuste manual", href: null };
    case "inventario_inicial":
      return { etiqueta: "Carga de inventario inicial", href: null };
    case "migracion":
      return { etiqueta: "Stock previo al motor de costos", href: null };
    default:
      return { etiqueta: `${origenTipo} #${origenId}`, href: null };
  }
}

/** Clave estable de un ítem vendible (producto sin variantes o variante). */
export function claveItem(productoId: number, varianteId: number | null): string {
  return `${productoId}:${varianteId ?? 0}`;
}

/** Escapa texto para usarlo en un filtro `ilike` de PostgREST dentro de `.or()`. */
export function textoBusqueda(texto: string): string {
  return texto.replace(/[%_\\]/g, (c) => `\\${c}`).replace(/[,()"]/g, " ").trim();
}
