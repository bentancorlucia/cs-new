import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireRole, getCurrentUser } from "@/lib/supabase/roles";
import { normalizeCedula } from "@/lib/utils";
import * as XLSX from "xlsx";

const STAFF_ROLES = ["super_admin", "secretaria"];

interface FilaStaff {
  nombre: string;
  apellido: string;
  cedula: string;
  cargo: string;
  disciplina?: string | null;
  telefono?: string | null;
  email?: string | null;
  fecha_ingreso?: string | null;
  descripcion?: string | null;
  notas?: string | null;
}

type PreviewStaff = FilaStaff;

function parseDate(val: unknown): string | null {
  if (!val) return null;

  if (val instanceof Date) {
    const y = val.getFullYear();
    const m = String(val.getMonth() + 1).padStart(2, "0");
    const d = String(val.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }

  if (typeof val === "number") {
    const date = XLSX.SSF.parse_date_code(val);
    if (date) {
      return `${date.y}-${String(date.m).padStart(2, "0")}-${String(date.d).padStart(2, "0")}`;
    }
    return null;
  }

  const str = String(val).trim();
  if (!str) return null;

  const twoSlash = str.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if (twoSlash) {
    const [, a, b, y] = twoSlash;
    const aNum = parseInt(a, 10);
    const bNum = parseInt(b, 10);
    if (bNum >= 1 && bNum <= 12 && aNum >= 1 && aNum <= 31) {
      return `${y}-${b.padStart(2, "0")}-${a.padStart(2, "0")}`;
    }
    if (aNum >= 1 && aNum <= 12 && bNum >= 1 && bNum <= 31) {
      return `${y}-${a.padStart(2, "0")}-${b.padStart(2, "0")}`;
    }
    return null;
  }

  const iso = str.match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})$/);
  if (iso) {
    const [, y, m, d] = iso;
    return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }

  return null;
}

function normalizeRow(row: Record<string, unknown>): {
  row: FilaStaff | null;
  error?: string;
} {
  const normalized: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(row)) {
    const k = key
      .toLowerCase()
      .trim()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/\s+/g, "_");
    normalized[k] = val;
  }

  const nombre = String(normalized.nombre || "").trim();
  const apellido = String(normalized.apellido || "").trim();
  const cargo = String(normalized.cargo || normalized.rol || "").trim();
  const cedula = String(normalized.cedula || normalized.ci || "").trim();

  if (!nombre || !apellido) {
    return { row: null, error: "Falta nombre o apellido" };
  }
  if (!cargo) {
    return { row: null, error: "Falta cargo" };
  }
  if (!cedula) {
    return { row: null, error: "Falta cédula" };
  }

  const telefonoRaw =
    normalized.telefono || normalized.celular || normalized.tel;
  const emailRaw = normalized.email || normalized.correo;
  const discRaw = normalized.disciplina || normalized.deporte;
  const descRaw = normalized.descripcion || normalized.descripción;
  const notasRaw = normalized.notas || normalized.observaciones;

  return {
    row: {
      nombre,
      apellido,
      cargo,
      cedula: cedula ? normalizeCedula(cedula) : "",
      telefono: telefonoRaw ? String(telefonoRaw).trim() : null,
      email: emailRaw ? String(emailRaw).trim() : null,
      disciplina: discRaw ? String(discRaw).trim() : null,
      fecha_ingreso: parseDate(
        normalized.fecha_ingreso ||
          normalized.ingreso ||
          normalized.fecha
      ),
      descripcion: descRaw ? String(descRaw).trim() : null,
      notas: notasRaw ? String(notasRaw).trim() : null,
    },
  };
}

