"use client";

import { useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowLeft, CheckCircle2, Loader2, Minus, Plus, Save, ScanLine, Search, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
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
import { costoPromedio } from "@/lib/comercial/stock";
import { easeSmooth, springSmooth } from "@/lib/motion";
import type { ItemVista, ProductoVista } from "./tipos";
import type { CabeceraRecuento } from "./recuento-detalle";

interface Opcion {
  item: ItemVista;
  etiqueta: string;
  busqueda: string;
}

const norm = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim();

/**
 * Recuento físico en borrador, pensado para el celular: se busca por SKU o
 * nombre, se carga lo contado y se va guardando. Antes de confirmar se ven
 * las diferencias contra el stock actual; al confirmar la base registra
 * faltantes y sobrantes contra el stock de ese momento.
 */
export function RecuentoEditor({
  recuento,
  guardados,
  productos,
  error,
}: {
  recuento: CabeceraRecuento | null;
  guardados: Record<string, number>;
  productos: ProductoVista[];
  error: string | null;
}) {
  const router = useRouter();
  const buscador = useRef<HTMLInputElement>(null);
  const entradas = useRef(new Map<string, HTMLInputElement>());

  const opciones = useMemo<Opcion[]>(
    () =>
      productos.flatMap((p) =>
        p.items.map((item) => {
          const etiqueta = p.tieneVariantes ? `${p.nombre} — ${item.nombre}` : p.nombre;
          return { item, etiqueta, busqueda: norm(`${etiqueta} ${item.sku ?? ""} ${p.sku ?? ""}`) };
        })
      ),
    [productos]
  );
  const porClave = useMemo(() => new Map(opciones.map((o) => [o.item.clave, o])), [opciones]);

  const [base, setBase] = useState<Record<string, number>>(guardados);
  const [valores, setValores] = useState<Record<string, string>>(() =>
    Object.fromEntries(Object.entries(guardados).map(([k, v]) => [k, String(v)]))
  );
  const [orden, setOrden] = useState<string[]>(() => Object.keys(guardados).filter((k) => porClave.has(k)));
  const [notas, setNotas] = useState(recuento?.notas ?? "");
  const [busqueda, setBusqueda] = useState("");
  const [soloDif, setSoloDif] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [dialogo, setDialogo] = useState<"confirmar" | "descartar" | null>(null);
  const [procesando, setProcesando] = useState(false);
  const [errorAccion, setErrorAccion] = useState<string | null>(null);
  const [guardadoAt, setGuardadoAt] = useState<number | null>(null);

  const resultados = useMemo(() => {
    const t = norm(busqueda);
    if (!t) return [];
    const partes = t.split(/\s+/);
    return opciones.filter((o) => partes.every((p) => o.busqueda.includes(p))).slice(0, 8);
  }, [busqueda, opciones]);

  const filas = orden
    .map((clave) => {
      const o = porClave.get(clave);
      if (!o) return null;
      const txt = valores[clave] ?? "";
      const contado = txt === "" ? null : Number(txt);
      const dif = contado === null ? null : contado - o.item.stock;
      const prom = costoPromedio(o.item.stock, o.item.valor);
      const guardado = clave in base;
      const sucio = contado !== null && (!guardado || base[clave] !== contado);
      return { clave, o, contado, dif, valor: dif !== null && prom !== null ? dif * prom : null, guardado, sucio };
    })
    .filter((f): f is NonNullable<typeof f> => f !== null);

  const cargadas = filas.filter((f) => f.contado !== null);
  const pendientesGuardar = filas.filter((f) => f.sucio);
  const notasSucias = (recuento?.notas ?? "") !== notas;
  const sucio = pendientesGuardar.length > 0 || (notasSucias && !!recuento);
  const faltantes = cargadas.filter((f) => (f.dif ?? 0) < 0);
  const sobrantes = cargadas.filter((f) => (f.dif ?? 0) > 0);
  const valorFaltante = faltantes.reduce((s, f) => s - (f.valor ?? 0), 0);
  const valorSobrante = sobrantes.reduce((s, f) => s + (f.valor ?? 0), 0);
  const visibles = soloDif ? filas.filter((f) => f.dif !== 0) : filas;

  function agregar(clave: string, sumarUno: boolean) {
    setOrden((o) => (o.includes(clave) ? o : [clave, ...o]));
    setValores((v) => {
      if (!sumarUno) return { ...v, [clave]: v[clave] ?? "" };
      const actual = Number(v[clave] || 0);
      return { ...v, [clave]: String(actual + 1) };
    });
    setBusqueda("");
    if (sumarUno) {
      buscador.current?.focus();
    } else {
      setTimeout(() => entradas.current.get(clave)?.focus(), 60);
    }
  }

  function alEnter() {
    const t = norm(busqueda);
    if (!t) return;
    // SKU exacto (lector de códigos o tipeo): suma uno y sigue en el buscador
    const exacta = opciones.find((o) => o.item.sku && norm(o.item.sku) === t);
    if (exacta) return agregar(exacta.item.clave, true);
    if (resultados.length === 1) return agregar(resultados[0].item.clave, false);
    if (resultados.length === 0) toast.error("No se encontró ese producto");
  }

  function cambiar(clave: string, txt: string) {
    setValores((v) => ({ ...v, [clave]: txt.replace(/[^\d]/g, "") }));
  }

  function sumar(clave: string, d: number) {
    setValores((v) => ({ ...v, [clave]: String(Math.max(0, Number(v[clave] || 0) + d)) }));
  }

  async function guardar(): Promise<number | null> {
    setGuardando(true);
    try {
      const res = await fetch("/api/admin/stock/recuentos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: recuento?.id ?? null,
          notas: notas.trim() || null,
          conteos: pendientesGuardar.map((f) => ({
            producto_id: f.o.item.productoId,
            variante_id: f.o.item.varianteId,
            contado: f.contado,
          })),
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || "No se pudo guardar el recuento");
      setBase((b) => ({ ...b, ...Object.fromEntries(pendientesGuardar.map((f) => [f.clave, f.contado as number])) }));
      // Aviso en la barra (un toast taparía los botones en el celular)
      setGuardadoAt(Date.now());
      if (!recuento) router.replace(`/admin/stock/recuentos/${json.id}`);
      else router.refresh();
      return json.id as number;
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo guardar el recuento");
      return null;
    } finally {
      setGuardando(false);
    }
  }

  async function confirmar() {
    setProcesando(true);
    setErrorAccion(null);
    try {
      const id = sucio || !recuento ? await guardar() : recuento.id;
      if (!id) throw new Error("Guardá el recuento antes de confirmarlo");
      const res = await fetch(`/api/admin/stock/recuentos/${id}/confirmar`, { method: "POST" });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || "No se pudo confirmar el recuento");
      toast.success(
        `Recuento confirmado · faltante $ ${formatImporte(json.faltante)} · sobrante $ ${formatImporte(json.sobrante)}`
      );
      setDialogo(null);
      router.replace(`/admin/stock/recuentos/${id}`);
      router.refresh();
    } catch (e) {
      const m = e instanceof Error ? e.message : "No se pudo confirmar el recuento";
      setErrorAccion(m);
      toast.error(m);
    } finally {
      setProcesando(false);
    }
  }

  async function descartar() {
    if (!recuento) return;
    setProcesando(true);
    setErrorAccion(null);
    try {
      const res = await fetch(`/api/admin/stock/recuentos/${recuento.id}/descartar`, { method: "POST" });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || "No se pudo descartar");
      toast.success("Recuento descartado");
      setDialogo(null);
      router.refresh();
    } catch (e) {
      const m = e instanceof Error ? e.message : "No se pudo descartar";
      setErrorAccion(m);
      toast.error(m);
    } finally {
      setProcesando(false);
    }
  }

  return (
    <div className="space-y-5 pb-40">
      <motion.div initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }} transition={easeSmooth}>
        <Link href="/admin/stock/recuentos" className="group inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-4 transition-transform group-hover:-translate-x-0.5" />
          Recuentos
        </Link>
      </motion.div>

      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={easeSmooth}>
        <div className="text-[11px] uppercase tracking-editorial text-bordo-700 font-heading">Recuento físico · borrador</div>
        <h1 className="font-display text-2xl uppercase tracking-tightest sm:text-3xl">{recuento?.numero ?? "Nuevo recuento"}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Contá lo que hay y cargalo acá. Solo cambian los productos que cuentes; lo demás queda igual.
          {recuento?.creadoPor && ` Empezado por ${recuento.creadoPor}.`}
        </p>
      </motion.div>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700" role="alert">
          {error}
        </div>
      )}

      {/* Buscador fijo arriba */}
      <div className="sticky top-14 z-20 -mx-4 bg-background/95 px-4 py-2 backdrop-blur sm:top-2 sm:mx-0 sm:rounded-2xl sm:px-0">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            ref={buscador}
            autoFocus
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                alEnter();
              }
            }}
            placeholder="Buscar por SKU o nombre"
            className="h-11 pl-9 pr-9 text-base"
            aria-label="Buscar producto para contar"
            enterKeyHint="search"
          />
          {busqueda && (
            <button
              type="button"
              aria-label="Limpiar búsqueda"
              onClick={() => setBusqueda("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full p-1 text-muted-foreground hover:bg-superficie"
            >
              <X className="size-4" />
            </button>
          )}
        </div>
        {!busqueda && (
          <p className="mt-1 text-[11px] text-muted-foreground">Enter con un SKU exacto (o un lector de códigos) suma una unidad.</p>
        )}
        <AnimatePresence>
          {resultados.length > 0 && (
            <motion.ul
              initial={{ opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.15 }}
              className="mt-1 max-h-72 overflow-y-auto rounded-xl border border-linea bg-white shadow-lg"
            >
              {resultados.map((o) => (
                <li key={o.item.clave}>
                  <button
                    type="button"
                    onClick={() => agregar(o.item.clave, false)}
                    className="flex w-full items-center justify-between gap-2 border-b border-linea/60 px-3 py-3 text-left text-sm last:border-0 hover:bg-superficie/60"
                  >
                    <span className="min-w-0">
                      <span className="block truncate">{o.etiqueta}</span>
                      {o.item.sku && <span className="font-mono text-[11px] text-muted-foreground">{o.item.sku}</span>}
                    </span>
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {orden.includes(o.item.clave) ? "Ya en la lista" : `Sistema ${o.item.stock}`}
                    </span>
                  </button>
                </li>
              ))}
            </motion.ul>
          )}
        </AnimatePresence>
      </div>

      {/* Lista de lo contado */}
      {filas.length === 0 ? (
        <motion.div
          initial={{ opacity: 0, scale: 0.98 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={springSmooth}
          className="rounded-2xl border border-dashed border-linea bg-white py-14 text-center text-muted-foreground"
        >
          <ScanLine className="mx-auto mb-3 size-10 opacity-30" />
          <p className="text-sm">Buscá un producto para empezar a contar</p>
          <p className="mt-1 text-xs">Con un lector de códigos, cada lectura del SKU suma una unidad.</p>
        </motion.div>
      ) : (
        <>
          <div className="flex items-center justify-between gap-2 text-xs">
            <span className="text-muted-foreground">
              {cargadas.length} de {filas.length} cargado{filas.length === 1 ? "" : "s"}
            </span>
            <button
              type="button"
              onClick={() => setSoloDif((v) => !v)}
              className={cn(
                "rounded-full border px-2.5 py-1 transition-colors",
                soloDif ? "border-bordo-300 bg-bordo-50 text-bordo-800" : "border-linea text-muted-foreground"
              )}
            >
              Solo con diferencia
            </button>
          </div>
          <ul className="space-y-2">
            <AnimatePresence initial={false}>
              {visibles.map((f) => (
                <motion.li
                  key={f.clave}
                  layout
                  initial={{ opacity: 0, y: -8, backgroundColor: "rgba(247,182,67,0.18)" }}
                  animate={{ opacity: 1, y: 0, backgroundColor: "rgba(255,255,255,1)" }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={springSmooth}
                  className="rounded-2xl border border-linea p-3"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{f.o.etiqueta}</p>
                      <p className="text-[11px] text-muted-foreground">
                        {f.o.item.sku && <span className="font-mono">{f.o.item.sku} · </span>}
                        Sistema {f.o.item.stock}
                        {f.o.item.reservado > 0 && ` (${f.o.item.reservado} reservadas, siguen en el local)`}
                        {f.sucio && <span className="text-amber-600"> · sin guardar</span>}
                      </p>
                    </div>
                    {!f.guardado && (
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label={`Quitar ${f.o.etiqueta}`}
                        onClick={() => {
                          setOrden((o) => o.filter((k) => k !== f.clave));
                          setValores((v) => {
                            const n = { ...v };
                            delete n[f.clave];
                            return n;
                          });
                        }}
                      >
                        <Trash2 className="size-3.5" />
                      </Button>
                    )}
                  </div>
                  <div className="mt-2 flex items-center gap-2">
                    <Button variant="outline" size="icon-lg" aria-label="Restar uno" onClick={() => sumar(f.clave, -1)}>
                      <Minus className="size-4" />
                    </Button>
                    <Input
                      ref={(el) => {
                        if (el) entradas.current.set(f.clave, el);
                        else entradas.current.delete(f.clave);
                      }}
                      aria-label={`Contado de ${f.o.etiqueta}`}
                      inputMode="numeric"
                      enterKeyHint="done"
                      value={valores[f.clave] ?? ""}
                      onChange={(e) => cambiar(f.clave, e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          buscador.current?.focus();
                        }
                      }}
                      placeholder="Contado"
                      className="h-9 w-24 text-center text-base tabular-nums"
                    />
                    <Button variant="outline" size="icon-lg" aria-label="Sumar uno" onClick={() => sumar(f.clave, 1)}>
                      <Plus className="size-4" />
                    </Button>
                    <div className="ml-auto text-right">
                      <AnimatePresence mode="wait" initial={false}>
                        <motion.span
                          key={f.dif ?? "x"}
                          initial={{ opacity: 0, y: 4 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: -4 }}
                          transition={{ duration: 0.12 }}
                          className={cn(
                            "block font-heading tabular-nums",
                            f.dif === null
                              ? "text-muted-foreground"
                              : f.dif < 0
                                ? "text-red-600"
                                : f.dif > 0
                                  ? "text-emerald-700"
                                  : "text-muted-foreground"
                          )}
                        >
                          {f.dif === null ? "—" : f.dif === 0 ? "OK" : `${f.dif > 0 ? "+" : ""}${f.dif}`}
                        </motion.span>
                      </AnimatePresence>
                      {f.dif !== null && f.dif !== 0 && (
                        <span className="text-[10px] text-muted-foreground">
                          {f.valor !== null ? `≈ $ ${formatImporte(Math.abs(f.valor))}` : "a último costo"}
                        </span>
                      )}
                    </div>
                  </div>
                </motion.li>
              ))}
            </AnimatePresence>
          </ul>
          {filas.some((f) => f.guardado) && (
            <p className="text-[11px] text-muted-foreground">
              Lo ya guardado no se puede sacar del borrador: corregí la cantidad o descartá el recuento.
            </p>
          )}
        </>
      )}

      <div>
        <label htmlFor="recuento-notas" className="text-xs font-medium">
          Notas
        </label>
        <Textarea
          id="recuento-notas"
          value={notas}
          onChange={(e) => setNotas(e.target.value)}
          rows={2}
          placeholder="Qué se contó, quiénes participaron…"
          className="mt-1"
        />
      </div>

      {/* Barra de acciones */}
      <motion.div
        initial={{ y: 80, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={springSmooth}
        className="fixed inset-x-3 bottom-3 z-30 mx-auto max-w-3xl rounded-2xl border border-linea bg-white/95 p-3 shadow-xl backdrop-blur sm:inset-x-6"
      >
        <AnimatePresence>
          {(sucio || guardadoAt) && (
            <motion.p
              key={sucio ? "sucio" : `ok-${guardadoAt}`}
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className={cn("mb-1 text-center text-[11px]", sucio ? "text-amber-600" : "text-emerald-700")}
              role="status"
            >
              {sucio
                ? pendientesGuardar.length ? `${pendientesGuardar.length} cambio${pendientesGuardar.length === 1 ? "" : "s"} sin guardar` : "Notas sin guardar"
                : `Borrador guardado · ${cargadas.length} ítem${cargadas.length === 1 ? "" : "s"}`}
            </motion.p>
          )}
        </AnimatePresence>
        <div className="mb-2 grid grid-cols-3 gap-2 text-center text-[11px]">
          <div>
            <div className="text-muted-foreground">Contados</div>
            <div className="font-heading text-base tabular-nums">{cargadas.length}</div>
          </div>
          <div>
            <div className="text-muted-foreground">Faltante</div>
            <div className="font-heading text-base tabular-nums text-red-600">
              {faltantes.reduce((s, f) => s - (f.dif ?? 0), 0)} u.
            </div>
            <div className="tabular-nums text-muted-foreground">≈ $ {formatImporte(valorFaltante)}</div>
          </div>
          <div>
            <div className="text-muted-foreground">Sobrante</div>
            <div className="font-heading text-base tabular-nums text-emerald-700">
              {sobrantes.reduce((s, f) => s + (f.dif ?? 0), 0)} u.
            </div>
            <div className="tabular-nums text-muted-foreground">≈ $ {formatImporte(valorSobrante)}</div>
          </div>
        </div>
        <div className="flex gap-2">
          {recuento && (
            <Button
              variant="ghost"
              className="rounded-full text-red-600 hover:text-red-700"
              onClick={() => {
                setErrorAccion(null);
                setDialogo("descartar");
              }}
            >
              Descartar
            </Button>
          )}
          <Button
            variant="outline"
            className="ml-auto rounded-full"
            disabled={guardando || (!sucio && !!recuento) || (!recuento && cargadas.length === 0)}
            onClick={() => void guardar()}
          >
            {guardando ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
            Guardar
          </Button>
          <Button
            className="rounded-full"
            disabled={cargadas.length === 0 || guardando}
            onClick={() => {
              setErrorAccion(null);
              setDialogo("confirmar");
            }}
          >
            <CheckCircle2 className="size-4" />
            Confirmar
          </Button>
        </div>
      </motion.div>

      <AlertDialog open={dialogo !== null} onOpenChange={(o) => !procesando && !o && setDialogo(null)}>
        <AlertDialogContent className="data-[size=default]:max-w-[calc(100%-2rem)] data-[size=default]:sm:max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle className="font-heading text-lg text-bordo-950">
              {dialogo === "descartar" ? "Descartar el recuento" : "Confirmar el recuento"}
            </AlertDialogTitle>
            <AlertDialogDescription render={<div />} className="space-y-2 text-left">
              {dialogo === "descartar" ? (
                <p>El borrador queda descartado y el stock no cambia.</p>
              ) : (
                <>
                  <p>
                    Se comparan los <strong>{cargadas.length}</strong> productos contados con el stock de este momento y se
                    registran las diferencias en el kardex, con un asiento.
                  </p>
                  <ul className="space-y-0.5 text-xs">
                    <li>
                      Faltantes: {faltantes.length} producto{faltantes.length === 1 ? "" : "s"} · ≈ $ {formatImporte(valorFaltante)}
                    </li>
                    <li>
                      Sobrantes: {sobrantes.length} producto{sobrantes.length === 1 ? "" : "s"} · ≈ $ {formatImporte(valorSobrante)}
                    </li>
                  </ul>
                  <p className="text-xs">
                    Si se vendió algo mientras contabas, revisalo antes: la diferencia se calcula con el stock al confirmar. No se
                    puede deshacer.
                  </p>
                  {sucio && <p className="text-xs text-amber-700">Se guardan primero los cambios sin guardar.</p>}
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AnimatePresence>
            {errorAccion && (
              <motion.div
                key={errorAccion}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1, x: [0, -6, 6, -4, 4, 0] }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.4 }}
                className="rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-700"
                role="alert"
              >
                {errorAccion}
              </motion.div>
            )}
          </AnimatePresence>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-full" disabled={procesando}>
              Volver
            </AlertDialogCancel>
            <Button
              onClick={dialogo === "descartar" ? descartar : confirmar}
              disabled={procesando}
              className={cn("rounded-full", dialogo === "descartar" && "bg-red-600 text-white hover:bg-red-700")}
            >
              {procesando && <Loader2 className="size-3.5 animate-spin" />}
              {dialogo === "descartar" ? "Descartar" : "Confirmar recuento"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
