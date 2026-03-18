"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { motion } from "framer-motion";
import {
  Warehouse,
  ArrowLeft,
  Package,
  Search,
  Loader2,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  fadeInUp,
  staggerContainer,
  springSmooth,
} from "@/lib/motion";
import { toast } from "sonner";
import Link from "next/link";

interface StockItem {
  id: number;
  producto_id: number;
  variante_id: number | null;
  deposito_id: number;
  cantidad: number;
  productos: {
    id: number;
    nombre: string;
    sku: string | null;
    precio: number;
    activo: boolean;
  };
  producto_variantes: {
    id: number;
    nombre: string;
    sku: string | null;
    atributos: Record<string, string>;
  } | null;
}

interface Deposito {
  id: number;
  nombre: string;
  descripcion: string | null;
  ubicacion: string | null;
  activo: boolean;
}

export default function DepositoDetallePage() {
  const params = useParams();
  const id = params.id as string;

  const [deposito, setDeposito] = useState<Deposito | null>(null);
  const [stock, setStock] = useState<StockItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  const load = useCallback(async () => {
    try {
      const [depRes, stockRes] = await Promise.all([
        fetch(`/api/admin/depositos/${id}`),
        fetch(`/api/admin/depositos/${id}/stock`),
      ]);

      if (!depRes.ok) throw new Error("Depósito no encontrado");

      const { data: depData } = await depRes.json();
      const { data: stockData } = await stockRes.json();

      setDeposito(depData);
      setStock(stockData || []);
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  const filtered = search
    ? stock.filter(
        (item) =>
          item.productos?.nombre?.toLowerCase().includes(search.toLowerCase()) ||
          item.productos?.sku?.toLowerCase().includes(search.toLowerCase())
      )
    : stock;

  const totalItems = filtered.reduce((sum, item) => sum + item.cantidad, 0);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!deposito) {
    return (
      <div className="text-center py-20">
        <p className="text-muted-foreground">Depósito no encontrado</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      {/* Header */}
      <motion.div
        variants={fadeInUp}
        initial="hidden"
        animate="visible"
        transition={springSmooth}
      >
        <Link
          href="/admin/stock/depositos"
          className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors mb-4"
        >
          <ArrowLeft className="size-4" />
          Depósitos
        </Link>

        <div className="flex items-center gap-3">
          <div className="flex size-12 items-center justify-center rounded-xl bg-primary/10">
            <Warehouse className="size-6 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">
              {deposito.nombre}
            </h1>
            {deposito.ubicacion && (
              <p className="text-sm text-muted-foreground">
                {deposito.ubicacion}
              </p>
            )}
          </div>
          <Badge variant="outline" className="ml-auto">
            {totalItems} unidades en stock
          </Badge>
        </div>
      </motion.div>

      {/* Search */}
      <motion.div
        variants={fadeInUp}
        initial="hidden"
        animate="visible"
        transition={{ ...springSmooth, delay: 0.05 }}
        className="relative"
      >
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar producto..."
          className="pl-9"
        />
      </motion.div>

      {/* Stock table */}
      <motion.div
        variants={fadeInUp}
        initial="hidden"
        animate="visible"
        transition={{ ...springSmooth, delay: 0.1 }}
        className="rounded-xl border overflow-hidden"
      >
        <table className="w-full text-sm">
          <thead className="bg-muted/40">
            <tr>
              <th className="text-left py-3 px-4 font-medium text-muted-foreground">
                Producto
              </th>
              <th className="text-left py-3 px-4 font-medium text-muted-foreground">
                Variante
              </th>
              <th className="text-left py-3 px-4 font-medium text-muted-foreground">
                SKU
              </th>
              <th className="text-right py-3 px-4 font-medium text-muted-foreground">
                Cantidad
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/30">
            {filtered.length === 0 ? (
              <tr>
                <td
                  colSpan={4}
                  className="text-center py-8 text-muted-foreground"
                >
                  {search ? "Sin resultados" : "Sin stock en este depósito"}
                </td>
              </tr>
            ) : (
              filtered.map((item) => (
                <motion.tr
                  key={item.id}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="hover:bg-muted/20 transition-colors"
                >
                  <td className="py-2.5 px-4">
                    <div className="flex items-center gap-2">
                      <Package className="size-4 text-muted-foreground" />
                      <span className="font-medium">
                        {item.productos?.nombre}
                      </span>
                    </div>
                  </td>
                  <td className="py-2.5 px-4 text-muted-foreground">
                    {item.producto_variantes?.nombre || "—"}
                  </td>
                  <td className="py-2.5 px-4 font-mono text-xs text-muted-foreground">
                    {item.producto_variantes?.sku ||
                      item.productos?.sku ||
                      "—"}
                  </td>
                  <td className="py-2.5 px-4 text-right font-semibold">
                    {item.cantidad}
                  </td>
                </motion.tr>
              ))
            )}
          </tbody>
        </table>
      </motion.div>
    </div>
  );
}
