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
  UserCheck,
  Copy,
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

interface PreviewSocio {
  nombre: string;
  apellido: string;
  cedula: string;
  fecha_nacimiento?: string | null;
  telefono?: string | null;
  notas?: string | null;
  disciplinas?: string | null;
  fila?: number;
  razon?: string;
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

export function ImportarSociosDialog({
  open,
  onOpenChange,
  onSuccess,
  disciplinasDisponibles = [],
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
  disciplinasDisponibles?: { id: number; nombre: string }[];
}) {
  const [step, setStep] = useState<Step>("upload");
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<PreviewSocio[]>([]);
  const [existentes, setExistentes] = useState<PreviewSocio[]>([]);
  const [duplicadosArchivo, setDuplicadosArchivo] = useState<PreviewSocio[]>([]);
  const [errors, setErrors] = useState<PreviewError[]>([]);
  const [totalRows, setTotalRows] = useState(0);
  const [validRows, setValidRows] = useState(0);
  const [nuevosCount, setNuevosCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const reset = useCallback(() => {
    setStep("upload");
    setFile(null);
    setPreview([]);
    setExistentes([]);
    setDuplicadosArchivo([]);
    setErrors([]);
    setTotalRows(0);
    setValidRows(0);
    setNuevosCount(0);
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

      const res = await fetch("/api/padron/importar", {
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
      setExistentes(json.existentes || []);
      setDuplicadosArchivo(json.duplicados_archivo || []);
      setErrors(json.errors || []);
      setTotalRows(json.total || 0);
      setValidRows(json.validos || 0);
      setNuevosCount(json.nuevos || 0);
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

      const res = await fetch("/api/padron/importar", {
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
        toast.success(`${json.importados} socios importados`);
        onSuccess();
      }
    } catch {
      toast.error("Error al importar socios");
      setStep("preview");
    }
  }, [file, onSuccess]);

  const downloadTemplate = useCallback(() => {
    const headers = [
      "nombre",
      "apellido",
      "cedula",
      "fecha_nacimiento",
      "telefono",
      "notas",
      "disciplinas",
    ];
    const exampleRows = [
      [
        "Juan",
        "Pérez",
        "1.234.567-8",
        "15/03/1990",
        "099123456",
        "",
        "Rugby; Hockey",
      ],
      [
        "María",
        "González",
        "2.345.678-9",
        "22/07/1985",
        "098765432",
        "Socia fundadora",
        "Handball",
      ],
    ];

    const csv = [headers.join(","), ...exampleRows.map((r) => r.join(","))].join("\n");
    const blob = new Blob(["\ufeff" + csv], {
      type: "text/csv;charset=utf-8;",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "plantilla-socios.csv";
    a.click();
    URL.revokeObjectURL(url);
  }, []);

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-3xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="font-display text-lg uppercase tracking-tightest">
            {step === "upload" && "Importar socios desde Excel"}
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
                      Formatos: .xlsx, .xls, .csv — Máximo 1000 socios
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
                      { name: "apellido", required: true },
                      { name: "cedula", required: true },
                      { name: "fecha_nacimiento", required: false },
                      { name: "telefono", required: false },
                      { name: "notas", required: false },
                      { name: "disciplinas", required: false },
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
                    * Obligatorios. Se saltean cédulas ya registradas.
                  </p>
                  {disciplinasDisponibles.length > 0 && (
                    <div className="pt-2 border-t border-linea/50 mt-2 space-y-1.5">
                      <p className="font-body text-xs font-medium text-foreground">
                        Disciplinas disponibles (usar estos nombres en la columna &quot;disciplinas&quot;, separados por punto y coma):
                      </p>
                      <div className="flex flex-wrap gap-1.5">
                        {disciplinasDisponibles.map((d) => (
                          <Badge
                            key={d.id}
                            variant="outline"
                            className="text-[10px] font-body"
                          >
                            {d.nombre}
                          </Badge>
                        ))}
                      </div>
                      <p className="text-[10px] text-muted-foreground">
                        Ej: &quot;{disciplinasDisponibles.slice(0, 2).map((d) => d.nombre).join("; ")}&quot;
                      </p>
                    </div>
                  )}
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
                    {nuevosCount} nuevos
                  </Badge>
                  {existentes.length > 0 && (
                    <Badge
                      variant="default"
                      className="bg-amber-100 text-amber-700"
                    >
                      <UserCheck className="size-3 mr-1" />
                      {existentes.length} ya registrados
                    </Badge>
                  )}
                  {duplicadosArchivo.length > 0 && (
                    <Badge
                      variant="default"
                      className="bg-orange-100 text-orange-700"
                    >
                      <Copy className="size-3 mr-1" />
                      {duplicadosArchivo.length} duplicados en archivo
                    </Badge>
                  )}
                  {errors.length > 0 && (
                    <Badge variant="destructive">
                      <AlertCircle className="size-3 mr-1" />
                      {errors.length} con error
                    </Badge>
                  )}
                </div>

                {/* Already registered */}
                {existentes.length > 0 && (
                  <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
                    <p className="font-body text-xs font-medium text-amber-700 mb-2">
                      Socios ya registrados (no se importarán):
                    </p>
                    <div className="space-y-1 max-h-[15vh] overflow-auto">
                      {existentes.map((s, i) => (
                        <p key={i} className="text-[11px] text-amber-600 font-mono">
                          Fila {s.fila}: {s.apellido}, {s.nombre} — CI {s.cedula}
                        </p>
                      ))}
                    </div>
                  </div>
                )}

                {/* Duplicates within file */}
                {duplicadosArchivo.length > 0 && (
                  <div className="rounded-lg border border-orange-200 bg-orange-50 p-3">
                    <p className="font-body text-xs font-medium text-orange-700 mb-2">
                      Cédulas duplicadas en el archivo (solo se importa la primera aparición):
                    </p>
                    <div className="space-y-1 max-h-[15vh] overflow-auto">
                      {duplicadosArchivo.map((s, i) => (
                        <p key={i} className="text-[11px] text-orange-600 font-mono">
                          Fila {s.fila}: {s.apellido}, {s.nombre} — CI {s.cedula}
                        </p>
                      ))}
                    </div>
                  </div>
                )}

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

                {/* Preview table — only new members */}
                {nuevosCount > 0 && (
                  <p className="font-body text-xs font-medium text-emerald-700">
                    Socios que se van a importar:
                  </p>
                )}
                <div className="rounded-lg border border-linea overflow-hidden">
                  <div className="max-h-[40vh] overflow-auto">
                    <Table>
                      <TableHeader>
                        <TableRow className="hover:bg-transparent">
                          <TableHead className="text-[10px] font-heading uppercase tracking-editorial sticky top-0 bg-white">
                            Apellido
                          </TableHead>
                          <TableHead className="text-[10px] font-heading uppercase tracking-editorial sticky top-0 bg-white">
                            Nombre
                          </TableHead>
                          <TableHead className="text-[10px] font-heading uppercase tracking-editorial sticky top-0 bg-white hidden sm:table-cell">
                            Cédula
                          </TableHead>
                          <TableHead className="text-[10px] font-heading uppercase tracking-editorial sticky top-0 bg-white hidden md:table-cell">
                            Teléfono
                          </TableHead>
                          <TableHead className="text-[10px] font-heading uppercase tracking-editorial sticky top-0 bg-white hidden lg:table-cell">
                            Disciplinas
                          </TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {preview.slice(0, 50).map((socio, i) => (
                          <motion.tr
                            key={i}
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            transition={{ delay: i * 0.02 }}
                            className="border-b border-linea last:border-0"
                          >
                            <TableCell className="py-2">
                              <span className="font-body text-xs">
                                {socio.apellido}
                              </span>
                            </TableCell>
                            <TableCell className="py-2">
                              <span className="font-body text-xs">
                                {socio.nombre}
                              </span>
                            </TableCell>
                            <TableCell className="py-2 hidden sm:table-cell">
                              <span className="text-xs text-muted-foreground font-mono">
                                {socio.cedula || "—"}
                              </span>
                            </TableCell>
                            <TableCell className="py-2 hidden md:table-cell">
                              <span className="text-xs text-muted-foreground">
                                {socio.telefono || "—"}
                              </span>
                            </TableCell>
                            <TableCell className="py-2 hidden lg:table-cell">
                              <span className="text-xs text-muted-foreground">
                                {socio.disciplinas || "—"}
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
                        Mostrando 50 de {preview.length} socios
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
                  Importando {nuevosCount} socios nuevos...
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
                    {result.importados} socios importados
                  </p>
                </div>

                {result.skipped.length > 0 && (
                  <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
                    <p className="font-body text-xs font-medium text-amber-700 mb-2">
                      Socios omitidos:
                    </p>
                    <div className="space-y-1 max-h-[20vh] overflow-auto">
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
              <Button onClick={handleImport} disabled={nuevosCount === 0}>
                <Upload className="size-4" />
                Importar {nuevosCount} socios nuevos
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
