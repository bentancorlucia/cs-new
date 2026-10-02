
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  
  "contabilidad": {
          Tables: {
            "asientos": {
                  Row: {
                    "asiento_revertido_id": string | null,"confirmado_at": string | null,"confirmado_por": string | null,"creado_por": string | null,"created_at": string,"descripcion": string,"ejercicio_id": string,"estado": Database["contabilidad"]['Enums']["estado_asiento"],"fecha": string,"id": string,"motivo": string | null,"numero": number | null,"origen_id": string | null,"origen_tipo": string | null,"periodo_id": string,"revertido_por_id": string | null,"tipo": Database["contabilidad"]['Enums']["tipo_asiento"]
                  }
                  Insert: {
                    "asiento_revertido_id"?: string | null,"confirmado_at"?: string | null,"confirmado_por"?: string | null,"creado_por"?: string | null,"created_at"?: string,"descripcion": string,"ejercicio_id": string,"estado"?: Database["contabilidad"]['Enums']["estado_asiento"],"fecha": string,"id"?: string,"motivo"?: string | null,"numero"?: number | null,"origen_id"?: string | null,"origen_tipo"?: string | null,"periodo_id": string,"revertido_por_id"?: string | null,"tipo"?: Database["contabilidad"]['Enums']["tipo_asiento"]
                  }
                  Update: {
                    "asiento_revertido_id"?: string | null,"confirmado_at"?: string | null,"confirmado_por"?: string | null,"creado_por"?: string | null,"created_at"?: string,"descripcion"?: string,"ejercicio_id"?: string,"estado"?: Database["contabilidad"]['Enums']["estado_asiento"],"fecha"?: string,"id"?: string,"motivo"?: string | null,"numero"?: number | null,"origen_id"?: string | null,"origen_tipo"?: string | null,"periodo_id"?: string,"revertido_por_id"?: string | null,"tipo"?: Database["contabilidad"]['Enums']["tipo_asiento"]
                  }
                  Relationships: [
                    {
      foreignKeyName: "asientos_asiento_revertido_id_fkey"
      columns: ["asiento_revertido_id"]
isOneToOne: true
      referencedRelation: "asientos"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "asientos_ejercicio_id_fkey"
      columns: ["ejercicio_id"]
isOneToOne: false
      referencedRelation: "ejercicios"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "asientos_periodo_id_fkey"
      columns: ["periodo_id"]
isOneToOne: false
      referencedRelation: "periodos"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "asientos_revertido_por_id_fkey"
      columns: ["revertido_por_id"]
isOneToOne: true
      referencedRelation: "asientos"
      referencedColumns: ["id"]
    }
                  ]
                },"auditoria": {
                  Row: {
                    "accion": string,"antes": Json | null,"at": string,"despues": Json | null,"id": number,"proceso": string | null,"registro_id": string | null,"tabla": string,"usuario_id": string | null
                  }
                  Insert: {
                    "accion": string,"antes"?: Json | null,"at"?: string,"despues"?: Json | null,"id"?: never,"proceso"?: string | null,"registro_id"?: string | null,"tabla": string,"usuario_id"?: string | null
                  }
                  Update: {
                    "accion"?: string,"antes"?: Json | null,"at"?: string,"despues"?: Json | null,"id"?: never,"proceso"?: string | null,"registro_id"?: string | null,"tabla"?: string,"usuario_id"?: string | null
                  }
                  Relationships: [
                    
                  ]
                },"centros_costo": {
                  Row: {
                    "activo": boolean,"codigo": string,"created_at": string,"disciplina_id": number | null,"id": string,"nombre": string
                  }
                  Insert: {
                    "activo"?: boolean,"codigo": string,"created_at"?: string,"disciplina_id"?: number | null,"id"?: string,"nombre": string
                  }
                  Update: {
                    "activo"?: boolean,"codigo"?: string,"created_at"?: string,"disciplina_id"?: number | null,"id"?: string,"nombre"?: string
                  }
                  Relationships: [
                    
                  ]
                },"conciliacion_lineas": {
                  Row: {
                    "conciliacion_id": number,"linea_id": number
                  }
                  Insert: {
                    "conciliacion_id": number,"linea_id": number
                  }
                  Update: {
                    "conciliacion_id"?: number,"linea_id"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "conciliacion_lineas_conciliacion_id_fkey"
      columns: ["conciliacion_id"]
isOneToOne: false
      referencedRelation: "conciliaciones"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "conciliacion_lineas_linea_id_fkey"
      columns: ["linea_id"]
isOneToOne: true
      referencedRelation: "lineas"
      referencedColumns: ["id"]
    }
                  ]
                },"conciliacion_movimientos": {
                  Row: {
                    "conciliacion_id": number,"movimiento_id": number
                  }
                  Insert: {
                    "conciliacion_id": number,"movimiento_id": number
                  }
                  Update: {
                    "conciliacion_id"?: number,"movimiento_id"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "conciliacion_movimientos_conciliacion_id_fkey"
      columns: ["conciliacion_id"]
isOneToOne: false
      referencedRelation: "conciliaciones"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "conciliacion_movimientos_movimiento_id_fkey"
      columns: ["movimiento_id"]
isOneToOne: true
      referencedRelation: "extracto_movimientos"
      referencedColumns: ["id"]
    }
                  ]
                },"conciliaciones": {
                  Row: {
                    "creado_por": string | null,"created_at": string,"extracto_id": string,"id": number
                  }
                  Insert: {
                    "creado_por"?: string | null,"created_at"?: string,"extracto_id": string,"id"?: never
                  }
                  Update: {
                    "creado_por"?: string | null,"created_at"?: string,"extracto_id"?: string,"id"?: never
                  }
                  Relationships: [
                    {
      foreignKeyName: "conciliaciones_extracto_id_fkey"
      columns: ["extracto_id"]
isOneToOne: false
      referencedRelation: "extractos"
      referencedColumns: ["id"]
    }
                  ]
                },"config": {
                  Row: {
                    "id": boolean,"moneda_funcional": string,"regimen_iva": string,"updated_at": string
                  }
                  Insert: {
                    "id"?: boolean,"moneda_funcional"?: string,"regimen_iva"?: string,"updated_at"?: string
                  }
                  Update: {
                    "id"?: boolean,"moneda_funcional"?: string,"regimen_iva"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "config_moneda_funcional_fkey"
      columns: ["moneda_funcional"]
isOneToOne: false
      referencedRelation: "monedas"
      referencedColumns: ["codigo"]
    }
                  ]
                },"cotizaciones": {
                  Row: {
                    "cargado_por": string | null,"created_at": string,"fecha": string,"fuente": string,"moneda": string,"tasa": number
                  }
                  Insert: {
                    "cargado_por"?: string | null,"created_at"?: string,"fecha": string,"fuente": string,"moneda": string,"tasa": number
                  }
                  Update: {
                    "cargado_por"?: string | null,"created_at"?: string,"fecha"?: string,"fuente"?: string,"moneda"?: string,"tasa"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "cotizaciones_moneda_fkey"
      columns: ["moneda"]
isOneToOne: false
      referencedRelation: "monedas"
      referencedColumns: ["codigo"]
    }
                  ]
                },"cuentas": {
                  Row: {
                    "activa": boolean,"afecta_caja": boolean,"clase": Database["contabilidad"]['Enums']["clase_cuenta"],"codigo": string,"corriente": boolean | null,"created_at": string,"descripcion": string | null,"es_disponibilidad": boolean,"id": string,"imputable": boolean,"moneda": string | null,"naturaleza": Database["contabilidad"]['Enums']["naturaleza"],"nivel": number,"nombre": string,"padre_id": string | null,"requiere_auxiliar": Database["contabilidad"]['Enums']["tipo_auxiliar"] | null,"requiere_centro_costo": boolean,"revalua": boolean,"updated_at": string
                  }
                  Insert: {
                    "activa"?: boolean,"afecta_caja"?: boolean,"clase": Database["contabilidad"]['Enums']["clase_cuenta"],"codigo": string,"corriente"?: boolean | null,"created_at"?: string,"descripcion"?: string | null,"es_disponibilidad"?: boolean,"id"?: string,"imputable"?: boolean,"moneda"?: string | null,"naturaleza": Database["contabilidad"]['Enums']["naturaleza"],"nivel": number,"nombre": string,"padre_id"?: string | null,"requiere_auxiliar"?: Database["contabilidad"]['Enums']["tipo_auxiliar"] | null,"requiere_centro_costo"?: boolean,"revalua"?: boolean,"updated_at"?: string
                  }
                  Update: {
                    "activa"?: boolean,"afecta_caja"?: boolean,"clase"?: Database["contabilidad"]['Enums']["clase_cuenta"],"codigo"?: string,"corriente"?: boolean | null,"created_at"?: string,"descripcion"?: string | null,"es_disponibilidad"?: boolean,"id"?: string,"imputable"?: boolean,"moneda"?: string | null,"naturaleza"?: Database["contabilidad"]['Enums']["naturaleza"],"nivel"?: number,"nombre"?: string,"padre_id"?: string | null,"requiere_auxiliar"?: Database["contabilidad"]['Enums']["tipo_auxiliar"] | null,"requiere_centro_costo"?: boolean,"revalua"?: boolean,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "cuentas_moneda_fkey"
      columns: ["moneda"]
isOneToOne: false
      referencedRelation: "monedas"
      referencedColumns: ["codigo"]
    },{
      foreignKeyName: "cuentas_padre_id_fkey"
      columns: ["padre_id"]
isOneToOne: false
      referencedRelation: "cuentas"
      referencedColumns: ["id"]
    }
                  ]
                },"cuentas_sistema": {
                  Row: {
                    "cuenta_id": string,"rol": string
                  }
                  Insert: {
                    "cuenta_id": string,"rol": string
                  }
                  Update: {
                    "cuenta_id"?: string,"rol"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "cuentas_sistema_cuenta_id_fkey"
      columns: ["cuenta_id"]
isOneToOne: false
      referencedRelation: "cuentas"
      referencedColumns: ["id"]
    }
                  ]
                },"ejercicios": {
                  Row: {
                    "cerrado_at": string | null,"cerrado_por": string | null,"created_at": string,"estado": Database["contabilidad"]['Enums']["estado_periodo"],"fecha_fin": string,"fecha_inicio": string,"id": string,"nombre": string,"sin_saldos_iniciales": boolean
                  }
                  Insert: {
                    "cerrado_at"?: string | null,"cerrado_por"?: string | null,"created_at"?: string,"estado"?: Database["contabilidad"]['Enums']["estado_periodo"],"fecha_fin": string,"fecha_inicio": string,"id"?: string,"nombre": string,"sin_saldos_iniciales"?: boolean
                  }
                  Update: {
                    "cerrado_at"?: string | null,"cerrado_por"?: string | null,"created_at"?: string,"estado"?: Database["contabilidad"]['Enums']["estado_periodo"],"fecha_fin"?: string,"fecha_inicio"?: string,"id"?: string,"nombre"?: string,"sin_saldos_iniciales"?: boolean
                  }
                  Relationships: [
                    
                  ]
                },"extracto_movimientos": {
                  Row: {
                    "concepto": string,"extracto_id": string,"fecha": string,"id": number,"importe": number,"orden": number,"referencia": string | null,"saldo": number | null
                  }
                  Insert: {
                    "concepto": string,"extracto_id": string,"fecha": string,"id"?: never,"importe": number,"orden": number,"referencia"?: string | null,"saldo"?: number | null
                  }
                  Update: {
                    "concepto"?: string,"extracto_id"?: string,"fecha"?: string,"id"?: never,"importe"?: number,"orden"?: number,"referencia"?: string | null,"saldo"?: number | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "extracto_movimientos_extracto_id_fkey"
      columns: ["extracto_id"]
isOneToOne: false
      referencedRelation: "extractos"
      referencedColumns: ["id"]
    }
                  ]
                },"extractos": {
                  Row: {
                    "archivo": string | null,"cerrado_at": string | null,"cerrado_por": string | null,"creado_por": string | null,"created_at": string,"cuenta_id": string,"estado": string,"fecha_desde": string,"fecha_hasta": string,"id": string,"notas": string | null,"saldo_final": number,"saldo_inicial": number
                  }
                  Insert: {
                    "archivo"?: string | null,"cerrado_at"?: string | null,"cerrado_por"?: string | null,"creado_por"?: string | null,"created_at"?: string,"cuenta_id": string,"estado"?: string,"fecha_desde": string,"fecha_hasta": string,"id"?: string,"notas"?: string | null,"saldo_final": number,"saldo_inicial": number
                  }
                  Update: {
                    "archivo"?: string | null,"cerrado_at"?: string | null,"cerrado_por"?: string | null,"creado_por"?: string | null,"created_at"?: string,"cuenta_id"?: string,"estado"?: string,"fecha_desde"?: string,"fecha_hasta"?: string,"id"?: string,"notas"?: string | null,"saldo_final"?: number,"saldo_inicial"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "extractos_cuenta_id_fkey"
      columns: ["cuenta_id"]
isOneToOne: false
      referencedRelation: "cuentas"
      referencedColumns: ["id"]
    }
                  ]
                },"lineas": {
                  Row: {
                    "asiento_id": string,"centro_costo_id": string | null,"cuenta_id": string,"debe": number,"descripcion": string | null,"disciplina_id": number | null,"haber": number,"id": number,"importe_origen": number | null,"moneda": string | null,"orden": number,"proveedor_id": number | null,"tc": number | null,"_importe_en_moneda": number | null
                  }
                  Insert: {
                    "asiento_id": string,"centro_costo_id"?: string | null,"cuenta_id": string,"debe"?: number,"descripcion"?: string | null,"disciplina_id"?: number | null,"haber"?: number,"id"?: never,"importe_origen"?: number | null,"moneda"?: string | null,"orden": number,"proveedor_id"?: number | null,"tc"?: number | null
                  }
                  Update: {
                    "asiento_id"?: string,"centro_costo_id"?: string | null,"cuenta_id"?: string,"debe"?: number,"descripcion"?: string | null,"disciplina_id"?: number | null,"haber"?: number,"id"?: never,"importe_origen"?: number | null,"moneda"?: string | null,"orden"?: number,"proveedor_id"?: number | null,"tc"?: number | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "lineas_asiento_id_fkey"
      columns: ["asiento_id"]
isOneToOne: false
      referencedRelation: "asientos"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "lineas_centro_costo_id_fkey"
      columns: ["centro_costo_id"]
isOneToOne: false
      referencedRelation: "centros_costo"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "lineas_cuenta_id_fkey"
      columns: ["cuenta_id"]
isOneToOne: false
      referencedRelation: "cuentas"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "lineas_moneda_fkey"
      columns: ["moneda"]
isOneToOne: false
      referencedRelation: "monedas"
      referencedColumns: ["codigo"]
    }
                  ]
                },"monedas": {
                  Row: {
                    "activa": boolean,"bcu_codigo": number | null,"codigo": string,"nombre": string,"simbolo": string
                  }
                  Insert: {
                    "activa"?: boolean,"bcu_codigo"?: number | null,"codigo": string,"nombre": string,"simbolo": string
                  }
                  Update: {
                    "activa"?: boolean,"bcu_codigo"?: number | null,"codigo"?: string,"nombre"?: string,"simbolo"?: string
                  }
                  Relationships: [
                    
                  ]
                },"numeradores": {
                  Row: {
                    "ejercicio_id": string,"ultimo": number
                  }
                  Insert: {
                    "ejercicio_id": string,"ultimo": number
                  }
                  Update: {
                    "ejercicio_id"?: string,"ultimo"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "numeradores_ejercicio_id_fkey"
      columns: ["ejercicio_id"]
isOneToOne: true
      referencedRelation: "ejercicios"
      referencedColumns: ["id"]
    }
                  ]
                },"parametros_cuentas": {
                  Row: {
                    "cuenta_id": string,"descripcion": string | null,"id": string,"moneda": string | null,"proceso": string,"rol": string
                  }
                  Insert: {
                    "cuenta_id": string,"descripcion"?: string | null,"id"?: string,"moneda"?: string | null,"proceso": string,"rol": string
                  }
                  Update: {
                    "cuenta_id"?: string,"descripcion"?: string | null,"id"?: string,"moneda"?: string | null,"proceso"?: string,"rol"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "parametros_cuentas_cuenta_id_fkey"
      columns: ["cuenta_id"]
isOneToOne: false
      referencedRelation: "cuentas"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "parametros_cuentas_moneda_fkey"
      columns: ["moneda"]
isOneToOne: false
      referencedRelation: "monedas"
      referencedColumns: ["codigo"]
    }
                  ]
                },"periodos": {
                  Row: {
                    "anio": number,"cerrado_at": string | null,"cerrado_por": string | null,"ejercicio_id": string,"estado": Database["contabilidad"]['Enums']["estado_periodo"],"fecha_fin": string,"fecha_inicio": string,"id": string,"mes": number
                  }
                  Insert: {
                    "anio": number,"cerrado_at"?: string | null,"cerrado_por"?: string | null,"ejercicio_id": string,"estado"?: Database["contabilidad"]['Enums']["estado_periodo"],"fecha_fin": string,"fecha_inicio": string,"id"?: string,"mes": number
                  }
                  Update: {
                    "anio"?: number,"cerrado_at"?: string | null,"cerrado_por"?: string | null,"ejercicio_id"?: string,"estado"?: Database["contabilidad"]['Enums']["estado_periodo"],"fecha_fin"?: string,"fecha_inicio"?: string,"id"?: string,"mes"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "periodos_ejercicio_id_fkey"
      columns: ["ejercicio_id"]
isOneToOne: false
      referencedRelation: "ejercicios"
      referencedColumns: ["id"]
    }
                  ]
                },"presupuesto_lineas": {
                  Row: {
                    "centro_costo_id": string | null,"cuenta_id": string,"id": number,"importe": number,"mes": number,"presupuesto_id": string
                  }
                  Insert: {
                    "centro_costo_id"?: string | null,"cuenta_id": string,"id"?: never,"importe": number,"mes": number,"presupuesto_id": string
                  }
                  Update: {
                    "centro_costo_id"?: string | null,"cuenta_id"?: string,"id"?: never,"importe"?: number,"mes"?: number,"presupuesto_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "presupuesto_lineas_centro_costo_id_fkey"
      columns: ["centro_costo_id"]
isOneToOne: false
      referencedRelation: "centros_costo"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "presupuesto_lineas_cuenta_id_fkey"
      columns: ["cuenta_id"]
isOneToOne: false
      referencedRelation: "cuentas"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "presupuesto_lineas_presupuesto_id_fkey"
      columns: ["presupuesto_id"]
isOneToOne: false
      referencedRelation: "presupuestos"
      referencedColumns: ["id"]
    }
                  ]
                },"presupuestos": {
                  Row: {
                    "aprobado_at": string | null,"aprobado_por": string | null,"creado_por": string | null,"created_at": string,"ejercicio_id": string,"estado": string,"id": string,"nombre": string,"notas": string | null,"version": number
                  }
                  Insert: {
                    "aprobado_at"?: string | null,"aprobado_por"?: string | null,"creado_por"?: string | null,"created_at"?: string,"ejercicio_id": string,"estado"?: string,"id"?: string,"nombre": string,"notas"?: string | null,"version": number
                  }
                  Update: {
                    "aprobado_at"?: string | null,"aprobado_por"?: string | null,"creado_por"?: string | null,"created_at"?: string,"ejercicio_id"?: string,"estado"?: string,"id"?: string,"nombre"?: string,"notas"?: string | null,"version"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "presupuestos_ejercicio_id_fkey"
      columns: ["ejercicio_id"]
isOneToOne: false
      referencedRelation: "ejercicios"
      referencedColumns: ["id"]
    }
                  ]
                }
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "_asiento_automatico":
{ Args: { "p_descripcion": string,"p_fecha": string,"p_lineas": Json,"p_origen_id": string,"p_origen_tipo": string,"p_tipo"?: Database["contabilidad"]['Enums']["tipo_asiento"] }; Returns: string
                           },
