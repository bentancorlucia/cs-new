import { NextRequest, NextResponse } from "next/server";
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
      .regex(/^[A-Z0-9_-]+$/i),
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

async function getId(params: Promise<{ id: string }>) {
  const { id } = await params;
  const n = parseInt(id, 10);
  if (Number.isNaN(n)) return null;
  return n;
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireRole(TIENDA_ROLES);
    const id = await getId(params);
    if (id == null) return NextResponse.json({ error: "ID inválido" }, { status: 400 });

    const db = createAdminClient() as any;
    const { data, error } = await db
      .from("promocodes")
      .select("*")
      .eq("id", id)
      .maybeSingle();
    if (error) throw error;
    if (!data) return NextResponse.json({ error: "No encontrado" }, { status: 404 });
    return NextResponse.json({ data });
  } catch (error: any) {
    if (error.message === "No autorizado") {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 });
    }
    return NextResponse.json({ error: error.message || "Error" }, { status: 500 });
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireRole(TIENDA_ROLES);
    const id = await getId(params);
    if (id == null) return NextResponse.json({ error: "ID inválido" }, { status: 400 });

    const body = await request.json();
    const parsed = adminPromocodeSchema.parse(body);

    const db = createAdminClient() as any;
    const { data, error } = await db
      .from("promocodes")
      .update({
        ...parsed,
        codigo: parsed.codigo.trim().toUpperCase(),
        descripcion: parsed.descripcion || null,
        monto_minimo: parsed.monto_minimo ?? null,
        usos_max: parsed.usos_max ?? null,
      })
      .eq("id", id)
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

    return NextResponse.json({ data });
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
      { error: error.message || "Error al actualizar" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireRole(TIENDA_ROLES);
    const id = await getId(params);
    if (id == null) return NextResponse.json({ error: "ID inválido" }, { status: 400 });

    const db = createAdminClient() as any;

    // Si el promocode tiene pedidos asociados, no permitir borrar — solo desactivar
    const { count } = await db
      .from("pedidos")
      .select("id", { count: "exact", head: true })
      .eq("promocode_id", id);

    if ((count ?? 0) > 0) {
      const { error: updError } = await db
        .from("promocodes")
        .update({ activo: false })
        .eq("id", id);
      if (updError) throw updError;
      return NextResponse.json({ data: { desactivado: true } });
    }

    const { error } = await db.from("promocodes").delete().eq("id", id);
    if (error) throw error;
    return NextResponse.json({ data: { eliminado: true } });
  } catch (error: any) {
    if (error.message === "No autorizado") {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 });
    }
    return NextResponse.json(
      { error: error.message || "Error al eliminar" },
      { status: 500 }
    );
  }
}
