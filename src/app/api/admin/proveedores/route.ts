import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { requireRole } from "@/lib/supabase/roles";
import { z } from "zod";

const TIENDA_ROLES = ["super_admin", "tienda"];

const proveedorSchema = z.object({
  nombre: z.string().min(1, "Nombre requerido").max(200),
  rut: z.string().max(20).optional().nullable(),
  razon_social: z.string().max(200).optional().nullable(),
  contacto_nombre: z.string().max(100).optional().nullable(),
  contacto_telefono: z.string().max(20).optional().nullable(),
  contacto_email: z
    .string()
    .email("Email inválido")
    .optional()
    .nullable()
    .or(z.literal("")),
  direccion: z.string().optional().nullable(),
  notas: z.string().optional().nullable(),
  activo: z.boolean().default(true),
});

// GET /api/admin/proveedores — listar proveedores
export async function GET(request: NextRequest) {
  try {
    await requireRole(TIENDA_ROLES);
    const supabase = await createServerClient();

    const { searchParams } = new URL(request.url);
    const search = searchParams.get("search") || "";
    const estado = searchParams.get("estado") || "";
    const page = parseInt(searchParams.get("page") || "1");
    const limit = parseInt(searchParams.get("limit") || "20");
    const offset = (page - 1) * limit;

    let query = supabase
      .from("proveedores")
      .select("*", { count: "exact" })
      .order("nombre", { ascending: true });

    if (search) {
      query = query.or(
        `nombre.ilike.%${search}%,rut.ilike.%${search}%,razon_social.ilike.%${search}%`
      );
    }

    if (estado === "activo") query = query.eq("activo", true);
    if (estado === "inactivo") query = query.eq("activo", false);
    if (estado === "con_deuda")
      query = query.gt("saldo_cuenta_corriente", 0);

    query = query.range(offset, offset + limit - 1);

    const { data, error, count } = await query;
    if (error) throw error;

    return NextResponse.json({
      data,
      pagination: {
        page,
        limit,
        total: count || 0,
        totalPages: Math.ceil((count || 0) / limit),
      },
    });
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

// POST /api/admin/proveedores — crear proveedor
export async function POST(request: NextRequest) {
  try {
    await requireRole(TIENDA_ROLES);
    const supabase = await createServerClient();
    const body = await request.json();
    const parsed = proveedorSchema.parse(body);

    // Limpiar email vacío
    const insertData = {
      ...parsed,
      contacto_email:
        parsed.contacto_email === "" ? null : parsed.contacto_email,
    };

    const { data, error } = await supabase
      .from("proveedores")
      .insert(insertData as any)
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({ data }, { status: 201 });
  } catch (error: any) {
    if (error.message === "No autorizado") {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 });
    }
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Datos inválidos", details: error.issues },
        { status: 400 }
      );
    }
    return NextResponse.json(
      { error: error.message || "Error al crear proveedor" },
      { status: 500 }
    );
  }
}
