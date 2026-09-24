import {
  protectedResourceHandler,
  metadataCorsOptionsRequestHandler,
} from "mcp-handler";

// RFC 9728: le indica a los clientes MCP (Claude, ChatGPT) que el servidor de
// autorización es Supabase Auth. Responde tanto en la raíz como en
// /.well-known/oauth-protected-resource/api/mcp.

const handler = protectedResourceHandler({
  authServerUrls: [`${process.env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1`],
});

const corsHandler = metadataCorsOptionsRequestHandler();

export { handler as GET, corsHandler as OPTIONS };
