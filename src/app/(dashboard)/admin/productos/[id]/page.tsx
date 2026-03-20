"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { motion } from "framer-motion";
import { Pencil } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { createBrowserClient } from "@/lib/supabase/client";
import { fadeInUp, springSmooth } from "@/lib/motion";
import { ProductoForm } from "../_components/producto-form";

export default function EditarProductoPage() {
  const params = useParams();
  const id = params.id as string;
  const [producto, setProducto] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const supabase = createBrowserClient();
      const { data } = await supabase
        .from("productos")
        .select(
          "*, categorias_producto(id, nombre, slug), producto_imagenes(id, url, alt_text, orden, es_principal, focal_point), producto_variantes(id, nombre, sku, precio_override, stock_actual, atributos, activo)"
        )
        .eq("id", parseInt(id))
        .single();
      setProducto(data);
      setLoading(false);
    }
    load();
  }, [id]);

  if (loading) {
    return (
      <div className="mx-auto max-w-5xl px-1 space-y-6">
        <div className="flex items-center gap-3">
          <Skeleton className="size-10 rounded-xl" />
          <div className="space-y-2">
            <Skeleton className="h-5 w-48" />
            <Skeleton className="h-3.5 w-32" />
          </div>
        </div>
        <div className="grid gap-6 lg:grid-cols-[1fr,340px]">
          <div className="space-y-6">
            <Skeleton className="h-[400px] rounded-2xl" />
            <Skeleton className="h-[280px] rounded-2xl" />
          </div>
          <div className="space-y-6">
            <Skeleton className="h-[300px] rounded-2xl" />
            <Skeleton className="h-[200px] rounded-2xl" />
          </div>
        </div>
      </div>
    );
  }

  if (!producto) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <p className="text-lg font-medium">Producto no encontrado</p>
        <p className="text-sm text-muted-foreground">
          Verificá que el ID sea correcto
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl px-1">
      <motion.div
        variants={fadeInUp}
        initial="hidden"
        animate="visible"
        transition={springSmooth}
        className="mb-2 flex items-center gap-3"
      >
        <div className="flex size-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <Pencil className="size-4.5" />
        </div>
        <div>
          <h1 className="text-xl font-bold tracking-tight">{producto.nombre}</h1>
          <p className="text-sm text-muted-foreground">
            Editando producto &middot; ID {producto.id}
          </p>
        </div>
      </motion.div>
      <ProductoForm producto={producto} />
    </div>
  );
}
