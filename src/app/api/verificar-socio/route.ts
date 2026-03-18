import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUser } from "@/lib/supabase/roles";
import { normalizeCedula } from "@/lib/utils";
import { z } from "zod";

const verificarSchema = z.object({
  cedula: z.string().min(1, "Cédula requerida"),
});

// POST /api/verificar-socio — verificar si el usuario es socio por cédula
export async function POST(request: NextRequest) {
  try {
    const currentUser = await getCurrentUser();

    if (!currentUser) {
      return NextResponse.json({ error: "No autenticado" }, { status: 401 });
    }

    const supabase = createAdminClient();

    const body = await request.json();
    const parsed = verificarSchema.parse(body);
    const cedulaNormalizada = normalizeCedula(parsed.cedula);

    // Buscar en el padrón por cédula
    const { data: padronSocioData } = await supabase
      .from("padron_socios")
      .select(
        `
        *,
        padron_disciplinas (
          disciplina_id,
          categoria,
          activa,
          fecha_ingreso
        )
      `
      )
      .eq("cedula", cedulaNormalizada)
      .eq("activo", true)
      .maybeSingle();

    const padronSocio = padronSocioData as unknown as {
      id: number;
      perfil_id: string | null;
      padron_disciplinas: Array<{
        disciplina_id: number;
        categoria: string | null;
        activa: boolean;
        fecha_ingreso: string | null;
      }>;
    } | null;

    if (!padronSocio) {
      return NextResponse.json(
        { error: "No encontramos un socio con esa cédula. Si creés que es un error, contactá a secretaría al email cssecretaria2017@gmail.com." },
        { status: 404 }
      );
    }

    // Verificar que no esté ya vinculado a otro usuario
    if (padronSocio.perfil_id && padronSocio.perfil_id !== currentUser.id) {
      return NextResponse.json(
        { error: "Esta cédula ya está vinculada a otra cuenta." },
        { status: 409 }
      );
    }

    // Si ya está vinculado al mismo usuario, retornar éxito
    if (padronSocio.perfil_id === currentUser.id) {
      return NextResponse.json({
        message: "Tu cuenta ya está vinculada como socio.",
        socio: padronSocio,
      });
    }

    // Vincular: actualizar padron_socios
    const { error: padronUpdateError } = await supabase
      .from("padron_socios")
      .update({
        perfil_id: currentUser.id,
        vinculado_at: new Date().toISOString(),
      } as never)
      .eq("id", padronSocio.id);

    if (padronUpdateError) {
      return NextResponse.json(
        { error: "Error al vincular tu cuenta. Intentá de nuevo." },
        { status: 500 }
      );
    }

    // Obtener datos del padrón para sincronizar cedula/telefono
    const { data: padronFullData } = await supabase
      .from("padron_socios")
      .select("cedula, telefono, fecha_nacimiento")
      .eq("id", padronSocio.id)
      .single();

    const padronFull = padronFullData as unknown as {
      cedula: string | null;
      telefono: string | null;
      fecha_nacimiento: string | null;
    } | null;

    // Actualizar perfiles — sincronizar datos del padrón
    const perfilUpdate: Record<string, unknown> = {
      es_socio: true,
      socio_verificado: true,
      padron_socio_id: padronSocio.id,
    };

    // Sincronizar cedula, telefono y fecha_nacimiento si el perfil no los tiene
    if (padronFull) {
      if (padronFull.cedula) perfilUpdate.cedula = padronFull.cedula;
      if (padronFull.telefono) perfilUpdate.telefono = padronFull.telefono;
      if (padronFull.fecha_nacimiento) perfilUpdate.fecha_nacimiento = padronFull.fecha_nacimiento;
    }

    const { error: perfilUpdateError } = await supabase
      .from("perfiles")
      .update(perfilUpdate as never)
      .eq("id", currentUser.id);

    if (perfilUpdateError) {
      return NextResponse.json(
        { error: "Error al actualizar tu perfil. Contactá a secretaría al email cssecretaria2017@gmail.com." },
        { status: 500 }
      );
    }

    // Las disciplinas ya viven en padron_disciplinas (vinculadas por padron_socio_id)
    // No es necesario copiarlas al perfil

    // Asignar rol socio
    const { data: rolSocio } = await supabase
      .from("roles")
      .select("id")
      .eq("nombre", "socio")
      .single();

    if (rolSocio) {
      await supabase.from("perfil_roles").upsert(
        {
          perfil_id: currentUser.id,
          rol_id: rolSocio.id,
        } as never,
        { onConflict: "perfil_id,rol_id" }
      );

      // Remover rol no_socio si lo tiene
      const { data: rolNoSocio } = await supabase
        .from("roles")
        .select("id")
        .eq("nombre", "no_socio")
        .single();

      if (rolNoSocio) {
        await supabase
          .from("perfil_roles")
          .delete()
          .eq("perfil_id", currentUser.id)
          .eq("rol_id", rolNoSocio.id);
      }
    }

    return NextResponse.json({
      message: "Verificación exitosa. Tu cuenta está vinculada como socio.",
      socio: padronSocio,
    });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Datos inválidos", details: err.issues },
        { status: 400 }
      );
    }
    return NextResponse.json(
      { error: "Error interno del servidor" },
      { status: 500 }
    );
  }
}
