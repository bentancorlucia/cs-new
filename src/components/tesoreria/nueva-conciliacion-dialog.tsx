"use client";

import { useEffect, useRef, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ArrowRightLeft, FileSpreadsheet, Loader2, Upload, X } from "lucide-react";
import { FORMATO_OPTIONS } from "@/lib/tesoreria/parsear-extracto";
import { formatMonto } from "@/lib/tesoreria/format";
import { toast } from "sonner";

export interface CuentaConciliable {
  id: number;
  nombre: string;
  tipo: string;
  moneda: "UYU" | "USD";
  saldo_actual: number;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  cuentas: CuentaConciliable[];
  cuentaId?: number;
  onCreated: (conciliacionId: number) => void;
}

export function NuevaConciliacionDialog({
  open,
  onOpenChange,
  cuentas,
  cuentaId: cuentaIdProp,
  onCreated,
}: Props) {
  const [cuentaId, setCuentaId] = useState("");
  const [periodoDesde, setPeriodoDesde] = useState("");
  const [periodoHasta, setPeriodoHasta] = useState("");
  const [saldoBanco, setSaldoBanco] = useState("");
  const [formato, setFormato] = useState("generico");
  const [archivo, setArchivo] = useState<File | null>(null);
  const [processing, setProcessing] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Pre-seleccionar cuenta si viene por prop al abrir
  useEffect(() => {
    if (open && cuentaIdProp) {
      setCuentaId(String(cuentaIdProp));
    }
  }, [open, cuentaIdProp]);

  const reset = () => {
    setCuentaId(cuentaIdProp ? String(cuentaIdProp) : "");
    setPeriodoDesde("");
    setPeriodoHasta("");
    setSaldoBanco("");
    setFormato("generico");
    setArchivo(null);
  };

  const handleClose = (next: boolean) => {
    if (!next) reset();
    onOpenChange(next);
  };

  const handleSubmit = async () => {
    if (!cuentaId || !periodoDesde || !periodoHasta || !saldoBanco) {
      toast.error("Completá todos los campos requeridos");
      return;
    }

    setProcessing(true);
    try {
      const formData = new FormData();
      formData.append("cuenta_id", cuentaId);
      formData.append("periodo_desde", periodoDesde);
      formData.append("periodo_hasta", periodoHasta);
      formData.append("saldo_banco", saldoBanco);
      formData.append("formato", formato);
      if (archivo) {
        formData.append("archivo", archivo);
      }

      const res = await fetch("/api/tesoreria/conciliacion", {
        method: "POST",
        body: formData,
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      toast.success(
        `Conciliación creada: ${data.data.resumen.matcheados} matcheados, ${
          data.data.resumen.pendientes_banco + data.data.resumen.pendientes_sistema
        } pendientes`
      );

      onOpenChange(false);
      reset();
      onCreated(data.data.conciliacion.id);
    } catch (err: any) {
      toast.error(err.message || "Error al crear conciliación");
    } finally {
      setProcessing(false);
    }
  };

  const cuentaSeleccionada = cuentas.find((c) => c.id === parseInt(cuentaId));
  const cuentasBancarias = cuentas.filter((c) => c.tipo === "bancaria");

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Nueva conciliación bancaria</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div>
            <Label>Cuenta</Label>
            <Select value={cuentaId} onValueChange={(v) => setCuentaId(v || "")}>
              <SelectTrigger>
                <SelectValue placeholder="Seleccionar cuenta..." />
              </SelectTrigger>
              <SelectContent>
                {cuentasBancarias.map((c) => (
                  <SelectItem key={c.id} value={String(c.id)}>
                    {c.nombre} ({c.moneda})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Desde</Label>
              <Input
                type="date"
                value={periodoDesde}
                onChange={(e) => setPeriodoDesde(e.target.value)}
              />
            </div>
            <div>
              <Label>Hasta</Label>
              <Input
                type="date"
                value={periodoHasta}
                onChange={(e) => setPeriodoHasta(e.target.value)}
              />
            </div>
          </div>

          <div>
            <Label>Saldo según banco</Label>
            <Input
              type="number"
              step="0.01"
              placeholder="0.00"
              value={saldoBanco}
              onChange={(e) => setSaldoBanco(e.target.value)}
            />
            {cuentaSeleccionada && (
              <p className="text-xs text-muted-foreground mt-1">
                Saldo sistema:{" "}
                {formatMonto(
                  cuentaSeleccionada.saldo_actual,
                  cuentaSeleccionada.moneda
                )}
              </p>
            )}
          </div>

          <div>
            <Label>Formato del extracto</Label>
            <Select
              value={formato}
              onValueChange={(v) => setFormato(v || "generico")}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {FORMATO_OPTIONS.map((f) => (
                  <SelectItem key={f.value} value={f.value}>
                    {f.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label>Extracto bancario (CSV / Excel / PDF)</Label>
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,.xlsx,.xls,.pdf"
              className="hidden"
              onChange={(e) => setArchivo(e.target.files?.[0] || null)}
            />
            <div
              onClick={() => fileInputRef.current?.click()}
              className={`
                mt-1 border-2 border-dashed rounded-lg p-6 text-center cursor-pointer
                transition-colors hover:border-bordo-300 hover:bg-bordo-50/30
                ${archivo ? "border-green-300 bg-green-50/30" : "border-muted"}
              `}
            >
              {archivo ? (
                <div className="flex items-center justify-center gap-2">
                  <FileSpreadsheet className="size-5 text-green-600" />
                  <span className="text-sm font-medium">{archivo.name}</span>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setArchivo(null);
                    }}
                    className="ml-2 text-muted-foreground hover:text-foreground"
                  >
                    <X className="size-4" />
                  </button>
                </div>
              ) : (
                <div>
                  <Upload className="size-8 mx-auto text-muted-foreground/40 mb-2" />
                  <p className="text-sm text-muted-foreground">
                    Click para subir o arrastrá el archivo
                  </p>
                  <p className="text-xs text-muted-foreground/60 mt-1">
                    PDF, CSV, XLS, XLSX
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => handleClose(false)}>
            Cancelar
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={processing}
            className="bg-bordo-800 hover:bg-bordo-900"
          >
            {processing ? (
              <>
                <Loader2 className="size-4 mr-2 animate-spin" />
                Procesando...
              </>
            ) : (
              <>
                <ArrowRightLeft className="size-4 mr-2" />
                Conciliar
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
