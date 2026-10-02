
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  
  "comunicaciones": {
          Tables: {
            "automatizaciones": {
                  Row: {
                    "activa": boolean,"clave": string,"descripcion": string | null,"modo": string,"nombre": string,"parametros": NonNullable<Json>,"plantilla_clave": string,"updated_at": string,"updated_by": string | null
                  }
                  Insert: {
                    "activa"?: boolean,"clave": string,"descripcion"?: string | null,"modo": string,"nombre": string,"parametros"?: NonNullable<Json>,"plantilla_clave": string,"updated_at"?: string,"updated_by"?: string | null
                  }
                  Update: {
                    "activa"?: boolean,"clave"?: string,"descripcion"?: string | null,"modo"?: string,"nombre"?: string,"parametros"?: NonNullable<Json>,"plantilla_clave"?: string,"updated_at"?: string,"updated_by"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "automatizaciones_plantilla_clave_fkey"
      columns: ["plantilla_clave"]
isOneToOne: false
      referencedRelation: "plantillas"
      referencedColumns: ["clave"]
    }
                  ]
                },"config": {
                  Row: {
                    "id": boolean,"limite_por_hora": number,"limite_por_tanda": number,"pie": string | null,"remitente_email": string,"remitente_nombre": string,"responder_a": string | null,"updated_at": string,"updated_by": string | null,"whatsapp_mensajes": NonNullable<Json>,"whatsapp_tienda": string | null
                  }
                  Insert: {
                    "id"?: boolean,"limite_por_hora"?: number,"limite_por_tanda"?: number,"pie"?: string | null,"remitente_email"?: string,"remitente_nombre"?: string,"responder_a"?: string | null,"updated_at"?: string,"updated_by"?: string | null,"whatsapp_mensajes"?: NonNullable<Json>,"whatsapp_tienda"?: string | null
                  }
                  Update: {
                    "id"?: boolean,"limite_por_hora"?: number,"limite_por_tanda"?: number,"pie"?: string | null,"remitente_email"?: string,"remitente_nombre"?: string,"responder_a"?: string | null,"updated_at"?: string,"updated_by"?: string | null,"whatsapp_mensajes"?: NonNullable<Json>,"whatsapp_tienda"?: string | null
                  }
                  Relationships: [
                    
                  ]
                },"corridas": {
                  Row: {
                    "cantidad": number,"clave": string,"created_at": string,"envio_id": string | null,"id": number,"periodo": string
                  }
                  Insert: {
                    "cantidad"?: number,"clave": string,"created_at"?: string,"envio_id"?: string | null,"id"?: never,"periodo": string
                  }
                  Update: {
                    "cantidad"?: number,"clave"?: string,"created_at"?: string,"envio_id"?: string | null,"id"?: never,"periodo"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "corridas_clave_fkey"
      columns: ["clave"]
isOneToOne: false
      referencedRelation: "automatizaciones"
      referencedColumns: ["clave"]
    },{
      foreignKeyName: "corridas_envio_id_fkey"
      columns: ["envio_id"]
isOneToOne: false
      referencedRelation: "envios"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "corridas_envio_id_fkey"
      columns: ["envio_id"]
isOneToOne: false
      referencedRelation: "envios_resumen"
      referencedColumns: ["id"]
    }
                  ]
                },"envios": {
                  Row: {
                    "aprobado_at": string | null,"aprobado_por": string | null,"asunto": string,"audiencia": Json | null,"categoria": string,"creado_por": string | null,"created_at": string,"cuerpo": string | null,"estado": string,"id": string,"nombre": string,"origen": string,"plantilla_id": string | null,"programado_para": string
                  }
                  Insert: {
                    "aprobado_at"?: string | null,"aprobado_por"?: string | null,"asunto": string,"audiencia"?: Json | null,"categoria": string,"creado_por"?: string | null,"created_at"?: string,"cuerpo"?: string | null,"estado"?: string,"id"?: string,"nombre": string,"origen"?: string,"plantilla_id"?: string | null,"programado_para"?: string
                  }
                  Update: {
                    "aprobado_at"?: string | null,"aprobado_por"?: string | null,"asunto"?: string,"audiencia"?: Json | null,"categoria"?: string,"creado_por"?: string | null,"created_at"?: string,"cuerpo"?: string | null,"estado"?: string,"id"?: string,"nombre"?: string,"origen"?: string,"plantilla_id"?: string | null,"programado_para"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "envios_plantilla_id_fkey"
      columns: ["plantilla_id"]
isOneToOne: false
      referencedRelation: "plantillas"
      referencedColumns: ["id"]
    }
                  ]
                },"mensajes": {
                  Row: {
                    "bloqueado_hasta": string | null,"categoria": string,"created_at": string,"dedupe_key": string | null,"email": string,"enviado_at": string | null,"envio_id": string,"error": string | null,"estado": string,"html": string | null,"id": string,"intentos": number,"motivo_omision": string | null,"nombre": string | null,"perfil_id": string | null,"persona_id": number | null,"proximo_intento": string,"ref_id": string | null,"ref_tipo": string | null,"smtp_id": string | null,"variables": NonNullable<Json>
                  }
                  Insert: {
                    "bloqueado_hasta"?: string | null,"categoria": string,"created_at"?: string,"dedupe_key"?: string | null,"email": string,"enviado_at"?: string | null,"envio_id": string,"error"?: string | null,"estado"?: string,"html"?: string | null,"id"?: string,"intentos"?: number,"motivo_omision"?: string | null,"nombre"?: string | null,"perfil_id"?: string | null,"persona_id"?: number | null,"proximo_intento"?: string,"ref_id"?: string | null,"ref_tipo"?: string | null,"smtp_id"?: string | null,"variables"?: NonNullable<Json>
                  }
                  Update: {
                    "bloqueado_hasta"?: string | null,"categoria"?: string,"created_at"?: string,"dedupe_key"?: string | null,"email"?: string,"enviado_at"?: string | null,"envio_id"?: string,"error"?: string | null,"estado"?: string,"html"?: string | null,"id"?: string,"intentos"?: number,"motivo_omision"?: string | null,"nombre"?: string | null,"perfil_id"?: string | null,"persona_id"?: number | null,"proximo_intento"?: string,"ref_id"?: string | null,"ref_tipo"?: string | null,"smtp_id"?: string | null,"variables"?: NonNullable<Json>
                  }
                  Relationships: [
                    {
      foreignKeyName: "mensajes_envio_id_fkey"
      columns: ["envio_id"]
isOneToOne: false
      referencedRelation: "envios"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "mensajes_envio_id_fkey"
      columns: ["envio_id"]
isOneToOne: false
      referencedRelation: "envios_resumen"
      referencedColumns: ["id"]
    }
                  ]
                },"plantillas": {
                  Row: {
                    "activa": boolean,"asunto": string,"categoria": string,"clave": string,"created_at": string,"cuerpo": string,"id": string,"nombre": string,"sistema": boolean,"updated_at": string,"updated_by": string | null
                  }
                  Insert: {
                    "activa"?: boolean,"asunto": string,"categoria": string,"clave": string,"created_at"?: string,"cuerpo": string,"id"?: string,"nombre": string,"sistema"?: boolean,"updated_at"?: string,"updated_by"?: string | null
                  }
                  Update: {
                    "activa"?: boolean,"asunto"?: string,"categoria"?: string,"clave"?: string,"created_at"?: string,"cuerpo"?: string,"id"?: string,"nombre"?: string,"sistema"?: boolean,"updated_at"?: string,"updated_by"?: string | null
                  }
                  Relationships: [
                    
                  ]
                },"supresiones": {
                  Row: {
                    "alcance": string,"created_at": string,"email": string,"id": number,"mensaje_id": string | null,"motivo": string,"notas": string | null,"origen": string,"registrado_por": string | null,"revocada_at": string | null,"revocada_por": string | null
                  }
                  Insert: {
                    "alcance": string,"created_at"?: string,"email": string,"id"?: never,"mensaje_id"?: string | null,"motivo": string,"notas"?: string | null,"origen": string,"registrado_por"?: string | null,"revocada_at"?: string | null,"revocada_por"?: string | null
                  }
                  Update: {
                    "alcance"?: string,"created_at"?: string,"email"?: string,"id"?: never,"mensaje_id"?: string | null,"motivo"?: string,"notas"?: string | null,"origen"?: string,"registrado_por"?: string | null,"revocada_at"?: string | null,"revocada_por"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "supresiones_mensaje_id_fkey"
      columns: ["mensaje_id"]
isOneToOne: false
      referencedRelation: "mensajes"
      referencedColumns: ["id"]
    }
                  ]
                }
          }
          Views: {
            "envios_resumen": {
                  Row: {
                    "aprobado_at": string | null,"aprobado_por": string | null,"asunto": string | null,"audiencia": Json | null,"cancelados": number | null,"categoria": string | null,"creado_por": string | null,"created_at": string | null,"cuerpo": string | null,"enviados": number | null,"enviando": number | null,"estado": string | null,"fallidos": number | null,"id": string | null,"nombre": string | null,"omitidos": number | null,"origen": string | null,"pendientes": number | null,"plantilla_id": string | null,"programado_para": string | null,"total": number | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "envios_plantilla_id_fkey"
      columns: ["plantilla_id"]
isOneToOne: false
      referencedRelation: "plantillas"
      referencedColumns: ["id"]
    }
                  ]
                }
          }
          Functions: {
            "_encolar":
{ Args: { "p_aprobado": boolean,"p_asunto": string,"p_audiencia"?: Json,"p_categoria": string,"p_cuerpo": string,"p_destinatarios": Json,"p_nombre": string,"p_origen": string,"p_plantilla"?: string,"p_programado_para"?: string }; Returns: string
                           },
"_exigir_gestion":
{ Args: Record<PropertyKey, never>; Returns: undefined
                           },
"aprobar_envio":
{ Args: { "p_envio": string,"p_programado_para"?: string }; Returns: undefined
                           },
"audiencia_socios":
{ Args: { "p_filtro"?: Json }; Returns: {
              "email": string,"nombre": string,"perfil_id": string,"persona_id": number,"variables": Json
            }[]
                           },
"cancelar_envio":
{ Args: { "p_envio": string }; Returns: number
                           },
"correr_automatizacion":
{ Args: { "p_clave": string,"p_dedupe_prefijo": string,"p_filtro": Json,"p_periodo": string }; Returns: string
                           },
"crear_envio":
{ Args: { "p_asunto": string,"p_audiencia"?: Json,"p_categoria": string,"p_cuerpo": string,"p_destinatarios": Json,"p_nombre": string,"p_plantilla"?: string }; Returns: string
                           },
"encolar_transaccional":
{ Args: { "p_asunto": string,"p_dedupe_key": string,"p_email": string,"p_html": string,"p_nombre": string,"p_perfil"?: string,"p_ref_id"?: string,"p_ref_tipo"?: string,"p_variables"?: Json }; Returns: string
                           },
"omitir_mensaje":
{ Args: { "p_mensaje": string,"p_motivo": string }; Returns: undefined
                           },
"puede_gestionar":
{ Args: Record<PropertyKey, never>; Returns: boolean
                           },
"puede_ver":
{ Args: Record<PropertyKey, never>; Returns: boolean
                           },
"registrar_baja":
{ Args: { "p_mensaje": string,"p_origen"?: string }; Returns: string
                           },
"reintentar_fallidos":
{ Args: { "p_envio": string }; Returns: number
                           },
"resultado_mensaje":
{ Args: { "p_error"?: string,"p_mensaje": string,"p_ok": boolean,"p_permanente"?: boolean,"p_smtp_id"?: string }; Returns: undefined
                           },
"revocar_supresion":
{ Args: { "p_supresion": number }; Returns: undefined
                           },
"suprimido":
{ Args: { "p_categoria": string,"p_email": string }; Returns: boolean
                           },
"suprimir":
{ Args: { "p_alcance": string,"p_email": string,"p_motivo": string,"p_notas"?: string }; Returns: undefined
                           },
"tomar_mensajes":
{ Args: Record<PropertyKey, never>; Returns: {
              "bloqueado_hasta": string | null,
"categoria": string,
"created_at": string,
"dedupe_key": string | null,
"email": string,
"enviado_at": string | null,
"envio_id": string,
"error": string | null,
"estado": string,
"html": string | null,
"id": string,
"intentos": number,
"motivo_omision": string | null,
"nombre": string | null,
"perfil_id": string | null,
"persona_id": number | null,
"proximo_intento": string,
"ref_id": string | null,
"ref_tipo": string | null,
"smtp_id": string | null,
"variables": NonNullable<Json>
            }[]
                          SetofOptions: {
        from: "*"
        to: "mensajes"
        isOneToOne: false
        isSetofReturn: true
      } }
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
  "comunicaciones": {
          Enums: {
            
          }
        }
} as const
