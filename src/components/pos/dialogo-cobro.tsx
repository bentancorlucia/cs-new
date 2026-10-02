"use client";

import { useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  Banknote,
  Building2,
  Check,
  Coins,
  Copy,
  FileImage,
  Loader2,
  Mail,
  Printer,
  ShoppingCart,
  Upload,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import { springBouncy, springSmooth } from "@/lib/motion";
import type { MetodoPagoPos, PagoTicket, TicketVenta } from "./tipos";
import { parseMonto, pesos } from "./formato";
import { CampoMonto } from "./campo-monto";
import { PrecioAnimado } from "./precio-animado";
import { ContenidoTicket, TicketImprimible, imprimirTicket } from "./ticket";

// Cuenta de cobro de la tienda (Itaú, solo tienda: 1.1.01.07 en el plan).
const BANCO = { nombre: "Itaú", cuenta: "9500100", titular: "Club Seminario" };
const TIPOS_COMPROBANTE = ["image/jpeg", "image/png", "image/webp", "application/pdf"];

export type ConfirmacionCobro = {
  metodo: MetodoPagoPos;
  montoEfectivo: number | null;
  archivo: File | null;
  pago: PagoTicket;
};

export type ResultadoVenta = { ticket: TicketVenta; pago: PagoTicket };

type LineaResumen = { key: string; texto: string; importe: number; encargue: boolean };

/** Billetes sugeridos para cobrar un total (los que el cliente suele dar). */
function sugerencias(total: number): number[] {
  if (total <= 0) return [];
  const out = new Set<number>();
  for (const paso of [100, 200, 500, 1000, 2000]) {
    const v = Math.ceil(total / paso) * paso;
    if (v > total) out.add(v);
  }
  return [...out].sort((a, b) => a - b).slice(0, 4);
}

export function DialogoCobro({
  metodo,
  total,
  lineas,
  emailAviso,
  hayEncargues,
  procesando,
  resultado,
  onConfirmar,
  onCerrar,
}: {
  metodo: MetodoPagoPos | null;
  total: number;
  lineas: LineaResumen[];
  emailAviso: string | null;
  hayEncargues: boolean;
  procesando: boolean;
  resultado: ResultadoVenta | null;
  onConfirmar: (c: ConfirmacionCobro) => void;
  onCerrar: () => void;
}) {
  const abierto = metodo !== null || resultado !== null;
  return (
    <Dialog open={abierto} onOpenChange={(o) => !o && !procesando && onCerrar()}>
      <DialogContent className="sm:max-w-2xl max-h-[94vh] overflow-y-auto p-5" showCloseButton={!procesando}>
        <AnimatePresence mode="wait" initial={false}>
          {resultado ? (
            <VentaHecha key="hecha" resultado={resultado} onNueva={onCerrar} />
          ) : metodo ? (
            <motion.div
              key={`form-${metodo}`}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={springSmooth}
            >
              {metodo === "efectivo" ? (
                <CobroEfectivo
                  total={total}
                  lineas={lineas}
                  emailAviso={emailAviso}
                  hayEncargues={hayEncargues}
                  procesando={procesando}
                  onConfirmar={onConfirmar}
                  onCancelar={onCerrar}
                />
              ) : (
                <CobroTransferencia
                  mixto={metodo === "mixto"}
                  total={total}
                  procesando={procesando}
                  onConfirmar={onConfirmar}
                  onCancelar={onCerrar}
                />
              )}
            </motion.div>
          ) : null}
        </AnimatePresence>
      </DialogContent>
    </Dialog>
  );
}

// ─── Efectivo ──────────────────────────────────────────────

function CobroEfectivo({
  total,
  lineas,
  emailAviso,
  hayEncargues,
  procesando,
  onConfirmar,
  onCancelar,
}: {
  total: number;
  lineas: LineaResumen[];
  emailAviso: string | null;
  hayEncargues: boolean;
  procesando: boolean;
  onConfirmar: (c: ConfirmacionCobro) => void;
  onCancelar: () => void;
}) {
  const [recibidoTxt, setRecibidoTxt] = useState("");
  const recibido = parseMonto(recibidoTxt);
  const conRecibido = recibidoTxt.trim() !== "";
  const falta = conRecibido && recibido < total ? Math.round((total - recibido) * 100) / 100 : 0;
  const vuelto = conRecibido && recibido >= total ? Math.round((recibido - total) * 100) / 100 : 0;
  const opciones = useMemo(() => sugerencias(total), [total]);

  const confirmar = () => {
    if (procesando || falta > 0) return;
    onConfirmar({
      metodo: "efectivo",
      montoEfectivo: null,
      archivo: null,
      pago: { recibido: conRecibido ? recibido : total, vuelto },
    });
  };

  return (
    <div className="space-y-4">
      <DialogHeader>
        <DialogTitle className="font-heading flex items-center gap-2">
          <Banknote className="size-5 text-green-600" />
          Cobro en efectivo
        </DialogTitle>
        <DialogDescription>
          {hayEncargues
            ? "Los encargues no descuentan stock y quedan como Encargado hasta que lleguen."
            : "Se descuenta el stock y el efectivo entra a la caja."}
        </DialogDescription>
      </DialogHeader>

      <div className="grid gap-5 sm:grid-cols-2">
        <div className="space-y-3">
          <div className="rounded-xl bg-superficie p-3 space-y-1.5 max-h-48 overflow-y-auto">
            {lineas.map((l) => (
              <div key={l.key} className="flex justify-between gap-2 text-sm font-body">
                <span className="truncate">
                  {l.texto}
                  {l.encargue && <span className="ml-1.5 text-xs text-bordo-700">(encargue)</span>}
                </span>
                <span className="font-medium tabular-nums">{pesos(l.importe)}</span>
              </div>
            ))}
          </div>
          <div className="flex items-baseline justify-between rounded-xl bg-bordo-900 text-white px-4 py-3">
            <span className="text-sm font-heading uppercase tracking-editorial opacity-80">Total</span>
            <span className="text-3xl font-heading font-bold tabular-nums">{pesos(total)}</span>
          </div>

          <div className="flex flex-wrap gap-2">
            <motion.button
              type="button"
              whileTap={{ scale: 0.94 }}
              onClick={() => setRecibidoTxt(String(total).replace(".", ","))}
              className="h-11 rounded-xl border border-green-200 bg-green-50 px-4 text-sm font-heading font-semibold text-green-800 hover:bg-green-100"
            >
              Justo
            </motion.button>
            {opciones.map((v) => (
              <motion.button
                key={v}
                type="button"
                whileTap={{ scale: 0.94 }}
                onClick={() => setRecibidoTxt(String(v))}
                className="h-11 rounded-xl border border-linea bg-white px-4 text-sm font-heading font-semibold tabular-nums hover:border-bordo-300 hover:bg-bordo-50"
              >
                {pesos(v)}
              </motion.button>
            ))}
          </div>

          <motion.div
            layout
            className={`rounded-xl px-4 py-3 transition-colors ${
              falta > 0 ? "bg-red-50 text-red-700" : vuelto > 0 ? "bg-dorado-300/25 text-bordo-900" : "bg-green-50 text-green-800"
            }`}
          >
            <p className="text-xs font-heading uppercase tracking-editorial opacity-80">
              {falta > 0 ? "Falta" : "Vuelto"}
            </p>
            <p className="text-4xl font-heading font-bold">
              <PrecioAnimado valor={falta > 0 ? falta : vuelto} />
            </p>
          </motion.div>

          {emailAviso && (
            <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Mail className="size-3.5 shrink-0" />
              Se enviará la confirmación a {emailAviso}
            </p>
          )}
        </div>

        <CampoMonto
          etiqueta="Recibido (vacío = justo)"
          valor={recibidoTxt}
          onChange={setRecibidoTxt}
          invalido={falta > 0}
        />
      </div>

      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button variant="outline" onClick={onCancelar} disabled={procesando} className="h-12">
          Cancelar
        </Button>
        <motion.div whileTap={{ scale: 0.97 }}>
          <Button
            onClick={confirmar}
            disabled={procesando || falta > 0}
            className="h-12 w-full sm:w-auto bg-green-600 hover:bg-green-700 text-white gap-2 text-base font-heading"
          >
            {procesando ? <Loader2 className="size-5 animate-spin" /> : <Banknote className="size-5" />}
            Cobrar {pesos(total)}
          </Button>
        </motion.div>
      </div>
    </div>
  );
}

// ─── Transferencia / mixto ─────────────────────────────────

function CobroTransferencia({
  mixto,
  total,
  procesando,
  onConfirmar,
  onCancelar,
}: {
  mixto: boolean;
  total: number;
  procesando: boolean;
  onConfirmar: (c: ConfirmacionCobro) => void;
  onCancelar: () => void;
}) {
  const [efectivoTxt, setEfectivoTxt] = useState("");
  const [recibidoTxt, setRecibidoTxt] = useState("");
  const [archivo, setArchivo] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [copiada, setCopiada] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const efectivo = parseMonto(efectivoTxt);
  const mixtoValido = efectivo > 0 && efectivo < total;
  const transferir = mixto ? Math.max(Math.round((total - efectivo) * 100) / 100, 0) : total;
  const recibido = parseMonto(recibidoTxt);
  const vuelto = mixto && recibidoTxt && recibido > efectivo ? Math.round((recibido - efectivo) * 100) / 100 : 0;
  const recibidoCorto = mixto && recibidoTxt.trim() !== "" && recibido < efectivo;

  const elegir = (f: File | null) => {
    if (!f) return;
    if (!TIPOS_COMPROBANTE.includes(f.type)) {
      toast.error("Formato no permitido. Usá JPG, PNG, WebP o PDF.");
      return;
    }
    if (f.size > 10 * 1024 * 1024) {
      toast.error("El archivo no puede superar 10MB");
      return;
    }
    setArchivo(f);
    setPreview((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return f.type.startsWith("image/") ? URL.createObjectURL(f) : null;
    });
  };

  const quitar = () => {
    if (preview) URL.revokeObjectURL(preview);
    setArchivo(null);
    setPreview(null);
    if (inputRef.current) inputRef.current.value = "";
  };

  const copiar = () => {
    navigator.clipboard?.writeText(BANCO.cuenta).catch(() => {});
    setCopiada(true);
    setTimeout(() => setCopiada(false), 1800);
  };

  const puede = !!archivo && !procesando && (!mixto || (mixtoValido && !recibidoCorto));

  const confirmar = () => {
    if (!puede) return;
    onConfirmar({
      metodo: mixto ? "mixto" : "transferencia",
      montoEfectivo: mixto ? efectivo : null,
      archivo,
      pago: mixto ? { recibido: recibidoTxt ? recibido : efectivo, vuelto } : { recibido: null, vuelto: null },
    });
  };

  const datosBanco = (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-superficie rounded-xl p-4 space-y-2"
    >
      <div className="flex items-center gap-2">
        <Building2 className="size-4 text-bordo-700" />
        <span className="font-heading font-bold text-sm text-bordo-800">Datos para transferir</span>
      </div>
      <div className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm font-body">
        <span className="text-muted-foreground">Banco</span>
        <span className="font-medium">{BANCO.nombre}</span>
        <span className="text-muted-foreground">Cuenta</span>
        <span className="flex items-center gap-2">
          <span className="font-mono font-bold text-bordo-800">{BANCO.cuenta}</span>
          <motion.button
            type="button"
            whileTap={{ scale: 0.9 }}
            onClick={copiar}
            className="p-1 text-muted-foreground hover:text-bordo-700"
            title="Copiar número de cuenta"
          >
            {copiada ? <Check className="size-4 text-green-600" /> : <Copy className="size-4" />}
          </motion.button>
        </span>
        <span className="text-muted-foreground">Titular</span>
        <span className="font-medium">{BANCO.titular}</span>
      </div>
      <div className="flex justify-between border-t border-linea pt-2 font-heading font-bold text-lg">
        <span>A transferir</span>
        <PrecioAnimado valor={mixto && !mixtoValido ? 0 : transferir} className="text-bordo-800" />
      </div>
    </motion.div>
  );

  const comprobante = (
    <div className="space-y-2">
      <p className="text-xs font-heading uppercase tracking-editorial text-muted-foreground">
        Comprobante de la transferencia
      </p>
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,application/pdf"
        className="hidden"
        onChange={(e) => elegir(e.target.files?.[0] ?? null)}
      />
      <AnimatePresence mode="wait" initial={false}>
        {archivo ? (
          <motion.div
            key="archivo"
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.96 }}
            className="flex items-center gap-3 rounded-xl border-2 border-green-200 bg-green-50/60 p-3"
          >
            {preview ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={preview} alt="Comprobante" className="size-16 rounded-lg object-cover border border-linea" />
            ) : (
              <div className="size-16 rounded-lg bg-white flex items-center justify-center border border-linea">
                <FileImage className="size-6 text-muted-foreground" />
              </div>
            )}
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{archivo.name}</p>
              <p className="text-xs text-muted-foreground">{(archivo.size / 1024).toFixed(0)} KB</p>
            </div>
            <button type="button" onClick={quitar} className="p-2 text-muted-foreground hover:text-red-600" aria-label="Quitar comprobante">
              <X className="size-5" />
            </button>
          </motion.div>
        ) : (
          <motion.button
            key="subir"
            type="button"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            whileHover={{ scale: 1.01 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => inputRef.current?.click()}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              elegir(e.dataTransfer.files?.[0] ?? null);
            }}
            className="w-full border-2 border-dashed border-gray-300 hover:border-bordo-400 rounded-xl p-6 flex flex-col items-center gap-2 text-muted-foreground hover:text-bordo-700 transition-colors"
          >
            <Upload className="size-6" />
            <span className="text-sm font-medium">Sacar foto o subir comprobante</span>
            <span className="text-xs">JPG, PNG, WebP o PDF (máx. 10MB)</span>
          </motion.button>
        )}
      </AnimatePresence>
    </div>
  );

  return (
    <div className="space-y-4">
      <DialogHeader>
        <DialogTitle className="font-heading flex items-center gap-2">
          {mixto ? <Coins className="size-5 text-bordo-700" /> : <Building2 className="size-5 text-amber-600" />}
          {mixto ? "Pago mixto: efectivo + transferencia" : "Pago por transferencia"}
        </DialogTitle>
        <DialogDescription>
          {mixto
            ? "El efectivo entra a la caja ahora; la transferencia queda pendiente de verificación."
            : "La venta queda pendiente hasta verificar la transferencia en Pedidos."}
        </DialogDescription>
      </DialogHeader>

      {mixto ? (
        <div className="grid gap-5 sm:grid-cols-2">
          <div className="space-y-3">
            <div className="flex items-baseline justify-between rounded-xl bg-bordo-900 text-white px-4 py-3">
              <span className="text-sm font-heading uppercase tracking-editorial opacity-80">Total</span>
              <span className="text-2xl font-heading font-bold tabular-nums">{pesos(total)}</span>
            </div>
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div className="rounded-xl bg-green-50 px-3 py-2">
                <p className="text-xs text-green-700">Efectivo</p>
                <p className="font-heading font-bold text-green-700 text-lg">
                  <PrecioAnimado valor={mixtoValido ? efectivo : 0} />
                </p>
              </div>
              <div className="rounded-xl bg-amber-50 px-3 py-2">
                <p className="text-xs text-amber-700">Transferencia</p>
                <p className="font-heading font-bold text-amber-700 text-lg">
                  <PrecioAnimado valor={mixtoValido ? transferir : 0} />
                </p>
              </div>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-heading uppercase tracking-editorial text-muted-foreground" htmlFor="recibido-mixto">
                Efectivo recibido (para el vuelto)
              </label>
              <input
                id="recibido-mixto"
                value={recibidoTxt}
                onChange={(e) => setRecibidoTxt(e.target.value.replace(/[^\d,.]/g, ""))}
                inputMode="decimal"
                placeholder="Igual al efectivo"
                className="w-full h-12 rounded-xl border border-linea bg-white px-3 text-lg font-heading tabular-nums outline-none focus:border-bordo-500"
              />
              <AnimatePresence initial={false}>
                {(vuelto > 0 || recibidoCorto) && (
                  <motion.p
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                    className={`text-sm font-heading font-semibold ${recibidoCorto ? "text-red-600" : "text-bordo-800"}`}
                  >
                    {recibidoCorto ? "Recibido menor que el efectivo" : `Vuelto: ${pesos(vuelto)}`}
                  </motion.p>
                )}
              </AnimatePresence>
            </div>
            {datosBanco}
            {comprobante}
          </div>
          <CampoMonto
            etiqueta="Parte en efectivo"
            valor={efectivoTxt}
            onChange={setEfectivoTxt}
            invalido={efectivoTxt !== "" && !mixtoValido}
            ayuda={
              <AnimatePresence initial={false}>
                {efectivoTxt !== "" && !mixtoValido && (
                  <motion.p
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                    className="text-xs text-red-600"
                  >
                    Tiene que ser mayor a $0 y menor al total
                  </motion.p>
                )}
              </AnimatePresence>
            }
          />
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {datosBanco}
          {comprobante}
        </div>
      )}

      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button variant="outline" onClick={onCancelar} disabled={procesando} className="h-12">
          Cancelar
        </Button>
        <motion.div whileTap={{ scale: 0.97 }}>
          <Button
            onClick={confirmar}
            disabled={!puede}
            className="h-12 w-full sm:w-auto bg-amber-500 hover:bg-amber-600 text-white gap-2 text-base font-heading"
          >
            {procesando ? <Loader2 className="size-5 animate-spin" /> : <Building2 className="size-5" />}
            {procesando ? "Registrando…" : `Confirmar ${pesos(total)}`}
          </Button>
        </motion.div>
      </div>
    </div>
  );
}

