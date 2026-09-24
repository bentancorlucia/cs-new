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
    descripcion: "Catálogo. precio = precio público, precio_socio = precio para socios, costo_promedio = costo promedio ponderado, stock_actual/stock_minimo en unidades. mto_* = productos a pedido (made to order).",
    columnas: ["activo", "activo_pos", "categoria_id", "costo_promedio", "created_at", "descripcion", "descripcion_corta", "destacado", "id", "moneda", "mto_campos", "mto_disponible", "mto_solo", "mto_tiempo_fabricacion_dias", "nombre", "peso", "precio", "precio_socio", "sku", "slug", "stock_actual", "stock_minimo", "unidad", "updated_at"],
  },
  producto_variantes: {
    modulos: ["tienda"],
    descripcion: "Variantes (talle, color…) de un producto; stock y costo propios. El stock del producto padre es la suma de variantes activas.",
    columnas: ["activo", "atributos", "costo_promedio", "created_at", "id", "nombre", "precio_override", "producto_id", "sku", "stock_actual"],
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
    descripcion: "Pedidos online (tipo='online') y ventas POS (tipo='pos'). total INCLUYE la donación si hubo (ver tabla donaciones). Estados de venta efectiva: pagado, encargado, preparando, listo_retiro, retirado. Montos en UYU.",
    columnas: ["aplico_precio_socio", "created_at", "descuento", "descuento_motivo", "descuento_porcentaje", "descuento_tipo", "email_cliente", "disciplina_id", "estado", "id", "idempotency_key", "mercadopago_payment_id", "mercadopago_preference_id", "metodo_pago", "monto_efectivo", "monto_transferencia", "moneda", "nombre_cliente", "notas", "numero_pedido", "perfil_id", "promocode_codigo", "promocode_id", "stock_reservado", "stock_reservado_at", "subtotal", "telefono_cliente", "tipo", "total", "updated_at", "vendedor_id"],
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
    columnas: ["cantidad", "created_at", "deposito_id", "id", "motivo", "producto_id", "referencia_id", "referencia_tipo", "registrado_por", "stock_anterior", "stock_nuevo", "tipo", "variante_id"],
  },
  stock_deposito: {
    modulos: ["tienda"],
    descripcion: "Stock por depósito.",
    columnas: ["cantidad", "deposito_id", "id", "producto_id", "updated_at", "variante_id"],
  },
  depositos: {
    modulos: ["tienda"],
    descripcion: "Depósitos físicos de mercadería.",
    columnas: ["activo", "created_at", "descripcion", "id", "nombre", "ubicacion"],
  },
  transferencias_deposito: {
    modulos: ["tienda"],
    descripcion: "Movimientos de mercadería entre depósitos.",
    columnas: ["completada_at", "created_at", "deposito_destino_id", "deposito_origen_id", "estado", "id", "notas", "registrado_por"],
  },
  transferencia_items: {
    modulos: ["tienda"],
    descripcion: "Items de cada transferencia entre depósitos.",
    columnas: ["cantidad", "id", "producto_id", "transferencia_id", "variante_id"],
  },
  proveedores: {
    modulos: ["tienda", "tesoreria"],
    descripcion: "Proveedores; saldo_cuenta_corriente = deuda con el proveedor.",
    columnas: ["activo", "contacto_email", "contacto_nombre", "contacto_telefono", "created_at", "direccion", "id", "nombre", "notas", "razon_social", "rut", "saldo_cuenta_corriente", "updated_at"],
  },
  compras_proveedor: {
    modulos: ["tienda", "tesoreria"],
    descripcion: "Compras a proveedores (órdenes de compra).",
    columnas: ["created_at", "estado", "fecha_compra", "fecha_recepcion", "id", "impuestos", "moneda", "notas", "numero_compra", "proveedor_id", "registrado_por", "subtotal", "total", "updated_at"],
  },
  compra_items: {
    modulos: ["tienda"],
    descripcion: "Items de cada compra a proveedor.",
    columnas: ["cantidad", "cantidad_recibida", "compra_id", "costo_unitario", "created_at", "id", "producto_id", "subtotal", "variante_id"],
  },
  pagos_proveedor: {
    modulos: ["tienda", "tesoreria"],
    descripcion: "Pagos realizados a proveedores.",
    columnas: ["compra_id", "created_at", "id", "metodo_pago", "moneda", "monto", "notas", "proveedor_id", "referencia", "registrado_por"],
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
  cuentas_financieras: {
    modulos: ["tesoreria"],
    descripcion: "Cuentas del club (bancos, MercadoPago, caja chica) con saldo_actual. moneda UYU o USD.",
    columnas: ["activa", "banco", "color", "created_at", "descripcion", "id", "incluir_en_tesoreria", "modulo", "moneda", "nombre", "numero_cuenta", "saldo_actual", "saldo_inicial", "tipo", "titular", "updated_at"],
  },
  movimientos_financieros: {
    modulos: ["tesoreria"],
    descripcion: "Ingresos y egresos de cada cuenta. tipo = ingreso|egreso, monto siempre positivo, fecha YYYY-MM-DD.",
    columnas: ["categoria_id", "clasificado", "comprobante_url", "created_at", "cuenta_id", "descripcion", "extracto_id", "fecha", "hash_dedupe", "id", "moneda", "monto", "nombre", "notas", "origen_id", "origen_tipo", "referencia", "registrado_por", "subcategoria_id", "tags", "tipo", "transferencia_id", "updated_at"],
  },
  categorias_financieras: {
    modulos: ["tesoreria"],
    descripcion: "Categorías de ingreso/egreso (árbol con padre_id).",
    columnas: ["activa", "color", "created_at", "icono", "id", "nombre", "orden", "padre_id", "presupuesto_mensual", "slug", "tipo"],
  },
  presupuestos: {
    modulos: ["tesoreria"],
    descripcion: "Montos presupuestados por categoría y mes (tipo_periodo='mensual', periodo_numero = mes).",
    columnas: ["anio", "categoria_id", "creado_por", "created_at", "fecha_desde", "fecha_hasta", "id", "moneda", "monto", "notas", "periodo_numero", "tipo_periodo", "updated_at"],
  },
  transferencias_internas: {
    modulos: ["tesoreria"],
    descripcion: "Transferencias entre cuentas propias (con tipo de cambio si cambian de moneda).",
    columnas: ["created_at", "cuenta_destino_id", "cuenta_origen_id", "descripcion", "fecha", "id", "moneda_destino", "moneda_origen", "monto_destino", "monto_origen", "movimiento_egreso_id", "movimiento_ingreso_id", "registrado_por", "tipo_cambio"],
  },
  extractos_importados: {
    modulos: ["tesoreria"],
    descripcion: "Extractos bancarios importados.",
    columnas: ["archivo_hash", "archivo_nombre", "created_at", "cuenta_id", "fecha_desde", "fecha_hasta", "formato", "id", "importado_por", "movimientos_creados", "movimientos_duplicados", "saldo_final_extracto", "saldo_inicial_extracto", "total_movimientos"],
  },
  cotizaciones_bcu: {
    modulos: ["tesoreria"],
    descripcion: "Cotizaciones del dólar del BCU por fecha.",
    columnas: ["compra", "created_at", "fecha", "fuente", "id", "moneda", "venta"],
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
  staff: {
    modulos: ["secretaria"],
    descripcion: "Staff del club (entrenadores, funcionarios) con cargo y disciplina.",
    columnas: ["activo", "apellido", "cargo", "cedula", "created_at", "created_by", "descripcion", "disciplina_id", "email", "fecha_ingreso", "id", "nombre", "notas", "telefono", "updated_at"],
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
