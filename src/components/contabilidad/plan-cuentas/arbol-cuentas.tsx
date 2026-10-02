"use client";

import {
  createContext,
  useContext,
  useDeferredValue,
  useMemo,
  useState,
  useTransition,
} from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import {
  ChevronRight,
  ChevronsDownUp,
  ChevronsUpDown,
  FolderTree,
  MoreHorizontal,
  Pencil,
  Plus,
  Search,
  SearchX,
  Trash2,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { easeSnappy, fadeInUp, springBouncy, staggerContainer } from "@/lib/motion";
import { cn } from "@/lib/utils";
import { NOMBRE_CLASE, type ClaseCuenta } from "@/lib/contabilidad/formato";
import {
  NOMBRE_ROL_SISTEMA,
  naturalezaPorDefecto,
  normalizarBusqueda,
  sugerirCodigo,
  type CuentaPlan,
} from "@/lib/contabilidad/plan-cuentas";
import {
  convertirEnAgrupadora,
  eliminarCuenta,
} from "@/app/(dashboard)/contabilidad/plan-de-cuentas/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { BadgePlan, ConfirmarDialog, type TonoBadge } from "./controles";
import { CuentaDialog, type ModoCuentaDialog } from "./cuenta-dialog";

const ACENTO_CLASE: Record<ClaseCuenta, string> = {
  activo: "#730d32",
  pasivo: "#e8900a",
  patrimonio: "#a94f09",
  ingreso: "#0f766e",
  egreso: "#ab1d47",
};

type Confirmacion = { tipo: "eliminar" | "convertir"; cuenta: CuentaPlan };

type ArbolCtx = {
  hijos: Map<string | null, CuentaPlan[]>;
  expandidas: Set<string>;
  visibles: Set<string> | null;
  consulta: string;
  puedeEscribir: boolean;
  reducir: boolean;
  alternar: (id: string) => void;
  agregarSub: (padre: CuentaPlan) => void;
  editar: (cuenta: CuentaPlan) => void;
  confirmar: (c: Confirmacion) => void;
};

const Ctx = createContext<ArbolCtx | null>(null);
function useArbol() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useArbol fuera del árbol");
  return ctx;
}

/** Por qué no se puede eliminar (o null si se puede). */
function motivoNoEliminar(c: CuentaPlan, cantHijas: number): string | null {
  if (c.rolSistema) return "Es una cuenta de sistema";
  if (cantHijas > 0) return "Tiene subcuentas";
  if (c.tieneMovimientos) return "Tiene movimientos";
  if (c.enParametros) return "La usa un proceso automático";
  return null;
}

/* ─────────────────────────────────────────────────────────── */
/*  Árbol                                                      */
/* ─────────────────────────────────────────────────────────── */

