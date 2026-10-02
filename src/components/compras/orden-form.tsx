"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { ShoppingCart } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { easeSmooth } from "@/lib/motion";
import { ordenCompraSchema, type Moneda } from "@/lib/comercial/compras-esquemas";
import type { OrdenCompraDetalle, ProductoOpcion, ProveedorOpcion } from "@/lib/comercial/compras";
import { guardarOrdenCompra } from "@/app/(dashboard)/admin/compras/actions";
import { ProveedorCombobox } from "./comboboxes";
import { LineasProductos, aImporte, aNumero, nuevaLinea, type LineaProducto } from "./lineas-productos";
import { Boton, Campo, EncabezadoPagina, Panel, claseControl } from "./ui";

export function OrdenForm({
  proveedores,
  productos,
  hoy,
  proveedorInicial,
  orden,
}: {
  proveedores: ProveedorOpcion[];
  productos: ProductoOpcion[];
  hoy: string;
  proveedorInicial?: number | null;
  orden?: OrdenCompraDetalle | null;
}) {
  const router = useRouter();
  const [pendiente, start] = useTransition();
  const provInicial = proveedores.find((p) => p.id === (orden?.proveedor_id ?? proveedorInicial));
  const [proveedorId, setProveedorId] = useState<number | null>(provInicial?.id ?? null);
  const [fecha, setFecha] = useState(orden?.fecha ?? hoy);
  const [moneda, setMoneda] = useState<Moneda>(
    ((orden?.moneda ?? provInicial?.condiciones?.moneda ?? "UYU") as Moneda) || "UYU"
  );
  const [notas, setNotas] = useState(orden?.notas ?? "");
  const [lineas, setLineas] = useState<LineaProducto[]>(
    orden?.items.length
      ? orden.items.map((i) => ({
          uid: crypto.randomUUID(),
          clave: `${i.producto_id}:${i.variante_id ?? ""}`,
          cantidad: String(i.cantidad),
          costo: String(i.costo_unitario).replace(".", ","),
        }))
      : [nuevaLinea()]
  );
  const [errores, setErrores] = useState<Record<string, string>>({});

  function guardar(e: React.FormEvent) {
    e.preventDefault();
    const errs: Record<string, string> = {};
    const items = lineas.map((l) => {
      const p = productos.find((x) => x.clave === l.clave);
      const cantidad = aNumero(l.cantidad);
      const costo = aImporte(l.costo);
      if (!p) errs[l.uid] = "Elegí el producto";
      else if (!Number.isInteger(cantidad) || cantidad <= 0) errs[l.uid] = "La cantidad tiene que ser un entero mayor que cero";
      else if (!Number.isFinite(costo) || costo < 0) errs[l.uid] = "Indicá el costo unitario";
      return { producto_id: p?.producto_id ?? 0, variante_id: p?.variante_id ?? null, cantidad, costo_unitario: costo };
    });
    if (!proveedorId) errs.proveedor = "Elegí el proveedor";
    setErrores(errs);
    if (Object.keys(errs).length) {
      toast.error(Object.values(errs)[0]);
      return;
    }
    const input = { id: orden?.id ?? null, proveedor_id: proveedorId!, fecha, moneda, notas, items };
    const p = ordenCompraSchema.safeParse(input);
    if (!p.success) {
      toast.error(p.error.issues[0]?.message ?? "Revisá los datos");
      return;
    }
    start(async () => {
      const r = await guardarOrdenCompra(input);
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      toast.success(orden ? "Orden actualizada" : "Orden guardada como borrador");
      router.push(`/admin/compras/ordenes/${r.data}`);
    });
  }

  return (
    <form onSubmit={guardar} className="space-y-5" noValidate>
      <EncabezadoPagina
        eyebrow="Órdenes de compra"
        titulo={orden ? `Editar ${orden.numero}` : "Nueva orden de compra"}
        descripcion="Se guarda como borrador; después la aprobás y, cuando llega la mercadería, la recibís."
      />

      <Panel titulo="Datos" icono={ShoppingCart} delay={0.05}>
        <div className="grid gap-3 p-4 sm:grid-cols-[minmax(0,1fr)_10rem_10rem]">
          <Campo etiqueta="Proveedor" error={errores.proveedor}>
            <ProveedorCombobox
              proveedores={proveedores}
              value={proveedorId}
              invalid={!!errores.proveedor}
              onChange={(p) => {
                setProveedorId(p.id);
                if (p.condiciones?.moneda) setMoneda(p.condiciones.moneda as Moneda);
                setErrores((e) => ({ ...e, proveedor: "" }));
              }}
            />
          </Campo>
          <Campo etiqueta="Fecha">
            <input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} className={cn(claseControl, "tabular-nums")} />
          </Campo>
          <Campo etiqueta="Moneda">
            <select value={moneda} onChange={(e) => setMoneda(e.target.value as Moneda)} className={claseControl}>
              <option value="UYU">Pesos (UYU)</option>
              <option value="USD">Dólares (USD)</option>
            </select>
          </Campo>
          <Campo etiqueta="Notas" className="sm:col-span-3">
            <input value={notas} onChange={(e) => setNotas(e.target.value)} className={claseControl} placeholder="Opcional" />
          </Campo>
        </div>
      </Panel>

      <Panel titulo="Productos" delay={0.1}>
        <div className="p-4">
          <LineasProductos productos={productos} lineas={lineas} onChange={setLineas} moneda={moneda} errores={errores} />
        </div>
      </Panel>

      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ ...easeSmooth, delay: 0.15 }}
        className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end"
      >
        <Boton variante="secundario" onClick={() => router.back()} disabled={pendiente}>
          Cancelar
        </Boton>
        <Boton type="submit" pendiente={pendiente}>
          {orden ? "Guardar cambios" : "Guardar borrador"}
        </Boton>
      </motion.div>
    </form>
  );
}
