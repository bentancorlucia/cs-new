"use client";

import { useMemo, useOptimistic, useState, useTransition } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Building2, Loader2, Plus, RefreshCw, Trophy } from "lucide-react";
import { toast } from "sonner";
import { easeSnappy, fadeInUp, springBouncy, staggerContainerFast } from "@/lib/motion";
import { cn } from "@/lib/utils";
import type { CentroCostoPlan } from "@/lib/contabilidad/plan-cuentas";
import {
  cambiarEstadoCentro,
  crearCentroCosto,
  sincronizarCentros,
} from "@/app/(dashboard)/contabilidad/plan-de-cuentas/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { BadgePlan } from "./controles";

type Filtro = "todos" | "disciplinas" | "areas";

export function CentrosCosto({
  centros,
  puedeEscribir,
}: {
  centros: CentroCostoPlan[];
  puedeEscribir: boolean;
}) {
  const [filtro, setFiltro] = useState<Filtro>("todos");
  const [creando, setCreando] = useState(false);
  const [montado, setMontado] = useState(false);
  const [sincronizando, startSync] = useTransition();
  const [, startToggle] = useTransition();
  const [optimistas, aplicarOptimista] = useOptimistic(
    centros,
    (estado, cambio: { id: string; activo: boolean }) =>
      estado.map((c) => (c.id === cambio.id ? { ...c, activo: cambio.activo } : c))
  );

  const visibles = useMemo(
    () =>
      optimistas.filter((c) =>
        filtro === "todos" ? true : filtro === "disciplinas" ? !!c.disciplina_id : !c.disciplina_id
      ),
    [optimistas, filtro]
  );

  const conteo = useMemo(
    () => ({
      todos: optimistas.length,
      disciplinas: optimistas.filter((c) => c.disciplina_id).length,
      areas: optimistas.filter((c) => !c.disciplina_id).length,
    }),
    [optimistas]
  );

  function alternar(centro: CentroCostoPlan, activo: boolean) {
    startToggle(async () => {
      aplicarOptimista({ id: centro.id, activo });
      const res = await cambiarEstadoCentro(centro.id, activo);
      if (!res.ok) toast.error(res.error);
      else toast.success(`${centro.nombre} ${activo ? "activado" : "desactivado"}`);
    });
  }

  function sincronizar() {
    startSync(async () => {
      const res = await sincronizarCentros();
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      const n = res.data.creados;
      toast.success(
        n === 0
          ? "Ya estaban todas las disciplinas: no hubo centros nuevos"
          : `Se ${n === 1 ? "creó 1 centro de costo" : `crearon ${n} centros de costo`}`
      );
    });
  }

  const filtros: Array<{ id: Filtro; etiqueta: string }> = [
    { id: "todos", etiqueta: "Todos" },
    { id: "disciplinas", etiqueta: "Disciplinas" },
    { id: "areas", etiqueta: "Áreas" },
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 rounded-2xl border border-linea bg-white p-3 sm:flex-row sm:items-center sm:justify-between sm:p-4">
        <div className="flex w-full rounded-full border border-linea bg-superficie p-1 text-xs sm:w-auto">
          {filtros.map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => setFiltro(f.id)}
              className={cn(
                "relative flex-1 rounded-full px-3 py-1.5 font-heading transition-colors sm:flex-none sm:px-4",
                filtro === f.id ? "text-white" : "text-muted-foreground hover:text-foreground"
              )}
            >
              {filtro === f.id && (
                <motion.span
                  layoutId="filtro-centros"
                  className="absolute inset-0 rounded-full bg-bordo-800"
                  transition={springBouncy}
                />
              )}
              <span className="relative">
                {f.etiqueta} <span className="tabular-nums opacity-70">{conteo[f.id]}</span>
              </span>
            </button>
          ))}
        </div>

        {puedeEscribir && (
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              className="flex-1 rounded-full sm:flex-none"
              onClick={sincronizar}
              disabled={sincronizando}
            >
              <RefreshCw className={cn("size-3.5", sincronizando && "animate-spin")} />
              Sincronizar con disciplinas
            </Button>
            <motion.div whileHover={{ scale: 1.02, y: -1 }} whileTap={{ scale: 0.97 }} transition={springBouncy}>
              <Button
                size="sm"
                className="rounded-full bg-bordo-800 text-white hover:bg-bordo-900"
                onClick={() => {
                  setMontado(true);
                  setCreando(true);
                }}
              >
                <Plus className="size-3.5" />
                Nuevo centro
              </Button>
            </motion.div>
          </div>
        )}
      </div>

      <div className="overflow-hidden rounded-2xl border border-linea bg-white shadow-card">
        {/* Encabezado (desktop) */}
        <div className="hidden grid-cols-[9rem_1fr_1fr_7rem] gap-4 border-b border-linea bg-superficie px-5 py-2.5 font-heading text-[10px] uppercase tracking-editorial text-muted-foreground md:grid">
          <span>Código</span>
          <span>Nombre</span>
          <span>Disciplina</span>
          <span className="text-right">Activo</span>
        </div>

        <motion.ul
          key={filtro}
          variants={staggerContainerFast}
          initial="hidden"
          animate="visible"
          className="divide-y divide-linea"
        >
          <AnimatePresence>
            {visibles.map((c) => (
              <motion.li
                key={c.id}
                layout
                variants={fadeInUp}
                exit={{ opacity: 0, height: 0 }}
                transition={easeSnappy}
                className={cn(
                  "grid grid-cols-[1fr_auto] items-center gap-x-4 gap-y-1 px-4 py-3 transition-colors hover:bg-bordo-50/40 md:grid-cols-[9rem_1fr_1fr_7rem] md:px-5",
                  !c.activo && "text-muted-foreground"
                )}
              >
                <span className="order-1 flex items-center gap-2 md:order-none">
                  <span
                    className={cn(
                      "flex size-7 shrink-0 items-center justify-center rounded-full",
                      c.disciplina_id ? "bg-dorado-50 text-dorado-700" : "bg-bordo-50 text-bordo-700"
                    )}
                  >
                    {c.disciplina_id ? <Trophy className="size-3.5" /> : <Building2 className="size-3.5" />}
                  </span>
                  <span className="font-heading text-xs tabular-nums tracking-wide">{c.codigo}</span>
                </span>
                <span className="order-3 col-span-2 min-w-0 truncate pl-9 text-sm text-foreground md:order-none md:col-span-1 md:pl-0">
                  {c.nombre}
                </span>
                <span className="order-4 col-span-2 min-w-0 truncate pl-9 text-xs text-muted-foreground md:order-none md:col-span-1 md:pl-0 md:text-sm">
                  {c.disciplinaNombre ?? (c.disciplina_id ? `Disciplina #${c.disciplina_id}` : "—")}
                </span>
                <span className="order-2 flex items-center justify-end gap-2 md:order-none">
                  {puedeEscribir ? (
                    <>
                      <span className="text-[10px] uppercase tracking-editorial text-muted-foreground md:hidden">
                        {c.activo ? "Activo" : "Inactivo"}
                      </span>
                      <Switch
                        checked={c.activo}
                        onCheckedChange={(v) => alternar(c, Boolean(v))}
                        aria-label={`${c.activo ? "Desactivar" : "Activar"} ${c.nombre}`}
                      />
                    </>
                  ) : c.activo ? (
                    <BadgePlan tono="verde">Activo</BadgePlan>
                  ) : (
                    <BadgePlan tono="apagado">Inactivo</BadgePlan>
                  )}
                </span>
              </motion.li>
            ))}
          </AnimatePresence>
        </motion.ul>

        {visibles.length === 0 && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="px-6 py-12 text-center text-sm text-muted-foreground"
          >
            {filtro === "disciplinas"
              ? "No hay centros de disciplinas. Usá “Sincronizar con disciplinas” para crearlos."
              : "No hay centros de costo en esta vista."}
          </motion.div>
        )}
      </div>

      {montado && (
        <NuevoCentroDialog
          abierto={creando}
          onClose={() => setCreando(false)}
          onCerrado={() => setMontado(false)}
        />
      )}
    </div>
  );
}

