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
    clave: "liquidacion_disciplina",
    cuando: "Al liquidar el mes a una disciplina: a cada representante que recibe la liquidación.",
    variables: [
      { clave: "nombre", etiqueta: "Nombre del representante" },
      { clave: "disciplina", etiqueta: "Disciplina" },
      { clave: "periodo", etiqueta: "Mes liquidado («septiembre 2026»)" },
      { clave: "socios", etiqueta: "Socios de la disciplina en el mes" },
      { clave: "cuota_social", etiqueta: "Cuota social" },
      { clave: "tarjetas_cobradas", etiqueta: "Tarjetas cobradas" },
      { clave: "visa_cobrado", etiqueta: "Cobrado por débito Visa (cuota entera)" },
      { clave: "visa_social", etiqueta: "Cuota social cobrada en el débito" },
      { clave: "social_a_cargo", etiqueta: "Cuota social a cargo de la disciplina" },
      { clave: "social_total", etiqueta: "Cuota social que se queda el club" },
      { clave: "gastos_comision", etiqueta: "Comisión del débito" },
      { clave: "gastos_iva", etiqueta: "IVA de la comisión" },
      { clave: "otros_cobrado", etiqueta: "Cuotas cobradas por otros medios" },
      { clave: "hay_otros", etiqueta: "Si hubo cobros por otros medios ({{#hay_otros}}…{{/hay_otros}})" },
      { clave: "resultado_texto", etiqueta: "«A pagar a la disciplina» / «A depositar al club»" },
      { clave: "resultado", etiqueta: "Importe del resultado" },
      { clave: "por_cuota", etiqueta: "Débito por importe ({{#por_cuota}}…{{/por_cuota}})", lista: true },
      { clave: "por_cuota.cuota", etiqueta: "Cuota (dentro de por_cuota)" },
      { clave: "por_cuota.tarjetas", etiqueta: "Tarjetas (dentro de por_cuota)" },
      { clave: "por_cuota.rechazos", etiqueta: "Rechazos (dentro de por_cuota)" },
      { clave: "por_cuota.cobradas", etiqueta: "Cobradas (dentro de por_cuota)" },
      { clave: "por_cuota.importe", etiqueta: "Importe (dentro de por_cuota)" },
      { clave: "cobrados", etiqueta: "Cuotas cobradas ({{#cobrados}}…{{/cobrados}})", lista: true },
      { clave: "cobrados.nombre", etiqueta: "Socio (dentro de cobrados)" },
      { clave: "cobrados.medio", etiqueta: "Medio (dentro de cobrados)" },
      { clave: "cobrados.importe", etiqueta: "Importe (dentro de cobrados)" },
      { clave: "rebotes", etiqueta: "Rebotes del débito ({{#rebotes}}…{{/rebotes}})", lista: true },
      { clave: "rebotes.nombre", etiqueta: "Socio (dentro de rebotes)" },
      { clave: "rebotes.motivo", etiqueta: "Motivo (dentro de rebotes)" },
      { clave: "rebotes.importe", etiqueta: "Importe (dentro de rebotes)" },
      { clave: "hay_rebotes", etiqueta: "Si hubo rebotes" },
      { clave: "sin_pagar", etiqueta: "Social a cargo de la disciplina ({{#sin_pagar}}…{{/sin_pagar}})", lista: true },
      { clave: "sin_pagar.nombre", etiqueta: "Socio (dentro de sin_pagar)" },
      { clave: "sin_pagar.importe", etiqueta: "Importe (dentro de sin_pagar)" },
      { clave: "hay_sin_pagar", etiqueta: "Si hay social a cargo de la disciplina" },
      { clave: "panel_url", etiqueta: "Enlace al panel de la disciplina" },
    ],
    ejemplo: {
      nombre: "Delia", disciplina: "Fútbol Femenino +18", periodo: "septiembre 2026", socios: 29,
      cuota_social: "$ 480,00", tarjetas_cobradas: 26, visa_cobrado: "$ 54.550,00", visa_social: "$ 12.480,00",
      social_a_cargo: "$ 1.440,00", social_total: "$ 13.920,00", gastos_comision: "$ 1.578,98",
      gastos_iva: "$ 347,38", otros_cobrado: "$ 0,00", hay_otros: false, resultado_texto: "A pagar a la disciplina",
      resultado: "$ 38.703,64",
      por_cuota: [
        { cuota: "$ 2.425,00", tarjetas: 9, rechazos: 0, cobradas: 9, importe: "$ 21.825,00" },
        { cuota: "$ 1.925,00", tarjetas: 19, rechazos: 2, cobradas: 17, importe: "$ 32.725,00" },
      ],
      cobrados: [
        { nombre: "Albarez, Constanza", medio: "Débito Visa ****6078", importe: "$ 1.925,00" },
        { nombre: "Guarino, Camilla", medio: "Débito Visa ****2187", importe: "$ 2.425,00" },
      ],
      rebotes: [{ nombre: "Lema, Eloisa", motivo: "Fondos insuficientes", importe: "$ 1.925,00" }],
      hay_rebotes: true,
      sin_pagar: [{ nombre: "Lema, Eloisa", importe: "$ 480,00" }, { nombre: "Tedeschi, Alfonsina", importe: "$ 480,00" }],
      hay_sin_pagar: true,
      panel_url: "https://www.clubseminario.com.uy/disciplina/7?tab=liquidaciones",
    },
  },
  {
    clave: "orden_compra",
    cuando: "Cuando se le manda una orden de compra al proveedor desde Compras (va con el PDF de la orden adjunto).",
    variables: [
      { clave: "nombre", etiqueta: "Contacto del proveedor (o el proveedor si no hay contacto)" },
      { clave: "proveedor", etiqueta: "Proveedor" },
      { clave: "numero_orden", etiqueta: "Número de orden" },
      { clave: "fecha", etiqueta: "Fecha de la orden" },
      { clave: "total", etiqueta: "Total con moneda" },
      { clave: "mensaje", etiqueta: "Mensaje escrito al enviar (vacío si no hay)" },
    ],
    ejemplo: { nombre: "Laura", proveedor: "Distribuidora Sur", numero_orden: "OC-00012", fecha: "05/10/2026", total: "$ 18.450,00", mensaje: "Necesitamos la entrega antes del viernes." },
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
