"use client";

import { useState, useTransition } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { easeSnappy } from "@/lib/motion";
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
import { Textarea } from "@/components/ui/textarea";
import { NOMBRE_CLASE } from "@/lib/contabilidad/formato";
import {
  admiteMonedaExtranjera,
  naturalezaPorDefecto,
  type CuentaPlan,
  type Naturaleza,
} from "@/lib/contabilidad/plan-cuentas";
import { crearCuenta, editarCuenta } from "@/app/(dashboard)/contabilidad/plan-de-cuentas/actions";
import { Bloqueable, FilaSwitch, Segmentado } from "./controles";

export type ModoCuentaDialog =
  | { tipo: "crear"; padre: CuentaPlan; codigoSugerido: string }
  | { tipo: "editar"; cuenta: CuentaPlan; tieneHijas: boolean };

type Auxiliar = "ninguno" | "proveedor" | "disciplina";

const MOTIVO_MOVIMIENTOS =
  "La cuenta tiene movimientos: este dato ya no se puede cambiar.";

function Campo({
  etiqueta,
  ayuda,
  htmlFor,
  children,
}: {
  etiqueta: string;
  ayuda?: string;
  htmlFor?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={htmlFor} className="block font-heading text-sm text-foreground">
        {etiqueta}
      </label>
      {children}
      {ayuda && <p className="text-xs text-muted-foreground">{ayuda}</p>}
    </div>
  );
}

