"use client";

import { useMemo, useState, useTransition } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { toast } from "sonner";
import { BookPlus, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatFecha, formatImporte } from "@/lib/contabilidad/formato";
import { springBouncy } from "@/lib/motion";
import type { CatalogosAsiento, CuentaOpcion } from "@/lib/contabilidad/asientos";
import type { MovimientoBanco } from "@/lib/contabilidad/conciliacion";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { CuentaCombobox } from "@/components/contabilidad/asientos/cuenta-combobox";
import { registrarEnLibros } from "@/app/(dashboard)/contabilidad/conciliacion/actions";
import { ImporteSigno } from "./ui-conciliacion";

/** Cuentas habituales para gastos e ingresos bancarios, como atajo. */
function atajos(cuentas: CuentaOpcion[], entra: boolean): CuentaOpcion[] {
  const re = entra ? /inter[eé]s/i : /bancari|inter[eé]s|impuesto/i;
  return cuentas.filter((c) => c.codigo.startsWith(entra ? "4" : "5") && re.test(c.nombre)).slice(0, 3);
}

export function RegistrarDialog({
  movimiento,
  onOpenChange,
  cuentaBanco,
  catalogos,
}: {
  movimiento: MovimientoBanco | null;
  onOpenChange: (open: boolean) => void;
  cuentaBanco: { codigo: string; nombre: string; moneda: string | null };
  catalogos: CatalogosAsiento;
}) {
  return (
    <Dialog open={!!movimiento} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-lg">
        {movimiento && (
          <Formulario
            key={movimiento.id}
            movimiento={movimiento}
            cuentaBanco={cuentaBanco}
            catalogos={catalogos}
            cerrar={() => onOpenChange(false)}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function Formulario({
  movimiento,
  cuentaBanco,
  catalogos,
  cerrar,
}: {
  movimiento: MovimientoBanco;
  cuentaBanco: { codigo: string; nombre: string; moneda: string | null };
  catalogos: CatalogosAsiento;
  cerrar: () => void;
}) {
  const entra = movimiento.importe > 0;
  const [cuentaId, setCuentaId] = useState<string | null>(null);
  const [descripcion, setDescripcion] = useState(movimiento.concepto);
  const [centroId, setCentroId] = useState("");
  const [proveedorId, setProveedorId] = useState("");
  const [disciplinaId, setDisciplinaId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [intentado, setIntentado] = useState(false);
  const [pendiente, startTransition] = useTransition();

  const cuenta = catalogos.cuentas.find((c) => c.id === cuentaId);
  const sugeridas = useMemo(() => atajos(catalogos.cuentas, entra), [catalogos.cuentas, entra]);

  const faltan: string[] = [];
  if (!cuenta) faltan.push("Elegí la cuenta de contrapartida");
  if (cuenta?.requiere_auxiliar === "proveedor" && !proveedorId) faltan.push("Elegí el proveedor");
  if (cuenta?.requiere_auxiliar === "disciplina" && !disciplinaId) faltan.push("Elegí la disciplina");
  if (cuenta?.requiere_centro_costo && !centroId) faltan.push("Elegí el centro de costo");

  const usd = cuentaBanco.moneda === "USD";
  const monto = formatImporte(Math.abs(movimiento.importe), usd ? "USD" : "UYU");

  function elegir(c: CuentaOpcion) {
    setCuentaId(c.id);
    if (c.requiere_auxiliar !== "proveedor") setProveedorId("");
    if (c.requiere_auxiliar !== "disciplina") setDisciplinaId("");
    if (!c.requiere_centro_costo) setCentroId("");
  }

  function registrar() {
    setIntentado(true);
    if (faltan.length > 0 || !cuenta) return;
    setError(null);
    startTransition(async () => {
      const r = await registrarEnLibros({
        movimientoId: movimiento.id,
        contrapartidaId: cuenta.id,
        descripcion: descripcion.trim(),
        centroCostoId: cuenta.requiere_centro_costo ? centroId : null,
        proveedorId: cuenta.requiere_auxiliar === "proveedor" ? Number(proveedorId) : null,
        disciplinaId: cuenta.requiere_auxiliar === "disciplina" ? Number(disciplinaId) : null,
      });
      if (r.ok) {
        toast.success("Registrado en libros y conciliado");
        cerrar();
      } else {
        setError(r.error);
        toast.error(r.error);
      }
    });
  }

  const lineaBanco = (
    <LineaVista lado={entra ? "Debe" : "Haber"} codigo={cuentaBanco.codigo} nombre={cuentaBanco.nombre} monto={monto} />
  );
  const lineaContra = (
    <LineaVista
      lado={entra ? "Haber" : "Debe"}
      codigo={cuenta?.codigo ?? "—"}
      nombre={cuenta?.nombre ?? "Cuenta de contrapartida"}
      monto={usd && cuenta && !cuenta.moneda ? `${monto} × TC` : monto}
      apagada={!cuenta}
    />
  );

  return (
    <>
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2 font-heading text-lg text-bordo-950">
          <BookPlus className="size-4" />
          Registrar en libros
        </DialogTitle>
        <DialogDescription>
          Crea un asiento con este movimiento del banco (comisión, interés, débito automático) y lo deja conciliado.
        </DialogDescription>
      </DialogHeader>

      <div className="flex items-start justify-between gap-3 rounded-xl border border-linea bg-superficie/50 p-3">
        <div className="min-w-0">
          <div className="text-xs text-muted-foreground tabular-nums">{formatFecha(movimiento.fecha)}</div>
          <div className="truncate text-sm text-foreground">{movimiento.concepto}</div>
          {movimiento.referencia && <div className="truncate text-[11px] text-muted-foreground">{movimiento.referencia}</div>}
        </div>
        <ImporteSigno valor={movimiento.importe} moneda={cuentaBanco.moneda} className="text-base font-semibold" />
      </div>

      <div className="space-y-3">
        <div>
          <span className="mb-1 block text-xs font-medium text-foreground/80">Cuenta de contrapartida</span>
          <CuentaCombobox
            cuentas={catalogos.cuentas}
            value={cuentaId}
            onChange={elegir}
            invalid={intentado && !cuenta}
          />
          {sugeridas.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {sugeridas.map((c) => (
                <motion.button
                  key={c.id}
                  type="button"
                  whileHover={{ y: -1 }}
                  whileTap={{ scale: 0.95 }}
                  transition={springBouncy}
                  onClick={() => elegir(c)}
                  className={cn(
                    "inline-flex h-7 items-center gap-1 rounded-full border px-2.5 text-[11px] transition-colors",
                    c.id === cuentaId
                      ? "border-bordo-700 bg-bordo-800 text-white"
                      : "border-linea bg-white text-foreground/80 hover:border-bordo-200 hover:bg-bordo-50"
                  )}
                >
                  <span className="font-mono opacity-70">{c.codigo}</span>
                  {c.nombre}
                </motion.button>
              ))}
            </div>
          )}
        </div>

        <AnimatePresence initial={false}>
          {cuenta?.requiere_auxiliar === "proveedor" && (
            <Aparece key="prov">
              <Selector
                etiqueta="Proveedor"
                valor={proveedorId}
                onCambio={setProveedorId}
                invalido={intentado && !proveedorId}
                opciones={catalogos.proveedores.map((p) => ({ valor: String(p.id), texto: p.nombre }))}
              />
            </Aparece>
          )}
          {cuenta?.requiere_auxiliar === "disciplina" && (
            <Aparece key="disc">
              <Selector
                etiqueta="Disciplina"
                valor={disciplinaId}
                onCambio={setDisciplinaId}
                invalido={intentado && !disciplinaId}
                opciones={catalogos.disciplinas.map((d) => ({ valor: String(d.id), texto: d.nombre }))}
              />
            </Aparece>
          )}
          {cuenta?.requiere_centro_costo && (
            <Aparece key="cc">
              <Selector
                etiqueta="Centro de costo"
                valor={centroId}
                onCambio={setCentroId}
                invalido={intentado && !centroId}
                opciones={catalogos.centros.map((c) => ({ valor: c.id, texto: `${c.codigo} · ${c.nombre}` }))}
              />
            </Aparece>
          )}
        </AnimatePresence>

        <label className="block">
          <span className="mb-1 block text-xs font-medium text-foreground/80">Descripción del asiento</span>
          <input
            value={descripcion}
            onChange={(e) => setDescripcion(e.target.value)}
            maxLength={500}
            className="h-10 w-full rounded-lg border border-linea bg-white px-3 text-sm outline-none transition-all focus:border-bordo-700 focus:ring-3 focus:ring-bordo-800/10"
          />
        </label>

        <div className="rounded-xl border border-linea p-3">
          <div className="mb-1.5 font-heading text-[11px] uppercase tracking-editorial text-muted-foreground">
            Asiento · {formatFecha(movimiento.fecha)}
          </div>
          <div className="space-y-1">
            {entra ? (
              <>
                {lineaBanco}
                {lineaContra}
              </>
            ) : (
              <>
                {lineaContra}
                {lineaBanco}
              </>
            )}
          </div>
          {usd && (
            <p className="mt-2 text-[11px] text-muted-foreground">
              Se convierte a pesos con la cotización vigente del {formatFecha(movimiento.fecha)}.
            </p>
          )}
        </div>
      </div>

      <AnimatePresence>
        {(error || (intentado && faltan.length > 0)) && (
          <motion.div
            key={error ?? faltan.join()}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1, x: [0, -6, 6, -4, 4, 0] }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.4 }}
            role="alert"
            className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-800"
          >
            {error ?? faltan.join(" · ")}
          </motion.div>
        )}
      </AnimatePresence>

      <DialogFooter>
        <Button variant="outline" className="rounded-full" onClick={cerrar} disabled={pendiente}>
          Cancelar
        </Button>
        <Button className="rounded-full" onClick={registrar} disabled={pendiente}>
          {pendiente ? <Loader2 className="size-3.5 animate-spin" /> : <BookPlus className="size-3.5" />}
          {pendiente ? "Registrando…" : "Registrar y conciliar"}
        </Button>
      </DialogFooter>
    </>
  );
}

function LineaVista({
  lado,
  codigo,
  nombre,
  monto,
  apagada,
}: {
  lado: string;
  codigo: string;
  nombre: string;
  monto: string;
  apagada?: boolean;
}) {
  return (
    <div className={cn("flex items-baseline gap-2 text-xs", apagada && "text-muted-foreground")}>
      <span className="w-10 shrink-0 text-[10px] uppercase tracking-wide text-muted-foreground">{lado}</span>
      <span className="shrink-0 font-mono text-muted-foreground">{codigo}</span>
      <span className="min-w-0 flex-1 truncate">{nombre}</span>
      <span className="shrink-0 tabular-nums">{monto}</span>
    </div>
  );
}

function Aparece({ children }: { children: React.ReactNode }) {
  return (
    <motion.div
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: "auto" }}
      exit={{ opacity: 0, height: 0 }}
      transition={{ duration: 0.2 }}
      className="overflow-hidden"
    >
      {children}
    </motion.div>
  );
}

function Selector({
  etiqueta,
  valor,
  onCambio,
  opciones,
  invalido,
}: {
  etiqueta: string;
  valor: string;
  onCambio: (v: string) => void;
  opciones: { valor: string; texto: string }[];
  invalido?: boolean;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-foreground/80">{etiqueta}</span>
      <select
        value={valor}
        onChange={(e) => onCambio(e.target.value)}
        className={cn(
          "h-10 w-full rounded-lg border bg-white px-3 text-sm outline-none transition-all focus:border-bordo-700 focus:ring-3 focus:ring-bordo-800/10",
          invalido ? "border-rose-300 bg-rose-50/40" : "border-linea",
          !valor && "text-muted-foreground"
        )}
      >
        <option value="">Elegí…</option>
        {opciones.map((o) => (
          <option key={o.valor} value={o.valor}>
            {o.texto}
          </option>
        ))}
      </select>
    </label>
  );
}
