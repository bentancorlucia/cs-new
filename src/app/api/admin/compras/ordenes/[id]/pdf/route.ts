import { NextRequest, NextResponse } from "next/server";
import { datosPdfOrdenCompra, permisosCompras } from "@/lib/comercial/compras";
import { nombreArchivoOrdenCompra, renderOrdenCompraPdf } from "@/lib/pdf/orden-compra-pdf";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// GET /api/admin/compras/ordenes/{id}/pdf[?descargar=1]
// Sin ?descargar se abre en el navegador (vista previa); con él, se baja.
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { puedeVer } = await permisosCompras();
  if (!puedeVer) return NextResponse.json({ error: "No autorizado" }, { status: 403 });

  const id = Number((await params).id);
  if (!Number.isInteger(id) || id <= 0) return NextResponse.json({ error: "Orden inválida" }, { status: 404 });

  try {
    const datos = await datosPdfOrdenCompra(id);
    if (!datos) return NextResponse.json({ error: "Orden inexistente" }, { status: 404 });
    const pdf = await renderOrdenCompraPdf(datos);
    const disposicion = request.nextUrl.searchParams.has("descargar") ? "attachment" : "inline";
    return new NextResponse(new Uint8Array(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `${disposicion}; filename="${nombreArchivoOrdenCompra(datos)}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    console.error(`[compras/ordenes/${id}/pdf]`, error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Error" }, { status: 500 });
  }
}
