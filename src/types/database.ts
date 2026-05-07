export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.4"
  }
  public: {
    Tables: {
      categorias_financieras: {
        Row: {
          activa: boolean | null
          color: string | null
          created_at: string | null
          icono: string | null
          id: number
          nombre: string
          orden: number | null
          padre_id: number | null
          presupuesto_mensual: number | null
          slug: string
          tipo: string
        }
        Insert: {
          activa?: boolean | null
          color?: string | null
          created_at?: string | null
          icono?: string | null
          id?: number
          nombre: string
          orden?: number | null
          padre_id?: number | null
          presupuesto_mensual?: number | null
          slug: string
          tipo: string
        }
        Update: {
          activa?: boolean | null
          color?: string | null
          created_at?: string | null
          icono?: string | null
          id?: number
          nombre?: string
          orden?: number | null
          padre_id?: number | null
          presupuesto_mensual?: number | null
          slug?: string
          tipo?: string
        }
        Relationships: [
          {
            foreignKeyName: "categorias_financieras_padre_id_fkey"
            columns: ["padre_id"]
            isOneToOne: false
            referencedRelation: "categorias_financieras"
            referencedColumns: ["id"]
          },
        ]
      }
      categorias_producto: {
        Row: {
          activa: boolean | null
          created_at: string | null
          descripcion: string | null
          id: number
          imagen_url: string | null
          nombre: string
          orden: number | null
          slug: string
        }
        Insert: {
          activa?: boolean | null
          created_at?: string | null
          descripcion?: string | null
          id?: number
          imagen_url?: string | null
          nombre: string
          orden?: number | null
          slug: string
        }
        Update: {
          activa?: boolean | null
          created_at?: string | null
          descripcion?: string | null
          id?: number
          imagen_url?: string | null
          nombre?: string
          orden?: number | null
          slug?: string
        }
        Relationships: []
      }
      compra_items: {
        Row: {
          cantidad: number
          cantidad_recibida: number | null
          compra_id: number
          costo_unitario: number
          created_at: string | null
          id: number
          producto_id: number
          subtotal: number
          variante_id: number | null
        }
        Insert: {
          cantidad: number
          cantidad_recibida?: number | null
          compra_id: number
          costo_unitario: number
          created_at?: string | null
          id?: number
          producto_id: number
          subtotal: number
          variante_id?: number | null
        }
        Update: {
          cantidad?: number
          cantidad_recibida?: number | null
          compra_id?: number
          costo_unitario?: number
          created_at?: string | null
          id?: number
          producto_id?: number
          subtotal?: number
          variante_id?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "compra_items_compra_id_fkey"
            columns: ["compra_id"]
            isOneToOne: false
            referencedRelation: "compras_proveedor"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "compra_items_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "productos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "compra_items_variante_id_fkey"
            columns: ["variante_id"]
            isOneToOne: false
            referencedRelation: "producto_variantes"
            referencedColumns: ["id"]
          },
        ]
      }
      compras_proveedor: {
        Row: {
          created_at: string | null
          estado: string
          fecha_compra: string | null
          fecha_recepcion: string | null
          id: number
          impuestos: number | null
          moneda: string | null
          notas: string | null
          numero_compra: string
          proveedor_id: number
          registrado_por: string | null
          subtotal: number
          total: number
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          estado?: string
          fecha_compra?: string | null
          fecha_recepcion?: string | null
          id?: number
          impuestos?: number | null
          moneda?: string | null
          notas?: string | null
          numero_compra: string
          proveedor_id: number
          registrado_por?: string | null
          subtotal?: number
          total?: number
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          estado?: string
          fecha_compra?: string | null
          fecha_recepcion?: string | null
          id?: number
          impuestos?: number | null
          moneda?: string | null
          notas?: string | null
          numero_compra?: string
          proveedor_id?: number
          registrado_por?: string | null
          subtotal?: number
          total?: number
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "compras_proveedor_proveedor_id_fkey"
            columns: ["proveedor_id"]
            isOneToOne: false
            referencedRelation: "proveedores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "compras_proveedor_registrado_por_fkey"
            columns: ["registrado_por"]
            isOneToOne: false
            referencedRelation: "perfiles"
            referencedColumns: ["id"]
          },
        ]
      }
      comprobantes: {
        Row: {
          created_at: string | null
          datos_extraidos: Json | null
          estado: string
          id: number
          motivo_rechazo: string | null
          nombre_archivo: string
          pedido_id: number
          tamano_bytes: number | null
          tipo: string
          updated_at: string | null
          url: string
          verificado_at: string | null
          verificado_por: string | null
        }
        Insert: {
          created_at?: string | null
          datos_extraidos?: Json | null
          estado?: string
          id?: number
          motivo_rechazo?: string | null
          nombre_archivo: string
          pedido_id: number
          tamano_bytes?: number | null
          tipo: string
          updated_at?: string | null
          url: string
          verificado_at?: string | null
          verificado_por?: string | null
        }
        Update: {
          created_at?: string | null
          datos_extraidos?: Json | null
          estado?: string
          id?: number
          motivo_rechazo?: string | null
          nombre_archivo?: string
          pedido_id?: number
          tamano_bytes?: number | null
          tipo?: string
          updated_at?: string | null
          url?: string
          verificado_at?: string | null
          verificado_por?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "comprobantes_pedido_id_fkey"
            columns: ["pedido_id"]
            isOneToOne: false
            referencedRelation: "pedidos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comprobantes_verificado_por_fkey"
            columns: ["verificado_por"]
            isOneToOne: false
            referencedRelation: "perfiles"
            referencedColumns: ["id"]
          },
        ]
      }
      contenido_paginas: {
        Row: {
          activo: boolean | null
          contenido: string | null
          id: number
          imagen_url: string | null
          orden: number | null
          pagina: string
          seccion: string
          titulo: string | null
          updated_at: string | null
          updated_by: string | null
        }
        Insert: {
          activo?: boolean | null
          contenido?: string | null
          id?: number
          imagen_url?: string | null
          orden?: number | null
          pagina: string
          seccion: string
          titulo?: string | null
          updated_at?: string | null
          updated_by?: string | null
        }
        Update: {
          activo?: boolean | null
          contenido?: string | null
          id?: number
          imagen_url?: string | null
          orden?: number | null
          pagina?: string
          seccion?: string
          titulo?: string | null
          updated_at?: string | null
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "contenido_paginas_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "perfiles"
            referencedColumns: ["id"]
          },
        ]
      }
      cotizaciones_bcu: {
        Row: {
          compra: number
          created_at: string
          fecha: string
          fuente: string
          id: number
          moneda: string
          venta: number
        }
        Insert: {
          compra: number
          created_at?: string
          fecha: string
          fuente?: string
          id?: number
          moneda?: string
          venta: number
        }
        Update: {
          compra?: number
          created_at?: string
          fecha?: string
          fuente?: string
          id?: number
          moneda?: string
          venta?: number
        }
        Relationships: []
      }
      cuentas_financieras: {
        Row: {
          activa: boolean | null
          banco: string | null
          color: string | null
          created_at: string | null
          descripcion: string | null
          id: number
          incluir_en_tesoreria: boolean
          modulo: string | null
          moneda: string
          nombre: string
          numero_cuenta: string | null
          saldo_actual: number
          saldo_inicial: number
          tipo: string
          titular: string | null
          updated_at: string | null
        }
        Insert: {
          activa?: boolean | null
          banco?: string | null
          color?: string | null
          created_at?: string | null
          descripcion?: string | null
          id?: number
          incluir_en_tesoreria?: boolean
          modulo?: string | null
          moneda: string
          nombre: string
          numero_cuenta?: string | null
          saldo_actual?: number
          saldo_inicial?: number
          tipo: string
          titular?: string | null
          updated_at?: string | null
        }
        Update: {
          activa?: boolean | null
          banco?: string | null
          color?: string | null
          created_at?: string | null
          descripcion?: string | null
          id?: number
          incluir_en_tesoreria?: boolean
          modulo?: string | null
          moneda?: string
          nombre?: string
          numero_cuenta?: string | null
          saldo_actual?: number
          saldo_inicial?: number
          tipo?: string
          titular?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      depositos: {
        Row: {
          activo: boolean | null
          created_at: string | null
          descripcion: string | null
          id: number
          nombre: string
          ubicacion: string | null
        }
        Insert: {
          activo?: boolean | null
          created_at?: string | null
          descripcion?: string | null
          id?: number
          nombre: string
          ubicacion?: string | null
        }
        Update: {
          activo?: boolean | null
          created_at?: string | null
          descripcion?: string | null
          id?: number
          nombre?: string
          ubicacion?: string | null
        }
        Relationships: []
      }
      disciplinas: {
        Row: {
          activa: boolean | null
          contacto_email: string | null
          contacto_nombre: string | null
          contacto_telefono: string | null
          created_at: string | null
          descripcion: string | null
          id: number
          imagen_url: string | null
          nombre: string
          saldo_cuenta_corriente: number | null
          slug: string
        }
        Insert: {
          activa?: boolean | null
          contacto_email?: string | null
          contacto_nombre?: string | null
          contacto_telefono?: string | null
          created_at?: string | null
          descripcion?: string | null
          id?: number
          imagen_url?: string | null
          nombre: string
          saldo_cuenta_corriente?: number | null
          slug: string
        }
        Update: {
          activa?: boolean | null
          contacto_email?: string | null
          contacto_nombre?: string | null
          contacto_telefono?: string | null
          created_at?: string | null
          descripcion?: string | null
          id?: number
          imagen_url?: string | null
          nombre?: string
          saldo_cuenta_corriente?: number | null
          slug?: string
        }
        Relationships: []
      }
      entradas: {
        Row: {
          cedula_asistente: string | null
          codigo: string
          created_at: string | null
          email_asistente: string | null
          estado: string
          evento_id: number
          id: number
          idempotency_key: string | null
          lote_id: number | null
          mercadopago_payment_id: string | null
          metodo_pago: string | null
          moneda: string | null
          nombre_asistente: string | null
          notas: string | null
          perfil_id: string | null
          precio_pagado: number
          qr_url: string | null
          tipo_entrada_id: number
          updated_at: string | null
          usado_at: string | null
          usado_por: string | null
        }
        Insert: {
          cedula_asistente?: string | null
          codigo?: string
          created_at?: string | null
          email_asistente?: string | null
          estado?: string
          evento_id: number
          id?: number
          idempotency_key?: string | null
          lote_id?: number | null
          mercadopago_payment_id?: string | null
          metodo_pago?: string | null
          moneda?: string | null
          nombre_asistente?: string | null
          notas?: string | null
          perfil_id?: string | null
          precio_pagado: number
          qr_url?: string | null
          tipo_entrada_id: number
          updated_at?: string | null
          usado_at?: string | null
          usado_por?: string | null
        }
        Update: {
          cedula_asistente?: string | null
          codigo?: string
          created_at?: string | null
          email_asistente?: string | null
          estado?: string
          evento_id?: number
          id?: number
          idempotency_key?: string | null
          lote_id?: number | null
          mercadopago_payment_id?: string | null
          metodo_pago?: string | null
          moneda?: string | null
          nombre_asistente?: string | null
          notas?: string | null
          perfil_id?: string | null
          precio_pagado?: number
          qr_url?: string | null
          tipo_entrada_id?: number
          updated_at?: string | null
          usado_at?: string | null
          usado_por?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "entradas_evento_id_fkey"
            columns: ["evento_id"]
            isOneToOne: false
            referencedRelation: "eventos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "entradas_lote_id_fkey"
            columns: ["lote_id"]
            isOneToOne: false
            referencedRelation: "lotes_entrada"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "entradas_perfil_id_fkey"
            columns: ["perfil_id"]
            isOneToOne: false
            referencedRelation: "perfiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "entradas_tipo_entrada_id_fkey"
            columns: ["tipo_entrada_id"]
            isOneToOne: false
            referencedRelation: "tipo_entradas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "entradas_usado_por_fkey"
            columns: ["usado_por"]
            isOneToOne: false
            referencedRelation: "perfiles"
            referencedColumns: ["id"]
          },
        ]
      }
      escaneos_entrada: {
        Row: {
          codigo_escaneado: string
          created_at: string | null
          entrada_id: number | null
          escaneado_por: string
          evento_id: number
          id: number
          ip_address: unknown
          resultado: string
        }
        Insert: {
          codigo_escaneado: string
          created_at?: string | null
          entrada_id?: number | null
          escaneado_por: string
          evento_id: number
          id?: number
          ip_address?: unknown
          resultado: string
        }
        Update: {
          codigo_escaneado?: string
          created_at?: string | null
          entrada_id?: number | null
          escaneado_por?: string
          evento_id?: number
          id?: number
          ip_address?: unknown
          resultado?: string
        }
        Relationships: [
          {
            foreignKeyName: "escaneos_entrada_entrada_id_fkey"
            columns: ["entrada_id"]
            isOneToOne: false
            referencedRelation: "entradas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "escaneos_entrada_escaneado_por_fkey"
            columns: ["escaneado_por"]
            isOneToOne: false
            referencedRelation: "perfiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "escaneos_entrada_evento_id_fkey"
            columns: ["evento_id"]
            isOneToOne: false
            referencedRelation: "eventos"
            referencedColumns: ["id"]
          },
        ]
      }
      eventos: {
        Row: {
          capacidad_total: number | null
          creado_por: string | null
          created_at: string | null
          descripcion: string | null
          descripcion_corta: string | null
          direccion: string | null
          es_gratuito: boolean | null
          estado: string
          fecha_fin: string | null
          fecha_inicio: string
          id: number
          imagen_url: string | null
          lugar: string | null
          requiere_registro: boolean | null
          slug: string
          titulo: string
          updated_at: string | null
        }
        Insert: {
          capacidad_total?: number | null
          creado_por?: string | null
          created_at?: string | null
          descripcion?: string | null
          descripcion_corta?: string | null
          direccion?: string | null
          es_gratuito?: boolean | null
          estado?: string
          fecha_fin?: string | null
          fecha_inicio: string
          id?: number
          imagen_url?: string | null
          lugar?: string | null
          requiere_registro?: boolean | null
          slug: string
          titulo: string
          updated_at?: string | null
        }
        Update: {
          capacidad_total?: number | null
          creado_por?: string | null
          created_at?: string | null
          descripcion?: string | null
          descripcion_corta?: string | null
          direccion?: string | null
          es_gratuito?: boolean | null
          estado?: string
          fecha_fin?: string | null
          fecha_inicio?: string
          id?: number
          imagen_url?: string | null
          lugar?: string | null
          requiere_registro?: boolean | null
          slug?: string
          titulo?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "eventos_creado_por_fkey"
            columns: ["creado_por"]
            isOneToOne: false
            referencedRelation: "perfiles"
            referencedColumns: ["id"]
          },
        ]
      }
      extractos_importados: {
        Row: {
          archivo_hash: string
          archivo_nombre: string
          created_at: string
          cuenta_id: number
          fecha_desde: string | null
          fecha_hasta: string | null
          formato: string
          id: number
          importado_por: string | null
          movimientos_creados: number
          movimientos_duplicados: number
          saldo_final_extracto: number | null
          saldo_inicial_extracto: number | null
          total_movimientos: number
        }
        Insert: {
          archivo_hash: string
          archivo_nombre: string
          created_at?: string
          cuenta_id: number
          fecha_desde?: string | null
          fecha_hasta?: string | null
          formato?: string
          id?: number
          importado_por?: string | null
          movimientos_creados?: number
          movimientos_duplicados?: number
          saldo_final_extracto?: number | null
          saldo_inicial_extracto?: number | null
          total_movimientos?: number
        }
        Update: {
          archivo_hash?: string
          archivo_nombre?: string
          created_at?: string
          cuenta_id?: number
          fecha_desde?: string | null
          fecha_hasta?: string | null
          formato?: string
          id?: number
          importado_por?: string | null
          movimientos_creados?: number
          movimientos_duplicados?: number
          saldo_final_extracto?: number | null
          saldo_inicial_extracto?: number | null
          total_movimientos?: number
        }
        Relationships: [
          {
            foreignKeyName: "extractos_importados_cuenta_id_fkey"
            columns: ["cuenta_id"]
            isOneToOne: false
            referencedRelation: "cuentas_financieras"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "extractos_importados_importado_por_fkey"
            columns: ["importado_por"]
            isOneToOne: false
            referencedRelation: "perfiles"
            referencedColumns: ["id"]
          },
        ]
      }
      lista_precio_disciplinas: {
        Row: {
          disciplina_id: number
          id: number
          lista_precio_id: number
        }
        Insert: {
          disciplina_id: number
          id?: number
          lista_precio_id: number
        }
        Update: {
          disciplina_id?: number
          id?: number
          lista_precio_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "lista_precio_disciplinas_disciplina_id_fkey"
            columns: ["disciplina_id"]
            isOneToOne: false
            referencedRelation: "disciplinas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lista_precio_disciplinas_lista_precio_id_fkey"
            columns: ["lista_precio_id"]
            isOneToOne: false
            referencedRelation: "listas_precio"
            referencedColumns: ["id"]
          },
        ]
      }
      lista_precio_items: {
        Row: {
          created_at: string | null
          id: number
          lista_precio_id: number
          precio: number
          producto_id: number
          variante_id: number | null
        }
        Insert: {
          created_at?: string | null
          id?: number
          lista_precio_id: number
          precio: number
          producto_id: number
          variante_id?: number | null
        }
        Update: {
          created_at?: string | null
          id?: number
          lista_precio_id?: number
          precio?: number
          producto_id?: number
          variante_id?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "lista_precio_items_lista_precio_id_fkey"
            columns: ["lista_precio_id"]
            isOneToOne: false
            referencedRelation: "listas_precio"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lista_precio_items_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "productos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lista_precio_items_variante_id_fkey"
            columns: ["variante_id"]
            isOneToOne: false
            referencedRelation: "producto_variantes"
            referencedColumns: ["id"]
          },
        ]
      }
      listas_precio: {
        Row: {
          activa: boolean | null
          created_at: string | null
          descripcion: string | null
          id: number
          nombre: string
          updated_at: string | null
        }
        Insert: {
          activa?: boolean | null
          created_at?: string | null
          descripcion?: string | null
          id?: number
          nombre: string
          updated_at?: string | null
        }
        Update: {
          activa?: boolean | null
          created_at?: string | null
          descripcion?: string | null
          id?: number
          nombre?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      lotes_entrada: {
        Row: {
          cantidad: number
          created_at: string | null
          estado: string | null
          fecha_fin: string | null
          fecha_inicio: string
          id: number
          nombre: string
          orden: number | null
          precio: number
          tipo_entrada_id: number
          vendidas: number | null
        }
        Insert: {
          cantidad: number
          created_at?: string | null
          estado?: string | null
          fecha_fin?: string | null
          fecha_inicio: string
          id?: number
          nombre: string
          orden?: number | null
          precio: number
          tipo_entrada_id: number
          vendidas?: number | null
        }
        Update: {
          cantidad?: number
          created_at?: string | null
          estado?: string | null
          fecha_fin?: string | null
          fecha_inicio?: string
          id?: number
          nombre?: string
          orden?: number | null
          precio?: number
          tipo_entrada_id?: number
          vendidas?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "lotes_entrada_tipo_entrada_id_fkey"
            columns: ["tipo_entrada_id"]
            isOneToOne: false
            referencedRelation: "tipo_entradas"
            referencedColumns: ["id"]
          },
        ]
      }
      memorias: {
        Row: {
          anio: number
          archivo_url: string
          created_at: string | null
          id: number
          titulo: string | null
        }
        Insert: {
          anio: number
          archivo_url: string
          created_at?: string | null
          id?: number
          titulo?: string | null
        }
        Update: {
          anio?: number
          archivo_url?: string
          created_at?: string | null
          id?: number
          titulo?: string | null
        }
        Relationships: []
      }
      movimientos_financieros: {
        Row: {
          categoria_id: number | null
          clasificado: boolean
          comprobante_url: string | null
          created_at: string | null
          cuenta_id: number
          descripcion: string
          extracto_id: number | null
          fecha: string
          hash_dedupe: string | null
          id: number
          moneda: string
          monto: number
          nombre: string | null
          notas: string | null
          origen_id: number | null
          origen_tipo: string | null
          referencia: string | null
          registrado_por: string | null
          subcategoria_id: number | null
          tags: string[] | null
          tipo: string
          transferencia_id: number | null
          updated_at: string | null
        }
        Insert: {
          categoria_id?: number | null
          clasificado?: boolean
          comprobante_url?: string | null
          created_at?: string | null
          cuenta_id: number
          descripcion: string
          extracto_id?: number | null
          fecha: string
          hash_dedupe?: string | null
          id?: number
          moneda: string
          monto: number
          nombre?: string | null
          notas?: string | null
          origen_id?: number | null
          origen_tipo?: string | null
          referencia?: string | null
          registrado_por?: string | null
          subcategoria_id?: number | null
          tags?: string[] | null
          tipo: string
          transferencia_id?: number | null
          updated_at?: string | null
        }
        Update: {
          categoria_id?: number | null
          clasificado?: boolean
          comprobante_url?: string | null
          created_at?: string | null
          cuenta_id?: number
          descripcion?: string
          extracto_id?: number | null
          fecha?: string
          hash_dedupe?: string | null
          id?: number
          moneda?: string
          monto?: number
          nombre?: string | null
          notas?: string | null
          origen_id?: number | null
          origen_tipo?: string | null
          referencia?: string | null
          registrado_por?: string | null
          subcategoria_id?: number | null
          tags?: string[] | null
          tipo?: string
          transferencia_id?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fk_movimientos_extracto"
            columns: ["extracto_id"]
            isOneToOne: false
            referencedRelation: "extractos_importados"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "movimientos_financieros_categoria_id_fkey"
            columns: ["categoria_id"]
            isOneToOne: false
            referencedRelation: "categorias_financieras"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "movimientos_financieros_cuenta_id_fkey"
            columns: ["cuenta_id"]
            isOneToOne: false
            referencedRelation: "cuentas_financieras"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "movimientos_financieros_registrado_por_fkey"
            columns: ["registrado_por"]
            isOneToOne: false
            referencedRelation: "perfiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "movimientos_financieros_subcategoria_id_fkey"
            columns: ["subcategoria_id"]
            isOneToOne: false
            referencedRelation: "categorias_financieras"
            referencedColumns: ["id"]
          },
        ]
      }
      padron_disciplinas: {
        Row: {
          activa: boolean | null
          categoria: string | null
          created_at: string | null
          disciplina_id: number
          fecha_ingreso: string | null
          id: number
          padron_socio_id: number
        }
        Insert: {
          activa?: boolean | null
          categoria?: string | null
          created_at?: string | null
          disciplina_id: number
          fecha_ingreso?: string | null
          id?: number
          padron_socio_id: number
        }
        Update: {
          activa?: boolean | null
          categoria?: string | null
          created_at?: string | null
          disciplina_id?: number
          fecha_ingreso?: string | null
          id?: number
          padron_socio_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "padron_disciplinas_disciplina_id_fkey"
            columns: ["disciplina_id"]
            isOneToOne: false
            referencedRelation: "disciplinas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "padron_disciplinas_padron_socio_id_fkey"
            columns: ["padron_socio_id"]
            isOneToOne: false
            referencedRelation: "padron_socios"
            referencedColumns: ["id"]
          },
        ]
      }
      padron_socios: {
        Row: {
          activo: boolean
          activo_since: string | null
          apellido: string
          cedula: string
          created_at: string | null
          created_by: string | null
          desactivado_at: string | null
          fecha_nacimiento: string | null
          id: number
          nombre: string
          notas: string | null
          perfil_id: string | null
          telefono: string | null
          updated_at: string | null
          vinculado_at: string | null
        }
        Insert: {
          activo?: boolean
          activo_since?: string | null
          apellido: string
          cedula: string
          created_at?: string | null
          created_by?: string | null
          desactivado_at?: string | null
          fecha_nacimiento?: string | null
          id?: number
          nombre: string
          notas?: string | null
          perfil_id?: string | null
          telefono?: string | null
          updated_at?: string | null
          vinculado_at?: string | null
        }
        Update: {
          activo?: boolean
          activo_since?: string | null
          apellido?: string
          cedula?: string
          created_at?: string | null
          created_by?: string | null
          desactivado_at?: string | null
          fecha_nacimiento?: string | null
          id?: number
          nombre?: string
          notas?: string | null
          perfil_id?: string | null
          telefono?: string | null
          updated_at?: string | null
          vinculado_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "padron_socios_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "perfiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "padron_socios_perfil_id_fkey"
            columns: ["perfil_id"]
            isOneToOne: true
            referencedRelation: "perfiles"
            referencedColumns: ["id"]
          },
        ]
      }
      pagos_mercadopago: {
        Row: {
          created_at: string | null
          id: number
          mercadopago_payment_id: string
          mercadopago_status: string | null
          mercadopago_status_detail: string | null
          metodo: string | null
          moneda: string | null
          monto: number
          origen_id: number
          raw_data: Json | null
          tipo_origen: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          id?: number
          mercadopago_payment_id: string
          mercadopago_status?: string | null
          mercadopago_status_detail?: string | null
          metodo?: string | null
          moneda?: string | null
          monto: number
          origen_id: number
          raw_data?: Json | null
          tipo_origen: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          id?: number
          mercadopago_payment_id?: string
          mercadopago_status?: string | null
          mercadopago_status_detail?: string | null
          metodo?: string | null
          moneda?: string | null
          monto?: number
          origen_id?: number
          raw_data?: Json | null
          tipo_origen?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      pagos_proveedor: {
        Row: {
          compra_id: number | null
          created_at: string | null
          id: number
          metodo_pago: string
          moneda: string | null
          monto: number
          notas: string | null
          proveedor_id: number
          referencia: string | null
          registrado_por: string | null
        }
        Insert: {
          compra_id?: number | null
          created_at?: string | null
          id?: number
          metodo_pago: string
          moneda?: string | null
          monto: number
          notas?: string | null
          proveedor_id: number
          referencia?: string | null
          registrado_por?: string | null
        }
        Update: {
          compra_id?: number | null
          created_at?: string | null
          id?: number
          metodo_pago?: string
          moneda?: string | null
          monto?: number
          notas?: string | null
          proveedor_id?: number
          referencia?: string | null
          registrado_por?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pagos_proveedor_compra_id_fkey"
            columns: ["compra_id"]
            isOneToOne: false
            referencedRelation: "compras_proveedor"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pagos_proveedor_proveedor_id_fkey"
            columns: ["proveedor_id"]
            isOneToOne: false
            referencedRelation: "proveedores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pagos_proveedor_registrado_por_fkey"
            columns: ["registrado_por"]
            isOneToOne: false
            referencedRelation: "perfiles"
            referencedColumns: ["id"]
          },
        ]
      }
      pagos_socios: {
        Row: {
          created_at: string | null
          id: number
          metodo_pago: string
          moneda: string | null
          monto: number
          notas: string | null
          perfil_id: string
          periodo_anio: number
          periodo_mes: number
          referencia_pago: string | null
          registrado_por: string | null
        }
        Insert: {
          created_at?: string | null
          id?: number
          metodo_pago: string
          moneda?: string | null
          monto: number
          notas?: string | null
          perfil_id: string
          periodo_anio: number
          periodo_mes: number
          referencia_pago?: string | null
          registrado_por?: string | null
        }
        Update: {
          created_at?: string | null
          id?: number
          metodo_pago?: string
          moneda?: string | null
          monto?: number
          notas?: string | null
          perfil_id?: string
          periodo_anio?: number
          periodo_mes?: number
          referencia_pago?: string | null
          registrado_por?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pagos_socios_perfil_id_fkey"
            columns: ["perfil_id"]
            isOneToOne: false
            referencedRelation: "perfiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pagos_socios_registrado_por_fkey"
            columns: ["registrado_por"]
            isOneToOne: false
            referencedRelation: "perfiles"
            referencedColumns: ["id"]
          },
        ]
      }
      pedido_items: {
        Row: {
          cantidad: number
          created_at: string | null
          descuento_tipo: string | null
          descuento_unitario: number | null
          es_encargue: boolean
          id: number
          pedido_id: number
          personalizacion: Json
          precio_extra_personalizacion: number
          precio_unitario: number
          producto_id: number
          subtotal: number
          variante_id: number | null
        }
        Insert: {
          cantidad: number
          created_at?: string | null
          descuento_tipo?: string | null
          descuento_unitario?: number | null
          es_encargue?: boolean
          id?: number
          pedido_id: number
          personalizacion?: Json
          precio_extra_personalizacion?: number
          precio_unitario: number
          producto_id: number
          subtotal: number
          variante_id?: number | null
        }
        Update: {
          cantidad?: number
          created_at?: string | null
          descuento_tipo?: string | null
          descuento_unitario?: number | null
          es_encargue?: boolean
          id?: number
          pedido_id?: number
          personalizacion?: Json
          precio_extra_personalizacion?: number
          precio_unitario?: number
          producto_id?: number
          subtotal?: number
          variante_id?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "pedido_items_pedido_id_fkey"
            columns: ["pedido_id"]
            isOneToOne: false
            referencedRelation: "pedidos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pedido_items_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "productos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pedido_items_variante_id_fkey"
            columns: ["variante_id"]
            isOneToOne: false
            referencedRelation: "producto_variantes"
            referencedColumns: ["id"]
          },
        ]
      }
      pedidos: {
        Row: {
          created_at: string | null
          descuento: number | null
          descuento_motivo: string | null
          descuento_porcentaje: number | null
          descuento_tipo: string | null
          disciplina_id: number | null
          estado: string
          id: number
          idempotency_key: string | null
          mercadopago_payment_id: string | null
          mercadopago_preference_id: string | null
          metodo_pago: string | null
          moneda: string | null
          nombre_cliente: string | null
          notas: string | null
          numero_pedido: string | null
          perfil_id: string | null
          stock_reservado: boolean | null
          stock_reservado_at: string | null
          subtotal: number
          telefono_cliente: string | null
          tipo: string
          total: number
          updated_at: string | null
          vendedor_id: string | null
        }
        Insert: {
          created_at?: string | null
          descuento?: number | null
          descuento_motivo?: string | null
          descuento_porcentaje?: number | null
          descuento_tipo?: string | null
          disciplina_id?: number | null
          estado?: string
          id?: number
          idempotency_key?: string | null
          mercadopago_payment_id?: string | null
          mercadopago_preference_id?: string | null
          metodo_pago?: string | null
          moneda?: string | null
          nombre_cliente?: string | null
          notas?: string | null
          numero_pedido?: string | null
          perfil_id?: string | null
          stock_reservado?: boolean | null
          stock_reservado_at?: string | null
          subtotal: number
          telefono_cliente?: string | null
          tipo: string
          total: number
          updated_at?: string | null
          vendedor_id?: string | null
        }
        Update: {
          created_at?: string | null
          descuento?: number | null
          descuento_motivo?: string | null
          descuento_porcentaje?: number | null
          descuento_tipo?: string | null
          disciplina_id?: number | null
          estado?: string
          id?: number
          idempotency_key?: string | null
          mercadopago_payment_id?: string | null
          mercadopago_preference_id?: string | null
          metodo_pago?: string | null
          moneda?: string | null
          nombre_cliente?: string | null
          notas?: string | null
          numero_pedido?: string | null
          perfil_id?: string | null
          stock_reservado?: boolean | null
          stock_reservado_at?: string | null
          subtotal?: number
          telefono_cliente?: string | null
          tipo?: string
          total?: number
          updated_at?: string | null
          vendedor_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pedidos_disciplina_id_fkey"
            columns: ["disciplina_id"]
            isOneToOne: false
            referencedRelation: "disciplinas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pedidos_perfil_id_fkey"
            columns: ["perfil_id"]
            isOneToOne: false
            referencedRelation: "perfiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pedidos_vendedor_id_fkey"
            columns: ["vendedor_id"]
            isOneToOne: false
            referencedRelation: "perfiles"
            referencedColumns: ["id"]
          },
        ]
      }
      perfil_roles: {
        Row: {
          asignado_por: string | null
          created_at: string | null
          id: number
          perfil_id: string
          rol_id: number
        }
        Insert: {
          asignado_por?: string | null
          created_at?: string | null
          id?: number
          perfil_id: string
          rol_id: number
        }
        Update: {
          asignado_por?: string | null
          created_at?: string | null
          id?: number
          perfil_id?: string
          rol_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "perfil_roles_asignado_por_fkey"
            columns: ["asignado_por"]
            isOneToOne: false
            referencedRelation: "perfiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "perfil_roles_perfil_id_fkey"
            columns: ["perfil_id"]
            isOneToOne: false
            referencedRelation: "perfiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "perfil_roles_rol_id_fkey"
            columns: ["rol_id"]
            isOneToOne: false
            referencedRelation: "roles"
            referencedColumns: ["id"]
          },
        ]
      }
      perfiles: {
        Row: {
          apellido: string
          avatar_url: string | null
          cedula: string | null
          created_at: string | null
          es_socio: boolean | null
          fecha_nacimiento: string | null
          id: string
          nombre: string
          padron_socio_id: number | null
          socio_verificado: boolean | null
          telefono: string | null
          updated_at: string | null
        }
        Insert: {
          apellido: string
          avatar_url?: string | null
          cedula?: string | null
          created_at?: string | null
          es_socio?: boolean | null
          fecha_nacimiento?: string | null
          id: string
          nombre: string
          padron_socio_id?: number | null
          socio_verificado?: boolean | null
          telefono?: string | null
          updated_at?: string | null
        }
        Update: {
          apellido?: string
          avatar_url?: string | null
          cedula?: string | null
          created_at?: string | null
          es_socio?: boolean | null
          fecha_nacimiento?: string | null
          id?: string
          nombre?: string
          padron_socio_id?: number | null
          socio_verificado?: boolean | null
          telefono?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "perfiles_padron_socio_id_fkey"
            columns: ["padron_socio_id"]
            isOneToOne: false
            referencedRelation: "padron_socios"
            referencedColumns: ["id"]
          },
        ]
      }
      presupuestos: {
        Row: {
          anio: number
          categoria_id: number
          creado_por: string | null
          created_at: string
          fecha_desde: string
          fecha_hasta: string
          id: number
          moneda: string
          monto: number
          notas: string | null
          periodo_numero: number
          tipo_periodo: string
          updated_at: string
        }
        Insert: {
          anio: number
          categoria_id: number
          creado_por?: string | null
          created_at?: string
          fecha_desde: string
          fecha_hasta: string
          id?: number
          moneda?: string
          monto: number
          notas?: string | null
          periodo_numero: number
          tipo_periodo: string
          updated_at?: string
        }
        Update: {
          anio?: number
          categoria_id?: number
          creado_por?: string | null
          created_at?: string
          fecha_desde?: string
          fecha_hasta?: string
          id?: number
          moneda?: string
          monto?: number
          notas?: string | null
          periodo_numero?: number
          tipo_periodo?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "presupuestos_categoria_id_fkey"
            columns: ["categoria_id"]
            isOneToOne: false
            referencedRelation: "categorias_financieras"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "presupuestos_creado_por_fkey"
            columns: ["creado_por"]
            isOneToOne: false
            referencedRelation: "perfiles"
            referencedColumns: ["id"]
          },
        ]
      }
      producto_imagenes: {
        Row: {
          alt_text: string | null
          created_at: string | null
          es_principal: boolean | null
          focal_point: string | null
          id: number
          orden: number | null
          producto_id: number
          url: string
        }
        Insert: {
          alt_text?: string | null
          created_at?: string | null
          es_principal?: boolean | null
          focal_point?: string | null
          id?: number
          orden?: number | null
          producto_id: number
          url: string
        }
        Update: {
          alt_text?: string | null
          created_at?: string | null
          es_principal?: boolean | null
          focal_point?: string | null
          id?: number
          orden?: number | null
          producto_id?: number
          url?: string
        }
        Relationships: [
          {
            foreignKeyName: "producto_imagenes_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "productos"
            referencedColumns: ["id"]
          },
        ]
      }
      producto_proveedores: {
        Row: {
          codigo_proveedor: string | null
          costo: number | null
          created_at: string | null
          es_principal: boolean | null
          id: number
          producto_id: number
          proveedor_id: number
        }
        Insert: {
          codigo_proveedor?: string | null
          costo?: number | null
          created_at?: string | null
          es_principal?: boolean | null
          id?: number
          producto_id: number
          proveedor_id: number
        }
        Update: {
          codigo_proveedor?: string | null
          costo?: number | null
          created_at?: string | null
          es_principal?: boolean | null
          id?: number
          producto_id?: number
          proveedor_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "producto_proveedores_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "productos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "producto_proveedores_proveedor_id_fkey"
            columns: ["proveedor_id"]
            isOneToOne: false
            referencedRelation: "proveedores"
            referencedColumns: ["id"]
          },
        ]
      }
      producto_variantes: {
        Row: {
          activo: boolean | null
          atributos: Json | null
          created_at: string | null
          id: number
          nombre: string
          precio_override: number | null
          producto_id: number
          sku: string | null
          stock_actual: number
        }
        Insert: {
          activo?: boolean | null
          atributos?: Json | null
          created_at?: string | null
          id?: number
          nombre: string
          precio_override?: number | null
          producto_id: number
          sku?: string | null
          stock_actual?: number
        }
        Update: {
          activo?: boolean | null
          atributos?: Json | null
          created_at?: string | null
          id?: number
          nombre?: string
          precio_override?: number | null
          producto_id?: number
          sku?: string | null
          stock_actual?: number
        }
        Relationships: [
          {
            foreignKeyName: "producto_variantes_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "productos"
            referencedColumns: ["id"]
          },
        ]
      }
      productos: {
        Row: {
          activo: boolean | null
          categoria_id: number | null
          created_at: string | null
          descripcion: string | null
          descripcion_corta: string | null
          destacado: boolean | null
          id: number
          moneda: string | null
          mto_campos: Json
          mto_disponible: boolean
          mto_solo: boolean
          mto_tiempo_fabricacion_dias: number | null
          nombre: string
          peso: number | null
          precio: number
          precio_socio: number | null
          sku: string | null
          slug: string
          stock_actual: number
          stock_minimo: number | null
          unidad: string
          updated_at: string | null
        }
        Insert: {
          activo?: boolean | null
          categoria_id?: number | null
          created_at?: string | null
          descripcion?: string | null
          descripcion_corta?: string | null
          destacado?: boolean | null
          id?: number
          moneda?: string | null
          mto_campos?: Json
          mto_disponible?: boolean
          mto_solo?: boolean
          mto_tiempo_fabricacion_dias?: number | null
          nombre: string
          peso?: number | null
          precio: number
          precio_socio?: number | null
          sku?: string | null
          slug: string
          stock_actual?: number
          stock_minimo?: number | null
          unidad?: string
          updated_at?: string | null
        }
        Update: {
          activo?: boolean | null
          categoria_id?: number | null
          created_at?: string | null
          descripcion?: string | null
          descripcion_corta?: string | null
          destacado?: boolean | null
          id?: number
          moneda?: string | null
          mto_campos?: Json
          mto_disponible?: boolean
          mto_solo?: boolean
          mto_tiempo_fabricacion_dias?: number | null
          nombre?: string
          peso?: number | null
          precio?: number
          precio_socio?: number | null
          sku?: string | null
          slug?: string
          stock_actual?: number
          stock_minimo?: number | null
          unidad?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "productos_categoria_id_fkey"
            columns: ["categoria_id"]
            isOneToOne: false
            referencedRelation: "categorias_producto"
            referencedColumns: ["id"]
          },
        ]
      }
      proveedores: {
        Row: {
          activo: boolean | null
          contacto_email: string | null
          contacto_nombre: string | null
          contacto_telefono: string | null
          created_at: string | null
          direccion: string | null
          id: number
          nombre: string
          notas: string | null
          razon_social: string | null
          rut: string | null
          saldo_cuenta_corriente: number | null
          updated_at: string | null
        }
        Insert: {
          activo?: boolean | null
          contacto_email?: string | null
          contacto_nombre?: string | null
          contacto_telefono?: string | null
          created_at?: string | null
          direccion?: string | null
          id?: number
          nombre: string
          notas?: string | null
          razon_social?: string | null
          rut?: string | null
          saldo_cuenta_corriente?: number | null
          updated_at?: string | null
        }
        Update: {
          activo?: boolean | null
          contacto_email?: string | null
          contacto_nombre?: string | null
          contacto_telefono?: string | null
          created_at?: string | null
          direccion?: string | null
          id?: number
          nombre?: string
          notas?: string | null
          razon_social?: string | null
          rut?: string | null
          saldo_cuenta_corriente?: number | null
          updated_at?: string | null
        }
        Relationships: []
      }
      roles: {
        Row: {
          descripcion: string | null
          id: number
          nombre: string
        }
        Insert: {
          descripcion?: string | null
          id?: number
          nombre: string
        }
        Update: {
          descripcion?: string | null
          id?: number
          nombre?: string
        }
        Relationships: []
      }
      staff: {
        Row: {
          activo: boolean
          apellido: string
          cargo: string
          cedula: string | null
          created_at: string | null
          created_by: string | null
          descripcion: string | null
          disciplina_id: number | null
          email: string | null
          fecha_ingreso: string | null
          id: number
          nombre: string
          notas: string | null
          telefono: string | null
          updated_at: string | null
        }
        Insert: {
          activo?: boolean
          apellido: string
          cargo: string
          cedula?: string | null
          created_at?: string | null
          created_by?: string | null
          descripcion?: string | null
          disciplina_id?: number | null
          email?: string | null
          fecha_ingreso?: string | null
          id?: number
          nombre: string
          notas?: string | null
          telefono?: string | null
          updated_at?: string | null
        }
        Update: {
          activo?: boolean
          apellido?: string
          cargo?: string
          cedula?: string | null
          created_at?: string | null
          created_by?: string | null
          descripcion?: string | null
          disciplina_id?: number | null
          email?: string | null
          fecha_ingreso?: string | null
          id?: number
          nombre?: string
          notas?: string | null
          telefono?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "staff_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "perfiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staff_disciplina_id_fkey"
            columns: ["disciplina_id"]
            isOneToOne: false
            referencedRelation: "disciplinas"
            referencedColumns: ["id"]
          },
        ]
      }
      stock_deposito: {
        Row: {
          cantidad: number
          deposito_id: number
          id: number
          producto_id: number
          updated_at: string | null
          variante_id: number | null
        }
        Insert: {
          cantidad?: number
          deposito_id: number
          id?: number
          producto_id: number
          updated_at?: string | null
          variante_id?: number | null
        }
        Update: {
          cantidad?: number
          deposito_id?: number
          id?: number
          producto_id?: number
          updated_at?: string | null
          variante_id?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "stock_deposito_deposito_id_fkey"
            columns: ["deposito_id"]
            isOneToOne: false
            referencedRelation: "depositos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_deposito_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "productos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_deposito_variante_id_fkey"
            columns: ["variante_id"]
            isOneToOne: false
            referencedRelation: "producto_variantes"
            referencedColumns: ["id"]
          },
        ]
      }
      stock_movimientos: {
        Row: {
          cantidad: number
          created_at: string | null
          deposito_id: number | null
          id: number
          motivo: string | null
          producto_id: number
          referencia_id: number | null
          referencia_tipo: string | null
          registrado_por: string | null
          stock_anterior: number
          stock_nuevo: number
          tipo: string
          variante_id: number | null
        }
        Insert: {
          cantidad: number
          created_at?: string | null
          deposito_id?: number | null
          id?: number
          motivo?: string | null
          producto_id: number
          referencia_id?: number | null
          referencia_tipo?: string | null
          registrado_por?: string | null
          stock_anterior: number
          stock_nuevo: number
          tipo: string
          variante_id?: number | null
        }
        Update: {
          cantidad?: number
          created_at?: string | null
          deposito_id?: number | null
          id?: number
          motivo?: string | null
          producto_id?: number
          referencia_id?: number | null
          referencia_tipo?: string | null
          registrado_por?: string | null
          stock_anterior?: number
          stock_nuevo?: number
          tipo?: string
          variante_id?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "stock_movimientos_deposito_id_fkey"
            columns: ["deposito_id"]
            isOneToOne: false
            referencedRelation: "depositos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_movimientos_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "productos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_movimientos_registrado_por_fkey"
            columns: ["registrado_por"]
            isOneToOne: false
            referencedRelation: "perfiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_movimientos_variante_id_fkey"
            columns: ["variante_id"]
            isOneToOne: false
            referencedRelation: "producto_variantes"
            referencedColumns: ["id"]
          },
        ]
      }
      tipo_entradas: {
        Row: {
          activo: boolean | null
          capacidad: number | null
          created_at: string | null
          descripcion: string | null
          evento_id: number
          id: number
          moneda: string | null
          nombre: string
          orden: number | null
          precio: number
          solo_socios: boolean | null
        }
        Insert: {
          activo?: boolean | null
          capacidad?: number | null
          created_at?: string | null
          descripcion?: string | null
          evento_id: number
          id?: number
          moneda?: string | null
          nombre: string
          orden?: number | null
          precio?: number
          solo_socios?: boolean | null
        }
        Update: {
          activo?: boolean | null
          capacidad?: number | null
          created_at?: string | null
          descripcion?: string | null
          evento_id?: number
          id?: number
          moneda?: string | null
          nombre?: string
          orden?: number | null
          precio?: number
          solo_socios?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "tipo_entradas_evento_id_fkey"
            columns: ["evento_id"]
            isOneToOne: false
            referencedRelation: "eventos"
            referencedColumns: ["id"]
          },
        ]
      }
      transferencia_items: {
        Row: {
          cantidad: number
          id: number
          producto_id: number
          transferencia_id: number
          variante_id: number | null
        }
        Insert: {
          cantidad: number
          id?: number
          producto_id: number
          transferencia_id: number
          variante_id?: number | null
        }
        Update: {
          cantidad?: number
          id?: number
          producto_id?: number
          transferencia_id?: number
          variante_id?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "transferencia_items_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "productos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transferencia_items_transferencia_id_fkey"
            columns: ["transferencia_id"]
            isOneToOne: false
            referencedRelation: "transferencias_deposito"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transferencia_items_variante_id_fkey"
            columns: ["variante_id"]
            isOneToOne: false
            referencedRelation: "producto_variantes"
            referencedColumns: ["id"]
          },
        ]
      }
      transferencias_deposito: {
        Row: {
          completada_at: string | null
          created_at: string | null
          deposito_destino_id: number
          deposito_origen_id: number
          estado: string
          id: number
          notas: string | null
          registrado_por: string | null
        }
        Insert: {
          completada_at?: string | null
          created_at?: string | null
          deposito_destino_id: number
          deposito_origen_id: number
          estado?: string
          id?: number
          notas?: string | null
          registrado_por?: string | null
        }
        Update: {
          completada_at?: string | null
          created_at?: string | null
          deposito_destino_id?: number
          deposito_origen_id?: number
          estado?: string
          id?: number
          notas?: string | null
          registrado_por?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "transferencias_deposito_deposito_destino_id_fkey"
            columns: ["deposito_destino_id"]
            isOneToOne: false
            referencedRelation: "depositos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transferencias_deposito_deposito_origen_id_fkey"
            columns: ["deposito_origen_id"]
            isOneToOne: false
            referencedRelation: "depositos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transferencias_deposito_registrado_por_fkey"
            columns: ["registrado_por"]
            isOneToOne: false
            referencedRelation: "perfiles"
            referencedColumns: ["id"]
          },
        ]
      }
      transferencias_internas: {
        Row: {
          created_at: string
          cuenta_destino_id: number
          cuenta_origen_id: number
          descripcion: string | null
          fecha: string
          id: number
          moneda_destino: string
          moneda_origen: string
          monto_destino: number
          monto_origen: number
          movimiento_egreso_id: number | null
          movimiento_ingreso_id: number | null
          registrado_por: string | null
          tipo_cambio: number | null
        }
        Insert: {
          created_at?: string
          cuenta_destino_id: number
          cuenta_origen_id: number
          descripcion?: string | null
          fecha: string
          id?: number
          moneda_destino: string
          moneda_origen: string
          monto_destino: number
          monto_origen: number
          movimiento_egreso_id?: number | null
          movimiento_ingreso_id?: number | null
          registrado_por?: string | null
          tipo_cambio?: number | null
        }
        Update: {
          created_at?: string
          cuenta_destino_id?: number
          cuenta_origen_id?: number
          descripcion?: string | null
          fecha?: string
          id?: number
          moneda_destino?: string
          moneda_origen?: string
          monto_destino?: number
          monto_origen?: number
          movimiento_egreso_id?: number | null
          movimiento_ingreso_id?: number | null
          registrado_por?: string | null
          tipo_cambio?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "transferencias_internas_cuenta_destino_id_fkey"
            columns: ["cuenta_destino_id"]
            isOneToOne: false
            referencedRelation: "cuentas_financieras"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transferencias_internas_cuenta_origen_id_fkey"
            columns: ["cuenta_origen_id"]
            isOneToOne: false
            referencedRelation: "cuentas_financieras"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transferencias_internas_movimiento_egreso_id_fkey"
            columns: ["movimiento_egreso_id"]
            isOneToOne: false
            referencedRelation: "movimientos_financieros"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transferencias_internas_movimiento_ingreso_id_fkey"
            columns: ["movimiento_ingreso_id"]
            isOneToOne: false
            referencedRelation: "movimientos_financieros"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transferencias_internas_registrado_por_fkey"
            columns: ["registrado_por"]
            isOneToOne: false
            referencedRelation: "perfiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      actualizar_saldo_cuenta_rpc: {
        Args: { p_cuenta_id: number; p_delta: number }
        Returns: undefined
      }
      es_staff: { Args: never; Returns: boolean }
      recalcular_stock_producto: {
        Args: { p_producto_id: number }
        Returns: undefined
      }
      tiene_algun_rol: { Args: { roles_nombres: string[] }; Returns: boolean }
      tiene_rol: { Args: { rol_nombre: string }; Returns: boolean }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

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
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
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
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
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
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
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
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
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
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
