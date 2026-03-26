"use client";

import { motion } from "framer-motion";
import { Plus } from "lucide-react";
import { fadeInUp, springSmooth } from "@/lib/motion";
import { ProductoForm } from "../_components/producto-form";
import { useDocumentTitle } from "@/hooks/use-document-title";

export default function NuevoProductoPage() {
  useDocumentTitle("Nuevo Producto");
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
          <Plus className="size-5" />
        </div>
        <div>
          <h1 className="text-xl font-bold tracking-tight">Nuevo producto</h1>
          <p className="text-sm text-muted-foreground">
            Completá la información y guardá para poder agregar fotos
          </p>
        </div>
      </motion.div>
      <ProductoForm />
    </div>
  );
}