export function ArbolCuentas({
  cuentas,
  puedeEscribir,
}: {
  cuentas: CuentaPlan[];
  puedeEscribir: boolean;
}) {
  const reducir = useReducedMotion() ?? false;
  const [busqueda, setBusqueda] = useState("");
  const consulta = normalizarBusqueda(useDeferredValue(busqueda));
  const [expandidas, setExpandidas] = useState<Set<string>>(
    () => new Set(cuentas.filter((c) => c.nivel <= 2).map((c) => c.id))
  );
  const [dialogo, setDialogo] = useState<ModoCuentaDialog | null>(null);
  const [dialogoAbierto, setDialogoAbierto] = useState(false);
  const [confirmacion, setConfirmacion] = useState<Confirmacion | null>(null);
  const [confirmAbierto, setConfirmAbierto] = useState(false);
  const [pendiente, startTransition] = useTransition();

  const { hijos, porId } = useMemo(() => {
    const hijos = new Map<string | null, CuentaPlan[]>();
    const porId = new Map<string, CuentaPlan>();
    for (const c of cuentas) {
      porId.set(c.id, c);
      const lista = hijos.get(c.padre_id) ?? [];
      lista.push(c);
      hijos.set(c.padre_id, lista);
    }
    return { hijos, porId };
  }, [cuentas]);

  // Coincidencias + sus ancestros (para mostrar el camino).
  const { visibles, coincidencias } = useMemo(() => {
    if (!consulta) return { visibles: null, coincidencias: 0 };
    const visibles = new Set<string>();
    let coincidencias = 0;
    for (const c of cuentas) {
      if (
        c.codigo.startsWith(consulta) ||
        normalizarBusqueda(c.nombre).includes(consulta)
      ) {
        coincidencias++;
        let actual: CuentaPlan | undefined = c;
        while (actual && !visibles.has(actual.id)) {
          visibles.add(actual.id);
          actual = actual.padre_id ? porId.get(actual.padre_id) : undefined;
        }
      }
    }
    return { visibles, coincidencias };
  }, [consulta, cuentas, porId]);

  const stats = useMemo(
    () => ({
      total: cuentas.length,
      imputables: cuentas.filter((c) => c.imputable).length,
      conMovimientos: cuentas.filter((c) => c.tieneMovimientos).length,
    }),
    [cuentas]
  );

  const alternar = (id: string) =>
    setExpandidas((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const ctx: ArbolCtx = {
    hijos,
    expandidas,
    visibles,
    consulta,
    puedeEscribir,
    reducir,
    alternar,
    agregarSub: (padre) => {
      setDialogo({
        tipo: "crear",
        padre,
        codigoSugerido: sugerirCodigo(
          padre.codigo,
          (hijos.get(padre.id) ?? []).map((h) => h.codigo)
        ),
      });
      setDialogoAbierto(true);
    },
    editar: (cuenta) => {
      setDialogo({
        tipo: "editar",
        cuenta,
        tieneHijas: (hijos.get(cuenta.id)?.length ?? 0) > 0,
      });
      setDialogoAbierto(true);
    },
    confirmar: (c) => {
      setConfirmacion(c);
      setConfirmAbierto(true);
    },
  };

  function ejecutarConfirmacion() {
    if (!confirmacion) return;
    const { tipo, cuenta } = confirmacion;
    startTransition(async () => {
      const res =
        tipo === "eliminar"
          ? await eliminarCuenta(cuenta.id)
          : await convertirEnAgrupadora(cuenta.id);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success(
        tipo === "eliminar"
          ? `Cuenta ${cuenta.codigo} eliminada`
          : `${cuenta.codigo} ahora es agrupadora: ya podés agregarle subcuentas`
      );
      if (tipo === "convertir") {
        setExpandidas((prev) => new Set(prev).add(cuenta.id));
      }
      setConfirmAbierto(false);
    });
  }

  const raices = (hijos.get(null) ?? []).filter((r) => !visibles || visibles.has(r.id));

  return (
    <Ctx.Provider value={ctx}>
      <div className="space-y-4">
        {/* Barra de herramientas */}
        <div className="flex flex-col gap-3 rounded-2xl border border-linea bg-white p-3 sm:flex-row sm:items-center sm:p-4">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              placeholder="Buscá por código o nombre…"
              className="h-10 rounded-full pl-9 pr-9"
              aria-label="Buscar cuenta"
            />
            <AnimatePresence>
              {busqueda && (
                <motion.button
                  type="button"
                  initial={{ opacity: 0, scale: 0.6 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.6 }}
                  transition={springBouncy}
                  onClick={() => setBusqueda("")}
                  className="absolute right-2 top-1/2 flex size-6 -translate-y-1/2 items-center justify-center rounded-full text-muted-foreground hover:bg-superficie hover:text-foreground"
                  aria-label="Limpiar búsqueda"
                >
                  <X className="size-3.5" />
                </motion.button>
              )}
            </AnimatePresence>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              className="flex-1 rounded-full sm:flex-none"
              disabled={!!visibles}
              onClick={() => setExpandidas(new Set(cuentas.filter((c) => !c.imputable).map((c) => c.id)))}
            >
              <ChevronsUpDown className="size-3.5" />
              Expandir todo
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="flex-1 rounded-full sm:flex-none"
              disabled={!!visibles}
              onClick={() => setExpandidas(new Set())}
            >
              <ChevronsDownUp className="size-3.5" />
              Colapsar todo
            </Button>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 px-1 text-xs text-muted-foreground tabular-nums">
          <AnimatePresence mode="wait" initial={false}>
            <motion.span
              key={visibles ? "busqueda" : "stats"}
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.18 }}
            >
              {visibles
                ? `${coincidencias} ${coincidencias === 1 ? "coincidencia" : "coincidencias"}`
                : `${stats.total} cuentas · ${stats.imputables} imputables · ${stats.conMovimientos} con movimientos`}
            </motion.span>
          </AnimatePresence>
          <span className="inline-flex items-center gap-1.5">
            <span className="size-1.5 rounded-full bg-dorado-400" /> con movimientos
          </span>
        </div>

        {/* Clases */}
        <motion.div
          variants={staggerContainer}
          initial="hidden"
          animate="visible"
          className="space-y-3"
        >
          <AnimatePresence>
            {raices.map((raiz) => (
              <SeccionClase key={raiz.id} raiz={raiz} />
            ))}
          </AnimatePresence>
        </motion.div>

        <AnimatePresence>
          {visibles && raices.length === 0 && (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-linea bg-white px-6 py-12 text-center"
            >
              <motion.span
                animate={reducir ? undefined : { y: [0, -4, 0] }}
                transition={{ repeat: Infinity, duration: 2.4, ease: "easeInOut" }}
                className="text-bordo-200"
              >
                <SearchX className="size-10" strokeWidth={1.5} />
              </motion.span>
              <div className="font-heading text-lg text-bordo-900">Sin resultados</div>
              <p className="max-w-xs text-sm text-muted-foreground">
                No hay cuentas que coincidan con “{busqueda}”. Probá con otro código o nombre.
              </p>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {dialogo && (
        <CuentaDialog
          key={dialogo.tipo === "crear" ? `c-${dialogo.padre.id}` : `e-${dialogo.cuenta.id}`}
          modo={dialogo}
          abierto={dialogoAbierto}
          onClose={() => setDialogoAbierto(false)}
          onCerrado={() => setDialogo(null)}
          onGuardada={(m) => {
            if (m.tipo === "crear") setExpandidas((prev) => new Set(prev).add(m.padre.id));
          }}
        />
      )}

      <ConfirmarDialog
        abierto={confirmAbierto}
        onOpenChange={setConfirmAbierto}
        onCerrado={() => setConfirmacion(null)}
        pendiente={pendiente}
        destructivo={confirmacion?.tipo === "eliminar"}
        titulo={
          confirmacion?.tipo === "eliminar" ? "Eliminar cuenta" : "Convertir en agrupadora"
        }
        etiquetaConfirmar={confirmacion?.tipo === "eliminar" ? "Eliminar" : "Convertir"}
        descripcion={
          confirmacion ? (
            confirmacion.tipo === "eliminar" ? (
              <>
                Vas a eliminar{" "}
                <strong className="text-foreground">
                  {confirmacion.cuenta.codigo} {confirmacion.cuenta.nombre}
                </strong>
                . Esta acción no se puede deshacer.
              </>
            ) : (
              <>
                <strong className="text-foreground">
                  {confirmacion.cuenta.codigo} {confirmacion.cuenta.nombre}
                </strong>{" "}
                va a dejar de recibir movimientos y pierde su moneda, auxiliar y demás
                opciones de imputación. Después vas a poder agregarle subcuentas.
              </>
            )
          ) : null
        }
        onConfirmar={ejecutarConfirmacion}
      />
    </Ctx.Provider>
  );
}

/* ─────────────────────────────────────────────────────────── */
/*  Sección por clase (raíz del árbol)                         */
/* ─────────────────────────────────────────────────────────── */

function SeccionClase({ raiz }: { raiz: CuentaPlan }) {
  const { hijos, expandidas, visibles, alternar, reducir } = useArbol();
  const acento = ACENTO_CLASE[raiz.clase];
  const abierta = visibles ? true : expandidas.has(raiz.id);
  const hijosVisibles = (hijos.get(raiz.id) ?? []).filter((h) => !visibles || visibles.has(h.id));
  const total = useMemo(() => contarDescendientes(raiz.id, hijos), [raiz.id, hijos]);

  return (
    <motion.section
      layout={reducir ? false : "position"}
      variants={fadeInUp}
      exit={{ opacity: 0, y: -8 }}
      transition={easeSnappy}
      className="relative overflow-hidden rounded-2xl border border-linea bg-white shadow-card"
    >
      <span
        aria-hidden
        className="absolute inset-y-0 left-0 w-1"
        style={{ backgroundColor: acento }}
      />
      <div className="flex items-center gap-2 py-3 pl-4 pr-2 sm:gap-3 sm:py-4 sm:pl-6 sm:pr-4">
        <button
          type="button"
          onClick={() => alternar(raiz.id)}
          disabled={!!visibles}
          aria-expanded={abierta}
          className="group/clase flex min-w-0 flex-1 items-center gap-3 text-left"
        >
          <motion.span
            animate={{ rotate: abierta ? 90 : 0 }}
            transition={springBouncy}
            className="flex size-7 shrink-0 items-center justify-center rounded-full bg-superficie text-muted-foreground group-hover/clase:bg-bordo-50 group-hover/clase:text-bordo-700"
          >
            <ChevronRight className="size-4" />
          </motion.span>
          <span
            className="font-display text-2xl tabular-nums leading-none sm:text-3xl"
            style={{ color: acento }}
          >
            {raiz.codigo}
          </span>
          <span className="min-w-0">
            <span className="block truncate font-display text-lg uppercase leading-none tracking-tight text-foreground sm:text-xl">
              {raiz.nombre}
            </span>
            <span className="mt-1 block text-[10px] uppercase tracking-editorial text-muted-foreground">
              {NOMBRE_CLASE[raiz.clase]} · {total} {total === 1 ? "cuenta" : "cuentas"}
            </span>
          </span>
        </button>
        <AccionesCuenta cuenta={raiz} />
      </div>

      <AnimatePresence initial={false}>
        {abierta && hijosVisibles.length > 0 && (
          <motion.div
            key="hijos"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={reducir ? { duration: 0 } : easeSnappy}
            className="overflow-hidden"
          >
            <div className="border-t border-dashed border-linea px-2 pb-3 pt-2 sm:px-4">
              {hijosVisibles.map((h) => (
                <NodoCuenta key={h.id} cuenta={h} />
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.section>
  );
}

function contarDescendientes(id: string, hijos: Map<string | null, CuentaPlan[]>): number {
  let n = 0;
  for (const h of hijos.get(id) ?? []) n += 1 + contarDescendientes(h.id, hijos);
  return n;
}

/* ─────────────────────────────────────────────────────────── */
/*  Nodo recursivo                                             */
/* ─────────────────────────────────────────────────────────── */

function NodoCuenta({ cuenta }: { cuenta: CuentaPlan }) {
  const { hijos, expandidas, visibles, consulta, alternar, reducir } = useArbol();
  const todosLosHijos = hijos.get(cuenta.id) ?? [];
  const hijosVisibles = todosLosHijos.filter((h) => !visibles || visibles.has(h.id));
  const tieneHijos = hijosVisibles.length > 0;
  const abierta = visibles ? true : expandidas.has(cuenta.id);
  const agrupadora = !cuenta.imputable;
  const esRubro = cuenta.nivel === 2;

  return (
    <motion.div
      initial={reducir ? false : { opacity: 0, x: -6 }}
      animate={{ opacity: 1, x: 0 }}
      transition={easeSnappy}
    >
      <div
        className={cn(
          "group/row flex items-start gap-1.5 rounded-lg px-1 py-1.5 transition-colors hover:bg-superficie/70 sm:gap-2 sm:px-1.5",
          !cuenta.activa && "opacity-60"
        )}
      >
        {tieneHijos ? (
          <button
            type="button"
            onClick={() => alternar(cuenta.id)}
            disabled={!!visibles}
            aria-expanded={abierta}
            aria-label={abierta ? `Colapsar ${cuenta.nombre}` : `Expandir ${cuenta.nombre}`}
            className="mt-px flex size-6 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-bordo-50 hover:text-bordo-700 disabled:hover:bg-transparent"
          >
            <motion.span animate={{ rotate: abierta ? 90 : 0 }} transition={springBouncy}>
              <ChevronRight className="size-3.5" />
            </motion.span>
          </button>
        ) : (
          <span className="flex size-6 shrink-0 items-center justify-center" aria-hidden>
            <span
              className={cn(
                "rounded-full",
                agrupadora ? "size-2 border border-dashed border-muted-foreground/50" : "size-1 bg-linea"
              )}
            />
          </span>
        )}

        <div className="flex min-w-0 flex-1 flex-col gap-1 pt-0.5 md:flex-row md:items-center md:gap-3">
          <div className="flex min-w-0 items-baseline gap-2">
            <span
              className={cn(
                "shrink-0 font-heading text-xs tabular-nums",
                agrupadora ? "text-bordo-700" : "text-muted-foreground"
              )}
            >
              <Resaltado texto={cuenta.codigo} consulta={consulta} modo="prefijo" />
            </span>
            <span
              className={cn(
                "min-w-0 break-words md:truncate",
                agrupadora
                  ? esRubro
                    ? "font-heading text-[15px] tracking-tight text-bordo-900"
                    : "font-heading text-sm text-bordo-900/90"
                  : "font-body text-sm text-foreground/85"
              )}
            >
              <Resaltado texto={cuenta.nombre} consulta={consulta} modo="contiene" />
            </span>
            {cuenta.tieneMovimientos && (
              <Tooltip>
                <TooltipTrigger
                  render={
                    <span
                      className="relative top-[-1px] inline-block size-1.5 shrink-0 self-center rounded-full bg-dorado-400 ring-2 ring-dorado-100"
                      aria-label="Tiene movimientos"
                    />
                  }
                />
                <TooltipContent>Tiene movimientos</TooltipContent>
              </Tooltip>
            )}
          </div>
          <BadgesCuenta cuenta={cuenta} />
        </div>

        <AccionesCuenta cuenta={cuenta} />
      </div>

      <AnimatePresence initial={false}>
        {abierta && tieneHijos && (
          <motion.div
            key="hijos"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={reducir ? { duration: 0 } : easeSnappy}
            className="overflow-hidden"
          >
            <div className="ml-[11px] border-l border-dashed border-linea pl-1.5 sm:ml-[15px] sm:pl-3">
              {hijosVisibles.map((h) => (
                <NodoCuenta key={h.id} cuenta={h} />
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

/* ─────────────────────────────────────────────────────────── */
/*  Badges                                                     */
/* ─────────────────────────────────────────────────────────── */

function BadgesCuenta({ cuenta }: { cuenta: CuentaPlan }) {
  const badges: Array<{ k: string; tono: TonoBadge; t: string }> = [];
  if (cuenta.rolSistema) {
    badges.push({
      k: "sis",
      tono: "sistema",
      t: NOMBRE_ROL_SISTEMA[cuenta.rolSistema] ?? cuenta.rolSistema,
    });
  }
  if (!cuenta.imputable) badges.push({ k: "agr", tono: "apagado", t: "Agrupadora" });
  if (cuenta.moneda === "USD") badges.push({ k: "usd", tono: "dorado", t: "USD" });
  if (cuenta.es_disponibilidad) badges.push({ k: "disp", tono: "verde", t: "Caja/Banco" });
  if (cuenta.requiere_auxiliar === "proveedor")
    badges.push({ k: "prov", tono: "bordo", t: "Proveedor" });
  if (cuenta.requiere_auxiliar === "disciplina")
    badges.push({ k: "disc", tono: "bordo", t: "Disciplina" });
  if (cuenta.requiere_centro_costo) badges.push({ k: "cc", tono: "neutro", t: "Centro de costo" });
  if (cuenta.imputable && !cuenta.afecta_caja) badges.push({ k: "caja", tono: "apagado", t: "No mueve fondos" });
  if (cuenta.imputable && cuenta.naturaleza !== naturalezaPorDefecto(cuenta.clase))
    badges.push({ k: "reg", tono: "neutro", t: "Regularizadora" });
  if (!cuenta.activa) badges.push({ k: "inac", tono: "apagado", t: "Inactiva" });

  if (badges.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-1 md:ml-auto md:shrink-0 md:flex-nowrap md:justify-end">
      {badges.map((b) => (
        <BadgePlan key={b.k} tono={b.tono}>
          {b.t}
        </BadgePlan>
      ))}
    </div>
  );
}

/* ─────────────────────────────────────────────────────────── */
/*  Acciones                                                   */
/* ─────────────────────────────────────────────────────────── */

function AccionesCuenta({ cuenta }: { cuenta: CuentaPlan }) {
  const { puedeEscribir, hijos, agregarSub, editar, confirmar } = useArbol();
  if (!puedeEscribir) return null;

  const cantHijas = hijos.get(cuenta.id)?.length ?? 0;
  const noEliminar = motivoNoEliminar(cuenta, cantHijas);
  const agrupadora = !cuenta.imputable;

  return (
    <div className="flex shrink-0 items-center gap-0.5">
      {/* Accesos rápidos en desktop */}
      <div className="hidden items-center gap-0.5 opacity-0 transition-opacity focus-within:opacity-100 group-hover/row:opacity-100 md:flex">
        {agrupadora && (
          <IconoAccion etiqueta="Agregar subcuenta" onClick={() => agregarSub(cuenta)}>
            <Plus className="size-3.5" />
          </IconoAccion>
        )}
        <IconoAccion etiqueta="Editar" onClick={() => editar(cuenta)}>
          <Pencil className="size-3.5" />
        </IconoAccion>
      </div>

      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={`Acciones de ${cuenta.codigo}`}
              className="text-muted-foreground hover:bg-bordo-50 hover:text-bordo-700"
            >
              <MoreHorizontal className="size-4" />
            </Button>
          }
        />
        <DropdownMenuContent align="end" className="w-60">
          {agrupadora && (
            <DropdownMenuItem onClick={() => agregarSub(cuenta)}>
              <Plus className="size-3.5" />
              Agregar subcuenta
            </DropdownMenuItem>
          )}
          <DropdownMenuItem onClick={() => editar(cuenta)}>
            <Pencil className="size-3.5" />
            Editar
          </DropdownMenuItem>
          {cuenta.imputable && (
            <DropdownMenuItem
              disabled={cuenta.tieneMovimientos}
              onClick={() => confirmar({ tipo: "convertir", cuenta })}
              className="items-start"
            >
              <FolderTree className="mt-0.5 size-3.5" />
              <span className="flex flex-col">
                Convertir en agrupadora
                {cuenta.tieneMovimientos && (
                  <span className="text-[11px] text-muted-foreground">Tiene movimientos</span>
                )}
              </span>
            </DropdownMenuItem>
          )}
          <DropdownMenuSeparator />
          <DropdownMenuItem
            variant="destructive"
            disabled={!!noEliminar}
            onClick={() => confirmar({ tipo: "eliminar", cuenta })}
            className="items-start"
          >
            <Trash2 className="mt-0.5 size-3.5" />
            <span className="flex flex-col">
              Eliminar
              {noEliminar && (
                <span className="text-[11px] text-muted-foreground">{noEliminar}</span>
              )}
            </span>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

function IconoAccion({
  etiqueta,
  onClick,
  children,
}: {
  etiqueta: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <motion.button
            type="button"
            onClick={onClick}
            aria-label={etiqueta}
            whileHover={{ scale: 1.08 }}
            whileTap={{ scale: 0.92 }}
            transition={springBouncy}
            className="flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-bordo-50 hover:text-bordo-700"
          />
        }
      >
        {children}
      </TooltipTrigger>
      <TooltipContent>{etiqueta}</TooltipContent>
    </Tooltip>
  );
}

/* ─────────────────────────────────────────────────────────── */
/*  Resaltado de búsqueda                                      */
/* ─────────────────────────────────────────────────────────── */

function Resaltado({
  texto,
  consulta,
  modo,
}: {
  texto: string;
  consulta: string;
  modo: "prefijo" | "contiene";
}) {
  const base = texto.trim();
  if (!consulta) return <>{base}</>;
  const normal = normalizarBusqueda(base);
  // normalizarBusqueda conserva el largo para letras con tilde (á → a).
  const desde =
    modo === "prefijo" ? (normal.startsWith(consulta) ? 0 : -1) : normal.indexOf(consulta);
  if (desde < 0 || normal.length !== base.length) return <>{base}</>;
  const hasta = desde + consulta.length;
  return (
    <>
      {base.slice(0, desde)}
      <mark className="rounded-sm bg-dorado-200/70 px-0.5 text-inherit">
        {base.slice(desde, hasta)}
      </mark>
      {base.slice(hasta)}
    </>
  );
}
