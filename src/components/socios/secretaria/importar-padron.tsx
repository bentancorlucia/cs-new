"use client";

import { useMemo, useRef, useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  Download,
  FileSpreadsheet,
  Info,
  Loader2,
  Play,
  Square,
  Upload,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { formatFecha } from "@/lib/contabilidad/formato";
import { altaSchema, cedulaValida, formatCedula, normalizarTexto, soloDigitos, type AltaInput } from "@/lib/socios/esquemas";
import type { PlanConPrecio } from "@/lib/socios/padron";
import { importarFila } from "@/app/(dashboard)/secretaria/socios/actions";
import { Boton, Campo, EncabezadoPagina, Panel, claseControl } from "./ui";

type Columna =
  | "cedula"
  | "nombre"
  | "apellido"
  | "fecha_alta"
  | "email"
  | "telefono"
  | "numero_socio"
  | "plan_social"
  | "planes_disciplina"
  | "fecha_nacimiento"
  | "direccion";

const ALIAS: Record<Columna, string[]> = {
  cedula: ["cedula", "ci", "c i", "documento", "cedula de identidad", "doc"],
  nombre: ["nombre", "nombres"],
  apellido: ["apellido", "apellidos"],
  fecha_alta: ["fecha alta", "fecha de alta", "alta", "socio desde", "fecha ingreso", "fecha de ingreso", "ingreso"],
  email: ["email", "e mail", "mail", "correo", "correo electronico"],
  telefono: ["telefono", "tel", "celular", "movil"],
  numero_socio: ["numero socio", "numero de socio", "n socio", "nro socio", "nro de socio", "numero", "n"],
  plan_social: ["plan social", "cuota social"],
  planes_disciplina: ["planes disciplina", "planes de disciplina", "disciplinas", "disciplina", "planes"],
  fecha_nacimiento: ["fecha nacimiento", "fecha de nacimiento", "nacimiento"],
  direccion: ["direccion", "domicilio"],
};

const COLUMNAS_PLANTILLA = [
  "cedula",
  "nombre",
  "apellido",
  "fecha_alta",
  "email",
  "telefono",
  "numero_socio",
  "plan_social",
  "planes_disciplina",
  "fecha_nacimiento",
  "direccion",
];

type Estado = "pendiente" | "importando" | "ok" | "error";

interface Fila {
  n: number;
  cedula: string;
  nombre: string;
  apellido: string;
  fechaAlta: string | null;
  planes: string[];
  errores: string[];
  avisos: string[];
  input: AltaInput | null;
  estado: Estado;
  resultado?: string;
  personaId?: number;
}

function columnaDe(encabezado: string): Columna | null {
  const k = normalizarTexto(encabezado);
  for (const [col, alias] of Object.entries(ALIAS) as [Columna, string[]][]) {
    if (alias.includes(k) || normalizarTexto(col) === k) return col;
  }
  return null;
}

/** Fecha de Excel (Date, número de serie o texto dd/mm/aaaa o aaaa-mm-dd) → "AAAA-MM-DD". */
function fechaDe(v: unknown): string | null {
  if (v === null || v === undefined || v === "") return null;
  if (v instanceof Date && !Number.isNaN(v.getTime())) {
    // xlsx crea la fecha en hora local: se toman los componentes locales.
    return `${v.getFullYear()}-${String(v.getMonth() + 1).padStart(2, "0")}-${String(v.getDate()).padStart(2, "0")}`;
  }
  if (typeof v === "number" && v > 20000 && v < 80000) {
    const d = new Date(Date.UTC(1899, 11, 30) + Math.round(v) * 86400000);
    return d.toISOString().slice(0, 10);
  }
  const s = String(v).trim();
  let m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2}|\d{4})$/);
  if (m) {
    const anio = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
    return valida(anio, Number(m[2]), Number(m[1]));
  }
  m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return valida(Number(m[1]), Number(m[2]), Number(m[3]));
  return "invalida";
}

