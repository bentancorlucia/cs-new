
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  
  "socios": {
          Tables: {
            "aplicaciones": {
                  Row: {
                    "anulada": boolean,"asiento_id": string,"cobro_id": number,"cuota_id": number,"fecha": string,"id": number,"importe": number,"persona_id": number
                  }
                  Insert: {
                    "anulada"?: boolean,"asiento_id": string,"cobro_id": number,"cuota_id": number,"fecha": string,"id"?: never,"importe": number,"persona_id": number
                  }
                  Update: {
                    "anulada"?: boolean,"asiento_id"?: string,"cobro_id"?: number,"cuota_id"?: number,"fecha"?: string,"id"?: never,"importe"?: number,"persona_id"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "aplicaciones_cobro_id_fkey"
      columns: ["cobro_id"]
isOneToOne: false
      referencedRelation: "cobros"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "aplicaciones_cobro_id_fkey"
      columns: ["cobro_id"]
isOneToOne: false
      referencedRelation: "cobros_saldo"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "aplicaciones_cuota_id_persona_id_fkey"
      columns: ["cuota_id","persona_id"]
isOneToOne: false
      referencedRelation: "cuotas"
      referencedColumns: ["id","persona_id"]
    },{
      foreignKeyName: "aplicaciones_cuota_id_persona_id_fkey"
      columns: ["cuota_id","persona_id"]
isOneToOne: false
      referencedRelation: "cuotas_saldo"
      referencedColumns: ["id","persona_id"]
    }
                  ]
                },"cambios_disciplina": {
                  Row: {
                    "afecta_debito": boolean,"antes": Json | null,"aplicado_at": string | null,"aplicado_por": string | null,"created_at": string,"descripcion": string,"despues": Json | null,"disciplina_id": number | null,"estado_debito": string,"hecho_por": string | null,"hecho_por_nombre": string | null,"id": number,"notas_aplicacion": string | null,"origen": string,"persona_id": number | null,"tarjeta_secreto_id": string | null,"tipo": string,"vigencia": string | null
                  }
                  Insert: {
                    "afecta_debito"?: boolean,"antes"?: Json | null,"aplicado_at"?: string | null,"aplicado_por"?: string | null,"created_at"?: string,"descripcion": string,"despues"?: Json | null,"disciplina_id"?: number | null,"estado_debito"?: string,"hecho_por"?: string | null,"hecho_por_nombre"?: string | null,"id"?: never,"notas_aplicacion"?: string | null,"origen": string,"persona_id"?: number | null,"tarjeta_secreto_id"?: string | null,"tipo": string,"vigencia"?: string | null
                  }
                  Update: {
                    "afecta_debito"?: boolean,"antes"?: Json | null,"aplicado_at"?: string | null,"aplicado_por"?: string | null,"created_at"?: string,"descripcion"?: string,"despues"?: Json | null,"disciplina_id"?: number | null,"estado_debito"?: string,"hecho_por"?: string | null,"hecho_por_nombre"?: string | null,"id"?: never,"notas_aplicacion"?: string | null,"origen"?: string,"persona_id"?: number | null,"tarjeta_secreto_id"?: string | null,"tipo"?: string,"vigencia"?: string | null
                  }
                  Relationships: [
                    
                  ]
                },"cobros": {
                  Row: {
                    "anulado_at": string | null,"anulado_por": string | null,"asiento_id": string,"creado_por": string | null,"created_at": string,"cuenta_id": string | null,"disciplina_id": number | null,"estado": string,"fecha": string,"id": number,"importe": number,"liquidacion_disciplina_id": number | null,"liquidacion_visa_id": number | null,"medio": string,"motivo_anulacion": string | null,"persona_id": number,"referencia": string | null
                  }
                  Insert: {
                    "anulado_at"?: string | null,"anulado_por"?: string | null,"asiento_id": string,"creado_por"?: string | null,"created_at"?: string,"cuenta_id"?: string | null,"disciplina_id"?: number | null,"estado"?: string,"fecha": string,"id"?: never,"importe": number,"liquidacion_disciplina_id"?: number | null,"liquidacion_visa_id"?: number | null,"medio": string,"motivo_anulacion"?: string | null,"persona_id": number,"referencia"?: string | null
                  }
                  Update: {
                    "anulado_at"?: string | null,"anulado_por"?: string | null,"asiento_id"?: string,"creado_por"?: string | null,"created_at"?: string,"cuenta_id"?: string | null,"disciplina_id"?: number | null,"estado"?: string,"fecha"?: string,"id"?: never,"importe"?: number,"liquidacion_disciplina_id"?: number | null,"liquidacion_visa_id"?: number | null,"medio"?: string,"motivo_anulacion"?: string | null,"persona_id"?: number,"referencia"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "cobros_liquidacion_disciplina_id_fkey"
      columns: ["liquidacion_disciplina_id"]
isOneToOne: false
      referencedRelation: "liquidaciones_disciplina"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "cobros_liquidacion_disciplina_id_fkey"
      columns: ["liquidacion_disciplina_id"]
isOneToOne: false
      referencedRelation: "liquidaciones_disciplina_saldo"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "cobros_liquidacion_visa_id_fkey"
      columns: ["liquidacion_visa_id"]
isOneToOne: false
      referencedRelation: "liquidaciones_visa"
      referencedColumns: ["id"]
    }
                  ]
                },"cobros_disciplina": {
                  Row: {
                    "anulado_at": string | null,"anulado_por": string | null,"asiento_id": string,"creado_por": string | null,"created_at": string,"cuenta_id": string,"disciplina_id": number,"estado": string,"fecha": string,"id": number,"importe": number,"motivo_anulacion": string | null,"notas": string | null,"referencia": string | null
                  }
                  Insert: {
                    "anulado_at"?: string | null,"anulado_por"?: string | null,"asiento_id": string,"creado_por"?: string | null,"created_at"?: string,"cuenta_id": string,"disciplina_id": number,"estado"?: string,"fecha": string,"id"?: never,"importe": number,"motivo_anulacion"?: string | null,"notas"?: string | null,"referencia"?: string | null
                  }
                  Update: {
                    "anulado_at"?: string | null,"anulado_por"?: string | null,"asiento_id"?: string,"creado_por"?: string | null,"created_at"?: string,"cuenta_id"?: string,"disciplina_id"?: number,"estado"?: string,"fecha"?: string,"id"?: never,"importe"?: number,"motivo_anulacion"?: string | null,"notas"?: string | null,"referencia"?: string | null
                  }
                  Relationships: [
                    
                  ]
                },"config": {
                  Row: {
                    "baja_con_deuda": string,"centro_club_id": string | null,"cobrar_mes_alta": boolean,"dia_vencimiento": number,"id": boolean,"mes_cuota_anual": number,"tolerancia_cuotas": number,"tolerancia_debito": number,"updated_at": string,"updated_by": string | null
                  }
                  Insert: {
                    "baja_con_deuda"?: string,"centro_club_id"?: string | null,"cobrar_mes_alta"?: boolean,"dia_vencimiento"?: number,"id"?: boolean,"mes_cuota_anual"?: number,"tolerancia_cuotas"?: number,"tolerancia_debito"?: number,"updated_at"?: string,"updated_by"?: string | null
                  }
                  Update: {
                    "baja_con_deuda"?: string,"centro_club_id"?: string | null,"cobrar_mes_alta"?: boolean,"dia_vencimiento"?: number,"id"?: boolean,"mes_cuota_anual"?: number,"tolerancia_cuotas"?: number,"tolerancia_debito"?: number,"updated_at"?: string,"updated_by"?: string | null
                  }
                  Relationships: [
                    
                  ]
                },"credito_aplicaciones": {
                  Row: {
                    "anulada": boolean,"credito_id": number,"cuota_id": number,"importe": number,"persona_id": number
                  }
                  Insert: {
                    "anulada"?: boolean,"credito_id": number,"cuota_id": number,"importe": number,"persona_id": number
                  }
                  Update: {
                    "anulada"?: boolean,"credito_id"?: number,"cuota_id"?: number,"importe"?: number,"persona_id"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "credito_aplicaciones_credito_id_fkey"
      columns: ["credito_id"]
isOneToOne: false
      referencedRelation: "creditos"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "credito_aplicaciones_cuota_id_persona_id_fkey"
      columns: ["cuota_id","persona_id"]
isOneToOne: false
      referencedRelation: "cuotas"
      referencedColumns: ["id","persona_id"]
    },{
      foreignKeyName: "credito_aplicaciones_cuota_id_persona_id_fkey"
      columns: ["cuota_id","persona_id"]
isOneToOne: false
      referencedRelation: "cuotas_saldo"
      referencedColumns: ["id","persona_id"]
    }
                  ]
                },"creditos": {
                  Row: {
                    "anulado_at": string | null,"anulado_por": string | null,"asiento_id": string,"creado_por": string | null,"created_at": string,"estado": string,"fecha": string,"id": number,"importe": number,"motivo": string,"motivo_anulacion": string | null,"persona_id": number,"tipo": string
                  }
                  Insert: {
                    "anulado_at"?: string | null,"anulado_por"?: string | null,"asiento_id": string,"creado_por"?: string | null,"created_at"?: string,"estado"?: string,"fecha": string,"id"?: never,"importe": number,"motivo": string,"motivo_anulacion"?: string | null,"persona_id": number,"tipo": string
                  }
                  Update: {
                    "anulado_at"?: string | null,"anulado_por"?: string | null,"asiento_id"?: string,"creado_por"?: string | null,"created_at"?: string,"estado"?: string,"fecha"?: string,"id"?: never,"importe"?: number,"motivo"?: string,"motivo_anulacion"?: string | null,"persona_id"?: number,"tipo"?: string
                  }
                  Relationships: [
                    
                  ]
                },"cuotas": {
                  Row: {
                    "asiento_id": string,"centro_costo_id": string | null,"concepto": string,"creado_por": string | null,"created_at": string,"cuenta_cobrar_id": string,"cuenta_ingreso_id": string,"disciplina_id": number | null,"disciplina_responsable_id": number | null,"estado": string,"fecha_emision": string,"fecha_vencimiento": string,"id": number,"importe": number,"lote_id": number | null,"motivo_importe": string | null,"periodicidad": string,"periodo_desde": string,"periodo_hasta": string,"persona_id": number,"plan_id": number | null,"precio_id": number | null,"suscripcion_id": number | null,"tipo": string
                  }
                  Insert: {
                    "asiento_id": string,"centro_costo_id"?: string | null,"concepto": string,"creado_por"?: string | null,"created_at"?: string,"cuenta_cobrar_id": string,"cuenta_ingreso_id": string,"disciplina_id"?: number | null,"disciplina_responsable_id"?: number | null,"estado"?: string,"fecha_emision": string,"fecha_vencimiento": string,"id"?: never,"importe": number,"lote_id"?: number | null,"motivo_importe"?: string | null,"periodicidad": string,"periodo_desde": string,"periodo_hasta": string,"persona_id": number,"plan_id"?: number | null,"precio_id"?: number | null,"suscripcion_id"?: number | null,"tipo": string
                  }
                  Update: {
                    "asiento_id"?: string,"centro_costo_id"?: string | null,"concepto"?: string,"creado_por"?: string | null,"created_at"?: string,"cuenta_cobrar_id"?: string,"cuenta_ingreso_id"?: string,"disciplina_id"?: number | null,"disciplina_responsable_id"?: number | null,"estado"?: string,"fecha_emision"?: string,"fecha_vencimiento"?: string,"id"?: never,"importe"?: number,"lote_id"?: number | null,"motivo_importe"?: string | null,"periodicidad"?: string,"periodo_desde"?: string,"periodo_hasta"?: string,"persona_id"?: number,"plan_id"?: number | null,"precio_id"?: number | null,"suscripcion_id"?: number | null,"tipo"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "cuotas_lote_id_fkey"
      columns: ["lote_id"]
isOneToOne: false
      referencedRelation: "lotes"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "cuotas_plan_id_fkey"
      columns: ["plan_id"]
isOneToOne: false
      referencedRelation: "planes"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "cuotas_precio_id_fkey"
      columns: ["precio_id"]
isOneToOne: false
      referencedRelation: "plan_precios"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "cuotas_suscripcion_id_fkey"
      columns: ["suscripcion_id"]
isOneToOne: false
      referencedRelation: "suscripciones"
      referencedColumns: ["id"]
    }
                  ]
                },"disciplinas_cobranza": {
                  Row: {
                    "datos_transferencia": string | null,"disciplina_id": number,"porcentaje_comision": number,"updated_at": string
                  }
                  Insert: {
                    "datos_transferencia"?: string | null,"disciplina_id": number,"porcentaje_comision"?: number,"updated_at"?: string
                  }
                  Update: {
                    "datos_transferencia"?: string | null,"disciplina_id"?: number,"porcentaje_comision"?: number,"updated_at"?: string
                  }
                  Relationships: [
                    
                  ]
                },"liquidacion_visa_comisiones": {
                  Row: {
                    "cobrado": number,"comision": number,"disciplina_id": number | null,"importe": number,"iva": number,"liquidacion_visa_id": number
                  }
                  Insert: {
                    "cobrado"?: number,"comision"?: number,"disciplina_id"?: number | null,"importe": number,"iva"?: number,"liquidacion_visa_id": number
                  }
                  Update: {
                    "cobrado"?: number,"comision"?: number,"disciplina_id"?: number | null,"importe"?: number,"iva"?: number,"liquidacion_visa_id"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "liquidacion_visa_comisiones_liquidacion_visa_id_fkey"
      columns: ["liquidacion_visa_id"]
isOneToOne: false
      referencedRelation: "liquidaciones_visa"
      referencedColumns: ["id"]
    }
                  ]
                },"liquidacion_visa_rechazos": {
                  Row: {
                    "documento": string | null,"id": number,"importe": number,"liquidacion_visa_id": number,"motivo": string | null,"persona_id": number | null
                  }
                  Insert: {
                    "documento"?: string | null,"id"?: never,"importe": number,"liquidacion_visa_id": number,"motivo"?: string | null,"persona_id"?: number | null
                  }
                  Update: {
                    "documento"?: string | null,"id"?: never,"importe"?: number,"liquidacion_visa_id"?: number,"motivo"?: string | null,"persona_id"?: number | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "liquidacion_visa_rechazos_liquidacion_visa_id_fkey"
      columns: ["liquidacion_visa_id"]
isOneToOne: false
      referencedRelation: "liquidaciones_visa"
      referencedColumns: ["id"]
    }
                  ]
                },"liquidaciones_disciplina": {
                  Row: {
                    "a_depositar": number,"anulado_at": string | null,"anulado_por": string | null,"asiento_id": string,"cobrado": number,"comision": number,"creado_por": string | null,"created_at": string,"cuota_social": number,"desde": string,"detalle": NonNullable<Json>,"disciplina_id": number,"estado": string,"fecha": string,"gastos_comision": number,"gastos_iva": number,"hasta": string,"id": number,"importe": number,"motivo_anulacion": string | null,"notas": string | null,"otros_cobrado": number,"periodo": string,"social_a_cargo": number,"socios": number,"visa_cobrado": number,"visa_social": number
                  }
                  Insert: {
                    "a_depositar"?: number,"anulado_at"?: string | null,"anulado_por"?: string | null,"asiento_id": string,"cobrado": number,"comision": number,"creado_por"?: string | null,"created_at"?: string,"cuota_social"?: number,"desde": string,"detalle"?: NonNullable<Json>,"disciplina_id": number,"estado"?: string,"fecha": string,"gastos_comision"?: number,"gastos_iva"?: number,"hasta": string,"id"?: never,"importe": number,"motivo_anulacion"?: string | null,"notas"?: string | null,"otros_cobrado"?: number,"periodo": string,"social_a_cargo"?: number,"socios"?: number,"visa_cobrado"?: number,"visa_social"?: number
                  }
                  Update: {
                    "a_depositar"?: number,"anulado_at"?: string | null,"anulado_por"?: string | null,"asiento_id"?: string,"cobrado"?: number,"comision"?: number,"creado_por"?: string | null,"created_at"?: string,"cuota_social"?: number,"desde"?: string,"detalle"?: NonNullable<Json>,"disciplina_id"?: number,"estado"?: string,"fecha"?: string,"gastos_comision"?: number,"gastos_iva"?: number,"hasta"?: string,"id"?: never,"importe"?: number,"motivo_anulacion"?: string | null,"notas"?: string | null,"otros_cobrado"?: number,"periodo"?: string,"social_a_cargo"?: number,"socios"?: number,"visa_cobrado"?: number,"visa_social"?: number
                  }
                  Relationships: [
                    
                  ]
                },"liquidaciones_visa": {
                  Row: {
                    "anulado_at": string | null,"anulado_por": string | null,"archivo": string | null,"asiento_id": string,"bruto": number,"comision": number,"creado_por": string | null,"created_at": string,"cuenta_id": string,"estado": string,"fecha": string,"id": number,"iva": number,"motivo_anulacion": string | null,"periodo": string
                  }
                  Insert: {
                    "anulado_at"?: string | null,"anulado_por"?: string | null,"archivo"?: string | null,"asiento_id": string,"bruto": number,"comision": number,"creado_por"?: string | null,"created_at"?: string,"cuenta_id": string,"estado"?: string,"fecha": string,"id"?: never,"iva"?: number,"motivo_anulacion"?: string | null,"periodo": string
                  }
                  Update: {
                    "anulado_at"?: string | null,"anulado_por"?: string | null,"archivo"?: string | null,"asiento_id"?: string,"bruto"?: number,"comision"?: number,"creado_por"?: string | null,"created_at"?: string,"cuenta_id"?: string,"estado"?: string,"fecha"?: string,"id"?: never,"iva"?: number,"motivo_anulacion"?: string | null,"periodo"?: string
                  }
                  Relationships: [
                    
                  ]
                },"lotes": {
                  Row: {
                    "anulado_at": string | null,"anulado_por": string | null,"asiento_id": string,"cantidad": number,"creado_por": string | null,"created_at": string,"estado": string,"fecha_emision": string,"fecha_vencimiento": string,"id": number,"importe_total": number,"motivo_anulacion": string | null,"periodo": string
                  }
                  Insert: {
                    "anulado_at"?: string | null,"anulado_por"?: string | null,"asiento_id": string,"cantidad": number,"creado_por"?: string | null,"created_at"?: string,"estado"?: string,"fecha_emision": string,"fecha_vencimiento": string,"id"?: never,"importe_total": number,"motivo_anulacion"?: string | null,"periodo": string
                  }
                  Update: {
                    "anulado_at"?: string | null,"anulado_por"?: string | null,"asiento_id"?: string,"cantidad"?: number,"creado_por"?: string | null,"created_at"?: string,"estado"?: string,"fecha_emision"?: string,"fecha_vencimiento"?: string,"id"?: never,"importe_total"?: number,"motivo_anulacion"?: string | null,"periodo"?: string
                  }
                  Relationships: [
                    
                  ]
                },"medios_cobro": {
                  Row: {
                    "creado_por": string | null,"created_at": string,"desde": string,"disciplina_id": number | null,"hasta": string | null,"id": number,"medio": string,"persona_id": number,"tarjeta_emisor": string | null,"tarjeta_ultimos4": string | null,"tarjeta_vencimiento": string | null,"titular_documento": string | null,"titular_nombre": string | null
                  }
                  Insert: {
                    "creado_por"?: string | null,"created_at"?: string,"desde": string,"disciplina_id"?: number | null,"hasta"?: string | null,"id"?: never,"medio": string,"persona_id": number,"tarjeta_emisor"?: string | null,"tarjeta_ultimos4"?: string | null,"tarjeta_vencimiento"?: string | null,"titular_documento"?: string | null,"titular_nombre"?: string | null
                  }
                  Update: {
                    "creado_por"?: string | null,"created_at"?: string,"desde"?: string,"disciplina_id"?: number | null,"hasta"?: string | null,"id"?: never,"medio"?: string,"persona_id"?: number,"tarjeta_emisor"?: string | null,"tarjeta_ultimos4"?: string | null,"tarjeta_vencimiento"?: string | null,"titular_documento"?: string | null,"titular_nombre"?: string | null
                  }
                  Relationships: [
                    
                  ]
                },"membresias": {
                  Row: {
                    "creado_por": string | null,"created_at": string,"desde": string,"hasta": string | null,"id": number,"motivo_baja_id": number | null,"notas_baja": string | null,"persona_id": number
                  }
                  Insert: {
                    "creado_por"?: string | null,"created_at"?: string,"desde": string,"hasta"?: string | null,"id"?: never,"motivo_baja_id"?: number | null,"notas_baja"?: string | null,"persona_id": number
                  }
                  Update: {
                    "creado_por"?: string | null,"created_at"?: string,"desde"?: string,"hasta"?: string | null,"id"?: never,"motivo_baja_id"?: number | null,"notas_baja"?: string | null,"persona_id"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "membresias_motivo_baja_id_fkey"
      columns: ["motivo_baja_id"]
isOneToOne: false
      referencedRelation: "motivos_baja"
      referencedColumns: ["id"]
    }
                  ]
                },"motivos_baja": {
                  Row: {
                    "activo": boolean,"id": number,"nombre": string
                  }
                  Insert: {
                    "activo"?: boolean,"id"?: never,"nombre": string
                  }
                  Update: {
                    "activo"?: boolean,"id"?: never,"nombre"?: string
                  }
                  Relationships: [
                    
                  ]
                },"pagos_liquidacion": {
                  Row: {
                    "anulado_at": string | null,"anulado_por": string | null,"asiento_id": string,"compensado": number,"creado_por": string | null,"created_at": string,"cuenta_id": string | null,"estado": string,"fecha": string,"id": number,"liquidacion_id": number,"motivo_anulacion": string | null,"notas": string | null,"referencia": string | null,"transferido": number
                  }
                  Insert: {
                    "anulado_at"?: string | null,"anulado_por"?: string | null,"asiento_id": string,"compensado"?: number,"creado_por"?: string | null,"created_at"?: string,"cuenta_id"?: string | null,"estado"?: string,"fecha": string,"id"?: never,"liquidacion_id": number,"motivo_anulacion"?: string | null,"notas"?: string | null,"referencia"?: string | null,"transferido"?: number
                  }
                  Update: {
                    "anulado_at"?: string | null,"anulado_por"?: string | null,"asiento_id"?: string,"compensado"?: number,"creado_por"?: string | null,"created_at"?: string,"cuenta_id"?: string | null,"estado"?: string,"fecha"?: string,"id"?: never,"liquidacion_id"?: number,"motivo_anulacion"?: string | null,"notas"?: string | null,"referencia"?: string | null,"transferido"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "pagos_liquidacion_liquidacion_id_fkey"
      columns: ["liquidacion_id"]
isOneToOne: false
      referencedRelation: "liquidaciones_disciplina"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "pagos_liquidacion_liquidacion_id_fkey"
      columns: ["liquidacion_id"]
isOneToOne: false
      referencedRelation: "liquidaciones_disciplina_saldo"
      referencedColumns: ["id"]
    }
                  ]
                },"plan_pago_aplicaciones": {
                  Row: {
                    "anulada": boolean,"cobro_id": number | null,"cuota_id": number,"fecha": string,"id": number,"importe": number,"liquidacion_id": number | null,"pago_liquidacion_id": number | null
                  }
                  Insert: {
                    "anulada"?: boolean,"cobro_id"?: number | null,"cuota_id": number,"fecha": string,"id"?: never,"importe": number,"liquidacion_id"?: number | null,"pago_liquidacion_id"?: number | null
                  }
                  Update: {
                    "anulada"?: boolean,"cobro_id"?: number | null,"cuota_id"?: number,"fecha"?: string,"id"?: never,"importe"?: number,"liquidacion_id"?: number | null,"pago_liquidacion_id"?: number | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "plan_pago_aplicaciones_cobro_id_fkey"
      columns: ["cobro_id"]
isOneToOne: false
      referencedRelation: "cobros_disciplina"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "plan_pago_aplicaciones_cuota_id_fkey"
      columns: ["cuota_id"]
isOneToOne: false
      referencedRelation: "plan_pago_cuotas"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "plan_pago_aplicaciones_cuota_id_fkey"
      columns: ["cuota_id"]
isOneToOne: false
      referencedRelation: "plan_pago_cuotas_saldo"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "plan_pago_aplicaciones_liquidacion_id_fkey"
      columns: ["liquidacion_id"]
isOneToOne: false
      referencedRelation: "liquidaciones_disciplina"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "plan_pago_aplicaciones_liquidacion_id_fkey"
      columns: ["liquidacion_id"]
isOneToOne: false
      referencedRelation: "liquidaciones_disciplina_saldo"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "plan_pago_aplicaciones_pago_liquidacion_id_fkey"
      columns: ["pago_liquidacion_id"]
isOneToOne: false
      referencedRelation: "pagos_liquidacion"
      referencedColumns: ["id"]
    }
                  ]
                },"plan_pago_cuotas": {
                  Row: {
                    "id": number,"importe": number,"numero": number,"plan_id": number,"vencimiento": string
                  }
                  Insert: {
                    "id"?: never,"importe": number,"numero": number,"plan_id": number,"vencimiento": string
                  }
                  Update: {
                    "id"?: never,"importe"?: number,"numero"?: number,"plan_id"?: number,"vencimiento"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "plan_pago_cuotas_plan_id_fkey"
      columns: ["plan_id"]
isOneToOne: false
      referencedRelation: "planes_pago"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "plan_pago_cuotas_plan_id_fkey"
      columns: ["plan_id"]
isOneToOne: false
      referencedRelation: "planes_pago_resumen"
      referencedColumns: ["id"]
    }
                  ]
                },"plan_pago_pedidos": {
                  Row: {
                    "importe": number,"pedido_id": number,"plan_id": number
                  }
                  Insert: {
                    "importe": number,"pedido_id": number,"plan_id": number
                  }
                  Update: {
                    "importe"?: number,"pedido_id"?: number,"plan_id"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "plan_pago_pedidos_plan_id_fkey"
      columns: ["plan_id"]
isOneToOne: false
      referencedRelation: "planes_pago"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "plan_pago_pedidos_plan_id_fkey"
      columns: ["plan_id"]
isOneToOne: false
      referencedRelation: "planes_pago_resumen"
      referencedColumns: ["id"]
    }
                  ]
                },"plan_precios": {
                  Row: {
                    "creado_por": string | null,"created_at": string,"id": number,"importe_anual": number | null,"importe_mensual": number,"plan_id": number,"vigente_desde": string
                  }
                  Insert: {
                    "creado_por"?: string | null,"created_at"?: string,"id"?: never,"importe_anual"?: number | null,"importe_mensual": number,"plan_id": number,"vigente_desde": string
                  }
                  Update: {
                    "creado_por"?: string | null,"created_at"?: string,"id"?: never,"importe_anual"?: number | null,"importe_mensual"?: number,"plan_id"?: number,"vigente_desde"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "plan_precios_plan_id_fkey"
      columns: ["plan_id"]
isOneToOne: false
      referencedRelation: "planes"
      referencedColumns: ["id"]
    }
                  ]
                },"planes": {
                  Row: {
                    "activo": boolean,"created_at": string,"disciplina_id": number | null,"id": number,"nombre": string,"permite_anual": boolean,"tipo": string
                  }
                  Insert: {
                    "activo"?: boolean,"created_at"?: string,"disciplina_id"?: number | null,"id"?: never,"nombre": string,"permite_anual"?: boolean,"tipo": string
                  }
                  Update: {
                    "activo"?: boolean,"created_at"?: string,"disciplina_id"?: number | null,"id"?: never,"nombre"?: string,"permite_anual"?: boolean,"tipo"?: string
                  }
                  Relationships: [
                    
                  ]
                },"planes_pago": {
                  Row: {
                    "cancelado_at": string | null,"cancelado_por": string | null,"creado_por": string | null,"created_at": string,"descripcion": string,"disciplina_id": number,"estado": string,"id": number,"importe_total": number,"motivo_cancelacion": string | null,"notas": string | null
                  }
                  Insert: {
                    "cancelado_at"?: string | null,"cancelado_por"?: string | null,"creado_por"?: string | null,"created_at"?: string,"descripcion": string,"disciplina_id": number,"estado"?: string,"id"?: never,"importe_total": number,"motivo_cancelacion"?: string | null,"notas"?: string | null
                  }
                  Update: {
                    "cancelado_at"?: string | null,"cancelado_por"?: string | null,"creado_por"?: string | null,"created_at"?: string,"descripcion"?: string,"disciplina_id"?: number,"estado"?: string,"id"?: never,"importe_total"?: number,"motivo_cancelacion"?: string | null,"notas"?: string | null
                  }
                  Relationships: [
                    
                  ]
                },"representantes": {
                  Row: {
                    "acceso_panel": boolean,"activo": boolean,"cargo": string | null,"creado_por": string | null,"created_at": string,"disciplina_id": number,"email": string,"id": number,"nombre": string,"perfil_id": string | null,"recibe_liquidacion": boolean,"telefono": string | null,"updated_at": string
                  }
                  Insert: {
                    "acceso_panel"?: boolean,"activo"?: boolean,"cargo"?: string | null,"creado_por"?: string | null,"created_at"?: string,"disciplina_id": number,"email": string,"id"?: never,"nombre": string,"perfil_id"?: string | null,"recibe_liquidacion"?: boolean,"telefono"?: string | null,"updated_at"?: string
                  }
                  Update: {
                    "acceso_panel"?: boolean,"activo"?: boolean,"cargo"?: string | null,"creado_por"?: string | null,"created_at"?: string,"disciplina_id"?: number,"email"?: string,"id"?: never,"nombre"?: string,"perfil_id"?: string | null,"recibe_liquidacion"?: boolean,"telefono"?: string | null,"updated_at"?: string
                  }
                  Relationships: [
                    
                  ]
                },"suscripciones": {
                  Row: {
                    "creado_por": string | null,"created_at": string,"desde": string,"hasta": string | null,"id": number,"motivo_fin": string | null,"periodicidad": string,"persona_id": number,"plan_id": number
                  }
                  Insert: {
                    "creado_por"?: string | null,"created_at"?: string,"desde": string,"hasta"?: string | null,"id"?: never,"motivo_fin"?: string | null,"periodicidad"?: string,"persona_id": number,"plan_id": number
                  }
                  Update: {
                    "creado_por"?: string | null,"created_at"?: string,"desde"?: string,"hasta"?: string | null,"id"?: never,"motivo_fin"?: string | null,"periodicidad"?: string,"persona_id"?: number,"plan_id"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "suscripciones_plan_id_fkey"
      columns: ["plan_id"]
isOneToOne: false
      referencedRelation: "planes"
      referencedColumns: ["id"]
    }
                  ]
                },"tarjetas_consultas": {
                  Row: {
                    "cambio_id": number,"consultado_por": string | null,"consultado_por_nombre": string | null,"created_at": string,"id": number
                  }
                  Insert: {
                    "cambio_id": number,"consultado_por"?: string | null,"consultado_por_nombre"?: string | null,"created_at"?: string,"id"?: never
                  }
                  Update: {
                    "cambio_id"?: number,"consultado_por"?: string | null,"consultado_por_nombre"?: string | null,"created_at"?: string,"id"?: never
                  }
                  Relationships: [
                    {
      foreignKeyName: "tarjetas_consultas_cambio_id_fkey"
      columns: ["cambio_id"]
isOneToOne: false
      referencedRelation: "cambios_disciplina"
      referencedColumns: ["id"]
    }
                  ]
                }
          }
          Views: {
            "cobros_saldo": {
                  Row: {
                    "anulado_at": string | null,"anulado_por": string | null,"aplicado": number | null,"asiento_id": string | null,"creado_por": string | null,"created_at": string | null,"cuenta_id": string | null,"disciplina_id": number | null,"estado": string | null,"fecha": string | null,"id": number | null,"importe": number | null,"liquidacion_visa_id": number | null,"medio": string | null,"motivo_anulacion": string | null,"persona_id": number | null,"referencia": string | null,"saldo_a_favor": number | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "cobros_liquidacion_visa_id_fkey"
      columns: ["liquidacion_visa_id"]
isOneToOne: false
      referencedRelation: "liquidaciones_visa"
      referencedColumns: ["id"]
    }
                  ]
                },"cuotas_saldo": {
                  Row: {
                    "acreditado": number | null,"asiento_id": string | null,"centro_costo_id": string | null,"concepto": string | null,"creado_por": string | null,"created_at": string | null,"cuenta_cobrar_id": string | null,"cuenta_ingreso_id": string | null,"disciplina_id": number | null,"estado": string | null,"fecha_emision": string | null,"fecha_vencimiento": string | null,"id": number | null,"importe": number | null,"lote_id": number | null,"motivo_importe": string | null,"pagado": number | null,"periodicidad": string | null,"periodo_desde": string | null,"periodo_hasta": string | null,"persona_id": number | null,"plan_id": number | null,"precio_id": number | null,"saldo": number | null,"suscripcion_id": number | null,"tipo": string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "cuotas_lote_id_fkey"
      columns: ["lote_id"]
isOneToOne: false
      referencedRelation: "lotes"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "cuotas_plan_id_fkey"
      columns: ["plan_id"]
isOneToOne: false
      referencedRelation: "planes"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "cuotas_precio_id_fkey"
      columns: ["precio_id"]
isOneToOne: false
      referencedRelation: "plan_precios"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "cuotas_suscripcion_id_fkey"
      columns: ["suscripcion_id"]
isOneToOne: false
      referencedRelation: "suscripciones"
      referencedColumns: ["id"]
    }
                  ]
                },"liquidaciones_disciplina_saldo": {
                  Row: {
                    "a_depositar": number | null,"anulado_at": string | null,"anulado_por": string | null,"asiento_id": string | null,"cobrado": number | null,"comision": number | null,"compensado": number | null,"creado_por": string | null,"created_at": string | null,"cuota_social": number | null,"desde": string | null,"detalle": Json | null,"disciplina_id": number | null,"estado": string | null,"fecha": string | null,"gastos_comision": number | null,"gastos_iva": number | null,"hasta": string | null,"id": number | null,"importe": number | null,"motivo_anulacion": string | null,"notas": string | null,"otros_cobrado": number | null,"periodo": string | null,"saldo": number | null,"social_a_cargo": number | null,"socios": number | null,"transferido": number | null,"visa_cobrado": number | null,"visa_social": number | null
                  }
                  Relationships: [
                    
                  ]
                },"plan_pago_cuotas_saldo": {
                  Row: {
                    "id": number | null,"importe": number | null,"numero": number | null,"pagado": number | null,"plan_id": number | null,"saldo": number | null,"situacion": string | null,"vencimiento": string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "plan_pago_cuotas_plan_id_fkey"
      columns: ["plan_id"]
isOneToOne: false
      referencedRelation: "planes_pago"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "plan_pago_cuotas_plan_id_fkey"
      columns: ["plan_id"]
isOneToOne: false
      referencedRelation: "planes_pago_resumen"
      referencedColumns: ["id"]
    }
                  ]
                },"planes_pago_resumen": {
                  Row: {
                    "cancelado_at": string | null,"cancelado_por": string | null,"creado_por": string | null,"created_at": string | null,"cuotas": number | null,"cuotas_pagadas": number | null,"cuotas_vencidas": number | null,"descripcion": string | null,"disciplina_id": number | null,"estado": string | null,"id": number | null,"importe_total": number | null,"motivo_cancelacion": string | null,"notas": string | null,"pagado": number | null,"proximo_vencimiento": string | null,"saldo": number | null,"saldo_vencido": number | null,"situacion": string | null
                  }
                  Relationships: [
                    
                  ]
                }
          }
          Functions: {
            "_anular_aplicaciones_externas":
{ Args: { "p_cobros": (number)[],"p_fecha": string,"p_motivo": string }; Returns: undefined
                           },
"_aplicaciones_liquidables":
{ Args: { "p_disciplina": number,"p_periodo": string }; Returns: {
              "aplicacion_id": number,"cuota_id": number,"cuota_tipo": string,"importe": number,"persona_id": number,"via": string
            }[]
                           },
"_aplicar_a_plan":
{ Args: { "p_cobro": number,"p_disciplina": number,"p_fecha": string,"p_importe": number,"p_pago_liquidacion": number,"p_plan": number }; Returns: number
                           },
"_aplicar_saldo_a_favor":
{ Args: { "p_fecha": string,"p_persona": number }; Returns: number
                           },
"_centro_disciplina":
{ Args: { "p_disciplina": number }; Returns: string
                           },
"_cuota_mensual":
{ Args: { "p_fecha": string,"p_persona": number }; Returns: number
                           },
"_delegar":
{ Args: { "p_on"?: boolean }; Returns: undefined
                           },
"_detalle_liquidacion":
{ Args: { "p_disciplina": number,"p_periodo": string }; Returns: Json
                           },
"_deuda_disciplina":
{ Args: { "p_disciplina": number }; Returns: number
                           },
"_disciplina_principal":
{ Args: { "p_desde": string,"p_hasta": string,"p_persona": number }; Returns: number
                           },
"_es_representante":
{ Args: { "p_disciplina": number }; Returns: boolean
                           },
"_exigir":
{ Args: { "p_roles": (string)[] }; Returns: undefined
                           },
"_exigir_cobranza":
{ Args: Record<PropertyKey, never>; Returns: undefined
                           },
"_exigir_disciplina":
{ Args: { "p_disciplina": number }; Returns: string
                           },
"_exigir_lectura_disciplina":
{ Args: { "p_disciplina": number }; Returns: undefined
                           },
"_exigir_persona_disciplina":
{ Args: { "p_disciplina": number,"p_persona": number }; Returns: undefined
                           },
"_exigir_plan_disciplina":
{ Args: { "p_disciplina": number,"p_plan": number }; Returns: undefined
                           },
"_exigir_secretaria":
{ Args: Record<PropertyKey, never>; Returns: undefined
                           },
"_exigir_tesoreria":
{ Args: Record<PropertyKey, never>; Returns: undefined
                           },
"_lineas_haber":
{ Args: { "p_descripcion": string,"p_reparto": Json,"p_total": number }; Returns: Json
                           },
"_liquidar_disciplina":
{ Args: { "p_disciplina": number,"p_fecha": string,"p_notas": string,"p_periodo": string }; Returns: number
                           },
"_nombre":
{ Args: { "p_persona": number }; Returns: string
                           },
"_nombre_usuario":
{ Args: Record<PropertyKey, never>; Returns: string
                           },
"_persona_en_disciplina":
{ Args: { "p_disciplina": number,"p_persona": number,"p_vigente"?: boolean }; Returns: boolean
                           },
"_plan_social":
{ Args: Record<PropertyKey, never>; Returns: number
                           },
"_preparar_medio":
{ Args: { "p_medio": Json }; Returns: Json
                           },
"_registrar_cambio":
{ Args: { "p_afecta_debito": boolean,"p_antes": Json,"p_descripcion": string,"p_despues": Json,"p_disciplina"?: number,"p_persona": number,"p_tipo": string,"p_vigencia": string }; Returns: number
                           },
"_registrar_credito":
{ Args: { "p_cuotas": Json,"p_fecha": string,"p_motivo": string,"p_persona": number,"p_tipo": string }; Returns: number
                           },
"_repartir":
{ Args: { "p_cuotas"?: (number)[],"p_fecha": string,"p_importe": number,"p_persona": number }; Returns: Json
                           },
"_resumen_liquidacion":
{ Args: { "p_liquidacion": number }; Returns: Json
                           },
"_saldo_cuota":
{ Args: { "p_cuota": number }; Returns: number
                           },
"_sincronizar_persona":
{ Args: { "p_persona": number }; Returns: undefined
                           },
"_sincronizar_rol_representante":
{ Args: { "p_perfil": string }; Returns: undefined
                           },
"_social_impaga":
{ Args: { "p_disciplina": number,"p_periodo": string }; Returns: {
              "cuenta_cobrar_id": string,"cuota_id": number,"persona_id": number,"saldo": number
            }[]
                           },
"_socios_disciplina_mes":
{ Args: { "p_disciplina": number,"p_periodo": string }; Returns: {
              "persona_id": number,"planes": string
            }[]
                           },
"_tarjeta_valida":
{ Args: { "p_numero": string }; Returns: boolean
                           },
"_tiene_debito":
{ Args: { "p_fecha": string,"p_persona": number }; Returns: boolean
                           },
"alta_socio":
{ Args: { "p_desde": string,"p_medio"?: Json,"p_persona": Json,"p_planes"?: Json }; Returns: number
                           },
"anular_baja":
{ Args: { "p_persona": number }; Returns: undefined
                           },
"anular_cobro":
{ Args: { "p_cobro": number,"p_fecha"?: string,"p_motivo": string }; Returns: undefined
                           },
"anular_cobro_disciplina":
{ Args: { "p_cobro": number,"p_fecha"?: string,"p_motivo": string }; Returns: undefined
                           },
"anular_credito":
{ Args: { "p_credito": number,"p_fecha"?: string,"p_motivo": string }; Returns: undefined
                           },
"anular_cuota":
{ Args: { "p_cuota": number,"p_motivo": string }; Returns: undefined
                           },
"anular_liquidacion_disciplina":
{ Args: { "p_fecha"?: string,"p_liquidacion": number,"p_motivo": string }; Returns: undefined
                           },
"anular_liquidacion_visa":
{ Args: { "p_fecha"?: string,"p_liquidacion": number,"p_motivo": string }; Returns: undefined
                           },
"anular_lote":
{ Args: { "p_lote": number,"p_motivo": string }; Returns: undefined
                           },
"anular_pago_liquidacion":
{ Args: { "p_fecha"?: string,"p_motivo": string,"p_pago": number }; Returns: undefined
                           },
"aplicar_liquidacion_visa":
{ Args: { "p_archivo"?: string,"p_cobrados": Json,"p_comision": number,"p_cuenta"?: string,"p_fecha": string,"p_iva"?: number,"p_periodo": string,"p_rechazados"?: Json }; Returns: number
                           },
"baja_socio":
{ Args: { "p_hasta": string,"p_motivo": number,"p_notas"?: string,"p_persona": number }; Returns: undefined
                           },
"cambiar_medio_cobro":
{ Args: { "p_desde": string,"p_medio": Json,"p_persona": number }; Returns: number
                           },
"cambiar_plan":
{ Args: { "p_desde": string,"p_periodicidad"?: string,"p_plan_nuevo": number,"p_suscripcion": number }; Returns: number
                           },
"cambios_debito":
{ Args: { "p_desde"?: string,"p_disciplina"?: number,"p_estado"?: string,"p_hasta"?: string }; Returns: Json
                           },
"cancelar_plan_pago":
{ Args: { "p_motivo": string,"p_plan": number }; Returns: undefined
                           },
"control_contable":
{ Args: Record<PropertyKey, never>; Returns: {
              "concepto": string,"diferencia": number,"segun_contabilidad": number,"segun_socios": number
            }[]
                           },
"crear_plan_pago":
{ Args: { "p_cuotas": Json,"p_descripcion"?: string,"p_disciplina": number,"p_importe"?: number,"p_notas"?: string,"p_pedidos": (number)[] }; Returns: number
                           },
"cuenta_corriente_disciplina":
{ Args: { "p_disciplina": number }; Returns: {
              "asiento_id": string,"cuenta": string,"debe": number,"descripcion": string,"fecha": string,"haber": number,"numero": number,"origen_id": string,"origen_tipo": string,"pedido_id": number,"saldo": number,"tipo": string
            }[]
                           },
"dar_baja":
{ Args: { "p_anular_deuda"?: boolean,"p_hasta": string,"p_motivo": number,"p_notas"?: string,"p_persona": number }; Returns: undefined
                           },
"destinatarios_liquidacion":
{ Args: { "p_liquidacion": number }; Returns: {
              "email": string,"nombre": string
            }[]
                           },
"disc_actualizar_datos":
{ Args: { "p_datos": Json,"p_disciplina": number,"p_persona": number }; Returns: undefined
                           },
"disc_alta_socio":
{ Args: { "p_desde": string,"p_disciplina": number,"p_medio"?: Json,"p_persona": Json,"p_plan": number }; Returns: number
                           },
"disc_baja":
{ Args: { "p_baja_club"?: boolean,"p_disciplina": number,"p_hasta": string,"p_motivo"?: string,"p_persona": number }; Returns: undefined
                           },
"disc_cambiar_medio":
{ Args: { "p_desde": string,"p_disciplina": number,"p_medio": Json,"p_persona": number }; Returns: number
                           },
"disc_cambiar_plan":
{ Args: { "p_desde": string,"p_disciplina": number,"p_plan": number,"p_suscripcion": number }; Returns: number
                           },
"disc_cambios":
{ Args: { "p_disciplina": number,"p_limite"?: number }; Returns: Json
                           },
"disc_crear_plan":
{ Args: { "p_desde": string,"p_disciplina": number,"p_importe": number,"p_nombre": string }; Returns: number
                           },
"disc_cuenta":
{ Args: { "p_disciplina": number }; Returns: Json
                           },
"disc_liquidaciones":
{ Args: { "p_disciplina": number }; Returns: Json
                           },
"disc_nuevo_precio":
{ Args: { "p_desde": string,"p_disciplina": number,"p_importe": number,"p_plan": number }; Returns: undefined
                           },
"disc_planes":
{ Args: { "p_disciplina": number }; Returns: Json
                           },
"disc_registrar_cobro":
{ Args: { "p_disciplina": number,"p_fecha": string,"p_importe": number,"p_persona": number,"p_referencia"?: string }; Returns: number
                           },
"disc_resumen":
{ Args: { "p_disciplina": number }; Returns: Json
                           },
"disc_socios":
{ Args: { "p_disciplina": number,"p_historico"?: boolean }; Returns: Json
                           },
"emitir_cargo":
{ Args: { "p_centro_costo"?: string,"p_concepto": string,"p_cuenta_ingreso": string,"p_fecha"?: string,"p_importe": number,"p_persona": number,"p_vencimiento"?: string }; Returns: number
                           },
"emitir_cuota":
{ Args: { "p_fecha_emision"?: string,"p_importe"?: number,"p_motivo"?: string,"p_periodo": string,"p_suscripcion": number }; Returns: number
                           },
"emitir_lote":
{ Args: { "p_fecha_emision"?: string,"p_fecha_vencimiento"?: string,"p_omitir"?: (number)[],"p_periodo": string }; Returns: number
                           },
"es_socio_en":
{ Args: { "p_fecha": string,"p_persona": number }; Returns: boolean
                           },
"estado_cuenta":
{ Args: { "p_persona": number }; Returns: {
              "abono": number,"cargo": number,"concepto": string,"documento_id": number,"fecha": string,"saldo": number,"tipo": string
            }[]
                           },
"finalizar_inscripcion":
{ Args: { "p_hasta": string,"p_motivo"?: string,"p_suscripcion": number }; Returns: undefined
                           },
"guardar_representante":
{ Args: { "p_datos": Json,"p_disciplina": number,"p_id": number }; Returns: number
                           },
"inscribir":
{ Args: { "p_desde": string,"p_periodicidad"?: string,"p_persona": number,"p_plan": number }; Returns: number
                           },
"liquidar_disciplina":
{ Args: { "p_disciplina": number,"p_fecha": string,"p_notas"?: string,"p_periodo": string }; Returns: number
                           },
"liquidar_disciplinas_mes":
{ Args: { "p_disciplinas"?: (number)[],"p_fecha": string,"p_periodo": string }; Returns: (number)[]
                           },
"marcar_cambios":
{ Args: { "p_cambios": (number)[],"p_estado"?: string,"p_notas"?: string }; Returns: number
                           },
"mis_disciplinas":
{ Args: Record<PropertyKey, never>; Returns: {
              "disciplina_id": number,"nombre": string,"representante": boolean,"slug": string
            }[]
                           },
"pagar_liquidacion_disciplina":
{ Args: { "p_compensar"?: number,"p_cuenta"?: string,"p_fecha": string,"p_liquidacion": number,"p_notas"?: string,"p_plan"?: number,"p_referencia"?: string,"p_transferir"?: number }; Returns: number
                           },
"precio_vigente":
{ Args: { "p_periodo": string,"p_plan": number }; Returns: {
              "creado_por": string | null,
"created_at": string,
"id": number,
"importe_anual": number | null,
"importe_mensual": number,
"plan_id": number,
"vigente_desde": string
            }
                          SetofOptions: {
        from: "*"
        to: "plan_precios"
        isOneToOne: true
        isSetofReturn: false
      } },
"previsualizar_liquidacion_disciplina":
{ Args: { "p_disciplina": number,"p_periodo": string }; Returns: {
              "a_depositar": number,"a_pagar": number,"cobrado": number,"comision": number,"cuota_social": number,"deuda_disciplina": number,"gastos_comision": number,"gastos_iva": number,"otros_cobrado": number,"periodo": string,"resultado": number,"social_a_cargo": number,"socios_mes": number,"visa_cargada": boolean,"visa_cobrado": number,"visa_social": number,"ya_liquidado": boolean
            }[]
                           },
"previsualizar_liquidaciones_mes":
{ Args: { "p_periodo": string }; Returns: {
              "a_depositar": number,"a_pagar": number,"cobrado": number,"comision": number,"cuota_social": number,"deuda_disciplina": number,"disciplina": string,"disciplina_id": number,"gastos_comision": number,"gastos_iva": number,"liquidacion_id": number,"otros_cobrado": number,"periodo": string,"resultado": number,"social_a_cargo": number,"socios_mes": number,"visa_cargada": boolean,"visa_cobrado": number,"visa_social": number,"ya_liquidado": boolean
            }[]
                           },
"previsualizar_lote":
{ Args: { "p_periodo": string }; Returns: {
              "concepto": string,"disciplina_id": number,"excluida": string,"importe": number,"periodicidad": string,"periodo_desde": string,"periodo_hasta": string,"persona_id": number,"plan_id": number,"precio_id": number,"suscripcion_id": number,"tipo": string
            }[]
                           },
"puede_catalogo":
{ Args: Record<PropertyKey, never>; Returns: boolean
                           },
"puede_gestionar":
{ Args: Record<PropertyKey, never>; Returns: boolean
                           },
"puede_leer":
{ Args: Record<PropertyKey, never>; Returns: boolean
                           },
"puede_tesoreria":
{ Args: Record<PropertyKey, never>; Returns: boolean
                           },
"quitar_representante":
{ Args: { "p_id": number }; Returns: undefined
                           },
"registrar_cobro":
{ Args: { "p_cuenta"?: string,"p_cuotas"?: (number)[],"p_disciplina"?: number,"p_fecha": string,"p_importe": number,"p_medio": string,"p_persona": number,"p_referencia"?: string }; Returns: number
                           },
"registrar_cobro_disciplina":
{ Args: { "p_cuenta"?: string,"p_disciplina": number,"p_fecha": string,"p_importe": number,"p_notas"?: string,"p_plan"?: number,"p_referencia"?: string }; Returns: number
                           },
"registrar_credito":
{ Args: { "p_cuotas": Json,"p_fecha": string,"p_motivo": string,"p_persona": number,"p_tipo": string }; Returns: number
                           },
"resumen_liquidacion":
{ Args: { "p_liquidacion": number }; Returns: Json
                           },
"saldos_disciplinas":
{ Args: Record<PropertyKey, never>; Returns: {
              "club_le_debe": number,"debe_al_club": number,"disciplina_id": number,"saldo": number,"ultimo_movimiento": string
            }[]
                           },
"sincronizar_vigencias":
{ Args: Record<PropertyKey, never>; Returns: number
                           },
"situacion":
{ Args: { "p_fecha"?: string }; Returns: {
              "al_dia": boolean,"cuotas_vencidas": number,"deuda_total": number,"deuda_vencida": number,"es_socio": boolean,"medio": string,"persona_id": number,"saldo_a_favor": number
            }[]
                           },
"ver_tarjeta":
{ Args: { "p_cambio": number }; Returns: string
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
  "socios": {
          Enums: {
            
          }
        }
} as const
