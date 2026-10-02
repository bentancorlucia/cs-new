"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { AlertTriangle, Info, PackageCheck, Plus, Receipt, Trash2, Undo2, Wallet } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { formatFecha, formatImporte } from "@/lib/contabilidad/formato";
import { easeSmooth } from "@/lib/motion";
import {
  NOMBRE_TIPO_DOC,
  documentoSchema,
  r2,
  sumarDias,
  type DocumentoInput,
  type LineaDocumentoInput,
  type Moneda,
} from "@/lib/comercial/compras-esquemas";
import type {
  CatalogoContable,
  PendienteFacturar,
  ProductoOpcion,
  ProveedorOpcion,
} from "@/lib/comercial/compras";
import { CuentaCombobox } from "@/components/contabilidad/asientos/cuenta-combobox";
import { Switch } from "@/components/ui/switch";
import { leerPendientesDeFacturar, registrarDocumento } from "@/app/(dashboard)/admin/compras/actions";
import { ProductoCombobox, ProveedorCombobox } from "./comboboxes";
import { aImporte, aNumero } from "./lineas-productos";
import { TcCampo, tcParaEnviar } from "./tc-campo";
import { Boton, Campo, EncabezadoPagina, Filtros, ImporteAnimado, Panel, claseControl, claseEtiqueta } from "./ui";

type Tipo = "factura" | "nota_credito" | "nota_debito";

type LRecepcion = { uid: string; tipo: "recepcion"; recepcion_item_id: number; cantidad: string; importe: string };
type LGasto = {
  uid: string;
  tipo: "gasto";
  cuenta_id: string | null;
  centro_costo_id: string | null;
  descripcion: string;
  importe: string;
};
type LDevolucion = { uid: string; tipo: "devolucion"; clave: string | null; cantidad: string; importe: string };
type Linea = LRecepcion | LGasto | LDevolucion;

const uid = () => crypto.randomUUID();
const texto = (n: number) => String(r2(n)).replace(".", ",");

