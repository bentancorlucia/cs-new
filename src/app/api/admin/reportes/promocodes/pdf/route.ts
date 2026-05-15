import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/supabase/roles";
import { renderReportePdf } from "@/lib/pdf/reporte-pdf";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const TIENDA_ROLES = ["super_admin", "tienda"];

export async function POST(request: NextRequest) {
  try {
    await requireRole(TIENDA_ROLES);
    const { rango, data } = await request.json();
    if (!rango || !data) {
      return NextResponse.json({ error: "Faltan datos" }, { status: 400 });
    }
    const buffer = await renderReportePdf("promocodes", data, rango);
    return new NextResponse(buffer as unknown as BodyInit, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="reporte-promocodes-${rango.desde}_${rango.hasta}.pdf"`,
      },
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Error";
    if (msg === "No autorizado") {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 });
    }
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
