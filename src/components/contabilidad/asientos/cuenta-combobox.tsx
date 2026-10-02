"use client";

import { useRef, useState } from "react";
import { ChevronsUpDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import type { CuentaOpcion } from "@/lib/contabilidad/asientos";
import { BadgeUsd } from "./ui-asiento";

function normalizar(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
}

/**
 * Filtro de cmdk: el código se busca por prefijo (con o sin puntos) y
 * el nombre por palabras (todas tienen que aparecer, sin tildes).
 */
function filtrarCuenta(value: string, search: string): number {
  const s = normalizar(search).trim();
  if (!s) return 1;
  const v = normalizar(value);
  const [codigo] = v.split(" ");
  const sinPuntos = s.replace(/\./g, "");
  if (codigo.startsWith(s) || (sinPuntos && codigo.replace(/\./g, "").startsWith(sinPuntos))) return 1;
  return s.split(/\s+/).every((p) => v.includes(p)) ? 0.6 : 0;
}

export function CuentaCombobox({
  cuentas,
  value,
  onChange,
  invalid,
  autoAbrir = false,
  focoAlElegir,
  disabled,
}: {
  cuentas: CuentaOpcion[];
  value: string | null;
  onChange: (cuenta: CuentaOpcion) => void;
  invalid?: boolean;
  autoAbrir?: boolean;
  /** Elemento que recibe el foco después de elegir (ej. el importe). */
  focoAlElegir?: React.RefObject<HTMLElement | null>;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(autoAbrir);
  const eligio = useRef(false);
  const sel = value ? cuentas.find((c) => c.id === value) : undefined;

  return (
    <Popover open={open} onOpenChange={(o) => setOpen(o)}>
      <PopoverTrigger
        disabled={disabled}
        aria-invalid={invalid || undefined}
        className={cn(
          "group flex h-10 w-full min-w-0 items-center gap-2 rounded-lg border bg-white px-3 text-left text-sm outline-none transition-all",
          "hover:border-bordo-200 focus-visible:border-bordo-700 focus-visible:ring-3 focus-visible:ring-bordo-800/10",
          "data-[popup-open]:border-bordo-700 data-[popup-open]:ring-3 data-[popup-open]:ring-bordo-800/10",
          invalid ? "border-rose-300 bg-rose-50/40" : "border-linea",
          disabled && "opacity-60"
        )}
      >
        {sel ? (
          <>
            <span className="shrink-0 font-mono text-xs text-muted-foreground tabular-nums">{sel.codigo}</span>
            <span className="min-w-0 truncate text-foreground">{sel.nombre}</span>
            {sel.moneda && <BadgeUsd />}
          </>
        ) : (
          <span className="truncate text-muted-foreground">Elegí una cuenta…</span>
        )}
        <ChevronsUpDown className="ml-auto size-3.5 shrink-0 text-muted-foreground transition-colors group-hover:text-bordo-700" />
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-[min(30rem,calc(100vw-2rem))] p-0"
        finalFocus={() => {
          if (eligio.current) {
            eligio.current = false;
            return focoAlElegir?.current ?? true;
          }
          return true;
        }}
      >
        <Command filter={filtrarCuenta}>
          <CommandInput placeholder="Buscá por código o nombre…" />
          <CommandList className="max-h-80">
            <CommandEmpty>No hay cuentas imputables con ese texto.</CommandEmpty>
            <CommandGroup>
              {cuentas.map((c) => (
                <CommandItem
                  key={c.id}
                  value={`${c.codigo} ${c.nombre}`}
                  data-checked={c.id === value ? "true" : undefined}
                  onSelect={() => {
                    eligio.current = true;
                    onChange(c);
                    setOpen(false);
                  }}
                  className="gap-2 py-2"
                >
                  <span className="w-20 shrink-0 font-mono text-xs text-muted-foreground tabular-nums">
                    {c.codigo}
                  </span>
                  <span className="min-w-0 flex-1 truncate">{c.nombre}</span>
                  {c.moneda && <BadgeUsd />}
                  {c.requiere_auxiliar && (
                    <span className="shrink-0 text-[10px] uppercase tracking-wide text-muted-foreground">
                      {c.requiere_auxiliar}
                    </span>
                  )}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
