import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireRole, getCurrentUser } from "@/lib/supabase/roles";
import { normalizeCedula } from "@/lib/utils";
import * as XLSX from "xlsx";

const PADRON_ROLES = ["super_admin", "secretaria"];

interface FilaSocio {
  nombre: string;
  apellido: string;
  cedula: string;
  fecha_nacimiento?: string | null;
  telefono?: string | null;
  notas?: string | null;
  disciplinas?: string | null;
}

type PreviewSocio = FilaSocio;

function parseDate(val: unknown): string | null {
  if (!val) return null;

  // XLSX might give us a JS Date object (serial date)
  if (val instanceof Date) {
    const y = val.getFullYear();
    const m = String(val.getMonth() + 1).padStart(2, "0");
    const d = String(val.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }

  if (typeof val === "number") {
    // Excel serial date number
    const date = XLSX.SSF.parse_date_code(val);
    if (date) {
      return `${date.y}-${String(date.m).padStart(2, "0")}-${String(date.d).padStart(2, "0")}`;
    }
    return null;
  }

  const str = String(val).trim();
  if (!str) return null;

  // Try dd/mm/yyyy or dd-mm-yyyy
  const ddmmyyyy = str.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if (ddmmyyyy) {
    const [, d, m, y] = ddmmyyyy;
    return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }

  // Try yyyy-mm-dd
  const iso = str.match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})$/);
  if (iso) {
    const [, y, m, d] = iso;
    return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }

  return null;
}

function normalizeRow(row: Record<string, unknown>): FilaSocio | null {
  // Normalize keys: lowercase, trim, remove accents
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
  const cedula = String(normalized.cedula || normalized.ci || "").trim();

  if (!nombre || !apellido) return null;

  return {
    nombre,
    apellido,
    cedula: cedula ? normalizeCedula(cedula) : "",
    fecha_nacimiento: parseDate(
      normalized.fecha_nacimiento || normalized.fecha_nac || normalized.nacimiento
    ),
    telefono: normalized.telefono || normalized.celular || normalized.tel
      ? String(normalized.telefono || normalized.celular || normalized.tel).trim()
      : null,
    notas: normalized.notas || normalized.observaciones
      ? String(normalized.notas || normalized.observaciones).trim()
      : null,
    disciplinas: normalized.disciplinas || normalized.disciplina || normalized.deporte
      ? String(normalized.disciplinas || normalized.disciplina || normalized.deporte).trim()
      : null,
  };
}

