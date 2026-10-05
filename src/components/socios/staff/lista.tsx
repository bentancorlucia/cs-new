"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowUpRight, Mail, MoreHorizontal, Phone, RotateCcw, Search, Trash2, UserCog, UserMinus, UserPen } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatFecha } from "@/lib/contabilidad/formato";
import { springSmooth } from "@/lib/motion";
import {
  FUNCIONES_STAFF,
  GRUPO_FUNCION_STAFF,
  NOMBRE_FUNCION_STAFF,
  nombreStaff,
  type FuncionStaff,
  type MiembroStaff,
} from "@/lib/socios/staff";
import { Filtros, Pastilla, Vacio, claseControl } from "@/components/socios/cuotas/ui";
import type { AccionStaff } from "./dialogos";

type Vista = "vigentes" | "historico";

const iniciales = (m: MiembroStaff) => `${m.nombre.charAt(0)}${m.apellido.charAt(0)}`.toUpperCase();

/**
 * Lista del staff con búsqueda, vigentes/histórico y grupos (por función en
 * el panel de una disciplina, por disciplina en secretaría).
 */
export function ListaStaff({
  miembros,
  agrupar,
  puedeEditar,
  onAccion,
  enlacePanel,
  vacio,
}: {
  miembros: MiembroStaff[];
  agrupar: "funcion" | "disciplina";
  puedeEditar: (m: MiembroStaff) => boolean;
  onAccion: (a: AccionStaff) => void;
  /** En secretaría: el título de cada disciplina lleva a su panel. */
  enlacePanel?: boolean;
  vacio?: React.ReactNode;
}) {
  const [vista, setVista] = useState<Vista>("vigentes");
  const [buscar, setBuscar] = useState("");
  const [funcion, setFuncion] = useState<FuncionStaff | "todas">("todas");

  const enVista = useMemo(() => miembros.filter((m) => (vista === "vigentes" ? m.estado !== "baja" : m.estado === "baja")), [miembros, vista]);
  const bajas = miembros.length - miembros.filter((m) => m.estado !== "baja").length;

  const filtrados = useMemo(() => {
    const q = buscar
      .trim()
      .toLowerCase()
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "");
    return enVista.filter((m) => {
      if (funcion !== "todas" && m.funcion !== funcion) return false;
      if (!q) return true;
      const texto = [m.nombre, m.apellido, m.cedula, m.detalle, m.disciplina, NOMBRE_FUNCION_STAFF[m.funcion]]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .normalize("NFD")
        .replace(/[̀-ͯ]/g, "");
      const digitos = q.replace(/\D/g, "");
      return texto.includes(q) || (digitos.length > 0 && m.cedula.includes(digitos));
    });
  }, [enVista, buscar, funcion]);

  const funcionesPresentes = FUNCIONES_STAFF.filter((f) => enVista.some((m) => m.funcion === f));

  const grupos = useMemo(() => {
    const mapa = new Map<string, { titulo: string; disciplinaId: number | null; filas: MiembroStaff[] }>();
    for (const m of filtrados) {
      const clave = agrupar === "funcion" ? m.funcion : m.disciplina_id === null ? "club" : String(m.disciplina_id);
      const titulo = agrupar === "funcion" ? GRUPO_FUNCION_STAFF[m.funcion] : (m.disciplina ?? "Personal del club");
      if (!mapa.has(clave)) mapa.set(clave, { titulo, disciplinaId: m.disciplina_id, filas: [] });
      mapa.get(clave)!.filas.push(m);
    }
    const lista = [...mapa.entries()];
    if (agrupar === "disciplina") {
      lista.sort(([a, x], [b, y]) => (a === "club" ? 1 : b === "club" ? -1 : x.titulo.localeCompare(y.titulo, "es")));
    }
    return lista;
  }, [filtrados, agrupar]);

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={buscar}
            onChange={(e) => setBuscar(e.target.value)}
            placeholder={agrupar === "disciplina" ? "Buscar por nombre, cédula, disciplina o categoría…" : "Buscar por nombre, cédula o categoría…"}
            className={cn(claseControl, "pl-9")}
          />
        </div>
        <Filtros
          id="vista-staff"
          valor={vista}
          onChange={(v) => {
            setVista(v);
            setFuncion("todas");
          }}
          opciones={[
            { valor: "vigentes", etiqueta: "En el staff", cantidad: miembros.length - bajas },
            { valor: "historico", etiqueta: "Bajas", cantidad: bajas },
          ]}
        />
      </div>

      {funcionesPresentes.length > 1 && (
        <Filtros
          id="funcion-staff"
          valor={funcion}
          onChange={setFuncion}
          opciones={[
            { valor: "todas" as const, etiqueta: "Todas" },
            ...funcionesPresentes.map((f) => ({
              valor: f,
              etiqueta: GRUPO_FUNCION_STAFF[f],
              cantidad: enVista.filter((m) => m.funcion === f).length,
            })),
          ]}
        />
      )}

      {filtrados.length === 0 ? (
        (vista === "vigentes" && !buscar && funcion === "todas" && vacio) || (
          <Vacio
            icono={UserCog}
            titulo={vista === "historico" && !buscar ? "Sin bajas" : "Nadie con esos filtros"}
            texto={vista === "historico" && !buscar ? "Cuando alguien deje el staff, va a aparecer acá." : undefined}
          />
        )
      ) : (
        <div className="space-y-6">
          <AnimatePresence mode="popLayout" initial={false}>
            {grupos.map(([clave, g], gi) => (
              <motion.section
                key={clave}
                layout
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.3, delay: Math.min(gi * 0.04, 0.24) }}
                className="space-y-2"
              >
                <div className="flex items-baseline justify-between gap-3 border-b border-linea pb-1.5">
                  {enlacePanel && g.disciplinaId !== null ? (
                    <Link
                      href={`/disciplina/${g.disciplinaId}?tab=staff`}
                      className="group inline-flex items-center gap-1 font-heading text-sm uppercase tracking-editorial text-foreground transition-colors hover:text-bordo-800"
                    >
                      {g.titulo}
                      <ArrowUpRight className="size-3.5 opacity-0 transition-all group-hover:translate-x-0.5 group-hover:opacity-100" />
                    </Link>
                  ) : (
                    <h2 className="font-heading text-sm uppercase tracking-editorial text-foreground">{g.titulo}</h2>
                  )}
                  <span className="text-xs tabular-nums text-muted-foreground">
                    {g.filas.length} {g.filas.length === 1 ? "persona" : "personas"}
                  </span>
                </div>
                <motion.ul layout className="divide-y divide-linea overflow-hidden rounded-2xl border border-linea bg-white">
                  <AnimatePresence mode="popLayout" initial={false}>
                    {g.filas.map((m, i) => (
                      <Fila
                        key={m.id}
                        m={m}
                        indice={i}
                        mostrarFuncion={agrupar === "disciplina"}
                        editable={puedeEditar(m)}
                        onAccion={onAccion}
                      />
                    ))}
                  </AnimatePresence>
                </motion.ul>
              </motion.section>
            ))}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
}

