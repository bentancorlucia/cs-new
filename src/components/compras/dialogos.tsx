"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { Ban, HandCoins, Link2, type LucideIcon } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { formatFecha, formatImporte, hoyUruguay } from "@/lib/contabilidad/formato";
import { numeroDocumento, r2 } from "@/lib/comercial/compras-esquemas";
import type { DocumentoCC } from "@/lib/comercial/compras";
import {
  anularDocumento,
  anularOrdenPago,
  aplicarAnticipo,
  aplicarNotaCredito,
  leerDocumentosPendientes,
  leerTcVigente,
  pagarOrden,
} from "@/app/(dashboard)/admin/compras/actions";
import { Boton, Campo, claseControl } from "./ui";

type Res = { ok: true } | { ok: false; error: string };

/** Diálogo con formulario que ejecuta una Server Action y muestra el error de la base. */
export function DialogoAccion({
  open,
  onOpenChange,
  icono: Icono,
  titulo,
  descripcion,
  children,
  textoAccion,
  destructivo,
  deshabilitado,
  ejecutar,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  icono: LucideIcon;
  titulo: string;
  descripcion?: React.ReactNode;
  children: React.ReactNode;
  textoAccion: string;
  destructivo?: boolean;
  deshabilitado?: boolean;
  ejecutar: () => Promise<Res & { mensaje?: string }>;
}) {
  const [pendiente, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  function cambiar(o: boolean) {
    if (pendiente) return;
    if (!o) setError(null);
    onOpenChange(o);
  }

  function enviar(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    start(async () => {
      const r = await ejecutar();
      if (r.ok) {
        toast.success(r.mensaje ?? "Listo");
        onOpenChange(false);
        router.refresh();
      } else {
        setError(r.error);
        toast.error(r.error);
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={cambiar}>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={enviar} className="space-y-4">
          <DialogHeader>
            <div
              className={cn(
                "flex size-10 items-center justify-center rounded-full",
                destructivo ? "bg-rose-50 text-rose-700" : "bg-bordo-50 text-bordo-800"
              )}
            >
              <Icono className="size-5" />
            </div>
            <DialogTitle className="font-heading text-lg text-bordo-950">{titulo}</DialogTitle>
            {descripcion && <DialogDescription render={<div />}>{descripcion}</DialogDescription>}
          </DialogHeader>
          <div className="space-y-3">{children}</div>
          <AnimatePresence>
            {error && (
              <motion.div
                key={error}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1, x: [0, -6, 6, -4, 4, 0] }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.4 }}
                role="alert"
                className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-800"
              >
                {error}
              </motion.div>
            )}
          </AnimatePresence>
          <DialogFooter>
            <Boton variante="secundario" onClick={() => cambiar(false)} disabled={pendiente}>
              Cancelar
            </Boton>
            <Boton
              type="submit"
              variante={destructivo ? "peligro" : "primario"}
              pendiente={pendiente}
              disabled={deshabilitado}
              className={destructivo ? "border-rose-600 bg-rose-600 text-white hover:bg-rose-700" : undefined}
            >
              {textoAccion}
            </Boton>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ------------------------------------------------------------
// Anular (documento u orden de pago)
// ------------------------------------------------------------

export function AnularDialog({
  open,
  onOpenChange,
  tipo,
  id,
  nombre,
  aviso,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  tipo: "documento" | "pago";
  id: number;
  nombre: string;
  aviso?: string;
}) {
  const [motivo, setMotivo] = useState("");
  return (
    <DialogoAccion
      open={open}
      onOpenChange={(o) => {
        if (o) setMotivo("");
        onOpenChange(o);
      }}
      icono={Ban}
      destructivo
      titulo={`Anular ${nombre}`}
      descripcion={
        aviso ??
        "Se revierte el asiento contable con fecha de hoy. No se puede deshacer: si fue un error, cargalo de nuevo."
      }
      textoAccion="Anular"
      deshabilitado={motivo.trim().length < 3}
      ejecutar={async () => {
        const r = tipo === "documento" ? await anularDocumento({ id, motivo }) : await anularOrdenPago({ id, motivo });
        return r.ok ? { ok: true, mensaje: `${nombre} anulado` } : r;
      }}
    >
      <Campo etiqueta="Motivo">
        <textarea
          value={motivo}
          onChange={(e) => setMotivo(e.target.value)}
          rows={3}
          autoFocus
          placeholder="Ej.: factura cargada dos veces"
          className={cn(claseControl, "h-auto py-2")}
        />
      </Campo>
    </DialogoAccion>
  );
}

// ------------------------------------------------------------
// Aplicar nota de crédito o anticipo a una factura
// ------------------------------------------------------------

export function AplicarDialog({
  open,
  onOpenChange,
  origen,
  proveedorId,
  moneda,
  disponible,
  documentoId,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  origen: { tipo: "nota_credito" | "anticipo"; id: number; nombre: string };
  proveedorId: number;
  moneda: string;
  disponible: number;
  /** Factura preseleccionada (opcional). */
  documentoId?: number;
}) {
  const [docs, setDocs] = useState<DocumentoCC[] | null>(null);
  const [docId, setDocId] = useState<number | null>(documentoId ?? null);
  const [importe, setImporte] = useState("");

  useEffect(() => {
    if (!open) return;
    let vivo = true;
    leerDocumentosPendientes(proveedorId, moneda).then((r) => {
      if (!vivo) return;
      const lista = r.ok ? r.data : [];
      setDocs(lista);
      const elegido = lista.find((d) => d.id === documentoId) ?? lista[0];
      setDocId(elegido?.id ?? null);
      setImporte(elegido ? String(r2(Math.min(disponible, elegido.saldo))) : "");
      if (!r.ok) toast.error(r.error);
    });
    return () => {
      vivo = false;
    };
  }, [open, proveedorId, moneda, documentoId, disponible]);

  const doc = docs?.find((d) => d.id === docId);
  const n = Number(importe.replace(",", "."));
  const tope = doc ? r2(Math.min(disponible, doc.saldo)) : disponible;
  const error = !importe ? null : !Number.isFinite(n) || n <= 0 ? "Importe inválido" : n > tope ? `Máximo ${formatImporte(tope, moneda)}` : null;

  return (
    <DialogoAccion
      open={open}
      onOpenChange={onOpenChange}
      icono={origen.tipo === "anticipo" ? HandCoins : Link2}
      titulo={`Aplicar ${origen.nombre}`}
      descripcion={`Disponible: ${formatImporte(disponible, moneda)}. Solo se aplica a facturas o notas de débito del mismo proveedor y moneda.`}
      textoAccion="Aplicar"
      deshabilitado={!doc || !!error || !importe}
      ejecutar={async () => {
        const input = { origen_id: origen.id, documento_id: docId!, importe: n };
        const r = origen.tipo === "anticipo" ? await aplicarAnticipo(input) : await aplicarNotaCredito(input);
        return r.ok ? { ok: true, mensaje: "Aplicación registrada" } : r;
      }}
    >
      {docs === null ? (
        <div className="h-20 animate-pulse rounded-xl bg-superficie" />
      ) : docs.length === 0 ? (
        <div className="rounded-xl border border-dashed border-linea p-4 text-center text-sm text-muted-foreground">
          Este proveedor no tiene facturas pendientes en {moneda}.
        </div>
      ) : (
        <>
          <Campo etiqueta="Factura">
            <select
              value={docId ?? ""}
              onChange={(e) => {
                const id = Number(e.target.value);
                setDocId(id);
                const d = docs.find((x) => x.id === id);
                if (d) setImporte(String(r2(Math.min(disponible, d.saldo))));
              }}
              className={claseControl}
            >
              {docs.map((d) => (
                <option key={d.id} value={d.id}>
                  {numeroDocumento(d)} · vence {formatFecha(d.vencimiento ?? d.fecha)} · saldo {formatImporte(d.saldo, d.moneda)}
                </option>
              ))}
            </select>
          </Campo>
          <Campo etiqueta={`Importe a aplicar (${moneda})`} error={error}>
            <input
              inputMode="decimal"
              value={importe}
              onChange={(e) => setImporte(e.target.value)}
              aria-invalid={!!error || undefined}
              className={cn(claseControl, "text-right tabular-nums")}
            />
          </Campo>
        </>
      )}
    </DialogoAccion>
  );
}

// ------------------------------------------------------------
// Pagar una orden de pago
// ------------------------------------------------------------

export function PagarDialog({
  open,
  onOpenChange,
  id,
  numero,
  moneda,
  importe,
  cuenta,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  id: number;
  numero: string;
  moneda: string;
  importe: number;
  cuenta: string | null;
}) {
  const [fecha, setFecha] = useState(hoyUruguay());
  const [tcVigente, setTcVigente] = useState<number | null | undefined>(undefined);
  const [tc, setTc] = useState("");

  useEffect(() => {
    if (!open || moneda === "UYU") return;
    let vivo = true;
    leerTcVigente(fecha, moneda).then((r) => {
      if (vivo) setTcVigente(r.ok ? r.data : null);
    });
    return () => {
      vivo = false;
    };
  }, [open, fecha, moneda]);

  const tcN = tc ? Number(tc.replace(",", ".")) : null;
  const tcInvalido = tc !== "" && (!Number.isFinite(tcN) || (tcN ?? 0) <= 0);

  return (
    <DialogoAccion
      open={open}
      onOpenChange={(o) => {
        if (o) {
          setFecha(hoyUruguay());
          setTc("");
        }
        onOpenChange(o);
      }}
      icono={HandCoins}
      titulo={`Pagar ${numero}`}
      descripcion={
        <>
          Sale {formatImporte(importe, moneda)} de <b>{cuenta ?? "la cuenta elegida"}</b>. Se registra el asiento y se
          aplican las facturas de la orden.
        </>
      }
      textoAccion="Registrar pago"
      deshabilitado={tcInvalido || (moneda !== "UYU" && !tcN && !tcVigente)}
      ejecutar={async () => {
        const r = await pagarOrden({ id, fecha, tc: moneda === "UYU" ? null : tcN });
        return r.ok ? { ok: true, mensaje: `${numero} pagada` } : r;
      }}
    >
      <Campo etiqueta="Fecha del pago">
        <input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} className={cn(claseControl, "tabular-nums")} />
      </Campo>
      {moneda !== "UYU" && (
        <Campo
          etiqueta="Tipo de cambio"
          error={tcInvalido ? "TC inválido" : null}
          ayuda={
            tcVigente === undefined
              ? "Buscando cotización…"
              : tcVigente
                ? `Si lo dejás vacío se usa el BCU del día hábil anterior: ${String(tcVigente).replace(".", ",")}`
                : "No hay cotización anterior a esa fecha: indicá el TC"
          }
        >
          <input
            inputMode="decimal"
            value={tc}
            onChange={(e) => setTc(e.target.value)}
            placeholder={tcVigente ? String(tcVigente).replace(".", ",") : "Ej.: 40,46"}
            className={cn(claseControl, "text-right tabular-nums")}
          />
        </Campo>
      )}
    </DialogoAccion>
  );
}
