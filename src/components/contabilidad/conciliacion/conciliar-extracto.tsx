"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { toast } from "sonner";
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  BookPlus,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Landmark,
  Link2,
  Loader2,
  Lock,
  RotateCcw,
  Search,
  Sparkles,
  Trash2,
  Unlink,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { formatFecha, formatImporte } from "@/lib/contabilidad/formato";
import { easeSmooth, fadeInUp, springBouncy, staggerContainerFast } from "@/lib/motion";
import { aCentavos } from "@/lib/contabilidad/parsear-itau";
import type {
  DetalleExtracto,
  GrupoConciliado,
  LineaLibros,
  MovimientoBanco,
  ResumenConciliacion,
} from "@/lib/contabilidad/conciliacion";
import type { CatalogosAsiento } from "@/lib/contabilidad/asientos";
import { EncabezadoPagina, ImporteAnimado } from "@/components/contabilidad/asientos/ui-asiento";
import { BotonAnimado } from "@/components/contabilidad/ejercicios/boton-animado";
import { ConfirmarDialog } from "@/components/contabilidad/ejercicios/confirmar-dialog";
import {
  cerrarExtracto,
  conciliar,
  desconciliar,
  eliminarExtracto,
  reabrirExtracto,
} from "@/app/(dashboard)/contabilidad/conciliacion/actions";
import { BadgeExtracto, BarraAvance, ImporteSigno } from "./ui-conciliacion";
import { Marca } from "./marca";
import { RegistrarDialog } from "./registrar-dialog";
import { SugerenciasDialog } from "./sugerencias-dialog";

type Accion = "cerrar" | "reabrir" | "eliminar";

function normalizar(s: string) {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
}

/** Busca por texto o por importe ("1500", "1.500", "1500,50"). */
function coincide(busqueda: string, textos: (string | null)[], importe: number): boolean {
  const q = normalizar(busqueda.trim());
  if (!q) return true;
  const comoNumero = q.replace(/\./g, "").replace(",", ".");
  if (/^-?\d+(\.\d+)?$/.test(comoNumero) && String(Math.abs(importe)).startsWith(comoNumero.replace(/^-/, ""))) {
    return true;
  }
  const texto = normalizar(textos.filter(Boolean).join(" "));
  return q.split(/\s+/).every((p) => texto.includes(p));
}

function plural(n: number, uno: string, varios: string) {
  return `${n} ${n === 1 ? uno : varios}`;
}

