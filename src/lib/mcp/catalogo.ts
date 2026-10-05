// Tablas que el MCP puede consultar (solo lectura), por módulo.
// Columnas generadas desde src/types/database.ts — si cambia el esquema,
// actualizar acá (tablas nuevas NO quedan expuestas hasta agregarlas).

export type Modulo = "tienda" | "tesoreria" | "secretaria";

export type TablaCatalogo = {
  modulos: Modulo[];
  descripcion: string;
  columnas: string[];
};

export const CATALOGO: Record<string, TablaCatalogo> = {
  productos: {
    modulos: ["tienda"],
    descripcion: "Catálogo. precio = precio público, precio_socio = precio para socios, stock_actual/stock_minimo en unidades. mto_* = productos a pedido (made to order).",
    columnas: ["activo", "activo_pos", "categoria_id", "created_at", "descripcion", "descripcion_corta", "destacado", "id", "moneda", "mto_campos", "mto_disponible", "mto_solo", "mto_tiempo_fabricacion_dias", "nombre", "peso", "precio", "precio_socio", "sku", "slug", "stock_actual", "stock_minimo", "unidad", "updated_at"],
  },
  producto_variantes: {
    modulos: ["tienda"],
    descripcion: "Variantes (talle, color…) de un producto; stock y costo propios. El stock del producto padre es la suma de variantes activas.",
    columnas: ["activo", "atributos", "created_at", "id", "nombre", "precio_override", "producto_id", "sku", "stock_actual"],
  },
  producto_imagenes: {
    modulos: ["tienda"],
    descripcion: "Imágenes de productos.",
    columnas: ["alt_text", "created_at", "es_principal", "focal_point", "id", "orden", "producto_id", "url"],
  },
  producto_proveedores: {
    modulos: ["tienda"],
    descripcion: "Qué proveedor vende cada producto y a qué costo.",
    columnas: ["codigo_proveedor", "costo", "created_at", "es_principal", "id", "producto_id", "proveedor_id"],
  },
  categorias_producto: {
    modulos: ["tienda"],
    descripcion: "Categorías de la tienda.",
    columnas: ["activa", "created_at", "descripcion", "id", "imagen_url", "nombre", "orden", "slug"],
  },
  pedidos: {
    modulos: ["tienda"],
    descripcion: "Pedidos online (tipo='online'), ventas POS (tipo='pos') y pedidos de disciplinas (tipo='disciplina', cuenta corriente). Sirve para ver pedidos y su estado, NO para sumar ventas: total INCLUYE la donación, los encargues se venden recién al retirarlos y las devoluciones restan aparte. Para ventas, costo y margen usá reporte_tienda o estado_tienda_hoy (mismos números que la contabilidad). fecha_venta = cuándo se cobró. Montos en UYU.",
    columnas: ["aplico_precio_socio", "created_at", "descuento", "descuento_motivo", "descuento_porcentaje", "descuento_tipo", "email_cliente", "disciplina_id", "estado", "fecha_venta", "id", "idempotency_key", "mercadopago_payment_id", "mercadopago_preference_id", "metodo_pago", "monto_efectivo", "monto_transferencia", "moneda", "nombre_cliente", "notas", "numero_pedido", "perfil_id", "promocode_codigo", "promocode_id", "stock_reservado", "stock_reservado_at", "subtotal", "telefono_cliente", "tipo", "total", "updated_at", "vendedor_id"],
  },
  pedido_items: {
    modulos: ["tienda"],
    descripcion: "Líneas de cada pedido. costo_unitario_venta = costo al momento de la venta (para margen). es_encargue = item a pedido sin stock.",
    columnas: ["cantidad", "costo_unitario_venta", "created_at", "descuento_tipo", "descuento_unitario", "es_encargue", "id", "pedido_id", "personalizacion", "precio_extra_personalizacion", "precio_unitario", "producto_id", "subtotal", "variante_id"],
  },
  comprobantes: {
    modulos: ["tienda"],
    descripcion: "Comprobantes de transferencia subidos por clientes para verificar pagos.",
    columnas: ["created_at", "datos_extraidos", "estado", "id", "motivo_rechazo", "nombre_archivo", "pedido_id", "tamano_bytes", "tipo", "updated_at", "url", "verificado_at", "verificado_por"],
  },
  stock_movimientos: {
    modulos: ["tienda"],
    descripcion: "Historial de cambios de stock (venta, compra, ajuste, transferencia…) con stock anterior y nuevo.",
    columnas: ["cantidad", "created_at", "id", "motivo", "producto_id", "referencia_id", "referencia_tipo", "registrado_por", "stock_anterior", "stock_nuevo", "tipo", "variante_id"],
  },
  proveedores: {
    modulos: ["tienda", "tesoreria"],
    descripcion: "Proveedores (datos de contacto). La deuda no está acá: sale de los documentos y del mayor contable (panorama_finanzas).",
    columnas: ["activo", "contacto_email", "contacto_nombre", "contacto_telefono", "created_at", "direccion", "id", "nombre", "notas", "razon_social", "rut", "updated_at"],
  },
  promocodes: {
    modulos: ["tienda"],
    descripcion: "Códigos de descuento, vigencia y usos.",
    columnas: ["activo", "acumulable_con_precio_socio", "codigo", "created_at", "created_by", "descripcion", "fecha_fin", "fecha_inicio", "id", "monto_minimo", "tipo_descuento", "updated_at", "usos_actuales", "usos_max", "valor"],
  },
  listas_precio: {
    modulos: ["tienda"],
    descripcion: "Listas de precio especiales (ej. por disciplina).",
    columnas: ["activa", "created_at", "descripcion", "id", "nombre", "updated_at"],
  },
  lista_precio_items: {
    modulos: ["tienda"],
    descripcion: "Precio de cada producto en una lista de precio.",
    columnas: ["created_at", "id", "lista_precio_id", "precio", "producto_id", "variante_id"],
  },
  lista_precio_disciplinas: {
    modulos: ["tienda"],
    descripcion: "Qué disciplinas usan cada lista de precio.",
    columnas: ["disciplina_id", "id", "lista_precio_id"],
  },
  donaciones: {
    modulos: ["tienda", "tesoreria"],
    descripcion: "Donaciones hechas en el checkout (para la Olla del Hogar); no son venta de la tienda.",
    columnas: ["cobrada_at", "created_at", "estado", "id", "monto", "pedido_id", "transferencia_id"],
  },
  donaciones_transferencias: {
    modulos: ["tienda", "tesoreria"],
    descripcion: "Transferencias de donaciones acumuladas a la Olla del Hogar.",
    columnas: ["cantidad_donaciones", "comprobante_url", "creado_por", "created_at", "fecha_transferencia", "id", "monto_total", "notas"],
  },
  donaciones_config: {
    modulos: ["tienda"],
    descripcion: "Configuración de montos de donación en el checkout.",
    columnas: ["activo", "descripcion", "id", "monto_1", "monto_2", "monto_3", "monto_custom_max", "permitir_monto_custom", "titulo", "updated_at", "updated_by"],
  },
  pagos_mercadopago: {
    modulos: ["tienda", "tesoreria"],
    descripcion: "Pagos recibidos por MercadoPago (tipo_origen = pedido o entrada).",
    columnas: ["created_at", "id", "mercadopago_payment_id", "mercadopago_status", "mercadopago_status_detail", "metodo", "moneda", "monto", "origen_id", "raw_data", "tipo_origen", "updated_at"],
  },
  padron_socios: {
    modulos: ["secretaria"],
    descripcion: "Padrón de socios. activo = socio vigente; desactivado_at = fecha de baja; perfil_id = cuenta web vinculada.",
    columnas: ["activo", "activo_since", "apellido", "cedula", "created_at", "created_by", "desactivado_at", "fecha_nacimiento", "id", "nombre", "notas", "perfil_id", "telefono", "updated_at", "vinculado_at"],
  },
  padron_disciplinas: {
    modulos: ["secretaria"],
    descripcion: "Disciplinas en las que está anotado cada socio del padrón (con categoría).",
    columnas: ["activa", "categoria", "created_at", "disciplina_id", "fecha_ingreso", "id", "padron_socio_id"],
  },
  disciplinas: {
    modulos: ["secretaria", "tienda"],
    descripcion: "Deportes/disciplinas del club con contacto y saldo de cuenta corriente.",
    columnas: ["activa", "contacto_email", "contacto_nombre", "contacto_telefono", "created_at", "descripcion", "id", "imagen_url", "nombre", "saldo_cuenta_corriente", "slug"],
  },
  perfiles: {
    modulos: ["secretaria", "tienda"],
    descripcion: "Usuarios registrados en la web (clientes de la tienda y socios; es_socio, socio_verificado). pedidos.perfil_id apunta acá.",
    columnas: ["apellido", "avatar_url", "cedula", "created_at", "es_socio", "fecha_nacimiento", "id", "nombre", "padron_socio_id", "socio_verificado", "telefono", "updated_at"],
  },
  perfil_roles: {
    modulos: ["secretaria"],
    descripcion: "Roles asignados a cada usuario.",
    columnas: ["asignado_por", "created_at", "id", "perfil_id", "rol_id"],
  },
  roles: {
    modulos: ["secretaria"],
    descripcion: "Roles del sistema.",
    columnas: ["descripcion", "id", "nombre"],
  },
  pagos_socios: {
    modulos: ["secretaria", "tesoreria"],
    descripcion: "Pagos de cuota social registrados (poco usado todavía).",
    columnas: ["created_at", "id", "metodo_pago", "moneda", "monto", "notas", "perfil_id", "periodo_anio", "periodo_mes", "referencia_pago", "registrado_por"],
  },
  popups: {
    modulos: ["secretaria"],
    descripcion: "Avisos emergentes del sitio web.",
    columnas: ["body", "buttons", "created_at", "created_by", "ends_at", "id", "image_url", "pages", "priority", "starts_at", "status", "title", "updated_at"],
  },
};
