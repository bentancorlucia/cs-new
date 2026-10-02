"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { Info, PackagePlus } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { formatImporte } from "@/lib/contabilidad/formato";
import { easeSmooth } from "@/lib/motion";
import { recepcionSchema, type Moneda, type RecepcionInput } from "@/lib/comercial/compras-esquemas";
import type { OrdenCompraDetalle, ProductoOpcion, ProveedorOpcion } from "@/lib/comercial/compras";
import { recibirMercaderia } from "@/app/(dashboard)/admin/compras/actions";
import { ProveedorCombobox } from "./comboboxes";
import { LineasProductos, aImporte, aNumero, nuevaLinea, totalLineas, type LineaProducto } from "./lineas-productos";
import { TcCampo, tcParaEnviar } from "./tc-campo";
import { Boton, Campo, EncabezadoPagina, ImporteAnimado, Panel, claseControl, claseEtiqueta } from "./ui";

type LineaOrden = { orden_item_id: number; cantidad: string; costo: string };

export function RecepcionForm({
  orden,
  proveedores,
  productos,
  hoy,
  proveedorInicial,
}: {
  orden: OrdenCompraDetalle | null;
  proveedores: ProveedorOpcion[];
  productos: ProductoOpcion[];
  hoy: string;
  proveedorInicial?: number | null;
}) {
  const router = useRouter();
  const [pendiente, start] = useTransition();
  // Una clave por apertura del formulario: si se reenvía (doble clic, red lenta), la base devuelve la misma recepción.
  const [clave] = useState(() => crypto.randomUUID());
  const provInicial = proveedores.find((p) => p.id === (orden?.proveedor_id ?? proveedorInicial));
  const [proveedorId, setProveedorId] = useState<number | null>(provInicial?.id ?? null);
  const [moneda, setMoneda] = useState<Moneda>(
    ((orden?.moneda ?? provInicial?.condiciones?.moneda ?? "UYU") as Moneda) || "UYU"
  );
  const [fecha, setFecha] = useState(hoy);
  const [remito, setRemito] = useState("");
  const [tc, setTc] = useState("");
  const [tcVigente, setTcVigente] = useState<number | null>(null);
  const [lineas, setLineas] = useState<LineaProducto[]>([nuevaLinea()]);
  const pendientesOrden = orden?.items.filter((i) => i.cantidad > i.cantidad_recibida) ?? [];
  const [lineasOrden, setLineasOrden] = useState<LineaOrden[]>(
    pendientesOrden.map((i) => ({
      orden_item_id: i.id,
      cantidad: String(i.cantidad - i.cantidad_recibida),
      costo: String(i.costo_unitario).replace(".", ","),
    }))
  );
  const [errores, setErrores] = useState<Record<string, string>>({});

  const totalOrden = lineasOrden.reduce((s, l) => {
    const c = aNumero(l.cantidad);
    const k = aImporte(l.costo);
    return Number.isFinite(c) && Number.isFinite(k) ? s + c * k : s;
  }, 0);
  const total = orden ? totalOrden : totalLineas(lineas);
  const tcUsado = moneda === "UYU" ? 1 : tcParaEnviar(moneda, tc) ?? tcVigente;

  function enviar(e: React.FormEvent) {
    e.preventDefault();
    const errs: Record<string, string> = {};
    let items: RecepcionInput["items"] = [];
    if (orden) {
      for (const l of lineasOrden) {
        const it = orden.items.find((i) => i.id === l.orden_item_id)!;
        const pend = it.cantidad - it.cantidad_recibida;
        const c = l.cantidad.trim() === "" ? 0 : aNumero(l.cantidad);
        const k = aImporte(l.costo);
        if (!Number.isInteger(c) || c < 0) errs[`o${l.orden_item_id}`] = "Cantidad inválida";
        else if (c > pend) errs[`o${l.orden_item_id}`] = `No podés recibir más de ${pend} (lo pendiente)`;
        else if (c > 0 && !(k >= 0)) errs[`o${l.orden_item_id}`] = "Indicá el costo";
        if (c > 0) items.push({ orden_item_id: l.orden_item_id, producto_id: null, variante_id: null, cantidad: c, costo_unitario: k });
      }
    } else {
      if (!proveedorId) errs.proveedor = "Elegí el proveedor";
      items = lineas.map((l) => {
        const p = productos.find((x) => x.clave === l.clave);
        const c = aNumero(l.cantidad);
        const k = aImporte(l.costo);
        if (!p) errs[l.uid] = "Elegí el producto";
        else if (!Number.isInteger(c) || c <= 0) errs[l.uid] = "La cantidad tiene que ser un entero mayor que cero";
        else if (!Number.isFinite(k) || k < 0) errs[l.uid] = "Indicá el costo unitario";
        return { orden_item_id: null, producto_id: p?.producto_id ?? null, variante_id: p?.variante_id ?? null, cantidad: c, costo_unitario: k };
      });
    }
    if (moneda !== "UYU" && !tcUsado) errs.tc = "Indicá el tipo de cambio";
    setErrores(errs);
    if (Object.keys(errs).length) {
      toast.error(Object.values(errs)[0]);
      return;
    }
    const input: RecepcionInput = {
      proveedor_id: (orden?.proveedor_id ?? proveedorId)!,
      orden_id: orden?.id ?? null,
      fecha,
      moneda,
      remito,
      tc: tcParaEnviar(moneda, tc),
      idempotency_key: clave,
      items,
    };
    const p = recepcionSchema.safeParse(input);
    if (!p.success) {
      toast.error(p.error.issues[0]?.message ?? "Revisá los datos");
      return;
    }
    start(async () => {
      const r = await recibirMercaderia(input);
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      toast.success("Mercadería recibida: entró al stock y se registró el asiento");
      router.push(`/admin/compras/recepciones/${r.data}`);
    });
  }

  return (
    <form onSubmit={enviar} className="space-y-5" noValidate>
      <EncabezadoPagina
        eyebrow="Recepciones"
        titulo={orden ? `Recibir ${orden.numero}` : "Recepción sin orden"}
        descripcion={
          orden ? (
            <>
              De{" "}
              <Link href={`/admin/proveedores/${orden.proveedor_id}`} className="font-medium hover:text-bordo-800">
                {orden.proveedor}
              </Link>
              . Indicá lo que llegó; no podés recibir más de lo pendiente.
            </>
          ) : (
            "Entrada de mercadería que llegó sin orden de compra."
          )
        }
      />

      <Panel titulo="Datos de la recepción" icono={PackagePlus} delay={0.05}>
        <div className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-4">
          {!orden && (
            <>
              <Campo etiqueta="Proveedor" error={errores.proveedor} className="sm:col-span-2">
                <ProveedorCombobox
                  proveedores={proveedores}
                  value={proveedorId}
                  invalid={!!errores.proveedor}
                  onChange={(p) => {
                    setProveedorId(p.id);
                    if (p.condiciones?.moneda) setMoneda(p.condiciones.moneda as Moneda);
                  }}
                />
              </Campo>
              <Campo etiqueta="Moneda">
                <select value={moneda} onChange={(e) => setMoneda(e.target.value as Moneda)} className={claseControl}>
                  <option value="UYU">Pesos (UYU)</option>
                  <option value="USD">Dólares (USD)</option>
                </select>
              </Campo>
            </>
          )}
          <Campo etiqueta="Fecha">
            <input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} className={cn(claseControl, "tabular-nums")} />
          </Campo>
          <Campo etiqueta="Remito">
            <input value={remito} onChange={(e) => setRemito(e.target.value)} className={claseControl} placeholder="Opcional" />
          </Campo>
          <div className={cn(orden ? "" : "sm:col-span-2 lg:col-span-1")}>
            <TcCampo moneda={moneda} fecha={fecha} valor={tc} onChange={setTc} onVigente={setTcVigente} />
          </div>
        </div>
      </Panel>

      <Panel titulo="Mercadería" delay={0.1}>
        <div className="p-4">
          {orden ? (
            pendientesOrden.length === 0 ? (
              <p className="py-4 text-center text-sm text-muted-foreground">Esta orden no tiene nada pendiente de recibir.</p>
            ) : (
              <div className="space-y-2">
                <div className={cn("hidden gap-2 sm:grid sm:grid-cols-[minmax(0,1fr)_5rem_7rem_8rem_8rem]", claseEtiqueta)}>
                  <span>Producto</span>
                  <span className="text-right">Pendiente</span>
                  <span className="text-right">Recibir</span>
                  <span className="text-right">Costo unitario</span>
                  <span className="text-right">Subtotal</span>
                </div>
                {pendientesOrden.map((it, i) => {
                  const l = lineasOrden[i];
                  const pend = it.cantidad - it.cantidad_recibida;
                  const c = aNumero(l.cantidad);
                  const k = aImporte(l.costo);
                  const err = errores[`o${it.id}`];
                  const set = (cambios: Partial<LineaOrden>) =>
                    setLineasOrden((ls) => ls.map((x, j) => (j === i ? { ...x, ...cambios } : x)));
                  return (
                    <motion.div
                      key={it.id}
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ ...easeSmooth, delay: i * 0.03 }}
                      className="rounded-xl border border-linea p-2 sm:border-0 sm:p-0"
                    >
                      <div className="grid grid-cols-3 gap-2 sm:grid-cols-[minmax(0,1fr)_5rem_7rem_8rem_8rem] sm:items-center">
                        <div className="col-span-3 text-sm sm:col-span-1">
                          {it.nombre}
                          {it.cantidad_recibida > 0 && (
                            <span className="ml-1 text-xs text-muted-foreground">
                              (ya recibidas {it.cantidad_recibida} de {it.cantidad})
                            </span>
                          )}
                        </div>
                        <div className="hidden text-right text-sm tabular-nums text-muted-foreground sm:block">{pend}</div>
                        <div className="flex items-center gap-1">
                          <input
                            inputMode="numeric"
                            value={l.cantidad}
                            onChange={(e) => set({ cantidad: e.target.value })}
                            aria-label={`Recibir ${it.nombre}`}
                            aria-invalid={!!err || undefined}
                            className={cn(claseControl, "text-right tabular-nums")}
                          />
                          <span className="text-xs text-muted-foreground sm:hidden">/{pend}</span>
                        </div>
                        <input
                          inputMode="decimal"
                          value={l.costo}
                          onChange={(e) => set({ costo: e.target.value })}
                          aria-label="Costo unitario"
                          className={cn(claseControl, "text-right tabular-nums")}
                        />
                        <div className="flex h-10 items-center justify-end text-sm tabular-nums">
                          {formatImporte(Number.isFinite(c) && Number.isFinite(k) ? c * k : 0)}
                        </div>
                      </div>
                      {err && <div className="px-1 pt-1 text-xs text-rose-700">{err}</div>}
                    </motion.div>
                  );
                })}
                <div className="flex justify-end pt-2">
                  <div className="text-right">
                    <div className={claseEtiqueta}>Total recibido</div>
                    <ImporteAnimado valor={total} moneda={moneda} className="font-heading text-xl" />
                  </div>
                </div>
              </div>
            )
          ) : (
            <LineasProductos productos={productos} lineas={lineas} onChange={setLineas} moneda={moneda} errores={errores} />
          )}
        </div>
      </Panel>

      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ ...easeSmooth, delay: 0.15 }}
        className="flex items-start gap-2 rounded-2xl border border-linea bg-white p-3 text-xs text-muted-foreground"
      >
        <Info className="mt-0.5 size-4 shrink-0 text-bordo-700" />
        <span>
          Asiento: Mercadería a Mercadería recibida a facturar
          {moneda !== "UYU" && tcUsado ? ` (US$ × ${String(tcUsado).replace(".", ",")} = ${formatImporte(total * tcUsado, "UYU")})` : ` por ${formatImporte(total, "UYU")}`}
          . La factura del proveedor se carga después y cancela lo recibido.
        </span>
      </motion.div>

      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Boton variante="secundario" onClick={() => router.back()} disabled={pendiente}>
          Cancelar
        </Boton>
        <Boton type="submit" pendiente={pendiente} disabled={orden ? pendientesOrden.length === 0 : false}>
          Confirmar recepción
        </Boton>
      </div>
    </form>
  );
}
