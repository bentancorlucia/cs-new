import { createMcpHandler, withMcpAuth } from "mcp-handler";
import type { Implementation } from "@modelcontextprotocol/server";
import { verificarTokenMcp } from "@/lib/mcp/auth";
import { INSTRUCCIONES_MCP, registrarHerramientas } from "@/lib/mcp/herramientas";

// Servidor MCP para consultar tienda, finanzas y socios, y conciliar estados
// de cuenta de tesorería, desde Claude / ChatGPT. Auth: OAuth 2.1 de Supabase Auth (ver /oauth/consent y
// /.well-known/oauth-protected-resource).

export const dynamic = "force-dynamic";

const SITIO = "https://www.clubseminario.com.uy";

// mcp-handler tipa serverInfo como { name, version } pero lo pasa entero al
// McpServer, así que title/icons/websiteUrl (spec MCP) llegan al cliente.
const serverInfo: Implementation = {
  name: "club-seminario",
  title: "Club Seminario",
  version: "1.0.0",
  websiteUrl: SITIO,
  icons: [
    { src: `${SITIO}/images/escudo/logo-cs.png`, mimeType: "image/png", sizes: ["225x225"] },
    { src: `${SITIO}/apple-icon.png`, mimeType: "image/png", sizes: ["180x180"] },
  ],
};

const handler = createMcpHandler(registrarHerramientas, {
  serverInfo,
  instructions: INSTRUCCIONES_MCP,
});

const authHandler = withMcpAuth(handler, verificarTokenMcp, {
  required: true,
  resourceMetadataPath: "/.well-known/oauth-protected-resource/api/mcp",
});

export { authHandler as GET, authHandler as POST, authHandler as DELETE };
