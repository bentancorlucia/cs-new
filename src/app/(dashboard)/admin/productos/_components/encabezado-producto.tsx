"use client";

import { motion } from "framer-motion";
import { Pencil, Plus } from "lucide-react";
import { fadeInUp, springSmooth } from "@/lib/motion";

export function EncabezadoProducto({
  titulo,
  subtitulo,
  modo,
}: {
  titulo: string;
  subtitulo: string;
  modo: "nuevo" | "editar";
}) {
  const Icono = modo === "nuevo" ? Plus : Pencil;
  return (
    <motion.div
      variants={fadeInUp}
      initial="hidden"
      animate="visible"
      transition={springSmooth}
      className="mb-2 flex items-center gap-3"
    >
      <div className="flex size-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
        <Icono className="size-4.5" />
      </div>
      <div className="min-w-0">
        <h1 className="truncate text-xl font-bold tracking-tight">{titulo}</h1>
        <p className="text-sm text-muted-foreground">{subtitulo}</p>
      </div>
    </motion.div>
  );
}