"_exigir_escritura":
{ Args: Record<PropertyKey, never>; Returns: undefined
                           },
"_exigir_lectura":
{ Args: Record<PropertyKey, never>; Returns: undefined
                           },
"_flujo_asiento":
{ Args: { "p_asiento": string,"p_disponibilidad"?: string }; Returns: {
              "centro_costo_id": string,"cuenta_id": string,"importe": number
            }[]
                           },
"_hoy":
{ Args: Record<PropertyKey, never>; Returns: string
                           },
"_importe_en_moneda":
{ Args: { "p_linea": Database["contabilidad"]['Tables']["lineas"]['Row'] }; Returns: number
                           },
"_insertar_lineas":
{ Args: { "p_asiento": string,"p_fecha": string,"p_lineas": Json }; Returns: undefined
                           },
"_periodo_abierto":
{ Args: { "p_periodo": string }; Returns: boolean
                           },
"_periodo_para":
{ Args: { "p_fecha": string }; Returns: Record<string, unknown>
                           },
"_proceso":
{ Args: Record<PropertyKey, never>; Returns: string
                           },
"_revaluar":
{ Args: { "p_fecha": string,"p_origen_id": string,"p_origen_tipo": string }; Returns: string
                           },
"_revertir":
{ Args: { "p_fecha": string,"p_id": string,"p_motivo": string }; Returns: string
                           },
