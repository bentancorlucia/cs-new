/**
 * Mails automáticos de la tienda y eventos que se editan como plantillas
 * (comunicaciones.plantillas con transaccional = true). Cada uno declara
 * sus variables (para el editor y la validación) y datos de ejemplo (para
 * la vista previa). El armado real está en armarTransaccional, que usa el
 * sitio al encolar el mail.
 */

export type VariableTransaccional = { clave: string; etiqueta: string; lista?: boolean };

export type Transaccional = {
  clave: string;
  cuando: string;
  variables: VariableTransaccional[];
  ejemplo: Record<string, unknown>;
};

const ITEMS_EJEMPLO = [
  { producto: "Buzo oficial — M", cantidad: 1, importe: "$2.400" },
  { producto: "Medias de rugby", cantidad: 2, importe: "$900" },
];

const VARS_PEDIDO: VariableTransaccional[] = [
  { clave: "nombre", etiqueta: "Nombre del cliente" },
  { clave: "numero_pedido", etiqueta: "Número de pedido" },
];

const VARS_ITEMS: VariableTransaccional[] = [
  { clave: "items", etiqueta: "Lista de productos ({{#items}}…{{/items}})", lista: true },
  { clave: "items.producto", etiqueta: "Producto (dentro de items)" },
  { clave: "items.cantidad", etiqueta: "Cantidad (dentro de items)" },
  { clave: "items.importe", etiqueta: "Importe (dentro de items)" },
  { clave: "total", etiqueta: "Total" },
];

export const TRANSACCIONALES: Transaccional[] = [
  {
    clave: "pedido_confirmacion",
    cuando: "Cuando se confirma el pago de un pedido de la tienda.",
    variables: [...VARS_PEDIDO, ...VARS_ITEMS, { clave: "pedido_url", etiqueta: "Enlace al pedido (vacío si el cliente no tiene cuenta)" }],
    ejemplo: { nombre: "María", numero_pedido: "CS-20261003-014", items: ITEMS_EJEMPLO, total: "$4.200", pedido_url: "https://www.clubseminario.com.uy/tienda/pedido/ejemplo" },
  },
  {
    clave: "pedido_verificacion",
    cuando: "Cuando un cliente sube el comprobante de transferencia y queda a verificar.",
    variables: [
      ...VARS_PEDIDO,
      ...VARS_ITEMS,
      { clave: "donacion", etiqueta: "Donación a la Olla (vacío si no hay)" },
      { clave: "pedido_url", etiqueta: "Enlace al pedido" },
    ],
    ejemplo: { nombre: "María", numero_pedido: "CS-20261003-014", items: ITEMS_EJEMPLO, donacion: "$200", total: "$4.400", pedido_url: "https://www.clubseminario.com.uy/tienda/pedido/ejemplo" },
  },
  {
    clave: "pedido_listo",
    cuando: "Cuando el pedido pasa a «listo para retirar».",
    variables: [...VARS_PEDIDO, { clave: "pedido_url", etiqueta: "Enlace al pedido (vacío si el cliente no tiene cuenta)" }],
    ejemplo: { nombre: "María", numero_pedido: "CS-20261003-014", pedido_url: "https://www.clubseminario.com.uy/tienda/pedido/ejemplo" },
  },
  {
    clave: "pedido_cancelado",
    cuando: "Cuando se cancela un pedido.",
    variables: [...VARS_PEDIDO, { clave: "motivo", etiqueta: "Motivo (vacío si no se indicó)" }],
    ejemplo: { nombre: "María", numero_pedido: "CS-20261003-014", motivo: "No se recibió la transferencia a tiempo." },
  },
  {
    clave: "entradas",
    cuando: "Cuando se confirma la compra de entradas (va con el PDF de los QR adjunto).",
    variables: [
      { clave: "nombre", etiqueta: "Nombre del asistente" },
      { clave: "evento", etiqueta: "Evento" },
      { clave: "tipo_entrada", etiqueta: "Tipo de entrada" },
      { clave: "cantidad", etiqueta: "Cantidad" },
      { clave: "cantidad_texto", etiqueta: "«1 entrada» / «3 entradas»" },
      { clave: "total", etiqueta: "Total (vacío si es gratis)" },
      { clave: "evento_url", etiqueta: "Enlace al evento" },
    ],
    ejemplo: { nombre: "María", evento: "Cena aniversario", tipo_entrada: "General", cantidad: 2, cantidad_texto: "2 entradas", total: "$3.000", evento_url: "https://www.clubseminario.com.uy/eventos/ejemplo" },
  },
  {
    clave: "notificacion",
    cuando: "Avisos generales del sistema.",
    variables: [
      { clave: "titulo", etiqueta: "Título" },
      { clave: "mensaje", etiqueta: "Mensaje" },
      { clave: "cta_texto", etiqueta: "Texto del botón" },
      { clave: "cta_url", etiqueta: "Enlace del botón (vacío = sin botón)" },
    ],
    ejemplo: { titulo: "Aviso de prueba", mensaje: "Este es un aviso del sistema.", cta_texto: "Ir al sitio", cta_url: "https://www.clubseminario.com.uy" },
  },
];

export const transaccional = (clave: string) => TRANSACCIONALES.find((t) => t.clave === clave) ?? null;

/** Pesos con el formato de la tienda ($1.234). */
export const pesos = (n: number) => `$${n.toLocaleString("es-UY")}`;
