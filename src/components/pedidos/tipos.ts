import type {
  AsientoRef,
  ContabilidadPedido,
  Devolucion,
  PermisosPedidos,
} from "@/lib/comercial/pedidos";

export type { AsientoRef, ContabilidadPedido, Devolucion };

export type EstadoPedido =
  | "pendiente"
  | "pendiente_verificacion"
  | "pagado"
  | "encargado"
  | "preparando"
  | "listo_retiro"
  | "retirado"
  | "cancelado";

export type TipoPedido = "online" | "pos" | "disciplina";

export type EstadoDonacion = "pendiente_pago" | "cobrada" | "transferida" | "cancelada";

export interface CampoMto {
  key: string;
  label: string;
  tipo: string;
  opciones?: Array<{ valor: string; label: string }>;
}

export interface ItemPedido {
  id: number;
  cantidad: number;
  precio_unitario: number;
  subtotal: number;
  es_encargue: boolean;
  personalizacion: Record<string, string | number>;
  precio_extra_personalizacion: number;
  costo_unitario_venta: number | null;
  producto: { id: number; nombre: string; slug: string | null; mto_campos: CampoMto[] };
  variante: { id: number; nombre: string } | null;
}

export interface DatosOcr {
  confianza?: number;
  banco_destino?: string | null;
  cuenta_destino?: string | null;
  beneficiario?: string | null;
  monto?: number | null;
  fecha?: string | null;
  banco_origen?: string | null;
  referencia?: string | null;
}

export interface Comprobante {
  id: number;
  url: string | null;
  nombre_archivo: string | null;
  tipo: string | null;
  tamano_bytes: number | null;
  datos_extraidos: DatosOcr | null;
  estado: string | null;
  verificado_at: string | null;
  motivo_rechazo: string | null;
}

export type PermisosDetalle = Pick<
  PermisosPedidos,
  "puedeOperar" | "puedeOperarComercial" | "puedeVerContabilidad" | "puedeEscribirContabilidad"
>;

export interface PedidoDetalle {
  id: number;
  numero_pedido: string;
  tipo: TipoPedido;
  estado: EstadoPedido;
  subtotal: number;
  descuento: number;
  total: number;
  metodo_pago: string | null;
  monto_efectivo: number | null;
  monto_transferencia: number | null;
  nombre_cliente: string | null;
  telefono_cliente: string | null;
  email_cliente: string | null;
  perfil_id: string | null;
  notas: string | null;
  created_at: string;
  aplico_precio_socio: boolean;
  disciplina: { id: number; nombre: string } | null;
  perfil: {
    nombre: string;
    apellido: string;
    telefono: string | null;
    cedula: string | null;
    es_socio: boolean | null;
  } | null;
  items: ItemPedido[];
  donacion: { id: number; monto: number; estado: EstadoDonacion; transferencia_id: number | null } | null;
  comprobantes: Comprobante[];
  contabilidad: ContabilidadPedido;
  permisos: PermisosDetalle;
}

/** Producto ofrecido para un cambio, al precio del pedido original. */
export interface ProductoCambio {
  producto_id: number;
  variante_id: number | null;
  nombre: string;
  variante: string | null;
  sku: string | null;
  precio: number;
  stock: number;
}

// ------------------------------------------------------------
// Pedidos de disciplinas
// ------------------------------------------------------------

/** Renglón del catálogo mayorista de una disciplina (al precio que se cobra). */
export interface ItemCatalogoDisciplina {
  producto_id: number;
  variante_id: number | null;
  nombre: string;
  variante_nombre: string | null;
  sku: string | null;
  precio_mayorista: number;
  precio_base: number;
  stock: number;
}

export interface PedidoDisciplinaFila {
  id: number;
  numero_pedido: string | null;
  total: number;
  estado: EstadoPedido;
  created_at: string | null;
  notas: string | null;
  disciplina: { id: number; nombre: string } | null;
  vendedor: string | null;
  items: { id: number; cantidad: number; nombre: string; variante: string | null }[];
  /** Plan de pago vigente que incluye el pedido. */
  plan?: { id: number; descripcion: string; disciplina_id: number } | null;
}

export interface SaldoDisciplina {
  disciplina_id: number;
  nombre: string;
  debe: number;
  haber: number;
  saldo: number;
}

export interface MovimientoCuentaCorriente {
  linea_id: number;
  asiento_id: string;
  numero: number | null;
  fecha: string;
  descripcion: string;
  debe: number;
  haber: number;
  saldo: number;
  pedido_id: number | null;
}

export interface CuentaCorrienteDisciplinas {
  cuenta: { id: string; codigo: string; nombre: string } | null;
  ejercicio: { nombre: string; fecha_inicio: string } | null;
  saldos: SaldoDisciplina[];
  total: number;
  movimientos: MovimientoCuentaCorriente[];
  permisos: { puedeVerContabilidad: boolean; puedeEscribirContabilidad: boolean };
  error: string | null;
}

export const NOMBRE_ESTADO: Record<EstadoPedido, string> = {
  pendiente: "Pendiente",
  pendiente_verificacion: "Por conciliar",
  pagado: "Pagado",
  encargado: "Encargado",
  preparando: "Preparando",
  listo_retiro: "Listo para retiro",
  retirado: "Retirado",
  cancelado: "Cancelado",
};

export const ESTILO_ESTADO: Record<EstadoPedido, string> = {
  pendiente: "bg-gray-100 text-gray-600 border-gray-200",
  pendiente_verificacion: "bg-orange-50 text-orange-700 border-orange-200",
  pagado: "bg-emerald-50 text-emerald-700 border-emerald-200",
  encargado: "bg-purple-50 text-purple-700 border-purple-200",
  preparando: "bg-amber-50 text-amber-700 border-amber-200",
  listo_retiro: "bg-blue-50 text-blue-700 border-blue-200",
  retirado: "bg-gray-50 text-gray-500 border-gray-200",
  cancelado: "bg-red-50 text-red-600 border-red-200",
};

/** Formato corto de pesos para la tienda: "$ 1.234" o "$ 1.234,50". */
export function pesos(n: number | null | undefined): string {
  const v = Number(n ?? 0);
  return `$${v.toLocaleString("es-UY", { maximumFractionDigits: 2 })}`;
}