export function ConciliarExtracto({
  detalle,
  puedeEscribir,
  catalogos,
  error,
}: {
  detalle: DetalleExtracto;
  puedeEscribir: boolean;
  catalogos: CatalogosAsiento | null;
  error: string | null;
}) {
  const router = useRouter();
  const { extracto, cuenta, resumen } = detalle;
  const editable = puedeEscribir && extracto.estado === "abierto";
  const moneda = cuenta.moneda;
  const simbolo = moneda === "USD" ? "USD" : "UYU";

  const [selMov, setSelMov] = useState<Set<number>>(new Set());
  const [selLin, setSelLin] = useState<Set<number>>(new Set());
  const [pestana, setPestana] = useState<"banco" | "libros">("banco");
  const [buscarBanco, setBuscarBanco] = useState("");
  const [buscarLibros, setBuscarLibros] = useState("");
  const [registrar, setRegistrar] = useState<MovimientoBanco | null>(null);
  const [verSugerencias, setVerSugerencias] = useState(false);
  const [accion, setAccion] = useState<Accion | null>(null);
  const [aDesconciliar, setADesconciliar] = useState<GrupoConciliado | null>(null);
  const [pendiente, startTransition] = useTransition();
  const [errorConciliar, setErrorConciliar] = useState<string | null>(null);

  const movPorId = useMemo(() => new Map(detalle.pendientesBanco.map((m) => [m.id, m])), [detalle.pendientesBanco]);
  const linPorId = useMemo(() => new Map(detalle.pendientesLibros.map((l) => [l.id, l])), [detalle.pendientesLibros]);

  // La selección solo cuenta lo que sigue pendiente (después de cada refresco).
  const movsElegidos = [...selMov].map((id) => movPorId.get(id)).filter((m): m is MovimientoBanco => !!m);
  const linsElegidas = [...selLin].map((id) => linPorId.get(id)).filter((l): l is LineaLibros => !!l);
  const centBanco = movsElegidos.reduce((s, m) => s + aCentavos(m.importe), 0);
  const centLibros = linsElegidas.reduce((s, l) => s + aCentavos(l.importe), 0);
  const haySeleccion = movsElegidos.length + linsElegidas.length > 0;
  const cuadra = haySeleccion && centBanco === centLibros;

  const bancoVisible = detalle.pendientesBanco.filter((m) =>
    coincide(buscarBanco, [m.concepto, m.referencia, formatFecha(m.fecha)], m.importe)
  );
  const librosVisible = detalle.pendientesLibros.filter((l) =>
    coincide(buscarLibros, [l.descripcion, l.detalle, l.numero ? String(l.numero) : null, formatFecha(l.fecha)], l.importe)
  );

  // Asientos ya generados desde un movimiento (quedan pendientes si se desconcilió).
  const registradoPorMov = useMemo(() => {
    const m = new Map<number, LineaLibros>();
    for (const l of detalle.pendientesLibros) {
      if (l.origenTipo === "extracto" && l.origenId) m.set(Number(l.origenId), l);
    }
    return m;
  }, [detalle.pendientesLibros]);

  const totalMovs = detalle.movimientos.length;
  const conciliadosMovs = totalMovs - detalle.pendientesBanco.length;

  function alternar(conjunto: "mov" | "lin", id: number) {
    const set = conjunto === "mov" ? setSelMov : setSelLin;
    set((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
    setErrorConciliar(null);
  }

  function limpiar() {
    setSelMov(new Set());
    setSelLin(new Set());
    setErrorConciliar(null);
  }

  function hacerConciliacion(movs = movsElegidos.map((m) => m.id), lins = linsElegidas.map((l) => l.id)) {
    setErrorConciliar(null);
    startTransition(async () => {
      const r = await conciliar({ extractoId: extracto.id, movimientos: movs, lineas: lins });
      if (r.ok) {
        toast.success(
          `Conciliado: ${plural(movs.length, "movimiento", "movimientos")} con ${plural(lins.length, "línea", "líneas")}`
        );
        setSelMov((s) => new Set([...s].filter((id) => !movs.includes(id))));
        setSelLin((s) => new Set([...s].filter((id) => !lins.includes(id))));
      } else {
        setErrorConciliar(r.error);
        toast.error(r.error);
      }
    });
  }

  // Cierre: en orden y sin movimientos del banco pendientes.
  const motivoNoCierra =
    detalle.pendientesBanco.length > 0
      ? `Faltan ${plural(detalle.pendientesBanco.length, "movimiento", "movimientos")} del banco por conciliar`
      : detalle.anterior?.estado === "abierto"
        ? "Cerrá primero el extracto anterior"
        : null;
  const puedeReabrir = extracto.estado === "cerrado" && detalle.siguiente?.estado !== "cerrado";
  const puedeEliminar = extracto.estado === "abierto" && detalle.esUltimo;

  return (
    <div className="space-y-5 pb-8">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Link
          href={`/contabilidad/conciliacion?cuenta=${cuenta.id}`}
          className="inline-flex items-center gap-1.5 text-xs text-muted-foreground transition-colors hover:text-bordo-800"
        >
          <ArrowLeft className="size-3.5" />
          Extractos de {cuenta.nombre}
        </Link>
        <div className="flex items-center gap-1">
          <NavExtracto id={detalle.anterior?.id} texto="Anterior" atras />
          <NavExtracto id={detalle.siguiente?.id} texto="Siguiente" />
        </div>
      </div>

      <EncabezadoPagina
        eyebrow={`${cuenta.codigo} · ${cuenta.nombre}${moneda ? ` · ${moneda}` : ""}`}
        titulo={
          <span className="tabular-nums">
            {formatFecha(extracto.fechaDesde)} – {formatFecha(extracto.fechaHasta)}
          </span>
        }
        descripcion={
          <span className="inline-flex flex-wrap items-center gap-2">
            <BadgeExtracto estado={extracto.estado} />
            <span>{extracto.archivo ?? "Carga manual"}</span>
            <span>·</span>
            <span>
              {conciliadosMovs}/{totalMovs} movimientos conciliados
            </span>
          </span>
        }
      >
        {puedeEscribir && extracto.estado === "abierto" && (
          <span title={motivoNoCierra ?? undefined} className="inline-flex">
            <BotonAnimado
              onClick={() => setAccion("cerrar")}
              disabled={!!motivoNoCierra}
              className="bg-bordo-800 text-white hover:bg-bordo-900"
            >
              <Lock className="size-3.5" />
              Cerrar extracto
            </BotonAnimado>
          </span>
        )}
        {puedeEscribir && puedeReabrir && (
          <BotonAnimado variant="outline" onClick={() => setAccion("reabrir")}>
            <RotateCcw className="size-3.5" />
            Reabrir
          </BotonAnimado>
        )}
        {puedeEscribir && puedeEliminar && (
          <BotonAnimado
            variant="outline"
            onClick={() => setAccion("eliminar")}
            className="text-rose-700 hover:border-rose-200 hover:bg-rose-50 hover:text-rose-800"
          >
            <Trash2 className="size-3.5" />
            Eliminar
          </BotonAnimado>
        )}
      </EncabezadoPagina>

      {error && (
        <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">
          {error}
        </div>
      )}

      <AnimatePresence>
        {puedeEscribir && extracto.estado === "abierto" && motivoNoCierra && detalle.pendientesBanco.length === 0 && (
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="text-xs text-amber-800"
          >
            {motivoNoCierra}.
          </motion.p>
        )}
      </AnimatePresence>

      {resumen && <PanelResumen resumen={resumen} moneda={simbolo} avance={totalMovs ? conciliadosMovs / totalMovs : 1} />}

      {!editable && (
        <div className="flex items-center gap-2 rounded-xl border border-linea bg-superficie/50 px-3 py-2 text-xs text-muted-foreground">
          <Lock className="size-3.5 shrink-0" />
          {extracto.estado === "cerrado"
            ? "Extracto cerrado: la conciliación queda fija. Reabrilo para cambiarla."
            : "Solo lectura."}
        </div>
      )}

      {/* Pendientes */}
      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-heading text-base text-foreground">Sin conciliar</h2>
          {editable && detalle.sugerencias.length > 0 && (
            <motion.button
              type="button"
              onClick={() => setVerSugerencias(true)}
              whileHover={{ scale: 1.03, y: -1 }}
              whileTap={{ scale: 0.97 }}
              transition={springBouncy}
              className="inline-flex h-9 items-center gap-1.5 rounded-full border border-dorado-300 bg-dorado-50 px-3.5 text-sm font-medium text-dorado-900 shadow-sm transition-colors hover:bg-dorado-100"
            >
              <Sparkles className="size-4 text-dorado-600" />
              Aplicar sugerencias
              <span className="rounded-full bg-dorado-300 px-1.5 text-xs tabular-nums text-dorado-900">
                {detalle.sugerencias.length}
              </span>
            </motion.button>
          )}
        </div>

        {/* Pestañas en mobile */}
        <div className="grid grid-cols-2 rounded-full border border-linea bg-white p-1 lg:hidden">
          {(
            [
              ["banco", "Banco", detalle.pendientesBanco.length, movsElegidos.length],
              ["libros", "Libros", detalle.pendientesLibros.length, linsElegidas.length],
            ] as const
          ).map(([id, texto, n, sel]) => (
            <button
              key={id}
              type="button"
              onClick={() => setPestana(id)}
              className={cn(
                "relative inline-flex h-8 items-center justify-center gap-1.5 rounded-full text-xs font-medium transition-colors",
                pestana === id ? "text-white" : "text-muted-foreground"
              )}
            >
              {pestana === id && (
                <motion.span layoutId="pestana-conciliacion" className="absolute inset-0 rounded-full bg-bordo-800" transition={springBouncy} />
              )}
              <span className="relative">
                {texto} ({n})
              </span>
              {sel > 0 && (
                <span className="relative rounded-full bg-dorado-300 px-1.5 text-[10px] text-dorado-900">{sel}</span>
              )}
            </button>
          ))}
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <Columna
            visible={pestana === "banco"}
            icono={<Landmark className="size-4" />}
            titulo="Movimientos del banco"
            cantidad={detalle.pendientesBanco.length}
            total={detalle.pendientesBanco.reduce((s, m) => s + aCentavos(m.importe), 0) / 100}
            moneda={moneda}
            busqueda={buscarBanco}
            onBuscar={setBuscarBanco}
            vacio={
              detalle.pendientesBanco.length === 0
                ? "Todos los movimientos del banco están conciliados."
                : "Nada coincide con la búsqueda."
            }
            hayFilas={bancoVisible.length > 0}
          >
            {bancoVisible.map((m) => (
              <FilaBanco
                key={m.id}
                mov={m}
                moneda={moneda}
                elegida={selMov.has(m.id)}
                editable={editable}
                puedeRegistrar={editable && !!catalogos}
                registrada={registradoPorMov.get(m.id) ?? null}
                ocupado={pendiente}
                onAlternar={() => alternar("mov", m.id)}
                onRegistrar={() => setRegistrar(m)}
                onConciliarRegistrada={(l) => hacerConciliacion([m.id], [l.id])}
              />
            ))}
          </Columna>
          <Columna
            visible={pestana === "libros"}
            icono={<BookOpen className="size-4" />}
            titulo="Líneas de los libros"
            subtitulo={`Hasta el ${formatFecha(extracto.fechaHasta)}`}
            cantidad={detalle.pendientesLibros.length}
            total={detalle.pendientesLibros.reduce((s, l) => s + aCentavos(l.importe), 0) / 100}
            moneda={moneda}
            busqueda={buscarLibros}
            onBuscar={setBuscarLibros}
            vacio={
              detalle.pendientesLibros.length === 0
                ? "No hay líneas de los libros pendientes en esta cuenta."
                : "Nada coincide con la búsqueda."
            }
            hayFilas={librosVisible.length > 0}
          >
            {librosVisible.map((l) => (
              <FilaLibro
                key={l.id}
                linea={l}
                moneda={moneda}
                anterior={l.fecha < extracto.fechaDesde}
                elegida={selLin.has(l.id)}
                editable={editable}
                onAlternar={() => alternar("lin", l.id)}
              />
            ))}
          </Columna>
        </div>

      {/* Barra de selección */}
        <AnimatePresence>
          {editable && haySeleccion && (
            <motion.div
              key="barra"
              initial={{ opacity: 0, y: 40 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 40 }}
              transition={springBouncy}
              className="sticky bottom-3 z-30 mx-auto max-w-3xl"
            >
              <div
                className={cn(
                  "rounded-2xl border bg-white/95 p-3 shadow-xl backdrop-blur",
                  cuadra ? "border-emerald-300" : "border-linea"
                )}
              >
                <div className="grid grid-cols-3 gap-2 text-center sm:text-left">
                  <TotalSeleccion etiqueta={`Banco (${movsElegidos.length})`} valor={centBanco / 100} moneda={simbolo} />
                  <TotalSeleccion etiqueta={`Libros (${linsElegidas.length})`} valor={centLibros / 100} moneda={simbolo} />
                  <TotalSeleccion
                    etiqueta="Diferencia"
                    valor={(centBanco - centLibros) / 100}
                    moneda={simbolo}
                    className={cuadra ? "text-emerald-700" : "text-rose-700"}
                  />
                </div>
                <AnimatePresence>
                  {errorConciliar && (
                    <motion.p
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: "auto" }}
                      exit={{ opacity: 0, height: 0 }}
                      role="alert"
                      className="mt-2 overflow-hidden text-xs text-rose-700"
                    >
                      {errorConciliar}
                    </motion.p>
                  )}
                </AnimatePresence>
                <div className="mt-2 flex items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={limpiar}
                    className="inline-flex h-9 items-center gap-1 rounded-full px-3 text-xs text-muted-foreground transition-colors hover:bg-superficie hover:text-foreground"
                  >
                    <X className="size-3.5" />
                    Limpiar
                  </button>
                  <motion.span
                    className="inline-flex"
                    whileHover={cuadra ? { scale: 1.03 } : undefined}
                    whileTap={cuadra ? { scale: 0.96 } : undefined}
                    animate={cuadra ? { scale: [1, 1.06, 1] } : { scale: 1 }}
                    transition={{ duration: 0.35, ease: "easeOut" }}
                  >
                    <button
                      type="button"
                      onClick={() => cuadra && hacerConciliacion()}
                      disabled={!cuadra || pendiente}
                      className="inline-flex h-9 items-center gap-1.5 rounded-full bg-bordo-800 px-4 text-sm font-medium text-white transition-colors hover:bg-bordo-900 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      {pendiente ? <Loader2 className="size-4 animate-spin" /> : <Link2 className="size-4" />}
                      Conciliar
                    </button>
                  </motion.span>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </section>

      {/* Conciliados */}
      <SeccionConciliados
        grupos={detalle.conciliados}
        moneda={moneda}
        editable={editable}
        onDesconciliar={setADesconciliar}
      />

      {/* Diálogos */}
      {catalogos && (
        <RegistrarDialog
          movimiento={registrar}
          onOpenChange={(o) => !o && setRegistrar(null)}
          cuentaBanco={cuenta}
          catalogos={catalogos}
        />
      )}
      {editable && (
        <SugerenciasDialog
          open={verSugerencias}
          onOpenChange={setVerSugerencias}
          extractoId={extracto.id}
          sugerencias={detalle.sugerencias}
          movimientos={movPorId}
          lineas={linPorId}
          moneda={moneda}
        />
      )}

      <ConfirmarDialog
        open={accion === "cerrar"}
        onOpenChange={(o) => !o && setAccion(null)}
        titulo="Cerrar el extracto"
        textoAccion="Cerrar extracto"
        textoPendiente="Cerrando…"
        mensajeExito="Extracto cerrado"
        aviso={
          resumen && aCentavos(resumen.diferencia) !== 0
            ? `La conciliación tiene una diferencia sin explicar de ${formatImporte(resumen.diferencia, simbolo)}.`
            : undefined
        }
        accion={() => cerrarExtracto(extracto.id)}
      >
        <p>
          El extracto del {formatFecha(extracto.fechaDesde)} al {formatFecha(extracto.fechaHasta)} queda conciliado y no
          se puede cambiar hasta reabrirlo.
        </p>
        {resumen && resumen.cantidadPendientes > 0 && (
          <p>
            Quedan {plural(resumen.cantidadPendientes, "partida pendiente", "partidas pendientes")} de los libros (
            {formatImporte(resumen.pendientes, simbolo)}): pasan al extracto siguiente.
          </p>
        )}
      </ConfirmarDialog>

      <ConfirmarDialog
        open={accion === "reabrir"}
        onOpenChange={(o) => !o && setAccion(null)}
        titulo="Reabrir el extracto"
        textoAccion="Reabrir"
        textoPendiente="Reabriendo…"
        mensajeExito="Extracto reabierto"
        accion={() => reabrirExtracto(extracto.id)}
      >
        <p>Vas a poder conciliar y desconciliar de nuevo. Los extractos se reabren del más nuevo al más viejo.</p>
      </ConfirmarDialog>

      <ConfirmarDialog
        open={accion === "eliminar"}
        onOpenChange={(o) => !o && setAccion(null)}
        titulo="Eliminar el extracto"
        textoAccion="Eliminar"
        textoPendiente="Eliminando…"
        mensajeExito="Extracto eliminado"
        destructivo
        aviso={
          detalle.conciliados.some((g) => g.registradoDesdeExtracto)
            ? "Los asientos registrados desde este extracto quedan en los libros como partidas pendientes. Si no corresponden, revertilos desde el libro diario."
            : undefined
        }
        accion={async () => {
          const r = await eliminarExtracto(extracto.id);
          if (r.ok) router.push(`/contabilidad/conciliacion?cuenta=${cuenta.id}`);
          return r;
        }}
      >
        <p>
          Se borran sus {plural(totalMovs, "movimiento", "movimientos")} y{" "}
          {plural(detalle.conciliados.length, "conciliación", "conciliaciones")}. Después lo podés importar de nuevo.
        </p>
      </ConfirmarDialog>

      <ConfirmarDialog
        open={!!aDesconciliar}
        onOpenChange={(o) => !o && setADesconciliar(null)}
        titulo="Desconciliar"
        textoAccion="Desconciliar"
        textoPendiente="Desconciliando…"
        mensajeExito="Desconciliado"
        aviso={
          aDesconciliar?.registradoDesdeExtracto
            ? "El asiento registrado desde el extracto queda en los libros. Si no corresponde, revertilo desde el libro diario."
            : undefined
        }
        accion={() => (aDesconciliar ? desconciliar(aDesconciliar.id) : Promise.resolve({ ok: true as const }))}
      >
        {aDesconciliar && (
          <p>
            {plural(aDesconciliar.movimientos.length, "movimiento del banco vuelve", "movimientos del banco vuelven")} y{" "}
            {plural(aDesconciliar.lineas.length, "línea de los libros vuelve", "líneas de los libros vuelven")} a pendientes.
          </p>
        )}
      </ConfirmarDialog>
    </div>
  );
}

// ------------------------------------------------------------
// Piezas
// ------------------------------------------------------------

function NavExtracto({ id, texto, atras }: { id: string | undefined; texto: string; atras?: boolean }) {
  const clase =
    "inline-flex h-8 items-center gap-1 rounded-full px-2.5 text-xs transition-colors";
  if (!id) {
    return (
      <span className={cn(clase, "text-muted-foreground/40")}>
        {atras && <ChevronLeft className="size-3.5" />}
        {texto}
        {!atras && <ChevronRight className="size-3.5" />}
      </span>
    );
  }
  return (
    <Link href={`/contabilidad/conciliacion/${id}`} className={cn(clase, "text-muted-foreground hover:bg-bordo-50 hover:text-bordo-800")}>
      {atras && <ChevronLeft className="size-3.5" />}
      {texto}
      {!atras && <ChevronRight className="size-3.5" />}
    </Link>
  );
}

function PanelResumen({
  resumen,
  moneda,
  avance,
}: {
  resumen: ResumenConciliacion;
  moneda: string;
  avance: number;
}) {
  const ok = aCentavos(resumen.diferencia) === 0;
  const items = [
    { etiqueta: "Saldo según banco", valor: resumen.saldoBanco, nota: "al cierre del extracto" },
    {
      etiqueta: "+ Partidas pendientes",
      valor: resumen.pendientes,
      nota: plural(resumen.cantidadPendientes, "línea de los libros", "líneas de los libros"),
    },
    { etiqueta: "+ Diferencia inicial", valor: resumen.diferenciaInicial, nota: "libros − banco al empezar" },
    { etiqueta: "= Saldo según libros", valor: resumen.saldoLibros, nota: "al cierre del extracto", fuerte: true },
  ];
  return (
    <motion.section
      variants={staggerContainerFast}
      initial="hidden"
      animate="visible"
      className="grid gap-3 rounded-2xl border border-linea bg-white p-4 sm:p-5 lg:grid-cols-[minmax(0,3fr)_minmax(0,1fr)]"
    >
      <div className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-4">
        {items.map((it) => (
          <motion.div key={it.etiqueta} variants={fadeInUp} transition={easeSmooth} className="min-w-0">
            <div className="truncate font-heading text-[11px] uppercase tracking-editorial text-muted-foreground">
              {it.etiqueta}
            </div>
            <ImporteAnimado
              valor={it.valor}
              moneda={moneda}
              className={cn("block truncate text-base sm:text-lg", it.fuerte ? "font-semibold text-foreground" : "text-foreground/90")}
            />
            <div className="truncate text-[11px] text-muted-foreground">{it.nota}</div>
          </motion.div>
        ))}
        <motion.div variants={fadeInUp} transition={easeSmooth} className="col-span-2 sm:col-span-4">
          <div className="flex items-baseline justify-between text-[11px] text-muted-foreground">
            <span>Movimientos del banco conciliados</span>
            <span className="tabular-nums">{Math.round(avance * 100)}%</span>
          </div>
          <BarraAvance valor={avance} className="mt-1" />
        </motion.div>
      </div>
      <motion.div
        variants={fadeInUp}
        transition={easeSmooth}
        className={cn(
          "flex flex-col justify-center rounded-xl border p-3 transition-colors",
          ok ? "border-emerald-200 bg-emerald-50" : "border-rose-300 bg-rose-50"
        )}
      >
        <div className={cn("flex items-center gap-1.5 font-heading text-[11px] uppercase tracking-editorial", ok ? "text-emerald-800" : "text-rose-800")}>
          {ok ? <CheckCircle2 className="size-3.5" /> : <X className="size-3.5" />}
          Diferencia
        </div>
        <ImporteAnimado
          valor={resumen.diferencia}
          moneda={moneda}
          className={cn("text-xl font-semibold sm:text-2xl", ok ? "text-emerald-800" : "text-rose-700")}
        />
        <div className={cn("text-[11px]", ok ? "text-emerald-800/80" : "text-rose-800")}>
          {ok
            ? "Banco y libros cierran."
            : resumen.movimientosSinConciliar > 0
              ? `Hay ${plural(resumen.movimientosSinConciliar, "movimiento", "movimientos")} del banco sin conciliar.`
              : "Tiene que ser cero: revisá la conciliación."}
        </div>
      </motion.div>
    </motion.section>
  );
}

function Columna({
  visible,
  icono,
  titulo,
  subtitulo,
  cantidad,
  total,
  moneda,
  busqueda,
  onBuscar,
  vacio,
  hayFilas,
  children,
}: {
  visible: boolean;
  icono: React.ReactNode;
  titulo: string;
  subtitulo?: string;
  cantidad: number;
  total: number;
  moneda: string | null;
  busqueda: string;
  onBuscar: (v: string) => void;
  vacio: string;
  hayFilas: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className={cn("min-w-0 self-start rounded-2xl border border-linea bg-white lg:block", visible ? "block" : "hidden")}>
      <header className="flex items-start justify-between gap-3 border-b border-linea px-4 py-3">
        <div className="flex min-w-0 items-center gap-2">
          <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-bordo-50 text-bordo-800">{icono}</span>
          <div className="min-w-0">
            <h3 className="truncate font-heading text-sm text-foreground">{titulo}</h3>
            <p className="truncate text-[11px] text-muted-foreground">
              {plural(cantidad, "pendiente", "pendientes")}
              {subtitulo ? ` · ${subtitulo}` : ""}
            </p>
          </div>
        </div>
        <ImporteSigno valor={total} moneda={moneda} className="text-sm font-medium" />
      </header>
      {cantidad > 6 && (
        <div className="border-b border-linea px-4 py-2">
          <div className="flex h-8 items-center gap-2 rounded-lg border border-linea px-2 transition-colors focus-within:border-bordo-700">
            <Search className="size-3.5 shrink-0 text-muted-foreground" />
            <input
              value={busqueda}
              onChange={(e) => onBuscar(e.target.value)}
              placeholder="Buscar por texto o importe…"
              className="h-full min-w-0 flex-1 bg-transparent text-xs outline-none"
            />
            {busqueda && (
              <button type="button" onClick={() => onBuscar("")} aria-label="Limpiar búsqueda" className="text-muted-foreground hover:text-foreground">
                <X className="size-3.5" />
              </button>
            )}
          </div>
        </div>
      )}
      <ul className="max-h-[32rem] divide-y divide-linea overflow-y-auto">
        <AnimatePresence initial={false}>{children}</AnimatePresence>
      </ul>
      {!hayFilas && <p className="px-4 py-6 text-center text-sm text-muted-foreground">{vacio}</p>}
    </div>
  );
}

const animFila = {
  layout: "position" as const,
  initial: { opacity: 0, y: 6 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, x: 24, height: 0, paddingTop: 0, paddingBottom: 0 },
  transition: { duration: 0.22 },
};

function teclaAlternar(e: React.KeyboardEvent, fn: () => void) {
  if (e.key === " " || e.key === "Enter") {
    e.preventDefault();
    fn();
  }
}

function FilaBanco({
  mov,
  moneda,
  elegida,
  editable,
  puedeRegistrar,
  registrada,
  ocupado,
  onAlternar,
  onRegistrar,
  onConciliarRegistrada,
}: {
  mov: MovimientoBanco;
  moneda: string | null;
  elegida: boolean;
  editable: boolean;
  puedeRegistrar: boolean;
  registrada: LineaLibros | null;
  ocupado: boolean;
  onAlternar: () => void;
  onRegistrar: () => void;
  onConciliarRegistrada: (l: LineaLibros) => void;
}) {
  return (
    <motion.li
      {...animFila}
      role={editable ? "checkbox" : undefined}
      aria-checked={editable ? elegida : undefined}
      tabIndex={editable ? 0 : undefined}
      onClick={editable ? onAlternar : undefined}
      onKeyDown={editable ? (e) => teclaAlternar(e, onAlternar) : undefined}
      className={cn(
        "flex items-center gap-3 overflow-hidden px-4 py-2.5 outline-none transition-colors",
        editable && "cursor-pointer hover:bg-superficie/60 focus-visible:bg-bordo-50/60",
        elegida && "bg-bordo-50/70 hover:bg-bordo-50"
      )}
    >
      {editable && <Marca activa={elegida} />}
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm text-foreground">{mov.concepto}</div>
        <div className="truncate text-[11px] text-muted-foreground tabular-nums">
          {formatFecha(mov.fecha)}
          {mov.referencia ? ` · ${mov.referencia}` : ""}
          {registrada && <span className="text-bordo-800"> · ya está en libros (asiento {registrada.numero ?? "—"})</span>}
        </div>
      </div>
      <ImporteSigno valor={mov.importe} moneda={moneda} className="text-sm font-medium" />
      {editable && registrada ? (
        <motion.button
          type="button"
          disabled={ocupado}
          onClick={(e) => {
            e.stopPropagation();
            onConciliarRegistrada(registrada);
          }}
          onKeyDown={(e) => e.stopPropagation()}
          whileHover={{ scale: 1.08 }}
          whileTap={{ scale: 0.92 }}
          title={`Conciliar con el asiento ${registrada.numero ?? ""}`}
          aria-label={`Conciliar ${mov.concepto} con el asiento ${registrada.numero ?? ""}`}
          className="inline-flex size-8 shrink-0 items-center justify-center rounded-lg text-bordo-800 transition-colors hover:bg-bordo-50 disabled:opacity-40"
        >
          <Link2 className="size-4" />
        </motion.button>
      ) : puedeRegistrar && (
        <motion.button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onRegistrar();
          }}
          onKeyDown={(e) => e.stopPropagation()}
          whileHover={{ scale: 1.08 }}
          whileTap={{ scale: 0.92 }}
          title="Registrar en libros"
          aria-label={`Registrar en libros: ${mov.concepto}`}
          className="inline-flex size-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-bordo-50 hover:text-bordo-800"
        >
          <BookPlus className="size-4" />
        </motion.button>
      )}
    </motion.li>
  );
}

