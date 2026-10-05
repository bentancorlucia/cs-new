"use client";

import { useMemo, useState } from "react";
import { History, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import type { CambioDebito } from "@/lib/socios/cambios-debito";
import { ListaCambios } from "@/components/socios/cuotas/cambios";
import { BotonLink, Explicacion, Filtros, Panel, Vacio, claseControl } from "@/components/socios/cuotas/ui";

type Filtro = "todos" | "debito" | "pendiente" | "representante";

/** Registro de cambios de una disciplina (solo lectura). */
export function CambiosDisciplinaVista({
  cambios,
  error,
  verTesoreria,
}: {
  cambios: CambioDebito[];
  error: string | null;
  /** El link a Cambios de socios (Cuotas de socios es de tesorería). */
  verTesoreria: boolean;
}) {
  const [filtro, setFiltro] = useState<Filtro>("todos");
  const [texto, setTexto] = useState("");

  const visibles = useMemo(() => {
    const q = texto.trim().toLowerCase();
    return cambios.filter(
      (c) =>
        (filtro === "todos" ||
          (filtro === "debito" && c.afecta_debito) ||
          (filtro === "pendiente" && c.estado_debito === "pendiente") ||
          (filtro === "representante" && c.origen === "representante")) &&
        (!q || `${c.persona ?? ""} ${c.cedula ?? ""} ${c.numero_socio ?? ""} ${c.descripcion}`.toLowerCase().includes(q))
    );
  }, [cambios, filtro, texto]);

  const pendientes = cambios.filter((c) => c.estado_debito === "pendiente").length;

  return (
    <Panel
      titulo="Cambios"
      icono={History}
      accion={
        pendientes > 0 && verTesoreria ? (
          <BotonLink href="/cuotas/cambios?estado=pendiente" variante="secundario" className="h-8 px-3 text-xs">
            {pendientes} pendiente{pendientes === 1 ? "" : "s"} de cargar en Visa
          </BotonLink>
        ) : undefined
      }
    >
      <div className="flex flex-col gap-3 border-b border-linea p-4 sm:flex-row sm:items-center sm:justify-between">
        <Filtros<Filtro>
          id="cambios-disciplina"
          valor={filtro}
          onChange={setFiltro}
          opciones={[
            { valor: "todos", etiqueta: "Todos", cantidad: cambios.length },
            { valor: "debito", etiqueta: "Afectan el débito", cantidad: cambios.filter((c) => c.afecta_debito).length },
            { valor: "pendiente", etiqueta: "Pendientes", cantidad: pendientes },
            { valor: "representante", etiqueta: "De representantes", cantidad: cambios.filter((c) => c.origen === "representante").length },
          ]}
        />
        <div className="relative sm:w-64">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <input value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="Buscar socio…" className={cn(claseControl, "h-9 pl-9")} />
        </div>
      </div>
      {error ? (
        <p className="p-4 text-sm text-rose-700">{error}</p>
      ) : visibles.length === 0 ? (
        <div className="p-4">
          <Vacio icono={History} titulo={cambios.length === 0 ? "Todavía no hay cambios registrados" : "No hay cambios con ese filtro"} />
        </div>
      ) : (
        <ListaCambios cambios={visibles} conDisciplina={false} />
      )}
      <div className="border-t border-linea px-4 py-2">
        <Explicacion>
          Altas, bajas, tarjetas, planes y precios de la disciplina, los haga el club o un representante. Lo que afecta al débito queda pendiente hasta
          que tesorería lo carga en el portal de Visa.
        </Explicacion>
      </div>
    </Panel>
  );
}
