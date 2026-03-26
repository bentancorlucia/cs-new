"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowLeft,
  ShoppingBag,
  ChevronDown,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { staggerContainer, fadeInUp } from "@/lib/motion";
import { useDocumentTitle } from "@/hooks/use-document-title";

interface PedidoItem {
  id: number;
  cantidad: number;
  precio_unitario: number;
  subtotal: number;
  productos: { nombre: string; slug: string } | null;
}

interface Pedido {
  id: number;
  numero_pedido: string;
  tipo: "online" | "pos";
  estado: string;
  subtotal: number;
  descuento: number;
  total: number;
  moneda: string;
  metodo_pago: string | null;
  notas: string | null;
  created_at: string;
  pedido_items: PedidoItem[];
}

const ESTADO_CONFIG: Record<string, { label: string; color: string }> = {
  pendiente: { label: "Pendiente", color: "bg-yellow-100 text-yellow-700" },
  pagado: { label: "Pagado", color: "bg-blue-100 text-blue-700" },
  preparando: { label: "Preparando", color: "bg-indigo-100 text-indigo-700" },
  listo_retiro: { label: "Listo para retiro", color: "bg-emerald-100 text-emerald-700" },
  retirado: { label: "Retirado", color: "bg-green-100 text-green-700" },
  cancelado: { label: "Cancelado", color: "bg-red-100 text-red-600" },
};

export default function MisPedidosPage() {
  useDocumentTitle("Mis Pedidos");
  const [pedidos, setPedidos] = useState<Pedido[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<number | null>(null);

  useEffect(() => {
    async function fetchPedidos() {
      try {
        const res = await fetch("/api/perfil/pedidos");
        if (res.ok) {
          setPedidos(await res.json());
        }
      } catch {
        // silently fail
      } finally {
        setLoading(false);
      }
    }
    fetchPedidos();
  }, []);

  return (
    <div className="mx-auto max-w-3xl">
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
        <Link
          href="/mi-cuenta"
          className="mb-3 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="size-4" />
          Mi cuenta
        </Link>
        <h1 className="font-display text-2xl font-bold text-foreground">
          Mis pedidos
        </h1>
        <p className="mt-1 text-muted-foreground text-sm">
          Historial de compras en la tienda
        </p>
      </motion.div>

      {loading ? (
        <div className="mt-6 space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-20 w-full rounded-xl" />
          ))}
        </div>
      ) : pedidos.length === 0 ? (
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="mt-12 flex flex-col items-center gap-3 text-muted-foreground"
        >
          <ShoppingBag className="size-16 opacity-20" />
          <p className="text-lg font-medium">No tenés pedidos</p>
          <Link href="/tienda" className="text-sm text-bordo-800 underline">
            Ir a la tienda
          </Link>
        </motion.div>
      ) : (
        <motion.div
          variants={staggerContainer}
          initial="hidden"
          animate="visible"
          className="mt-6 space-y-3"
        >
          {pedidos.map((pedido) => {
            const config = ESTADO_CONFIG[pedido.estado] ?? ESTADO_CONFIG.pendiente;
            const isExpanded = expandedId === pedido.id;

            return (
              <motion.div key={pedido.id} variants={fadeInUp}>
                <Card
                  className={`border-linea transition-shadow cursor-pointer ${isExpanded ? "shadow-card" : "hover:shadow-card"}`}
                  onClick={() => setExpandedId(isExpanded ? null : pedido.id)}
                >
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-sm font-bold text-foreground">
                            #{pedido.numero_pedido}
                          </span>
                          <Badge className={`text-[10px] ${config.color}`}>
                            {config.label}
                          </Badge>
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {new Date(pedido.created_at).toLocaleDateString("es-UY", {
                            day: "numeric",
                            month: "short",
                            year: "numeric",
                          })}
                          {" · "}
                          {pedido.pedido_items.length}{" "}
                          {pedido.pedido_items.length === 1 ? "producto" : "productos"}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="text-right shrink-0">
                          <p className="font-heading font-bold text-foreground">
                            ${pedido.total.toLocaleString("es-UY")}
                          </p>
                          {pedido.metodo_pago && (
                            <p className="text-[10px] text-muted-foreground capitalize">
                              {pedido.metodo_pago.replace("_", " ")}
                            </p>
                          )}
                        </div>
                        <motion.div
                          animate={{ rotate: isExpanded ? 180 : 0 }}
                          transition={{ duration: 0.2 }}
                        >
                          <ChevronDown className="size-4 text-muted-foreground" />
                        </motion.div>
                      </div>
                    </div>

                    <AnimatePresence>
                      {isExpanded && (
                        <motion.div
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: "auto" }}
                          exit={{ opacity: 0, height: 0 }}
                          transition={{ duration: 0.2 }}
                          className="overflow-hidden"
                        >
                          <Separator className="my-3" />
                          <div className="space-y-2">
                            {pedido.pedido_items.map((item) => (
                              <div
                                key={item.id}
                                className="flex items-center justify-between text-sm"
                              >
                                <span className="text-muted-foreground">
                                  {item.productos?.nombre ?? "Producto"}{" "}
                                  <span className="text-xs">x{item.cantidad}</span>
                                </span>
                                <span className="font-mono text-xs">
                                  ${item.subtotal.toLocaleString("es-UY")}
                                </span>
                              </div>
                            ))}
                            {pedido.descuento > 0 && (
                              <div className="flex items-center justify-between text-sm text-emerald-600">
                                <span>Descuento socio</span>
                                <span className="font-mono text-xs">
                                  -${pedido.descuento.toLocaleString("es-UY")}
                                </span>
                              </div>
                            )}
                          </div>
                          {pedido.notas && (
                            <p className="mt-2 text-xs text-muted-foreground italic">
                              Nota: {pedido.notas}
                            </p>
                          )}
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </CardContent>
                </Card>
              </motion.div>
            );
          })}
        </motion.div>
      )}
    </div>
  );
}