function FilaLibro({
  linea,
  moneda,
  anterior,
  elegida,
  editable,
  onAlternar,
}: {
  linea: LineaLibros;
  moneda: string | null;
  anterior: boolean;
  elegida: boolean;
  editable: boolean;
  onAlternar: () => void;
}) {
  return (
    <motion.li
      {...animFila}
      role={editable ? "checkbox" : undefined}
      aria-checked={editable ? elegida : undefined}
      tabIndex={editable ? 0 : undefined}
      onClick={editable ? onAlternar : undefined}
      onKeyDown={editable ? (e) => teclaAlternar(e, onAlternar) : undefined}
      className={cn(
        "flex items-center gap-3 overflow-hidden px-4 py-2.5 outline-none transition-colors",
        editable && "cursor-pointer hover:bg-superficie/60 focus-visible:bg-bordo-50/60",
        elegida && "bg-bordo-50/70 hover:bg-bordo-50"
      )}
    >
      {editable && <Marca activa={elegida} />}
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 items-center gap-1.5">
          <span className="truncate text-sm text-foreground">{linea.descripcion}</span>
          {linea.tipoAsiento === "reversion" && <Etiqueta className="border-rose-200 bg-rose-50 text-rose-700">Reversión</Etiqueta>}
          {linea.revertido && <Etiqueta className="border-rose-200 bg-white text-rose-700">Revertido</Etiqueta>}
          {anterior && <Etiqueta className="border-linea bg-superficie text-muted-foreground">Anterior</Etiqueta>}
        </div>
        <div className="truncate text-[11px] text-muted-foreground tabular-nums">
          {linea.detalle && <span className="text-foreground/70">{linea.detalle} · </span>}
          {formatFecha(linea.fecha)} ·{" "}
          <Link
            href={`/contabilidad/asientos/${linea.asientoId}`}
            onClick={(e) => e.stopPropagation()}
            className="underline-offset-2 hover:text-bordo-800 hover:underline"
          >
            asiento {linea.numero ?? "—"}
          </Link>
        </div>
      </div>
      <ImporteSigno valor={linea.importe} moneda={moneda} className="text-sm font-medium" />
    </motion.li>
  );
}

