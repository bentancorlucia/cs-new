"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import { History, Loader2, Lock } from "lucide-react";
import { toast } from "sonner";
import { Button, buttonVariants } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { EstadoCaja } from "@/lib/comercial/caja";
import { pesos } from "@/components/pos/formato";
import { PrecioAnimado } from "@/components/pos/precio-animado";
import { springBouncy } from "@/lib/motion";
import { ContadorEfectivo, type Conteo } from "./contador-efectivo";
import { DiferenciaArqueo } from "./diferencia-arqueo";
import { TablaResumen } from "./tabla-resumen";

/** Arqueo de cierre: resumen de la sesión, conteo y diferencia contra lo esperado. */
export function DialogoCierre({
  abierto,
  estado,
  onCerrarDialogo,
  onCerrarCaja,
  onListo,
}: {
  abierto: boolean;
  estado: EstadoCaja;
  onCerrarDialogo: () => void;
  onCerrarCaja: (contado: number, notas: string | null) => Promise<{ ok: boolean; error?: string; diferencia?: number }>;
  /** Después de ver el resultado. */
  onListo: () => void;
}) {
  const [conteo, setConteo] = useState<Conteo>({ total: 0, detalle: null, cargado: false });
  const [notas, setNotas] = useState("");
  const [pendiente, iniciar] = useTransition();
  const [resultado, setResultado] = useState<{ contado: number; diferencia: number } | null>(null);

  const esperado = estado.esperado ?? 0;
  const diferencia = Math.round((conteo.total - esperado) * 100) / 100;

  const cerrar = () => {
    if (!conteo.cargado || pendiente) return;
    iniciar(async () => {
      const texto = [notas.trim(), conteo.detalle ? `Cierre: ${conteo.detalle}` : ""].filter(Boolean).join("\n");
      const r = await onCerrarCaja(conteo.total, texto || null);
      if (!r.ok) {
        toast.error(r.error ?? "No se pudo cerrar la caja");
        return;
      }
      setResultado({ contado: conteo.total, diferencia: r.diferencia ?? 0 });
    });
  };

  const limpiar = () => {
    setConteo({ total: 0, detalle: null, cargado: false });
    setNotas("");
  };

  const salir = () => {
    limpiar();
    onCerrarDialogo();
  };

  const terminar = () => {
    setResultado(null);
    limpiar();
    onListo();
  };

  return (
    <Dialog
      open={abierto || resultado !== null}
      onOpenChange={(o) => {
        if (o || pendiente) return;
        if (resultado) terminar();
        else salir();
      }}
    >
      <DialogContent className="sm:max-w-3xl max-h-[94vh] overflow-y-auto p-5" showCloseButton={!pendiente}>
        <AnimatePresence mode="wait" initial={false}>
          {resultado ? (
            <motion.div
              key="resultado"
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={springBouncy}
              className="space-y-4"
            >
              <DialogHeader>
                <DialogTitle className="font-heading text-xl flex items-center gap-2">
                  <Lock className="size-5 text-bordo-700" />
                  Caja cerrada
                </DialogTitle>
                <DialogDescription>
                  Contaste {pesos(resultado.contado)}; la contabilidad esperaba {pesos(resultado.contado - resultado.diferencia)}.
                </DialogDescription>
              </DialogHeader>
              <DiferenciaArqueo diferencia={resultado.diferencia} grande registrada />
              <div className="flex flex-col gap-2 sm:flex-row">
                <Link href="/admin/pos/caja" className={buttonVariants({ variant: "outline", className: "h-12 flex-1 gap-2" })}>
                  <History className="size-4" />
                  Ver historial
                </Link>
                <Button onClick={terminar} className="h-12 flex-1 font-heading">
                  Listo
                </Button>
              </div>
            </motion.div>
          ) : (
            <motion.div key="arqueo" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-4">
              <DialogHeader>
                <DialogTitle className="font-heading text-xl">Cerrar caja</DialogTitle>
                <DialogDescription>
                  Contá el efectivo. Si no coincide con lo esperado, la diferencia se asienta como sobrante o faltante.
                </DialogDescription>
              </DialogHeader>

              <div className="grid gap-5 md:grid-cols-2">
                <div className="space-y-3">
                  <TablaResumen filas={estado.resumen} />
                  <div className="flex items-baseline justify-between rounded-xl bg-bordo-900 px-4 py-3 text-white">
                    <span className="text-xs font-heading uppercase tracking-editorial opacity-80">Efectivo esperado</span>
                    <span className="text-2xl font-heading font-bold tabular-nums">{pesos(esperado)}</span>
                  </div>
                  <AnimatePresence initial={false}>
                    {conteo.cargado && (
                      <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 6 }}>
                        <DiferenciaArqueo diferencia={diferencia} />
                      </motion.div>
                    )}
                  </AnimatePresence>
                  <div className="space-y-1.5">
                    <label htmlFor="notas-cierre" className="text-xs font-heading uppercase tracking-editorial text-muted-foreground">
                      Notas (opcional)
                    </label>
                    <Textarea
                      id="notas-cierre"
                      value={notas}
                      onChange={(e) => setNotas(e.target.value)}
                      rows={2}
                      placeholder="Ej.: queda fondo de cambio en la caja"
                    />
                  </div>
                </div>
                <ContadorEfectivo onCambio={setConteo} />
              </div>

              <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                <Button variant="outline" onClick={salir} disabled={pendiente} className="h-12">
                  Seguir vendiendo
                </Button>
                <motion.div whileTap={{ scale: 0.97 }}>
                  <Button
                    onClick={cerrar}
                    disabled={!conteo.cargado || pendiente}
                    className="h-12 w-full sm:w-auto gap-2 font-heading"
                  >
                    {pendiente ? <Loader2 className="size-5 animate-spin" /> : <Lock className="size-5" />}
                    {conteo.cargado ? (
                      <>
                        Cerrar con <PrecioAnimado valor={conteo.total} />
                      </>
                    ) : (
                      "Contá el efectivo"
                    )}
                  </Button>
                </motion.div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </DialogContent>
    </Dialog>
  );
}
