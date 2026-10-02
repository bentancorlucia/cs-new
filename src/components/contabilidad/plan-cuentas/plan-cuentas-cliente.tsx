"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { ListTree, Target } from "lucide-react";
import { easeSmooth, springSmooth } from "@/lib/motion";
import { cn } from "@/lib/utils";
import type { CentroCostoPlan, CuentaPlan } from "@/lib/contabilidad/plan-cuentas";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ArbolCuentas } from "./arbol-cuentas";
import { CentrosCosto } from "./centros-costo";

type Pestania = "plan" | "centros";

export function PlanCuentasCliente({
  cuentas,
  centros,
  puedeEscribir,
}: {
  cuentas: CuentaPlan[];
  centros: CentroCostoPlan[];
  puedeEscribir: boolean;
}) {
  const [pestania, setPestania] = useState<Pestania>("plan");

  const pestanias: Array<{ id: Pestania; etiqueta: string; n: number; Icono: typeof ListTree }> = [
    { id: "plan", etiqueta: "Plan de cuentas", n: cuentas.length, Icono: ListTree },
    { id: "centros", etiqueta: "Centros de costo", n: centros.length, Icono: Target },
  ];

  return (
    <Tabs
      value={pestania}
      onValueChange={(v) => setPestania(v as Pestania)}
      className="gap-5"
    >
      <TabsList className="h-auto w-full rounded-full border border-linea bg-white p-1 group-data-horizontal/tabs:h-auto sm:w-fit">
        {pestanias.map(({ id, etiqueta, n, Icono }) => {
          const activa = pestania === id;
          return (
            <TabsTrigger
              key={id}
              value={id}
              className={cn(
                "h-auto flex-1 rounded-full border-0 px-3 py-2 font-heading text-sm transition-colors data-active:bg-transparent data-active:shadow-none sm:flex-none sm:px-5",
                activa ? "text-white data-active:text-white" : "text-muted-foreground hover:text-foreground"
              )}
            >
              {activa && (
                <motion.span
                  layoutId="pestania-plan-cuentas"
                  className="absolute inset-0 rounded-full bg-bordo-800"
                  transition={springSmooth}
                />
              )}
              <span className="relative flex items-center gap-2">
                <Icono className="size-4" />
                <span className="truncate">{etiqueta}</span>
                <span
                  className={cn(
                    "rounded-full px-1.5 text-[11px] tabular-nums",
                    activa ? "bg-white/20" : "bg-superficie"
                  )}
                >
                  {n}
                </span>
              </span>
            </TabsTrigger>
          );
        })}
      </TabsList>

      {/* keepMounted: el árbol conserva lo expandido y la búsqueda al cambiar de pestaña. */}
      <TabsContent value="plan" keepMounted>
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={pestania === "plan" ? { opacity: 1, y: 0 } : { opacity: 0, y: 12 }}
          transition={easeSmooth}
        >
          <ArbolCuentas cuentas={cuentas} puedeEscribir={puedeEscribir} />
        </motion.div>
      </TabsContent>
      <TabsContent value="centros" keepMounted>
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={pestania === "centros" ? { opacity: 1, y: 0 } : { opacity: 0, y: 12 }}
          transition={easeSmooth}
        >
          <CentrosCosto centros={centros} puedeEscribir={puedeEscribir} />
        </motion.div>
      </TabsContent>
    </Tabs>
  );
}