function Etiqueta({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <span className={cn("inline-flex h-4 shrink-0 items-center rounded-full border px-1.5 text-[10px] font-medium", className)}>
      {children}
    </span>
  );
}

function TotalSeleccion({
  etiqueta,
  valor,
  moneda,
  className,
}: {
  etiqueta: string;
  valor: number;
  moneda: string;
  className?: string;
}) {
  return (
    <div className="min-w-0">
      <div className="truncate text-[10px] uppercase tracking-wide text-muted-foreground">{etiqueta}</div>
      <ImporteAnimado valor={valor} moneda={moneda} className={cn("block truncate text-sm font-semibold sm:text-base", className)} />
    </div>
  );
}

function SeccionConciliados({
  grupos,
  moneda,
  editable,
  onDesconciliar,
}: {
  grupos: GrupoConciliado[];
  moneda: string | null;
  editable: boolean;
  onDesconciliar: (g: GrupoConciliado) => void;
}) {
  const [todos, setTodos] = useState(false);
  const visibles = todos ? grupos : grupos.slice(0, 8);
  if (grupos.length === 0) return null;
  return (
    <section className="space-y-3">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="font-heading text-base text-foreground">Conciliados</h2>
        <span className="text-xs text-muted-foreground">{plural(grupos.length, "grupo", "grupos")}</span>
      </div>
      <ul className="space-y-2">
        <AnimatePresence initial={false}>
          {visibles.map((g) => {
            const total = g.movimientos.reduce((s, m) => s + aCentavos(m.importe), 0) / 100;
            return (
              <motion.li
                key={g.id}
                layout="position"
                initial={{ opacity: 0, scale: 0.98 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, x: -24 }}
                transition={easeSmooth}
                className="rounded-xl border border-linea bg-white p-3"
              >
                <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)_auto] md:items-center">
                  <div className="min-w-0 space-y-1">
                    {g.movimientos.map((m) => (
                      <ItemGrupo key={m.id} fecha={m.fecha} texto={m.concepto} importe={m.importe} moneda={moneda} />
                    ))}
                    {g.movimientos.length === 0 && <p className="text-xs text-muted-foreground">Sin movimientos del banco</p>}
                  </div>
                  <div className="flex items-center justify-center gap-1 text-[11px] text-emerald-700">
                    <Link2 className="size-3.5" />
                    <span className="tabular-nums md:hidden">{formatImporte(total, moneda === "USD" ? "USD" : undefined)}</span>
                  </div>
                  <div className="min-w-0 space-y-1">
                    {g.lineas.map((l) => (
                      <ItemGrupo
                        key={l.id}
                        fecha={l.fecha}
                        texto={`${l.numero ? `#${l.numero} ` : ""}${l.descripcion}`}
                        importe={l.importe}
                        moneda={moneda}
                        href={`/contabilidad/asientos/${l.asientoId}`}
                      />
                    ))}
                    {g.lineas.length === 0 && <p className="text-xs text-muted-foreground">Sin líneas de los libros</p>}
                  </div>
                  <div className="flex items-center justify-end gap-2">
                    {g.registradoDesdeExtracto && (
                      <Etiqueta className="border-bordo-100 bg-bordo-50 text-bordo-800">Registrado acá</Etiqueta>
                    )}
                    {editable && (
                      <motion.button
                        type="button"
                        onClick={() => onDesconciliar(g)}
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.95 }}
                        className="inline-flex h-8 items-center gap-1 rounded-full px-2.5 text-xs text-muted-foreground transition-colors hover:bg-rose-50 hover:text-rose-700"
                      >
                        <Unlink className="size-3.5" />
                        Desconciliar
                      </motion.button>
                    )}
                  </div>
                </div>
              </motion.li>
            );
          })}
        </AnimatePresence>
      </ul>
      {grupos.length > 8 && (
        <button
          type="button"
          onClick={() => setTodos((t) => !t)}
          className="inline-flex items-center gap-1 text-xs text-bordo-800 hover:underline"
        >
          {todos ? "Ver menos" : `Ver los ${grupos.length}`}
          <ArrowRight className={cn("size-3 transition-transform", todos && "-rotate-90")} />
        </button>
      )}
    </section>
  );
}

function ItemGrupo({
  fecha,
  texto,
  importe,
  moneda,
  href,
}: {
  fecha: string;
  texto: string;
  importe: number;
  moneda: string | null;
  href?: string;
}) {
  return (
    <div className="flex items-baseline gap-2 text-xs">
      <span className="shrink-0 tabular-nums text-muted-foreground">{formatFecha(fecha).slice(0, 5)}</span>
      {href ? (
        <Link href={href} className="min-w-0 flex-1 truncate text-foreground/90 hover:text-bordo-800 hover:underline">
          {texto}
        </Link>
      ) : (
        <span className="min-w-0 flex-1 truncate text-foreground/90">{texto}</span>
      )}
      <ImporteSigno valor={importe} moneda={moneda} />
    </div>
  );
}