"_saldo_cuentas":
{ Args: { "p_cuentas": (string)[],"p_fecha": string,"p_inicio": boolean,"p_origen": boolean }; Returns: number
                           },
"_tiene_rol":
{ Args: { "p_roles": (string)[] }; Returns: boolean
                           },
"_usuario":
{ Args: Record<PropertyKey, never>; Returns: string
                           },
"aprobar_presupuesto":
{ Args: { "p_presupuesto": string }; Returns: undefined
                           },
"cerrar_ejercicio":
{ Args: { "p_ejercicio": string }; Returns: string
                           },
"cerrar_extracto":
{ Args: { "p_extracto": string }; Returns: undefined
                           },
"cerrar_periodo":
{ Args: { "p_periodo": string }; Returns: undefined
                           },
"conciliar":
{ Args: { "p_extracto": string,"p_lineas": (number)[],"p_movimientos": (number)[] }; Returns: number
                           },
"confirmar_asiento":
{ Args: { "p_id": string }; Returns: number
                           },
"contabilizar_movimiento_extracto":
{ Args: { "p_contrapartida": string,"p_descripcion"?: string,"p_extra"?: Json,"p_movimiento": number }; Returns: string
                           },
"crear_ejercicio":
{ Args: { "p_anio": number }; Returns: string
                           },