function NuevoCentroDialog({
  abierto,
  onClose,
  onCerrado,
}: {
  abierto: boolean;
  onClose: () => void;
  onCerrado: () => void;
}) {
  const [codigo, setCodigo] = useState("");
  const [nombre, setNombre] = useState("");
  const [pendiente, startTransition] = useTransition();

  function guardar(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      const res = await crearCentroCosto({ codigo, nombre });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success(`Centro ${codigo.toUpperCase()} creado`);
      onClose();
    });
  }

  return (
    <Dialog
      open={abierto}
      onOpenChange={(v) => !v && !pendiente && onClose()}
      onOpenChangeComplete={(v) => !v && onCerrado()}
    >
      <DialogContent className="p-5 sm:max-w-md">
        <form onSubmit={guardar} className="space-y-5">
          <DialogHeader>
            <DialogTitle className="font-heading text-xl text-bordo-900 tracking-tight">
              Nuevo centro de costo
            </DialogTitle>
            <DialogDescription>
              Para áreas del club que no son disciplinas. Los de disciplinas se crean con
              “Sincronizar con disciplinas”.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 sm:grid-cols-[8rem_1fr]">
            <div className="space-y-1.5">
              <label htmlFor="centro-codigo" className="block font-heading text-sm">
                Código
              </label>
              <Input
                id="centro-codigo"
                value={codigo}
                onChange={(e) => setCodigo(e.target.value.toUpperCase().replace(/[^A-Z0-9-]/g, ""))}
                placeholder="CANTINA"
                maxLength={20}
                autoFocus
                className="font-heading tracking-wide"
              />
            </div>
            <div className="space-y-1.5">
              <label htmlFor="centro-nombre" className="block font-heading text-sm">
                Nombre
              </label>
              <Input
                id="centro-nombre"
                value={nombre}
                onChange={(e) => setNombre(e.target.value)}
                placeholder="Ej. Cantina"
                maxLength={80}
              />
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            El código admite letras mayúsculas, números y guiones.
          </p>
          <DialogFooter className="-mx-5 -mb-5 px-5">
            <Button type="button" variant="outline" onClick={onClose} disabled={pendiente}>
              Cancelar
            </Button>
            <Button
              type="submit"
              disabled={pendiente || !codigo || !nombre.trim()}
              className="min-w-28 bg-bordo-800 text-white hover:bg-bordo-900"
            >
              {pendiente ? <Loader2 className="size-4 animate-spin" /> : "Crear centro"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