// POST /api/padron/importar
export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    await requireRole(PADRON_ROLES);
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

    // Parse Excel/CSV
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
        { error: "Máximo 1000 socios por importación" },
        { status: 400 }
      );
    }

    // Parse and validate rows
    const parsed: FilaSocio[] = [];
    const errors: { fila: number; error: string }[] = [];

    for (let i = 0; i < rawRows.length; i++) {
      const row = normalizeRow(rawRows[i]);
      if (!row) {
        errors.push({
          fila: i + 2,
          error: "Falta nombre o apellido",
        });
        continue;
      }
      parsed.push(row);
    }

    // Check for duplicates (both preview and import)
    const cedulasFromFile = parsed
      .map((p) => p.cedula)
      .filter((c) => c.length > 0);

    const existingCedulaSet = new Set<string>();
    if (cedulasFromFile.length > 0) {
      const { data: existingCedulas } = await supabase
        .from("padron_socios")
        .select("cedula")
        .in("cedula", cedulasFromFile as never);

      for (const row of (existingCedulas as { cedula: string }[] | null) || []) {
        if (row.cedula) existingCedulaSet.add(row.cedula);
      }
    }

    // Also detect duplicates within the file itself
    const fileDuplicates = new Set<string>();
    const seenInFile = new Set<string>();
    for (const p of parsed) {
      if (p.cedula) {
        if (seenInFile.has(p.cedula)) {
          fileDuplicates.add(p.cedula);
        }
        seenInFile.add(p.cedula);
      }
    }

    // Classify each row
    const nuevos: (PreviewSocio & { fila: number })[] = [];
    const existentes: (PreviewSocio & { fila: number; razon: string })[] = [];
    const duplicadosArchivo: (PreviewSocio & { fila: number })[] = [];
    const seenCedulasPreview = new Set<string>();

    for (let i = 0; i < parsed.length; i++) {
      const p = parsed[i];
      const fila = i + 2; // +2 because row 1 is header, array is 0-indexed

      if (p.cedula && existingCedulaSet.has(p.cedula)) {
        existentes.push({ ...p, fila, razon: `Cédula ya registrada: ${p.cedula}` });
      } else if (p.cedula && seenCedulasPreview.has(p.cedula)) {
        duplicadosArchivo.push({ ...p, fila });
      } else {
        nuevos.push({ ...p, fila });
        if (p.cedula) seenCedulasPreview.add(p.cedula);
      }
    }

    // Preview mode
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

    // Resolve disciplines
    const allDisciplineNames = new Set<string>();
    for (const p of parsed) {
      if (p.disciplinas) {
        // Support "Rugby; Hockey" or "Rugby, Hockey"
        const names = p.disciplinas.split(/[;,]/).map((s) => s.trim()).filter(Boolean);
        names.forEach((n) => allDisciplineNames.add(n.toLowerCase()));
      }
    }

    const disciplineMap = new Map<string, number>();
    if (allDisciplineNames.size > 0) {
      const { data: existingDisc } = await supabase
        .from("disciplinas")
        .select("id, nombre");

      for (const d of existingDisc || []) {
        disciplineMap.set(d.nombre.toLowerCase(), d.id);
      }
    }

    // Build insert data
    const toInsert: {
      nombre: string;
      apellido: string;
      cedula: string;
      fecha_nacimiento: string | null;
      telefono: string | null;
      notas: string | null;
      activo: boolean;
      created_by: string;
    }[] = [];

    const disciplinasPerSocio: { index: number; disciplinas: string[] }[] = [];
    const skipped: { fila: number; nombre: string; razon: string }[] = [];
    const seenCedulas = new Set<string>();

    for (let i = 0; i < parsed.length; i++) {
      const p = parsed[i];

      // Skip if cédula already exists in DB
      if (p.cedula && existingCedulaSet.has(p.cedula)) {
        skipped.push({
          fila: i + 2,
          nombre: `${p.apellido}, ${p.nombre}`,
          razon: `Cédula ya registrada: ${p.cedula}`,
        });
        continue;
      }

      // Skip if cédula duplicated within the file
      if (p.cedula && seenCedulas.has(p.cedula)) {
        skipped.push({
          fila: i + 2,
          nombre: `${p.apellido}, ${p.nombre}`,
          razon: `Cédula duplicada en el archivo: ${p.cedula}`,
        });
        continue;
      }

      if (p.cedula) seenCedulas.add(p.cedula);

      const insertIndex = toInsert.length;
      toInsert.push({
        nombre: p.nombre,
        apellido: p.apellido,
        cedula: p.cedula,
        fecha_nacimiento: p.fecha_nacimiento ?? null,
        telefono: p.telefono ?? null,
        notas: p.notas ?? null,
        activo: true,
        created_by: user!.id,
      });

      // Collect discipline names for this socio
      if (p.disciplinas) {
        const names = p.disciplinas
          .split(/[;,]/)
          .map((s) => s.trim())
          .filter(Boolean);
        if (names.length > 0) {
          disciplinasPerSocio.push({ index: insertIndex, disciplinas: names });
        }
      }
    }

    if (toInsert.length === 0) {
      return NextResponse.json({
        importados: 0,
        skipped,
        errors,
        message: "No hay socios válidos para importar",
      });
    }

    // Batch insert socios
    const { data: inserted, error: insertError } = await supabase
      .from("padron_socios")
      .insert(toInsert as never)
      .select("id");

    if (insertError) {
      return NextResponse.json(
        { error: `Error al insertar: ${insertError.message}` },
        { status: 500 }
      );
    }

    // Insert discipline associations
    const insertedTyped = inserted as { id: number }[] | null;
    if (insertedTyped && disciplinasPerSocio.length > 0) {
      const discInserts: {
        padron_socio_id: number;
        disciplina_id: number;
      }[] = [];

      for (const { index, disciplinas } of disciplinasPerSocio) {
        const socioId = insertedTyped[index]?.id;
        if (!socioId) continue;

        for (const name of disciplinas) {
          const discId = disciplineMap.get(name.toLowerCase());
          if (discId) {
            discInserts.push({
              padron_socio_id: socioId,
              disciplina_id: discId,
            });
          }
        }
      }

      if (discInserts.length > 0) {
        await supabase.from("padron_disciplinas").insert(discInserts as never);
      }
    }

    return NextResponse.json({
      importados: insertedTyped?.length || 0,
      skipped,
      errors,
      message: `Se importaron ${inserted?.length || 0} socios exitosamente`,
    });
  } catch (error: any) {
    if (error.message === "No autorizado") {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 });
    }
    return NextResponse.json(
      { error: error.message || "Error al importar" },
      { status: 500 }
    );
  }
}
