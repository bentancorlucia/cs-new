"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import {
  Ban,
  CheckCircle2,
  Download,
  FileText,
  Mail,
  PackageCheck,
  PackagePlus,
  Pencil,
  Send,
  ShoppingCart,
  Truck,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { formatFecha, formatImporte } from "@/lib/contabilidad/formato";
import { fadeInUp, staggerContainerFast } from "@/lib/motion";
import { formatFechaHora } from "@/lib/comunicaciones/esquemas";
import type { EnvioOrdenCompra, OrdenCompraDetalle } from "@/lib/comercial/compras";
import { ConfirmarDialog } from "@/components/contabilidad/ejercicios/confirmar-dialog";
import { aprobarOrdenCompra, cancelarOrdenCompra, enviarOrdenCompra } from "@/app/(dashboard)/admin/compras/actions";
import { DialogoAccion } from "./dialogos";
import {
  BadgeEstadoOrden,
  BadgeMoneda,
  Boton,
  BotonLink,
  Campo,
  claseBoton,
  claseControl,
  EncabezadoPagina,
  Kpi,
  LinkAsiento,
  Panel,
} from "./ui";

const ESTADO_ENVIO: Record<string, { texto: string; clase: string }> = {
  pendiente: { texto: "En cola", clase: "border-dorado-300 bg-dorado-100 text-dorado-800" },
  enviando: { texto: "Enviando", clase: "border-sky-200 bg-sky-50 text-sky-800" },
  enviado: { texto: "Enviado", clase: "border-emerald-200 bg-emerald-50 text-emerald-700" },
  fallido: { texto: "Falló", clase: "border-rose-200 bg-rose-50 text-rose-700" },
  omitido: { texto: "Omitido", clase: "border-slate-200 bg-slate-100 text-slate-600" },
  cancelado: { texto: "Cancelado", clase: "border-slate-200 bg-slate-100 text-slate-600" },
};

/** Link a un archivo (no a una página): <a> común, con la misma pinta que BotonLink. */
function BotonArchivo({ href, children, nuevaPestana }: { href: string; children: React.ReactNode; nuevaPestana?: boolean }) {
  return (
    <motion.a
      href={href}
      target={nuevaPestana ? "_blank" : undefined}
      rel={nuevaPestana ? "noopener" : undefined}
      whileHover={{ y: -1 }}
      whileTap={{ scale: 0.97 }}
      className={cn("inline-flex h-10 items-center gap-2 rounded-lg px-4 text-sm font-medium transition-colors", claseBoton.secundario)}
    >
      {children}
    </motion.a>
  );
}

