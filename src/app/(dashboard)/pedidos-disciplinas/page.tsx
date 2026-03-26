"use client";

import { useCallback, useEffect, useState } from "react";
import { motion } from "framer-motion";
import {
  ShoppingBag,
  Plus,
  Loader2,
  Users,
  DollarSign,
  Calendar,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  fadeInUp,
  staggerContainer,
  springSmooth,
} from "@/lib/motion";
import { toast } from "sonner";
import { createBrowserClient } from "@/lib/supabase/client";
import Link from "next/link";
import { useDocumentTitle } from "@/hooks/use-document-title";

interface Disciplina {
  id: number;
  nombre: string;
  saldo_cuenta_corriente: number;
}

interface Pedido {
  id: number;
  numero_pedido: string;
  total: number;
  estado: string;
  created_at: string;
  notas: string | null;
  disciplinas: { id: number; nombre: string };
  perfiles: { nombre_completo: string } | null;
  pedido_items: any[];
}

export default function PedidosDisciplinasPage() {
  useDocumentTitle("Pedidos de Disciplinas");
  const [disciplinas, setDisciplinas] = useState<Disciplina[]>([]);
  const [pedidos, setPedidos] = useState<Pedido[]>([]);
  const [loading, setLoading] = useState(true);
  const [filtroDisc, setFiltroDisc] = useState<string>("all");

  const load = useCallback(async () => {
    try {
      const supabase = createBrowserClient();
      const [discRes, pedidosRes] = await Promise.all([
        supabase
          .from("disciplinas")
          .select("id, nombre, saldo_cuenta_corriente")
          .eq("activa", true)
          .order("nombre"),
        fetch(
          `/api/admin/pedidos-disciplina${
            filtroDisc !== "all" ? `?disciplina_id=${filtroDisc}` : ""
          }`
        ),
      ]);

      setDisciplinas((discRes.data as any) || []);

      if (pedidosRes.ok) {
        const { data } = await pedidosRes.json();
        setPedidos(data || []);
      }
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setLoading(false);
    }
  }, [filtroDisc]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      {/* Header */}
      <motion.div
        variants={fadeInUp}
        initial="hidden"
        animate="visible"
        transition={springSmooth}
        className="flex items-center justify-between"
      >
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            Pedidos Disciplinas
          </h1>
          <p className="text-sm text-muted-foreground">
            Pedidos mayoristas con cuenta corriente
          </p>
        </div>
        <Link href="/pedidos-disciplinas/nuevo">
          <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.97 }}>
            <Button>
              <Plus className="size-4 mr-2" />
              Nuevo pedido
            </Button>
          </motion.div>
        </Link>
      </motion.div>

      {/* Cuentas corrientes */}
      {disciplinas.length > 0 && (
        <motion.div
          variants={fadeInUp}
          initial="hidden"
          animate="visible"
          transition={{ ...springSmooth, delay: 0.05 }}
          className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3"
        >
          {disciplinas
            .filter((d) => d.saldo_cuenta_corriente > 0)
            .map((d) => (
              <div
                key={d.id}
                className="flex items-center justify-between rounded-xl border border-border/60 bg-card p-3"
              >
                <div className="flex items-center gap-2">
                  <Users className="size-4 text-primary" />
                  <span className="text-sm font-medium">{d.nombre}</span>
                </div>
                <Badge
                  variant="outline"
                  className="text-xs font-mono text-amber-600 border-amber-200"
                >
                  <DollarSign className="size-3 mr-0.5" />
                  {d.saldo_cuenta_corriente.toLocaleString("es-UY")}
                </Badge>
              </div>
            ))}
        </motion.div>
      )}

      {/* Filter */}
      <motion.div
        variants={fadeInUp}
        initial="hidden"
        animate="visible"
        transition={{ ...springSmooth, delay: 0.1 }}
      >
        <Select value={filtroDisc} onValueChange={(v) => setFiltroDisc(v || "all")}>
          <SelectTrigger className="w-60">
            <SelectValue placeholder="Filtrar por disciplina" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas las disciplinas</SelectItem>
            {disciplinas.map((d) => (
              <SelectItem key={d.id} value={d.id.toString()}>
                {d.nombre}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </motion.div>

      {/* Pedidos list */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="size-6 animate-spin text-muted-foreground" />
        </div>
      ) : pedidos.length === 0 ? (
        <motion.div
          variants={fadeInUp}
          initial="hidden"
          animate="visible"
          className="text-center py-12"
        >
          <ShoppingBag className="size-10 mx-auto text-muted-foreground/30 mb-3" />
          <p className="text-muted-foreground">No hay pedidos</p>
        </motion.div>
      ) : (
        <motion.div
          variants={staggerContainer}
          initial="hidden"
          animate="visible"
          className="space-y-3"
        >
          {pedidos.map((pedido) => (
            <motion.div
              key={pedido.id}
              variants={fadeInUp}
              className="rounded-xl border border-border/60 p-4 hover:border-border transition-colors"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Badge variant="outline" className="font-mono text-xs">
                    {pedido.numero_pedido}
                  </Badge>
                  <Badge className="text-[10px] bg-primary">
                    {pedido.disciplinas?.nombre}
                  </Badge>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-lg font-bold">
                    ${pedido.total.toLocaleString("es-UY")}
                  </span>
                  <span className="flex items-center gap-1 text-xs text-muted-foreground">
                    <Calendar className="size-3" />
                    {new Date(pedido.created_at).toLocaleDateString("es-UY", {
                      day: "2-digit",
                      month: "short",
                      year: "numeric",
                    })}
                  </span>
                </div>
              </div>

              {pedido.pedido_items && pedido.pedido_items.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {pedido.pedido_items.map((item: any, i: number) => (
                    <Badge key={i} variant="secondary" className="text-[10px]">
                      {item.productos?.nombre}
                      {item.producto_variantes?.nombre
                        ? ` (${item.producto_variantes.nombre})`
                        : ""}
                      {" × "}
                      {item.cantidad}
                    </Badge>
                  ))}
                </div>
              )}

              {pedido.notas && (
                <p className="mt-1.5 text-xs text-muted-foreground">
                  {pedido.notas}
                </p>
              )}

              {pedido.perfiles && (
                <p className="mt-1 text-[11px] text-muted-foreground">
                  por {pedido.perfiles.nombre_completo}
                </p>
              )}
            </motion.div>
          ))}
        </motion.div>
      )}
    </div>
  );
}
