"use client";

import { useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ChevronDown, Lock, Pencil, Plus, Tags, Trash2, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatFecha, formatImporte, NOMBRE_MES } from "@/lib/contabilidad/formato";
import { planSchema, precioSchema } from "@/lib/socios/esquemas";
import type { Disciplina, PlanDetalle, Precio } from "@/lib/socios/padron";
import { eliminarPrecio, guardarPlan, guardarPrecio } from "@/app/(dashboard)/secretaria/planes/actions";
import { DialogoAccion } from "./dialogo";
import { erroresPorCampo } from "./campos";
import { Aviso, Boton, Campo, EncabezadoPagina, Filtros, Panel, Vacio, claseControl } from "./ui";

type Dialogo =
  | { tipo: "plan"; plan: PlanDetalle | null; tipoNuevo: "social" | "disciplina" }
  | { tipo: "precio"; plan: PlanDetalle; precio: Precio | null }
  | { tipo: "borrar_precio"; plan: PlanDetalle; precio: Precio };

const nombreMes = (iso: string) => `${NOMBRE_MES[Number(iso.slice(5, 7)) - 1]} ${iso.slice(0, 4)}`;

export function Planes({
  planes,
  disciplinas,
  hoy,
  puedeGestionar,
  puedePrecios,
}: {
  planes: PlanDetalle[];
  disciplinas: Disciplina[];
  hoy: string;
  puedeGestionar: boolean;
  puedePrecios: boolean;
}) {
  const [filtro, setFiltro] = useState<"activos" | "todos">("activos");
  const [dialogo, setDialogo] = useState<Dialogo | null>(null);
  const [nonce, setNonce] = useState(0);
  const abrir = (d: Dialogo) => {
    setNonce((n) => n + 1);
    setDialogo(d);
  };
  const cerrar = (o: boolean) => {
    if (!o) setDialogo(null);
  };

  const visibles = planes.filter((p) => filtro === "todos" || p.activo);
  const sociales = visibles.filter((p) => p.tipo === "social");
  const porDisciplina = useMemo(() => {
    const m = new Map<string, PlanDetalle[]>();
    for (const p of visibles.filter((x) => x.tipo === "disciplina")) {
      const k = p.disciplina ?? "—";
      m.set(k, [...(m.get(k) ?? []), p]);
    }
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0], "es"));
  }, [visibles]);

  return (
    <div className="space-y-5 pb-12">
      <EncabezadoPagina
        eyebrow="Secretaría"
        titulo="Planes y cuotas"
        descripcion="Cuota social y cuotas de cada disciplina (sus categorías), con el precio vigente y los próximos."
      >
        {puedeGestionar && (
          <Boton onClick={() => abrir({ tipo: "plan", plan: null, tipoNuevo: "disciplina" })}>
            <Plus className="size-4" />
            Nuevo plan
          </Boton>
        )}
      </EncabezadoPagina>

      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-wrap items-center justify-between gap-3"
      >
        <Filtros
          id="planes"
          valor={filtro}
          onChange={setFiltro}
          opciones={[
            { valor: "activos", etiqueta: "Activos", cantidad: planes.filter((p) => p.activo).length },
            { valor: "todos", etiqueta: "Todos", cantidad: planes.length },
          ]}
        />
        {!puedePrecios && (
          <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
            <Lock className="size-3.5" />
            Los precios los carga tesorería
          </span>
        )}
      </motion.div>

      {planes.length === 0 ? (
        <Vacio
          icono={Tags}
          titulo="Todavía no hay planes"
          texto="Creá la cuota social y los planes de cada disciplina (una disciplina puede tener varias categorías)."
        >
          {puedeGestionar && (
            <>
              <Boton onClick={() => abrir({ tipo: "plan", plan: null, tipoNuevo: "social" })}>
                <Plus className="size-4" />
                Cuota social
              </Boton>
              <Boton variante="secundario" onClick={() => abrir({ tipo: "plan", plan: null, tipoNuevo: "disciplina" })}>
                <Plus className="size-4" />
                Plan de disciplina
              </Boton>
            </>
          )}
        </Vacio>
      ) : (
        <>
          <Panel
            titulo="Cuota social"
            icono={Users}
            delay={0.05}
            accion={
              puedeGestionar ? (
                <Boton
                  variante="secundario"
                  className="h-8 px-3 text-xs"
                  onClick={() => abrir({ tipo: "plan", plan: null, tipoNuevo: "social" })}
                >
                  <Plus className="size-3.5" />
                  Plan social
                </Boton>
              ) : undefined
            }
          >
            {sociales.length === 0 ? (
              <p className="px-4 py-5 text-sm text-muted-foreground">Sin planes de cuota social.</p>
            ) : (
              <ListaPlanes planes={sociales} hoy={hoy} puedeGestionar={puedeGestionar} puedePrecios={puedePrecios} abrir={abrir} />
            )}
          </Panel>

          {porDisciplina.map(([disciplina, lista], i) => (
            <Panel key={disciplina} titulo={disciplina} icono={Tags} delay={0.1 + i * 0.04}>
              <ListaPlanes planes={lista} hoy={hoy} puedeGestionar={puedeGestionar} puedePrecios={puedePrecios} abrir={abrir} />
            </Panel>
          ))}
        </>
      )}

      {dialogo?.tipo === "plan" && (
        <DialogoPlan key={nonce} onOpenChange={cerrar} plan={dialogo.plan} tipoNuevo={dialogo.tipoNuevo} disciplinas={disciplinas} />
      )}
      {dialogo?.tipo === "precio" && (
        <DialogoPrecio key={nonce} onOpenChange={cerrar} plan={dialogo.plan} precio={dialogo.precio} hoy={hoy} />
      )}
      {dialogo?.tipo === "borrar_precio" && (
        <DialogoAccion
          key={nonce}
          open
          onOpenChange={cerrar}
          icono={Trash2}
          destructivo
          titulo="Eliminar precio"
          descripcion={
            <>
              {dialogo.plan.nombre}: {formatImporte(dialogo.precio.importe_mensual, "UYU")} desde{" "}
              {nombreMes(dialogo.precio.vigente_desde)}. No se usó en ninguna cuota.
            </>
          }
          textoAccion="Eliminar"
          mensajeOk="Precio eliminado"
          ejecutar={() => eliminarPrecio(dialogo.precio.id)}
        />
      )}
    </div>
  );
}

