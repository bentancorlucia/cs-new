import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireRole } from "@/lib/supabase/roles";
import { z } from "zod";

const TIENDA_ROLES = ["super_admin", "tienda"];

const adminPromocodeSchema = z
  .object({
    codigo: z
      .string()
      .min(2)
      .max(40)
      .regex(/^[A-Z0-9_-]+$/i, "Solo letras, números, guiones y guion bajo"),
    descripcion: z.string().max(500).nullable().optional(),
    tipo_descuento: z.enum(["porcentaje", "monto_fijo"]),
    valor: z.number().positive(),
    fecha_inicio: z.string().min(1),
    fecha_fin: z.string().min(1),
    acumulable_con_precio_socio: z.boolean(),
    monto_minimo: z.number().positive().nullable().optional(),
    usos_max: z.number().int().positive().nullable().optional(),
    activo: z.boolean(),
  })
  .refine(
    (d) => d.tipo_descuento !== "porcentaje" || d.valor <= 100,
    { message: "El porcentaje no puede superar 100", path: ["valor"] }
  )
  .refine(
    (d) => new Date(d.fecha_fin) > new Date(d.fecha_inicio),
    { message: "Fecha fin debe ser posterior a fecha inicio", path: ["fecha_fin"] }
  );

export async function GET(request: NextRequest) {
  try {
    await requireRole(TIENDA_ROLES);
    const db = createAdminClient() as any;

    const { searchParams } = new URL(request.url);
    const search = searchParams.get("search") || "";
    const estado = searchParams.get("estado") || "";

    let query = db
      .from("promocodes")
      .select("*")
      .order("created_at", { ascending: false });

    if (search) {
      query = query.ilike("codigo", `%${search.toUpperCase()}%`);
    }

    const { data, error } = await query;
    if (error) throw error;

    const now = Date.now();
    const filtered = (data || []).filter((p: any) => {
      if (estado === "activo") return p.activo;
      if (estado === "inactivo") return !p.activo;
      if (estado === "vigente")
        return (
          p.activo &&
          new Date(p.fecha_inicio).getTime() <= now &&
          new Date(p.fecha_fin).getTime() >= now &&
          (p.usos_max == null || p.usos_actuales < p.usos_max)
        );
      if (estado === "expirado") return new Date(p.fecha_fin).getTime() < now;
      if (estado === "agotado")
        return p.usos_max != null && p.usos_actuales >= p.usos_max;
      return true;
    });

    return NextResponse.json({ data: filtered });
  } catch (error: any) {
    if (error.message === "No autorizado") {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 });
    }
    return NextResponse.json(
      { error: error.message || "Error" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    await requireRole(TIENDA_ROLES);
    const supabase = await createServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    const db = createAdminClient() as any;

    const body = await request.json();
    const parsed = adminPromocodeSchema.parse(body);

    const { data, error } = await db
      .from("promocodes")
      .insert({
        ...parsed,
        codigo: parsed.codigo.trim().toUpperCase(),
        descripcion: parsed.descripcion || null,
        monto_minimo: parsed.monto_minimo ?? null,
        usos_max: parsed.usos_max ?? null,
        created_by: user?.id ?? null,
      })
      .select()
      .single();

    if (error) {
      if (error.code === "23505") {
        return NextResponse.json(
          { error: "Ya existe un promocode con ese código" },
          { status: 400 }
        );
      }
      throw error;
    }

    return NextResponse.json({ data }, { status: 201 });
  } catch (error: any) {
    if (error.message === "No autorizado") {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 });
    }
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: error.issues[0]?.message || "Datos inválidos" },
        { status: 400 }
      );
    }
    return NextResponse.json(
      { error: error.message || "Error al crear" },
      { status: 500 }
    );
  }
}
