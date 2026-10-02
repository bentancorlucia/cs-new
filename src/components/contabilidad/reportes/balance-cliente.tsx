"use client";

import { useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { Landmark, Loader2, Receipt, Scale } from "lucide-react";
import { formatFecha } from "@/lib/contabilidad/formato";
import type {
  EstadoResultados as DatosResultados,
  EstadoSituacion as DatosSituacion,
  ResultadosPorCentro,
  SumasYSaldos,
} from "@/lib/contabilidad/reportes";
import { easeSmooth, springSmooth } from "@/lib/motion";
import { Switch } from "@/components/ui/switch";
import { AccionesReporte, EncabezadoImpresion, exportarExcel } from "./acciones-reporte";
import { SumasSaldos, hojaSumasYSaldos } from "./sumas-saldos";
import { EstadoSituacion, hojaEstadoSituacion, type Detalle } from "./estado-situacion";
import { EstadoResultados, hojasEstadoResultados } from "./estado-resultados";

export type TabBalance = "sumas" | "situacion" | "resultados";

const TABS: { id: TabBalance; label: string; corto: string; icono: typeof Scale }[] = [
  { id: "sumas", label: "Sumas y saldos", corto: "Sumas y saldos", icono: Scale },
  { id: "situacion", label: "Estado de situación", corto: "Situación", icono: Landmark },
  { id: "resultados", label: "Estado de resultados", corto: "Resultados", icono: Receipt },
];

const NOMBRE_REPORTE: Record<TabBalance, string> = {
  sumas: "Balance de sumas y saldos",
  situacion: "Estado de situación patrimonial",
  resultados: "Estado de resultados (de recursos y gastos)",
};

export function BalanceCliente({
  tabInicial,
  ejercicioNombre,
  desde,
  hasta,
  sumas,
  situacion,
  resultados,
  porCentro,
  verCentros,
  incluyeCierre,
  puedeIncluirCierre,
  destacados,
}: {
  tabInicial: TabBalance;
  ejercicioNombre: string;
  desde: string;
  hasta: string;
  sumas: SumasYSaldos;
  situacion: DatosSituacion;
  resultados: DatosResultados;
  porCentro: ResultadosPorCentro | null;
  verCentros: boolean;
  incluyeCierre: boolean;
  puedeIncluirCierre: boolean;
  destacados: string[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [pendiente, startTransition] = useTransition();
  const [tab, setTab] = useState<TabBalance>(tabInicial);
  const [detalle, setDetalle] = useState<Detalle>("rubros");
  const [ocultarSinMov, setOcultarSinMov] = useState(true);
  const [centrosLocal, setCentrosLocal] = useState(verCentros);

  const navegar = (cambios: Record<string, string | null>) => {
    const p = new URLSearchParams(searchParams.toString());
    for (const [k, v] of Object.entries(cambios)) {
      if (v === null) p.delete(k);
      else p.set(k, v);
    }
    startTransition(() => router.replace(`${pathname}?${p.toString()}`, { scroll: false }));
  };

  const elegirTab = (t: TabBalance) => {
    setTab(t);
    // Solo actualiza la URL (para compartir / recargar) sin volver al servidor.
    const p = new URLSearchParams(searchParams.toString());
    p.set("tab", t);
    window.history.replaceState(null, "", `${pathname}?${p.toString()}`);
  };

  const rango = `del ${formatFecha(desde)} al ${formatFecha(hasta)}`;
  const detalleImpresion =
    tab === "situacion" ? `al ${formatFecha(hasta)} (ejercicio ${ejercicioNombre})` : `${rango} (ejercicio ${ejercicioNombre})`;

  const exportar = async () => {
    const sub = `Ejercicio ${ejercicioNombre}, ${rango}${incluyeCierre ? " · incluye cierre y refundición" : ""}`;
    if (tab === "sumas") {
      await exportarExcel(`Sumas y saldos ${desde} a ${hasta}`, [hojaSumasYSaldos(sumas, ocultarSinMov, sub)]);
    } else if (tab === "situacion") {
      await exportarExcel(`Estado de situación al ${hasta}`, [hojaEstadoSituacion(situacion, detalle, hasta, ejercicioNombre)]);
    } else {
      await exportarExcel(
        `Estado de resultados ${desde} a ${hasta}`,
        hojasEstadoResultados(resultados, centrosLocal ? porCentro : null, detalle, `Ejercicio ${ejercicioNombre}, ${rango}`)
      );
    }
  };

  const setDestacados = new Set(destacados);

  return (
    <div className="space-y-4">
      <EncabezadoImpresion reporte={NOMBRE_REPORTE[tab]} detalle={detalleImpresion} />

      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between print:hidden">
        <div className="flex w-full gap-1 overflow-x-auto rounded-full border border-linea bg-white p-1 text-xs md:w-fit [scrollbar-width:none]">
          {TABS.map(({ id, label, corto, icono: Icono }) => (
            <button
              key={id}
              type="button"
              onClick={() => elegirTab(id)}
              className={`relative flex shrink-0 items-center gap-1.5 rounded-full px-3.5 py-2 font-heading transition-colors ${
                tab === id ? "text-white" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {tab === id && (
                <motion.span layoutId="balance-tab" className="absolute inset-0 rounded-full bg-bordo-800" transition={springSmooth} />
              )}
              <Icono className="relative size-3.5" />
              <span className="relative sm:hidden">{corto}</span>
              <span className="relative hidden sm:inline">{label}</span>
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <AnimatePresence>
            {pendiente && (
              <motion.span initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                <Loader2 className="size-4 animate-spin text-bordo-700" />
              </motion.span>
            )}
          </AnimatePresence>
          {tab !== "sumas" && (
            <div className="inline-flex rounded-full border border-linea bg-white p-1 text-xs">
              {(["rubros", "cuentas"] as const).map((d) => (
                <button
                  key={d}
                  type="button"
                  onClick={() => setDetalle(d)}
                  className={`relative rounded-full px-3 py-1.5 font-heading transition-colors ${
                    detalle === d ? "text-bordo-900" : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {detalle === d && (
                    <motion.span layoutId="balance-detalle" className="absolute inset-0 rounded-full bg-dorado-100" transition={springSmooth} />
                  )}
                  <span className="relative">{d === "rubros" ? "Rubros" : "Todas las cuentas"}</span>
                </button>
              ))}
            </div>
          )}
          {tab === "sumas" && puedeIncluirCierre && (
            <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer">
              <Switch
                checked={incluyeCierre}
                onCheckedChange={(v) => navegar({ cierre: v ? "1" : null, tab: "sumas" })}
              />
              Incluir cierre y refundición
            </label>
          )}
          <AccionesReporte onExcel={exportar} />
        </div>
      </div>

      <AnimatePresence mode="wait">
        <motion.div
          key={tab}
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={easeSmooth}
        >
          {tab === "sumas" && (
            <SumasSaldos
              data={sumas}
              desde={desde}
              ocultarSinMovimiento={ocultarSinMov}
              onOcultarSinMovimiento={setOcultarSinMov}
            />
          )}
          {tab === "situacion" && (
            <EstadoSituacion data={situacion} hasta={hasta} detalle={detalle} destacados={setDestacados} />
          )}
          {tab === "resultados" && (
            <EstadoResultados
              data={resultados}
              porCentro={porCentro}
              desde={desde}
              hasta={hasta}
              detalle={detalle}
              verCentros={centrosLocal}
              cargandoCentros={pendiente && centrosLocal && !porCentro}
              onVerCentros={(v) => {
                setCentrosLocal(v);
                if (v && !porCentro) navegar({ centros: "1", tab: "resultados" });
                else if (!v) {
                  const p = new URLSearchParams(searchParams.toString());
                  p.delete("centros");
                  p.set("tab", "resultados");
                  window.history.replaceState(null, "", `${pathname}?${p.toString()}`);
                }
              }}
            />
          )}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