export function DocumentoForm({
  proveedores,
  productos,
  catalogo,
  hoy,
  proveedorInicial,
  tipoInicial,
  monedaInicial,
}: {
  proveedores: ProveedorOpcion[];
  productos: ProductoOpcion[];
  catalogo: CatalogoContable;
  hoy: string;
  proveedorInicial?: number | null;
  tipoInicial?: Tipo;
  monedaInicial?: Moneda | null;
}) {
  const router = useRouter();
  const [pendiente, start] = useTransition();
  const provInicial = proveedores.find((p) => p.id === proveedorInicial);
  const [proveedorId, setProveedorId] = useState<number | null>(provInicial?.id ?? null);
  const proveedor = proveedores.find((p) => p.id === proveedorId);
  const [tipo, setTipo] = useState<Tipo>(tipoInicial ?? "factura");
  const [serie, setSerie] = useState("");
  const [numero, setNumero] = useState("");
  const [fecha, setFecha] = useState(hoy);
  const [vencimiento, setVencimiento] = useState<string | null>(null); // null = automático por plazo
  const [moneda, setMoneda] = useState<Moneda>(
    monedaInicial ?? ((provInicial?.condiciones?.moneda as Moneda) || "UYU")
  );
  const [tc, setTc] = useState("");
  const [contado, setContado] = useState(false);
  const [cuentaPago, setCuentaPago] = useState<string>("");
  const [notas, setNotas] = useState("");
  const [lineas, setLineas] = useState<Linea[]>([]);
  const [recibidos, setRecibidos] = useState<PendienteFacturar[] | null>(null);
  const [errores, setErrores] = useState<Record<string, string>>({});

  const plazo = proveedor?.condiciones?.plazo_dias ?? 30;
  const vencAuto = sumarDias(fecha, plazo);
  const llevaVencimiento = tipo !== "nota_credito" && !contado;

  // Mercadería recibida pendiente de facturar del proveedor
  useEffect(() => {
    if (!proveedorId) return;
    let vivo = true;
    leerPendientesDeFacturar(proveedorId).then((r) => {
      if (!vivo) return;
      if (r.ok) setRecibidos(r.data);
      else {
        setRecibidos([]);
        toast.error(r.error);
      }
    });
    return () => {
      vivo = false;
    };
  }, [proveedorId]);

  const recibidosMoneda = useMemo(() => (recibidos ?? []).filter((r) => r.moneda === moneda), [recibidos, moneda]);
  const recibidosOtraMoneda = (recibidos ?? []).length - recibidosMoneda.length;
  const cuentasPago = catalogo.cuentasPago.filter((c) => (c.moneda ?? "UYU") === moneda);

  // Al cambiar de tipo o moneda se descartan las líneas que dejan de valer
  function cambiarTipo(t: Tipo) {
    setTipo(t);
    if (t !== "factura") setContado(false);
    setLineas((ls) =>
      ls.filter((l) => (l.tipo === "recepcion" ? t === "factura" : l.tipo === "devolucion" ? t === "nota_credito" : true))
    );
  }
  function cambiarMoneda(m: Moneda) {
    setMoneda(m);
    setCuentaPago("");
    setLineas((ls) => ls.filter((l) => l.tipo !== "recepcion"));
  }

  const set = (id: string, cambios: Partial<Linea>) => {
    setLineas((ls) => ls.map((l) => (l.uid === id ? ({ ...l, ...cambios } as Linea) : l)));
    if (errores[id]) setErrores((e) => ({ ...e, [id]: "" }));
  };
  const quitar = (id: string) => setLineas((ls) => ls.filter((l) => l.uid !== id));

  function alternarRecibido(r: PendienteFacturar, on: boolean) {
    if (on) {
      setLineas((ls) => [
        ...ls,
        {
          uid: uid(),
          tipo: "recepcion",
          recepcion_item_id: r.recepcion_item_id,
          cantidad: String(r.pendiente),
          importe: texto(r.pendiente * r.costo_unitario),
        },
      ]);
    } else {
      setLineas((ls) => ls.filter((l) => !(l.tipo === "recepcion" && l.recepcion_item_id === r.recepcion_item_id)));
    }
  }

  function agregarGasto() {
    setLineas((ls) => [
      ...ls,
      {
        uid: uid(),
        tipo: "gasto",
        cuenta_id: proveedor?.condiciones?.cuenta_gasto_id ?? null,
        centro_costo_id: proveedor?.condiciones?.centro_costo_id ?? null,
        descripcion: "",
        importe: "",
      },
    ]);
  }
  function agregarDevolucion() {
    setLineas((ls) => [...ls, { uid: uid(), tipo: "devolucion", clave: null, cantidad: "1", importe: "" }]);
  }

  const total = lineas.reduce((s, l) => {
    const n = aImporte(l.importe);
    return Number.isFinite(n) ? s + n : s;
  }, 0);

  const diferenciaPrecio = lineas.reduce((s, l) => {
    if (l.tipo !== "recepcion") return s;
    const r = recibidos?.find((x) => x.recepcion_item_id === l.recepcion_item_id);
    const c = aNumero(l.cantidad);
    const imp = aImporte(l.importe);
    if (!r || !Number.isFinite(c) || !Number.isFinite(imp)) return s;
    return s + (imp - c * r.costo_unitario);
  }, 0);

  function enviar(e: React.FormEvent) {
    e.preventDefault();
    const errs: Record<string, string> = {};
    if (!proveedorId) errs.proveedor = "Elegí el proveedor";
    if (!numero.trim()) errs.numero = "Escribí el número";
    if (contado && !cuentaPago) errs.cuentaPago = "Elegí la caja o banco";
    if (lineas.length === 0) errs.lineas = "Agregá al menos una línea";
    const lineasInput: LineaDocumentoInput[] = [];
    for (const l of lineas) {
      const imp = aImporte(l.importe);
      if (!(imp > 0)) {
        errs[l.uid] = "El importe tiene que ser mayor que cero";
        continue;
      }
      if (l.tipo === "recepcion") {
        const r = recibidos?.find((x) => x.recepcion_item_id === l.recepcion_item_id);
        const c = aNumero(l.cantidad);
        if (!Number.isInteger(c) || c <= 0) errs[l.uid] = "Cantidad inválida";
        else if (r && c > r.pendiente) errs[l.uid] = `Quedan ${r.pendiente} sin facturar`;
        lineasInput.push({ tipo: "recepcion", recepcion_item_id: l.recepcion_item_id, cantidad: c, importe: imp });
      } else if (l.tipo === "gasto") {
        const cuenta = catalogo.cuentasGasto.find((c) => c.id === l.cuenta_id);
        if (!cuenta) errs[l.uid] = "Elegí la cuenta";
        else if (cuenta.requiere_centro_costo && !l.centro_costo_id) errs[l.uid] = "Esta cuenta necesita centro de costo";
        lineasInput.push({
          tipo: "gasto",
          cuenta_id: l.cuenta_id ?? "",
          centro_costo_id: l.centro_costo_id,
          descripcion: l.descripcion,
          importe: imp,
        });
      } else {
        const p = productos.find((x) => x.clave === l.clave);
        const c = aNumero(l.cantidad);
        if (!p) errs[l.uid] = "Elegí el producto";
        else if (!Number.isInteger(c) || c <= 0) errs[l.uid] = "Cantidad inválida";
        lineasInput.push({
          tipo: "devolucion",
          producto_id: p?.producto_id ?? 0,
          variante_id: p?.variante_id ?? null,
          cantidad: c,
          importe: imp,
        });
      }
    }
    if (moneda !== "UYU" && tc.trim() && !(aImporte(tc) > 0)) errs.tc = "TC inválido";
    setErrores(errs);
    if (Object.keys(errs).length) {
      toast.error(Object.values(errs)[0]);
      return;
    }
    const input: DocumentoInput = {
      proveedor_id: proveedorId!,
      tipo,
      serie,
      numero,
      fecha,
      vencimiento: llevaVencimiento ? vencimiento ?? vencAuto : null,
      moneda,
      tc: tcParaEnviar(moneda, tc),
      cuenta_pago_id: contado ? cuentaPago : null,
      notas,
      lineas: lineasInput,
    };
    const p = documentoSchema.safeParse(input);
    if (!p.success) {
      toast.error(p.error.issues[0]?.message ?? "Revisá los datos");
      return;
    }
    start(async () => {
      const r = await registrarDocumento(input);
      if (!r.ok) {
        toast.error(r.error);
        setErrores({ general: r.error });
        return;
      }
      toast.success(`${NOMBRE_TIPO_DOC[tipo]} registrada con su asiento`);
      router.push(`/admin/compras/documentos/${r.data}`);
    });
  }

  const gastos = lineas.filter((l): l is LGasto => l.tipo === "gasto");
  const devoluciones = lineas.filter((l): l is LDevolucion => l.tipo === "devolucion");

  return (
    <form onSubmit={enviar} className="space-y-5" noValidate>
      <EncabezadoPagina
        eyebrow="Facturas y notas"
        titulo={`Cargar ${NOMBRE_TIPO_DOC[tipo].toLowerCase()}`}
        descripcion="Se registra junto con su asiento. Lo recibido se cancela al valor en que entró; los gastos van a su cuenta."
      />

      <Panel titulo="Documento" icono={Receipt} delay={0.05}>
        <div className="space-y-4 p-4">
          <Filtros<Tipo>
            id="tipo-doc"
            valor={tipo}
            onChange={cambiarTipo}
            opciones={[
              { valor: "factura", etiqueta: "Factura" },
              { valor: "nota_credito", etiqueta: "Nota de crédito" },
              { valor: "nota_debito", etiqueta: "Nota de débito" },
            ]}
          />
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Campo etiqueta="Proveedor" error={errores.proveedor} className="sm:col-span-2">
              <ProveedorCombobox
                proveedores={proveedores}
                value={proveedorId}
                invalid={!!errores.proveedor}
                onChange={(p) => {
                  setProveedorId(p.id);
                  setRecibidos(null);
                  setLineas([]);
                  if (p.condiciones?.moneda) cambiarMoneda(p.condiciones.moneda as Moneda);
                }}
              />
            </Campo>
            <Campo etiqueta="Serie">
              <input value={serie} onChange={(e) => setSerie(e.target.value.toUpperCase())} className={cn(claseControl, "font-mono uppercase")} placeholder="A" />
            </Campo>
            <Campo etiqueta="Número" error={errores.numero}>
              <input
                value={numero}
                onChange={(e) => setNumero(e.target.value)}
                inputMode="numeric"
                aria-invalid={!!errores.numero || undefined}
                className={cn(claseControl, "font-mono")}
              />
            </Campo>
            <Campo etiqueta="Fecha">
              <input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} className={cn(claseControl, "tabular-nums")} />
            </Campo>
            <Campo etiqueta="Moneda">
              <select value={moneda} onChange={(e) => cambiarMoneda(e.target.value as Moneda)} className={claseControl}>
                <option value="UYU">Pesos (UYU)</option>
                <option value="USD">Dólares (USD)</option>
              </select>
            </Campo>
            <AnimatePresence initial={false}>
              {llevaVencimiento && (
                <motion.div key="venc" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                  <Campo
                    etiqueta="Vencimiento"
                    ayuda={vencimiento ? (
                      <button type="button" className="underline-offset-2 hover:underline" onClick={() => setVencimiento(null)}>
                        Volver al plazo del proveedor ({plazo} días)
                      </button>
                    ) : `Plazo del proveedor: ${plazo} días`}
                  >
                    <input
                      type="date"
                      value={vencimiento ?? vencAuto}
                      min={fecha}
                      onChange={(e) => setVencimiento(e.target.value || null)}
                      className={cn(claseControl, "tabular-nums")}
                    />
                  </Campo>
                </motion.div>
              )}
            </AnimatePresence>
            <div>
              <TcCampo moneda={moneda} fecha={fecha} valor={tc} onChange={setTc} />
            </div>
          </div>

          <AnimatePresence initial={false}>
            {tipo === "factura" && (
              <motion.div
                key="contado"
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                className="overflow-hidden"
              >
                <div className="flex flex-col gap-3 rounded-xl border border-linea p-3 sm:flex-row sm:items-center">
                  <label className="flex flex-1 items-center gap-3">
                    <Switch checked={contado} onCheckedChange={(v) => setContado(v)} />
                    <span>
                      <span className="flex items-center gap-1.5 text-sm text-foreground">
                        <Wallet className="size-4 text-bordo-700" /> Contado
                      </span>
                      <span className="block text-xs text-muted-foreground">
                        {contado ? "Se paga en el momento desde una caja o banco: no queda deuda." : "A crédito: queda en la cuenta corriente hasta pagarla."}
                      </span>
                    </span>
                  </label>
                  {contado && (
                    <Campo etiqueta="Pagada desde" error={errores.cuentaPago} className="sm:w-72">
                      <select
                        value={cuentaPago}
                        onChange={(e) => setCuentaPago(e.target.value)}
                        aria-invalid={!!errores.cuentaPago || undefined}
                        className={claseControl}
                      >
                        <option value="">Elegí caja o banco…</option>
                        {cuentasPago.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.codigo} {c.nombre}
                          </option>
                        ))}
                      </select>
                    </Campo>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </Panel>

      {/* Mercadería recibida */}
      {tipo === "factura" && (
        <Panel titulo="Mercadería recibida" icono={PackageCheck} delay={0.1}>
          {!proveedorId ? (
            <p className="px-4 py-5 text-sm text-muted-foreground">Elegí el proveedor para ver lo recibido sin facturar.</p>
          ) : recibidos === null ? (
            <div className="m-4 h-16 animate-pulse rounded-xl bg-superficie" />
          ) : recibidosMoneda.length === 0 ? (
            <p className="px-4 py-5 text-sm text-muted-foreground">
              No hay mercadería recibida pendiente de facturar en {moneda}.
              {recibidosOtraMoneda > 0 && ` Hay ${recibidosOtraMoneda} ítem(s) en otra moneda.`}
            </p>
          ) : (
            <ul className="divide-y divide-linea/70">
              {recibidosMoneda.map((r) => {
                const l = lineas.find((x): x is LRecepcion => x.tipo === "recepcion" && x.recepcion_item_id === r.recepcion_item_id);
                const c = l ? aNumero(l.cantidad) : 0;
                const imp = l ? aImporte(l.importe) : 0;
                const dif = l && Number.isFinite(c) && Number.isFinite(imp) ? r2(imp - c * r.costo_unitario) : 0;
                return (
                  <li key={r.recepcion_item_id} className={cn("px-4 py-3 transition-colors", l && "bg-bordo-50/40")}>
                    <label className="flex cursor-pointer items-start gap-3">
                      <input
                        type="checkbox"
                        checked={!!l}
                        onChange={(e) => alternarRecibido(r, e.target.checked)}
                        className="mt-1 size-4 accent-bordo-800"
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm text-foreground">{r.nombre}</span>
                        <span className="block text-xs text-muted-foreground">
                          {r.recepcion_numero} · {formatFecha(r.fecha)}
                          {r.remito && ` · remito ${r.remito}`} · sin facturar {r.pendiente} de {r.cantidad} ·{" "}
                          {formatImporte(r.costo_unitario, r.moneda)} c/u
                        </span>
                      </span>
                    </label>
                    <AnimatePresence initial={false}>
                      {l && (
                        <motion.div
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: "auto" }}
                          exit={{ opacity: 0, height: 0 }}
                          className="overflow-hidden pl-7"
                        >
                          <div className="grid grid-cols-2 gap-2 pt-2 sm:w-96">
                            <Campo etiqueta="Cantidad">
                              <input
                                inputMode="numeric"
                                value={l.cantidad}
                                onChange={(e) => {
                                  const n = aNumero(e.target.value);
                                  set(l.uid, {
                                    cantidad: e.target.value,
                                    ...(Number.isFinite(n) ? { importe: texto(n * r.costo_unitario) } : {}),
                                  });
                                }}
                                className={cn(claseControl, "text-right tabular-nums")}
                              />
                            </Campo>
                            <Campo etiqueta={`Importe ${moneda}`}>
                              <input
                                inputMode="decimal"
                                value={l.importe}
                                onChange={(e) => set(l.uid, { importe: e.target.value })}
                                className={cn(claseControl, "text-right tabular-nums")}
                              />
                            </Campo>
                          </div>
                          {errores[l.uid] && <div className="pt-1 text-xs text-rose-700">{errores[l.uid]}</div>}
                          {dif !== 0 && (
                            <div className="mt-2 flex items-start gap-1.5 rounded-lg bg-amber-50 px-2 py-1.5 text-xs text-amber-900">
                              <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
                              Difiere en {formatImporte(dif, moneda)} de lo recibido: la diferencia va a Costo de mercadería vendida.
                            </div>
                          )}
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </li>
                );
              })}
            </ul>
          )}
        </Panel>
      )}

      {/* Devolución */}
      {tipo === "nota_credito" && (
        <Panel
          titulo="Devolución de mercadería"
          icono={Undo2}
          delay={0.1}
          accion={
            <Boton variante="secundario" className="h-8 px-3 text-xs" onClick={agregarDevolucion}>
              <Plus className="size-3.5" />
              Agregar producto
            </Boton>
          }
        >
          {devoluciones.length === 0 ? (
            <p className="px-4 py-5 text-sm text-muted-foreground">
              Si la nota acredita mercadería devuelta, agregá los productos: salen del stock a su costo.
            </p>
          ) : (
            <ul className="space-y-2 p-4">
              <AnimatePresence initial={false}>
                {devoluciones.map((l) => (
                  <motion.li
                    key={l.uid}
                    layout
                    initial={{ opacity: 0, y: -6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, height: 0 }}
                  >
                    <div className="grid grid-cols-[minmax(0,1fr)_2.5rem] gap-2 sm:grid-cols-[minmax(0,1fr)_6rem_9rem_2.5rem]">
                      <ProductoCombobox
                        productos={productos}
                        value={l.clave}
                        onChange={(p) => set(l.uid, { clave: p.clave })}
                        invalid={!!errores[l.uid] && !l.clave}
                      />
                      <button
                        type="button"
                        onClick={() => quitar(l.uid)}
                        aria-label="Quitar"
                        className="flex size-10 items-center justify-center rounded-lg text-muted-foreground hover:bg-rose-50 hover:text-rose-700 sm:order-last"
                      >
                        <Trash2 className="size-4" />
                      </button>
                      <div className="col-span-2 grid grid-cols-2 gap-2 sm:col-span-2">
                        <input
                          inputMode="numeric"
                          value={l.cantidad}
                          onChange={(e) => set(l.uid, { cantidad: e.target.value })}
                          aria-label="Cantidad"
                          className={cn(claseControl, "text-right tabular-nums")}
                        />
                        <input
                          inputMode="decimal"
                          value={l.importe}
                          onChange={(e) => set(l.uid, { importe: e.target.value })}
                          placeholder={`Importe ${moneda}`}
                          aria-label="Importe acreditado"
                          className={cn(claseControl, "text-right tabular-nums")}
                        />
                      </div>
                    </div>
                    {errores[l.uid] && <div className="pt-1 text-xs text-rose-700">{errores[l.uid]}</div>}
                  </motion.li>
                ))}
              </AnimatePresence>
              <li className="text-[11px] text-muted-foreground">
                Si lo acreditado difiere del costo de stock, la diferencia va a Ajustes y mermas.
              </li>
            </ul>
          )}
        </Panel>
      )}

      {/* Gastos */}
      <Panel
        titulo={tipo === "nota_credito" ? "Gastos que se acreditan" : "Gastos"}
        icono={Receipt}
        delay={0.15}
        accion={
          <Boton variante="secundario" className="h-8 px-3 text-xs" onClick={agregarGasto}>
            <Plus className="size-3.5" />
            Agregar gasto
          </Boton>
        }
      >
        {gastos.length === 0 ? (
          <p className="px-4 py-5 text-sm text-muted-foreground">
            {tipo === "factura"
              ? "Para servicios, insumos o cualquier gasto del club que no sea mercadería de la tienda."
              : "Imputá a una cuenta de gasto con su centro de costo si corresponde."}
          </p>
        ) : (
          <ul className="space-y-3 p-4">
            <AnimatePresence initial={false}>
              {gastos.map((l) => {
                const cuenta = catalogo.cuentasGasto.find((c) => c.id === l.cuenta_id);
                return (
                  <motion.li
                    key={l.uid}
                    layout
                    initial={{ opacity: 0, y: -6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, height: 0 }}
                    className="rounded-xl border border-linea p-3"
                  >
                    <div className="grid gap-2 sm:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_9rem_2.5rem]">
                      <div className="min-w-0">
                        <span className={claseEtiqueta}>Cuenta</span>
                        <CuentaCombobox
                          cuentas={catalogo.cuentasGasto}
                          value={l.cuenta_id}
                          onChange={(c) => set(l.uid, { cuenta_id: c.id })}
                          invalid={!!errores[l.uid] && !cuenta}
                        />
                      </div>
                      <Campo etiqueta={cuenta?.requiere_centro_costo ? "Centro de costo (obligatorio)" : "Centro de costo"}>
                        <select
                          value={l.centro_costo_id ?? ""}
                          onChange={(e) => set(l.uid, { centro_costo_id: e.target.value || null })}
                          aria-invalid={(!!errores[l.uid] && cuenta?.requiere_centro_costo && !l.centro_costo_id) || undefined}
                          className={claseControl}
                        >
                          <option value="">Sin centro</option>
                          {catalogo.centros.map((c) => (
                            <option key={c.id} value={c.id}>
                              {c.nombre}
                            </option>
                          ))}
                        </select>
                      </Campo>
                      <Campo etiqueta={`Importe ${moneda}`}>
                        <input
                          inputMode="decimal"
                          value={l.importe}
                          onChange={(e) => set(l.uid, { importe: e.target.value })}
                          className={cn(claseControl, "text-right tabular-nums")}
                        />
                      </Campo>
                      <button
                        type="button"
                        onClick={() => quitar(l.uid)}
                        aria-label="Quitar gasto"
                        className="flex size-10 items-center justify-center self-end rounded-lg text-muted-foreground hover:bg-rose-50 hover:text-rose-700"
                      >
                        <Trash2 className="size-4" />
                      </button>
                      <input
                        value={l.descripcion}
                        onChange={(e) => set(l.uid, { descripcion: e.target.value })}
                        placeholder="Descripción (opcional)"
                        className={cn(claseControl, "sm:col-span-3")}
                      />
                    </div>
                    {errores[l.uid] && <div className="pt-1 text-xs text-rose-700">{errores[l.uid]}</div>}
                  </motion.li>
                );
              })}
            </AnimatePresence>
          </ul>
        )}
      </Panel>

      <Campo etiqueta="Notas">
        <input value={notas} onChange={(e) => setNotas(e.target.value)} className={claseControl} placeholder="Opcional" />
      </Campo>

      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ ...easeSmooth, delay: 0.2 }}
        className="z-10 flex flex-col gap-3 rounded-2xl sm:sticky sm:bottom-3 border border-linea bg-white/95 p-4 shadow-lg backdrop-blur sm:flex-row sm:items-center sm:justify-between"
      >
        <div>
          <div className={claseEtiqueta}>Total del documento</div>
          <ImporteAnimado valor={total} moneda={moneda} className="font-heading text-2xl text-foreground" />
          {diferenciaPrecio !== 0 && (
            <div className="flex items-center gap-1 text-xs text-amber-800">
              <Info className="size-3.5" />
              Diferencia de precio con lo recibido: {formatImporte(diferenciaPrecio, moneda)} (a costo de ventas)
            </div>
          )}
          {errores.lineas && <div className="text-xs text-rose-700">{errores.lineas}</div>}
        </div>
        <div className="flex flex-col-reverse gap-2 sm:flex-row">
          <Boton variante="secundario" onClick={() => router.back()} disabled={pendiente}>
            Cancelar
          </Boton>
          <Boton type="submit" pendiente={pendiente} disabled={lineas.length === 0}>
            Registrar {NOMBRE_TIPO_DOC[tipo].toLowerCase()}
          </Boton>
        </div>
      </motion.div>
    </form>
  );
}
