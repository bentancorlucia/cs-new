/** Formas de datos que las páginas (server) pasan a los componentes de comunicaciones. */

export type EnvioResumen = {
  id: string;
  nombre: string;
  asunto: string;
  categoria: string;
  estado: string;
  origen: string;
  programado_para: string;
  created_at: string;
  total: number;
  pendientes: number;
  enviando: number;
  enviados: number;
  fallidos: number;
  omitidos: number;
  cancelados: number;
};

export type PlantillaFila = {
  id: string;
  clave: string;
  nombre: string;
  categoria: string;
  asunto: string;
  cuerpo: string;
  sistema: boolean;
  activa: boolean;
  updated_at: string;
};

export type MensajeFila = {
  id: string;
  email: string;
  nombre: string | null;
  estado: string;
  motivo_omision: string | null;
  error: string | null;
  intentos: number;
  enviado_at: string | null;
  proximo_intento: string;
  created_at: string;
  persona_id: number | null;
  tiene_html: boolean;
  variables: Record<string, string | number | null>;
};

export type ConfigComunicaciones = {
  remitente_nombre: string;
  remitente_email: string;
  responder_a: string | null;
  limite_por_hora: number;
  limite_por_tanda: number;
  pie: string | null;
  whatsapp_tienda: string | null;
  whatsapp_mensajes: Record<string, string>;
  updated_at: string;
};
