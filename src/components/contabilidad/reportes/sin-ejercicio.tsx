"use client";

import { CalendarPlus } from "lucide-react";
import { EmptyState } from "@/components/shared/empty-state";

/** Estado vacío cuando todavía no hay ejercicios contables (el ícono no cruza la frontera server → client). */
export function SinEjercicio({
  titulo,
  descripcion,
  anio,
  conAccion = true,
}: {
  titulo: string;
  descripcion: string;
  anio: string;
  conAccion?: boolean;
}) {
  return (
    <EmptyState
      icon={CalendarPlus}
      title={titulo}
      description={descripcion}
      action={conAccion ? { label: `Creá el ejercicio ${anio}`, href: "/contabilidad/ejercicios" } : undefined}
    />
  );
}
