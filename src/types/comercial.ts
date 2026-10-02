
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  
  "comercial": {
          Tables: {
            "aplicaciones_proveedor": {
                  Row: {
                    "asiento_id": string | null,"created_at": string,"documento_id": number,"fecha": string,"id": number,"importe": number,"nota_credito_id": number | null,"orden_pago_id": number | null,"vigente": boolean
                  }
                  Insert: {
                    "asiento_id"?: string | null,"created_at"?: string,"documento_id": number,"fecha": string,"id"?: never,"importe": number,"nota_credito_id"?: number | null,"orden_pago_id"?: number | null,"vigente"?: boolean
                  }
                  Update: {
                    "asiento_id"?: string | null,"created_at"?: string,"documento_id"?: number,"fecha"?: string,"id"?: never,"importe"?: number,"nota_credito_id"?: number | null,"orden_pago_id"?: number | null,"vigente"?: boolean
                  }
                  Relationships: [
                    {
      foreignKeyName: "aplicaciones_proveedor_documento_id_fkey"
      columns: ["documento_id"]
isOneToOne: false
      referencedRelation: "documentos_proveedor"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "aplicaciones_proveedor_nota_credito_id_fkey"
      columns: ["nota_credito_id"]
isOneToOne: false
      referencedRelation: "documentos_proveedor"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "aplicaciones_proveedor_orden_pago_id_fkey"
      columns: ["orden_pago_id"]
isOneToOne: false
      referencedRelation: "ordenes_pago"
      referencedColumns: ["id"]
    }
                  ]
                },"baja_items": {
                  Row: {
                    "baja_id": number,"cantidad": number,"id": number,"item_id": number,"valor": number
                  }
                  Insert: {
                    "baja_id": number,"cantidad": number,"id"?: never,"item_id": number,"valor": number
                  }
                  Update: {
                    "baja_id"?: number,"cantidad"?: number,"id"?: never,"item_id"?: number,"valor"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "baja_items_baja_id_fkey"
      columns: ["baja_id"]
isOneToOne: false
      referencedRelation: "bajas"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "baja_items_item_id_fkey"
      columns: ["item_id"]
isOneToOne: false
      referencedRelation: "items"
      referencedColumns: ["id"]
    }
                  ]
                },"bajas": {
                  Row: {
                    "asiento_id": string | null,"centro_costo_id": string | null,"creado_por": string | null,"created_at": string,"descripcion": string,"fecha": string,"id": number,"numero": string,"tipo": string
                  }
                  Insert: {
                    "asiento_id"?: string | null,"centro_costo_id"?: string | null,"creado_por"?: string | null,"created_at"?: string,"descripcion": string,"fecha"?: string,"id"?: never,"numero"?: string,"tipo": string
                  }
                  Update: {
                    "asiento_id"?: string | null,"centro_costo_id"?: string | null,"creado_por"?: string | null,"created_at"?: string,"descripcion"?: string,"fecha"?: string,"id"?: never,"numero"?: string,"tipo"?: string
                  }
                  Relationships: [
                    
                  ]
                },"caja_movimientos": {
                  Row: {
                    "asiento_id": string | null,"creado_por": string | null,"created_at": string,"descripcion": string,"entra": boolean,"id": number,"importe": number,"sesion_id": number,"tipo": string
                  }
                  Insert: {
                    "asiento_id"?: string | null,"creado_por"?: string | null,"created_at"?: string,"descripcion": string,"entra": boolean,"id"?: never,"importe": number,"sesion_id": number,"tipo": string
                  }
                  Update: {
                    "asiento_id"?: string | null,"creado_por"?: string | null,"created_at"?: string,"descripcion"?: string,"entra"?: boolean,"id"?: never,"importe"?: number,"sesion_id"?: number,"tipo"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "caja_movimientos_sesion_id_fkey"
      columns: ["sesion_id"]
isOneToOne: false
      referencedRelation: "caja_sesiones"
      referencedColumns: ["id"]
    }
                  ]
                },"caja_sesiones": {
                  Row: {
                    "abierta_at": string,"abierta_por": string | null,"caja_id": number,"cerrada_at": string | null,"cerrada_por": string | null,"contado_final": number | null,"contado_inicial": number,"estado": string,"id": number,"notas": string | null,"saldo_final": number | null,"saldo_inicial": number
                  }
                  Insert: {
                    "abierta_at"?: string,"abierta_por"?: string | null,"caja_id": number,"cerrada_at"?: string | null,"cerrada_por"?: string | null,"contado_final"?: number | null,"contado_inicial": number,"estado"?: string,"id"?: never,"notas"?: string | null,"saldo_final"?: number | null,"saldo_inicial": number
                  }
                  Update: {
                    "abierta_at"?: string,"abierta_por"?: string | null,"caja_id"?: number,"cerrada_at"?: string | null,"cerrada_por"?: string | null,"contado_final"?: number | null,"contado_inicial"?: number,"estado"?: string,"id"?: never,"notas"?: string | null,"saldo_final"?: number | null,"saldo_inicial"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "caja_sesiones_caja_id_fkey"
      columns: ["caja_id"]
isOneToOne: false
      referencedRelation: "cajas"
      referencedColumns: ["id"]
    }
                  ]
                },"cajas": {
                  Row: {
                    "activa": boolean,"cuenta_id": string,"id": number,"nombre": string
                  }
                  Insert: {
                    "activa"?: boolean,"cuenta_id": string,"id"?: never,"nombre": string
                  }
                  Update: {
                    "activa"?: boolean,"cuenta_id"?: string,"id"?: never,"nombre"?: string
                  }
                  Relationships: [
                    
                  ]
                },"capas": {
                  Row: {
                    "cantidad_inicial": number,"cantidad_restante": number,"costo_unitario": number,"id": number,"item_id": number,"movimiento_id": number
                  }
                  Insert: {
                    "cantidad_inicial": number,"cantidad_restante": number,"costo_unitario": number,"id"?: never,"item_id": number,"movimiento_id": number
                  }
                  Update: {
                    "cantidad_inicial"?: number,"cantidad_restante"?: number,"costo_unitario"?: number,"id"?: never,"item_id"?: number,"movimiento_id"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "capas_item_id_fkey"
      columns: ["item_id"]
isOneToOne: false
      referencedRelation: "items"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "capas_movimiento_id_fkey"
      columns: ["movimiento_id"]
isOneToOne: false
      referencedRelation: "movimientos"
      referencedColumns: ["id"]
    }
                  ]
                },"devolucion_items": {
                  Row: {
                    "cantidad": number,"costo": number,"devolucion_id": number,"es_nuevo": boolean,"id": number,"importe": number,"item_id": number,"pedido_item_id": number | null
                  }
                  Insert: {
                    "cantidad": number,"costo": number,"devolucion_id": number,"es_nuevo": boolean,"id"?: never,"importe": number,"item_id": number,"pedido_item_id"?: number | null
                  }
                  Update: {
                    "cantidad"?: number,"costo"?: number,"devolucion_id"?: number,"es_nuevo"?: boolean,"id"?: never,"importe"?: number,"item_id"?: number,"pedido_item_id"?: number | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "devolucion_items_devolucion_id_fkey"
      columns: ["devolucion_id"]
isOneToOne: false
      referencedRelation: "devoluciones"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "devolucion_items_item_id_fkey"
      columns: ["item_id"]
isOneToOne: false
      referencedRelation: "items"
      referencedColumns: ["id"]
    }
                  ]
                },"devoluciones": {
                  Row: {
                    "asiento_id": string | null,"creado_por": string | null,"created_at": string,"fecha": string,"id": number,"importe_devuelto": number,"importe_nuevo": number,"medio": string,"motivo": string,"neto": number,"pedido_id": number
                  }
                  Insert: {
                    "asiento_id"?: string | null,"creado_por"?: string | null,"created_at"?: string,"fecha": string,"id"?: never,"importe_devuelto": number,"importe_nuevo": number,"medio": string,"motivo": string,"neto": number,"pedido_id": number
                  }
                  Update: {
                    "asiento_id"?: string | null,"creado_por"?: string | null,"created_at"?: string,"fecha"?: string,"id"?: never,"importe_devuelto"?: number,"importe_nuevo"?: number,"medio"?: string,"motivo"?: string,"neto"?: number,"pedido_id"?: number
                  }
                  Relationships: [
                    
                  ]
                },"documento_proveedor_lineas": {
                  Row: {
                    "cantidad": number | null,"centro_costo_id": string | null,"cuenta_id": string | null,"descripcion": string | null,"documento_id": number,"id": number,"importe": number,"item_id": number | null,"recepcion_item_id": number | null,"tipo": string
                  }
                  Insert: {
                    "cantidad"?: number | null,"centro_costo_id"?: string | null,"cuenta_id"?: string | null,"descripcion"?: string | null,"documento_id": number,"id"?: never,"importe": number,"item_id"?: number | null,"recepcion_item_id"?: number | null,"tipo": string
                  }
                  Update: {
                    "cantidad"?: number | null,"centro_costo_id"?: string | null,"cuenta_id"?: string | null,"descripcion"?: string | null,"documento_id"?: number,"id"?: never,"importe"?: number,"item_id"?: number | null,"recepcion_item_id"?: number | null,"tipo"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "documento_proveedor_lineas_documento_id_fkey"
      columns: ["documento_id"]
isOneToOne: false
      referencedRelation: "documentos_proveedor"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "documento_proveedor_lineas_item_id_fkey"
      columns: ["item_id"]
isOneToOne: false
      referencedRelation: "items"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "documento_proveedor_lineas_recepcion_item_id_fkey"
      columns: ["recepcion_item_id"]
isOneToOne: false
      referencedRelation: "recepcion_items"
      referencedColumns: ["id"]
    }
                  ]
                },"documentos_proveedor": {
                  Row: {
                    "asiento_id": string | null,"contado": boolean,"creado_por": string | null,"created_at": string,"cuenta_pago_id": string | null,"estado": string,"fecha": string,"id": number,"moneda": string,"notas": string | null,"numero": string,"proveedor_id": number,"serie": string,"tc": number,"tipo": string,"total": number,"vencimiento": string | null
                  }
                  Insert: {
                    "asiento_id"?: string | null,"contado"?: boolean,"creado_por"?: string | null,"created_at"?: string,"cuenta_pago_id"?: string | null,"estado"?: string,"fecha": string,"id"?: never,"moneda": string,"notas"?: string | null,"numero": string,"proveedor_id": number,"serie"?: string,"tc": number,"tipo": string,"total": number,"vencimiento"?: string | null
                  }
                  Update: {
                    "asiento_id"?: string | null,"contado"?: boolean,"creado_por"?: string | null,"created_at"?: string,"cuenta_pago_id"?: string | null,"estado"?: string,"fecha"?: string,"id"?: never,"moneda"?: string,"notas"?: string | null,"numero"?: string,"proveedor_id"?: number,"serie"?: string,"tc"?: number,"tipo"?: string,"total"?: number,"vencimiento"?: string | null
                  }
                  Relationships: [
                    
                  ]
                },"items": {
                  Row: {
                    "id": number,"metodo_costeo": string,"producto_id": number,"stock": number,"updated_at": string,"valor": number,"variante_id": number | null,"_sincronizar_publico": undefined | null
                  }
                  Insert: {
                    "id"?: never,"metodo_costeo"?: string,"producto_id": number,"stock"?: number,"updated_at"?: string,"valor"?: number,"variante_id"?: number | null
                  }
                  Update: {
                    "id"?: never,"metodo_costeo"?: string,"producto_id"?: number,"stock"?: number,"updated_at"?: string,"valor"?: number,"variante_id"?: number | null
                  }
                  Relationships: [
                    
                  ]
                },"movimientos": {
                  Row: {
                    "asiento_id": string | null,"cantidad": number,"costo_unitario": number,"creado_por": string | null,"created_at": string,"fecha": string,"id": number,"item_id": number,"motivo": string | null,"origen_id": string,"origen_tipo": string,"stock_resultante": number,"tipo": string,"valor": number,"valor_resultante": number
                  }
                  Insert: {
                    "asiento_id"?: string | null,"cantidad": number,"costo_unitario": number,"creado_por"?: string | null,"created_at"?: string,"fecha": string,"id"?: never,"item_id": number,"motivo"?: string | null,"origen_id": string,"origen_tipo": string,"stock_resultante": number,"tipo": string,"valor": number,"valor_resultante": number
                  }
                  Update: {
                    "asiento_id"?: string | null,"cantidad"?: number,"costo_unitario"?: number,"creado_por"?: string | null,"created_at"?: string,"fecha"?: string,"id"?: never,"item_id"?: number,"motivo"?: string | null,"origen_id"?: string,"origen_tipo"?: string,"stock_resultante"?: number,"tipo"?: string,"valor"?: number,"valor_resultante"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "movimientos_item_id_fkey"
      columns: ["item_id"]
isOneToOne: false
      referencedRelation: "items"
      referencedColumns: ["id"]
    }
                  ]
                },"orden_compra_items": {
                  Row: {
                    "cantidad": number,"cantidad_recibida": number,"costo_unitario": number,"id": number,"orden_id": number,"producto_id": number,"variante_id": number | null
                  }
                  Insert: {
                    "cantidad": number,"cantidad_recibida"?: number,"costo_unitario": number,"id"?: never,"orden_id": number,"producto_id": number,"variante_id"?: number | null
                  }
                  Update: {
                    "cantidad"?: number,"cantidad_recibida"?: number,"costo_unitario"?: number,"id"?: never,"orden_id"?: number,"producto_id"?: number,"variante_id"?: number | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "orden_compra_items_orden_id_fkey"
      columns: ["orden_id"]
isOneToOne: false
      referencedRelation: "ordenes_compra"
      referencedColumns: ["id"]
    }
                  ]
                },"ordenes_compra": {
                  Row: {
                    "aprobada_at": string | null,"aprobada_por": string | null,"creado_por": string | null,"created_at": string,"estado": string,"fecha": string,"id": number,"moneda": string,"notas": string | null,"numero": string,"proveedor_id": number
                  }
                  Insert: {
                    "aprobada_at"?: string | null,"aprobada_por"?: string | null,"creado_por"?: string | null,"created_at"?: string,"estado"?: string,"fecha"?: string,"id"?: never,"moneda"?: string,"notas"?: string | null,"numero"?: string,"proveedor_id": number
                  }
                  Update: {
                    "aprobada_at"?: string | null,"aprobada_por"?: string | null,"creado_por"?: string | null,"created_at"?: string,"estado"?: string,"fecha"?: string,"id"?: never,"moneda"?: string,"notas"?: string | null,"numero"?: string,"proveedor_id"?: number
                  }
                  Relationships: [
                    
                  ]
                },"ordenes_pago": {
                  Row: {
                    "asiento_id": string | null,"creado_por": string | null,"created_at": string,"cuenta_pago_id": string,"estado": string,"fecha_pago": string | null,"id": number,"importe": number,"moneda": string,"notas": string | null,"numero": string,"pagada_por": string | null,"proveedor_id": number,"referencia": string | null,"tc": number | null
                  }
                  Insert: {
                    "asiento_id"?: string | null,"creado_por"?: string | null,"created_at"?: string,"cuenta_pago_id": string,"estado"?: string,"fecha_pago"?: string | null,"id"?: never,"importe": number,"moneda": string,"notas"?: string | null,"numero"?: string,"pagada_por"?: string | null,"proveedor_id": number,"referencia"?: string | null,"tc"?: number | null
                  }
                  Update: {
                    "asiento_id"?: string | null,"creado_por"?: string | null,"created_at"?: string,"cuenta_pago_id"?: string,"estado"?: string,"fecha_pago"?: string | null,"id"?: never,"importe"?: number,"moneda"?: string,"notas"?: string | null,"numero"?: string,"pagada_por"?: string | null,"proveedor_id"?: number,"referencia"?: string | null,"tc"?: number | null
                  }
                  Relationships: [
                    
                  ]
                },"proveedores_condiciones": {
                  Row: {
                    "centro_costo_id": string | null,"cuenta_gasto_id": string | null,"moneda": string,"plazo_dias": number,"proveedor_id": number,"updated_at": string
                  }
                  Insert: {
                    "centro_costo_id"?: string | null,"cuenta_gasto_id"?: string | null,"moneda"?: string,"plazo_dias"?: number,"proveedor_id": number,"updated_at"?: string
                  }
                  Update: {
                    "centro_costo_id"?: string | null,"cuenta_gasto_id"?: string | null,"moneda"?: string,"plazo_dias"?: number,"proveedor_id"?: number,"updated_at"?: string
                  }
                  Relationships: [
                    
                  ]
                },"recepcion_items": {
                  Row: {
                    "cantidad": number,"cantidad_facturada": number,"costo_unitario": number,"id": number,"item_id": number,"orden_item_id": number | null,"recepcion_id": number,"valor": number
                  }
                  Insert: {
                    "cantidad": number,"cantidad_facturada"?: number,"costo_unitario": number,"id"?: never,"item_id": number,"orden_item_id"?: number | null,"recepcion_id": number,"valor": number
                  }
                  Update: {
                    "cantidad"?: number,"cantidad_facturada"?: number,"costo_unitario"?: number,"id"?: never,"item_id"?: number,"orden_item_id"?: number | null,"recepcion_id"?: number,"valor"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "recepcion_items_item_id_fkey"
      columns: ["item_id"]
isOneToOne: false
      referencedRelation: "items"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "recepcion_items_orden_item_id_fkey"
      columns: ["orden_item_id"]
isOneToOne: false
      referencedRelation: "orden_compra_items"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "recepcion_items_recepcion_id_fkey"
      columns: ["recepcion_id"]
isOneToOne: false
      referencedRelation: "recepciones"
      referencedColumns: ["id"]
    }
                  ]
                },"recepciones": {
                  Row: {
                    "asiento_id": string | null,"creado_por": string | null,"created_at": string,"estado": string,"fecha": string,"id": number,"idempotency_key": string | null,"moneda": string,"numero": string,"orden_id": number | null,"proveedor_id": number,"remito": string | null,"tc": number
                  }
                  Insert: {
                    "asiento_id"?: string | null,"creado_por"?: string | null,"created_at"?: string,"estado"?: string,"fecha": string,"id"?: never,"idempotency_key"?: string | null,"moneda": string,"numero"?: string,"orden_id"?: number | null,"proveedor_id": number,"remito"?: string | null,"tc": number
                  }
                  Update: {
                    "asiento_id"?: string | null,"creado_por"?: string | null,"created_at"?: string,"estado"?: string,"fecha"?: string,"id"?: never,"idempotency_key"?: string | null,"moneda"?: string,"numero"?: string,"orden_id"?: number | null,"proveedor_id"?: number,"remito"?: string | null,"tc"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "recepciones_orden_id_fkey"
      columns: ["orden_id"]
isOneToOne: false
      referencedRelation: "ordenes_compra"
      referencedColumns: ["id"]
    }
                  ]
                },"recuento_items": {
                  Row: {
                    "contado": number,"diferencia": number | null,"id": number,"item_id": number,"recuento_id": number,"stock_sistema": number | null,"valor": number | null
                  }
                  Insert: {
                    "contado": number,"diferencia"?: number | null,"id"?: never,"item_id": number,"recuento_id": number,"stock_sistema"?: number | null,"valor"?: number | null
                  }
                  Update: {
                    "contado"?: number,"diferencia"?: number | null,"id"?: never,"item_id"?: number,"recuento_id"?: number,"stock_sistema"?: number | null,"valor"?: number | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "recuento_items_item_id_fkey"
      columns: ["item_id"]
isOneToOne: false
      referencedRelation: "items"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "recuento_items_recuento_id_fkey"
      columns: ["recuento_id"]
isOneToOne: false
      referencedRelation: "recuentos"
      referencedColumns: ["id"]
    }
                  ]
                },"recuentos": {
                  Row: {
                    "asiento_id": string | null,"confirmado_at": string | null,"confirmado_por": string | null,"creado_por": string | null,"created_at": string,"estado": string,"id": number,"notas": string | null,"numero": string
                  }
                  Insert: {
                    "asiento_id"?: string | null,"confirmado_at"?: string | null,"confirmado_por"?: string | null,"creado_por"?: string | null,"created_at"?: string,"estado"?: string,"id"?: never,"notas"?: string | null,"numero"?: string
                  }
                  Update: {
                    "asiento_id"?: string | null,"confirmado_at"?: string | null,"confirmado_por"?: string | null,"creado_por"?: string | null,"created_at"?: string,"estado"?: string,"id"?: never,"notas"?: string | null,"numero"?: string
                  }
                  Relationships: [
                    
                  ]
                },"ventas": {
                  Row: {
                    "anulada": boolean,"asiento_entrega_id": string | null,"asiento_id": string,"costo": number,"created_at": string,"cuenta_ingreso_id": string,"fecha": string,"monto_donacion": number,"monto_encargues": number,"monto_ventas": number,"pedido_id": number
                  }
                  Insert: {
                    "anulada"?: boolean,"asiento_entrega_id"?: string | null,"asiento_id": string,"costo": number,"created_at"?: string,"cuenta_ingreso_id": string,"fecha": string,"monto_donacion": number,"monto_encargues": number,"monto_ventas": number,"pedido_id": number
                  }
                  Update: {
                    "anulada"?: boolean,"asiento_entrega_id"?: string | null,"asiento_id"?: string,"costo"?: number,"created_at"?: string,"cuenta_ingreso_id"?: string,"fecha"?: string,"monto_donacion"?: number,"monto_encargues"?: number,"monto_ventas"?: number,"pedido_id"?: number
                  }
                  Relationships: [
                    
                  ]
                }
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "_anular_pedido":
{ Args: { "p_motivo": string,"p_pedido": number }; Returns: Json
                           },
