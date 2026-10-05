"use client";

import { useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import {
  AlertTriangle,
  ArrowLeft,
  BookOpen,
  Dumbbell,
  Eye,
  History,
  Layers,
  LayoutDashboard,
  Receipt,
  UserPlus,
  Users,
} from "lucide-react";
import type { DatosPanel, PestanaPanel } from "@/lib/socios/panel-disciplina";
import type { ResumenLiquidacion } from "@/lib/socios/liquidacion-resumen";
import { Aviso, Boton, Pastilla } from "@/components/socios/cuotas/ui";
import { Pestanas } from "@/components/socios/disciplinas/ui";
import { DialogosPanel, type AccionPanel } from "./dialogos";
import { ResumenPanel } from "./resumen";
import { SociosPanel } from "./socios";
import { PlanesPanel } from "./planes";
import { LiquidacionesPanel } from "./liquidaciones";
import { MorososPanel } from "./morosos";
import { CuentaPanel } from "./cuenta";
import { CambiosPanel } from "./cambios";


/** Cambia la URL sin recargar (la pestaña igual cambia si no hay historial). */
export function cambiarUrl(cambios: Record<string, string | null>) {
  try {
    const url = new URL(window.location.href);
    for (const [k, v] of Object.entries(cambios)) {
      if (v === null) url.searchParams.delete(k);
      else url.searchParams.set(k, v);
    }
    window.history.replaceState(window.history.state, "", url);
  } catch {
    // vista previa sin historial
  }
}

export function PanelDisciplina({
  datos,
  pestanaInicial,
  liquidacionInicial,
  puedeEditar,
  hoy,
  variasDisciplinas,
}: {
  datos: DatosPanel;
  pestanaInicial: PestanaPanel;
  liquidacionInicial: ResumenLiquidacion | null;
  puedeEditar: boolean;
  hoy: string;
  variasDisciplinas: boolean;
}) {
  const [pestana, setPestana] = useState<PestanaPanel>(pestanaInicial);
  const [accion, setAccion] = useState<AccionPanel | null>(null);
  const [liquidacion, setLiquidacion] = useState<number | null>(liquidacionInicial?.id ?? null);
  const { resumen, socios, planes, liquidaciones, cuenta, cambios, errores } = datos;
  const disciplina = resumen.disciplina;
  const vigentes = socios.filter((s) => s.vigente);
  const morosos = vigentes.filter((s) => !s.al_dia || s.deuda_vencida > 0 || s.vencido_disciplina > 0);
  const pendientes = cambios.filter((c) => c.estado_debito === "pendiente").length;

  function irA(p: PestanaPanel) {
    setPestana(p);
    cambiarUrl({ tab: p === "resumen" ? null : p, liquidacion: null });
  }

  function verLiquidacion(id: number | null) {
    setLiquidacion(id);
    setPestana("liquidaciones");
    cambiarUrl({ tab: "liquidaciones", liquidacion: id === null ? null : String(id) });
  }

  const abrir = puedeEditar ? setAccion : () => undefined;

  const opciones = [
    { valor: "resumen" as const, etiqueta: "Resumen", icono: LayoutDashboard },
    { valor: "socios" as const, etiqueta: "Socios", icono: Users, cantidad: vigentes.length },
    { valor: "planes" as const, etiqueta: "Planes", icono: Layers },
    { valor: "liquidaciones" as const, etiqueta: "Liquidaciones", icono: Receipt },
    { valor: "morosos" as const, etiqueta: "Morosos", icono: AlertTriangle, cantidad: morosos.length },
    { valor: "cuenta" as const, etiqueta: "Cuenta con el club", icono: BookOpen },
    { valor: "cambios" as const, etiqueta: "Cambios", icono: History, cantidad: pendientes },
  ];

  const errorPestana: Partial<Record<PestanaPanel, string | undefined>> = {
    socios: errores.socios,
    morosos: errores.socios,
    planes: errores.planes,
    liquidaciones: errores.liquidaciones,
    cuenta: errores.cuenta,
    cambios: errores.cambios,
  };

  return (
    <div className="min-w-0 space-y-5 pb-8">
      {variasDisciplinas && (
        <motion.div initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.3 }}>
          <Link
            href="/disciplina"
            className="group inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-bordo-800"
          >
            <ArrowLeft className="size-3.5 transition-transform group-hover:-translate-x-0.5" />
            Mis disciplinas
          </Link>
        </motion.div>
      )}

      <motion.header
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, ease: [0.25, 0.46, 0.45, 0.94] }}
        className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between"
      >
        <div className="flex min-w-0 items-center gap-3">
          <motion.div
            initial={{ scale: 0.8, opacity: 0, rotate: -8 }}
            animate={{ scale: 1, opacity: 1, rotate: 0 }}
            transition={{ type: "spring", stiffness: 300, damping: 22, delay: 0.05 }}
            className="flex size-14 shrink-0 items-center justify-center rounded-2xl bg-bordo-800 text-white shadow-sm"
          >
            <Dumbbell className="size-6" />
          </motion.div>
          <div className="min-w-0">
            <div className="font-heading text-[11px] uppercase tracking-editorial text-bordo-800/70">Panel de la disciplina</div>
            <h1 className="truncate font-display text-2xl uppercase tracking-tightest text-foreground sm:text-3xl">{disciplina.nombre}</h1>
            <div className="mt-1 flex flex-wrap items-center gap-1.5">
              {!disciplina.activa && <Pastilla>Inactiva</Pastilla>}
              {!puedeEditar && (
                <Pastilla tono="info">
                  <Eye className="size-3" />
                  Solo lectura
                </Pastilla>
              )}
            </div>
          </div>
        </div>
        {puedeEditar && (
          <Boton onClick={() => setAccion({ tipo: "alta" })} className="w-full sm:w-auto">
            <UserPlus className="size-4" />
            Alta de socio
          </Boton>
        )}
      </motion.header>

      <Pestanas opciones={opciones} valor={pestana} onChange={irA} />

      {errorPestana[pestana] && <Aviso titulo="No se pudo leer esta parte del panel">{errorPestana[pestana]}</Aviso>}

      <AnimatePresence mode="wait">
        <motion.div
          key={pestana}
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.28, ease: [0.25, 0.46, 0.45, 0.94] }}
          className="min-w-0 space-y-5"
          role="tabpanel"
        >
          {pestana === "resumen" && (
            <ResumenPanel
              resumen={resumen}
              cambios={cambios}
              puedeEditar={puedeEditar}
              abrir={abrir}
              irA={irA}
              verLiquidacion={verLiquidacion}
            />
          )}
          {pestana === "socios" && (
            <SociosPanel socios={socios} disciplina={disciplina} puedeEditar={puedeEditar} abrir={abrir} hoy={hoy} />
          )}
          {pestana === "planes" && <PlanesPanel planes={planes} socios={vigentes} puedeEditar={puedeEditar} abrir={abrir} hoy={hoy} />}
          {pestana === "liquidaciones" && (
            <LiquidacionesPanel
              liquidaciones={liquidaciones}
              inicial={liquidacionInicial}
              seleccion={liquidacion}
              onSeleccion={verLiquidacion}
            />
          )}
          {pestana === "morosos" && <MorososPanel morosos={morosos} puedeEditar={puedeEditar} abrir={abrir} />}
          {pestana === "cuenta" && <CuentaPanel cuenta={cuenta} saldos={resumen.cuenta} hoy={hoy} verLiquidacion={verLiquidacion} />}
          {pestana === "cambios" && <CambiosPanel cambios={cambios} socios={socios} />}
        </motion.div>
      </AnimatePresence>

      {puedeEditar && (
        <DialogosPanel
          accion={accion}
          socios={socios}
          planes={planes}
          disciplinaId={disciplina.id}
          disciplinaNombre={disciplina.nombre}
          hoy={hoy}
          onClose={() => setAccion(null)}
        />
      )}
    </div>
  );
}
