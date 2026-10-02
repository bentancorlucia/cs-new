import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  exigir,
  patronBusqueda,
  perfilesQueCoinciden,
  respuestaError,
} from "@/lib/comercial/pedidos";

const ESTADOS = [
  "pendiente",
  "pendiente_verificacion",
  "pagado",
  "encargado",
  "preparando",
  "listo_retiro",
  "retirado",
  "cancelado",
] as const;

const filtrosSchema = z.object({
  estado: z.enum(ESTADOS).optional(),
  tipo: z.enum(["online", "pos", "disciplina"]).optional(),
  search: z.string().max(200).optional(),
  page: z.coerce.number().int().min(1).default(1),
  // Tope explícito: PostgREST corta en 1000 filas sin avisar.
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

// GET /api/admin/pedidos — listado paginado con contadores por estado
export async function GET(request: NextRequest) {
  try {
    const permisos = await exigir((p) => p.puedeVer);
    const db = createAdminClient();

    const sp = request.nextUrl.searchParams;
    const f = filtrosSchema.parse({
      estado: sp.get("estado") || undefined,
      tipo: sp.get("tipo") || undefined,
      search: sp.get("search") || undefined,
      page: sp.get("page") || undefined,
      limit: sp.get("limit") || undefined,
    });
    const offset = (f.page - 1) * f.limit;

    // Búsqueda: número de pedido, nombre del cliente presencial o nombre
    // del perfil (pedidos online). Valores entre comillas: sin inyección.
    const patron = patronBusqueda(f.search);
    let filtroOr: string | null = null;
    if (patron) {
      const perfiles = await perfilesQueCoinciden(db, f.search ?? "");
      const partes = [`numero_pedido.ilike.${patron}`, `nombre_cliente.ilike.${patron}`];
      if (perfiles.length > 0) partes.push(`perfil_id.in.(${perfiles.join(",")})`);
      filtroOr = partes.join(",");
    }

    let query = db
      .from("pedidos")
      .select(
        `id, numero_pedido, tipo, estado, total, nombre_cliente, created_at, metodo_pago,
         perfiles!perfil_id(nombre, apellido, telefono),
         disciplinas(nombre),
         pedido_items(es_encargue),
         donaciones(monto, estado)`,
        { count: "exact" }
      )
      .order("created_at", { ascending: false })
      .order("id", { ascending: false });

    // En "Todos" no se muestran cancelados
    query = f.estado ? query.eq("estado", f.estado) : query.neq("estado", "cancelado");
    if (f.tipo) query = query.eq("tipo", f.tipo);
    if (filtroOr) query = query.or(filtroOr);

    const { data: filas, error, count } = await query.range(offset, offset + f.limit - 1);
    if (error) throw error;

    const data = (filas ?? []).map((p) => {
      const d = Array.isArray(p.donaciones) ? p.donaciones[0] : p.donaciones;
      const disc = Array.isArray(p.disciplinas) ? p.disciplinas[0] : p.disciplinas;
      const perfil = Array.isArray(p.perfiles) ? p.perfiles[0] : p.perfiles;
      return {
        id: p.id,
        numero_pedido: p.numero_pedido,
        tipo: p.tipo,
        estado: p.estado,
        total: Number(p.total),
        nombre_cliente: p.nombre_cliente,
        created_at: p.created_at,
        metodo_pago: p.metodo_pago,
        perfiles: perfil ?? null,
        disciplina: disc?.nombre ?? null,
        tiene_encargue: (p.pedido_items ?? []).some((i) => i.es_encargue),
        donacion: d ? { monto: Number(d.monto), estado: d.estado } : null,
      };
    });

    // Contadores por estado con los mismos filtros (tipo y búsqueda)
    const counts: Record<string, number> = {};
    await Promise.all(
      ESTADOS.map(async (est) => {
        let q = db.from("pedidos").select("id", { count: "exact", head: true }).eq("estado", est);
        if (f.tipo) q = q.eq("tipo", f.tipo);
        if (filtroOr) q = q.or(filtroOr);
        const { count: c } = await q;
        counts[est] = c ?? 0;
      })
    );

    const total = count ?? 0;
    return NextResponse.json({
      data,
      counts,
      pagination: {
        page: f.page,
        limit: f.limit,
        total,
        totalPages: Math.max(1, Math.ceil(total / f.limit)),
      },
      permisos: { puedeOperar: permisos.puedeOperar },
    });
  } catch (error) {
    return respuestaError(error);
  }
}
