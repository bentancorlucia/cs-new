"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { motion } from "framer-motion";
import {
  ArrowLeft,
  FileText,
  Check,
  PackageCheck,
  X,
  Truck,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { fadeInUp, staggerContainer } from "@/lib/motion";
import { toast } from "sonner";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { useDocumentTitle } from "@/hooks/use-document-title";

interface CompraItem {
  id: number;
  producto_id: number;
  variante_id: number | null;
  cantidad: number;
  costo_unitario: number;
  subtotal: number;
  cantidad_recibida: number;
  productos: { id: number; nombre: string; sku: string | null };
  producto_variantes: { id: number; nombre: string } | null;
}

interface Compra {
  id: number;
  numero_compra: string;
  estado: string;
  subtotal: number;
  impuestos: number;
  total: number;
  fecha_compra: string;
  fecha_recepcion: string | null;
  notas: string | null;
  created_at: string;
  proveedores: {
    id: number;
    nombre: string;
    rut: string | null;
    razon_social: string | null;
  };
  compra_items: CompraItem[];
}

const estadoColor: Record<string, string> = {
  borrador: "outline",
  confirmada: "secondary",
  recibida: "default",
  cancelada: "destructive",
};

const estadoLabels: Record<string, string> = {
  borrador: "Borrador",
  confirmada: "Confirmada",
  recibida: "Recibida",
  cancelada: "Cancelada",
};

export default function CompraDetallePage() {
  useDocumentTitle("Detalle de Compra");
  const params = useParams();
  const router = useRouter();
  const compraId = params.id as string;

  const [compra, setCompra] = useState<Compra | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [confirmDialog, setConfirmDialog] = useState<string | null>(null);

  const fetchCompra = useCallback(async () => {
    const res = await fetch(`/api/admin/compras/${compraId}`);
    if (!res.ok) {
      router.push("/admin/compras");
      return;
    }
    const { data } = await res.json();
    setCompra(data as Compra);
    setLoading(false);
  }, [compraId, router]);

  useEffect(() => {
    fetchCompra();
  }, [fetchCompra]);

  async function handleAction(action: string) {
    setActionLoading(true);
    try {
      let res: Response;

      if (action === "recibir") {
        res = await fetch(`/api/admin/compras/${compraId}/recibir`, {
          method: "POST",
        });
      } else {
        res = await fetch(`/api/admin/compras/${compraId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ estado: action }),
        });
      }

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error);
      }

      const messages: Record<string, string> = {
        confirmada: "Compra confirmada",
        recibir: "Mercadería recibida — stock actualizado",
        cancelada: "Compra cancelada",
      };

      toast.success(messages[action] || "Actualizado");
      setConfirmDialog(null);
      fetchCompra();
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setActionLoading(false);
    }
  }

  function formatCurrency(n: number) {
    return `$${n.toLocaleString("es-UY")}`;
  }

  function formatDate(d: string) {
    try {
      return format(new Date(d), "dd 'de' MMMM, yyyy", { locale: es });
    } catch {
      return d;
    }
  }

  if (loading) {
    return (
      <div className="space-y-6 mx-auto max-w-3xl">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-40 w-full rounded-xl" />
        <Skeleton className="h-60 w-full rounded-xl" />
      </div>
    );
  }

  if (!compra) return null;

  return (
    <div className="mx-auto max-w-3xl">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="mb-6"
      >
        <Link
          href="/admin/compras"
          className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="size-4" />
          Volver a compras
        </Link>

        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="flex size-12 items-center justify-center rounded-xl bg-bordo-50">
              <FileText className="size-6 text-bordo-800" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-2xl font-bold">
                  {compra.numero_compra}
                </h1>
                <Badge
                  variant={
                    (estadoColor[compra.estado] as any) || "outline"
                  }
                >
                  {estadoLabels[compra.estado]}
                </Badge>
              </div>
              <p className="text-sm text-muted-foreground">
                {formatDate(compra.fecha_compra)}
              </p>
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex gap-2">
            {compra.estado === "borrador" && (
              <>
                <Button
                  variant="outline"
                  onClick={() => setConfirmDialog("cancelada")}
                >
                  <X className="size-4" />
                  Cancelar
                </Button>
                <Button onClick={() => setConfirmDialog("confirmada")}>
                  <Check className="size-4" />
                  Confirmar
                </Button>
              </>
            )}
            {compra.estado === "confirmada" && (
              <>
                <Button
                  variant="outline"
                  onClick={() => setConfirmDialog("cancelada")}
                >
                  <X className="size-4" />
                  Cancelar
                </Button>
                <Button onClick={() => setConfirmDialog("recibir")}>
                  <PackageCheck className="size-4" />
                  Recibir mercadería
                </Button>
              </>
            )}
          </div>
        </div>
      </motion.div>

      <motion.div
        variants={staggerContainer}
        initial="hidden"
        animate="visible"
        className="space-y-6"
      >
        {/* Proveedor info */}
        <motion.div
          variants={fadeInUp}
          className="rounded-xl border bg-card p-6"
        >
          <h2 className="font-semibold mb-3">Proveedor</h2>
          <div className="flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-lg bg-muted">
              <Truck className="size-5 text-muted-foreground" />
            </div>
            <div>
              <Link
                href={`/admin/proveedores/${compra.proveedores.id}`}
                className="font-medium hover:text-bordo"
              >
                {compra.proveedores.nombre}
              </Link>
              {compra.proveedores.rut && (
                <p className="text-xs text-muted-foreground">
                  RUT: {compra.proveedores.rut}
                </p>
              )}
            </div>
          </div>
          {compra.notas && (
            <>
              <Separator className="my-3" />
              <p className="text-sm text-muted-foreground">{compra.notas}</p>
            </>
          )}
          {compra.fecha_recepcion && (
            <>
              <Separator className="my-3" />
              <p className="text-sm">
                <span className="text-muted-foreground">
                  Recibida:{" "}
                </span>
                {formatDate(compra.fecha_recepcion)}
              </p>
            </>
          )}
        </motion.div>

        {/* Items */}
        <motion.div
          variants={fadeInUp}
          className="rounded-xl border bg-card overflow-hidden"
        >
          <div className="p-4 border-b">
            <h2 className="font-semibold">
              Items ({compra.compra_items.length})
            </h2>
          </div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Producto</TableHead>
                <TableHead className="text-center">Cantidad</TableHead>
                {compra.estado === "recibida" && (
                  <TableHead className="text-center">Recibida</TableHead>
                )}
                <TableHead className="text-right">Costo unit.</TableHead>
                <TableHead className="text-right">Subtotal</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {compra.compra_items.map((item) => (
                <TableRow key={item.id}>
                  <TableCell>
                    <Link
                      href={`/admin/productos/${item.producto_id}`}
                      className="font-medium hover:text-bordo"
                    >
                      {item.productos.nombre}
                    </Link>
                    {item.producto_variantes && (
                      <p className="text-xs text-muted-foreground">
                        {item.producto_variantes.nombre}
                      </p>
                    )}
                    {item.productos.sku && (
                      <p className="text-xs text-muted-foreground">
                        SKU: {item.productos.sku}
                      </p>
                    )}
                  </TableCell>
                  <TableCell className="text-center">
                    {item.cantidad}
                  </TableCell>
                  {compra.estado === "recibida" && (
                    <TableCell className="text-center">
                      <span
                        className={
                          item.cantidad_recibida >= item.cantidad
                            ? "text-emerald-600"
                            : "text-amber-600"
                        }
                      >
                        {item.cantidad_recibida}
                      </span>
                    </TableCell>
                  )}
                  <TableCell className="text-right">
                    {formatCurrency(item.costo_unitario)}
                  </TableCell>
                  <TableCell className="text-right font-medium">
                    {formatCurrency(item.subtotal)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>

          <div className="border-t p-4">
            <div className="flex flex-col items-end gap-1">
              <p className="text-sm text-muted-foreground">
                Subtotal:{" "}
                <span className="font-medium text-foreground">
                  {formatCurrency(compra.subtotal)}
                </span>
              </p>
              {compra.impuestos > 0 && (
                <p className="text-sm text-muted-foreground">
                  Impuestos:{" "}
                  <span className="font-medium text-foreground">
                    {formatCurrency(compra.impuestos)}
                  </span>
                </p>
              )}
              <motion.p
                key={compra.total}
                initial={{ scale: 1.05 }}
                animate={{ scale: 1 }}
                className="text-xl font-bold"
              >
                Total: {formatCurrency(compra.total)}
              </motion.p>
            </div>
          </div>
        </motion.div>
      </motion.div>

      {/* Confirmation dialogs */}
      <Dialog
        open={confirmDialog !== null}
        onOpenChange={() => setConfirmDialog(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {confirmDialog === "confirmada" && "Confirmar compra"}
              {confirmDialog === "recibir" && "Recibir mercadería"}
              {confirmDialog === "cancelada" && "Cancelar compra"}
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            {confirmDialog === "confirmada" &&
              "Al confirmar, el total de la compra se sumará a la deuda con el proveedor."}
            {confirmDialog === "recibir" &&
              "Al recibir la mercadería, el stock de cada producto se actualizará automáticamente."}
            {confirmDialog === "cancelada" &&
              compra.estado === "confirmada" &&
              "Se revertirá la deuda registrada en la cuenta corriente del proveedor."}
            {confirmDialog === "cancelada" &&
              compra.estado === "borrador" &&
              "¿Estás seguro de cancelar esta compra?"}
          </p>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setConfirmDialog(null)}
            >
              Volver
            </Button>
            <Button
              variant={
                confirmDialog === "cancelada" ? "destructive" : "default"
              }
              onClick={() => handleAction(confirmDialog!)}
              disabled={actionLoading}
            >
              {actionLoading
                ? "Procesando..."
                : confirmDialog === "confirmada"
                  ? "Confirmar"
                  : confirmDialog === "recibir"
                    ? "Recibir"
                    : "Cancelar compra"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