export function CuentaDialog({
  modo,
  abierto,
  onClose,
  onCerrado,
  onGuardada,
}: {
  modo: ModoCuentaDialog;
  abierto: boolean;
  onClose: () => void;
  /** Al terminar la animación de cierre. */
  onCerrado: () => void;
  onGuardada?: (modo: ModoCuentaDialog) => void;
}) {
  const esCrear = modo.tipo === "crear";
  const base = esCrear ? null : modo.cuenta;
  const clase = esCrear ? modo.padre.clase : modo.cuenta.clase;
  const conMovimientos = base?.tieneMovimientos ?? false;
  const tieneHijas = modo.tipo === "editar" && modo.tieneHijas;

  const [codigo, setCodigo] = useState(esCrear ? modo.codigoSugerido : modo.cuenta.codigo);
  const [nombre, setNombre] = useState(base?.nombre ?? "");
  const [descripcion, setDescripcion] = useState(base?.descripcion ?? "");
  const [imputable, setImputable] = useState(base?.imputable ?? true);
  const [naturaleza, setNaturaleza] = useState<Naturaleza>(
    base?.naturaleza ?? naturalezaPorDefecto(clase)
  );
  const [moneda, setMoneda] = useState<"UYU" | "USD">(base?.moneda === "USD" ? "USD" : "UYU");
  const [disponibilidad, setDisponibilidad] = useState(base?.es_disponibilidad ?? false);
  const [auxiliar, setAuxiliar] = useState<Auxiliar>(base?.requiere_auxiliar ?? "ninguno");
  const [centroCosto, setCentroCosto] = useState(base?.requiere_centro_costo ?? false);
  const [activa, setActiva] = useState(base?.activa ?? true);
  const [pendiente, startTransition] = useTransition();

  const porDefecto = naturalezaPorDefecto(clase);

  function guardar(e: React.FormEvent) {
    e.preventDefault();
    if (!nombre.trim()) {
      toast.error("Escribí un nombre para la cuenta");
      return;
    }
    const flags = {
      nombre,
      descripcion,
      imputable,
      naturaleza,
      moneda,
      es_disponibilidad: disponibilidad,
      requiere_auxiliar: auxiliar,
      requiere_centro_costo: centroCosto,
    };
    startTransition(async () => {
      const res =
        modo.tipo === "crear"
          ? await crearCuenta({ ...flags, padre_id: modo.padre.id, codigo })
          : await editarCuenta({ ...flags, id: modo.cuenta.id, activa });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success(
        esCrear ? `Cuenta ${codigo} creada` : `Cuenta ${codigo} actualizada`
      );
      onGuardada?.(modo);
      onClose();
    });
  }

  return (
    <Dialog
      open={abierto}
      onOpenChange={(v) => !v && !pendiente && onClose()}
      onOpenChangeComplete={(v) => !v && onCerrado()}
    >
      <DialogContent className="max-h-[92dvh] overflow-y-auto p-5 sm:max-w-lg">
        <form onSubmit={guardar} className="space-y-5">
          <DialogHeader>
            <p className="font-heading text-[10px] uppercase tracking-editorial text-bordo-700">
              {NOMBRE_CLASE[clase]}
              {esCrear && ` · bajo ${modo.padre.codigo} ${modo.padre.nombre}`}
            </p>
            <DialogTitle className="font-heading text-xl text-bordo-900 tracking-tight">
              {esCrear ? "Agregar subcuenta" : "Editar cuenta"}
            </DialogTitle>
            <DialogDescription>
              {esCrear
                ? "Elegí el código y cómo se va a usar la cuenta. La clase y el nivel se heredan del padre."
                : conMovimientos
                  ? "La cuenta ya tiene movimientos: podés cambiar nombre, descripción, estado y algunos flags."
                  : "Cambiá los datos de la cuenta."}
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 sm:grid-cols-[9rem_1fr]">
            <Campo etiqueta="Código" htmlFor="cuenta-codigo">
              <Input
                id="cuenta-codigo"
                value={codigo}
                onChange={(e) => setCodigo(e.target.value.replace(/[^0-9.]/g, ""))}
                readOnly={!esCrear}
                disabled={!esCrear}
                inputMode="decimal"
                className="font-heading tabular-nums"
              />
            </Campo>
            <Campo etiqueta="Nombre" htmlFor="cuenta-nombre">
              <Input
                id="cuenta-nombre"
                value={nombre}
                onChange={(e) => setNombre(e.target.value)}
                placeholder="Ej. Banco cuenta corriente"
                autoFocus
                maxLength={120}
              />
            </Campo>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Campo
              etiqueta="Tipo"
              ayuda={imputable ? "Recibe movimientos" : "Agrupa subcuentas"}
            >
              <Bloqueable
                bloqueado={conMovimientos || (tieneHijas && !imputable)}
                motivo={
                  conMovimientos
                    ? MOTIVO_MOVIMIENTOS
                    : "Tiene subcuentas: no puede recibir movimientos."
                }
              >
                <Segmentado
                  ariaLabel="Tipo de cuenta"
                  valor={imputable ? "si" : "no"}
                  onChange={(v) => setImputable(v === "si")}
                  deshabilitado={conMovimientos || (tieneHijas && !imputable)}
                  opciones={[
                    { valor: "si", etiqueta: "Imputable" },
                    { valor: "no", etiqueta: "Agrupadora" },
                  ]}
                />
              </Bloqueable>
            </Campo>
            <Campo
              etiqueta="Naturaleza"
              ayuda={
                naturaleza === porDefecto
                  ? `Habitual para ${NOMBRE_CLASE[clase].toLowerCase()}`
                  : "Regularizadora (amortizaciones, previsiones)"
              }
            >
              <Bloqueable bloqueado={conMovimientos} motivo={MOTIVO_MOVIMIENTOS}>
                <Segmentado
                  ariaLabel="Naturaleza"
                  valor={naturaleza}
                  onChange={setNaturaleza}
                  deshabilitado={conMovimientos}
                  opciones={[
                    { valor: "deudora", etiqueta: "Deudora" },
                    { valor: "acreedora", etiqueta: "Acreedora" },
                  ]}
                />
              </Bloqueable>
            </Campo>
          </div>

          <AnimatePresence initial={false}>
            {imputable && (
              <motion.div
                key="imputable"
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={easeSnappy}
                className="overflow-hidden"
              >
                <div className="space-y-4 rounded-2xl border border-dashed border-linea bg-superficie/50 p-3 sm:p-4">
                  {admiteMonedaExtranjera(clase) && (
                    <Campo
                      etiqueta="Moneda"
                      ayuda={
                        moneda === "USD"
                          ? "Se revalúa con la cotización BCU al cierre."
                          : "Moneda funcional del club."
                      }
                    >
                      <Bloqueable bloqueado={conMovimientos} motivo={MOTIVO_MOVIMIENTOS}>
                        <Segmentado
                          ariaLabel="Moneda"
                          valor={moneda}
                          onChange={setMoneda}
                          deshabilitado={conMovimientos}
                          opciones={[
                            { valor: "UYU", etiqueta: "Pesos (UYU)" },
                            { valor: "USD", etiqueta: "Dólares (USD)" },
                          ]}
                        />
                      </Bloqueable>
                    </Campo>
                  )}

                  <Campo
                    etiqueta="Auxiliar"
                    ayuda="Si lo exige, cada movimiento tiene que indicar el proveedor o la disciplina."
                  >
                    <Bloqueable bloqueado={conMovimientos} motivo={MOTIVO_MOVIMIENTOS}>
                      <Segmentado
                        ariaLabel="Auxiliar requerido"
                        valor={auxiliar}
                        onChange={setAuxiliar}
                        deshabilitado={conMovimientos}
                        opciones={[
                          { valor: "ninguno", etiqueta: "Ninguno" },
                          { valor: "proveedor", etiqueta: "Proveedor" },
                          { valor: "disciplina", etiqueta: "Disciplina" },
                        ]}
                      />
                    </Bloqueable>
                  </Campo>

                  <div className="grid gap-2">
                    {clase === "activo" && (
                      <FilaSwitch
                        titulo="Caja o banco"
                        ayuda="Disponibilidad: entra en el flujo de efectivo."
                        checked={disponibilidad}
                        onChange={setDisponibilidad}
                      />
                    )}
                    <FilaSwitch
                      titulo="Exige centro de costo"
                      ayuda="Cuotas de disciplina, gastos deportivos, etc."
                      checked={centroCosto}
                      onChange={setCentroCosto}
                    />
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          <Campo etiqueta="Descripción" htmlFor="cuenta-descripcion">
            <Textarea
              id="cuenta-descripcion"
              value={descripcion}
              onChange={(e) => setDescripcion(e.target.value)}
              placeholder="Opcional: para qué se usa la cuenta"
              maxLength={500}
              className="bg-white"
            />
          </Campo>

          {!esCrear && (
            <FilaSwitch
              titulo="Cuenta activa"
              ayuda="Las inactivas no se pueden usar en asientos nuevos."
              checked={activa}
              onChange={setActiva}
            />
          )}

          <DialogFooter className="-mx-5 -mb-5 px-5">
            <Button type="button" variant="outline" onClick={onClose} disabled={pendiente}>
              Cancelar
            </Button>
            <Button
              type="submit"
              disabled={pendiente}
              className="min-w-32 bg-bordo-800 text-white hover:bg-bordo-900"
            >
              <AnimatePresence mode="wait" initial={false}>
                {pendiente ? (
                  <motion.span
                    key="cargando"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                  >
                    <Loader2 className="size-4 animate-spin" />
                  </motion.span>
                ) : (
                  <motion.span
                    key="texto"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                  >
                    {esCrear ? "Crear cuenta" : "Guardar cambios"}
                  </motion.span>
                )}
              </AnimatePresence>
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
