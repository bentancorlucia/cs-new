"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowLeft,
  ShoppingBag,
  ChevronDown,
  ArrowRight,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { staggerContainer, fadeInUp } from "@/lib/motion";
import { useDocumentTitle } from "@/hooks/use-document-title";

interface MtoCampoOpcion {
  valor: string;
  label: string;
}

interface MtoCampo {
  key: string;
  label: string;
  tipo: "texto" | "numero" | "select" | "talle";
  opciones?: MtoCampoOpcion[];
}

interface PedidoItem {
  id: number;
  cantidad: number;
  precio_unitario: number;
  subtotal: number;
  es_encargue?: boolean;
  personalizacion?: Record<string, string | number> | null;
  precio_extra_personalizacion?: number;
  productos: {
    nombre: string;
    slug: string;
    mto_campos?: MtoCampo[];
    mto_tiempo_fabricacion_dias?: number | null;
  } | null;
  producto_variantes?: { nombre: string } | null;
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
  pendiente_verificacion: { label: "Verificando pago", color: "bg-orange-100 text-orange-700" },
  pagado: { label: "Pagado", color: "bg-blue-100 text-blue-700" },
  encargado: { label: "Encargado al proveedor", color: "bg-blue-100 text-blue-700" },
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
                          <div className="space-y-3">
                            {pedido.pedido_items.map((item) => {
                              const campos = item.productos?.mto_campos ?? [];
                              const personalizacion = item.personalizacion ?? {};
                              const personalizacionEntries = Object.entries(personalizacion).map(
                                ([key, raw]) => {
                                  const campo = campos.find((c) => c.key === key);
                                  let valor = String(raw);
                                  if (campo && (campo.tipo === "select" || campo.tipo === "talle")) {
                                    const opcion = campo.opciones?.find((o) => o.valor === valor);
                                    if (opcion) valor = opcion.label;
                                  }
                                  return { key, label: campo?.label ?? key, valor };
                                }
                              );
                              return (
                                <div key={item.id} className="space-y-1">
                                  <div className="flex items-start justify-between gap-3 text-sm">
                                    <div className="min-w-0">
                                      <span className="text-foreground">
                                        {item.productos?.nombre ?? "Producto"}{" "}
                                        <span className="text-xs text-muted-foreground">
                                          x{item.cantidad}
                                        </span>
                                      </span>
                                      {item.es_encargue && (
                                        <span className="ml-2 inline-flex items-center rounded-full border border-blue-200 bg-blue-50 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-blue-700">
                                          Encargue
                                        </span>
                                      )}
                                      {!item.es_encargue && item.producto_variantes?.nombre && (
                                        <p className="text-xs text-muted-foreground">
                                          {item.producto_variantes.nombre}
                                        </p>
                                      )}
                                    </div>
                                    <span className="font-mono text-xs shrink-0">
                                      ${item.subtotal.toLocaleString("es-UY")}
                                    </span>
                                  </div>
                                  {item.es_encargue && personalizacionEntries.length > 0 && (
                                    <div className="ml-2 flex flex-col gap-0.5 rounded-md bg-blue-50/60 px-2.5 py-1.5 text-[11px] text-blue-900">
                                      {personalizacionEntries.map((r) => (
                                        <div key={r.key} className="flex justify-between gap-3">
                                          <span className="text-blue-800/70">{r.label}</span>
                                          <span className="font-medium">{r.valor}</span>
                                        </div>
                                      ))}
                                      {item.precio_extra_personalizacion ? (
                                        <div className="flex justify-between gap-3 border-t border-blue-200 pt-0.5 mt-0.5">
                                          <span className="text-blue-800/70">Sobrecargo</span>
                                          <span className="font-medium">
                                            +${Number(item.precio_extra_personalizacion).toLocaleString("es-UY")}
                                          </span>
                                        </div>
                                      ) : null}
                                      {item.productos?.mto_tiempo_fabricacion_dias ? (
                                        <p className="text-[10px] text-blue-800/60 mt-0.5">
                                          Demora aprox. {item.productos.mto_tiempo_fabricacion_dias} días
                                        </p>
                                      ) : null}
                                    </div>
                                  )}
                                </div>
                              );
                            })}
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
                          <Link
                            href={`/tienda/pedido/${pedido.id}`}
                            onClick={(e) => e.stopPropagation()}
                            className="mt-3 inline-flex items-center gap-1 text-xs font-heading uppercase tracking-editorial text-bordo-800 hover:text-bordo-950 transition-colors"
                          >
                            Ver detalle completo
                            <ArrowRight className="size-3" />
                          </Link>
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
