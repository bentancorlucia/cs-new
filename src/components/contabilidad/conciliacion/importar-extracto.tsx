"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { toast } from "sonner";
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  FileSpreadsheet,
  Keyboard,
  Loader2,
  Lock,
  PencilLine,
  Plus,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { formatFecha, formatImporte } from "@/lib/contabilidad/formato";
import { easeSmooth, springBouncy } from "@/lib/motion";
import {
  ErrorFormatoExtracto,
  parsearItauCSV,
  redondear,
  verificarCuadre,
  type ResultadoItau,
} from "@/lib/contabilidad/parsear-itau";
import { parseNumero } from "@/components/contabilidad/asientos/asiento-form";
import { BadgeUsd, ImporteAnimado } from "@/components/contabilidad/asientos/ui-asiento";
import { importarExtracto } from "@/app/(dashboard)/contabilidad/conciliacion/actions";

type Anterior = {
  id: string;
  fechaDesde: string;
  fechaHasta: string;
  saldoFinal: number;
  proximoDesde: string;
};

type Fila = {
  key: string;
  fecha: string;
  concepto: string;
  referencia: string;
  entra: string;
  sale: string;
  saldo: string;
};

let secuencia = 0;
const nuevaKey = () => `f${++secuencia}`;

/** Importe con signo opcional: "-1.234,50" → −1234.5. Vacío → null; ilegible → NaN. */
function leerImporte(texto: string): number | null {
  const t = texto.trim();
  if (!t) return null;
  const negativo = /^-|-$|^\(.*\)$/.test(t);
  const n = parseNumero(t.replace(/^[-(]|[-)]$/g, ""), true);
  if (n === null) return Number.NaN;
  return redondear(negativo ? -n : n);
}

function textoImporte(n: number | null): string {
  return n === null ? "" : formatImporte(n);
}

function filaVacia(fecha: string): Fila {
  return { key: nuevaKey(), fecha, concepto: "", referencia: "", entra: "", sale: "", saldo: "" };
}

function primeroDeMes(iso: string) {
  return `${iso.slice(0, 7)}-01`;
}

function finDeMes(iso: string) {
  const [y, m] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
}

async function leerArchivo(file: File): Promise<string> {
  const buf = await file.arrayBuffer();
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(buf);
  } catch {
    // Los CSV del banco suelen venir en Latin-1.
    return new TextDecoder("windows-1252").decode(buf);
  }
}

