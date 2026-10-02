"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { toast } from "sonner";
import {
  AlertTriangle,
  Check,
  Loader2,
  Plus,
  RotateCcw,
  Save,
  Scale,
  Trash2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { formatFecha, formatImporte } from "@/lib/contabilidad/formato";
import type {
  AsientoInicial,
  CatalogosAsiento,
  CuentaOpcion,
} from "@/lib/contabilidad/asientos";
import {
  guardarAsiento,
  obtenerTcVigente,
  type AsientoInput,
} from "@/app/(dashboard)/contabilidad/asientos/actions";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { CuentaCombobox } from "./cuenta-combobox";
import { BadgeUsd, ImporteAnimado } from "./ui-asiento";

// ------------------------------------------------------------
// Números
// ------------------------------------------------------------

/**
 * Interpreta lo que escribe el usuario: "1.234,56", "1234,56" o "1234.56".
 * Con coma, los puntos son de miles; sin coma, un único punto es decimal,
 * salvo en importes (2 decimales) cuando lo siguen exactamente 3 dígitos:
 * "1.500" es mil quinientos.
 */
export function parseNumero(texto: string, esImporte = false): number | null {
  let t = texto.replace(/\s|\$|US/gi, "").trim();
  if (!t) return null;
  if (t.includes(",")) t = t.replace(/\./g, "").replace(",", ".");
  else if ((t.match(/\./g) ?? []).length > 1) t = t.replace(/\./g, "");
  else if (esImporte && /^\d{1,3}\.\d{3}$/.test(t)) t = t.replace(".", "");
  if (!/^\d*\.?\d*$/.test(t) || t === ".") return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

/** A centavos, redondeando como Postgres (mitad hacia arriba) y sin ruido de coma flotante. */
function centavos(n: number): number {
  return Math.round(Number((n * 100).toPrecision(15)));
}

function round2(n: number): number {
  return centavos(n) / 100;
}

function textoImporte(n: number): string {
  return formatImporte(n);
}

function textoTc(n: number | null): string {
  return n === null ? "" : String(n).replace(".", ",");
}

// ------------------------------------------------------------
// Estado de líneas
// ------------------------------------------------------------

type Linea = {
  key: string;
  cuentaId: string | null;
  debe: string;
  haber: string;
  tc: string;
  tcManual: boolean;
  descripcion: string;
  proveedorId: string;
  disciplinaId: string;
  centroId: string;
};

let secuencia = 0;
function nuevaKey() {
  secuencia += 1;
  return `l${secuencia}`;
}

function lineaVacia(): Linea {
  return {
    key: nuevaKey(),
    cuentaId: null,
    debe: "",
    haber: "",
    tc: "",
    tcManual: false,
    descripcion: "",
    proveedorId: "",
    disciplinaId: "",
    centroId: "",
  };
}

function estaVacia(l: Linea) {
  return !l.cuentaId && !l.debe.trim() && !l.haber.trim() && !l.descripcion.trim();
}

type Calculo = {
  cuenta: CuentaOpcion | undefined;
  lado: "debe" | "haber" | null;
  /** En la moneda de la cuenta. */
  importe: number | null;
  tc: number | null;
  /** Equivalente en pesos (centavos). */
  pesos: number | null;
  errores: string[];
};

function calcular(l: Linea, cuenta: CuentaOpcion | undefined): Calculo {
  const debe = parseNumero(l.debe, true);
  const haber = parseNumero(l.haber, true);
  const lado = debe && debe > 0 ? "debe" : haber && haber > 0 ? "haber" : null;
  const bruto = lado === "debe" ? debe : lado === "haber" ? haber : null;
  const importe = bruto === null ? null : round2(bruto);
  const usd = !!cuenta?.moneda;
  const tc = usd ? parseNumero(l.tc) : null;
  let pesos: number | null = null;
  if (importe !== null && importe > 0) {
    if (!usd) pesos = centavos(importe);
    else if (tc && tc > 0) pesos = centavos(importe * tc);
  }

  const errores: string[] = [];
  if (!cuenta) errores.push("Elegí la cuenta");
  if (!importe || importe <= 0) errores.push("Falta el importe");
  if (usd && !(tc && tc > 0)) errores.push("Falta el tipo de cambio");
  if (cuenta?.requiere_auxiliar === "proveedor" && !l.proveedorId) errores.push("Elegí el proveedor");
  if (cuenta?.requiere_auxiliar === "disciplina" && !l.disciplinaId) errores.push("Elegí la disciplina");
  if (cuenta?.requiere_centro_costo && !l.centroId) errores.push("Elegí el centro de costo");

  return { cuenta, lado, importe, tc, pesos, errores };
}

// ------------------------------------------------------------
// Formulario
// ------------------------------------------------------------

type Props = {
  tipo: "manual" | "apertura";
  catalogos: CatalogosAsiento;
  inicial?: AsientoInicial;
  /** Fecha fija (apertura: primer día del ejercicio). */
  fechaFija?: string;
  /** TC vigente para la fecha inicial (se pide al servidor al cambiar la fecha). */
  tcInicial: number | null;
  fechaInicial: string;
};

export function AsientoForm({ tipo, catalogos, inicial, fechaFija, tcInicial, fechaInicial }: Props) {
  const router = useRouter();
  const cuentaPorId = useMemo(() => new Map(catalogos.cuentas.map((c) => [c.id, c])), [catalogos.cuentas]);

  const [fecha, setFecha] = useState(fechaFija ?? fechaInicial);
  const [descripcion, setDescripcion] = useState(
    inicial?.descripcion ?? (tipo === "apertura" ? "Saldos iniciales" : "")
  );
  const [lineas, setLineas] = useState<Linea[]>(() => {
    if (!inicial || inicial.lineas.length === 0) return [lineaVacia(), lineaVacia()];
    return inicial.lineas.map((l) => ({
      ...lineaVacia(),
      cuentaId: l.cuenta_id,
      debe: l.lado === "debe" ? textoImporte(l.importe) : "",
      haber: l.lado === "haber" ? textoImporte(l.importe) : "",
      tc: textoTc(l.tc),
      tcManual: l.tc !== null && l.tc !== tcInicial,
      descripcion: l.descripcion ?? "",
      proveedorId: l.proveedor_id ? String(l.proveedor_id) : "",
      disciplinaId: l.disciplina_id ? String(l.disciplina_id) : "",
      centroId: l.centro_costo_id ?? "",
    }));
  });
  const [tcInfo, setTcInfo] = useState<{ fecha: string; tc: number | null; cargando: boolean }>({
    fecha: fechaFija ?? fechaInicial,
    tc: tcInicial,
    cargando: false,
  });
  const [recienAgregada, setRecienAgregada] = useState<string | null>(null);
  const [intentado, setIntentado] = useState(false);
  const [confirmando, setConfirmando] = useState(false);
  const [accion, setAccion] = useState<"borrador" | "confirmar" | "otro" | null>(null);
  const [pending, startTransition] = useTransition();
  const [sucio, setSucio] = useState(false);

  const cacheTc = useRef(new Map<string, number | null>([[fechaFija ?? fechaInicial, tcInicial]]));
  const ultimaFechaPedida = useRef(fechaFija ?? fechaInicial);

  // ---------- cálculos ----------
  const calculos = useMemo(
    () => lineas.map((l) => calcular(l, l.cuentaId ? cuentaPorId.get(l.cuentaId) : undefined)),
    [lineas, cuentaPorId]
  );
  const utiles = lineas.map((l, i) => ({ l, c: calculos[i] })).filter(({ l }) => !estaVacia(l));
  let debeCent = 0;
  let haberCent = 0;
  for (const { c } of utiles) {
    if (c.pesos === null) continue;
    if (c.lado === "debe") debeCent += c.pesos;
    else if (c.lado === "haber") haberCent += c.pesos;
  }
  const difCent = debeCent - haberCent;
  const cuadra = difCent === 0 && debeCent > 0;
  const hayUsd = calculos.some((c) => !!c.cuenta?.moneda);
  const sinCotizacion = hayUsd && !tcInfo.cargando && tcInfo.fecha === fecha && tcInfo.tc === null;
  const puedeConfirmar = cuadra && utiles.length >= 2;

  // ---------- TC ----------
  function aplicarTc(f: string, tc: number | null) {
    setTcInfo({ fecha: f, tc, cargando: false });
    setLineas((ls) =>
      ls.map((l) => {
        const c = l.cuentaId ? cuentaPorId.get(l.cuentaId) : undefined;
        if (!c?.moneda || l.tcManual) return l;
        return { ...l, tc: textoTc(tc) };
      })
    );
  }

  async function asegurarTc(f: string) {
    ultimaFechaPedida.current = f;
    if (cacheTc.current.has(f)) {
      aplicarTc(f, cacheTc.current.get(f) ?? null);
      return;
    }
    setTcInfo((t) => ({ ...t, fecha: f, cargando: true }));
    const r = await obtenerTcVigente(f, "USD");
    if (ultimaFechaPedida.current !== f) return; // llegó tarde: el usuario ya cambió la fecha
    const tc = r.ok ? r.tc : null;
    if (r.ok) cacheTc.current.set(f, tc);
    aplicarTc(f, tc);
  }

  function cambiarFecha(f: string) {
    setFecha(f);
    setSucio(true);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(f)) return;
    if (hayUsd) void asegurarTc(f);
  }

  // ---------- edición de líneas ----------
  function actualizar(key: string, patch: Partial<Linea>) {
    setSucio(true);
    setLineas((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  }

  function elegirCuenta(key: string, c: CuentaOpcion) {
    const patch: Partial<Linea> = { cuentaId: c.id };
    if (c.requiere_auxiliar !== "proveedor") patch.proveedorId = "";
    if (c.requiere_auxiliar !== "disciplina") patch.disciplinaId = "";
    if (!c.requiere_centro_costo) patch.centroId = "";
    const tcAlDia = tcInfo.fecha === fecha && !tcInfo.cargando;
    patch.tcManual = false;
    patch.tc = c.moneda && tcAlDia ? textoTc(tcInfo.tc) : "";
    actualizar(key, patch);
    // Después de asignar la cuenta, así el TC que llegue se aplica a esta línea.
    if (c.moneda && !tcAlDia && /^\d{4}-\d{2}-\d{2}$/.test(fecha)) void asegurarTc(fecha);
  }

  function agregarLinea() {
    const l = lineaVacia();
    setRecienAgregada(l.key);
    setSucio(true);
    setLineas((ls) => [...ls, l]);
  }

  function quitarLinea(key: string) {
    setSucio(true);
    setLineas((ls) => (ls.length <= 1 ? [lineaVacia()] : ls.filter((l) => l.key !== key)));
  }

  /** Completa la línea con la diferencia del resto del asiento. */
  function cuadrarLinea(key: string) {
    const i = lineas.findIndex((l) => l.key === key);
    if (i < 0) return;
    let d = 0;
    let h = 0;
    lineas.forEach((l, j) => {
      if (j === i || estaVacia(l)) return;
      const c = calculos[j];
      if (c.pesos === null) return;
      if (c.lado === "debe") d += c.pesos;
      else if (c.lado === "haber") h += c.pesos;
    });
    const dif = d - h;
    if (dif === 0) {
      toast.info("El resto del asiento ya cuadra");
      return;
    }
    const lado = dif > 0 ? "haber" : "debe";
    let importe = Math.abs(dif) / 100;
    const c = calculos[i];
    if (c.cuenta?.moneda) {
      const tc = c.tc;
      if (!tc) {
        toast.error("Indicá el tipo de cambio de la línea para cuadrarla");
        return;
      }
      importe = round2(importe / tc);
    }
    actualizar(key, lado === "debe" ? { debe: textoImporte(importe), haber: "" } : { haber: textoImporte(importe), debe: "" });
  }

  // ---------- guardar ----------
  function armarPayload(confirmar: boolean): AsientoInput | string {
    if (!descripcion.trim()) return "Escribí la descripción del asiento";
    if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) return "Elegí la fecha";
    if (utiles.length === 0) return "Cargá al menos una línea";
    for (let k = 0; k < utiles.length; k++) {
      const { c } = utiles[k];
      if (c.errores.length) return `Línea ${lineas.indexOf(utiles[k].l) + 1}: ${c.errores[0].toLowerCase()}`;
    }
    if (confirmar) {
      if (utiles.length < 2) return "Un asiento necesita al menos dos líneas";
      if (!cuadra) return "El asiento no cuadra";
    }
    return {
      id: inicial?.id ?? null,
      fecha,
      descripcion: descripcion.trim(),
      tipo,
      confirmar,
      lineas: utiles.map(({ l, c }) => ({
        cuenta_id: c.cuenta!.id,
        lado: c.lado!,
        importe: c.importe!,
        tc: c.cuenta!.moneda ? c.tc : null,
        descripcion: l.descripcion.trim() || null,
        centro_costo_id: c.cuenta!.requiere_centro_costo ? l.centroId || null : null,
        proveedor_id: c.cuenta!.requiere_auxiliar === "proveedor" ? Number(l.proveedorId) : null,
        disciplina_id: c.cuenta!.requiere_auxiliar === "disciplina" ? Number(l.disciplinaId) : null,
      })),
    };
  }

  function enviar(modo: "borrador" | "confirmar" | "otro") {
    const confirmar = modo !== "borrador";
    const payload = armarPayload(confirmar);
    if (typeof payload === "string") {
      setIntentado(true);
      setConfirmando(false);
      toast.error(payload);
      return;
    }
    setAccion(modo);
    startTransition(async () => {
      const r = await guardarAsiento(payload);
      setAccion(null);
      setConfirmando(false);
      if (!r.ok || !r.id) {
        toast.error(r.error ?? "No se pudo guardar el asiento");
        return;
      }
      setSucio(false);
      const id = r.id;
      if (modo === "borrador") {
        toast.success("Borrador guardado");
        router.push(`/contabilidad/asientos/${id}`);
        return;
      }
      const titulo = r.numero ? `Asiento N° ${r.numero} confirmado` : "Asiento confirmado";
      if (modo === "otro") {
        toast.success(titulo, {
          action: { label: "Ver", onClick: () => router.push(`/contabilidad/asientos/${id}`) },
        });
        setDescripcion("");
        setLineas([lineaVacia(), lineaVacia()]);
        setIntentado(false);
        window.scrollTo({ top: 0, behavior: "smooth" });
        return;
      }
      toast.success(titulo);
      router.push(`/contabilidad/asientos/${id}`);
    });
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s") {
      e.preventDefault();
      if (!pending) enviar("borrador");
    }
  }

  const esNuevoManual = !inicial && tipo === "manual";

  return (
    <div onKeyDown={onKeyDown} className="space-y-4">
      {/* Cabecera */}
      <motion.section
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: [0.25, 0.46, 0.45, 0.94] }}
        className="grid gap-3 rounded-2xl border border-linea bg-white p-4 sm:grid-cols-[11rem_minmax(0,1fr)] sm:p-5"
      >
        <label className="space-y-1.5">
          <span className="font-heading text-[11px] uppercase tracking-editorial text-muted-foreground">Fecha</span>
          <input
            type="date"
            value={fecha}
            onChange={(e) => cambiarFecha(e.target.value)}
            readOnly={!!fechaFija}
            disabled={!!fechaFija}
            className="h-10 w-full rounded-lg border border-linea bg-white px-3 text-sm tabular-nums outline-none transition-all focus:border-bordo-700 focus:ring-3 focus:ring-bordo-800/10 disabled:bg-superficie disabled:text-muted-foreground"
          />
          {fechaFija && (
            <span className="block text-[11px] text-muted-foreground">Primer día del ejercicio</span>
          )}
        </label>
        <label className="space-y-1.5">
          <span className="font-heading text-[11px] uppercase tracking-editorial text-muted-foreground">
            Descripción
          </span>
          <input
            value={descripcion}
            onChange={(e) => {
              setDescripcion(e.target.value);
              setSucio(true);
            }}
            placeholder="Ej.: Pago de luz de setiembre"
            maxLength={500}
            autoFocus={!inicial && tipo === "manual"}
            aria-invalid={intentado && !descripcion.trim() ? true : undefined}
            className={cn(
              "h-10 w-full rounded-lg border bg-white px-3 text-sm outline-none transition-all focus:border-bordo-700 focus:ring-3 focus:ring-bordo-800/10",
              intentado && !descripcion.trim() ? "border-rose-300 bg-rose-50/40" : "border-linea"
            )}
          />
        </label>
      </motion.section>

      {/* Aviso de cotización */}
      <AnimatePresence initial={false}>
        {sinCotizacion && (
          <motion.div
            key="sin-tc"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.25 }}
            className="overflow-hidden"
          >
            <div className="flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
              <AlertTriangle className="mt-0.5 size-4 shrink-0" />
              <div>
                No hay cotización del dólar anterior al {formatFecha(fecha)}.{" "}
                <Link href="/contabilidad/cotizaciones" className="font-medium underline underline-offset-2 hover:text-bordo-800">
                  Cargala en Cotizaciones
                </Link>{" "}
                o escribí el tipo de cambio a mano en cada línea en dólares.
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Líneas */}
      <motion.section
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.06, ease: [0.25, 0.46, 0.45, 0.94] }}
        className="rounded-2xl border border-linea bg-white"
      >
        <div className="hidden grid-cols-[2rem_minmax(0,1fr)_9.5rem_9.5rem_4.5rem] gap-3 border-b border-linea bg-superficie/60 px-4 py-2.5 font-heading text-[11px] uppercase tracking-editorial text-muted-foreground md:grid rounded-t-2xl">
          <span>#</span>
          <span>Cuenta</span>
          <span className="text-right">Debe</span>
          <span className="text-right">Haber</span>
          <span />
        </div>

        <div className="divide-y divide-linea">
          <AnimatePresence initial={false}>
            {lineas.map((l, i) => (
              <FilaLinea
                key={l.key}
                indice={i}
                linea={l}
                calculo={calculos[i]}
                catalogos={catalogos}
                mostrarErrores={intentado && !estaVacia(l)}
                autoAbrir={recienAgregada === l.key}
                tcVigente={tcInfo.fecha === fecha ? tcInfo.tc : null}
                tcCargando={tcInfo.cargando}
                esUltima={i === lineas.length - 1}
                puedeQuitar={lineas.length > 1}
                hayDiferencia={difCent !== 0}
                onCambio={(p) => actualizar(l.key, p)}
                onCuenta={(c) => elegirCuenta(l.key, c)}
                onQuitar={() => quitarLinea(l.key)}
                onCuadrar={() => cuadrarLinea(l.key)}
                onAgregar={agregarLinea}
              />
            ))}
          </AnimatePresence>
        </div>

        <div className="px-4 py-3">
          <motion.button
            type="button"
            onClick={agregarLinea}
            whileHover={{ scale: 1.01 }}
            whileTap={{ scale: 0.98 }}
            className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-lg border border-dashed border-bordo-200 text-sm font-medium text-bordo-800 transition-colors hover:border-bordo-400 hover:bg-bordo-50 sm:w-auto sm:px-4"
          >
            <Plus className="size-4" />
            Agregar línea
          </motion.button>
        </div>

        {/* Totales + acciones */}
        <div className="sticky bottom-0 z-20 rounded-b-2xl border-t border-linea bg-white/95 px-4 py-3 backdrop-blur supports-backdrop-filter:bg-white/85">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="grid grid-cols-3 gap-3 text-sm sm:flex sm:gap-6">
              <Total etiqueta="Debe" valor={debeCent / 100} />
              <Total etiqueta="Haber" valor={haberCent / 100} />
              <div>
                <div className="font-heading text-[10px] uppercase tracking-editorial text-muted-foreground">
                  Diferencia
                </div>
                <motion.div
                  key={cuadra ? "ok" : difCent === 0 ? "cero" : "dif"}
                  initial={{ scale: 0.9, opacity: 0.6 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ type: "spring", stiffness: 400, damping: 25 }}
                  className={cn(
                    "flex items-center gap-1 font-heading text-base tabular-nums sm:text-lg",
                    cuadra ? "text-emerald-700" : difCent === 0 ? "text-muted-foreground" : "text-rose-700"
                  )}
                >
                  {cuadra && <Check className="size-4" />}
                  <ImporteAnimado valor={Math.abs(difCent) / 100} />
                </motion.div>
              </div>
            </div>
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center">
              <Link
                href={inicial ? `/contabilidad/asientos/${inicial.id}` : "/contabilidad/asientos"}
                className="inline-flex h-10 items-center justify-center rounded-lg px-3 text-sm text-muted-foreground transition-colors hover:text-foreground"
              >
                Cancelar
              </Link>
              <motion.button
                type="button"
                onClick={() => enviar("borrador")}
                disabled={pending}
                whileHover={{ y: -1 }}
                whileTap={{ scale: 0.97 }}
                title="Ctrl/⌘ + S"
                className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-linea bg-white px-4 text-sm font-medium text-foreground transition-colors hover:border-bordo-200 hover:bg-superficie disabled:opacity-60"
              >
                {accion === "borrador" ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
                Guardar borrador
              </motion.button>
              <motion.button
                type="button"
                onClick={() => {
                  if (typeof armarPayload(true) === "string") enviar("confirmar");
                  else setConfirmando(true);
                }}
                disabled={pending || !puedeConfirmar}
                whileHover={puedeConfirmar ? { y: -1 } : undefined}
                whileTap={puedeConfirmar ? { scale: 0.97 } : undefined}
                className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-bordo-800 px-4 text-sm font-medium text-white shadow-sm transition-colors hover:bg-bordo-900 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {accion === "confirmar" || accion === "otro" ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Check className="size-4" />
                )}
                Confirmar
              </motion.button>
            </div>
          </div>
          {!puedeConfirmar && utiles.length > 0 && (
            <p className="mt-2 text-[11px] text-muted-foreground">
              {utiles.length < 2
                ? "Para confirmar hacen falta al menos dos líneas."
                : debeCent === 0
                  ? "Cargá los importes para confirmar."
                  : "Para confirmar, el debe y el haber tienen que ser iguales. Usá ⚖ en una línea para completar la diferencia."}
            </p>
          )}
        </div>
      </motion.section>

      <AlertDialog open={confirmando} onOpenChange={(o) => !pending && setConfirmando(o)}>
        <AlertDialogContent className="sm:max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle>¿Confirmar el asiento?</AlertDialogTitle>
            <AlertDialogDescription>
              Va a recibir número y quedar firme por {formatImporte(debeCent / 100, "UYU")}. Después no se puede
              editar ni borrar: si hay un error, se corrige revirtiéndolo.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>Volver</AlertDialogCancel>
            {esNuevoManual && (
              <button
                type="button"
                onClick={() => enviar("otro")}
                disabled={pending}
                className="inline-flex h-8 items-center justify-center gap-1.5 rounded-lg border border-bordo-200 bg-white px-3 text-sm font-medium text-bordo-800 transition-colors hover:bg-bordo-50 disabled:opacity-60"
              >
                {accion === "otro" ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
                Confirmar y cargar otro
              </button>
            )}
            <button
              type="button"
              onClick={() => enviar("confirmar")}
              disabled={pending}
              className="inline-flex h-8 items-center justify-center gap-1.5 rounded-lg bg-bordo-800 px-3 text-sm font-medium text-white transition-colors hover:bg-bordo-900 disabled:opacity-60"
            >
              {accion === "confirmar" ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
              Confirmar
            </button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AvisoSalida activo={sucio && !pending} />
    </div>
  );
}