"crear_presupuesto":
{ Args: { "p_base"?: string,"p_ejercicio": string,"p_meses"?: number,"p_nombre"?: string }; Returns: string
                           },
"cuenta_para":
{ Args: { "p_moneda"?: string,"p_proceso": string,"p_rol": string }; Returns: string
                           },
"cuenta_sistema":
{ Args: { "p_rol": string }; Returns: string
                           },
"declarar_sin_saldos_iniciales":
{ Args: { "p_ejercicio": string,"p_valor": boolean }; Returns: undefined
                           },
"desconciliar":
{ Args: { "p_conciliacion": number }; Returns: undefined
                           },
"ejecucion_presupuesto":
{ Args: { "p_mes_desde"?: number,"p_mes_hasta"?: number,"p_por_centro"?: boolean,"p_presupuesto": string }; Returns: {
              "centro_costo_id": string,"cuenta_id": string,"desvio": number,"ejecutado": number,"presupuestado": number
            }[]
                           },
"eliminar_borrador":
{ Args: { "p_id": string }; Returns: undefined
                           },
"eliminar_extracto":
{ Args: { "p_extracto": string }; Returns: undefined
                           },
"eliminar_presupuesto":
{ Args: { "p_presupuesto": string }; Returns: undefined
                           },
"flujo_caja":
{ Args: { "p_desde": string,"p_disponibilidad"?: string,"p_hasta": string }; Returns: {
              "anio": number,"centro_costo_id": string,"cuenta_id": string,"importe": number,"mes": number,"revaluacion": boolean
            }[]
                           },
