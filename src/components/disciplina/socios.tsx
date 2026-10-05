"use client";

import { useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowRightLeft,
  CreditCard,
  Download,
  HandCoins,
  MoreHorizontal,
  Phone,
  Search,
  UserMinus,
  UserPen,
  UserPlus,
  Users,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { formatFecha, formatImporte } from "@/lib/contabilidad/formato";
import { inicioMes } from "@/lib/socios/cuotas";
import { formatCedula } from "@/lib/socios/esquemas";
import {
  NOMBRE_MEDIO_DISC,
  nombreSocio,
  planesVigentes,
  vencimientoCorto,
  type ResumenDisciplina,
  type SocioDisciplina,
} from "@/lib/socios/panel-disciplina";
import { Boton, Filtros, Panel, Pastilla, Vacio, claseControl } from "@/components/socios/cuotas/ui";
import { exportarExcel } from "@/components/socios/disciplinas/ui";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { AccionPanel } from "./dialogos";
import { BadgePendienteTesoreria, MedioSocioTexto, SituacionSocio } from "./ui";

type Filtro = "vigentes" | "debito" | "otros" | "morosos" | "vencida" | "historico";

const PAGINA = 80;

const moroso = (s: SocioDisciplina) => !s.al_dia || s.deuda_vencida > 0;

export function SociosPanel({
  socios,
  disciplina,
  puedeEditar,
  abrir,
  hoy,
}: {
  socios: SocioDisciplina[];
  disciplina: ResumenDisciplina["disciplina"];
  puedeEditar: boolean;
  abrir: (a: AccionPanel) => void;
  hoy: string;
}) {
  const [filtro, setFiltro] = useState<Filtro>("vigentes");
  const [texto, setTexto] = useState("");
  const [mostrar, setMostrar] = useState(PAGINA);

  const vigentes = useMemo(() => socios.filter((s) => s.vigente), [socios]);
  const cuenta: Record<Filtro, number> = {
    vigentes: vigentes.length,
    debito: vigentes.filter((s) => s.medio?.medio === "debito_visa").length,
    otros: vigentes.filter((s) => s.medio?.medio !== "debito_visa").length,
    morosos: vigentes.filter(moroso).length,
    vencida: vigentes.filter((s) => s.tarjeta_vencida).length,
    historico: socios.length - vigentes.length,
  };

  const q = texto.trim().toLowerCase();
  const filtrados = useMemo(() => {
    const base =
      filtro === "historico"
        ? socios.filter((s) => !s.vigente)
        : vigentes.filter((s) =>
            filtro === "debito"
              ? s.medio?.medio === "debito_visa"
              : filtro === "otros"
                ? s.medio?.medio !== "debito_visa"
                : filtro === "morosos"
                  ? moroso(s)
                  : filtro === "vencida"
                    ? s.tarjeta_vencida
                    : true
          );
    if (!q) return base;
    const digitos = q.replace(/\D/g, "");
    return base.filter(
      (s) =>
        `${s.nombre} ${s.apellido}`.toLowerCase().includes(q) ||
        `${s.apellido} ${s.nombre}`.toLowerCase().includes(q) ||
        (digitos.length >= 3 && (s.cedula.includes(digitos) || String(s.numero_socio ?? "").includes(digitos) || s.medio?.tarjeta === digitos))
    );
  }, [socios, vigentes, filtro, q]);
  const visibles = filtrados.slice(0, mostrar);

  async function exportar() {
    const mes = inicioMes(hoy);
    try {
      await exportarExcel(
        `socios-${disciplina.slug}-${hoy}.xlsx`,
        "Socios",
        ["Apellido", "Nombre", "C.I.", "Medio de pago", "Tarjeta", "Vto.", "Emisor", "Titular", "Plan", "Cuota", "Alta/Baja", "Teléfono", "Email", "Situación"],
        filtrados.map((s) => {
          const visa = s.medio?.medio === "debito_visa";
          const planes = (s.vigente ? planesVigentes(s) : s.inscripciones.slice(0, 1)).map((i) => i.plan).join(" + ");
          const vig = planesVigentes(s);
          const marca = s.vigente
            ? vig.length > 0 && vig.every((x) => x.hasta)
              ? "BAJA"
              : s.desde >= mes
                ? "ALTA"
                : ""
            : s.hasta && s.hasta >= mes
              ? "BAJA"
              : "";
          return [
            s.apellido,
            s.nombre,
            formatCedula(s.cedula),
            visa ? "Tarjeta VISA" : s.medio ? NOMBRE_MEDIO_DISC[s.medio.medio] : "",
            visa && s.medio?.tarjeta ? `****${s.medio.tarjeta}` : "",
            visa ? vencimientoCorto(s.medio?.vencimiento) : "",
            visa ? (s.medio?.emisor ?? "") : "",
            visa ? (s.medio?.titular ?? "") : "",
            planes,
            s.vigente ? s.cuota_mensual : null,
            marca,
            s.telefono ?? "",
            s.email ?? "",
            s.al_dia && s.cuotas_vencidas === 0 ? "Al día" : `${s.cuotas_vencidas} vencidas (${formatImporte(s.deuda_vencida)})`,
          ];
        }),
        [16, 16, 13, 18, 11, 7, 11, 18, 24, 10, 9, 14, 26, 22]
      );
    } catch {
      toast.error("No se pudo armar el Excel");
    }
  }

  return (
    <Panel
      titulo="Socios de la disciplina"
      icono={Users}
      accion={
        <div className="flex w-full gap-2 sm:w-auto">
          <Boton variante="secundario" className="h-9 flex-1 px-3 text-xs sm:flex-none" onClick={exportar} disabled={filtrados.length === 0}>
            <Download className="size-3.5" />
            Excel
          </Boton>
          {puedeEditar && (
            <Boton className="h-9 flex-1 px-3 text-xs sm:flex-none" onClick={() => abrir({ tipo: "alta" })}>
              <UserPlus className="size-3.5" />
              Alta de socio
            </Boton>
          )}
        </div>
      }
    >
      <div className="space-y-3 border-b border-linea p-4">
        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={texto}
            onChange={(e) => {
              setTexto(e.target.value);
              setMostrar(PAGINA);
            }}
            placeholder="Nombre, cédula, Nº de socio o final de tarjeta…"
            className={cn(claseControl, "pl-9")}
            aria-label="Buscar socio"
          />
        </div>
        <Filtros<Filtro>
          id="socios-disc"
          valor={filtro}
          onChange={(v) => {
            setFiltro(v);
            setMostrar(PAGINA);
          }}
          opciones={[
            { valor: "vigentes", etiqueta: "Vigentes", cantidad: cuenta.vigentes },
            { valor: "debito", etiqueta: "Con débito", cantidad: cuenta.debito },
            { valor: "otros", etiqueta: "Otros medios", cantidad: cuenta.otros },
            { valor: "morosos", etiqueta: "Morosos", cantidad: cuenta.morosos },
            { valor: "vencida", etiqueta: "Tarjeta vencida", cantidad: cuenta.vencida },
            { valor: "historico", etiqueta: "Histórico", cantidad: cuenta.historico },
          ]}
        />
      </div>

      {filtrados.length === 0 ? (
        <div className="p-4">
          <Vacio icono={Users} titulo={q ? "Nadie coincide con la búsqueda" : "Nadie con ese filtro"} />
        </div>
      ) : (
        <>
          <div className="hidden grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_7rem_minmax(0,1.3fr)_9rem_2.5rem] gap-3 border-b border-linea bg-superficie/50 px-4 py-2 text-[10px] font-medium uppercase tracking-editorial text-muted-foreground lg:grid">
            <span>Socio</span>
            <span>Plan</span>
            <span className="text-right">Cuota</span>
            <span>Medio de cobro</span>
            <span>Situación</span>
            <span />
          </div>
          <ul className="divide-y divide-linea">
            <AnimatePresence initial={false}>
              {visibles.map((s, i) => (
                <FilaSocio key={s.persona_id} s={s} i={i} puedeEditar={puedeEditar} abrir={abrir} />
              ))}
            </AnimatePresence>
          </ul>
          {filtrados.length > visibles.length && (
            <div className="border-t border-linea px-4 py-3 text-center">
              <button type="button" onClick={() => setMostrar((n) => n + PAGINA)} className="text-xs font-medium text-bordo-800 hover:underline">
                Ver {Math.min(PAGINA, filtrados.length - visibles.length)} más de {filtrados.length}
              </button>
            </div>
          )}
        </>
      )}
    </Panel>
  );
}

function FilaSocio({ s, i, puedeEditar, abrir }: { s: SocioDisciplina; i: number; puedeEditar: boolean; abrir: (a: AccionPanel) => void }) {
  const planes = s.vigente ? planesVigentes(s) : s.inscripciones.slice(0, 1);
  return (
    <motion.li
      layout="position"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, height: 0 }}
      transition={{ duration: 0.3, delay: Math.min(i, 15) * 0.02 }}
      className={cn(
        "grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-1.5 px-4 py-3 text-sm transition-colors hover:bg-superficie/40 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_7rem_minmax(0,1.3fr)_9rem_2.5rem] lg:items-center",
        !s.vigente && "opacity-75"
      )}
    >
      <div className="min-w-0">
        <div className="truncate font-medium">{nombreSocio(s)}</div>
        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-muted-foreground tabular-nums">
          <span>CI {formatCedula(s.cedula)}</span>
          {s.numero_socio && <span>Nº {s.numero_socio}</span>}
          {s.telefono && (
            <a href={`tel:${s.telefono.replace(/\s/g, "")}`} className="inline-flex items-center gap-0.5 hover:text-bordo-800">
              <Phone className="size-3" />
              {s.telefono}
            </a>
          )}
        </div>
        <div className="mt-1 flex flex-wrap gap-1">
          <BadgePendienteTesoreria cantidad={s.cambios_pendientes} />
          {!s.vigente && <Pastilla>Baja {formatFecha(s.hasta)}</Pastilla>}
          {s.vigente && planes.length > 0 && planes.every((p) => p.hasta) && (
            <Pastilla tono="alerta">Baja el {formatFecha(planes.map((p) => p.hasta ?? "").sort().at(-1))}</Pastilla>
          )}
          {s.otras_disciplinas.length > 0 && <Pastilla tono="info">También {s.otras_disciplinas.join(", ")}</Pastilla>}
          {s.vigente && s.otras_disciplinas.length > 0 && !s.social_anual && (
            <Pastilla tono={s.social_cubre && s.otras_disciplinas.includes(s.social_cubre) ? "neutro" : "bueno"}>
              {s.social_cubre && s.otras_disciplinas.includes(s.social_cubre)
                ? `Cuota social: la cubre ${s.social_cubre}`
                : "Cuota social: la cubre esta disciplina"}
            </Pastilla>
          )}
        </div>
      </div>

      {puedeEditar ? (
        <div className="col-start-2 row-start-1 lg:col-start-6">
          <Acciones s={s} abrir={abrir} />
        </div>
      ) : (
        <span className="hidden lg:col-start-6 lg:block" />
      )}

      <div className="col-span-2 flex min-w-0 flex-wrap items-center gap-x-2 text-xs text-muted-foreground lg:col-span-1 lg:col-start-2 lg:row-start-1 lg:block lg:text-sm lg:text-foreground">
        {planes.map((p) => p.plan).join(" + ") || "—"}
        <span className="font-medium text-foreground tabular-nums lg:hidden">· {formatImporte(s.cuota_mensual)}/mes</span>
      </div>
      <div className="hidden text-right tabular-nums lg:col-start-3 lg:row-start-1 lg:block">{s.vigente ? formatImporte(s.cuota_mensual) : "—"}</div>
      <div className="col-span-2 min-w-0 text-xs lg:col-span-1 lg:col-start-4 lg:row-start-1 lg:text-sm">
        <MedioSocioTexto medio={s.medio} vencida={s.tarjeta_vencida} />
      </div>
      <div className="col-span-2 lg:col-span-1 lg:col-start-5 lg:row-start-1">
        <SituacionSocio s={s} />
      </div>
    </motion.li>
  );
}