export function ImportarExtracto({
  cuenta,
  anterior,
  hoy,
}: {
  cuenta: { id: string; codigo: string; nombre: string; moneda: string | null };
  anterior: Anterior | null;
  hoy: string;
}) {
  const router = useRouter();
  const monedaCuenta = cuenta.moneda ?? "UYU";
  const simbolo = cuenta.moneda === "USD" ? "USD" : undefined;
  const inicioPropuesto = anterior?.proximoDesde ?? primeroDeMes(hoy);

  const [modo, setModo] = useState<"csv" | "manual">("csv");
  const [editando, setEditando] = useState(false);
  const [archivo, setArchivo] = useState<string | null>(null);
  const [leido, setLeido] = useState<ResultadoItau | null>(null);
  const [errorArchivo, setErrorArchivo] = useState<string | null>(null);
  const [arrastrando, setArrastrando] = useState(false);
  const inputArchivo = useRef<HTMLInputElement>(null);

  const [desde, setDesde] = useState(inicioPropuesto);
  const [hasta, setHasta] = useState(finDeMes(inicioPropuesto));
  const [saldoInicial, setSaldoInicial] = useState(anterior ? textoImporte(anterior.saldoFinal) : "");
  const [saldoFinal, setSaldoFinal] = useState("");
  const [filas, setFilas] = useState<Fila[]>([]);

  const [pendiente, startTransition] = useTransition();
  const [errorBase, setErrorBase] = useState<string | null>(null);

  const editable = modo === "manual" || editando;
  const hayDatos = modo === "manual" || leido !== null;

  // ------------------------------------------------------------
  // Archivo
  // ------------------------------------------------------------

  async function cargarArchivo(file: File | undefined) {
    if (!file) return;
    setErrorArchivo(null);
    setErrorBase(null);
    try {
      const r = parsearItauCSV(await leerArchivo(file));
      if (r.movimientos.length === 0 && r.saldoInicial === null) {
        throw new ErrorFormatoExtracto("El archivo no tiene movimientos ni saldos");
      }
      setArchivo(file.name);
      setLeido(r);
      setEditando(false);
      setFilas(
        r.movimientos.map((m) => ({
          key: nuevaKey(),
          fecha: m.fecha,
          concepto: m.concepto,
          referencia: m.referencia ?? "",
          entra: m.importe > 0 ? textoImporte(m.importe) : "",
          sale: m.importe < 0 ? textoImporte(-m.importe) : "",
          saldo: textoImporte(m.saldo),
        }))
      );
      const d = anterior ? anterior.proximoDesde : r.fechaSaldoInicial ?? r.fechaDesde ?? inicioPropuesto;
      setDesde(d);
      setHasta(r.fechaSaldoFinal ?? r.fechaHasta ?? finDeMes(d));
      if (!anterior) setSaldoInicial(textoImporte(r.saldoInicial));
      setSaldoFinal(textoImporte(r.saldoFinal));
    } catch (e) {
      setLeido(null);
      setArchivo(null);
      setFilas([]);
      setErrorArchivo(e instanceof ErrorFormatoExtracto ? e.message : "No se pudo leer el archivo");
    } finally {
      if (inputArchivo.current) inputArchivo.current.value = "";
    }
  }

  function cambiarModo(m: "csv" | "manual") {
    if (m === modo) return;
    setModo(m);
    setErrorBase(null);
    if (m === "manual") {
      setEditando(true);
      if (filas.length === 0) setFilas([filaVacia(desde)]);
    } else {
      setEditando(false);
      if (!leido) setFilas([]);
    }
  }

  // ------------------------------------------------------------
  // Cuadre
  // ------------------------------------------------------------

  const movimientos = useMemo(
    () =>
      filas.map((f) => {
        const entra = leerImporte(f.entra);
        const sale = leerImporte(f.sale);
        const importe =
          entra === null && sale === null
            ? null
            : redondear((entra !== null && Number.isFinite(entra) ? Math.abs(entra) : 0) -
                (sale !== null && Number.isFinite(sale) ? Math.abs(sale) : 0));
        const saldo = leerImporte(f.saldo);
        return {
          fecha: f.fecha || null,
          concepto: f.concepto,
          referencia: f.referencia.trim() || null,
          importe,
          saldo: saldo !== null && Number.isFinite(saldo) ? saldo : null,
          ilegible:
            (entra !== null && !Number.isFinite(entra)) ||
            (sale !== null && !Number.isFinite(sale)) ||
            (saldo !== null && !Number.isFinite(saldo)),
        };
      }),
    [filas]
  );

  const si = leerImporte(saldoInicial);
  const sf = leerImporte(saldoFinal);
  const siValido = si !== null && Number.isFinite(si) ? si : null;
  const sfValido = sf !== null && Number.isFinite(sf) ? sf : null;

  const cuadre = useMemo(
    () =>
      verificarCuadre({
        desde: desde || null,
        hasta: hasta || null,
        saldoInicial: siValido,
        saldoFinal: sfValido,
        movimientos,
        moneda: monedaCuenta,
      }),
    [desde, hasta, siValido, sfValido, movimientos, monedaCuenta]
  );

  const problemas = useMemo(() => {
    const extra: { fila: number | null; mensaje: string }[] = [];
    if (leido?.moneda && leido.moneda !== monedaCuenta) {
      extra.push({
        fila: null,
        mensaje: `El archivo es de una cuenta en ${leido.moneda} y ${cuenta.nombre} es en ${monedaCuenta}: revisá que sea el extracto correcto`,
      });
    }
    if (anterior && leido && leido.saldoInicial !== null && redondear(leido.saldoInicial) !== redondear(anterior.saldoFinal)) {
      extra.push({
        fila: null,
        mensaje: `El archivo informa saldo inicial ${formatImporte(leido.saldoInicial)}, pero el extracto anterior terminó en ${formatImporte(anterior.saldoFinal)}`,
      });
    }
    if (saldoInicial.trim() && siValido === null) extra.push({ fila: null, mensaje: "El saldo inicial no es un número" });
    if (saldoFinal.trim() && sfValido === null) extra.push({ fila: null, mensaje: "El saldo final no es un número" });
    movimientos.forEach((m, i) => {
      if (m.ilegible) extra.push({ fila: i, mensaje: `Movimiento ${i + 1}: hay un importe que no es un número` });
    });
    return [...extra, ...cuadre.problemas];
  }, [leido, monedaCuenta, cuenta.nombre, anterior, saldoInicial, saldoFinal, siValido, sfValido, movimientos, cuadre.problemas]);

  const filasConProblema = new Set(problemas.map((p) => p.fila).filter((f): f is number => f !== null));
  const listo = hayDatos && problemas.length === 0;

  // ------------------------------------------------------------
  // Edición
  // ------------------------------------------------------------

  function cambiarFila(key: string, patch: Partial<Fila>) {
    setFilas((fs) => fs.map((f) => (f.key === key ? { ...f, ...patch } : f)));
  }

  function agregarFila() {
    const ultima = filas[filas.length - 1];
    setFilas((fs) => [...fs, filaVacia(ultima?.fecha || desde)]);
  }

  function confirmar() {
    if (!listo || siValido === null || sfValido === null) return;
    setErrorBase(null);
    startTransition(async () => {
      const r = await importarExtracto({
        cuentaId: cuenta.id,
        desde,
        hasta,
        saldoInicial: siValido,
        saldoFinal: sfValido,
        archivo: modo === "csv" ? archivo : null,
        movimientos: movimientos.map((m) => ({
          fecha: m.fecha ?? "",
          concepto: m.concepto.trim(),
          referencia: m.referencia,
          importe: m.importe ?? 0,
          saldo: m.saldo,
        })),
      });
      if (r.ok) {
        toast.success("Extracto importado");
        router.push(`/contabilidad/conciliacion/${r.data.id}`);
      } else {
        setErrorBase(r.error);
        toast.error(r.error);
      }
    });
  }

  // ------------------------------------------------------------
  // Render
  // ------------------------------------------------------------

  return (
    <div className="space-y-5">
      {/* Modo */}
      <div className="inline-flex rounded-full border border-linea bg-white p-1">
        {(
          [
            ["csv", "Archivo CSV de Itaú", FileSpreadsheet],
            ["manual", "Carga manual", Keyboard],
          ] as const
        ).map(([m, texto, Icono]) => (
          <button
            key={m}
            type="button"
            onClick={() => cambiarModo(m)}
            className={cn(
              "relative inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-xs font-medium transition-colors",
              modo === m ? "text-white" : "text-muted-foreground hover:text-bordo-800"
            )}
          >
            {modo === m && (
              <motion.span
                layoutId="modo-importar"
                className="absolute inset-0 rounded-full bg-bordo-800"
                transition={springBouncy}
              />
            )}
            <Icono className="relative size-3.5" />
            <span className="relative">{texto}</span>
          </button>
        ))}
      </div>

      {/* Archivo */}
      <AnimatePresence initial={false}>
        {modo === "csv" && (
          <motion.div
            key="zona"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={easeSmooth}
            className="overflow-hidden"
          >
            <label
              onDragOver={(e) => {
                e.preventDefault();
                setArrastrando(true);
              }}
              onDragLeave={() => setArrastrando(false)}
              onDrop={(e) => {
                e.preventDefault();
                setArrastrando(false);
                void cargarArchivo(e.dataTransfer.files?.[0]);
              }}
              className={cn(
                "flex cursor-pointer flex-col items-center gap-2 rounded-2xl border-2 border-dashed bg-white p-6 text-center transition-all",
                arrastrando ? "scale-[1.01] border-bordo-500 bg-bordo-50/50" : "border-linea hover:border-bordo-200"
              )}
            >
              <motion.div
                animate={arrastrando ? { y: -4, scale: 1.1 } : { y: 0, scale: 1 }}
                transition={springBouncy}
                className="flex size-11 items-center justify-center rounded-full bg-bordo-50 text-bordo-800"
              >
                <Upload className="size-5" />
              </motion.div>
              <div className="font-heading text-sm text-foreground">
                {archivo ?? "Arrastrá el CSV o tocá para elegirlo"}
              </div>
              <div className="max-w-md text-xs text-muted-foreground">
                {leido
                  ? `${leido.movimientos.length} movimientos leídos${leido.cuenta ? ` · cuenta ${leido.cuenta}` : ""}${
                      leido.moneda ? ` · ${leido.moneda}` : ""
                    }`
                  : "En el home banking de Itaú: la cuenta, el período y “Exportar movimientos a CSV”."}
              </div>
              <input
                ref={inputArchivo}
                type="file"
                accept=".csv,text/csv,text/plain"
                className="sr-only"
                onChange={(e) => void cargarArchivo(e.target.files?.[0])}
              />
            </label>
            <AnimatePresence>
              {errorArchivo && (
                <motion.p
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  role="alert"
                  className="mt-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-800"
                >
                  {errorArchivo}
                </motion.p>
              )}
              {leido && leido.ignoradas.length > 0 && (
                <motion.p
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="mt-2 text-xs text-amber-800"
                >
                  Se ignoraron {leido.ignoradas.length} filas del archivo:{" "}
                  {leido.ignoradas
                    .slice(0, 5)
                    .map((x) => `línea ${x.linea} (${x.motivo})`)
                    .join(", ")}
                  {leido.ignoradas.length > 5 ? "…" : ""}
                </motion.p>
              )}
            </AnimatePresence>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {hayDatos && (
          <motion.div
            key="datos"
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            transition={easeSmooth}
            className="space-y-5"
          >
            {/* Período y saldos */}
            <section className="grid gap-4 rounded-2xl border border-linea bg-white p-4 sm:p-5 lg:grid-cols-[1fr_1fr]">
              <div className="grid grid-cols-2 content-start gap-3">
                <Campo etiqueta="Desde" bloqueado={!!anterior} ayuda={anterior ? "Día siguiente al extracto anterior" : undefined}>
                  <input
                    type="date"
                    value={desde}
                    disabled={!!anterior}
                    onChange={(e) => setDesde(e.target.value)}
                    className={claseInput}
                  />
                </Campo>
                <Campo etiqueta="Hasta">
                  <input type="date" value={hasta} min={desde} onChange={(e) => setHasta(e.target.value)} className={claseInput} />
                </Campo>
                <Campo
                  etiqueta={<>Saldo inicial {cuenta.moneda && <BadgeUsd className="ml-1" />}</>}
                  bloqueado={!!anterior}
                  ayuda={anterior ? `Saldo final del extracto al ${formatFecha(anterior.fechaHasta)}` : undefined}
                >
                  <input
                    value={saldoInicial}
                    disabled={!!anterior}
                    inputMode="decimal"
                    onChange={(e) => setSaldoInicial(e.target.value)}
                    onBlur={() => {
                      const n = leerImporte(saldoInicial);
                      if (n !== null && Number.isFinite(n)) setSaldoInicial(textoImporte(n));
                    }}
                    placeholder="0,00"
                    className={cn(claseInput, "text-right tabular-nums")}
                  />
                </Campo>
                <Campo etiqueta="Saldo final según el banco">
                  <input
                    value={saldoFinal}
                    inputMode="decimal"
                    onChange={(e) => setSaldoFinal(e.target.value)}
                    onBlur={() => {
                      const n = leerImporte(saldoFinal);
                      if (n !== null && Number.isFinite(n)) setSaldoFinal(textoImporte(n));
                    }}
                    placeholder="0,00"
                    className={cn(claseInput, "text-right tabular-nums")}
                  />
                </Campo>
              </div>

              {/* Cuadre */}
              <div
                className={cn(
                  "rounded-xl border p-4 transition-colors",
                  cuadre.diferenciaFinal === 0 ? "border-emerald-200 bg-emerald-50/50" : "border-linea bg-superficie/40"
                )}
              >
                <div className="space-y-1.5 text-sm">
                  <LineaCuadre texto="Saldo inicial" valor={siValido ?? 0} moneda={simbolo} />
                  <LineaCuadre texto="+ Entradas" valor={cuadre.entradas} moneda={simbolo} className="text-emerald-700" />
                  <LineaCuadre texto="− Salidas" valor={cuadre.salidas} moneda={simbolo} className="text-rose-700" />
                  <div className="border-t border-linea pt-1.5">
                    <LineaCuadre texto="= Saldo calculado" valor={cuadre.saldoCalculado} moneda={simbolo} fuerte />
                  </div>
                  <LineaCuadre texto="Saldo final del banco" valor={sfValido ?? 0} moneda={simbolo} />
                </div>
                <AnimatePresence mode="wait" initial={false}>
                  <motion.div
                    key={cuadre.diferenciaFinal === 0 ? "ok" : cuadre.diferenciaFinal === null ? "nada" : "dif"}
                    initial={{ opacity: 0, y: 4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -4 }}
                    transition={{ duration: 0.18 }}
                    className={cn(
                      "mt-3 flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium",
                      cuadre.diferenciaFinal === 0
                        ? "bg-emerald-100 text-emerald-800"
                        : cuadre.diferenciaFinal === null
                          ? "bg-white text-muted-foreground"
                          : "bg-rose-100 text-rose-800"
                    )}
                  >
                    {cuadre.diferenciaFinal === 0 ? (
                      <>
                        <CheckCircle2 className="size-4" /> El extracto cierra
                      </>
                    ) : cuadre.diferenciaFinal === null ? (
                      "Completá los saldos para verificar"
                    ) : (
                      <>
                        <AlertTriangle className="size-4" /> No cierra por{" "}
                        <ImporteAnimado valor={cuadre.diferenciaFinal} moneda={cuenta.moneda ?? "UYU"} />
                      </>
                    )}
                  </motion.div>
                </AnimatePresence>
              </div>
            </section>

            {/* Movimientos */}
            <section className="rounded-2xl border border-linea bg-white">
              <header className="flex flex-wrap items-center justify-between gap-2 border-b border-linea px-4 py-3 sm:px-5">
                <div>
                  <h2 className="font-heading text-sm text-foreground">Movimientos</h2>
                  <p className="text-xs text-muted-foreground">
                    {filas.length} {filas.length === 1 ? "movimiento" : "movimientos"} · el saldo de cada fila se compara con el acumulado
                  </p>
                </div>
                {modo === "csv" && !editando && filas.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setEditando(true)}
                    className="inline-flex h-8 items-center gap-1.5 rounded-full border border-linea px-3 text-xs text-bordo-800 transition-colors hover:border-bordo-200 hover:bg-bordo-50"
                  >
                    <PencilLine className="size-3.5" />
                    Corregir a mano
                  </button>
                )}
              </header>

              <div className="hidden grid-cols-[2rem_7.5rem_minmax(0,1fr)_8rem_8rem_8rem_1.5rem] gap-3 border-b border-linea bg-superficie/40 px-5 py-2 font-heading text-[11px] uppercase tracking-editorial text-muted-foreground md:grid">
                <span>#</span>
                <span>Fecha</span>
                <span>Concepto</span>
                <span className="text-right">Importe</span>
                <span className="text-right">Saldo banco</span>
                <span className="text-right">Acumulado</span>
                <span />
              </div>

              <ul className="divide-y divide-linea">
                <AnimatePresence initial={false}>
                  {filas.map((f, i) => (
                    <FilaMovimiento
                      key={f.key}
                      fila={f}
                      indice={i}
                      editable={editable}
                      importe={movimientos[i]?.importe ?? null}
                      verificacion={cuadre.filas[i]}
                      conProblema={filasConProblema.has(i)}
                      moneda={simbolo}
                      onCambio={(patch) => cambiarFila(f.key, patch)}
                      onQuitar={() => setFilas((fs) => fs.filter((x) => x.key !== f.key))}
                    />
                  ))}
                </AnimatePresence>
              </ul>
              {filas.length === 0 && (
                <p className="px-5 py-6 text-center text-sm text-muted-foreground">
                  Sin movimientos: el saldo final tiene que ser igual al inicial.
                </p>
              )}
              {editable && (
                <div className="border-t border-linea p-3">
                  <button
                    type="button"
                    onClick={agregarFila}
                    className="inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-xs font-medium text-bordo-800 transition-colors hover:bg-bordo-50"
                  >
                    <Plus className="size-3.5" />
                    Agregar movimiento
                  </button>
                </div>
              )}
            </section>

            {/* Problemas y confirmación */}
            <AnimatePresence>
              {problemas.length > 0 && (
                <motion.section
                  key="problemas"
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  className="overflow-hidden"
                >
                  <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
                    <div className="mb-2 flex items-center gap-2 font-heading">
                      <AlertTriangle className="size-4" />
                      Revisá antes de importar
                    </div>
                    <ul className="list-disc space-y-1 pl-5 text-xs">
                      {problemas.slice(0, 8).map((p, i) => (
                        <li key={i}>{p.mensaje}</li>
                      ))}
                    </ul>
                    {problemas.length > 8 && (
                      <p className="mt-1 text-xs text-amber-800">y {problemas.length - 8} más…</p>
                    )}
                  </div>
                </motion.section>
              )}
            </AnimatePresence>

            <AnimatePresence>
              {errorBase && (
                <motion.div
                  key={errorBase}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1, x: [0, -6, 6, -4, 4, 0] }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.4 }}
                  role="alert"
                  className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800"
                >
                  {errorBase}
                </motion.div>
              )}
            </AnimatePresence>

            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-end">
              <motion.span whileHover={listo ? { scale: 1.02, y: -1 } : undefined} whileTap={listo ? { scale: 0.97 } : undefined} transition={springBouncy} className="inline-flex">
                <button
                  type="button"
                  onClick={confirmar}
                  disabled={!listo || pendiente}
                  className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-full bg-bordo-800 px-5 text-sm font-medium text-white transition-colors hover:bg-bordo-900 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
                >
                  {pendiente ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
                  {pendiente
                    ? "Importando…"
                    : `Importar extracto${filas.length ? ` (${filas.length} movimientos)` : ""}`}
                </button>
              </motion.span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

const claseInput =
  "h-10 w-full min-w-0 rounded-lg border border-linea bg-white px-3 text-sm outline-none transition-all focus:border-bordo-700 focus:ring-3 focus:ring-bordo-800/10 disabled:bg-superficie/60 disabled:text-foreground/80";

function Campo({
  etiqueta,
  ayuda,
  bloqueado,
  children,
}: {
  etiqueta: React.ReactNode;
  ayuda?: string;
  bloqueado?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="block min-w-0">
      <span className="mb-1 flex items-center gap-1 text-xs font-medium text-foreground/80">
        {etiqueta}
        {bloqueado && <Lock className="size-3 text-muted-foreground" />}
      </span>
      {children}
      {ayuda && <span className="mt-1 block text-[11px] text-muted-foreground">{ayuda}</span>}
    </label>
  );
}

function LineaCuadre({
  texto,
  valor,
  moneda,
  fuerte,
  className,
}: {
  texto: string;
  valor: number;
  moneda?: string;
  fuerte?: boolean;
  className?: string;
}) {
  return (
    <div className={cn("flex items-baseline justify-between gap-3", fuerte && "font-semibold", className)}>
      <span className={cn(!fuerte && "text-muted-foreground")}>{texto}</span>
      <ImporteAnimado valor={valor} moneda={moneda} />
    </div>
  );
}

function FilaMovimiento({
  fila,
  indice,
  editable,
  importe,
  verificacion,
  conProblema,
  moneda,
  onCambio,
  onQuitar,
}: {
  fila: Fila;
  indice: number;
  editable: boolean;
  importe: number | null;
  verificacion: ReturnType<typeof verificarCuadre>["filas"][number] | undefined;
  conProblema: boolean;
  moneda?: string;
  onCambio: (patch: Partial<Fila>) => void;
  onQuitar: () => void;
}) {
  const v = verificacion;
  const errorNuevo = v?.errorSaldo === "nuevo";
  const estado = conProblema ? "error" : v?.errorSaldo === "arrastra" ? "arrastra" : v?.diferenciaSaldo === 0 ? "ok" : "neutro";

  return (
    <motion.li
      layout="position"
      initial={{ opacity: 0, x: -8 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 12, height: 0 }}
      transition={{ duration: 0.2 }}
      className={cn(
        "px-4 py-2.5 text-sm sm:px-5",
        conProblema && "bg-rose-50/70",
        !conProblema && v?.fueraDePeriodo && "bg-amber-50/60"
      )}
    >
      {editable ? (
        <div className="grid grid-cols-2 gap-2 md:grid-cols-[2rem_7.5rem_minmax(0,1fr)_8rem_8rem_8rem_1.5rem] md:items-center md:gap-3">
          <span className="hidden text-xs text-muted-foreground tabular-nums md:block">{indice + 1}</span>
          <input
            type="date"
            value={fila.fecha}
            onChange={(e) => onCambio({ fecha: e.target.value })}
            aria-label={`Fecha del movimiento ${indice + 1}`}
            className={cn(claseInputChico, "col-span-2 md:col-span-1", v?.fueraDePeriodo && "border-amber-300")}
          />
          <div className="col-span-2 flex min-w-0 gap-2 md:col-span-1">
            <input
              value={fila.concepto}
              onChange={(e) => onCambio({ concepto: e.target.value })}
              placeholder="Concepto"
              aria-label={`Concepto del movimiento ${indice + 1}`}
              className={cn(claseInputChico, "min-w-0 flex-[2]")}
            />
            <input
              value={fila.referencia}
              onChange={(e) => onCambio({ referencia: e.target.value })}
              placeholder="Ref."
              aria-label={`Referencia del movimiento ${indice + 1}`}
              className={cn(claseInputChico, "min-w-0 flex-1")}
            />
          </div>
          <div className="flex gap-1">
            <input
              value={fila.entra}
              inputMode="decimal"
              onChange={(e) => onCambio({ entra: e.target.value, sale: e.target.value ? "" : fila.sale })}
              placeholder="Entra"
              aria-label={`Entra en el movimiento ${indice + 1}`}
              className={cn(claseInputChico, "min-w-0 text-right tabular-nums text-emerald-800 placeholder:text-emerald-700/50")}
            />
            <input
              value={fila.sale}
              inputMode="decimal"
              onChange={(e) => onCambio({ sale: e.target.value, entra: e.target.value ? "" : fila.entra })}
              placeholder="Sale"
              aria-label={`Sale en el movimiento ${indice + 1}`}
              className={cn(claseInputChico, "min-w-0 text-right tabular-nums text-rose-800 placeholder:text-rose-700/50")}
            />
          </div>
          <input
            value={fila.saldo}
            inputMode="decimal"
            onChange={(e) => onCambio({ saldo: e.target.value })}
            placeholder="Saldo (opc.)"
            aria-label={`Saldo del movimiento ${indice + 1}`}
            className={cn(claseInputChico, "text-right tabular-nums", errorNuevo && "border-rose-300")}
          />
          <span className="flex items-center justify-end gap-1 text-xs tabular-nums text-muted-foreground md:block md:text-right">
            <span className="md:hidden">Acum.</span>
            {v ? formatImporte(v.acumulado, moneda) : ""}
          </span>
          <div className="flex justify-end">
            <motion.button
              type="button"
              onClick={onQuitar}
              whileHover={{ scale: 1.1 }}
              whileTap={{ scale: 0.9 }}
              title="Quitar movimiento"
              aria-label={`Quitar movimiento ${indice + 1}`}
              className="inline-flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-rose-50 hover:text-rose-700"
            >
              <Trash2 className="size-3.5" />
            </motion.button>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-0.5 md:grid-cols-[2rem_7.5rem_minmax(0,1fr)_8rem_8rem_8rem_1.5rem] md:items-center">
          <span className="hidden text-xs text-muted-foreground tabular-nums md:block">{indice + 1}</span>
          <span className="order-2 col-span-2 text-xs text-muted-foreground tabular-nums md:order-none md:col-span-1 md:text-sm md:text-foreground/80">
            {formatFecha(fila.fecha)}
          </span>
          <span className="order-1 min-w-0 md:order-none">
            <span className="block truncate text-foreground">{fila.concepto}</span>
            {fila.referencia && <span className="block truncate text-[11px] text-muted-foreground">{fila.referencia}</span>}
          </span>
          <span className="order-1 text-right font-medium md:order-none">
            {importe !== null && (
              <span className={cn("tabular-nums", importe >= 0 ? "text-emerald-700" : "text-rose-700")}>
                {importe >= 0 ? "+" : "−"}
                {formatImporte(Math.abs(importe), moneda)}
              </span>
            )}
          </span>
          <span
            className={cn(
              "order-3 text-xs tabular-nums md:order-none md:text-right md:text-sm",
              errorNuevo ? "font-medium text-rose-700" : "text-muted-foreground"
            )}
          >
            <span className="md:hidden">Saldo banco </span>
            {fila.saldo || "—"}
          </span>
          <span
            className={cn(
              "order-3 text-right text-xs tabular-nums md:order-none md:text-sm",
              estado === "arrastra" ? "text-rose-500" : "text-muted-foreground"
            )}
          >
            <span className="md:hidden">Acum. </span>
            {v ? formatImporte(v.acumulado, moneda) : ""}
          </span>
          <span className="order-3 hidden justify-end md:order-none md:flex">
            <IconoEstado estado={estado} />
          </span>
        </div>
      )}
      {errorNuevo && v?.diferenciaSaldo !== null && v?.diferenciaSaldo !== undefined && (
        <p className="mt-1 text-[11px] text-rose-700">
          El banco informa {fila.saldo} y el acumulado da {formatImporte(v.acumulado, moneda)} (diferencia{" "}
          {formatImporte(v.diferenciaSaldo, moneda)}): el error está en esta fila o falta un movimiento justo antes.
        </p>
      )}
      {v?.fueraDePeriodo && fila.fecha && (
        <p className="mt-1 text-[11px] text-amber-800">La fecha está fuera del período del extracto.</p>
      )}
    </motion.li>
  );
}

const claseInputChico =
  "h-8 w-full rounded-md border border-linea bg-white px-2 text-xs outline-none transition-all focus:border-bordo-700 focus:ring-2 focus:ring-bordo-800/10";

function IconoEstado({ estado }: { estado: "ok" | "error" | "arrastra" | "neutro" }) {
  if (estado === "ok") return <Check className="size-4 text-emerald-600" aria-label="Saldo correcto" />;
  if (estado === "error") return <X className="size-4 text-rose-600" aria-label="Error en esta fila" />;
  if (estado === "arrastra")
    return <span className="size-1.5 rounded-full bg-rose-300" aria-label="Arrastra una diferencia anterior" />;
  return null;
}
