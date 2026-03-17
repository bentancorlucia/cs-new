"use client";

import { useState, useRef, useCallback, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Upload,
  FileSpreadsheet,
  AlertCircle,
  Check,
  Info,
  Sparkles,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { springSmooth, fadeInUp } from "@/lib/motion";
import { toast } from "sonner";
import {
  parsearExtracto,
  type MovimientoBanco,
} from "@/lib/tesoreria/parsear-extracto";

interface Cuenta {
  id: number;
  nombre: string;
  color: string;
  moneda: string;
}

interface Categoria {
  id: number;
  nombre: string;
  slug: string;
  color: string;
  tipo: "ingreso" | "egreso";
}

interface MovimientoPreview extends MovimientoBanco {
  categoria_id: string;
  autoCategoria: boolean; // true si fue asignada automáticamente
  incluir: boolean;
}

interface ImportarCSVDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  cuentas: Cuenta[];
  categorias: Categoria[];
  onImportComplete: () => void;
}

// --- Auto-categorización por keywords en la descripción ---

interface ReglaCategoria {
  slug: string;
  keywords: string[];
}

const REGLAS_INGRESO: ReglaCategoria[] = [
  { slug: "cuotas-socios", keywords: ["cuota", "cuotas", "socio", "socios", "membresia", "membresía"] },
  { slug: "cuota-colaborador", keywords: ["colaborador", "colaboradora"] },
  { slug: "cuota-deportivo", keywords: ["deportivo", "deportiva"] },
  { slug: "ventas-tienda", keywords: ["venta", "ventas", "tienda", "mercadería", "mercaderia"] },
  { slug: "ventas-online", keywords: ["online", "web", "ecommerce"] },
  { slug: "ventas-pos", keywords: ["pos", "mostrador", "caja"] },
  { slug: "entradas-eventos", keywords: ["entrada", "entradas", "evento", "ticket", "tickets"] },
  { slug: "donaciones", keywords: ["donación", "donacion", "donaciones", "dona"] },
  { slug: "sponsors", keywords: ["sponsor", "sponsors", "patrocinio", "auspicio", "auspiciante"] },
  { slug: "sponsors-principales", keywords: ["sponsor principal", "patrocinio principal"] },
  { slug: "alquiler-instalaciones", keywords: ["alquiler", "cancha", "salon", "salón", "instalación", "instalacion"] },
  { slug: "otros-ingresos", keywords: ["varios", "otros", "miscelaneo", "misceláneos"] },
];

const REGLAS_EGRESO: ReglaCategoria[] = [
  { slug: "compras-proveedores", keywords: ["proveedor", "proveedores", "compra", "compras", "factura"] },
  { slug: "mercaderia-tienda", keywords: ["mercadería", "mercaderia", "stock", "inventario", "reposición", "reposicion"] },
  { slug: "insumos-deportivos", keywords: ["insumo", "insumos", "deportivo", "deportiva", "pelota", "equipamiento"] },
  { slug: "servicios", keywords: ["servicio", "servicios"] },
  { slug: "luz", keywords: ["luz", "ute", "electricidad", "energía", "energia", "eléctric"] },
  { slug: "agua", keywords: ["agua", "ose", "saneamiento"] },
  { slug: "internet", keywords: ["internet", "wifi", "fibra", "antel datos", "banda ancha"] },
  { slug: "telefono", keywords: ["teléfono", "telefono", "telefonia", "telefonía", "antel", "movistar", "claro"] },
  { slug: "sueldos-honorarios", keywords: ["sueldo", "sueldos", "salario", "honorario", "honorarios", "nómina", "nomina", "bps", "remuneración", "remuneracion"] },
  { slug: "alquiler-canchas", keywords: ["alquiler cancha", "cancha", "canchas", "campo"] },
  { slug: "mantenimiento", keywords: ["mantenimiento", "reparación", "reparacion", "arreglo", "limpieza", "pintura"] },
  { slug: "transporte", keywords: ["transporte", "flete", "combustible", "nafta", "gasoil", "pasaje", "omnibus", "ómnibus"] },
  { slug: "seguros", keywords: ["seguro", "seguros", "póliza", "poliza", "bse"] },
  { slug: "impuestos-tasas", keywords: ["impuesto", "impuestos", "tasa", "tasas", "dgi", "bps", "contribución", "contribucion", "tributo"] },
  { slug: "eventos-gastos", keywords: ["evento", "eventos", "organización evento", "gasto evento"] },
  { slug: "logistica-eventos", keywords: ["logística", "logistica", "montaje", "desmontaje"] },
  { slug: "sonido-iluminacion", keywords: ["sonido", "iluminación", "iluminacion", "audio", "parlante", "luz evento"] },
  { slug: "catering", keywords: ["catering", "comida", "bebida", "servicio comida"] },
  { slug: "marketing-comunicacion", keywords: ["marketing", "publicidad", "comunicación", "comunicacion", "diseño", "redes sociales", "imprenta", "cartelería", "carteleria"] },
  { slug: "otros-egresos", keywords: ["varios", "otros", "misceláneo", "miscelaneo"] },
];

