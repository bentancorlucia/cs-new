"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { ChevronsUpDown } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { NOMBRE_CLASE, type ClaseCuenta } from "@/lib/contabilidad/formato";
import { springBouncy } from "@/lib/motion";

export interface OpcionCuenta {
  id: string;
  codigo: string;
  nombre: string;
  clase: ClaseCuenta;
  moneda: string | null;
  activa: boolean;
}

const ORDEN_CLASES: ClaseCuenta[] = ["activo", "pasivo", "patrimonio", "ingreso", "egreso"];

/** Combobox de cuentas imputables (código + nombre), agrupadas por clase. */
export function SelectorCuenta({
  cuentas,
  valor,
  onCambiar,
}: {
  cuentas: OpcionCuenta[];
  valor: string | null;
  onCambiar: (id: string) => void;
}) {
  const [abierto, setAbierto] = useState(false);
  const actual = cuentas.find((c) => c.id === valor);

  return (
    <Popover open={abierto} onOpenChange={setAbierto}>
      <PopoverTrigger
        render={
          <motion.button
            type="button"
            whileTap={{ scale: 0.98 }}
            transition={springBouncy}
            className="flex h-11 w-full items-center gap-3 rounded-xl border border-linea bg-white px-3 text-left text-sm hover:border-bordo-200 focus:outline-none focus:ring-2 focus:ring-bordo-100 transition-colors sm:max-w-xl"
          >
            {actual ? (
              <>
                <span className="font-mono text-xs text-bordo-800 tabular-nums">{actual.codigo}</span>
                <span className="truncate font-body text-foreground">{actual.nombre}</span>
                {actual.moneda && (
                  <span className="rounded-full bg-dorado-100 px-2 py-0.5 text-[10px] font-heading text-dorado-900">
                    {actual.moneda}
                  </span>
                )}
              </>
            ) : (
              <span className="text-muted-foreground">Elegí una cuenta…</span>
            )}
            <ChevronsUpDown className="ml-auto size-4 shrink-0 text-muted-foreground" />
          </motion.button>
        }
      />
      <PopoverContent align="start" className="w-[min(92vw,32rem)] p-0">
        <Command
          filter={(value, search) => {
            const v = value.toLowerCase();
            return search
              .toLowerCase()
              .split(/\s+/)
              .filter(Boolean)
              .every((t) => v.includes(t))
              ? 1
              : 0;
          }}
        >
          <CommandInput placeholder="Buscá por código o nombre…" />
          <CommandList className="max-h-80">
            <CommandEmpty>No hay cuentas con ese texto.</CommandEmpty>
            {ORDEN_CLASES.map((clase) => {
              const lista = cuentas.filter((c) => c.clase === clase);
              if (lista.length === 0) return null;
              return (
                <CommandGroup key={clase} heading={NOMBRE_CLASE[clase]}>
                  {lista.map((c) => (
                    <CommandItem
                      key={c.id}
                      value={`${c.codigo} ${c.nombre} ${c.id}`}
                      data-checked={c.id === valor}
                      onSelect={() => {
                        setAbierto(false);
                        if (c.id !== valor) onCambiar(c.id);
                      }}
                      className="data-selected:bg-bordo-50 data-selected:text-bordo-900"
                    >
                      <span className="w-20 shrink-0 font-mono text-xs text-bordo-800 tabular-nums">
                        {c.codigo}
                      </span>
                      <span className={`truncate ${c.activa ? "" : "text-muted-foreground line-through"}`}>
                        {c.nombre}
                      </span>
                      {c.moneda && (
                        <span className="rounded-full bg-dorado-100 px-1.5 text-[10px] font-heading text-dorado-900">
                          {c.moneda}
                        </span>
                      )}
                    </CommandItem>
                  ))}
                </CommandGroup>
              );
            })}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
