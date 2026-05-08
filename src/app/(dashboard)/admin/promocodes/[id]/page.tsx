"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { motion } from "framer-motion";
import { Pencil } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { fadeInUp, springSmooth } from "@/lib/motion";
import { PromocodeForm } from "../_components/promocode-form";
import { useDocumentTitle } from "@/hooks/use-document-title";

export default function EditarPromocodePage() {
  useDocumentTitle("Editar promocode");
  const params = useParams();
  const id = params.id as string;
  const [promocode, setPromocode] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const res = await fetch(`/api/admin/promocodes/${id}`);
      if (res.ok) {
        const json = await res.json();
        setPromocode(json.data);
      }
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
            <Skeleton className="h-[280px] rounded-2xl" />
            <Skeleton className="h-[200px] rounded-2xl" />
          </div>
          <div className="space-y-6">
            <Skeleton className="h-[180px] rounded-2xl" />
            <Skeleton className="h-[120px] rounded-2xl" />
          </div>
        </div>
      </div>
    );
  }

  if (!promocode) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <p className="text-lg font-medium">Promocode no encontrado</p>
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
          <h1 className="text-xl font-bold tracking-tight font-mono">
            {promocode.codigo}
          </h1>
          <p className="text-sm text-muted-foreground">
            Editando promocode &middot; ID {promocode.id}
          </p>
        </div>
      </motion.div>
      <PromocodeForm promocode={promocode} />
    </div>
  );
}
