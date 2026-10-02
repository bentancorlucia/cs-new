"use client";

import { useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowLeft,
  CheckCircle2,
  ClipboardList,
  Download,
  FileSpreadsheet,
  Info,
  Loader2,
  Search,
  Upload,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";
import { formatImporte } from "@/lib/contabilidad/formato";
import { parseEnteroUY, parseNumeroUY } from "@/lib/comercial/stock";
import { easeSmooth, fadeInUp, springSmooth, staggerContainer } from "@/lib/motion";
import { EnteroAnimado, ImporteAnimado } from "@/components/contabilidad/reportes/importe-animado";
import { TituloReporte } from "@/components/contabilidad/reportes/titulo-reporte";

export interface ItemInventario {
  clave: string;
  productoId: number;
  varianteId: number | null;
  producto: string;
  variante: string | null;
  sku: string | null;
  activo: boolean;
}

type Valores = Record<string, { cantidad: string; costo: string }>;

interface Rechazo {
  fila: number;
  texto: string;
  motivo: string;
}

const norm = (s: unknown) =>
  String(s ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\s+/g, " ");

const normClave = (s: string) => norm(s).replace(/[\s-]+/g, "_");

function csvCampo(v: string | null): string {
  const t = v ?? "";
  return /[",;\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
}

export function InventarioInicialCliente({
  items,
  conMovimientos,
  heredados,
  puedeOperar,
  error,
}: {
  items: ItemInventario[];
  conMovimientos: number;
  heredados: number;
  puedeOperar: boolean;
  error: string | null;
}) {
  const router = useRouter();
  const archivo = useRef<HTMLInputElement>(null);
  const [valores, setValores] = useState<Valores>({});
  const [busqueda, setBusqueda] = useState("");
  const [soloCargados, setSoloCargados] = useState(false);
  const [rechazos, setRechazos] = useState<Rechazo[]>([]);
  const [leyendo, setLeyendo] = useState(false);
  const [confirmar, setConfirmar] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [errorEnvio, setErrorEnvio] = useState<string | null>(null);

  const fijar = (clave: string, campo: "cantidad" | "costo", v: string) =>
    setValores((prev) => ({ ...prev, [clave]: { ...(prev[clave] ?? { cantidad: "", costo: "" }), [campo]: v } }));

  // Validación de cada fila con algo cargado
  const filas = useMemo(
    () =>
      items.map((it) => {
        const v = valores[it.clave];
        const cantidadTxt = v?.cantidad.trim() ?? "";
        const costoTxt = v?.costo.trim() ?? "";
        const cantidad = cantidadTxt ? parseEnteroUY(cantidadTxt) : null;
        const costo = costoTxt ? parseNumeroUY(costoTxt) : null;
        const tocado = !!cantidadTxt || !!costoTxt;
        let problema: string | null = null;
        if (tocado) {
          if (cantidad === null || cantidad <= 0) problema = "Cantidad entera mayor que 0";
          else if (costo === null || costo < 0) problema = "Falta el costo unitario";
        }
        return { it, cantidad, costo, tocado, problema, ok: tocado && !problema };
      }),
    [items, valores]
  );

  const listas = filas.filter((f) => f.ok);
  const conProblema = filas.filter((f) => f.problema);
  const unidades = listas.reduce((s, f) => s + (f.cantidad ?? 0), 0);
  const valorTotal = listas.reduce((s, f) => s + Math.round((f.cantidad ?? 0) * (f.costo ?? 0) * 100) / 100, 0);

  const visibles = useMemo(() => {
    const t = norm(busqueda);
    return filas.filter(
      (f) =>
        (!soloCargados || f.tocado) &&
        (!t || norm(`${f.it.producto} ${f.it.variante ?? ""} ${f.it.sku ?? ""}`).includes(t))
    );
  }, [filas, busqueda, soloCargados]);

  function descargarPlantilla() {
    const lineas = [
      ["sku", "producto", "variante", "cantidad", "costo"].join(","),
      ...items.map((i) => [csvCampo(i.sku), csvCampo(i.producto), csvCampo(i.variante), "", ""].join(",")),
    ];
    const blob = new Blob(["﻿" + lineas.join("\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "inventario-inicial.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  async function importar(file: File) {
    if (file.size > 5 * 1024 * 1024) {
      toast.error("El archivo supera 5 MB");
      return;
    }
    setLeyendo(true);
    try {
      const XLSX = await import("xlsx");
      const buffer = await file.arrayBuffer();
      // CSV: UTF-8 y como texto ("1.500" no es 1,5)
      const libro = file.name.toLowerCase().endsWith(".csv")
        ? XLSX.read(new TextDecoder("utf-8").decode(buffer).replace(/^\uFEFF/, ""), { type: "string", raw: true })
        : XLSX.read(buffer, { type: "array" });
      const hoja = libro.Sheets[libro.SheetNames[0] ?? ""];
      if (!hoja) throw new Error("El archivo no tiene hojas");
      const crudas = XLSX.utils.sheet_to_json<Record<string, unknown>>(hoja, { raw: true, defval: "" });
      if (crudas.length > 3000) throw new Error("Máximo 3000 filas");

      const porSku = new Map<string, ItemInventario>();
      const porNombre = new Map<string, ItemInventario>();
      for (const i of items) {
        if (i.sku) porSku.set(norm(i.sku), i);
        porNombre.set(`${norm(i.producto)}|${norm(i.variante ?? "")}`, i);
      }

      const nuevos: Valores = {};
      const malos: Rechazo[] = [];
      crudas.forEach((cruda, idx) => {
        const fila: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(cruda)) fila[normClave(k)] = v;
        const sku = norm(fila.sku);
        const producto = norm(fila.producto ?? fila.nombre);
        const variante = norm(fila.variante ?? fila.talle);
        const cantidad = fila.cantidad ?? fila.stock;
        const costo = fila.costo ?? fila.costo_unitario;
        const texto = [fila.sku, fila.producto ?? fila.nombre, fila.variante].filter((x) => String(x ?? "").trim()).join(" · ");
        if (!sku && !producto) return; // fila vacía
        if (String(cantidad ?? "").trim() === "" && String(costo ?? "").trim() === "") return; // sin datos para cargar

        const item = (sku && porSku.get(sku)) || porNombre.get(`${producto}|${variante}`);
        if (!item) {
          malos.push({ fila: idx + 2, texto, motivo: "No coincide con ningún ítem sin movimientos (revisá SKU o nombre y variante)" });
          return;
        }
        if (nuevos[item.clave]) {
          malos.push({ fila: idx + 2, texto, motivo: "Ítem repetido en el archivo: se usó la primera fila" });
          return;
        }
        const n = parseEnteroUY(cantidad);
        const c = parseNumeroUY(costo);
        if (n === null || n <= 0) {
          malos.push({ fila: idx + 2, texto, motivo: "Cantidad inválida (entero mayor que 0)" });
          return;
        }
        if (c === null || c < 0) {
          malos.push({ fila: idx + 2, texto, motivo: "Costo inválido" });
          return;
        }
        nuevos[item.clave] = { cantidad: String(n), costo: String(c).replace(".", ",") };
      });

      setValores((prev) => ({ ...prev, ...nuevos }));
      setRechazos(malos);
      const cargadas = Object.keys(nuevos).length;
      if (cargadas > 0) {
        setSoloCargados(true);
        toast.success(`${cargadas} ítem${cargadas === 1 ? "" : "s"} leído${cargadas === 1 ? "" : "s"} del archivo`);
      } else {
        toast.error("No se pudo leer ningún ítem del archivo");
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo leer el archivo");
    } finally {
      setLeyendo(false);
      if (archivo.current) archivo.current.value = "";
    }
  }

  async function cargar() {
    setEnviando(true);
    setErrorEnvio(null);
    try {
      const res = await fetch("/api/admin/stock/inventario-inicial", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items: listas.map((f) => ({
            producto_id: f.it.productoId,
            variante_id: f.it.varianteId,
            cantidad: f.cantidad,
            costo_unitario: f.costo,
          })),
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || "No se pudo cargar el inventario");
      toast.success(`Inventario inicial cargado: ${json.cargados} ítem${json.cargados === 1 ? "" : "s"}`);
      setConfirmar(false);
      setValores({});
      setRechazos([]);
      setSoloCargados(false);
      router.refresh();
    } catch (e) {
      const m = e instanceof Error ? e.message : "No se pudo cargar el inventario";
      setErrorEnvio(m);
      toast.error(m);
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="space-y-6 pb-28">
      <motion.div initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }} transition={easeSmooth}>
        <Link href="/admin/stock" className="group inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-4 transition-transform group-hover:-translate-x-0.5" />
          Stock
        </Link>
      </motion.div>

      <TituloReporte
        etiqueta="Stock"
        titulo="Inventario inicial"
        descripcion="Existencia de arranque con su costo, para los ítems que todavía no tienen movimientos."
      >
        {puedeOperar && items.length > 0 && (
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="lg" className="rounded-full" onClick={descargarPlantilla}>
              <Download className="size-4" />
              Plantilla
            </Button>
            <Button size="lg" className="rounded-full" onClick={() => archivo.current?.click()} disabled={leyendo}>
              {leyendo ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4" />}
              Importar Excel
            </Button>
            <input
              ref={archivo}
              type="file"
              accept=".xlsx,.xls,.csv"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void importar(f);
              }}
            />
          </div>
        )}
      </TituloReporte>

      <motion.div
        variants={fadeInUp}
        initial="hidden"
        animate="visible"
        transition={springSmooth}
        className="flex gap-3 rounded-2xl border border-sky-200 bg-sky-50/70 p-4 text-sm text-sky-950"
      >
        <Info className="mt-0.5 size-4 shrink-0 text-sky-700" />
        <div className="space-y-1 text-xs leading-relaxed">
          <p>
            Cada ítem entra al kardex como <strong>inventario inicial</strong> con la cantidad y el costo unitario que indiques. No genera
            asiento: el valor total va en la <strong>apertura contable</strong> (Mercadería contra Patrimonio), y hasta que esté ahí el
            control de stock vs. contabilidad va a mostrar esa diferencia.
          </p>
          <p>
            Se carga una sola vez por ítem: después el stock se mueve con compras, ventas y ajustes. El Excel puede tener las columnas{" "}
            <code className="rounded bg-white/70 px-1">sku</code>, <code className="rounded bg-white/70 px-1">producto</code>,{" "}
            <code className="rounded bg-white/70 px-1">variante</code>, <code className="rounded bg-white/70 px-1">cantidad</code> y{" "}
            <code className="rounded bg-white/70 px-1">costo</code> (se busca por SKU y, si no, por producto + variante).
          </p>
          {(conMovimientos > 0 || heredados > 0) && (
            <p className="text-sky-800/80">
              {conMovimientos > 0 && `${conMovimientos} ítem${conMovimientos === 1 ? " ya tiene" : "s ya tienen"} movimientos y no aparece${conMovimientos === 1 ? "" : "n"} acá. `}
              {heredados > 0 &&
                `${heredados} ítem${heredados === 1 ? "" : "s"} con stock anterior al motor de costos entra${heredados === 1 ? "" : "n"} solo${heredados === 1 ? "" : "s"} al último costo conocido; para corregirlo usá un ajuste.`}
            </p>
          )}
        </div>
      </motion.div>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700" role="alert">
          {error}
        </div>
      )}

      {!puedeOperar ? (
        <p className="rounded-xl border border-linea bg-white p-6 text-center text-sm text-muted-foreground">
          La carga de inventario la hacen tienda o tesorería.
        </p>
      ) : items.length === 0 ? (
        <motion.div
          initial={{ opacity: 0, scale: 0.97 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={springSmooth}
          className="rounded-2xl border border-linea bg-white py-16 text-center"
        >
          <CheckCircle2 className="mx-auto mb-3 size-12 text-emerald-500/60" />
          <p className="text-sm font-medium">No hay ítems pendientes</p>
          <p className="mt-1 text-xs text-muted-foreground">Todos los productos ya tienen movimientos de stock.</p>
        </motion.div>
      ) : (
        <>
          <AnimatePresence>
            {rechazos.length > 0 && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                className="overflow-hidden rounded-2xl border border-amber-200 bg-amber-50/70"
              >
                <div className="flex items-center justify-between px-4 pt-3">
                  <p className="text-sm font-heading text-amber-900">
                    {rechazos.length} fila{rechazos.length === 1 ? "" : "s"} del archivo sin cargar
                  </p>
                  <Button variant="ghost" size="icon-xs" onClick={() => setRechazos([])} aria-label="Cerrar">
                    <X className="size-3" />
                  </Button>
                </div>
                <ul className="max-h-40 space-y-0.5 overflow-y-auto px-4 pb-3 pt-1 text-[11px] text-amber-900/90">
                  {rechazos.map((r, i) => (
                    <li key={i}>
                      <span className="font-mono">Fila {r.fila}</span> {r.texto && `(${r.texto})`}: {r.motivo}
                    </li>
                  ))}
                </ul>
              </motion.div>
            )}
          </AnimatePresence>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input value={busqueda} onChange={(e) => setBusqueda(e.target.value)} placeholder="Buscar producto, variante o SKU…" className="pl-9" />
            </div>
            <div className="flex gap-1.5">
              {[
                { v: false, l: `Todos (${items.length})` },
                { v: true, l: `Cargados (${filas.filter((f) => f.tocado).length})` },
              ].map((o) => (
                <button
                  key={String(o.v)}
                  type="button"
                  onClick={() => setSoloCargados(o.v)}
                  className={cn(
                    "relative rounded-full px-3 py-1 text-xs font-medium transition-colors",
                    soloCargados === o.v ? "text-white" : "bg-superficie/60 text-muted-foreground hover:text-foreground"
                  )}
                >
                  {soloCargados === o.v && (
                    <motion.span layoutId="filtro-inventario" className="absolute inset-0 rounded-full bg-bordo-800" transition={springSmooth} />
                  )}
                  <span className="relative">{o.l}</span>
                </button>
              ))}
            </div>
          </div>

          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ ...easeSmooth, delay: 0.1 }}
            className="overflow-hidden rounded-2xl border border-linea bg-white"
          >
            <div className="hidden grid-cols-[minmax(0,1fr)_110px_140px_130px] gap-3 border-b border-linea bg-superficie/40 px-4 py-2.5 text-[11px] font-heading uppercase tracking-editorial text-muted-foreground sm:grid">
              <span>Ítem</span>
              <span className="text-right">Cantidad</span>
              <span className="text-right">Costo unitario</span>
              <span className="text-right">Subtotal</span>
            </div>
            {visibles.length === 0 ? (
              <p className="py-10 text-center text-sm text-muted-foreground">Ningún ítem coincide</p>
            ) : (
              <motion.ul variants={staggerContainer} initial="hidden" animate="visible" className="divide-y divide-linea/70">
                {visibles.map((f) => {
                  const v = valores[f.it.clave];
                  return (
                    <motion.li
                      key={f.it.clave}
                      variants={fadeInUp}
                      transition={springSmooth}
                      className={cn(
                        "grid grid-cols-2 items-center gap-x-3 gap-y-2 px-4 py-2.5 text-sm sm:grid-cols-[minmax(0,1fr)_110px_140px_130px]",
                        f.ok && "bg-emerald-50/40",
                        f.problema && "bg-red-50/50"
                      )}
                    >
                      <div className="col-span-2 min-w-0 sm:col-span-1">
                        <p className="truncate font-medium">
                          {f.it.producto}
                          {f.it.variante && <span className="text-muted-foreground"> — {f.it.variante}</span>}
                        </p>
                        <p className="text-[11px] text-muted-foreground">
                          {f.it.sku ? <span className="font-mono">{f.it.sku}</span> : "Sin SKU"}
                          {!f.it.activo && " · inactivo"}
                          {f.problema && <span className="text-red-600"> · {f.problema}</span>}
                        </p>
                      </div>
                      <Input
                        aria-label={`Cantidad de ${f.it.producto} ${f.it.variante ?? ""}`}
                        inputMode="numeric"
                        value={v?.cantidad ?? ""}
                        onChange={(e) => fijar(f.it.clave, "cantidad", e.target.value.replace(/[^\d]/g, ""))}
                        placeholder="Cant."
                        className="h-8 text-right tabular-nums"
                      />
                      <Input
                        aria-label={`Costo de ${f.it.producto} ${f.it.variante ?? ""}`}
                        inputMode="decimal"
                        value={v?.costo ?? ""}
                        onChange={(e) => fijar(f.it.clave, "costo", e.target.value)}
                        placeholder="$ c/u"
                        className="h-8 text-right tabular-nums"
                      />
                      <span className="col-span-2 text-right text-xs tabular-nums text-muted-foreground sm:col-span-1 sm:text-sm">
                        {f.ok ? `$ ${formatImporte((f.cantidad ?? 0) * (f.costo ?? 0))}` : "—"}
                      </span>
                    </motion.li>
                  );
                })}
              </motion.ul>
            )}
          </motion.div>

          {/* Barra de totales */}
          <AnimatePresence>
            {(listas.length > 0 || conProblema.length > 0) && (
              <motion.div
                initial={{ y: 80, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                exit={{ y: 80, opacity: 0 }}
                transition={springSmooth}
                className="fixed inset-x-3 bottom-3 z-30 mx-auto max-w-3xl rounded-2xl border border-linea bg-white/95 p-3 shadow-xl backdrop-blur sm:inset-x-6"
              >
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
                    <span className="flex items-center gap-1.5">
                      <ClipboardList className="size-4 text-bordo-700" />
                      <EnteroAnimado valor={listas.length} className="font-heading" /> ítems
                    </span>
                    <span>
                      <EnteroAnimado valor={unidades} className="font-heading" /> unidades
                    </span>
                    <span>
                      Valor <ImporteAnimado valor={valorTotal} moneda="UYU" className="font-heading text-bordo-800" />
                    </span>
                    {conProblema.length > 0 && (
                      <span className="text-xs text-red-600">{conProblema.length} con datos incompletos</span>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <Button variant="ghost" size="lg" className="rounded-full" onClick={() => setValores({})}>
                      Limpiar
                    </Button>
                    <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.97 }}>
                      <Button
                        size="lg"
                        className="rounded-full"
                        disabled={listas.length === 0 || conProblema.length > 0}
                        onClick={() => {
                          setErrorEnvio(null);
                          setConfirmar(true);
                        }}
                      >
                        <FileSpreadsheet className="size-4" />
                        Cargar inventario
                      </Button>
                    </motion.div>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </>
      )}

      <AlertDialog open={confirmar} onOpenChange={(o) => !enviando && setConfirmar(o)}>
        <AlertDialogContent className="data-[size=default]:max-w-[calc(100%-2rem)] data-[size=default]:sm:max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle className="font-heading text-lg text-bordo-950">Cargar inventario inicial</AlertDialogTitle>
            <AlertDialogDescription render={<div />} className="space-y-2 text-left">
              <p>
                Entran <strong>{unidades}</strong> unidades de <strong>{listas.length}</strong> ítem{listas.length === 1 ? "" : "s"} por un valor de{" "}
                <strong>$ {formatImporte(valorTotal)}</strong>.
              </p>
              <p className="text-xs">No se puede deshacer: después se corrige con ajustes. Se carga todo junto o nada.</p>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AnimatePresence>
            {errorEnvio && (
              <motion.div
                key={errorEnvio}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1, x: [0, -6, 6, -4, 4, 0] }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.4 }}
                className="rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-700"
                role="alert"
              >
                {errorEnvio}
              </motion.div>
            )}
          </AnimatePresence>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-full" disabled={enviando}>
              Cancelar
            </AlertDialogCancel>
            <Button onClick={cargar} disabled={enviando} className="rounded-full">
              {enviando && <Loader2 className="size-3.5 animate-spin" />}
              {enviando ? "Cargando…" : "Confirmar carga"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