"_arqueo":
{ Args: { "p_contado": number,"p_momento": string,"p_sesion": number }; Returns: number
                           },
"_centro_venta":
{ Args: { "p_pedido": unknown }; Returns: string
                           },
"_contabilizar_efectivo_mixto":
{ Args: { "p_pedido": number }; Returns: string
                           },
"_contabilizar_venta":
{ Args: { "p_costo": number,"p_medio": string,"p_pedido": number }; Returns: string
                           },
"_cuenta":
{ Args: { "p_rol": string }; Returns: string
                           },
"_cuenta_compras":
{ Args: { "p_moneda": string,"p_rol": string }; Returns: string
                           },
"_entrada":
{ Args: { "p_cantidad": number,"p_costo": number,"p_fecha": string,"p_item": number,"p_motivo"?: string,"p_origen_id": string,"p_origen_tipo": string,"p_tipo": string }; Returns: number
                           },
"_exigir_caja_abierta":
{ Args: Record<PropertyKey, never>; Returns: undefined
                           },
"_exigir_operador":
{ Args: Record<PropertyKey, never>; Returns: undefined
                           },
"_item":
{ Args: { "p_producto": number,"p_variante": number }; Returns: {
              "id": number,
"metodo_costeo": string,
"producto_id": number,
"stock": number,
"updated_at": string,
"valor": number,
"variante_id": number | null
            }
                          SetofOptions: {
        from: "*"
        to: "items"
        isOneToOne: true
        isSetofReturn: false
      } },
