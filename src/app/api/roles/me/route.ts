import { NextResponse } from "next/server";
import { getUserRoles, getCurrentUser } from "@/lib/supabase/roles";

export async function GET() {
  try {
    const user = await getCurrentUser();

    if (!user) {
      return NextResponse.json({ error: "No autenticado" }, { status: 401 });
    }

    const roles = await getUserRoles();

    return NextResponse.json({ roles });
  } catch {
    return NextResponse.json(
      { error: "Error interno del servidor" },
      { status: 500 }
    );
  }
}