function Acciones({ s, abrir }: { s: SocioDisciplina; abrir: (a: AccionPanel) => void }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <motion.button
            type="button"
            whileTap={{ scale: 0.9 }}
            aria-label={`Acciones de ${nombreSocio(s)}`}
            className="flex size-9 items-center justify-center rounded-lg border border-linea bg-white text-muted-foreground transition-colors hover:border-bordo-200 hover:text-bordo-800"
          >
            <MoreHorizontal className="size-4" />
          </motion.button>
        }
      />
      <DropdownMenuContent align="end" className="w-56">
        {s.vigente && (
          <>
            <DropdownMenuItem onClick={() => abrir({ tipo: "plan", socio: s })}>
              <ArrowRightLeft className="size-3.5" />
              Cambiar plan
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => abrir({ tipo: "medio", socio: s })}>
              <CreditCard className="size-3.5" />
              Tarjeta / medio de cobro
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => abrir({ tipo: "datos", socio: s })}>
              <UserPen className="size-3.5" />
              Datos de contacto
            </DropdownMenuItem>
          </>
        )}
        <DropdownMenuItem onClick={() => abrir({ tipo: "cobro", socio: s })}>
          <HandCoins className="size-3.5" />
          Registrar cobro
        </DropdownMenuItem>
        {s.vigente && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem variant="destructive" onClick={() => abrir({ tipo: "baja", socio: s })}>
              <UserMinus className="size-3.5" />
              Dar de baja
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