export function OrdenDetalle({
  orden: o,
  puedeOperar,
  emailProveedor,
  envios,
}: {
  orden: OrdenCompraDetalle;
  puedeOperar: boolean;
  emailProveedor: string | null;
  envios: EnvioOrdenCompra[];
}) {
  const router = useRouter();
  const [confirmar, setConfirmar] = useState<"aprobar" | "cancelar" | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [email, setEmail] = useState("");
  const [mensaje, setMensaje] = useState("");
  const pdf = `/api/admin/compras/ordenes/${o.id}/pdf`;
  const enviable = o.estado !== "borrador" && o.estado !== "cancelada";
  const pendientes = o.unidades - o.recibidas;
  const recibible = o.estado === "aprobada" || o.estado === "recibida_parcial";
  const cancelable = (o.estado === "borrador" || o.estado === "aprobada") && o.recepciones.every((r) => r.estado === "anulada");

  return (
    <div className="space-y-5">
      <EncabezadoPagina
        eyebrow="Orden de compra"
        titulo={
          <span className="flex flex-wrap items-center gap-3">
            {o.numero}
            <BadgeEstadoOrden estado={o.estado} />
          </span>
        }
        descripcion={
          <span className="flex flex-wrap items-center gap-x-3">
            <Link href={`/admin/proveedores/${o.proveedor_id}`} className="inline-flex items-center gap-1 hover:text-bordo-800">
              <Truck className="size-3.5" />
              {o.proveedor}
            </Link>
            <span className="tabular-nums">{formatFecha(o.fecha)}</span>
            {o.aprobada_at && <span>Aprobada el {formatFecha(o.aprobada_at)}</span>}
          </span>
        }
      >
        <BotonArchivo href={pdf} nuevaPestana>
          <FileText className="size-4" />
          Ver PDF
        </BotonArchivo>
        <BotonArchivo href={`${pdf}?descargar=1`}>
          <Download className="size-4" />
          Descargar
        </BotonArchivo>
        {puedeOperar && enviable && (
          <Boton
            variante="dorado"
            onClick={() => {
              setEmail(emailProveedor ?? "");
              setMensaje("");
              setEnviando(true);
            }}
          >
            <Send className="size-4" />
            Enviar al proveedor
          </Boton>
        )}
        {puedeOperar && o.estado === "borrador" && (
          <>
            <BotonLink href={`/admin/compras/ordenes/${o.id}/editar`} variante="secundario">
              <Pencil className="size-4" />
              Editar
            </BotonLink>
            <Boton onClick={() => setConfirmar("aprobar")}>
              <CheckCircle2 className="size-4" />
              Aprobar
            </Boton>
          </>
        )}
        {puedeOperar && recibible && (
          <BotonLink href={`/admin/compras/recepciones/nueva?orden=${o.id}`}>
            <PackagePlus className="size-4" />
            Recibir
          </BotonLink>
        )}
        {puedeOperar && cancelable && (
          <Boton variante="peligro" onClick={() => setConfirmar("cancelar")}>
            <Ban className="size-4" />
            Cancelar orden
          </Boton>
        )}
      </EncabezadoPagina>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi etiqueta="Total" delay={0.05}>
          <span className="flex items-center gap-2">
            {formatImporte(o.total, o.moneda)}
            <BadgeMoneda moneda={o.moneda} />
          </span>
        </Kpi>
        <Kpi etiqueta="Unidades" delay={0.1}>
          {o.unidades}
        </Kpi>
        <Kpi etiqueta="Recibidas" tono={o.recibidas === o.unidades && o.unidades > 0 ? "bueno" : "neutro"} delay={0.15}>
          {o.recibidas}
        </Kpi>
        <Kpi etiqueta="Pendientes" delay={0.2}>
          {o.estado === "cancelada" ? "—" : pendientes}
        </Kpi>
      </div>

      <Panel titulo="Productos" icono={ShoppingCart} delay={0.1}>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] text-sm">
            <thead>
              <tr className="border-b border-linea text-[10px] uppercase tracking-editorial text-muted-foreground">
                <th className="px-4 py-2 text-left font-normal">Producto</th>
                <th className="px-2 py-2 text-right font-normal">Pedido</th>
                <th className="px-2 py-2 text-right font-normal">Recibido</th>
                <th className="px-2 py-2 text-right font-normal">Costo unit.</th>
                <th className="px-4 py-2 text-right font-normal">Subtotal</th>
              </tr>
            </thead>
            <motion.tbody variants={staggerContainerFast} initial="hidden" animate="visible" className="divide-y divide-linea/60">
              {o.items.map((i) => (
                <motion.tr key={i.id} variants={fadeInUp}>
                  <td className="px-4 py-2.5">{i.nombre}</td>
                  <td className="px-2 py-2.5 text-right tabular-nums">{i.cantidad}</td>
                  <td
                    className={cn(
                      "px-2 py-2.5 text-right tabular-nums",
                      i.cantidad_recibida === i.cantidad ? "text-emerald-700" : i.cantidad_recibida > 0 && "text-violet-700"
                    )}
                  >
                    {i.cantidad_recibida}
                  </td>
                  <td className="px-2 py-2.5 text-right tabular-nums">{formatImporte(i.costo_unitario)}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{formatImporte(i.cantidad * i.costo_unitario)}</td>
                </motion.tr>
              ))}
            </motion.tbody>
          </table>
        </div>
        {o.notas && <p className="border-t border-linea px-4 py-2 text-xs text-muted-foreground">{o.notas}</p>}
      </Panel>

      <Panel titulo={`Recepciones (${o.recepciones.length})`} icono={PackageCheck} delay={0.15}>
        {o.recepciones.length === 0 ? (
          <p className="px-4 py-6 text-center text-sm text-muted-foreground">
            {recibible ? "Todavía no se recibió mercadería de esta orden." : "Sin recepciones."}
          </p>
        ) : (
          <ul className="divide-y divide-linea/70">
            {o.recepciones.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5 text-sm">
                <Link href={`/admin/compras/recepciones/${r.id}`} className="font-medium text-bordo-800 hover:underline">
                  {r.numero}
                </Link>
                <span className="text-xs text-muted-foreground tabular-nums">{formatFecha(r.fecha)}</span>
                {r.remito && <span className="text-xs text-muted-foreground">Remito {r.remito}</span>}
                <span className="text-xs text-muted-foreground">
                  {r.unidades} u. · facturadas {r.facturadas}
                </span>
                <span className="ml-auto flex items-center gap-2">
                  <span className="tabular-nums">{formatImporte(r.total, r.moneda)}</span>
                  <LinkAsiento id={r.asiento_id} />
                </span>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      {envios.length > 0 && (
        <Panel titulo={`Envíos al proveedor (${envios.length})`} icono={Mail} delay={0.2}>
          <motion.ul
            variants={staggerContainerFast}
            initial="hidden"
            animate="visible"
            className="divide-y divide-linea/70"
          >
            {envios.map((e) => {
              const est = ESTADO_ENVIO[e.estado] ?? ESTADO_ENVIO.omitido;
              return (
                <motion.li key={e.id} variants={fadeInUp} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5 text-sm">
                  <span className="font-medium break-all">{e.email}</span>
                  <span
                    className={cn(
                      "inline-flex h-5 items-center rounded-full border px-2 text-[11px] font-medium whitespace-nowrap",
                      est.clase
                    )}
                  >
                    {est.texto}
                  </span>
                  {e.error && e.estado !== "enviado" && <span className="text-xs text-rose-700">{e.error}</span>}
                  <span className="ml-auto text-xs text-muted-foreground tabular-nums">
                    {formatFechaHora(e.enviado_at ?? e.created_at)}
                  </span>
                </motion.li>
              );
            })}
          </motion.ul>
        </Panel>
      )}

      <DialogoAccion
        open={enviando}
        onOpenChange={setEnviando}
        icono={Send}
        titulo={`Enviar ${o.numero} a ${o.proveedor}`}
        descripcion="Sale desde el correo del club con el PDF de la orden adjunto. El mail se puede editar en Comunicaciones → Plantillas."
        textoAccion="Enviar"
        deshabilitado={!email.trim()}
        ejecutar={async () => {
          const r = await enviarOrdenCompra(o.id, { email, mensaje });
          return r.ok ? { ok: true, mensaje: `Orden enviada a ${email.trim()}` } : r;
        }}
      >
        <Campo
          etiqueta="Email del proveedor"
          ayuda={emailProveedor ? undefined : "El proveedor no tiene email cargado: escribilo acá o cargalo en su ficha."}
        >
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoFocus={!emailProveedor}
            placeholder="ventas@proveedor.com.uy"
            className={claseControl}
          />
        </Campo>
        <Campo etiqueta="Mensaje (opcional)">
          <textarea
            value={mensaje}
            onChange={(e) => setMensaje(e.target.value)}
            rows={3}
            maxLength={2000}
            placeholder="Ej.: necesitamos la entrega antes del viernes."
            className={cn(claseControl, "h-auto py-2")}
          />
        </Campo>
      </DialogoAccion>

      <ConfirmarDialog
        open={confirmar === "aprobar"}
        onOpenChange={(v) => !v && setConfirmar(null)}
        titulo={`Aprobar ${o.numero}`}
        textoAccion="Aprobar"
        textoPendiente="Aprobando…"
        mensajeExito="Orden aprobada"
        accion={async () => {
          const r = await aprobarOrdenCompra(o.id);
          if (r.ok) router.refresh();
          return r.ok ? { ok: true } : r;
        }}
      >
        <p>
          Queda lista para recibir. Total {formatImporte(o.total, o.moneda)} en {o.unidades} unidades. Una orden aprobada ya no se
          edita.
        </p>
      </ConfirmarDialog>
      <ConfirmarDialog
        open={confirmar === "cancelar"}
        onOpenChange={(v) => !v && setConfirmar(null)}
        titulo={`Cancelar ${o.numero}`}
        textoAccion="Cancelar orden"
        textoPendiente="Cancelando…"
        mensajeExito="Orden cancelada"
        destructivo
        accion={async () => {
          const r = await cancelarOrdenCompra(o.id);
          if (r.ok) router.refresh();
          return r.ok ? { ok: true } : r;
        }}
      >
        <p>La orden queda cancelada y no se puede recibir. No genera asiento.</p>
      </ConfirmarDialog>
    </div>
  );
}
