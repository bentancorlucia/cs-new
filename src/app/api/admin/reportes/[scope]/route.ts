import { NextRequest, NextResponse } from "next/server";
import { generarReporte, prepararPedido } from "@/lib/reportes/acceso";

export const dynamic = "force-dynamic";

// GET /api/admin/reportes/{tienda|donaciones|promocodes}?desde=YYYY-MM-DD&hasta=YYYY-MM-DD
export async function GET(request: NextRequest, { params }: { params: Promise<{ scope: string }> }) {
  const { scope: s } = await params;
  const p = await prepararPedido(s, request.nextUrl.searchParams);
  if (!p.ok) return p.respuesta;
  try {
    return NextResponse.json({ data: await generarReporte(p.scope, p.rango) });
  } catch (error) {
    console.error(`[reportes/${p.scope}]`, error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Error" }, { status: 500 });
  }
}
