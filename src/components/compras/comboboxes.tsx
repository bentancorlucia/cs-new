"use client";

import { useState } from "react";
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
import type { ProductoOpcion, ProveedorOpcion } from "@/lib/comercial/compras";

function normalizar(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
}

/**
 * Todas las palabras buscadas tienen que aparecer (sin tildes); puntúa más
 * cuando coinciden con el principio de una palabra o con una palabra entera
 * ("remera m" prefiere el talle M a "Remera S").
 */
function filtroPalabras(value: string, search: string): number {
  const s = normalizar(search).trim();
  if (!s) return 1;
  const v = normalizar(value);
  const palabras = v.split(/[\s—-]+/).filter(Boolean);
  let puntos = 0;
  for (const p of s.split(/\s+/)) {
    if (!v.includes(p)) return 0;
    puntos += palabras.includes(p) ? 1 : palabras.some((w) => w.startsWith(p)) ? 0.7 : 0.4;
  }
  return puntos / s.split(/\s+/).length;
}

const claseTrigger =
  "group flex h-10 w-full min-w-0 items-center gap-2 rounded-lg border bg-white px-3 text-left text-sm outline-none transition-all hover:border-bordo-200 focus-visible:border-bordo-700 focus-visible:ring-3 focus-visible:ring-bordo-800/10 data-[popup-open]:border-bordo-700 data-[popup-open]:ring-3 data-[popup-open]:ring-bordo-800/10 disabled:opacity-60";

export function ProveedorCombobox({
  proveedores,
  value,
  onChange,
  invalid,
  disabled,
}: {
  proveedores: ProveedorOpcion[];
  value: number | null;
  onChange: (p: ProveedorOpcion) => void;
  invalid?: boolean;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const sel = value ? proveedores.find((p) => p.id === value) : undefined;
  const lista = proveedores.filter((p) => p.activo || p.id === value);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        disabled={disabled}
        aria-invalid={invalid || undefined}
        className={cn(claseTrigger, invalid ? "border-rose-300 bg-rose-50/40" : "border-linea")}
      >
        {sel ? (
          <span className="min-w-0 truncate text-foreground">{sel.nombre}</span>
        ) : (
          <span className="truncate text-muted-foreground">Elegí un proveedor…</span>
        )}
        <ChevronsUpDown className="ml-auto size-3.5 shrink-0 text-muted-foreground transition-colors group-hover:text-bordo-700" />
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[min(26rem,calc(100vw-2rem))] p-0">
        <Command filter={filtroPalabras}>
          <CommandInput placeholder="Buscá por nombre o RUT…" />
          <CommandList className="max-h-72">
            <CommandEmpty>No hay proveedores con ese texto.</CommandEmpty>
            <CommandGroup>
              {lista.map((p) => (
                <CommandItem
                  key={p.id}
                  value={`${p.nombre} ${p.rut ?? ""} #${p.id}`}
                  data-checked={p.id === value ? "true" : undefined}
                  onSelect={() => {
                    onChange(p);
                    setOpen(false);
                  }}
                  className="gap-2 py-2"
                >
                  <span className="min-w-0 flex-1 truncate">{p.nombre}</span>
                  {p.rut && <span className="shrink-0 font-mono text-[11px] text-muted-foreground">{p.rut}</span>}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

export function ProductoCombobox({
  productos,
  value,
  onChange,
  invalid,
  disabled,
}: {
  productos: ProductoOpcion[];
  value: string | null;
  onChange: (p: ProductoOpcion) => void;
  invalid?: boolean;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const sel = value ? productos.find((p) => p.clave === value) : undefined;
  const lista = productos.filter((p) => p.activo || p.clave === value);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        disabled={disabled}
        aria-invalid={invalid || undefined}
        className={cn(claseTrigger, invalid ? "border-rose-300 bg-rose-50/40" : "border-linea")}
      >
        {sel ? (
          <span className="min-w-0 truncate text-foreground">
            {sel.nombre}
            {sel.variante && <span className="text-muted-foreground"> — {sel.variante}</span>}
          </span>
        ) : (
          <span className="truncate text-muted-foreground">Elegí producto y variante…</span>
        )}
        <ChevronsUpDown className="ml-auto size-3.5 shrink-0 text-muted-foreground transition-colors group-hover:text-bordo-700" />
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[min(28rem,calc(100vw-2rem))] p-0">
        <Command filter={filtroPalabras}>
          <CommandInput placeholder="Buscá por producto, talle o SKU…" />
          <CommandList className="max-h-80">
            <CommandEmpty>No hay productos con ese texto.</CommandEmpty>
            <CommandGroup>
              {lista.map((p) => (
                <CommandItem
                  key={p.clave}
                  value={`${p.nombre} ${p.variante ?? ""} ${p.sku ?? ""} ${p.clave}`}
                  data-checked={p.clave === value ? "true" : undefined}
                  onSelect={() => {
                    onChange(p);
                    setOpen(false);
                  }}
                  className="gap-2 py-2"
                >
                  <span className="min-w-0 flex-1 truncate">
                    {p.nombre}
                    {p.variante && <span className="text-muted-foreground"> — {p.variante}</span>}
                  </span>
                  {p.sku && <span className="shrink-0 font-mono text-[10px] text-muted-foreground">{p.sku}</span>}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