"guardar_asiento":
{ Args: { "p_confirmar"?: boolean,"p_descripcion": string,"p_fecha": string,"p_id": string,"p_lineas": Json,"p_tipo"?: Database["contabilidad"]['Enums']["tipo_asiento"] }; Returns: string
                           },
"guardar_presupuesto_lineas":
{ Args: { "p_lineas": Json,"p_presupuesto": string }; Returns: number
                           },
"importar_extracto":
{ Args: { "p_archivo"?: string,"p_cuenta": string,"p_desde": string,"p_hasta": string,"p_movimientos": Json,"p_saldo_final": number,"p_saldo_inicial": number }; Returns: string
                           },
"libro_mayor":
{ Args: { "p_cuenta": string,"p_desde": string,"p_hasta": string }; Returns: {
              "asiento_descripcion": string,"asiento_id": string,"centro_costo_id": string,"debe": number,"disciplina_id": number,"fecha": string,"haber": number,"importe_origen": number,"linea_descripcion": string,"numero": number,"proveedor_id": number,"saldo": number,"saldo_origen": number,"tc": number,"tipo": Database["contabilidad"]['Enums']["tipo_asiento"]
            }[]
                           },
"moneda_funcional":
{ Args: Record<PropertyKey, never>; Returns: string
                           },