function autoCategorizar(
  descripcion: string,
  tipo: "ingreso" | "egreso",
  categorias: Categoria[]
): string | null {
  const desc = descripcion.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  const reglas = tipo === "ingreso" ? REGLAS_INGRESO : REGLAS_EGRESO;

  // Buscar la regla con el keyword más largo que matchee (más específico primero)
  let bestMatch: { slug: string; len: number } | null = null;

  for (const regla of reglas) {
    for (const kw of regla.keywords) {
      const kwNorm = kw.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
      if (desc.includes(kwNorm)) {
        if (!bestMatch || kwNorm.length > bestMatch.len) {
          bestMatch = { slug: regla.slug, len: kwNorm.length };
        }
      }
    }
  }

  if (!bestMatch) return null;

  // Buscar la categoría por slug
  const cat = categorias.find((c) => c.slug === bestMatch!.slug && c.tipo === tipo);
  return cat ? String(cat.id) : null;
}

// --- Columnas del formato genérico ---

const COLUMNAS_REQUERIDAS = [
  { nombre: "fecha", descripcion: "DD/MM/AAAA", obligatoria: true },
  { nombre: "descripcion", descripcion: "Texto del movimiento", obligatoria: true },
  { nombre: "monto", descripcion: "Positivo = ingreso, negativo = egreso", obligatoria: true },
  { nombre: "referencia", descripcion: "Nro. comprobante, factura, etc.", obligatoria: false },
];

function formatDate(dateStr: string): string {
  const [y, m, d] = dateStr.split("-");
  return `${d}/${m}/${y?.slice(-2)}`;
}

function formatMonto(monto: number): string {
  return monto.toLocaleString("es-UY", { minimumFractionDigits: 0 });
}

