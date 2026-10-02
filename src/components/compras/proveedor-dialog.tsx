"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { Truck, X } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { proveedorSchema, type ProveedorInput } from "@/lib/comercial/compras-esquemas";
import type { CatalogoContable, ProveedorDatos } from "@/lib/comercial/compras";
import { CuentaCombobox } from "@/components/contabilidad/asientos/cuenta-combobox";
import { guardarProveedor } from "@/app/(dashboard)/admin/proveedores/actions";
import { Boton, Campo, claseControl, claseEtiqueta } from "./ui";

function inicial(p: ProveedorDatos | null): ProveedorInput {
  return {
    id: p?.id ?? null,
    nombre: p?.nombre ?? "",
    rut: p?.rut ?? "",
    razon_social: p?.razon_social ?? "",
    contacto_nombre: p?.contacto_nombre ?? "",
    contacto_telefono: p?.contacto_telefono ?? "",
    contacto_email: p?.contacto_email ?? "",
    direccion: p?.direccion ?? "",
    notas: p?.notas ?? "",
    activo: p?.activo ?? true,
    moneda: (p?.condiciones?.moneda as "UYU" | "USD") ?? "UYU",
    plazo_dias: p?.condiciones?.plazo_dias ?? 30,
    cuenta_gasto_id: p?.condiciones?.cuenta_gasto_id ?? null,
    centro_costo_id: p?.condiciones?.centro_costo_id ?? null,
  };
}