function Fila({
  m,
  indice,
  mostrarFuncion,
  editable,
  onAccion,
}: {
  m: MiembroStaff;
  indice: number;
  mostrarFuncion: boolean;
  editable: boolean;
  onAccion: (a: AccionStaff) => void;
}) {
  const [menu, setMenu] = useState(false);
  const baja = m.estado === "baja";
  // Con la baja cargada pero todavía en su último día (o antes).
  const conBaja = m.hasta !== null;
  const linea = [mostrarFuncion ? NOMBRE_FUNCION_STAFF[m.funcion] : null, m.detalle].filter(Boolean).join(" · ");

  function hacer(a: AccionStaff) {
    setMenu(false);
    onAccion(a);
  }

  return (
    <motion.li
      layout
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, x: -12 }}
      transition={{ ...springSmooth, delay: Math.min(indice * 0.025, 0.2) }}
      className={cn("group relative flex items-center gap-3 px-3 py-2.5 transition-colors hover:bg-superficie/50 sm:px-4", baja && "opacity-70")}
    >
      <motion.div
        whileHover={{ scale: 1.06 }}
        className={cn(
          "flex size-9 shrink-0 items-center justify-center rounded-full font-heading text-xs font-semibold",
          baja ? "bg-superficie text-muted-foreground" : "bg-bordo-50 text-bordo-800"
        )}
      >
        {iniciales(m)}
      </motion.div>

      <div className="grid min-w-0 flex-1 grid-cols-1 items-center gap-x-4 gap-y-0.5 sm:grid-cols-[1fr_auto]">
        <div className="min-w-0">
          <div className="flex min-w-0 flex-wrap items-center gap-1.5">
            <span className="truncate text-sm font-medium text-foreground">{nombreStaff(m)}</span>
            {m.socio && <Pastilla tono="bueno">Socio</Pastilla>}
            {m.estado === "programado" && <Pastilla tono="info">Desde el {formatFecha(m.desde)}</Pastilla>}
            {!baja && conBaja && <Pastilla tono="alerta">Hasta el {formatFecha(m.hasta)}</Pastilla>}
          </div>
          <div className="truncate text-xs text-muted-foreground">
            {linea || NOMBRE_FUNCION_STAFF[m.funcion]}
            {baja ? (
              <> · hasta el {formatFecha(m.hasta)}{m.motivo_fin ? ` (${m.motivo_fin})` : ""}</>
            ) : m.estado === "vigente" ? (
              <> · desde el {formatFecha(m.desde)}</>
            ) : null}
          </div>
          {m.notas && <div className="mt-0.5 line-clamp-1 text-[11px] text-muted-foreground/80">{m.notas}</div>}
        </div>

        <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
          {m.telefono && (
            <a href={`tel:${m.telefono.replace(/[^\d+]/g, "")}`} className="inline-flex items-center gap-1 transition-colors hover:text-bordo-800">
              <Phone className="size-3" />
              {m.telefono}
            </a>
          )}
          {m.email && (
            <a href={`mailto:${m.email}`} className="inline-flex max-w-[220px] items-center gap-1 transition-colors hover:text-bordo-800">
              <Mail className="size-3 shrink-0" />
              <span className="truncate">{m.email}</span>
            </a>
          )}
        </div>
      </div>

      {editable && (
        <div className="relative shrink-0">
          <motion.button
            type="button"
            whileTap={{ scale: 0.9 }}
            onClick={() => setMenu((v) => !v)}
            aria-label="Acciones"
            aria-expanded={menu}
            className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-superficie hover:text-foreground"
          >
            <MoreHorizontal className="size-4" />
          </motion.button>
          <AnimatePresence>
            {menu && (
              <>
                <button type="button" aria-hidden tabIndex={-1} className="fixed inset-0 z-10 cursor-default" onClick={() => setMenu(false)} />
                <motion.div
                  initial={{ opacity: 0, scale: 0.95, y: -4 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95, y: -4 }}
                  transition={{ duration: 0.15 }}
                  className="absolute right-0 top-full z-20 mt-1 w-48 origin-top-right overflow-hidden rounded-xl border border-linea bg-white py-1 shadow-lg"
                  role="menu"
                >
                  <ItemMenu icono={UserPen} onClick={() => hacer({ tipo: "editar", miembro: m })}>
                    Editar
                  </ItemMenu>
                  {conBaja ? (
                    <ItemMenu icono={RotateCcw} onClick={() => hacer({ tipo: "anular_baja", miembro: m })}>
                      Anular la baja
                    </ItemMenu>
                  ) : (
                    <ItemMenu icono={UserMinus} onClick={() => hacer({ tipo: "baja", miembro: m })}>
                      Dar de baja
                    </ItemMenu>
                  )}
                  <ItemMenu icono={Trash2} peligro onClick={() => hacer({ tipo: "eliminar", miembro: m })}>
                    Quitar (error)
                  </ItemMenu>
                </motion.div>
              </>
            )}
          </AnimatePresence>
        </div>
      )}
    </motion.li>
  );
}

function ItemMenu({
  icono: Icono,
  children,
  onClick,
  peligro,
}: {
  icono: typeof UserPen;
  children: React.ReactNode;
  onClick: () => void;
  peligro?: boolean;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      className={cn(
        "flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors",
        peligro ? "text-rose-700 hover:bg-rose-50" : "text-foreground hover:bg-superficie"
      )}
    >
      <Icono className="size-4" />
      {children}
    </button>
  );
}