export function ImportarCSVDialog({
  open,
  onOpenChange,
  cuentas,
  categorias,
  onImportComplete,
}: ImportarCSVDialogProps) {
  const [step, setStep] = useState<"config" | "preview">("config");
  const [cuentaId, setCuentaId] = useState("");
  const [fileName, setFileName] = useState("");
  const [movimientos, setMovimientos] = useState<MovimientoPreview[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [categoriaGlobal, setCategoriaGlobal] = useState<Record<"ingreso" | "egreso", string>>({
    ingreso: "",
    egreso: "",
  });
  const fileInputRef = useRef<HTMLInputElement>(null);

  const cuentaSeleccionada = cuentas.find((c) => String(c.id) === cuentaId);
  const categoriasIngreso = useMemo(() => categorias.filter((c) => c.tipo === "ingreso"), [categorias]);
  const categoriasEgreso = useMemo(() => categorias.filter((c) => c.tipo === "egreso"), [categorias]);

  const reset = useCallback(() => {
    setStep("config");
    setCuentaId("");
    setFileName("");
    setMovimientos([]);
    setCategoriaGlobal({ ingreso: "", egreso: "" });
    if (fileInputRef.current) fileInputRef.current.value = "";
  }, []);

  function handleClose(isOpen: boolean) {
    if (!isOpen) reset();
    onOpenChange(isOpen);
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setFileName(file.name);

    try {
      const isExcel = /\.(xlsx?|xlsm)$/i.test(file.name);
      let content: string | ArrayBuffer;

      if (isExcel) {
        content = await file.arrayBuffer();
      } else {
        content = await file.text();
      }

      const parsed = parsearExtracto(content, file.name, "generico");

      if (parsed.length === 0) {
        toast.error(
          "No se encontraron movimientos. Verifica que el CSV tenga las columnas: fecha, descripcion, monto"
        );
        return;
      }

      // Auto-categorizar cada movimiento
      let autoCount = 0;
      const previews: MovimientoPreview[] = parsed.map((m) => {
        const catId = autoCategorizar(m.descripcion, m.tipo, categorias);
        if (catId) autoCount++;
        return {
          ...m,
          categoria_id: catId || "",
          autoCategoria: !!catId,
          incluir: true,
        };
      });

      setMovimientos(previews);
      setStep("preview");

      if (autoCount > 0) {
        toast.success(
          `${parsed.length} movimientos encontrados. ${autoCount} categorizados automaticamente.`
        );
      } else {
        toast.success(`${parsed.length} movimientos encontrados`);
      }
    } catch {
      toast.error("Error al procesar el archivo. Verifica que el formato sea correcto.");
    }
  }

  function aplicarCategoriaGlobal(tipo: "ingreso" | "egreso", catId: string) {
    setCategoriaGlobal((prev) => ({ ...prev, [tipo]: catId }));
    setMovimientos((prev) =>
      prev.map((m) =>
        m.tipo === tipo ? { ...m, categoria_id: catId, autoCategoria: false } : m
      )
    );
  }

  function toggleIncluir(index: number) {
    setMovimientos((prev) =>
      prev.map((m, i) => (i === index ? { ...m, incluir: !m.incluir } : m))
    );
  }

  function setCategoriaRow(index: number, catId: string) {
    setMovimientos((prev) =>
      prev.map((m, i) => (i === index ? { ...m, categoria_id: catId, autoCategoria: false } : m))
    );
  }

  const movimientosAImportar = movimientos.filter((m) => m.incluir && m.categoria_id);
  const autoCategorizados = movimientos.filter((m) => m.autoCategoria && m.incluir).length;
  const sinCategoria = movimientos.filter((m) => m.incluir && !m.categoria_id).length;
  const totalIngresos = movimientos
    .filter((m) => m.incluir && m.tipo === "ingreso")
    .reduce((acc, m) => acc + m.monto, 0);
  const totalEgresos = movimientos
    .filter((m) => m.incluir && m.tipo === "egreso")
    .reduce((acc, m) => acc + m.monto, 0);

  async function handleImport() {
    if (!cuentaId) {
      toast.error("Selecciona una cuenta");
      return;
    }

    if (sinCategoria > 0) {
      toast.error(`${sinCategoria} movimientos no tienen categoria asignada`);
      return;
    }

    if (movimientosAImportar.length === 0) {
      toast.error("No hay movimientos para importar");
      return;
    }

    setSubmitting(true);
    try {
      const payload = movimientosAImportar.map((m) => ({
        cuenta_id: Number(cuentaId),
        tipo: m.tipo,
        categoria_id: Number(m.categoria_id),
        monto: m.monto,
        moneda: cuentaSeleccionada?.moneda || "UYU",
        fecha: m.fecha,
        descripcion: m.descripcion,
        referencia: m.referencia || null,
      }));

      const res = await fetch("/api/tesoreria/movimientos/importar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ movimientos: payload }),
      });

      if (res.ok) {
        const result = await res.json();
        toast.success(`${result.importados} movimientos importados correctamente`);
        handleClose(false);
        onImportComplete();
      } else {
        const err = await res.json().catch(() => null);
        toast.error(err?.error || "Error al importar movimientos");
      }
    } catch {
      toast.error("Error de conexion");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-heading text-lg tracking-editorial flex items-center gap-2">
            <FileSpreadsheet className="size-5" />
            Importar movimientos desde CSV
          </DialogTitle>
        </DialogHeader>

        <AnimatePresence mode="wait">
          {step === "config" ? (
            <motion.div
              key="config"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={springSmooth}
              className="space-y-5 py-2"
            >
              {/* Cuenta destino */}
              <div className="space-y-1.5">
                <Label className="font-body text-sm">Cuenta destino *</Label>
                <Select value={cuentaId} onValueChange={(v) => setCuentaId(v ?? "")}>
                  <SelectTrigger>
                    <SelectValue placeholder="Seleccionar cuenta bancaria" />
                  </SelectTrigger>
                  <SelectContent>
                    {cuentas.map((c) => (
                      <SelectItem key={c.id} value={String(c.id)}>
                        <span className="flex items-center gap-2">
                          <span
                            className="inline-block size-2 rounded-full shrink-0"
                            style={{ backgroundColor: c.color }}
                          />
                          {c.nombre}
                          <span className="text-muted-foreground text-xs">({c.moneda})</span>
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Columnas requeridas */}
              <div className="rounded-lg border border-blue-200 bg-blue-50/50 p-4 space-y-3">
                <p className="flex items-center gap-2 text-sm font-medium text-blue-800 font-body">
                  <Info className="size-4" />
                  Columnas requeridas en el CSV
                </p>

                <div className="space-y-1.5">
                  {COLUMNAS_REQUERIDAS.map((col) => (
                    <div key={col.nombre} className="flex items-center gap-2">
                      <Badge
                        variant="secondary"
                        className="bg-blue-100 text-blue-700 border-blue-200 font-mono text-xs min-w-[100px] justify-center"
                      >
                        {col.nombre}
                      </Badge>
                      <span className="text-xs text-blue-600 font-body">
                        {col.descripcion}
                      </span>
                      {!col.obligatoria && (
                        <span className="text-[10px] text-blue-400 font-body">(opcional)</span>
                      )}
                    </div>
                  ))}
                </div>

                <div className="space-y-1 pt-1">
                  <p className="text-xs text-blue-600 font-body font-medium">
                    Ejemplo:
                  </p>
                  <code className="block text-xs bg-blue-100/70 rounded px-2.5 py-1.5 font-mono text-blue-800 whitespace-pre">
{`fecha,descripcion,monto,referencia
15/03/2026,Cobro cuota socio,1500,REC-001
15/03/2026,Pago luz UTE,-3200,FAC-456`}
                  </code>
                </div>

                <div className="flex items-start gap-2 pt-1">
                  <Sparkles className="size-3.5 text-blue-500 mt-0.5 shrink-0" />
                  <p className="text-xs text-blue-600 font-body">
                    Las categorias se asignan automaticamente segun la descripcion.
                    Los montos negativos se interpretan como egresos.
                    Formato de fecha: DD/MM/AAAA. Montos en formato uruguayo (1.234,56).
                  </p>
                </div>
              </div>

              {/* File upload */}
              <div className="space-y-1.5">
                <Label className="font-body text-sm">Archivo *</Label>
                <div
                  onClick={() => fileInputRef.current?.click()}
                  className="relative flex flex-col items-center justify-center rounded-lg border-2 border-dashed border-muted-foreground/25 hover:border-bordo-300 bg-superficie/30 hover:bg-bordo-50/30 transition-colors cursor-pointer py-8 px-4"
                >
                  <Upload className="size-8 text-muted-foreground/50 mb-2" />
                  <p className="text-sm font-body text-muted-foreground text-center">
                    {fileName || "Click para seleccionar archivo CSV o Excel"}
                  </p>
                  <p className="text-xs text-muted-foreground/70 font-body mt-1">
                    .csv, .xlsx, .xls
                  </p>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".csv,.xlsx,.xls,.xlsm"
                    onChange={handleFileChange}
                    className="hidden"
                  />
                </div>
              </div>
            </motion.div>
          ) : (
            <motion.div
              key="preview"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={springSmooth}
              className="space-y-4 py-2"
            >
              {/* Resumen */}
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="secondary" className="font-body">
                  {movimientos.filter((m) => m.incluir).length} movimientos
                </Badge>
                <Badge
                  variant="secondary"
                  className="bg-emerald-50 text-emerald-700 border-emerald-200 font-body"
                >
                  +${formatMonto(totalIngresos)} ingresos
                </Badge>
                <Badge
                  variant="secondary"
                  className="bg-red-50 text-red-700 border-red-200 font-body"
                >
                  -${formatMonto(totalEgresos)} egresos
                </Badge>
                <Badge
                  variant="secondary"
                  className="bg-bordo-50 text-bordo-800 border-bordo-200 font-body"
                >
                  {cuentaSeleccionada?.nombre} ({cuentaSeleccionada?.moneda})
                </Badge>
              </div>

              {/* Auto-categorización info */}
              {autoCategorizados > 0 && (
                <motion.div
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="flex items-center gap-2 text-xs text-emerald-700 font-body bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2"
                >
                  <Sparkles className="size-3.5 shrink-0" />
                  {autoCategorizados} de {movimientos.filter((m) => m.incluir).length} movimientos
                  categorizados automaticamente. Revisa y ajusta si es necesario.
                </motion.div>
              )}

              {/* Categoria global (solo si hay sin categoría) */}
              {sinCategoria > 0 && (
                <div className="rounded-lg border border-amber-200 bg-amber-50/50 p-3 space-y-2">
                  <p className="text-sm font-medium text-amber-800 font-body flex items-center gap-2">
                    <AlertCircle className="size-4" />
                    {sinCategoria} movimientos sin categoria — asignar a todos:
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <div className="space-y-1">
                      <Label className="text-xs text-amber-700 font-body">Ingresos</Label>
                      <Select
                        value={categoriaGlobal.ingreso || "sin-asignar"}
                        onValueChange={(v) =>
                          aplicarCategoriaGlobal("ingreso", v === "sin-asignar" ? "" : v ?? "")
                        }
                      >
                        <SelectTrigger className="h-8 text-xs">
                          <SelectValue placeholder="Sin asignar" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="sin-asignar">Sin asignar</SelectItem>
                          {categoriasIngreso.map((c) => (
                            <SelectItem key={c.id} value={String(c.id)}>
                              <span className="flex items-center gap-1.5">
                                <span
                                  className="inline-block size-2 rounded-full shrink-0"
                                  style={{ backgroundColor: c.color }}
                                />
                                {c.nombre}
                              </span>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs text-amber-700 font-body">Egresos</Label>
                      <Select
                        value={categoriaGlobal.egreso || "sin-asignar"}
                        onValueChange={(v) =>
                          aplicarCategoriaGlobal("egreso", v === "sin-asignar" ? "" : v ?? "")
                        }
                      >
                        <SelectTrigger className="h-8 text-xs">
                          <SelectValue placeholder="Sin asignar" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="sin-asignar">Sin asignar</SelectItem>
                          {categoriasEgreso.map((c) => (
                            <SelectItem key={c.id} value={String(c.id)}>
                              <span className="flex items-center gap-1.5">
                                <span
                                  className="inline-block size-2 rounded-full shrink-0"
                                  style={{ backgroundColor: c.color }}
                                />
                                {c.nombre}
                              </span>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </div>
              )}

              {/* Preview table */}
              <div className="rounded-lg border border-linea overflow-hidden max-h-[340px] overflow-y-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="hover:bg-transparent bg-superficie/50">
                      <TableHead className="w-8 font-heading uppercase tracking-editorial text-[10px]" />
                      <TableHead className="font-heading uppercase tracking-editorial text-[10px]">
                        Fecha
                      </TableHead>
                      <TableHead className="font-heading uppercase tracking-editorial text-[10px] min-w-[140px]">
                        Descripcion
                      </TableHead>
                      <TableHead className="font-heading uppercase tracking-editorial text-[10px] text-right">
                        Monto
                      </TableHead>
                      <TableHead className="font-heading uppercase tracking-editorial text-[10px] min-w-[140px]">
                        Categoria
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {movimientos.map((m, i) => (
                      <motion.tr
                        key={i}
                        variants={fadeInUp}
                        initial="hidden"
                        animate="visible"
                        className={`border-b border-linea last:border-0 transition-colors ${
                          m.incluir ? "hover:bg-superficie/50" : "opacity-40 bg-muted/30"
                        }`}
                      >
                        <TableCell className="py-2 px-2">
                          <button
                            type="button"
                            onClick={() => toggleIncluir(i)}
                            className={`size-5 rounded border flex items-center justify-center transition-colors ${
                              m.incluir
                                ? "bg-bordo-800 border-bordo-800 text-white"
                                : "border-muted-foreground/30 text-transparent hover:border-muted-foreground/50"
                            }`}
                          >
                            <Check className="size-3" />
                          </button>
                        </TableCell>
                        <TableCell className="py-2 text-xs font-body text-muted-foreground whitespace-nowrap">
                          {formatDate(m.fecha)}
                        </TableCell>
                        <TableCell className="py-2">
                          <p className="text-xs font-body font-medium line-clamp-1">
                            {m.descripcion}
                          </p>
                          {m.referencia && (
                            <p className="text-[10px] text-muted-foreground font-body">
                              Ref: {m.referencia}
                            </p>
                          )}
                        </TableCell>
                        <TableCell className="py-2 text-right whitespace-nowrap">
                          <span
                            className={`text-xs font-body font-medium ${
                              m.tipo === "ingreso" ? "text-emerald-600" : "text-red-600"
                            }`}
                          >
                            {m.tipo === "ingreso" ? "+" : "-"}${formatMonto(m.monto)}
                          </span>
                        </TableCell>
                        <TableCell className="py-2">
                          <div className="flex items-center gap-1">
                            <Select
                              value={m.categoria_id || "sin-asignar"}
                              onValueChange={(v) =>
                                setCategoriaRow(i, v === "sin-asignar" ? "" : v ?? "")
                              }
                              disabled={!m.incluir}
                            >
                              <SelectTrigger className={`h-7 text-xs ${
                                m.autoCategoria ? "border-emerald-300 bg-emerald-50/50" : ""
                              }`}>
                                <SelectValue placeholder="Asignar" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="sin-asignar">Sin asignar</SelectItem>
                                {(m.tipo === "ingreso" ? categoriasIngreso : categoriasEgreso).map(
                                  (c) => (
                                    <SelectItem key={c.id} value={String(c.id)}>
                                      <span className="flex items-center gap-1.5">
                                        <span
                                          className="inline-block size-2 rounded-full shrink-0"
                                          style={{ backgroundColor: c.color }}
                                        />
                                        {c.nombre}
                                      </span>
                                    </SelectItem>
                                  )
                                )}
                              </SelectContent>
                            </Select>
                            {m.autoCategoria && (
                              <Sparkles className="size-3 text-emerald-500 shrink-0" />
                            )}
                          </div>
                        </TableCell>
                      </motion.tr>
                    ))}
                  </TableBody>
                </Table>
              </div>

              {/* Warnings */}
              {sinCategoria > 0 && (
                <motion.p
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="text-xs text-amber-600 font-body flex items-center gap-1.5"
                >
                  <AlertCircle className="size-3.5" />
                  {sinCategoria} movimientos sin categoria. Asigna una categoria para poder importarlos.
                </motion.p>
              )}
            </motion.div>
          )}
        </AnimatePresence>

        <DialogFooter className="gap-2">
          {step === "preview" && (
            <Button
              variant="outline"
              onClick={() => {
                setStep("config");
                setMovimientos([]);
                setFileName("");
                if (fileInputRef.current) fileInputRef.current.value = "";
              }}
              disabled={submitting}
              className="mr-auto"
            >
              Volver
            </Button>
          )}
          <Button
            variant="outline"
            onClick={() => handleClose(false)}
            disabled={submitting}
          >
            Cancelar
          </Button>
          {step === "preview" && (
            <Button
              className="bg-bordo-800 hover:bg-bordo-700 text-white"
              onClick={handleImport}
              disabled={submitting || movimientosAImportar.length === 0}
            >
              {submitting
                ? "Importando..."
                : `Importar ${movimientosAImportar.length} movimientos`}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
