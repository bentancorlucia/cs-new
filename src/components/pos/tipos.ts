import type { MtoCampo, MtoValores } from "@/types/mto";

// Tipos compartidos por la pantalla del POS, sus Server Actions y la ruta
// de venta. Solo tipos: lo puede importar cualquier lado.

export interface VariantePos {
  id: number;
  nombre: string;
  sku: string | null;
  precio_override: number | null;
  /** Stock menos lo reservado por otros pedidos pendientes. */
  disponible: number;
  atributos: Record<string, string>;
}

export interface ProductoPos {
  id: number;
  nombre: string;
  precio: number;
  precio_socio: number | null;
  /** Stock menos lo reservado por otros pedidos pendientes. */
  disponible: number;
  categoria_id: number | null;
  imagen_url: string | null;
  imagen_focal_point: string | null;
  variantes: VariantePos[];
  mto_disponible: boolean;
  mto_solo: boolean;
  mto_campos: MtoCampo[];
  mto_tiempo_fabricacion_dias: number | null;
}

export interface CategoriaPos {
  id: number;
  nombre: string;
}

export interface SocioPos {
  id: string;
  nombre: string;
  apellido: string;
  cedula: string | null;
  es_socio: boolean;
}

export interface ItemCarrito {
  /** Identidad de la línea: producto+variante para stock, única por encargue. */
  key: string;
  producto_id: number;
  variante_id: number | null;
  nombre: string;
  precio: number;
  precio_socio: number | null;
  cantidad: number;
  /** Tope de unidades de la línea (disponible, o el máximo de encargue). */
  maximo: number;
  imagen_url: string | null;
  imagen_focal_point: string | null;
  es_encargue: boolean;
  personalizacion: MtoValores;
  /** Recargo por unidad de la personalización (0 si no es encargue). */
  precio_extra: number;
  resumen: string | null;
}

export type MetodoPagoPos = "efectivo" | "transferencia" | "mixto";

export interface LineaTicket {
  nombre: string;
  detalle: string | null;
  cantidad: number;
  precio_unitario: number;
  subtotal: number;
  es_encargue: boolean;
}

/** Lo que imprime el ticket. Lo arma el servidor con lo que quedó registrado. */
export interface TicketVenta {
  pedido_id: number;
  numero_pedido: string;
  fecha: string;
  estado: string;
  cliente: string | null;
  items: LineaTicket[];
  subtotal: number;
  descuentos: { concepto: string; importe: number }[];
  total: number;
  metodo_pago: MetodoPagoPos;
  monto_efectivo: number | null;
  monto_transferencia: number | null;
}

/** Pago tal como lo vio el cajero (para el vuelto del ticket). */
export interface PagoTicket {
  recibido: number | null;
  vuelto: number | null;
}
