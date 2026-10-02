"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { ArrowRight, Info } from "lucide-react";

export function AvisoSimple({
  titulo,
  texto,
  href,
  accion,
}: {
  titulo: string;
  texto: string;
  href: string;
  accion: string;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: [0.25, 0.46, 0.45, 0.94] }}
      className="mx-auto max-w-lg rounded-2xl border border-linea bg-white p-6 text-center"
    >
      <div className="mx-auto mb-3 flex size-11 items-center justify-center rounded-full bg-bordo-50 text-bordo-800">
        <Info className="size-5" />
      </div>
      <h1 className="font-heading text-lg text-foreground">{titulo}</h1>
      <p className="mt-1 text-sm text-muted-foreground">{texto}</p>
      <Link
        href={href}
        className="group mt-4 inline-flex h-10 items-center gap-2 rounded-lg bg-bordo-800 px-4 text-sm font-medium text-white transition-colors hover:bg-bordo-900"
      >
        {accion}
        <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
      </Link>
    </motion.div>
  );
}