"nombres_usuarios":
{ Args: { "p_ids": (string)[] }; Returns: {
              "id": string,"nombre": string
            }[]
                           },
"puede_escribir":
{ Args: Record<PropertyKey, never>; Returns: boolean
                           },
"puede_leer":
{ Args: Record<PropertyKey, never>; Returns: boolean
                           },
"reabrir_ejercicio":
{ Args: { "p_ejercicio": string }; Returns: undefined
                           },
"reabrir_extracto":
{ Args: { "p_extracto": string }; Returns: undefined
                           },
"reabrir_periodo":
{ Args: { "p_periodo": string }; Returns: undefined
                           },
"registrar_cotizacion":
{ Args: { "p_fecha": string,"p_fuente"?: string,"p_moneda": string,"p_tasa": number }; Returns: undefined
                           },
"resultado_real":
{ Args: { "p_desde": string,"p_hasta": string }; Returns: {
              "anio": number,"centro_costo_id": string,"cuenta_id": string,"importe": number,"mes": number
            }[]
                           },
"resumen_conciliacion":
{ Args: { "p_extracto": string }; Returns: {
              "cantidad_pendientes": number,"diferencia": number,"diferencia_inicial": number,"movimientos_sin_conciliar": number,"pendientes": number,"saldo_banco": number,"saldo_libros": number
            }[]
                           },