"_saldo_caja":
{ Args: { "p_caja": number }; Returns: number
                           },
"_salida":
{ Args: { "p_cantidad": number,"p_fecha": string,"p_item": number,"p_motivo"?: string,"p_origen_id": string,"p_origen_tipo": string,"p_tipo": string }; Returns: number
                           },
"_salida_pedido":
{ Args: { "p_motivo": string,"p_pedido": number }; Returns: number
                           },
"_sincronizar_publico":
{ Args: { "p_item": Database["comercial"]['Tables']["items"]['Row'] }; Returns: undefined
                           },
"_tc":
{ Args: { "p_fecha": string,"p_moneda": string,"p_tc": number }; Returns: number
                           },
"_vincular_asiento":
{ Args: { "p_asiento": string,"p_origen_id": string,"p_origen_tipo": string }; Returns: undefined
                           },
"abrir_caja":
{ Args: { "p_caja": number,"p_contado": number,"p_notas"?: string }; Returns: number
                           },
"anular_documento_proveedor":
{ Args: { "p_id": number,"p_motivo": string }; Returns: undefined
                           },
"anular_orden_pago":
{ Args: { "p_id": number,"p_motivo": string }; Returns: undefined
                           },
"aplicar_anticipo":
{ Args: { "p_documento": number,"p_importe": number,"p_pago": number }; Returns: number
                           },
