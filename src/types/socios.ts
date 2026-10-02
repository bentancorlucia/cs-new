
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
                },"cobros": {
                  Row: {
                    "anulado_at": string | null,"anulado_por": string | null,"asiento_id": string,"creado_por": string | null,"created_at": string,"cuenta_id": string | null,"disciplina_id": number | null,"estado": string,"fecha": string,"id": number,"importe": number,"liquidacion_visa_id": number | null,"medio": string,"motivo_anulacion": string | null,"persona_id": number,"referencia": string | null
                  }
                  Insert: {
                    "anulado_at"?: string | null,"anulado_por"?: string | null,"asiento_id": string,"creado_por"?: string | null,"created_at"?: string,"cuenta_id"?: string | null,"disciplina_id"?: number | null,"estado"?: string,"fecha": string,"id"?: never,"importe": number,"liquidacion_visa_id"?: number | null,"medio": string,"motivo_anulacion"?: string | null,"persona_id": number,"referencia"?: string | null
                  }
                  Update: {
                    "anulado_at"?: string | null,"anulado_por"?: string | null,"asiento_id"?: string,"creado_por"?: string | null,"created_at"?: string,"cuenta_id"?: string | null,"disciplina_id"?: number | null,"estado"?: string,"fecha"?: string,"id"?: never,"importe"?: number,"liquidacion_visa_id"?: number | null,"medio"?: string,"motivo_anulacion"?: string | null,"persona_id"?: number,"referencia"?: string | null
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
                    "asiento_id": string,"centro_costo_id": string | null,"concepto": string,"creado_por": string | null,"created_at": string,"cuenta_cobrar_id": string,"cuenta_ingreso_id": string,"disciplina_id": number | null,"estado": string,"fecha_emision": string,"fecha_vencimiento": string,"id": number,"importe": number,"lote_id": number | null,"motivo_importe": string | null,"periodicidad": string,"periodo_desde": string,"periodo_hasta": string,"persona_id": number,"plan_id": number | null,"precio_id": number | null,"suscripcion_id": number | null,"tipo": string
                  }
                  Insert: {
                    "asiento_id": string,"centro_costo_id"?: string | null,"concepto": string,"creado_por"?: string | null,"created_at"?: string,"cuenta_cobrar_id": string,"cuenta_ingreso_id": string,"disciplina_id"?: number | null,"estado"?: string,"fecha_emision": string,"fecha_vencimiento": string,"id"?: never,"importe": number,"lote_id"?: number | null,"motivo_importe"?: string | null,"periodicidad": string,"periodo_desde": string,"periodo_hasta": string,"persona_id": number,"plan_id"?: number | null,"precio_id"?: number | null,"suscripcion_id"?: number | null,"tipo": string
                  }
                  Update: {
                    "asiento_id"?: string,"centro_costo_id"?: string | null,"concepto"?: string,"creado_por"?: string | null,"created_at"?: string,"cuenta_cobrar_id"?: string,"cuenta_ingreso_id"?: string,"disciplina_id"?: number | null,"estado"?: string,"fecha_emision"?: string,"fecha_vencimiento"?: string,"id"?: never,"importe"?: number,"lote_id"?: number | null,"motivo_importe"?: string | null,"periodicidad"?: string,"periodo_desde"?: string,"periodo_hasta"?: string,"persona_id"?: number,"plan_id"?: number | null,"precio_id"?: number | null,"suscripcion_id"?: number | null,"tipo"?: string
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
                    "disciplina_id": number | null,"importe": number,"liquidacion_visa_id": number
                  }
                  Insert: {
                    "disciplina_id"?: number | null,"importe": number,"liquidacion_visa_id": number
                  }
                  Update: {
                    "disciplina_id"?: number | null,"importe"?: number,"liquidacion_visa_id"?: number
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
                    "anulado_at": string | null,"anulado_por": string | null,"asiento_id": string,"cobrado": number,"comision": number,"compensado": number,"creado_por": string | null,"created_at": string,"cuenta_id": string | null,"desde": string,"disciplina_id": number,"estado": string,"fecha": string,"hasta": string,"id": number,"importe": number,"motivo_anulacion": string | null,"notas": string | null,"transferido": number
                  }
                  Insert: {
                    "anulado_at"?: string | null,"anulado_por"?: string | null,"asiento_id": string,"cobrado": number,"comision": number,"compensado"?: number,"creado_por"?: string | null,"created_at"?: string,"cuenta_id"?: string | null,"desde": string,"disciplina_id": number,"estado"?: string,"fecha": string,"hasta": string,"id"?: never,"importe": number,"motivo_anulacion"?: string | null,"notas"?: string | null,"transferido": number
                  }
                  Update: {
                    "anulado_at"?: string | null,"anulado_por"?: string | null,"asiento_id"?: string,"cobrado"?: number,"comision"?: number,"compensado"?: number,"creado_por"?: string | null,"created_at"?: string,"cuenta_id"?: string | null,"desde"?: string,"disciplina_id"?: number,"estado"?: string,"fecha"?: string,"hasta"?: string,"id"?: never,"importe"?: number,"motivo_anulacion"?: string | null,"notas"?: string | null,"transferido"?: number
                  }
                  Relationships: [
                    
                  ]
                },"liquidaciones_visa": {
                  Row: {
                    "anulado_at": string | null,"anulado_por": string | null,"archivo": string | null,"asiento_id": string,"bruto": number,"comision": number,"creado_por": string | null,"created_at": string,"cuenta_id": string,"estado": string,"fecha": string,"id": number,"motivo_anulacion": string | null,"periodo": string
                  }
                  Insert: {
                    "anulado_at"?: string | null,"anulado_por"?: string | null,"archivo"?: string | null,"asiento_id": string,"bruto": number,"comision": number,"creado_por"?: string | null,"created_at"?: string,"cuenta_id": string,"estado"?: string,"fecha": string,"id"?: never,"motivo_anulacion"?: string | null,"periodo": string
                  }
                  Update: {
                    "anulado_at"?: string | null,"anulado_por"?: string | null,"archivo"?: string | null,"asiento_id"?: string,"bruto"?: number,"comision"?: number,"creado_por"?: string | null,"created_at"?: string,"cuenta_id"?: string,"estado"?: string,"fecha"?: string,"id"?: never,"motivo_anulacion"?: string | null,"periodo"?: string
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
                    "creado_por": string | null,"created_at": string,"desde": string,"disciplina_id": number | null,"hasta": string | null,"id": number,"medio": string,"persona_id": number,"tarjeta_ultimos4": string | null,"tarjeta_vencimiento": string | null,"titular_documento": string | null,"titular_nombre": string | null
                  }
                  Insert: {
                    "creado_por"?: string | null,"created_at"?: string,"desde": string,"disciplina_id"?: number | null,"hasta"?: string | null,"id"?: never,"medio": string,"persona_id": number,"tarjeta_ultimos4"?: string | null,"tarjeta_vencimiento"?: string | null,"titular_documento"?: string | null,"titular_nombre"?: string | null
                  }
                  Update: {
                    "creado_por"?: string | null,"created_at"?: string,"desde"?: string,"disciplina_id"?: number | null,"hasta"?: string | null,"id"?: never,"medio"?: string,"persona_id"?: number,"tarjeta_ultimos4"?: string | null,"tarjeta_vencimiento"?: string | null,"titular_documento"?: string | null,"titular_nombre"?: string | null
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
                }
          }
          Functions: {
            "_anular_aplicaciones_externas":
{ Args: { "p_cobros": (number)[],"p_fecha": string,"p_motivo": string }; Returns: undefined
                           },
"_aplicar_saldo_a_favor":
{ Args: { "p_fecha": string,"p_persona": number }; Returns: number
                           },
"_centro_disciplina":
{ Args: { "p_disciplina": number }; Returns: string
                           },
"_exigir":
{ Args: { "p_roles": (string)[] }; Returns: undefined
                           },
"_exigir_cobranza":
{ Args: Record<PropertyKey, never>; Returns: undefined
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
"_nombre":
{ Args: { "p_persona": number }; Returns: string
                           },
"_registrar_credito":
{ Args: { "p_cuotas": Json,"p_fecha": string,"p_motivo": string,"p_persona": number,"p_tipo": string }; Returns: number
                           },
"_repartir":
{ Args: { "p_cuotas"?: (number)[],"p_fecha": string,"p_importe": number,"p_persona": number }; Returns: Json
                           },
"_saldo_cuota":
{ Args: { "p_cuota": number }; Returns: number
                           },
"_sincronizar_persona":
{ Args: { "p_persona": number }; Returns: undefined
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
"aplicar_liquidacion_visa":
{ Args: { "p_archivo"?: string,"p_cobrados": Json,"p_comision": number,"p_cuenta"?: string,"p_fecha": string,"p_periodo": string,"p_rechazados"?: Json }; Returns: number
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
"control_contable":
{ Args: Record<PropertyKey, never>; Returns: {
              "concepto": string,"diferencia": number,"segun_contabilidad": number,"segun_socios": number
            }[]
                           },
"dar_baja":
{ Args: { "p_anular_deuda"?: boolean,"p_hasta": string,"p_motivo": number,"p_notas"?: string,"p_persona": number }; Returns: undefined
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
"inscribir":
{ Args: { "p_desde": string,"p_periodicidad"?: string,"p_persona": number,"p_plan": number }; Returns: number
                           },
"liquidar_disciplina":
{ Args: { "p_compensar"?: number,"p_cuenta"?: string,"p_desde": string,"p_disciplina": number,"p_fecha": string,"p_hasta": string,"p_notas"?: string }; Returns: number
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
{ Args: { "p_desde": string,"p_disciplina": number,"p_hasta": string }; Returns: {
              "cobrado": number,"comision": number,"deuda_disciplina": number,"importe": number,"ya_liquidado": boolean
            }[]
                           },
"previsualizar_lote":
{ Args: { "p_periodo": string }; Returns: {
              "concepto": string,"disciplina_id": number,"excluida": string,"importe": number,"periodicidad": string,"periodo_desde": string,"periodo_hasta": string,"persona_id": number,"plan_id": number,"precio_id": number,"suscripcion_id": number,"tipo": string
            }[]
                           },
"puede_leer":
{ Args: Record<PropertyKey, never>; Returns: boolean
                           },
"registrar_cobro":
{ Args: { "p_cuenta"?: string,"p_cuotas"?: (number)[],"p_disciplina"?: number,"p_fecha": string,"p_importe": number,"p_medio": string,"p_persona": number,"p_referencia"?: string }; Returns: number
                           },
"registrar_credito":
{ Args: { "p_cuotas": Json,"p_fecha": string,"p_motivo": string,"p_persona": number,"p_tipo": string }; Returns: number
                           },
"sincronizar_vigencias":
{ Args: Record<PropertyKey, never>; Returns: number
                           },
"situacion":
{ Args: { "p_fecha"?: string }; Returns: {
              "al_dia": boolean,"cuotas_vencidas": number,"deuda_total": number,"deuda_vencida": number,"es_socio": boolean,"medio": string,"persona_id": number,"saldo_a_favor": number
            }[]
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
