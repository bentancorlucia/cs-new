import { NextRequest, NextResponse } from "next/server";
import { generarReporte, prepararPedido } from "@/lib/reportes/acceso";
import { renderReportePdf } from "@/lib/pdf/reporte-pdf";
import { generarReporteExcel } from "@/lib/excel/reporte-excel";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// GET /api/admin/reportes/{scope}/{pdf|excel}?desde&hasta
// El archivo se arma con el reporte recalculado acá (nunca con datos del navegador).
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ scope: string; formato: string }> }
) {
  const { scope: s, formato } = await params;
  if (formato !== "pdf" && formato !== "excel") {
    return NextResponse.json({ error: "Formato inexistente" }, { status: 404 });
  }
  const p = await prepararPedido(s, request.nextUrl.searchParams);
  if (!p.ok) return p.respuesta;

  try {
    const reporte = await generarReporte(p.scope, p.rango);
    const base = `reporte-${p.scope}-${p.rango.desde}_${p.rango.hasta}`;
    const archivo =
      formato === "pdf"
        ? { buffer: await renderReportePdf(p.scope, reporte), tipo: "application/pdf", nombre: `${base}.pdf` }
        : {
            buffer: generarReporteExcel(p.scope, reporte),
            tipo: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            nombre: `${base}.xlsx`,
          };
    return new NextResponse(new Uint8Array(archivo.buffer), {
      headers: {
        "Content-Type": archivo.tipo,
        "Content-Disposition": `attachment; filename="${archivo.nombre}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    console.error(`[reportes/${p.scope}/${formato}]`, error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Error" }, { status: 500 });
  }
}