"revaluar_moneda_extranjera":
{ Args: { "p_fecha": string }; Returns: string
                           },
"revertir_asiento":
{ Args: { "p_fecha"?: string,"p_id": string,"p_motivo": string }; Returns: string
                           },
"saldo_disponibilidades":
{ Args: { "p_disponibilidad"?: string,"p_fecha": string }; Returns: number
                           },
"saldos":
{ Args: { "p_desde": string,"p_excluir_cierre"?: boolean,"p_hasta": string }; Returns: {
              "cuenta_id": string,"debe": number,"debe_anterior": number,"haber": number,"haber_anterior": number,"origen_anterior": number,"origen_periodo": number
            }[]
                           },
"sincronizar_centros_disciplinas":
{ Args: Record<PropertyKey, never>; Returns: number
                           },
"sugerir_conciliacion":
{ Args: { "p_dias"?: number,"p_extracto": string }; Returns: {
              "dias": number,"linea_id": number,"movimiento_id": number
            }[]
                           },
"tc_cierre":
{ Args: { "p_fecha": string,"p_moneda": string }; Returns: number
                           },
"tc_vigente":
{ Args: { "p_fecha": string,"p_moneda": string }; Returns: number
                           }
          }
          Enums: {
            "clase_cuenta": "activo"|"pasivo"|"patrimonio"|"ingreso"|"egreso","estado_asiento": "borrador"|"confirmado","estado_periodo": "abierto"|"cerrado","naturaleza": "deudora"|"acreedora","tipo_asiento": "manual"|"automatico"|"apertura"|"cierre"|"refundicion"|"revaluacion"|"reversion","tipo_auxiliar": "proveedor"|"disciplina"
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
  "contabilidad": {
          Enums: {
            "clase_cuenta": ["activo", "pasivo", "patrimonio", "ingreso", "egreso"],"estado_asiento": ["borrador", "confirmado"],"estado_periodo": ["abierto", "cerrado"],"naturaleza": ["deudora", "acreedora"],"tipo_asiento": ["manual", "automatico", "apertura", "cierre", "refundicion", "revaluacion", "reversion"],"tipo_auxiliar": ["proveedor", "disciplina"]
          }
        }
} as const