function Total({ etiqueta, valor }: { etiqueta: string; valor: number }) {
  return (
    <div>
      <div className="font-heading text-[10px] uppercase tracking-editorial text-muted-foreground">{etiqueta}</div>
      <ImporteAnimado valor={valor} className="font-heading text-base text-foreground sm:text-lg" />
    </div>
  );
}

/** Avisa al cerrar/recargar la pestaña con cambios sin guardar. */
function AvisoSalida({ activo }: { activo: boolean }) {
  useEffect(() => {
    if (!activo) return;
    const avisar = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", avisar);
    return () => window.removeEventListener("beforeunload", avisar);
  }, [activo]);
  return null;
}

// ------------------------------------------------------------
// Fila
// ------------------------------------------------------------

const claseInput =
  "h-10 w-full rounded-lg border bg-white px-3 text-sm outline-none transition-all focus:border-bordo-700 focus:ring-3 focus:ring-bordo-800/10";

function FilaLinea({
  indice,
  linea: l,
  calculo: c,
  catalogos,
  mostrarErrores,
  autoAbrir,
  tcVigente,
  tcCargando,
  esUltima,
  puedeQuitar,
  hayDiferencia,
  onCambio,
  onCuenta,
  onQuitar,
  onCuadrar,
  onAgregar,
}: {
  indice: number;
  linea: Linea;
  calculo: Calculo;
  catalogos: CatalogosAsiento;
  mostrarErrores: boolean;
  autoAbrir: boolean;
  tcVigente: number | null;
  tcCargando: boolean;
  esUltima: boolean;
  puedeQuitar: boolean;
  hayDiferencia: boolean;
  onCambio: (p: Partial<Linea>) => void;
  onCuenta: (c: CuentaOpcion) => void;
  onQuitar: () => void;
  onCuadrar: () => void;
  onAgregar: () => void;
}) {
  const debeRef = useRef<HTMLInputElement>(null);
  const usd = !!c.cuenta?.moneda;
  const err = mostrarErrores ? c.errores : [];
  const tiene = (m: string) => err.includes(m);
  const necesitaDetalle = usd || !!c.cuenta?.requiere_auxiliar || !!c.cuenta?.requiere_centro_costo;

  function formatearAlSalir(campo: "debe" | "haber") {
    const n = parseNumero(l[campo], true);
    if (n === null) return; // vacío o texto inválido: queda como está y se marca al guardar
    const texto = n === 0 ? "" : textoImporte(round2(n));
    if (texto !== l[campo]) onCambio(campo === "debe" ? { debe: texto } : { haber: texto });
  }

  function teclaImporte(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" && esUltima) {
      e.preventDefault();
      onAgregar();
    }
  }

  const importeInput = (campo: "debe" | "haber") => (
    <div className="relative">
      {usd && (
        <span className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-[11px] font-medium text-sky-700">
          US$
        </span>
      )}
      <input
        ref={campo === "debe" ? debeRef : undefined}
        value={l[campo]}
        inputMode="decimal"
        autoComplete="off"
        placeholder="0,00"
        aria-label={`${campo === "debe" ? "Debe" : "Haber"} línea ${indice + 1}`}
        onFocus={(e) => e.currentTarget.select()}
        onChange={(e) => {
          const v = e.target.value;
          onCambio(campo === "debe" ? { debe: v, haber: v.trim() ? "" : l.haber } : { haber: v, debe: v.trim() ? "" : l.debe });
        }}
        onBlur={() => formatearAlSalir(campo)}
        onKeyDown={teclaImporte}
        className={cn(
          claseInput,
          "text-right tabular-nums",
          usd && "pl-10",
          tiene("Falta el importe") ? "border-rose-300 bg-rose-50/40" : "border-linea"
        )}
      />
    </div>
  );

  const equivalente =
    usd && c.pesos !== null ? (
      <span className="text-[11px] text-muted-foreground tabular-nums">≈ {formatImporte(c.pesos / 100, "UYU")}</span>
    ) : null;

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: -8, scale: 0.99 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, x: -24, transition: { duration: 0.18 } }}
      transition={{ type: "spring", stiffness: 300, damping: 30 }}
      className="group/linea relative px-4 py-3"
    >
      <div className="grid grid-cols-2 gap-2 md:grid-cols-[2rem_minmax(0,1fr)_9.5rem_9.5rem_4.5rem] md:items-start md:gap-3">
        {/* # (desktop) */}
        <span className="hidden h-10 items-center font-heading text-xs text-muted-foreground tabular-nums md:flex">
          {indice + 1}
        </span>

        {/* Cuenta */}
        <div className="col-span-2 flex items-center gap-2 md:col-span-1">
          <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-superficie font-heading text-[11px] text-muted-foreground md:hidden">
            {indice + 1}
          </span>
          <div className="min-w-0 flex-1">
            <CuentaCombobox
              cuentas={catalogos.cuentas}
              value={l.cuentaId}
              onChange={onCuenta}
              invalid={tiene("Elegí la cuenta")}
              autoAbrir={autoAbrir}
              focoAlElegir={debeRef}
            />
          </div>
          <div className="flex shrink-0 items-center md:hidden">
            <BotonIcono titulo="Cuadrar con la diferencia" onClick={onCuadrar} disabled={!hayDiferencia}>
              <Scale className="size-4" />
            </BotonIcono>
            <BotonIcono titulo="Quitar línea" onClick={onQuitar} disabled={!puedeQuitar} peligro>
              <Trash2 className="size-4" />
            </BotonIcono>
          </div>
        </div>

        {/* Debe / Haber */}
        <div className="space-y-1">
          <span className="text-[10px] uppercase tracking-editorial text-muted-foreground md:hidden">Debe</span>
          {importeInput("debe")}
          {c.lado === "debe" && <div className="text-right">{equivalente}</div>}
        </div>
        <div className="space-y-1">
          <span className="text-[10px] uppercase tracking-editorial text-muted-foreground md:hidden">Haber</span>
          {importeInput("haber")}
          {c.lado === "haber" && <div className="text-right">{equivalente}</div>}
        </div>

        {/* Acciones (desktop) */}
        <div className="hidden h-10 items-center justify-end md:flex">
          <BotonIcono titulo="Cuadrar con la diferencia" onClick={onCuadrar} disabled={!hayDiferencia}>
            <Scale className="size-4" />
          </BotonIcono>
          <BotonIcono titulo="Quitar línea" onClick={onQuitar} disabled={!puedeQuitar} peligro>
            <Trash2 className="size-4" />
          </BotonIcono>
        </div>

        {/* Detalle: TC, auxiliares, descripción */}
        <div className="col-span-2 flex flex-wrap items-start gap-2 md:col-start-2 md:col-end-6">
          <AnimatePresence initial={false}>
            {usd && (
              <motion.div
                key="tc"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="flex w-full items-center gap-2 rounded-lg border border-sky-100 bg-sky-50/60 px-2 py-1.5 sm:w-auto"
              >
                <BadgeUsd />
                <span className="text-[11px] text-sky-900">TC</span>
                <input
                  value={l.tc}
                  inputMode="decimal"
                  autoComplete="off"
                  placeholder={tcCargando ? "…" : "sin cotización"}
                  aria-label={`Tipo de cambio línea ${indice + 1}`}
                  onChange={(e) => onCambio({ tc: e.target.value, tcManual: true })}
                  className={cn(
                    "h-7 w-24 rounded-md border bg-white px-2 text-right text-xs tabular-nums outline-none focus:border-bordo-700",
                    tiene("Falta el tipo de cambio") ? "border-rose-300" : "border-sky-200"
                  )}
                />
                {tcCargando && <Loader2 className="size-3.5 animate-spin text-sky-700" />}
                {l.tcManual && tcVigente !== null && parseNumero(l.tc) !== tcVigente && (
                  <button
                    type="button"
                    onClick={() => onCambio({ tc: textoTc(tcVigente), tcManual: false })}
                    title={`Usar TC vigente (${textoTc(tcVigente)})`}
                    className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] text-sky-800 transition-colors hover:bg-sky-100"
                  >
                    <RotateCcw className="size-3" />
                    {textoTc(tcVigente)}
                  </button>
                )}
                <span className="ml-auto text-[11px] text-sky-900 tabular-nums sm:ml-1">
                  = {c.pesos !== null ? formatImporte(c.pesos / 100, "UYU") : "—"}
                </span>
              </motion.div>
            )}

            {c.cuenta?.requiere_auxiliar === "proveedor" && (
              <motion.div key="prov" {...aparicion} className="w-full sm:w-56">
                <SelectSimple
                  valor={l.proveedorId}
                  onCambio={(v) => onCambio({ proveedorId: v })}
                  vacio="Proveedor…"
                  invalido={tiene("Elegí el proveedor")}
                  opciones={catalogos.proveedores.map((p) => ({ valor: String(p.id), texto: p.nombre }))}
                />
              </motion.div>
            )}
            {c.cuenta?.requiere_auxiliar === "disciplina" && (
              <motion.div key="disc" {...aparicion} className="w-full sm:w-56">
                <SelectSimple
                  valor={l.disciplinaId}
                  onCambio={(v) => onCambio({ disciplinaId: v })}
                  vacio="Disciplina…"
                  invalido={tiene("Elegí la disciplina")}
                  opciones={catalogos.disciplinas.map((d) => ({ valor: String(d.id), texto: d.nombre }))}
                />
              </motion.div>
            )}
            {c.cuenta?.requiere_centro_costo && (
              <motion.div key="cc" {...aparicion} className="w-full sm:w-56">
                <SelectSimple
                  valor={l.centroId}
                  onCambio={(v) => onCambio({ centroId: v })}
                  vacio="Centro de costo…"
                  invalido={tiene("Elegí el centro de costo")}
                  opciones={catalogos.centros.map((cc) => ({ valor: cc.id, texto: `${cc.codigo} · ${cc.nombre}` }))}
                />
              </motion.div>
            )}
          </AnimatePresence>

          <input
            value={l.descripcion}
            onChange={(e) => onCambio({ descripcion: e.target.value })}
            onKeyDown={teclaImporte}
            placeholder="Detalle de la línea (opcional)"
            maxLength={500}
            className={cn(
              "h-8 min-w-0 flex-1 basis-full rounded-lg border border-transparent bg-transparent px-2 text-xs text-muted-foreground outline-none transition-all placeholder:text-muted-foreground/70 hover:border-linea focus:border-bordo-700 focus:bg-white focus:text-foreground sm:basis-48",
              necesitaDetalle && "sm:basis-40"
            )}
          />
        </div>
      </div>

      <AnimatePresence>
        {err.length > 0 && (
          <motion.p
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="mt-1 overflow-hidden text-[11px] text-rose-700 md:pl-11"
          >
            {err.join(" · ")}
          </motion.p>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

const aparicion = {
  initial: { opacity: 0, scale: 0.95 },
  animate: { opacity: 1, scale: 1 },
  exit: { opacity: 0, scale: 0.95 },
  transition: { duration: 0.18 },
};

function SelectSimple({
  valor,
  onCambio,
  vacio,
  opciones,
  invalido,
}: {
  valor: string;
  onCambio: (v: string) => void;
  vacio: string;
  opciones: { valor: string; texto: string }[];
  invalido?: boolean;
}) {
  return (
    <select
      value={valor}
      onChange={(e) => onCambio(e.target.value)}
      className={cn(
        "h-8 w-full rounded-lg border bg-white px-2 text-xs outline-none transition-all focus:border-bordo-700 focus:ring-3 focus:ring-bordo-800/10",
        invalido ? "border-rose-300 bg-rose-50/40" : "border-linea",
        !valor && "text-muted-foreground"
      )}
    >
      <option value="">{vacio}</option>
      {opciones.map((o) => (
        <option key={o.valor} value={o.valor}>
          {o.texto}
        </option>
      ))}
    </select>
  );
}

function BotonIcono({
  titulo,
  onClick,
  disabled,
  peligro,
  children,
}: {
  titulo: string;
  onClick: () => void;
  disabled?: boolean;
  peligro?: boolean;
  children: React.ReactNode;
}) {
  return (
    <motion.button
      type="button"
      title={titulo}
      aria-label={titulo}
      onClick={onClick}
      disabled={disabled}
      whileHover={disabled ? undefined : { scale: 1.08 }}
      whileTap={disabled ? undefined : { scale: 0.9 }}
      className={cn(
        "inline-flex size-9 items-center justify-center rounded-lg text-muted-foreground transition-colors disabled:pointer-events-none disabled:opacity-30",
        peligro ? "hover:bg-rose-50 hover:text-rose-700" : "hover:bg-bordo-50 hover:text-bordo-800"
      )}
    >
      {children}
    </motion.button>
  );
}

