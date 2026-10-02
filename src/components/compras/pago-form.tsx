"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { HandCoins, Info, Wallet } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { formatFecha, formatImporte } from "@/lib/contabilidad/formato";
import { easeSmooth } from "@/lib/motion";
import { diasEntre, numeroDocumento, ordenPagoSchema, r2, type Moneda, type OrdenPagoInput } from "@/lib/comercial/compras-esquemas";
import type { CatalogoContable, DocumentoCC, ProveedorOpcion } from "@/lib/comercial/compras";
import { crearOrdenPago, leerDocumentosPendientes } from "@/app/(dashboard)/admin/compras/actions";
import { ProveedorCombobox } from "./comboboxes";
import { aImporte } from "./lineas-productos";
import { Boton, Campo, EncabezadoPagina, ImporteAnimado, Panel, claseControl, claseEtiqueta } from "./ui";

type Sel = Record<number, { on: boolean; importe: string }>;
const texto = (n: number) => String(r2(n)).replace(".", ",");
/** Lo que se puede aplicar sin chocar con otras órdenes pendientes. */
const disponible = (d: DocumentoCC) => r2(Math.max(0, d.saldo - d.comprometido));

export function PagoForm({
  proveedores,
  catalogo,
  hoy,
  proveedorInicial,
  monedaInicial,
  documentoInicial,
}: {
  proveedores: ProveedorOpcion[];
  catalogo: CatalogoContable;
  hoy: string;
  proveedorInicial?: number | null;
  monedaInicial?: Moneda | null;
  documentoInicial?: number | null;
}) {
  const router = useRouter();
  const [pendiente, start] = useTransition();
  const provInicial = proveedores.find((p) => p.id === proveedorInicial);
  const [proveedorId, setProveedorId] = useState<number | null>(provInicial?.id ?? null);
  const [moneda, setMoneda] = useState<Moneda>(monedaInicial ?? ((provInicial?.condiciones?.moneda as Moneda) || "UYU"));
  const [cuenta, setCuenta] = useState("");
  const [referencia, setReferencia] = useState("");
  const [notas, setNotas] = useState("");
  const [docs, setDocs] = useState<DocumentoCC[] | null>(null);
  const [sel, setSel] = useState<Sel>({});
  const [importeManual, setImporteManual] = useState<string | null>(null);
  const [errores, setErrores] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!proveedorId) return;
    let vivo = true;
    leerDocumentosPendientes(proveedorId, moneda).then((r) => {
      if (!vivo) return;
      const lista = r.ok ? r.data : [];
      if (!r.ok) toast.error(r.error);
      setDocs(lista);
      const s: Sel = {};
      for (const d of lista) {
        const on = documentoInicial ? d.id === documentoInicial : false;
        s[d.id] = { on, importe: texto(disponible(d)) };
      }
      setSel(s);
    });
    return () => {
      vivo = false;
    };
  }, [proveedorId, moneda, documentoInicial]);

  const cuentas = catalogo.cuentasPago.filter((c) => (c.moneda ?? "UYU") === moneda);
  const aplicado = r2(
    (docs ?? []).reduce((s, d) => {
      const x = sel[d.id];
      const n = x?.on ? aImporte(x.importe) : 0;
      return Number.isFinite(n) ? s + n : s;
    }, 0)
  );
  const importe = importeManual !== null ? aImporte(importeManual) : aplicado;
  const anticipo = Number.isFinite(importe) ? r2(importe - aplicado) : 0;

  function enviar(e: React.FormEvent) {
    e.preventDefault();
    const errs: Record<string, string> = {};
    if (!proveedorId) errs.proveedor = "Elegí el proveedor";
    if (!cuenta) errs.cuenta = "Elegí la caja o banco";
    const aplicaciones: OrdenPagoInput["aplicaciones"] = [];
    for (const d of docs ?? []) {
      const x = sel[d.id];
      if (!x?.on) continue;
      const n = aImporte(x.importe);
      if (!(n > 0)) errs[`d${d.id}`] = "Importe inválido";
      else if (n > d.saldo) errs[`d${d.id}`] = `No más que el saldo (${formatImporte(d.saldo, d.moneda)})`;
      aplicaciones.push({ documento_id: d.id, importe: n });
    }
    if (!(importe > 0)) errs.importe = "Indicá el importe a pagar";
    else if (anticipo < 0) errs.importe = "El importe no puede ser menor que lo aplicado a facturas";
    setErrores(errs);
    if (Object.keys(errs).length) {
      toast.error(Object.values(errs)[0]);
      return;
    }
    const input: OrdenPagoInput = {
      proveedor_id: proveedorId!,
      moneda,
      importe,
      cuenta_pago_id: cuenta,
      referencia,
      notas,
      aplicaciones,
    };
    const p = ordenPagoSchema.safeParse(input);
    if (!p.success) {
      toast.error(p.error.issues[0]?.message ?? "Revisá los datos");
      return;
    }
    start(async () => {
      const r = await crearOrdenPago(input);
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      toast.success("Orden de pago creada: queda pendiente hasta que la pagues");
      router.push(`/admin/compras/pagos/${r.data}`);
    });
  }

  return (
    <form onSubmit={enviar} className="space-y-5" noValidate>
      <EncabezadoPagina
        eyebrow="Órdenes de pago"
        titulo="Nueva orden de pago"
        descripcion="Elegí qué facturas se cancelan. Queda pendiente; al pagarla se registra el asiento con el TC del día."
      />

      <Panel titulo="Pago" icono={Wallet} delay={0.05}>
        <div className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-4">
          <Campo etiqueta="Proveedor" error={errores.proveedor} className="sm:col-span-2">
            <ProveedorCombobox
              proveedores={proveedores}
              value={proveedorId}
              invalid={!!errores.proveedor}
              onChange={(p) => {
                setProveedorId(p.id);
                setDocs(null);
                setImporteManual(null);
                if (p.condiciones?.moneda && p.condiciones.moneda !== moneda) {
                  setMoneda(p.condiciones.moneda as Moneda);
                  setCuenta("");
                }
              }}
            />
          </Campo>
          <Campo etiqueta="Moneda">
            <select
              value={moneda}
              onChange={(e) => {
                setMoneda(e.target.value as Moneda);
                setCuenta("");
                setDocs(null);
                setImporteManual(null);
              }}
              className={claseControl}
            >
              <option value="UYU">Pesos (UYU)</option>
              <option value="USD">Dólares (USD)</option>
            </select>
          </Campo>
          <Campo etiqueta="Sale de" error={errores.cuenta}>
            <select
              value={cuenta}
              onChange={(e) => setCuenta(e.target.value)}
              aria-invalid={!!errores.cuenta || undefined}
              className={claseControl}
            >
              <option value="">Caja o banco…</option>
              {cuentas.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.codigo} {c.nombre}
                </option>
              ))}
            </select>
          </Campo>
          <Campo etiqueta="Referencia" className="sm:col-span-2">
            <input
              value={referencia}
              onChange={(e) => setReferencia(e.target.value)}
              placeholder="N° de transferencia, cheque…"
              className={claseControl}
            />
          </Campo>
          <Campo etiqueta="Notas" className="sm:col-span-2">
            <input value={notas} onChange={(e) => setNotas(e.target.value)} placeholder="Opcional" className={claseControl} />
          </Campo>
        </div>
      </Panel>

      <Panel titulo="Facturas a cancelar" icono={HandCoins} delay={0.1}>
        {!proveedorId ? (
          <p className="px-4 py-5 text-sm text-muted-foreground">Elegí el proveedor para ver sus facturas pendientes.</p>
        ) : docs === null ? (
          <div className="m-4 h-20 animate-pulse rounded-xl bg-superficie" />
        ) : docs.length === 0 ? (
          <p className="px-4 py-5 text-sm text-muted-foreground">
            No tiene facturas pendientes en {moneda}. Si pagás igual, todo queda como anticipo.
          </p>
        ) : (
          <ul className="divide-y divide-linea/70">
            {docs.map((d, i) => {
              const x = sel[d.id] ?? { on: false, importe: "" };
              const dias = d.vencimiento ? diasEntre(d.vencimiento, hoy) : 0;
              const err = errores[`d${d.id}`];
              return (
                <motion.li
                  key={d.id}
                  initial={{ opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ ...easeSmooth, delay: i * 0.03 }}
                  className={cn("grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-2 px-4 py-3 transition-colors sm:grid-cols-[auto_minmax(0,1fr)_9rem_9rem]", x.on && "bg-bordo-50/40")}
                >
                  <input
                    type="checkbox"
                    checked={x.on}
                    onChange={(e) => setSel((s) => ({ ...s, [d.id]: { ...x, on: e.target.checked } }))}
                    className="mt-1 size-4 accent-bordo-800"
                    aria-label={`Incluir ${numeroDocumento(d)}`}
                  />
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2 text-sm">
                      <span className="font-medium">{numeroDocumento(d)}</span>
                      {dias > 0 ? (
                        <span className="rounded-full border border-rose-200 bg-rose-50 px-2 text-[11px] text-rose-700">vencida hace {dias} d</span>
                      ) : (
                        <span className="text-[11px] text-muted-foreground">vence {formatFecha(d.vencimiento)}</span>
                      )}
                    </div>
                    <div className="text-xs text-muted-foreground tabular-nums">
                      Total {formatImporte(d.total, d.moneda)} · saldo {formatImporte(d.saldo, d.moneda)}
                      {d.comprometido > 0 && ` · ${formatImporte(d.comprometido, d.moneda)} ya en otra orden pendiente`}
                    </div>
                  </div>
                  <div className="col-start-2 text-right text-sm tabular-nums sm:col-start-auto sm:self-center">
                    <span className="text-[10px] uppercase tracking-editorial text-muted-foreground sm:hidden">Saldo </span>
                    {formatImporte(d.saldo)}
                  </div>
                  <div className="col-start-2 sm:col-start-auto">
                    <input
                      inputMode="decimal"
                      value={x.importe}
                      disabled={!x.on}
                      onChange={(e) => setSel((s) => ({ ...s, [d.id]: { ...x, importe: e.target.value } }))}
                      aria-label="Importe a aplicar"
                      aria-invalid={!!err || undefined}
                      className={cn(claseControl, "text-right tabular-nums")}
                    />
                    {err && <div className="pt-1 text-right text-xs text-rose-700">{err}</div>}
                  </div>
                </motion.li>
              );
            })}
          </ul>
        )}
      </Panel>

      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ ...easeSmooth, delay: 0.15 }}
        className="z-10 grid grid-cols-2 gap-3 rounded-2xl sm:sticky sm:bottom-3 border border-linea bg-white/95 p-4 shadow-lg backdrop-blur sm:grid-cols-[1fr_1fr_1fr_auto] sm:items-end"
      >
        <div>
          <div className={claseEtiqueta}>Aplicado a facturas</div>
          <ImporteAnimado valor={aplicado} moneda={moneda} className="font-heading text-lg" />
        </div>
        <Campo etiqueta={`Importe a pagar (${moneda})`} error={errores.importe} className="col-span-2 sm:col-span-1">
          <input
            inputMode="decimal"
            value={importeManual ?? texto(aplicado)}
            onChange={(e) => setImporteManual(e.target.value)}
            aria-invalid={!!errores.importe || undefined}
            className={cn(claseControl, "text-right font-heading tabular-nums")}
          />
        </Campo>
        <div>
          <div className={claseEtiqueta}>Queda como anticipo</div>
          <AnimatePresence mode="wait">
            <motion.div
              key={anticipo > 0 ? "a" : "n"}
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              className={cn("font-heading text-lg tabular-nums", anticipo > 0 ? "text-sky-700" : anticipo < 0 ? "text-rose-700" : "text-muted-foreground")}
            >
              {formatImporte(anticipo, moneda)}
            </motion.div>
          </AnimatePresence>
        </div>
        <div className="col-span-2 flex flex-col-reverse gap-2 sm:col-span-1 sm:flex-row">
          <Boton variante="secundario" onClick={() => router.back()} disabled={pendiente}>
            Cancelar
          </Boton>
          <Boton type="submit" pendiente={pendiente}>
            Crear orden de pago
          </Boton>
        </div>
        {anticipo > 0 && (
          <div className="col-span-2 flex items-start gap-1.5 text-xs text-sky-800 sm:col-span-4">
            <Info className="mt-0.5 size-3.5 shrink-0" />
            Lo no aplicado queda como anticipo a favor del club y se puede aplicar después a otra factura.
          </div>
        )}
      </motion.div>
    </form>
  );
}