"aplicar_nota_credito":
{ Args: { "p_documento": number,"p_importe": number,"p_nota": number }; Returns: number
                           },
"aprobar_orden_compra":
{ Args: { "p_id": number }; Returns: undefined
                           },
"cambiar_metodo_costeo":
{ Args: { "p_metodo": string,"p_producto": number }; Returns: undefined
                           },
"cancelar_orden_compra":
{ Args: { "p_id": number }; Returns: undefined
                           },
"cargar_inventario_inicial":
{ Args: { "p_items": Json }; Returns: number
                           },
"cerrar_caja":
{ Args: { "p_contado": number,"p_notas"?: string,"p_sesion": number }; Returns: number
                           },
"confirmar_recuento":
{ Args: { "p_id": number }; Returns: Json
                           },
"control_mercaderia":
{ Args: Record<PropertyKey, never>; Returns: {
              "diferencia": number,"movimientos_sin_asiento": number,"saldo_contable": number,"valor_stock": number
            }[]
                           },
"control_proveedores":
{ Args: Record<PropertyKey, never>; Returns: {
              "diferencia": number,"moneda": string,"proveedor_id": number,"saldo_contable": number,"saldo_documentos": number
            }[]
                           },
"crear_orden_pago":
{ Args: { "p_aplicaciones"?: Json,"p_cuenta_pago": string,"p_importe": number,"p_moneda": string,"p_notas"?: string,"p_proveedor": number,"p_referencia"?: string }; Returns: number
                           },