// ─── Venta registrada + ticket ─────────────────────────────

function VentaHecha({ resultado, onNueva }: { resultado: ResultadoVenta; onNueva: () => void }) {
  const { ticket, pago } = resultado;
  const pendiente = ticket.estado === "pendiente_verificacion";
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.96 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0 }}
      transition={springBouncy}
      className="grid gap-5 sm:grid-cols-[1fr_auto]"
    >
      <TicketImprimible ticket={ticket} pago={pago} />
      <div className="flex flex-col items-center sm:items-start text-center sm:text-left">
        <motion.div
          initial={{ scale: 0, rotate: -20 }}
          animate={{ scale: 1, rotate: 0 }}
          transition={{ ...springBouncy, delay: 0.08 }}
          className={`size-16 rounded-full flex items-center justify-center mb-3 ${pendiente ? "bg-amber-100" : "bg-green-100"}`}
        >
          <Check className={`size-8 ${pendiente ? "text-amber-600" : "text-green-600"}`} />
        </motion.div>
        <DialogTitle className="font-heading text-xl">Venta {ticket.numero_pedido} registrada</DialogTitle>
        <p className="mt-1 text-sm text-muted-foreground">
          {pendiente
            ? ticket.metodo_pago === "mixto"
              ? "El efectivo quedó en la caja; la transferencia se verifica en Pedidos."
              : "Pendiente de verificar la transferencia en Pedidos."
            : ticket.estado === "encargado"
              ? "Cobrado. El encargue queda como Encargado hasta que llegue."
              : "Cobrado y descontado del stock."}
        </p>

        {pago.vuelto != null && pago.vuelto > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ ...springSmooth, delay: 0.15 }}
            className="mt-4 w-full rounded-xl bg-dorado-300/25 px-4 py-3"
          >
            <p className="text-xs font-heading uppercase tracking-editorial text-bordo-800">Vuelto</p>
            <p className="text-4xl font-heading font-bold text-bordo-900">
              <PrecioAnimado valor={pago.vuelto} />
            </p>
          </motion.div>
        )}

        <div className="mt-5 flex w-full flex-col gap-2 sm:flex-row">
          <motion.div whileTap={{ scale: 0.97 }} className="flex-1">
            <Button variant="outline" onClick={imprimirTicket} className="h-12 w-full gap-2">
              <Printer className="size-5" />
              Imprimir ticket
            </Button>
          </motion.div>
          <motion.div whileTap={{ scale: 0.97 }} className="flex-1">
            <Button onClick={onNueva} className="h-12 w-full gap-2" autoFocus>
              <ShoppingCart className="size-5" />
              Nueva venta
            </Button>
          </motion.div>
        </div>
      </div>

      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ ...springSmooth, delay: 0.1 }}
        className="hidden sm:block w-[260px] rounded-lg border border-linea bg-white p-4 shadow-card max-h-[60vh] overflow-y-auto"
        aria-label="Vista previa del ticket"
      >
        <ContenidoTicket ticket={ticket} pago={pago} />
      </motion.div>
      <Separator className="sm:hidden" />
    </motion.div>
  );
}
