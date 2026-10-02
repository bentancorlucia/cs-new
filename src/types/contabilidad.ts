
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
                    "activa": boolean,"clase": Database["contabilidad"]['Enums']["clase_cuenta"],"codigo": string,"corriente": boolean | null,"created_at": string,"descripcion": string | null,"es_disponibilidad": boolean,"id": string,"imputable": boolean,"moneda": string | null,"naturaleza": Database["contabilidad"]['Enums']["naturaleza"],"nivel": number,"nombre": string,"padre_id": string | null,"requiere_auxiliar": Database["contabilidad"]['Enums']["tipo_auxiliar"] | null,"requiere_centro_costo": boolean,"revalua": boolean,"updated_at": string
                  }
                  Insert: {
                    "activa"?: boolean,"clase": Database["contabilidad"]['Enums']["clase_cuenta"],"codigo": string,"corriente"?: boolean | null,"created_at"?: string,"descripcion"?: string | null,"es_disponibilidad"?: boolean,"id"?: string,"imputable"?: boolean,"moneda"?: string | null,"naturaleza": Database["contabilidad"]['Enums']["naturaleza"],"nivel": number,"nombre": string,"padre_id"?: string | null,"requiere_auxiliar"?: Database["contabilidad"]['Enums']["tipo_auxiliar"] | null,"requiere_centro_costo"?: boolean,"revalua"?: boolean,"updated_at"?: string
                  }
                  Update: {
                    "activa"?: boolean,"clase"?: Database["contabilidad"]['Enums']["clase_cuenta"],"codigo"?: string,"corriente"?: boolean | null,"created_at"?: string,"descripcion"?: string | null,"es_disponibilidad"?: boolean,"id"?: string,"imputable"?: boolean,"moneda"?: string | null,"naturaleza"?: Database["contabilidad"]['Enums']["naturaleza"],"nivel"?: number,"nombre"?: string,"padre_id"?: string | null,"requiere_auxiliar"?: Database["contabilidad"]['Enums']["tipo_auxiliar"] | null,"requiere_centro_costo"?: boolean,"revalua"?: boolean,"updated_at"?: string
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
                },"lineas": {
                  Row: {
                    "asiento_id": string,"centro_costo_id": string | null,"cuenta_id": string,"debe": number,"descripcion": string | null,"disciplina_id": number | null,"haber": number,"id": number,"importe_origen": number | null,"moneda": string | null,"orden": number,"proveedor_id": number | null,"tc": number | null
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
"_hoy":
{ Args: Record<PropertyKey, never>; Returns: string
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
"_tiene_rol":
{ Args: { "p_roles": (string)[] }; Returns: boolean
                           },
"cerrar_ejercicio":
{ Args: { "p_ejercicio": string }; Returns: string
                           },
"cerrar_periodo":
{ Args: { "p_periodo": string }; Returns: undefined
                           },
"confirmar_asiento":
{ Args: { "p_id": string }; Returns: number
                           },
"crear_ejercicio":
{ Args: { "p_anio": number }; Returns: string
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
"eliminar_borrador":
{ Args: { "p_id": string }; Returns: undefined
                           },
"guardar_asiento":
{ Args: { "p_confirmar"?: boolean,"p_descripcion": string,"p_fecha": string,"p_id": string,"p_lineas": Json,"p_tipo"?: Database["contabilidad"]['Enums']["tipo_asiento"] }; Returns: string
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
"reabrir_periodo":
{ Args: { "p_periodo": string }; Returns: undefined
                           },
"registrar_cotizacion":
{ Args: { "p_fecha": string,"p_fuente"?: string,"p_moneda": string,"p_tasa": number }; Returns: undefined
                           },
"revaluar_moneda_extranjera":
{ Args: { "p_fecha": string }; Returns: string
                           },
"revertir_asiento":
{ Args: { "p_fecha"?: string,"p_id": string,"p_motivo": string }; Returns: string
                           },
"saldos":
{ Args: { "p_desde": string,"p_excluir_cierre"?: boolean,"p_hasta": string }; Returns: {
              "cuenta_id": string,"debe": number,"debe_anterior": number,"haber": number,"haber_anterior": number,"origen_anterior": number,"origen_periodo": number
            }[]
                           },
"sincronizar_centros_disciplinas":
{ Args: Record<PropertyKey, never>; Returns: number
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