export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    await requireRole(STAFF_ROLES);
    const supabase = createAdminClient();

    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    const mode = (formData.get("mode") as string) || "preview";

    if (!file) {
      return NextResponse.json(
        { error: "No se proporcionó archivo" },
        { status: 400 }
      );
    }

    const buffer = await file.arrayBuffer();
    const workbook = XLSX.read(buffer, { type: "array", cellDates: true });
    const sheetName = workbook.SheetNames[0];
    if (!sheetName) {
      return NextResponse.json(
        { error: "El archivo no tiene hojas" },
        { status: 400 }
      );
    }

    const rawRows: Record<string, unknown>[] = XLSX.utils.sheet_to_json(
      workbook.Sheets[sheetName]
    );

    if (rawRows.length === 0) {
      return NextResponse.json(
        { error: "El archivo está vacío" },
        { status: 400 }
      );
    }

    if (rawRows.length > 1000) {
      return NextResponse.json(
        { error: "Máximo 1000 filas por importación" },
        { status: 400 }
      );
    }

    const parsed: FilaStaff[] = [];
    const errors: { fila: number; error: string }[] = [];

    for (let i = 0; i < rawRows.length; i++) {
      const { row, error } = normalizeRow(rawRows[i]);
      if (!row) {
        errors.push({ fila: i + 2, error: error || "Fila inválida" });
        continue;
      }
      parsed.push(row);
    }

    // Cédulas existentes en staff
    const cedulasFromFile = parsed
      .map((p) => p.cedula)
      .filter((c) => c.length > 0);

    const existingCedulaSet = new Set<string>();
    if (cedulasFromFile.length > 0) {
      const { data: existingCedulas } = await supabase
        .from("staff")
        .select("cedula")
        .in("cedula", cedulasFromFile as never);

      for (const row of (existingCedulas as { cedula: string }[] | null) || []) {
        if (row.cedula) existingCedulaSet.add(row.cedula);
      }
    }

    // Duplicados dentro del archivo
    const seenCedulasPreview = new Set<string>();
    const nuevos: (PreviewStaff & { fila: number })[] = [];
    const existentes: (PreviewStaff & { fila: number; razon: string })[] = [];
    const duplicadosArchivo: (PreviewStaff & { fila: number })[] = [];

    for (let i = 0; i < parsed.length; i++) {
      const p = parsed[i];
      const fila = i + 2;
      if (p.cedula && existingCedulaSet.has(p.cedula)) {
        existentes.push({
          ...p,
          fila,
          razon: `Cédula ya registrada: ${p.cedula}`,
        });
      } else if (p.cedula && seenCedulasPreview.has(p.cedula)) {
        duplicadosArchivo.push({ ...p, fila });
      } else {
        nuevos.push({ ...p, fila });
        if (p.cedula) seenCedulasPreview.add(p.cedula);
      }
    }

    if (mode === "preview") {
      return NextResponse.json({
        preview: nuevos,
        existentes,
        duplicados_archivo: duplicadosArchivo,
        errors,
        total: rawRows.length,
        validos: parsed.length,
        nuevos: nuevos.length,
      });
    }

    // Resolver disciplinas por nombre
    const discNames = new Set<string>();
    for (const p of parsed) {
      if (p.disciplina) discNames.add(p.disciplina.toLowerCase());
    }

    const disciplineMap = new Map<string, number>();
    if (discNames.size > 0) {
      const { data: discs } = await supabase
        .from("disciplinas")
        .select("id, nombre");
      for (const d of (discs as { id: number; nombre: string }[] | null) || []) {
        disciplineMap.set(d.nombre.toLowerCase(), d.id);
      }
    }

    // Construir inserts
    const seen = new Set<string>();
    const toInsert: Record<string, unknown>[] = [];
    const skipped: { fila: number; nombre: string; razon: string }[] = [];

    for (let i = 0; i < parsed.length; i++) {
      const p = parsed[i];
      const fila = i + 2;
      if (p.cedula && existingCedulaSet.has(p.cedula)) {
        skipped.push({
          fila,
          nombre: `${p.apellido}, ${p.nombre}`,
          razon: `Cédula ya registrada: ${p.cedula}`,
        });
        continue;
      }
      if (p.cedula && seen.has(p.cedula)) {
        skipped.push({
          fila,
          nombre: `${p.apellido}, ${p.nombre}`,
          razon: `Cédula duplicada en el archivo: ${p.cedula}`,
        });
        continue;
      }
      if (p.cedula) seen.add(p.cedula);

      toInsert.push({
        nombre: p.nombre,
        apellido: p.apellido,
        cedula: p.cedula || null,
        cargo: p.cargo,
        disciplina_id: p.disciplina
          ? disciplineMap.get(p.disciplina.toLowerCase()) || null
          : null,
        telefono: p.telefono || null,
        email: p.email || null,
        fecha_ingreso: p.fecha_ingreso || null,
        descripcion: p.descripcion || null,
        notas: p.notas || null,
        activo: true,
        created_by: user?.id || null,
      });
    }

    if (toInsert.length === 0) {
      return NextResponse.json({
        importados: 0,
        skipped,
        errors,
        message: "No hay filas válidas para importar",
      });
    }

    const { data: inserted, error: insertError } = await supabase
      .from("staff")
      .insert(toInsert as never)
      .select("id");

    if (insertError) {
      return NextResponse.json(
        { error: `Error al insertar: ${insertError.message}` },
        { status: 500 }
      );
    }

    const insertedRows = (inserted as { id: number }[] | null) || [];
    return NextResponse.json({
      importados: insertedRows.length,
      skipped,
      errors,
      message: `Se importaron ${insertedRows.length} miembros exitosamente`,
    });
  } catch (err) {
    if (err instanceof Error && err.message === "No autorizado") {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 });
    }
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Error al importar" },
      { status: 500 }
    );
  }
}