function ListaPlanes({
  planes,
  hoy,
  puedeGestionar,
  puedePrecios,
  abrir,
}: {
  planes: PlanDetalle[];
  hoy: string;
  puedeGestionar: boolean;
  puedePrecios: boolean;
  abrir: (d: Dialogo) => void;
}) {
  const [abierto, setAbierto] = useState<number | null>(null);
  return (
    <ul className="divide-y divide-linea">
      {planes.map((p) => {
        const expandido = abierto === p.id;
        return (
          <li key={p.id}>
            <div className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
              <button
                type="button"
                onClick={() => setAbierto(expandido ? null : p.id)}
                className="group flex min-w-0 flex-1 items-start gap-2 text-left"
                aria-expanded={expandido}
              >
                <motion.span animate={{ rotate: expandido ? 180 : 0 }} className="mt-0.5 text-muted-foreground">
                  <ChevronDown className="size-4" />
                </motion.span>
                <span className="min-w-0">
                  <span className="flex flex-wrap items-center gap-1.5">
                    <span className="font-medium text-foreground group-hover:text-bordo-800">{p.nombre}</span>
                    {!p.activo && (
                      <span className="inline-flex h-5 items-center rounded-full border border-slate-200 bg-slate-100 px-2 text-[11px] text-slate-600">
                        Inactivo
                      </span>
                    )}
                    {p.permite_anual && (
                      <span className="inline-flex h-5 items-center rounded-full border border-sky-200 bg-sky-50 px-2 text-[11px] text-sky-800">
                        Admite anual
                      </span>
                    )}
                  </span>
                  <span className="mt-0.5 block text-xs text-muted-foreground">
                    {p.inscriptos} inscripto{p.inscriptos === 1 ? "" : "s"}
                  </span>
                </span>
              </button>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 pl-6 text-sm sm:pl-0">
                <div className="text-right">
                  {p.precio ? (
                    <>
                      <div className="font-medium tabular-nums">{formatImporte(p.precio.importe_mensual, "UYU")}/mes</div>
                      <div className="text-[11px] text-muted-foreground tabular-nums">
                        {p.precio.importe_anual ? `${formatImporte(p.precio.importe_anual, "UYU")}/año · ` : ""}
                        desde {nombreMes(p.precio.vigente_desde)}
                      </div>
                    </>
                  ) : (
                    <span className="text-xs text-rose-700">Sin precio vigente</span>
                  )}
                </div>
                {p.proximo && (
                  <div className="rounded-lg border border-dorado-300 bg-dorado-50 px-2 py-1 text-[11px] text-dorado-900 tabular-nums">
                    {nombreMes(p.proximo.vigente_desde)}: {formatImporte(p.proximo.importe_mensual, "UYU")}
                  </div>
                )}
                {puedeGestionar && (
                  <motion.button
                    type="button"
                    whileHover={{ scale: 1.08 }}
                    whileTap={{ scale: 0.92 }}
                    onClick={() => abrir({ tipo: "plan", plan: p, tipoNuevo: p.tipo })}
                    aria-label={`Editar ${p.nombre}`}
                    className="rounded-lg p-1.5 text-muted-foreground hover:bg-superficie hover:text-bordo-800"
                  >
                    <Pencil className="size-4" />
                  </motion.button>
                )}
              </div>
            </div>
            <AnimatePresence initial={false}>
              {expandido && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  className="overflow-hidden"
                >
                  <div className="mx-4 mb-3 rounded-xl border border-linea bg-superficie/40">
                    <div className="flex items-center justify-between gap-2 border-b border-linea px-3 py-2">
                      <span className="text-[10px] uppercase tracking-editorial text-muted-foreground">Precios por vigencia</span>
                      {puedePrecios && (
                        <Boton
                          variante="secundario"
                          className="h-7 px-2.5 text-xs"
                          onClick={() => abrir({ tipo: "precio", plan: p, precio: null })}
                        >
                          <Plus className="size-3.5" />
                          Nuevo precio
                        </Boton>
                      )}
                    </div>
                    {p.precios.length === 0 ? (
                      <p className="px-3 py-3 text-xs text-muted-foreground">
                        Sin precios. {puedePrecios ? "" : "Pedile a tesorería que cargue el primero."}
                      </p>
                    ) : (
                      <ul className="divide-y divide-linea/70">
                        {p.precios.map((x) => {
                          const rige = p.precio?.id === x.id;
                          return (
                            <li key={x.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-xs">
                              <span className="flex items-center gap-2">
                                <span className="w-28 font-medium">{nombreMes(x.vigente_desde)}</span>
                                {rige && <span className="rounded-full bg-emerald-50 px-1.5 text-[10px] font-medium text-emerald-700">Vigente</span>}
                                {x.vigente_desde > hoy && <span className="rounded-full bg-dorado-100 px-1.5 text-[10px] font-medium text-dorado-800">Próximo</span>}
                              </span>
                              <span className="flex items-center gap-3 tabular-nums">
                                <span>{formatImporte(x.importe_mensual, "UYU")}/mes</span>
                                <span className="text-muted-foreground">
                                  {x.importe_anual ? `${formatImporte(x.importe_anual, "UYU")}/año` : "anual = 12 × mensual"}
                                </span>
                                {puedePrecios &&
                                  (x.usado ? (
                                    <span title="Ya se usó en cuotas: cargá uno nuevo con otra vigencia" className="text-muted-foreground">
                                      <Lock className="size-3.5" />
                                    </span>
                                  ) : (
                                    <span className="flex gap-0.5">
                                      <button
                                        type="button"
                                        onClick={() => abrir({ tipo: "precio", plan: p, precio: x })}
                                        aria-label="Editar precio"
                                        className="rounded p-1 text-muted-foreground hover:bg-white hover:text-bordo-800"
                                      >
                                        <Pencil className="size-3.5" />
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => abrir({ tipo: "borrar_precio", plan: p, precio: x })}
                                        aria-label="Eliminar precio"
                                        className="rounded p-1 text-muted-foreground hover:bg-white hover:text-rose-700"
                                      >
                                        <Trash2 className="size-3.5" />
                                      </button>
                                    </span>
                                  ))}
                              </span>
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </li>
        );
      })}
    </ul>
  );
}

function DialogoPlan({
  onOpenChange,
  plan,
  tipoNuevo,
  disciplinas,
}: {
  onOpenChange: (o: boolean) => void;
  plan: PlanDetalle | null;
  tipoNuevo: "social" | "disciplina";
  disciplinas: Disciplina[];
}) {
  const [nombre, setNombre] = useState(plan?.nombre ?? "");
  const [tipo, setTipo] = useState<"social" | "disciplina">(plan?.tipo ?? tipoNuevo);
  const [disciplina, setDisciplina] = useState(plan?.disciplina_id ? String(plan.disciplina_id) : "");
  const [anual, setAnual] = useState(plan?.permite_anual ?? true);
  const [activo, setActivo] = useState(plan?.activo ?? true);
  const [errores, setErrores] = useState<Record<string, string>>({});

  return (
    <DialogoAccion
      open
      onOpenChange={onOpenChange}
      icono={Tags}
      titulo={plan ? "Editar plan" : "Nuevo plan"}
      descripcion={plan ? "El tipo y la disciplina no cambian: para eso, creá otro plan y desactivá este." : undefined}
      textoAccion={plan ? "Guardar" : "Crear plan"}
      mensajeOk={plan ? "Plan actualizado" : "Plan creado"}
      ejecutar={() => {
        const input = {
          id: plan?.id,
          nombre,
          tipo,
          disciplina_id: tipo === "disciplina" && disciplina ? Number(disciplina) : null,
          permite_anual: anual,
          activo,
        };
        const p = planSchema.safeParse(input);
        if (!p.success) {
          setErrores(erroresPorCampo(p.error.issues));
          return null;
        }
        return guardarPlan(input);
      }}
    >
      {!plan && (
        <div className="grid grid-cols-2 gap-2">
          {(["social", "disciplina"] as const).map((t) => (
            <motion.button
              key={t}
              type="button"
              whileTap={{ scale: 0.97 }}
              onClick={() => setTipo(t)}
              className={cn(
                "rounded-xl border px-3 py-2.5 text-sm font-medium transition-colors",
                tipo === t ? "border-bordo-700 bg-bordo-50/60 text-bordo-900" : "border-linea text-muted-foreground hover:border-bordo-200"
              )}
            >
              {t === "social" ? "Cuota social" : "Disciplina"}
            </motion.button>
          ))}
        </div>
      )}
      <AnimatePresence initial={false}>
        {tipo === "disciplina" && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
            <Campo etiqueta="Disciplina" error={errores.disciplina_id}>
              <select
                value={disciplina}
                onChange={(e) => setDisciplina(e.target.value)}
                disabled={!!plan}
                aria-invalid={!!errores.disciplina_id || undefined}
                className={claseControl}
              >
                <option value="">Elegí…</option>
                {disciplinas.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.nombre}
                  </option>
                ))}
              </select>
            </Campo>
          </motion.div>
        )}
      </AnimatePresence>
      <Campo
        etiqueta={tipo === "social" ? "Nombre" : "Categoría"}
        error={errores.nombre}
        ayuda={tipo === "social" ? "Ej.: Cuota social, Cuota social familiar" : "Ej.: Primera, Sub 14, Mamis"}
      >
        <input value={nombre} onChange={(e) => setNombre(e.target.value)} autoFocus aria-invalid={!!errores.nombre || undefined} className={claseControl} />
      </Campo>
      <label className="flex cursor-pointer items-start gap-2.5 text-sm">
        <input type="checkbox" checked={anual} onChange={(e) => setAnual(e.target.checked)} className="mt-0.5 size-4 accent-bordo-800" />
        <span>
          Admite pago anual
          <span className="block text-xs text-muted-foreground">La cuota anual se emite una vez al año, proporcional a los meses.</span>
        </span>
      </label>
      <label className="flex cursor-pointer items-start gap-2.5 text-sm">
        <input type="checkbox" checked={activo} onChange={(e) => setActivo(e.target.checked)} className="mt-0.5 size-4 accent-bordo-800" />
        <span>
          Activo
          <span className="block text-xs text-muted-foreground">Un plan inactivo no admite inscripciones nuevas; las existentes siguen.</span>
        </span>
      </label>
    </DialogoAccion>
  );
}

/** Mes siguiente a hoy, "AAAA-MM". */
function mesSiguiente(hoy: string): string {
  const [y, m] = hoy.split("-").map(Number);
  return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`;
}

function DialogoPrecio({
  onOpenChange,
  plan,
  precio,
  hoy,
}: {
  onOpenChange: (o: boolean) => void;
  plan: PlanDetalle;
  precio: Precio | null;
  hoy: string;
}) {
  const [mes, setMes] = useState(precio ? precio.vigente_desde.slice(0, 7) : plan.precio ? mesSiguiente(hoy) : hoy.slice(0, 7));
  const [mensual, setMensual] = useState(precio ? String(precio.importe_mensual) : "");
  const [anual, setAnual] = useState(precio?.importe_anual ? String(precio.importe_anual) : "");
  const [errores, setErrores] = useState<Record<string, string>>({});
  const num = (v: string) => (v.trim() === "" ? null : Number(v.replace(/\./g, "").replace(",", ".")));
  const yaExiste = !precio && plan.precios.some((x) => x.vigente_desde.slice(0, 7) === mes);

  return (
    <DialogoAccion
      open
      onOpenChange={onOpenChange}
      icono={Tags}
      titulo={precio ? "Editar precio" : "Nuevo precio"}
      descripcion={
        <>
          <b>{plan.disciplina ? `${plan.disciplina} · ` : ""}{plan.nombre}</b>. Rige desde el día 1 del mes elegido hasta que
          empiece el siguiente precio.
        </>
      }
      textoAccion="Guardar precio"
      mensajeOk="Precio guardado"
      ejecutar={() => {
        const input = {
          id: precio?.id,
          plan_id: plan.id,
          mes,
          importe_mensual: num(mensual) ?? Number.NaN,
          importe_anual: plan.permite_anual ? num(anual) : null,
        };
        const p = precioSchema.safeParse(input);
        if (!p.success) {
          setErrores(erroresPorCampo(p.error.issues));
          return null;
        }
        return guardarPrecio(input);
      }}
    >
      <Campo etiqueta="Vigente desde (mes)" error={errores.mes}>
        <input type="month" value={mes} onChange={(e) => setMes(e.target.value)} className={claseControl} />
      </Campo>
      <div className="grid grid-cols-2 gap-3">
        <Campo etiqueta="Importe mensual" error={errores.importe_mensual}>
          <input value={mensual} onChange={(e) => setMensual(e.target.value)} inputMode="decimal" placeholder="0,00" className={claseControl} />
        </Campo>
        {plan.permite_anual && (
          <Campo etiqueta="Importe anual" error={errores.importe_anual} ayuda="Vacío: 12 × mensual">
            <input value={anual} onChange={(e) => setAnual(e.target.value)} inputMode="decimal" placeholder="Opcional" className={claseControl} />
          </Campo>
        )}
      </div>
      <Aviso visible={yaExiste}>Ya hay un precio desde ese mes: editá ese en vez de cargar otro.</Aviso>
      <Aviso visible={!!mes && `${mes}-01` < hoy.slice(0, 7) + "-01"} tono="info">
        Con vigencia pasada ({formatFecha(`${mes}-01`)}): las cuotas ya emitidas no cambian; solo afecta lo que se emita de
        ahora en más para esos meses.
      </Aviso>
    </DialogoAccion>
  );
}
