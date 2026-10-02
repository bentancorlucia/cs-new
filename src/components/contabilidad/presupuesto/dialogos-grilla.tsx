"use client";

import { useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Copy, Plus, SplitSquareHorizontal } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CuentaCombobox } from "@/components/contabilidad/asientos/cuenta-combobox";
import type { CuentaOpcion } from "@/lib/contabilidad/asientos";
import { easeSnappy } from "@/lib/motion";
import {
  MESES_CORTOS,
  formatPresupuesto,
  parsearImporte,
  repartirAnual,
  type CentroPresupuesto,
  type CuentaPresupuesto,
} from "@/lib/contabilidad/presupuesto";

const claseControl =
  "h-10 w-full rounded-lg border border-linea bg-white px-3 text-sm outline-none transition-all focus:border-bordo-700 focus:ring-3 focus:ring-bordo-800/10";

/** Elegir una cuenta imputable activa de ingresos o egresos y, opcionalmente, un centro de costo. */
export function AgregarCuentaDialog({
  open,
  onOpenChange,
  cuentas,
  centros,
  centroInicial,
  onAgregar,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  cuentas: CuentaPresupuesto[];
  centros: CentroPresupuesto[];
  centroInicial: string | null;
  onAgregar: (cuentaId: string, centroId: string | null) => void;
}) {
  const [cuentaId, setCuentaId] = useState<string | null>(null);
  const [centroId, setCentroId] = useState<string>("");
  const [abiertoAntes, setAbiertoAntes] = useState(false);

  // Al abrir (lo abre el padre): sin cuenta y con el centro del filtro.
  if (open !== abiertoAntes) {
    setAbiertoAntes(open);
    if (open) {
      setCuentaId(null);
      setCentroId(centroInicial ?? "");
    }
  }

  const opciones = useMemo(() => {
    const aOpcion = (c: CuentaPresupuesto): CuentaOpcion => ({
      id: c.id,
      codigo: c.codigo,
      nombre: c.nombre,
      moneda: null,
      requiere_auxiliar: null,
      requiere_centro_costo: false,
    });
    return cuentas.filter((c) => c.imputable && c.activa).map(aOpcion);
  }, [cuentas]);

  function agregar() {
    if (!cuentaId) return;
    onAgregar(cuentaId, centroId || null);
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="flex size-10 items-center justify-center rounded-full bg-bordo-50 text-bordo-800">
            <Plus className="size-5" />
          </div>
          <DialogTitle className="font-heading text-lg text-bordo-950">Agregar cuenta</DialogTitle>
          <DialogDescription>
            Solo cuentas imputables y activas de ingresos o egresos. Una misma cuenta puede ir en varias filas, una por
            centro de costo.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label className="font-heading text-sm">Cuenta</Label>
            <CuentaCombobox cuentas={opciones} value={cuentaId} onChange={(c) => setCuentaId(c.id)} autoAbrir={open} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="centro-agregar" className="font-heading text-sm">
              Centro de costo
            </Label>
            <select
              id="centro-agregar"
              value={centroId}
              onChange={(e) => setCentroId(e.target.value)}
              className={claseControl}
            >
              <option value="">Sin centro</option>
              {centros.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nombre}
                </option>
              ))}
            </select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" className="rounded-full" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button className="rounded-full" onClick={agregar} disabled={!cuentaId}>
            <Plus className="size-3.5" />
            Agregar a la grilla
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export type ModoFila = "repartir" | "copiar";

/** Repartir un total anual en 12 meses, o poner el mismo importe en los 12. */
export function DialogoFila({
  abierto,
  onOpenChange,
  modo,
  titulo,
  meses,
  onAplicar,
}: {
  abierto: boolean;
  onOpenChange: (open: boolean) => void;
  modo: ModoFila;
  titulo: string;
  meses: number[];
  onAplicar: (meses: number[]) => void;
}) {
  const [texto, setTexto] = useState("");
  const [abiertoAntes, setAbiertoAntes] = useState(false);

  // Valor inicial al abrir: el total anual o el primer mes con importe.
  if (abierto !== abiertoAntes) {
    setAbiertoAntes(abierto);
    if (abierto) {
      const inicial = modo === "repartir" ? meses.reduce((s, x) => s + x, 0) : meses.find((x) => x > 0) ?? 0;
      setTexto(inicial ? formatPresupuesto(Math.round(inicial * 100) / 100) : "");
    }
  }

  const importe = parsearImporte(texto);
  const resultado = importe === null ? null : modo === "repartir" ? repartirAnual(importe) : Array(12).fill(importe);
  const Icono = modo === "repartir" ? SplitSquareHorizontal : Copy;

  function aplicar() {
    if (!resultado) return;
    onAplicar(resultado);
    onOpenChange(false);
  }

  return (
    <Dialog open={abierto} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="flex size-10 items-center justify-center rounded-full bg-bordo-50 text-bordo-800">
            <Icono className="size-5" />
          </div>
          <DialogTitle className="font-heading text-lg text-bordo-950">
            {modo === "repartir" ? "Repartir un total anual" : "Mismo importe todos los meses"}
          </DialogTitle>
          <DialogDescription className="truncate">{titulo}</DialogDescription>
        </DialogHeader>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            aplicar();
          }}
          className="space-y-3"
        >
          <div className="space-y-1.5">
            <Label htmlFor="importe-fila" className="font-heading text-sm">
              {modo === "repartir" ? "Total del año ($)" : "Importe por mes ($)"}
            </Label>
            <Input
              id="importe-fila"
              autoFocus
              inputMode="decimal"
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              onFocus={(e) => e.currentTarget.select()}
              aria-invalid={importe === null}
              className="h-10 text-right text-base tabular-nums"
            />
          </div>
          <AnimatePresence mode="wait">
            {resultado && (
              <motion.div
                key={resultado.join(",")}
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={easeSnappy}
                className="grid grid-cols-4 gap-1.5 rounded-xl bg-superficie/70 p-2.5 text-[11px] sm:grid-cols-6"
              >
                {resultado.map((v, i) => (
                  <div key={i} className="min-w-0">
                    <div className="text-[9px] font-heading uppercase text-muted-foreground">{MESES_CORTOS[i]}</div>
                    <div className="truncate tabular-nums">{formatPresupuesto(v) || "0"}</div>
                  </div>
                ))}
              </motion.div>
            )}
          </AnimatePresence>
          {modo === "repartir" && (
            <p className="text-[11px] text-muted-foreground">Diciembre absorbe los centésimos del redondeo.</p>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" className="rounded-full" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" className="rounded-full" disabled={!resultado}>
              Aplicar a la fila
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