function valida(a: number, m: number, d: number): string {
  const f = new Date(Date.UTC(a, m - 1, d));
  if (f.getUTCFullYear() !== a || f.getUTCMonth() !== m - 1 || f.getUTCDate() !== d) return "invalida";
  return `${a}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/** Resuelve "Hockey Femenino - Primera (anual)" o "Primera" contra los planes de disciplina. */
function resolverPlan(
  texto: string,
  planes: PlanConPrecio[]
): { plan?: PlanConPrecio; periodicidad: "mensual" | "anual"; error?: string } {
  let k = normalizarTexto(texto);
  let periodicidad: "mensual" | "anual" = "mensual";
  if (/ anual$/.test(k)) {
    periodicidad = "anual";
    k = k.replace(/ anual$/, "");
  } else k = k.replace(/ mensual$/, "");
  const candidatos = planes.filter((p) => {
    const nombre = normalizarTexto(p.nombre);
    const disc = normalizarTexto(p.disciplina);
    return k === nombre || k === `${disc} ${nombre}` || k === `${nombre} ${disc}`;
  });
  if (candidatos.length === 1) return { plan: candidatos[0], periodicidad };
  if (candidatos.length > 1) return { periodicidad, error: `“${texto}” es ambiguo: indicá la disciplina (ej. “Disciplina - ${texto}”)` };
  // Solo el nombre de la disciplina: vale si tiene un único plan activo.
  const deLaDisciplina = planes.filter((p) => normalizarTexto(p.disciplina) === k);
  if (deLaDisciplina.length === 1) return { plan: deLaDisciplina[0], periodicidad };
  if (deLaDisciplina.length > 1) return { periodicidad, error: `${texto} tiene varias categorías: indicá cuál` };
  return { periodicidad, error: `No hay un plan de disciplina activo llamado “${texto}”` };
}

export function ImportarPadron({ planes, hoy }: { planes: PlanConPrecio[]; hoy: string }) {
  const activos = useMemo(() => planes.filter((p) => p.activo), [planes]);
  const sociales = useMemo(() => activos.filter((p) => p.tipo === "social"), [activos]);
  const deDisciplina = useMemo(() => activos.filter((p) => p.tipo === "disciplina"), [activos]);
  const [archivo, setArchivo] = useState<string | null>(null);
  const [crudas, setCrudas] = useState<Record<string, unknown>[] | null>(null);
  const [columnas, setColumnas] = useState<Record<string, Columna | null>>({});
  const [fechaPorDefecto, setFechaPorDefecto] = useState(hoy);
  const [socialPorDefecto, setSocialPorDefecto] = useState(sociales.length === 1 ? String(sociales[0].id) : "");
  const [estados, setEstados] = useState<Record<number, Pick<Fila, "estado" | "resultado" | "personaId">>>({});
  const [corriendo, setCorriendo] = useState(false);
  const [leyendo, setLeyendo] = useState(false);
  const detener = useRef(false);
  const input = useRef<HTMLInputElement>(null);

  async function leer(f: File) {
    setLeyendo(true);
    try {
      const XLSX = await import("xlsx");
      const wb = XLSX.read(await f.arrayBuffer(), { type: "array", cellDates: true });
      const hoja = wb.Sheets[wb.SheetNames[0]];
      const filas = XLSX.utils.sheet_to_json<Record<string, unknown>>(hoja, { defval: "", raw: true });
      if (filas.length === 0) {
        toast.error("La planilla está vacía");
        return;
      }
      if (filas.length > 3000) {
        toast.error("Máximo 3000 filas por archivo: dividilo en partes");
        return;
      }
      const cols: Record<string, Columna | null> = {};
      for (const h of Object.keys(filas[0])) cols[h] = columnaDe(h);
      setColumnas(cols);
      setCrudas(filas);
      setArchivo(f.name);
      setEstados({});
    } catch {
      toast.error("No se pudo leer el archivo. ¿Es un Excel (.xlsx/.xls) o CSV?");
    } finally {
      setLeyendo(false);
    }
  }

  const filas: Fila[] = useMemo(() => {
    if (!crudas) return [];
    const vistas = new Map<string, number>();
    return crudas.map((r, i) => {
      const val = (c: Columna): unknown => {
        const h = Object.keys(columnas).find((k) => columnas[k] === c);
        return h ? r[h] : undefined;
      };
      const str = (c: Columna) => String(val(c) ?? "").trim();
      const errores: string[] = [];
      const avisos: string[] = [];
      const cedula = soloDigitos(str("cedula"));
      if (!cedula) errores.push("Falta la cédula");
      else if (cedula.length < 6 || cedula.length > 9) errores.push("Cédula inválida");
      else if (!cedulaValida(cedula)) avisos.push("El dígito verificador de la cédula no coincide");
      if (cedula && vistas.has(cedula)) errores.push(`Cédula repetida (fila ${vistas.get(cedula)})`);
      if (cedula) vistas.set(cedula, i + 2);

      let fechaAlta = fechaDe(val("fecha_alta"));
      if (fechaAlta === "invalida") {
        errores.push("Fecha de alta inválida");
        fechaAlta = null;
      } else if (!fechaAlta) fechaAlta = fechaPorDefecto;
      let nacimiento = fechaDe(val("fecha_nacimiento"));
      if (nacimiento === "invalida") {
        avisos.push("Fecha de nacimiento inválida: se omite");
        nacimiento = null;
      }

      const elegidos: { plan_id: number; periodicidad: "mensual" | "anual" }[] = [];
      const nombresPlanes: string[] = [];
      const social = str("plan_social");
      if (social) {
        const k = normalizarTexto(social).replace(/ (anual|mensual)$/, "");
        const p = sociales.filter((x) => normalizarTexto(x.nombre) === k);
        if (p.length === 1) {
          const anual = / anual$/.test(normalizarTexto(social));
          elegidos.push({ plan_id: p[0].id, periodicidad: anual && p[0].permite_anual ? "anual" : "mensual" });
          nombresPlanes.push(`${p[0].nombre}${anual ? " (anual)" : ""}`);
          if (anual && !p[0].permite_anual) avisos.push(`${p[0].nombre} no admite anual: queda mensual`);
        } else errores.push(`No hay un plan social activo llamado “${social}”`);
      } else if (socialPorDefecto) {
        const p = sociales.find((x) => String(x.id) === socialPorDefecto);
        if (p) {
          elegidos.push({ plan_id: p.id, periodicidad: "mensual" });
          nombresPlanes.push(p.nombre);
        }
      }
      for (const t of str("planes_disciplina").split(/[;,|\n]+/).map((x) => x.trim()).filter(Boolean)) {
        const r2 = resolverPlan(t, deDisciplina);
        if (r2.error || !r2.plan) {
          errores.push(r2.error ?? `Plan “${t}” no encontrado`);
          continue;
        }
        if (elegidos.some((e) => e.plan_id === r2.plan!.id)) continue;
        const periodicidad = r2.periodicidad === "anual" && r2.plan.permite_anual ? "anual" : "mensual";
        elegidos.push({ plan_id: r2.plan.id, periodicidad });
        nombresPlanes.push(`${r2.plan.disciplina} · ${r2.plan.nombre}${periodicidad === "anual" ? " (anual)" : ""}`);
      }

      const numero = soloDigitos(str("numero_socio"));
      const altaInput: AltaInput = {
        persona: {
          cedula,
          nombre: str("nombre"),
          apellido: str("apellido"),
          fecha_nacimiento: nacimiento,
          telefono: str("telefono"),
          email: str("email"),
          direccion: str("direccion"),
          numero_socio: numero || null,
          notas: null,
        },
        desde: fechaAlta ?? "",
        planes: elegidos,
        medio: null,
      };
      if (errores.length === 0) {
        const p = altaSchema.safeParse(altaInput);
        if (!p.success) errores.push(...new Set(p.error.issues.map((x) => x.message)));
      }
      const e = estados[i];
      return {
        n: i + 2,
        cedula,
        nombre: str("nombre"),
        apellido: str("apellido"),
        fechaAlta,
        planes: nombresPlanes,
        errores,
        avisos,
        input: errores.length ? null : altaInput,
        estado: e?.estado ?? "pendiente",
        resultado: e?.resultado,
        personaId: e?.personaId,
      };
    });
  }, [crudas, columnas, fechaPorDefecto, socialPorDefecto, sociales, deDisciplina, estados]);

  const validas = filas.filter((f) => f.input);
  const pendientes = validas.filter((f) => f.estado === "pendiente" || f.estado === "error");
  const ok = filas.filter((f) => f.estado === "ok").length;
  const fallidas = filas.filter((f) => f.estado === "error").length;
  const procesadas = filas.filter((f) => f.estado === "ok" || f.estado === "error").length;
  const faltan = (["cedula", "nombre", "apellido"] as Columna[]).filter((c) => !Object.values(columnas).includes(c));

  async function importar() {
    detener.current = false;
    setCorriendo(true);
    const cola = filas.filter((f) => f.input && f.estado !== "ok");
    for (const f of cola) {
      if (detener.current) break;
      const i = f.n - 2;
      setEstados((s) => ({ ...s, [i]: { estado: "importando" } }));
      const r = await importarFila(f.input!);
      setEstados((s) => ({
        ...s,
        [i]: r.ok
          ? { estado: "ok", resultado: r.data.reingreso ? "Alta (ya estaba en el padrón)" : "Alta nueva", personaId: r.data.id }
          : { estado: "error", resultado: r.error },
      }));
    }
    setCorriendo(false);
    toast.success(detener.current ? "Importación detenida" : "Importación terminada");
  }

  async function plantilla() {
    const XLSX = await import("xlsx");
    const social = sociales[0]?.nombre ?? "Cuota social";
    const disc = deDisciplina[0] ? `${deDisciplina[0].disciplina} - ${deDisciplina[0].nombre}` : "Hockey Femenino - Primera";
    const ws = XLSX.utils.aoa_to_sheet([
      COLUMNAS_PLANTILLA,
      ["12345672", "Ana", "Pérez", "01/03/2015", "ana@ejemplo.com", "099123456", "1520", social, disc, "15/08/1990", ""],
    ]);
    ws["!cols"] = COLUMNAS_PLANTILLA.map((c) => ({ wch: c === "planes_disciplina" ? 36 : 16 }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Padrón");
    XLSX.writeFile(wb, "plantilla-padron-socios.xlsx");
  }

  return (
    <div className="space-y-5 pb-12">
      <motion.div initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }}>
        <Link href="/secretaria/socios" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-bordo-800">
          <ArrowLeft className="size-4" />
          Socios
        </Link>
      </motion.div>
      <EncabezadoPagina
        eyebrow="Secretaría"
        titulo="Importar padrón"
        descripcion="Para migrar el padrón desde una planilla: cada fila da de alta a una persona como socia, con su cuota social y sus disciplinas."
      >
        <Boton variante="secundario" onClick={plantilla}>
          <Download className="size-4" />
          Plantilla
        </Boton>
      </EncabezadoPagina>

      <Panel titulo="Cómo funciona" icono={Info} delay={0.05}>
        <ul className="grid gap-2 p-4 text-sm text-muted-foreground sm:grid-cols-2">
          <li>
            <b className="text-foreground">Columnas:</b> cédula, nombre, apellido, fecha de alta, email, teléfono, número de
            socio, plan social y planes de disciplina (además, opcionales: fecha de nacimiento y dirección).
          </li>
          <li>
            <b className="text-foreground">Planes por nombre:</b> separá varios con “;”. Para una categoría escribí
            “Disciplina - Categoría”; agregá “(anual)” si paga anual.
          </li>
          <li>
            <b className="text-foreground">Si la cédula ya está en el padrón</b> se registra su alta (y se completan los datos
            que falten, sin pisar los cargados). Si ya es socia, esa fila da error.
          </li>
          <li>
            <b className="text-foreground">Se importa fila por fila:</b> las filas con error no frenan al resto. El medio de
            cobro se carga después desde cada ficha.
          </li>
        </ul>
      </Panel>

      <Panel titulo="Archivo" icono={FileSpreadsheet} delay={0.1}>
        <div className="space-y-4 p-4">
          <motion.button
            type="button"
            whileHover={{ y: -1 }}
            whileTap={{ scale: 0.99 }}
            onClick={() => input.current?.click()}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              const f = e.dataTransfer.files[0];
              if (f) leer(f);
            }}
            disabled={corriendo}
            className="flex w-full flex-col items-center gap-2 rounded-2xl border-2 border-dashed border-linea bg-superficie/40 px-4 py-8 text-center transition-colors hover:border-bordo-200 hover:bg-bordo-50/30 disabled:opacity-60"
          >
            {leyendo ? <Loader2 className="size-7 animate-spin text-bordo-700" /> : <Upload className="size-7 text-bordo-700" />}
            <span className="text-sm font-medium">{archivo ?? "Elegí o arrastrá la planilla"}</span>
            <span className="text-xs text-muted-foreground">Excel (.xlsx, .xls) o CSV · primera hoja · fila 1 con los títulos</span>
          </motion.button>
          <input
            ref={input}
            type="file"
            accept=".xlsx,.xls,.csv"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) leer(f);
              e.target.value = "";
            }}
          />
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Campo etiqueta="Fecha de alta si la fila no la trae">
              <input type="date" value={fechaPorDefecto} onChange={(e) => setFechaPorDefecto(e.target.value)} disabled={corriendo} className={claseControl} />
            </Campo>
            <Campo etiqueta="Plan social si la fila no lo trae">
              <select value={socialPorDefecto} onChange={(e) => setSocialPorDefecto(e.target.value)} disabled={corriendo} className={claseControl}>
                <option value="">Ninguno (sin cuota social)</option>
                {sociales.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.nombre}
                  </option>
                ))}
              </select>
            </Campo>
          </div>
          {crudas && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex flex-wrap gap-1.5 text-[11px]">
              {Object.entries(columnas).map(([h, c]) => (
                <span
                  key={h}
                  className={cn(
                    "rounded-full border px-2 py-0.5",
                    c ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-slate-200 bg-slate-50 text-slate-500 line-through"
                  )}
                  title={c ? `Se usa como ${c}` : "Columna que no se usa"}
                >
                  {h}
                </span>
              ))}
            </motion.div>
          )}
          {crudas && faltan.length > 0 && (
            <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-800">
              Faltan columnas: {faltan.join(", ")}.
            </div>
          )}
        </div>
      </Panel>

      <AnimatePresence>
        {crudas && (
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="space-y-3">
            <div className="flex flex-col gap-3 rounded-2xl border border-linea bg-white p-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
                <span>
                  <b className="tabular-nums">{filas.length}</b> filas
                </span>
                <span className="text-emerald-700">
                  <b className="tabular-nums">{validas.length}</b> válidas
                </span>
                {filas.length - validas.length > 0 && (
                  <span className="text-rose-700">
                    <b className="tabular-nums">{filas.length - validas.length}</b> con errores (no se importan)
                  </span>
                )}
                {procesadas > 0 && (
                  <span className="text-muted-foreground">
                    · {ok} importadas{fallidas ? `, ${fallidas} rechazadas` : ""}
                  </span>
                )}
              </div>
              {corriendo ? (
                <Boton variante="peligro" onClick={() => (detener.current = true)}>
                  <Square className="size-4" />
                  Detener
                </Boton>
              ) : (
                <Boton onClick={importar} disabled={pendientes.length === 0 || faltan.length > 0}>
                  <Play className="size-4" />
                  {fallidas > 0 && pendientes.length === fallidas ? "Reintentar rechazadas" : `Importar ${pendientes.length} filas`}
                </Boton>
              )}
            </div>
            {(corriendo || procesadas > 0) && validas.length > 0 && (
              <div className="h-1.5 overflow-hidden rounded-full bg-superficie">
                <motion.div
                  className="h-full rounded-full bg-bordo-700"
                  animate={{ width: `${(procesadas / validas.length) * 100}%` }}
                  transition={{ type: "spring", stiffness: 120, damping: 20 }}
                />
              </div>
            )}

            <div className="overflow-hidden rounded-2xl border border-linea bg-white">
              <ul className="divide-y divide-linea">
                {filas.map((f, i) => (
                  <motion.li
                    key={f.n}
                    initial={{ opacity: 0, y: 4 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: Math.min(i, 20) * 0.015 }}
                    className={cn(
                      "flex gap-3 px-4 py-2.5 text-sm",
                      f.errores.length > 0 && "bg-rose-50/40",
                      f.estado === "ok" && "bg-emerald-50/40"
                    )}
                  >
                    <span className="w-8 shrink-0 pt-0.5 text-xs text-muted-foreground tabular-nums">{f.n}</span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-baseline gap-x-2">
                        <span className="font-medium">
                          {f.apellido || "—"}, {f.nombre || "—"}
                        </span>
                        <span className="text-xs text-muted-foreground tabular-nums">CI {formatCedula(f.cedula) || "—"}</span>
                        {f.fechaAlta && <span className="text-xs text-muted-foreground">alta {formatFecha(f.fechaAlta)}</span>}
                      </div>
                      {f.planes.length > 0 && <div className="mt-0.5 text-xs text-muted-foreground">{f.planes.join(" · ")}</div>}
                      {f.errores.map((e) => (
                        <div key={e} className="mt-0.5 text-xs text-rose-700">
                          {e}
                        </div>
                      ))}
                      {f.avisos.map((e) => (
                        <div key={e} className="mt-0.5 flex items-center gap-1 text-xs text-dorado-800">
                          <AlertTriangle className="size-3" />
                          {e}
                        </div>
                      ))}
                      <AnimatePresence>
                        {f.resultado && (
                          <motion.div
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: "auto" }}
                            className={cn("mt-0.5 text-xs", f.estado === "ok" ? "text-emerald-700" : "text-rose-700")}
                          >
                            {f.resultado}
                            {f.personaId && (
                              <Link href={`/secretaria/socios/${f.personaId}`} className="ml-2 font-medium underline-offset-2 hover:underline">
                                Ver ficha
                              </Link>
                            )}
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                    <span className="shrink-0 pt-0.5">
                      {f.errores.length > 0 ? (
                        <XCircle className="size-4 text-rose-500" aria-label="Con errores" />
                      ) : f.estado === "importando" ? (
                        <Loader2 className="size-4 animate-spin text-bordo-700" aria-label="Importando" />
                      ) : f.estado === "ok" ? (
                        <motion.span initial={{ scale: 0 }} animate={{ scale: 1 }} className="inline-flex">
                          <CheckCircle2 className="size-4 text-emerald-600" aria-label="Importada" />
                        </motion.span>
                      ) : f.estado === "error" ? (
                        <XCircle className="size-4 text-rose-600" aria-label="Rechazada" />
                      ) : (
                        <span className="inline-block size-2 rounded-full bg-slate-300" aria-label="Pendiente" />
                      )}
                    </span>
                  </motion.li>
                ))}
              </ul>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
