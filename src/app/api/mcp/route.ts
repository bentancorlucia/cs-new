import { createMcpHandler, withMcpAuth } from "mcp-handler";
import { verificarTokenMcp } from "@/lib/mcp/auth";
import { INSTRUCCIONES_MCP, registrarHerramientas } from "@/lib/mcp/herramientas";

// Servidor MCP de solo lectura para consultar tienda, finanzas y socios desde
// Claude / ChatGPT. Auth: OAuth 2.1 de Supabase Auth (ver /oauth/consent y
// /.well-known/oauth-protected-resource).

export const dynamic = "force-dynamic";

const handler = createMcpHandler(registrarHerramientas, {
  serverInfo: { name: "club-seminario", version: "1.0.0" },
  instructions: INSTRUCCIONES_MCP,
});

const authHandler = withMcpAuth(handler, verificarTokenMcp, {
  required: true,
  resourceMetadataPath: "/.well-known/oauth-protected-resource/api/mcp",
});

export { authHandler as GET, authHandler as POST, authHandler as DELETE };