"descartar_recuento":
{ Args: { "p_id": number }; Returns: undefined
                           },
"guardar_orden_compra":
{ Args: { "p_fecha": string,"p_id": number,"p_items": Json,"p_moneda": string,"p_notas"?: string,"p_proveedor": number }; Returns: number
                           },
"guardar_recuento":
{ Args: { "p_conteos": Json,"p_id": number,"p_notas"?: string }; Returns: number
                           },
"movimiento_caja":
{ Args: { "p_centro_costo"?: string,"p_cuenta_contrapartida": string,"p_descripcion": string,"p_importe": number,"p_sesion": number,"p_tipo": string }; Returns: number
                           },
"pagar_orden":
{ Args: { "p_fecha"?: string,"p_id": number,"p_tc"?: number }; Returns: string
                           },
"puede_operar":
{ Args: Record<PropertyKey, never>; Returns: boolean
                           },
"puede_ver":
{ Args: Record<PropertyKey, never>; Returns: boolean
                           },
"recibir_mercaderia":
{ Args: { "p_fecha": string,"p_idempotency_key"?: string,"p_items": Json,"p_moneda": string,"p_orden": number,"p_proveedor": number,"p_remito"?: string,"p_tc"?: number }; Returns: number
                           },
"registrar_baja":
{ Args: { "p_centro_costo"?: string,"p_descripcion": string,"p_items": Json,"p_tipo": string }; Returns: number
                           },
