"use client";

import { useState, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Upload,
  FileSpreadsheet,
  X,
  Check,
  AlertCircle,
  Loader2,
  Download,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { toast } from "sonner";

interface PreviewProduct {
  nombre: string;
  descripcion?: string | null;
  categoria?: string | null;
  precio: number;
  precio_socio?: number | null;
  sku?: string | null;
  stock_actual?: number;
  unidad?: string;
  activo?: boolean;
}

interface PreviewError {
  fila: number;
  error: string;
}

interface ImportResult {
  importados: number;
  skipped: { fila: number; nombre: string; razon: string }[];
  errors: PreviewError[];
  message: string;
}

type Step = "upload" | "preview" | "importing" | "done";

export function ImportarExcelDialog({
  open,
  onOpenChange,
  onSuccess,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}) {
  const [step, setStep] = useState<Step>("upload");
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<PreviewProduct[]>([]);
  const [errors, setErrors] = useState<PreviewError[]>([]);
  const [totalRows, setTotalRows] = useState(0);
  const [validRows, setValidRows] = useState(0);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const reset = useCallback(() => {
    setStep("upload");
    setFile(null);
    setPreview([]);
    setErrors([]);
    setTotalRows(0);
    setValidRows(0);
    setLoading(false);
    setResult(null);
    setDragOver(false);
  }, []);

  const handleClose = useCallback(
    (open: boolean) => {
      if (!open) reset();
      onOpenChange(open);
    },
    [onOpenChange, reset]
  );

  const handleFile = useCallback(async (f: File) => {
    const validTypes = [
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "application/vnd.ms-excel",
      "text/csv",
    ];
    const validExtensions = [".xlsx", ".xls", ".csv"];
    const ext = f.name.toLowerCase().slice(f.name.lastIndexOf("."));

    if (!validTypes.includes(f.type) && !validExtensions.includes(ext)) {
      toast.error("Formato no soportado. Usá .xlsx, .xls o .csv");
      return;
    }

    if (f.size > 10 * 1024 * 1024) {
      toast.error("El archivo es demasiado grande (máx. 10MB)");
      return;
    }

    setFile(f);
    setLoading(true);

    try {
      const formData = new FormData();
      formData.append("file", f);
      formData.append("mode", "preview");

      const res = await fetch("/api/admin/productos/importar", {
        method: "POST",
        body: formData,
      });

      const json = await res.json();

      if (!res.ok) {
        toast.error(json.error || "Error al procesar el archivo");
        setFile(null);
        return;
      }

      setPreview(json.preview || []);
      setErrors(json.errors || []);
      setTotalRows(json.total || 0);
      setValidRows(json.validos || 0);
      setStep("preview");
    } catch {
      toast.error("Error al procesar el archivo");
      setFile(null);
    } finally {
      setLoading(false);
    }
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      const f = e.dataTransfer.files[0];
      if (f) handleFile(f);
    },
    [handleFile]
  );

  const handleImport = useCallback(async () => {
    if (!file) return;
    setStep("importing");

    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("mode", "import");

      const res = await fetch("/api/admin/productos/importar", {
        method: "POST",
        body: formData,
      });

      const json = await res.json();

      if (!res.ok) {
        toast.error(json.error || "Error al importar");
        setStep("preview");
        return;
      }

      setResult(json);
      setStep("done");

      if (json.importados > 0) {
        toast.success(`${json.importados} productos importados`);
        onSuccess();
      }
    } catch {
      toast.error("Error al importar productos");
      setStep("preview");
    }
  }, [file, onSuccess]);

  const downloadTemplate = useCallback(() => {
    // Create a simple CSV template
    const headers = [
      "nombre",
      "descripcion",
      "descripcion_corta",
      "categoria",
      "precio",
      "precio_socio",
      "sku",
      "stock_actual",
      "stock_minimo",
      "unidad",
      "activo",
      "destacado",
    ];
    const exampleRow = [
      "Camiseta Club Seminario",
      "Camiseta oficial del club",
      "Camiseta oficial bordó",
      "Indumentaria",
      "1500",
      "1200",
      "CAM-001",
      "50",
      "5",
      "un",
      "si",
      "si",
    ];

    const csv = [headers.join(","), exampleRow.join(",")].join("\n");
    const blob = new Blob(["\ufeff" + csv], {
      type: "text/csv;charset=utf-8;",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "plantilla-productos.csv";
    a.click();
    URL.revokeObjectURL(url);
  }, []);

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-3xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="font-display text-lg uppercase tracking-tightest">
            {step === "upload" && "Importar productos desde Excel"}
            {step === "preview" && "Previsualización"}
            {step === "importing" && "Importando..."}
            {step === "done" && "Importación completada"}
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto min-h-0">
          <AnimatePresence mode="wait">
            {/* UPLOAD STEP */}
            {step === "upload" && (
              <motion.div
                key="upload"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="space-y-4"
              >
                <div
                  onDragOver={(e) => {
                    e.preventDefault();
                    setDragOver(true);
                  }}
                  onDragLeave={() => setDragOver(false)}
                  onDrop={handleDrop}
                  onClick={() => inputRef.current?.click()}
                  className={`
                    relative cursor-pointer rounded-xl border-2 border-dashed p-8
                    flex flex-col items-center justify-center gap-3
                    transition-colors duration-200
                    ${
                      dragOver
                        ? "border-bordo-500 bg-bordo-50"
                        : "border-linea hover:border-bordo-300 hover:bg-superficie/50"
                    }
                    ${loading ? "pointer-events-none opacity-60" : ""}
                  `}
                >
                  <input
                    ref={inputRef}
                    type="file"
                    accept=".xlsx,.xls,.csv"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) handleFile(f);
                    }}
                  />

                  {loading ? (
                    <Loader2 className="size-10 text-bordo-500 animate-spin" />
                  ) : (
                    <motion.div
                      animate={dragOver ? { scale: 1.1 } : { scale: 1 }}
                    >
                      <Upload className="size-10 text-muted-foreground" />
                    </motion.div>
                  )}

                  <div className="text-center">
                    <p className="font-body text-sm font-medium">
                      {loading
                        ? "Procesando archivo..."
                        : "Arrastrá el archivo o hacé clic para seleccionar"}
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      Formatos: .xlsx, .xls, .csv — Máximo 500 productos
                    </p>
                  </div>
                </div>

                <Button
                  variant="outline"
                  size="sm"
                  onClick={(e) => {
                    e.stopPropagation();
                    downloadTemplate();
                  }}
                  className="w-full"
                >
                  <Download className="size-4" />
                  Descargar plantilla de ejemplo
                </Button>

                <div className="rounded-lg bg-superficie/50 p-4 space-y-2">
                  <p className="font-body text-xs font-medium text-foreground">
                    Columnas esperadas:
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {[
                      { name: "nombre", required: true },
                      { name: "precio", required: true },
                      { name: "descripcion", required: false },
                      { name: "descripcion_corta", required: false },
                      { name: "categoria", required: false },
                      { name: "precio_socio", required: false },
                      { name: "sku", required: false },
                      { name: "stock_actual", required: false },
                      { name: "stock_minimo", required: false },
                      { name: "unidad", required: false },
                      { name: "activo", required: false },
                      { name: "destacado", required: false },
                    ].map((col) => (
                      <Badge
                        key={col.name}
                        variant={col.required ? "default" : "outline"}
                        className="text-[10px] font-mono"
                      >
                        {col.name}
                        {col.required && " *"}
                      </Badge>
                    ))}
                  </div>
                  <p className="text-[10px] text-muted-foreground">
                    * Obligatorios. Si no se indica categoría, se crea
                    automáticamente si no existe.
                  </p>
                </div>
              </motion.div>
            )}

            {/* PREVIEW STEP */}
            {step === "preview" && (
              <motion.div
                key="preview"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="space-y-4"
              >
                {/* Summary */}
                <div className="flex items-center gap-3 flex-wrap">
                  <div className="flex items-center gap-2">
                    <FileSpreadsheet className="size-4 text-muted-foreground" />
                    <span className="font-body text-sm">{file?.name}</span>
                  </div>
                  <Badge variant="secondary">{totalRows} filas</Badge>
                  <Badge
                    variant="default"
                    className="bg-emerald-100 text-emerald-700"
                  >
                    <Check className="size-3 mr-1" />
                    {validRows} válidos
                  </Badge>
                  {errors.length > 0 && (
                    <Badge variant="destructive">
                      <AlertCircle className="size-3 mr-1" />
                      {errors.length} con error
                    </Badge>
                  )}
                </div>

                {/* Errors */}
                {errors.length > 0 && (
                  <div className="rounded-lg border border-destructive/20 bg-destructive/5 p-3">
                    <p className="font-body text-xs font-medium text-destructive mb-2">
                      Filas con errores (no se importarán):
                    </p>
                    <div className="space-y-1">
                      {errors.slice(0, 10).map((err, i) => (
                        <p
                          key={i}
                          className="text-[11px] text-destructive/80 font-mono"
                        >
                          Fila {err.fila}: {err.error}
                        </p>
                      ))}
                      {errors.length > 10 && (
                        <p className="text-[11px] text-destructive/60">
                          ... y {errors.length - 10} más
                        </p>
                      )}
                    </div>
                  </div>
                )}

                {/* Preview table */}
                <div className="rounded-lg border border-linea overflow-hidden">
                  <div className="max-h-[40vh] overflow-auto">
                    <Table>
                      <TableHeader>
                        <TableRow className="hover:bg-transparent">
                          <TableHead className="text-[10px] font-heading uppercase tracking-editorial sticky top-0 bg-white">
                            Nombre
                          </TableHead>
                          <TableHead className="text-[10px] font-heading uppercase tracking-editorial sticky top-0 bg-white hidden sm:table-cell">
                            Categoría
                          </TableHead>
                          <TableHead className="text-[10px] font-heading uppercase tracking-editorial sticky top-0 bg-white text-right">
                            Precio
                          </TableHead>
                          <TableHead className="text-[10px] font-heading uppercase tracking-editorial sticky top-0 bg-white text-center hidden sm:table-cell">
                            Stock
                          </TableHead>
                          <TableHead className="text-[10px] font-heading uppercase tracking-editorial sticky top-0 bg-white hidden md:table-cell">
                            SKU
                          </TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {preview.slice(0, 50).map((prod, i) => (
                          <motion.tr
                            key={i}
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            transition={{ delay: i * 0.02 }}
                            className="border-b border-linea last:border-0"
                          >
                            <TableCell className="py-2">
                              <span className="font-body text-xs line-clamp-1">
                                {prod.nombre}
                              </span>
                            </TableCell>
                            <TableCell className="py-2 hidden sm:table-cell">
                              <span className="text-xs text-muted-foreground">
                                {prod.categoria || "—"}
                              </span>
                            </TableCell>
                            <TableCell className="py-2 text-right">
                              <span className="font-body text-xs font-medium">
                                ${prod.precio.toLocaleString("es-UY")}
                              </span>
                            </TableCell>
                            <TableCell className="py-2 text-center hidden sm:table-cell">
                              <span className="text-xs">
                                {prod.stock_actual ?? 0}
                              </span>
                            </TableCell>
                            <TableCell className="py-2 hidden md:table-cell">
                              <span className="text-xs text-muted-foreground font-mono">
                                {prod.sku || "—"}
                              </span>
                            </TableCell>
                          </motion.tr>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                  {preview.length > 50 && (
                    <div className="border-t border-linea px-4 py-2 bg-superficie/30">
                      <p className="text-[11px] text-muted-foreground text-center">
                        Mostrando 50 de {preview.length} productos
                      </p>
                    </div>
                  )}
                </div>
              </motion.div>
            )}

            {/* IMPORTING STEP */}
            {step === "importing" && (
              <motion.div
                key="importing"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="flex flex-col items-center justify-center py-12 gap-4"
              >
                <Loader2 className="size-10 text-bordo-500 animate-spin" />
                <p className="font-body text-sm text-muted-foreground">
                  Importando {validRows} productos...
                </p>
              </motion.div>
            )}

            {/* DONE STEP */}
            {step === "done" && result && (
              <motion.div
                key="done"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="space-y-4"
              >
                <div className="flex flex-col items-center justify-center py-8 gap-3">
                  <motion.div
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{
                      type: "spring",
                      stiffness: 200,
                      damping: 15,
                    }}
                    className="size-14 rounded-full bg-emerald-100 flex items-center justify-center"
                  >
                    <Check className="size-7 text-emerald-600" />
                  </motion.div>
                  <p className="font-body text-lg font-medium">
                    {result.importados} productos importados
                  </p>
                </div>

                {result.skipped.length > 0 && (
                  <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
                    <p className="font-body text-xs font-medium text-amber-700 mb-2">
                      Productos omitidos:
                    </p>
                    <div className="space-y-1">
                      {result.skipped.map((s, i) => (
                        <p key={i} className="text-[11px] text-amber-600">
                          Fila {s.fila}: {s.nombre} — {s.razon}
                        </p>
                      ))}
                    </div>
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <DialogFooter className="gap-2">
          {step === "upload" && (
            <Button variant="outline" onClick={() => handleClose(false)}>
              Cancelar
            </Button>
          )}

          {step === "preview" && (
            <>
              <Button variant="outline" onClick={reset}>
                <X className="size-4" />
                Cambiar archivo
              </Button>
              <Button onClick={handleImport} disabled={validRows === 0}>
                <Upload className="size-4" />
                Importar {validRows} productos
              </Button>
            </>
          )}

          {step === "done" && (
            <Button onClick={() => handleClose(false)}>Cerrar</Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
