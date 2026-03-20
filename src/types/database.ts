// ============================================
// Tipos de base de datos — Club Seminario
// Este archivo será reemplazado por los tipos auto-generados
// con: npx supabase gen types typescript --local > src/types/database.ts
// Por ahora, definimos los tipos manualmente para que el proyecto compile.
// ============================================

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export interface Database {
  public: {
    Tables: {
      perfiles: {
        Row: {
          id: string;
          nombre: string;
          apellido: string;
          cedula: string | null;
          telefono: string | null;
          fecha_nacimiento: string | null;
          avatar_url: string | null;
          es_socio: boolean;
          socio_verificado: boolean;
          padron_socio_id: number | null;
          numero_socio: string | null;
          estado_socio: "activo" | "inactivo" | "moroso" | "suspendido";
          fecha_alta_socio: string | null;
          notas: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          nombre: string;
          apellido: string;
          cedula?: string | null;
          telefono?: string | null;
          fecha_nacimiento?: string | null;
          avatar_url?: string | null;
          es_socio?: boolean;
          socio_verificado?: boolean;
          padron_socio_id?: number | null;
          numero_socio?: string | null;
          estado_socio?: "activo" | "inactivo" | "moroso" | "suspendido";
          fecha_alta_socio?: string | null;
          notas?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          nombre?: string;
          apellido?: string;
          cedula?: string | null;
          telefono?: string | null;
          fecha_nacimiento?: string | null;
          avatar_url?: string | null;
          es_socio?: boolean;
          socio_verificado?: boolean;
          padron_socio_id?: number | null;
          numero_socio?: string | null;
          estado_socio?: "activo" | "inactivo" | "moroso" | "suspendido";
          fecha_alta_socio?: string | null;
          notas?: string | null;
          updated_at?: string;
        };
        Relationships: [];
      };
      roles: {
        Row: {
          id: number;
          nombre: string;
          descripcion: string | null;
        };
        Insert: {
          id?: number;
          nombre: string;
          descripcion?: string | null;
        };
        Update: {
          nombre?: string;
          descripcion?: string | null;
        };
        Relationships: [];
      };
      perfil_roles: {
        Row: {
          id: number;
          perfil_id: string;
          rol_id: number;
          asignado_por: string | null;
          created_at: string;
        };
        Insert: {
          id?: number;
          perfil_id: string;
          rol_id: number;
          asignado_por?: string | null;
          created_at?: string;
        };
        Update: {
          perfil_id?: string;
          rol_id?: number;
          asignado_por?: string | null;
        };
        Relationships: [];
      };
      disciplinas: {
        Row: {
          id: number;
          nombre: string;
          slug: string;
          descripcion: string | null;
          imagen_url: string | null;
          contacto_nombre: string | null;
          contacto_telefono: string | null;
          contacto_email: string | null;
          activa: boolean;
          created_at: string;
        };
        Insert: {
          id?: number;
          nombre: string;
          slug: string;
          descripcion?: string | null;
          imagen_url?: string | null;
          contacto_nombre?: string | null;
          contacto_telefono?: string | null;
          contacto_email?: string | null;
          activa?: boolean;
          created_at?: string;
        };
        Update: {
          nombre?: string;
          slug?: string;
          descripcion?: string | null;
          imagen_url?: string | null;
          contacto_nombre?: string | null;
          contacto_telefono?: string | null;
          contacto_email?: string | null;
          activa?: boolean;
        };
        Relationships: [];
      };
      perfil_disciplinas: {
        Row: {
          id: number;
          perfil_id: string;
          disciplina_id: number;
          categoria: string | null;
          activa: boolean;
          fecha_ingreso: string;
          created_at: string;
        };
        Insert: {
          id?: number;
          perfil_id: string;
          disciplina_id: number;
          categoria?: string | null;
          activa?: boolean;
          fecha_ingreso?: string;
          created_at?: string;
        };
        Update: {
          perfil_id?: string;
          disciplina_id?: number;
          categoria?: string | null;
          activa?: boolean;
          fecha_ingreso?: string;
        };
        Relationships: [];
      };
      pagos_socios: {
        Row: {
          id: number;
          perfil_id: string;
          monto: number;
          moneda: string;
          periodo_mes: number;
          periodo_anio: number;
          metodo_pago: "efectivo" | "mercadopago" | "transferencia";
          referencia_pago: string | null;
          registrado_por: string | null;
          notas: string | null;
          created_at: string;
        };
        Insert: {
          id?: number;
          perfil_id: string;
          monto: number;
          moneda?: string;
          periodo_mes: number;
          periodo_anio: number;
          metodo_pago: "efectivo" | "mercadopago" | "transferencia";
          referencia_pago?: string | null;
          registrado_por?: string | null;
          notas?: string | null;
          created_at?: string;
        };
        Update: {
          perfil_id?: string;
          monto?: number;
          moneda?: string;
          periodo_mes?: number;
          periodo_anio?: number;
          metodo_pago?: "efectivo" | "mercadopago" | "transferencia";
          referencia_pago?: string | null;
          registrado_por?: string | null;
          notas?: string | null;
        };
        Relationships: [];
      };
      comprobantes: {
        Row: {
          id: number;
          pedido_id: number;
          url: string;
          nombre_archivo: string;
          tipo: "imagen" | "pdf";
          tamano_bytes: number | null;
          datos_extraidos: Json | null;
          estado: "pendiente" | "verificado" | "rechazado";
          verificado_por: string | null;
          verificado_at: string | null;
          motivo_rechazo: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: number;
          pedido_id: number;
          url: string;
          nombre_archivo: string;
          tipo: "imagen" | "pdf";
          tamano_bytes?: number | null;
          datos_extraidos?: Json | null;
          estado?: "pendiente" | "verificado" | "rechazado";
          verificado_por?: string | null;
          verificado_at?: string | null;
          motivo_rechazo?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          pedido_id?: number;
          url?: string;
          nombre_archivo?: string;
          tipo?: "imagen" | "pdf";
          tamano_bytes?: number | null;
          datos_extraidos?: Json | null;
          estado?: "pendiente" | "verificado" | "rechazado";
          verificado_por?: string | null;
          verificado_at?: string | null;
          motivo_rechazo?: string | null;
          updated_at?: string;
        };
        Relationships: [];
      };
      categorias_producto: {
        Row: {
          id: number;
          nombre: string;
          slug: string;
          descripcion: string | null;
          imagen_url: string | null;
          orden: number;
          activa: boolean;
          created_at: string;
        };
        Insert: {
          id?: number;
          nombre: string;
          slug: string;
          descripcion?: string | null;
          imagen_url?: string | null;
          orden?: number;
          activa?: boolean;
          created_at?: string;
        };
        Update: {
          nombre?: string;
          slug?: string;
          descripcion?: string | null;
          imagen_url?: string | null;
          orden?: number;
          activa?: boolean;
        };
        Relationships: [];
      };
      productos: {
        Row: {
          id: number;
          nombre: string;
          slug: string;
          descripcion: string | null;
          descripcion_corta: string | null;
          categoria_id: number | null;
          precio: number;
          precio_socio: number | null;
          moneda: string;
          sku: string | null;
          stock_actual: number;
          stock_minimo: number;
          peso: number | null;
          activo: boolean;
          destacado: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: number;
          nombre: string;
          slug: string;
          descripcion?: string | null;
          descripcion_corta?: string | null;
          categoria_id?: number | null;
          precio: number;
          precio_socio?: number | null;
          moneda?: string;
          sku?: string | null;
          stock_actual?: number;
          stock_minimo?: number;
          peso?: number | null;
          activo?: boolean;
          destacado?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          nombre?: string;
          slug?: string;
          descripcion?: string | null;
          descripcion_corta?: string | null;
          categoria_id?: number | null;
          precio?: number;
          precio_socio?: number | null;
          moneda?: string;
          sku?: string | null;
          stock_actual?: number;
          stock_minimo?: number;
          peso?: number | null;
          activo?: boolean;
          destacado?: boolean;
          updated_at?: string;
        };
        Relationships: [];
      };
      producto_variantes: {
        Row: {
          id: number;
          producto_id: number;
          nombre: string;
          sku: string | null;
          precio_override: number | null;
          stock_actual: number;
          atributos: Json;
          activo: boolean;
          created_at: string;
        };
        Insert: {
          id?: number;
          producto_id: number;
          nombre: string;
          sku?: string | null;
          precio_override?: number | null;
          stock_actual?: number;
          atributos?: Json;
          activo?: boolean;
          created_at?: string;
        };
        Update: {
          producto_id?: number;
          nombre?: string;
          sku?: string | null;
          precio_override?: number | null;
          stock_actual?: number;
          atributos?: Json;
          activo?: boolean;
        };
        Relationships: [];
      };
      producto_imagenes: {
        Row: {
          id: number;
          producto_id: number;
          url: string;
          alt_text: string | null;
          orden: number;
          es_principal: boolean;
          focal_point: string;
          created_at: string;
        };
        Insert: {
          id?: number;
          producto_id: number;
          url: string;
          alt_text?: string | null;
          orden?: number;
          es_principal?: boolean;
          focal_point?: string;
          created_at?: string;
        };
        Update: {
          producto_id?: number;
          url?: string;
          alt_text?: string | null;
          orden?: number;
          es_principal?: boolean;
          focal_point?: string;
        };
        Relationships: [];
      };
      pedidos: {
        Row: {
          id: number;
          numero_pedido: string;
          perfil_id: string | null;
          tipo: "online" | "pos";
          estado: "pendiente" | "pendiente_verificacion" | "pagado" | "preparando" | "listo_retiro" | "retirado" | "cancelado";
          subtotal: number;
          descuento: number;
          total: number;
          moneda: string;
          metodo_pago: "mercadopago" | "efectivo" | "mercadopago_qr" | "transferencia" | null;
          mercadopago_preference_id: string | null;
          mercadopago_payment_id: string | null;
          nombre_cliente: string | null;
          telefono_cliente: string | null;
          notas: string | null;
          vendedor_id: string | null;
          stock_reservado: boolean;
          stock_reservado_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: number;
          numero_pedido?: string;
          perfil_id?: string | null;
          tipo: "online" | "pos";
          estado?: "pendiente" | "pendiente_verificacion" | "pagado" | "preparando" | "listo_retiro" | "retirado" | "cancelado";
          subtotal: number;
          descuento?: number;
          total: number;
          moneda?: string;
          metodo_pago?: "mercadopago" | "efectivo" | "mercadopago_qr" | "transferencia" | null;
          mercadopago_preference_id?: string | null;
          mercadopago_payment_id?: string | null;
          nombre_cliente?: string | null;
          telefono_cliente?: string | null;
          notas?: string | null;
          vendedor_id?: string | null;
          stock_reservado?: boolean;
          stock_reservado_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          numero_pedido?: string;
          perfil_id?: string | null;
          tipo?: "online" | "pos";
          estado?: "pendiente" | "pendiente_verificacion" | "pagado" | "preparando" | "listo_retiro" | "retirado" | "cancelado";
          subtotal?: number;
          descuento?: number;
          total?: number;
          moneda?: string;
          metodo_pago?: "mercadopago" | "efectivo" | "mercadopago_qr" | "transferencia" | null;
          mercadopago_preference_id?: string | null;
          mercadopago_payment_id?: string | null;
          nombre_cliente?: string | null;
          telefono_cliente?: string | null;
          notas?: string | null;
          vendedor_id?: string | null;
          stock_reservado?: boolean;
          stock_reservado_at?: string | null;
          updated_at?: string;
        };
        Relationships: [];
      };
      pedido_items: {
        Row: {
          id: number;
          pedido_id: number;
          producto_id: number;
          variante_id: number | null;
          cantidad: number;
          precio_unitario: number;
          subtotal: number;
          created_at: string;
        };
        Insert: {
          id?: number;
          pedido_id: number;
          producto_id: number;
          variante_id?: number | null;
          cantidad: number;
          precio_unitario: number;
          subtotal: number;
          created_at?: string;
        };
        Update: {
          pedido_id?: number;
          producto_id?: number;
          variante_id?: number | null;
          cantidad?: number;
          precio_unitario?: number;
          subtotal?: number;
        };
        Relationships: [];
      };
      stock_movimientos: {
        Row: {
          id: number;
          producto_id: number;
          variante_id: number | null;
          tipo: "entrada" | "salida" | "ajuste" | "venta" | "devolucion";
          cantidad: number;
          stock_anterior: number;
          stock_nuevo: number;
          referencia_tipo: string | null;
          referencia_id: number | null;
          motivo: string | null;
          registrado_por: string | null;
          created_at: string;
        };
        Insert: {
          id?: number;
          producto_id: number;
          variante_id?: number | null;
          tipo: "entrada" | "salida" | "ajuste" | "venta" | "devolucion";
          cantidad: number;
          stock_anterior: number;
          stock_nuevo: number;
          referencia_tipo?: string | null;
          referencia_id?: number | null;
          motivo?: string | null;
          registrado_por?: string | null;
          created_at?: string;
        };
        Update: {
          producto_id?: number;
          variante_id?: number | null;
          tipo?: "entrada" | "salida" | "ajuste" | "venta" | "devolucion";
          cantidad?: number;
          stock_anterior?: number;
          stock_nuevo?: number;
          referencia_tipo?: string | null;
          referencia_id?: number | null;
          motivo?: string | null;
          registrado_por?: string | null;
        };
        Relationships: [];
      };
      pagos_mercadopago: {
        Row: {
          id: number;
          tipo_origen: "pedido" | "entrada";
          origen_id: number;
          mercadopago_payment_id: string;
          mercadopago_status: string | null;
          mercadopago_status_detail: string | null;
          monto: number;
          moneda: string;
          metodo: string | null;
          raw_data: Json | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: number;
          tipo_origen: "pedido" | "entrada";
          origen_id: number;
          mercadopago_payment_id: string;
          mercadopago_status?: string | null;
          mercadopago_status_detail?: string | null;
          monto: number;
          moneda?: string;
          metodo?: string | null;
          raw_data?: Json | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          tipo_origen?: "pedido" | "entrada";
          origen_id?: number;
          mercadopago_payment_id?: string;
          mercadopago_status?: string | null;
          mercadopago_status_detail?: string | null;
          monto?: number;
          moneda?: string;
          metodo?: string | null;
          raw_data?: Json | null;
          updated_at?: string;
        };
        Relationships: [];
      };
      proveedores: {
        Row: {
          id: number;
          nombre: string;
          rut: string | null;
          razon_social: string | null;
          contacto_nombre: string | null;
          contacto_telefono: string | null;
          contacto_email: string | null;
          direccion: string | null;
          notas: string | null;
          saldo_cuenta_corriente: number;
          activo: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: number;
          nombre: string;
          rut?: string | null;
          razon_social?: string | null;
          contacto_nombre?: string | null;
          contacto_telefono?: string | null;
          contacto_email?: string | null;
          direccion?: string | null;
          notas?: string | null;
          saldo_cuenta_corriente?: number;
          activo?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          nombre?: string;
          rut?: string | null;
          razon_social?: string | null;
          contacto_nombre?: string | null;
          contacto_telefono?: string | null;
          contacto_email?: string | null;
          direccion?: string | null;
          notas?: string | null;
          saldo_cuenta_corriente?: number;
          activo?: boolean;
          updated_at?: string;
        };
        Relationships: [];
      };
      producto_proveedores: {
        Row: {
          id: number;
          producto_id: number;
          proveedor_id: number;
          costo: number | null;
          codigo_proveedor: string | null;
          es_principal: boolean;
          created_at: string;
        };
        Insert: {
          id?: number;
          producto_id: number;
          proveedor_id: number;
          costo?: number | null;
          codigo_proveedor?: string | null;
          es_principal?: boolean;
          created_at?: string;
        };
        Update: {
          producto_id?: number;
          proveedor_id?: number;
          costo?: number | null;
          codigo_proveedor?: string | null;
          es_principal?: boolean;
        };
        Relationships: [];
      };
      compras_proveedor: {
        Row: {
          id: number;
          numero_compra: string;
          proveedor_id: number;
          estado: "borrador" | "confirmada" | "recibida" | "cancelada";
          subtotal: number;
          impuestos: number;
          total: number;
          moneda: string;
          fecha_compra: string;
          fecha_recepcion: string | null;
          notas: string | null;
          registrado_por: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: number;
          numero_compra: string;
          proveedor_id: number;
          estado?: "borrador" | "confirmada" | "recibida" | "cancelada";
          subtotal?: number;
          impuestos?: number;
          total?: number;
          moneda?: string;
          fecha_compra?: string;
          fecha_recepcion?: string | null;
          notas?: string | null;
          registrado_por?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          numero_compra?: string;
          proveedor_id?: number;
          estado?: "borrador" | "confirmada" | "recibida" | "cancelada";
          subtotal?: number;
          impuestos?: number;
          total?: number;
          moneda?: string;
          fecha_compra?: string;
          fecha_recepcion?: string | null;
          notas?: string | null;
          registrado_por?: string | null;
          updated_at?: string;
        };
        Relationships: [];
      };
      compra_items: {
        Row: {
          id: number;
          compra_id: number;
          producto_id: number;
          variante_id: number | null;
          cantidad: number;
          costo_unitario: number;
          subtotal: number;
          cantidad_recibida: number;
          created_at: string;
        };
        Insert: {
          id?: number;
          compra_id: number;
          producto_id: number;
          variante_id?: number | null;
          cantidad: number;
          costo_unitario: number;
          subtotal: number;
          cantidad_recibida?: number;
          created_at?: string;
        };
        Update: {
          compra_id?: number;
          producto_id?: number;
          variante_id?: number | null;
          cantidad?: number;
          costo_unitario?: number;
          subtotal?: number;
          cantidad_recibida?: number;
        };
        Relationships: [];
      };
      pagos_proveedor: {
        Row: {
          id: number;
          proveedor_id: number;
          compra_id: number | null;
          monto: number;
          moneda: string;
          metodo_pago: "efectivo" | "transferencia" | "cheque" | "otro";
          referencia: string | null;
          notas: string | null;
          registrado_por: string | null;
          created_at: string;
        };
        Insert: {
          id?: number;
          proveedor_id: number;
          compra_id?: number | null;
          monto: number;
          moneda?: string;
          metodo_pago: "efectivo" | "transferencia" | "cheque" | "otro";
          referencia?: string | null;
          notas?: string | null;
          registrado_por?: string | null;
          created_at?: string;
        };
        Update: {
          proveedor_id?: number;
          compra_id?: number | null;
          monto?: number;
          moneda?: string;
          metodo_pago?: "efectivo" | "transferencia" | "cheque" | "otro";
          referencia?: string | null;
          notas?: string | null;
          registrado_por?: string | null;
        };
        Relationships: [];
      };
      eventos: {
        Row: {
          id: number;
          titulo: string;
          slug: string;
          descripcion: string | null;
          descripcion_corta: string | null;
          imagen_url: string | null;
          lugar: string | null;
          direccion: string | null;
          fecha_inicio: string;
          fecha_fin: string | null;
          capacidad_total: number | null;
          estado: "borrador" | "publicado" | "agotado" | "finalizado" | "cancelado";
          es_gratuito: boolean;
          requiere_registro: boolean;
          creado_por: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: number;
          titulo: string;
          slug: string;
          descripcion?: string | null;
          descripcion_corta?: string | null;
          imagen_url?: string | null;
          lugar?: string | null;
          direccion?: string | null;
          fecha_inicio: string;
          fecha_fin?: string | null;
          capacidad_total?: number | null;
          estado?: "borrador" | "publicado" | "agotado" | "finalizado" | "cancelado";
          es_gratuito?: boolean;
          requiere_registro?: boolean;
          creado_por?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          titulo?: string;
          slug?: string;
          descripcion?: string | null;
          descripcion_corta?: string | null;
          imagen_url?: string | null;
          lugar?: string | null;
          direccion?: string | null;
          fecha_inicio?: string;
          fecha_fin?: string | null;
          capacidad_total?: number | null;
          estado?: "borrador" | "publicado" | "agotado" | "finalizado" | "cancelado";
          es_gratuito?: boolean;
          requiere_registro?: boolean;
          creado_por?: string | null;
          updated_at?: string;
        };
        Relationships: [];
      };
      tipo_entradas: {
        Row: {
          id: number;
          evento_id: number;
          nombre: string;
          descripcion: string | null;
          precio: number;
          moneda: string;
          capacidad: number | null;
          solo_socios: boolean;
          orden: number;
          activo: boolean;
          created_at: string;
        };
        Insert: {
          id?: number;
          evento_id: number;
          nombre: string;
          descripcion?: string | null;
          precio?: number;
          moneda?: string;
          capacidad?: number | null;
          solo_socios?: boolean;
          orden?: number;
          activo?: boolean;
          created_at?: string;
        };
        Update: {
          evento_id?: number;
          nombre?: string;
          descripcion?: string | null;
          precio?: number;
          moneda?: string;
          capacidad?: number | null;
          solo_socios?: boolean;
          orden?: number;
          activo?: boolean;
        };
        Relationships: [];
      };
      lotes_entrada: {
        Row: {
          id: number;
          tipo_entrada_id: number;
          nombre: string;
          precio: number;
          cantidad: number;
          vendidas: number;
          fecha_inicio: string;
          fecha_fin: string | null;
          estado: "pendiente" | "activo" | "agotado" | "cerrado";
          orden: number;
          created_at: string;
        };
        Insert: {
          id?: number;
          tipo_entrada_id: number;
          nombre: string;
          precio: number;
          cantidad: number;
          vendidas?: number;
          fecha_inicio: string;
          fecha_fin?: string | null;
          estado?: "pendiente" | "activo" | "agotado" | "cerrado";
          orden?: number;
          created_at?: string;
        };
        Update: {
          tipo_entrada_id?: number;
          nombre?: string;
          precio?: number;
          cantidad?: number;
          vendidas?: number;
          fecha_inicio?: string;
          fecha_fin?: string | null;
          estado?: "pendiente" | "activo" | "agotado" | "cerrado";
          orden?: number;
        };
        Relationships: [];
      };
      entradas: {
        Row: {
          id: number;
          codigo: string;
          evento_id: number;
          tipo_entrada_id: number;
          lote_id: number | null;
          perfil_id: string | null;
          nombre_asistente: string | null;
          cedula_asistente: string | null;
          email_asistente: string | null;
          precio_pagado: number;
          moneda: string;
          estado: "pendiente" | "pagada" | "usada" | "cancelada" | "reembolsada";
          metodo_pago: "mercadopago" | "efectivo" | "cortesia" | null;
          mercadopago_payment_id: string | null;
          qr_url: string | null;
          usado_at: string | null;
          usado_por: string | null;
          notas: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: number;
          codigo?: string;
          evento_id: number;
          tipo_entrada_id: number;
          lote_id?: number | null;
          perfil_id?: string | null;
          nombre_asistente?: string | null;
          cedula_asistente?: string | null;
          email_asistente?: string | null;
          precio_pagado: number;
          moneda?: string;
          estado?: "pendiente" | "pagada" | "usada" | "cancelada" | "reembolsada";
          metodo_pago?: "mercadopago" | "efectivo" | "cortesia" | null;
          mercadopago_payment_id?: string | null;
          qr_url?: string | null;
          usado_at?: string | null;
          usado_por?: string | null;
          notas?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          codigo?: string;
          evento_id?: number;
          tipo_entrada_id?: number;
          lote_id?: number | null;
          perfil_id?: string | null;
          nombre_asistente?: string | null;
          cedula_asistente?: string | null;
          email_asistente?: string | null;
          precio_pagado?: number;
          moneda?: string;
          estado?: "pendiente" | "pagada" | "usada" | "cancelada" | "reembolsada";
          metodo_pago?: "mercadopago" | "efectivo" | "cortesia" | null;
          mercadopago_payment_id?: string | null;
          qr_url?: string | null;
          usado_at?: string | null;
          usado_por?: string | null;
          notas?: string | null;
          updated_at?: string;
        };
        Relationships: [];
      };
      escaneos_entrada: {
        Row: {
          id: number;
          entrada_id: number | null;
          codigo_escaneado: string;
          evento_id: number;
          resultado: "valido" | "ya_usado" | "no_encontrado" | "evento_incorrecto" | "cancelada";
          escaneado_por: string;
          ip_address: string | null;
          created_at: string;
        };
        Insert: {
          id?: number;
          entrada_id?: number | null;
          codigo_escaneado: string;
          evento_id: number;
          resultado: "valido" | "ya_usado" | "no_encontrado" | "evento_incorrecto" | "cancelada";
          escaneado_por: string;
          ip_address?: string | null;
          created_at?: string;
        };
        Update: {
          entrada_id?: number | null;
          codigo_escaneado?: string;
          evento_id?: number;
          resultado?: "valido" | "ya_usado" | "no_encontrado" | "evento_incorrecto" | "cancelada";
          escaneado_por?: string;
          ip_address?: string | null;
        };
        Relationships: [];
      };
      contenido_paginas: {
        Row: {
          id: number;
          pagina: string;
          seccion: string;
          titulo: string | null;
          contenido: string | null;
          imagen_url: string | null;
          orden: number;
          activo: boolean;
          updated_at: string;
          updated_by: string | null;
        };
        Insert: {
          id?: number;
          pagina: string;
          seccion: string;
          titulo?: string | null;
          contenido?: string | null;
          imagen_url?: string | null;
          orden?: number;
          activo?: boolean;
          updated_at?: string;
          updated_by?: string | null;
        };
        Update: {
          pagina?: string;
          seccion?: string;
          titulo?: string | null;
          contenido?: string | null;
          imagen_url?: string | null;
          orden?: number;
          activo?: boolean;
          updated_at?: string;
          updated_by?: string | null;
        };
        Relationships: [];
      };
      memorias: {
        Row: {
          id: number;
          anio: number;
          titulo: string | null;
          archivo_url: string;
          created_at: string;
        };
        Insert: {
          id?: number;
          anio: number;
          titulo?: string | null;
          archivo_url: string;
          created_at?: string;
        };
        Update: {
          anio?: number;
          titulo?: string | null;
          archivo_url?: string;
        };
        Relationships: [];
      };
      directivos: {
        Row: {
          id: number;
          nombre: string;
          cargo: string;
          tipo: "directiva" | "fiscal" | "suplente";
          foto_url: string | null;
          orden: number;
          periodo: string | null;
          activo: boolean;
          created_at: string;
        };
        Insert: {
          id?: number;
          nombre: string;
          cargo: string;
          tipo: "directiva" | "fiscal" | "suplente";
          foto_url?: string | null;
          orden?: number;
          periodo?: string | null;
          activo?: boolean;
          created_at?: string;
        };
        Update: {
          nombre?: string;
          cargo?: string;
          tipo?: "directiva" | "fiscal" | "suplente";
          foto_url?: string | null;
          orden?: number;
          periodo?: string | null;
          activo?: boolean;
        };
        Relationships: [];
      };
      // ========================
      // Módulo Tesorería
      // ========================
      cuentas_financieras: {
        Row: {
          id: number;
          nombre: string;
          tipo: "bancaria" | "mercadopago" | "caja_chica" | "virtual";
          moneda: "UYU" | "USD";
          banco: string | null;
          numero_cuenta: string | null;
          saldo_actual: number;
          saldo_inicial: number;
          descripcion: string | null;
          color: string | null;
          activa: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: number;
          nombre: string;
          tipo: "bancaria" | "mercadopago" | "caja_chica" | "virtual";
          moneda: "UYU" | "USD";
          banco?: string | null;
          numero_cuenta?: string | null;
          saldo_actual?: number;
          saldo_inicial?: number;
          descripcion?: string | null;
          color?: string | null;
          activa?: boolean;
        };
        Update: {
          nombre?: string;
          tipo?: "bancaria" | "mercadopago" | "caja_chica" | "virtual";
          moneda?: "UYU" | "USD";
          banco?: string | null;
          numero_cuenta?: string | null;
          saldo_actual?: number;
          saldo_inicial?: number;
          descripcion?: string | null;
          color?: string | null;
          activa?: boolean;
        };
        Relationships: [];
      };
      categorias_financieras: {
        Row: {
          id: number;
          nombre: string;
          slug: string;
          tipo: "ingreso" | "egreso";
          padre_id: number | null;
          color: string | null;
          icono: string | null;
          presupuesto_mensual: number | null;
          orden: number;
          activa: boolean;
          created_at: string;
        };
        Insert: {
          id?: number;
          nombre: string;
          slug: string;
          tipo: "ingreso" | "egreso";
          padre_id?: number | null;
          color?: string | null;
          icono?: string | null;
          presupuesto_mensual?: number | null;
          orden?: number;
          activa?: boolean;
        };
        Update: {
          nombre?: string;
          slug?: string;
          tipo?: "ingreso" | "egreso";
          padre_id?: number | null;
          color?: string | null;
          icono?: string | null;
          presupuesto_mensual?: number | null;
          orden?: number;
          activa?: boolean;
        };
        Relationships: [];
      };
      movimientos_financieros: {
        Row: {
          id: number;
          cuenta_id: number;
          tipo: "ingreso" | "egreso";
          categoria_id: number;
          subcategoria_id: number | null;
          monto: number;
          moneda: "UYU" | "USD";
          fecha: string;
          descripcion: string;
          comprobante_url: string | null;
          referencia: string | null;
          origen_tipo: string | null;
          origen_id: number | null;
          transferencia_id: number | null;
          conciliado: boolean;
          conciliacion_id: number | null;
          tags: string[] | null;
          notas: string | null;
          registrado_por: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: number;
          cuenta_id: number;
          tipo: "ingreso" | "egreso";
          categoria_id: number;
          subcategoria_id?: number | null;
          monto: number;
          moneda?: "UYU" | "USD";
          fecha: string;
          descripcion: string;
          comprobante_url?: string | null;
          referencia?: string | null;
          origen_tipo?: string | null;
          origen_id?: number | null;
          transferencia_id?: number | null;
          conciliado?: boolean;
          conciliacion_id?: number | null;
          tags?: string[] | null;
          notas?: string | null;
          registrado_por?: string | null;
        };
        Update: {
          cuenta_id?: number;
          tipo?: "ingreso" | "egreso";
          categoria_id?: number;
          subcategoria_id?: number | null;
          monto?: number;
          moneda?: "UYU" | "USD";
          fecha?: string;
          descripcion?: string;
          comprobante_url?: string | null;
          referencia?: string | null;
          origen_tipo?: string | null;
          origen_id?: number | null;
          transferencia_id?: number | null;
          conciliado?: boolean;
          conciliacion_id?: number | null;
          tags?: string[] | null;
          notas?: string | null;
          registrado_por?: string | null;
        };
        Relationships: [];
      };
      transferencias_internas: {
        Row: {
          id: number;
          cuenta_origen_id: number;
          cuenta_destino_id: number;
          monto: number;
          moneda_origen: string;
          moneda_destino: string;
          tipo_cambio: number | null;
          monto_destino: number;
          fecha: string;
          descripcion: string | null;
          comprobante_url: string | null;
          movimiento_egreso_id: number | null;
          movimiento_ingreso_id: number | null;
          registrado_por: string | null;
          created_at: string;
        };
        Insert: {
          id?: number;
          cuenta_origen_id: number;
          cuenta_destino_id: number;
          monto: number;
          moneda_origen: string;
          moneda_destino: string;
          tipo_cambio?: number | null;
          monto_destino: number;
          fecha: string;
          descripcion?: string | null;
          comprobante_url?: string | null;
          movimiento_egreso_id?: number | null;
          movimiento_ingreso_id?: number | null;
          registrado_por?: string | null;
        };
        Update: {
          cuenta_origen_id?: number;
          cuenta_destino_id?: number;
          monto?: number;
          moneda_origen?: string;
          moneda_destino?: string;
          tipo_cambio?: number | null;
          monto_destino?: number;
          fecha?: string;
          descripcion?: string | null;
          comprobante_url?: string | null;
          movimiento_egreso_id?: number | null;
          movimiento_ingreso_id?: number | null;
          registrado_por?: string | null;
        };
        Relationships: [];
      };
      conciliaciones: {
        Row: {
          id: number;
          cuenta_id: number;
          periodo_desde: string;
          periodo_hasta: string;
          saldo_banco: number;
          saldo_sistema: number;
          diferencia: number;
          archivo_extracto_url: string | null;
          estado: "en_proceso" | "completada";
          movimientos_matcheados: number;
          movimientos_pendientes_banco: number;
          movimientos_pendientes_sistema: number;
          completada_por: string | null;
          completada_at: string | null;
          created_at: string;
        };
        Insert: {
          id?: number;
          cuenta_id: number;
          periodo_desde: string;
          periodo_hasta: string;
          saldo_banco: number;
          saldo_sistema: number;
          diferencia: number;
          archivo_extracto_url?: string | null;
          estado?: "en_proceso" | "completada";
          movimientos_matcheados?: number;
          movimientos_pendientes_banco?: number;
          movimientos_pendientes_sistema?: number;
          completada_por?: string | null;
          completada_at?: string | null;
        };
        Update: {
          cuenta_id?: number;
          periodo_desde?: string;
          periodo_hasta?: string;
          saldo_banco?: number;
          saldo_sistema?: number;
          diferencia?: number;
          archivo_extracto_url?: string | null;
          estado?: "en_proceso" | "completada";
          movimientos_matcheados?: number;
          movimientos_pendientes_banco?: number;
          movimientos_pendientes_sistema?: number;
          completada_por?: string | null;
          completada_at?: string | null;
        };
        Relationships: [];
      };
      conciliacion_items: {
        Row: {
          id: number;
          conciliacion_id: number;
          movimiento_id: number | null;
          fecha_banco: string | null;
          descripcion_banco: string | null;
          monto_banco: number | null;
          estado: "matcheado" | "pendiente_sistema" | "pendiente_banco" | "ignorado";
          created_at: string;
        };
        Insert: {
          id?: number;
          conciliacion_id: number;
          movimiento_id?: number | null;
          fecha_banco?: string | null;
          descripcion_banco?: string | null;
          monto_banco?: number | null;
          estado: "matcheado" | "pendiente_sistema" | "pendiente_banco" | "ignorado";
        };
        Update: {
          conciliacion_id?: number;
          movimiento_id?: number | null;
          fecha_banco?: string | null;
          descripcion_banco?: string | null;
          monto_banco?: number | null;
          estado?: "matcheado" | "pendiente_sistema" | "pendiente_banco" | "ignorado";
        };
        Relationships: [];
      };
      cierres_mensuales: {
        Row: {
          id: number;
          anio: number;
          mes: number;
          total_ingresos: number;
          total_egresos: number;
          resultado: number;
          saldos_snapshot: Json;
          categorias_snapshot: Json | null;
          estado: "abierto" | "cerrado";
          cerrado_por: string | null;
          cerrado_at: string | null;
          notas: string | null;
          created_at: string;
        };
        Insert: {
          id?: number;
          anio: number;
          mes: number;
          total_ingresos: number;
          total_egresos: number;
          resultado: number;
          saldos_snapshot: Json;
          categorias_snapshot?: Json | null;
          estado?: "abierto" | "cerrado";
          cerrado_por?: string | null;
          cerrado_at?: string | null;
          notas?: string | null;
        };
        Update: {
          anio?: number;
          mes?: number;
          total_ingresos?: number;
          total_egresos?: number;
          resultado?: number;
          saldos_snapshot?: Json;
          categorias_snapshot?: Json | null;
          estado?: "abierto" | "cerrado";
          cerrado_por?: string | null;
          cerrado_at?: string | null;
          notas?: string | null;
        };
        Relationships: [];
      };
      presupuestos: {
        Row: {
          id: number;
          anio: number;
          mes: number;
          categoria_id: number;
          monto_presupuestado: number;
          moneda: "UYU" | "USD";
          notas: string | null;
          created_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: number;
          anio: number;
          mes: number;
          categoria_id: number;
          monto_presupuestado: number;
          moneda?: "UYU" | "USD";
          notas?: string | null;
          created_by?: string | null;
        };
        Update: {
          anio?: number;
          mes?: number;
          categoria_id?: number;
          monto_presupuestado?: number;
          moneda?: "UYU" | "USD";
          notas?: string | null;
          created_by?: string | null;
        };
        Relationships: [];
      };
      arqueos_caja: {
        Row: {
          id: number;
          cuenta_id: number;
          fecha: string;
          saldo_sistema: number;
          saldo_fisico: number;
          diferencia: number;
          notas: string | null;
          registrado_por: string | null;
          created_at: string;
        };
        Insert: {
          id?: number;
          cuenta_id: number;
          fecha: string;
          saldo_sistema: number;
          saldo_fisico: number;
          diferencia: number;
          notas?: string | null;
          registrado_por?: string | null;
        };
        Update: {
          cuenta_id?: number;
          fecha?: string;
          saldo_sistema?: number;
          saldo_fisico?: number;
          diferencia?: number;
          notas?: string | null;
          registrado_por?: string | null;
        };
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: {
      tiene_rol: {
        Args: { rol_nombre: string };
        Returns: boolean;
      };
      tiene_algun_rol: {
        Args: { roles_nombres: string[] };
        Returns: boolean;
      };
      es_staff: {
        Args: Record<string, never>;
        Returns: boolean;
      };
      actualizar_saldo_cuenta_rpc: {
        Args: { p_cuenta_id: number; p_delta: number };
        Returns: void;
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}