"registrar_devolucion":
{ Args: { "p_devueltos": Json,"p_medio": string,"p_motivo": string,"p_nuevos"?: Json,"p_pedido": number }; Returns: number
                           },
"registrar_documento_proveedor":
{ Args: { "p_cuenta_pago"?: string,"p_fecha": string,"p_lineas": Json,"p_moneda": string,"p_notas"?: string,"p_numero": string,"p_proveedor": number,"p_serie": string,"p_tc"?: number,"p_tipo": string,"p_vencimiento"?: string }; Returns: number
                           },
"resumen_caja":
{ Args: { "p_sesion": number }; Returns: {
              "cantidad": number,"concepto": string,"entradas": number,"salidas": number
            }[]
                           },
"saldo_caja":
{ Args: { "p_caja": number }; Returns: number
                           },
"saldo_documento":
{ Args: { "p_documento": number }; Returns: number
                           },
"saldo_pago":
{ Args: { "p_pago": number }; Returns: number
                           }
          }
          Enums: {
            [_ in never]: never
          }
          CompositeTypes: {
            [_ in never]: never
          }
        }
}

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
  ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
      Row: infer R
    }
    ? R
    : never
  : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
  ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
      Insert: infer I
    }
    ? I
    : never
  : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
  ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
      Update: infer U
    }
    ? U
    : never
  : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
  ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
  : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
  ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
  : never

export const Constants = {
  "comercial": {
          Enums: {
            
          }
        }
} as const