/** Alta y edición de proveedor con sus condiciones comerciales. */
export function ProveedorDialog({
  open,
  onOpenChange,
  proveedor,
  catalogo,
  onGuardado,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  proveedor: ProveedorDatos | null;
  catalogo: CatalogoContable;
  onGuardado?: (id: number) => void;
}) {
  const router = useRouter();
  const [f, setF] = useState<ProveedorInput>(() => inicial(proveedor));
  const [errores, setErrores] = useState<Record<string, string>>({});
  const [pendiente, start] = useTransition();
  const [abiertoPara, setAbiertoPara] = useState<number | null | undefined>(undefined);

  // Reinicia el formulario cada vez que se abre (para otro proveedor o uno nuevo).
  if (open && abiertoPara !== (proveedor?.id ?? null)) {
    setAbiertoPara(proveedor?.id ?? null);
    setF(inicial(proveedor));
    setErrores({});
  }
  if (!open && abiertoPara !== undefined) setAbiertoPara(undefined);

  const set = <K extends keyof ProveedorInput>(k: K, v: ProveedorInput[K]) => {
    setF((x) => ({ ...x, [k]: v }));
    if (errores[k as string]) setErrores((e) => ({ ...e, [k as string]: "" }));
  };

  const cuentaSel = catalogo.cuentasGasto.find((c) => c.id === f.cuenta_gasto_id);

  function guardar(e: React.FormEvent) {
    e.preventDefault();
    const p = proveedorSchema.safeParse(f);
    if (!p.success) {
      const errs: Record<string, string> = {};
      for (const i of p.error.issues) errs[String(i.path[0])] ||= i.message;
      setErrores(errs);
      toast.error(p.error.issues[0]?.message ?? "Revisá los datos");
      return;
    }
    start(async () => {
      const r = await guardarProveedor(f);
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      toast.success(proveedor ? "Proveedor actualizado" : "Proveedor creado");
      onOpenChange(false);
      if (onGuardado) onGuardado(r.id);
      else router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !pendiente && onOpenChange(o)}>
      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-2xl">
        <form onSubmit={guardar} className="space-y-5" noValidate>
          <DialogHeader>
            <div className="flex size-10 items-center justify-center rounded-full bg-bordo-50 text-bordo-800">
              <Truck className="size-5" />
            </div>
            <DialogTitle className="font-heading text-lg text-bordo-950">
              {proveedor ? `Editar ${proveedor.nombre}` : "Nuevo proveedor"}
            </DialogTitle>
            <DialogDescription>
              Datos del proveedor y condiciones que se usan por defecto al cargar facturas.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-3 sm:grid-cols-2">
            <Campo etiqueta="Nombre" error={errores.nombre} className="sm:col-span-2">
              <input
                value={f.nombre}
                onChange={(e) => set("nombre", e.target.value)}
                autoFocus
                aria-invalid={!!errores.nombre || undefined}
                className={claseControl}
                placeholder="Ej.: Textil Montevideo"
              />
            </Campo>
            <Campo etiqueta="RUT" error={errores.rut}>
              <input
                value={f.rut ?? ""}
                onChange={(e) => set("rut", e.target.value)}
                inputMode="numeric"
                aria-invalid={!!errores.rut || undefined}
                className={cn(claseControl, "font-mono")}
              />
            </Campo>
            <Campo etiqueta="Razón social" error={errores.razon_social}>
              <input value={f.razon_social ?? ""} onChange={(e) => set("razon_social", e.target.value)} className={claseControl} />
            </Campo>
            <Campo etiqueta="Contacto" error={errores.contacto_nombre}>
              <input value={f.contacto_nombre ?? ""} onChange={(e) => set("contacto_nombre", e.target.value)} className={claseControl} />
            </Campo>
            <Campo etiqueta="Teléfono" error={errores.contacto_telefono}>
              <input
                value={f.contacto_telefono ?? ""}
                onChange={(e) => set("contacto_telefono", e.target.value)}
                inputMode="tel"
                className={claseControl}
              />
            </Campo>
            <Campo etiqueta="Email" error={errores.contacto_email}>
              <input
                value={f.contacto_email ?? ""}
                onChange={(e) => set("contacto_email", e.target.value)}
                type="email"
                aria-invalid={!!errores.contacto_email || undefined}
                className={claseControl}
              />
            </Campo>
            <Campo etiqueta="Dirección" error={errores.direccion}>
              <input value={f.direccion ?? ""} onChange={(e) => set("direccion", e.target.value)} className={claseControl} />
            </Campo>
            <Campo etiqueta="Notas" className="sm:col-span-2">
              <textarea
                value={f.notas ?? ""}
                onChange={(e) => set("notas", e.target.value)}
                rows={2}
                className={cn(claseControl, "h-auto py-2")}
              />
            </Campo>
          </div>

          <div className="space-y-3 rounded-2xl border border-linea bg-superficie/50 p-3">
            <div className="font-heading text-xs uppercase tracking-editorial text-bordo-800/80">Condiciones comerciales</div>
            <div className="grid gap-3 sm:grid-cols-2">
              <Campo etiqueta="Moneda habitual">
                <select value={f.moneda} onChange={(e) => set("moneda", e.target.value as "UYU" | "USD")} className={claseControl}>
                  <option value="UYU">Pesos (UYU)</option>
                  <option value="USD">Dólares (USD)</option>
                </select>
              </Campo>
              <Campo etiqueta="Plazo de pago (días)" error={errores.plazo_dias}>
                <input
                  type="number"
                  min={0}
                  max={365}
                  value={Number.isFinite(f.plazo_dias) ? f.plazo_dias : ""}
                  onChange={(e) => set("plazo_dias", e.target.value === "" ? NaN : Number(e.target.value))}
                  aria-invalid={!!errores.plazo_dias || undefined}
                  className={cn(claseControl, "tabular-nums")}
                />
              </Campo>
              <div className="space-y-1 sm:col-span-2">
                <span className={claseEtiqueta}>Cuenta de gasto sugerida</span>
                <div className="flex gap-2">
                  <div className="min-w-0 flex-1">
                    <CuentaCombobox
                      cuentas={catalogo.cuentasGasto}
                      value={f.cuenta_gasto_id}
                      onChange={(c) => set("cuenta_gasto_id", c.id)}
                    />
                  </div>
                  <AnimatePresence>
                    {f.cuenta_gasto_id && (
                      <motion.button
                        type="button"
                        initial={{ opacity: 0, scale: 0.8 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.8 }}
                        onClick={() => set("cuenta_gasto_id", null)}
                        aria-label="Quitar cuenta"
                        className="flex size-10 shrink-0 items-center justify-center rounded-lg border border-linea bg-white text-muted-foreground hover:text-foreground"
                      >
                        <X className="size-4" />
                      </motion.button>
                    )}
                  </AnimatePresence>
                </div>
                <span className="block px-0.5 text-[11px] text-muted-foreground">
                  Se propone en las facturas de gasto de este proveedor
                  {cuentaSel?.requiere_centro_costo ? " · esta cuenta pide centro de costo" : ""}.
                </span>
              </div>
              <Campo etiqueta="Centro de costo sugerido" className="sm:col-span-2">
                <select
                  value={f.centro_costo_id ?? ""}
                  onChange={(e) => set("centro_costo_id", e.target.value || null)}
                  className={claseControl}
                >
                  <option value="">Sin centro de costo</option>
                  {catalogo.centros.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.nombre}
                    </option>
                  ))}
                </select>
              </Campo>
            </div>
          </div>

          <label className="flex items-center justify-between gap-3 rounded-xl border border-linea px-3 py-2.5">
            <span>
              <span className="block text-sm text-foreground">Activo</span>
              <span className="block text-xs text-muted-foreground">Los inactivos no aparecen al cargar compras.</span>
            </span>
            <Switch checked={f.activo} onCheckedChange={(v) => set("activo", v)} />
          </label>

          <DialogFooter>
            <Boton variante="secundario" onClick={() => onOpenChange(false)} disabled={pendiente}>
              Cancelar
            </Boton>
            <Boton type="submit" pendiente={pendiente}>
              {proveedor ? "Guardar cambios" : "Crear proveedor"}
            </Boton>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
