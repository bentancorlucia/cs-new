"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Loader2, Mail, Pencil } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { springSmooth } from "@/lib/motion";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Email para avisos de pedidos sin cuenta (clientes presenciales).
export function EmailAvisos({
  pedidoId,
  email,
  onSaved,
}: {
  pedidoId: number;
  email: string | null;
  onSaved: (email: string | null) => void;
}) {
  const [editando, setEditando] = useState(false);
  const [valor, setValor] = useState(email ?? "");
  const [guardando, setGuardando] = useState(false);
  const valorTrim = valor.trim();
  const valido = valorTrim === "" || EMAIL_RE.test(valorTrim);

  async function guardar(e: React.FormEvent) {
    e.preventDefault();
    if (!valido) return;
    setGuardando(true);
    try {
      const res = await fetch(`/api/admin/pedidos/${pedidoId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email_cliente: valorTrim }),
      });
      const json = await res.json();
      if (!res.ok) {
        toast.error(json.error || "No se pudo guardar el email");
        return;
      }
      onSaved(json.data.email_cliente);
      setEditando(false);
      toast.success(
        json.data.email_cliente
          ? "Email guardado — recibirá los avisos del pedido"
          : "Email eliminado"
      );
    } catch {
      toast.error("Error de conexión");
    } finally {
      setGuardando(false);
    }
  }

  return (
    <AnimatePresence mode="wait" initial={false}>
      {editando ? (
        <motion.form
          key="editar"
          onSubmit={guardar}
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -4 }}
          transition={springSmooth}
          className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-center"
        >
          <Input
            type="email"
            inputMode="email"
            autoFocus
            value={valor}
            onChange={(e) => setValor(e.target.value)}
            placeholder="email@ejemplo.com"
            aria-invalid={!valido}
            className="h-8 text-sm sm:max-w-64"
          />
          <div className="flex gap-1.5">
            <Button type="submit" size="sm" disabled={!valido || guardando} className="h-8">
              {guardando ? <Loader2 className="size-3.5 animate-spin" /> : "Guardar"}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="h-8"
              onClick={() => {
                setValor(email ?? "");
                setEditando(false);
              }}
              disabled={guardando}
            >
              Cancelar
            </Button>
          </div>
        </motion.form>
      ) : (
        <motion.div
          key="ver"
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -4 }}
          transition={springSmooth}
          className="flex items-center gap-1.5 text-xs text-muted-foreground"
        >
          <Mail className="size-3" />
          {email ? (
            <span className="truncate">{email}</span>
          ) : (
            <span className="text-amber-700">Sin email para avisos</span>
          )}
          <motion.button
            type="button"
            whileTap={{ scale: 0.9 }}
            onClick={() => setEditando(true)}
            className="ml-1 inline-flex items-center gap-0.5 rounded px-1 text-bordo-700 hover:bg-bordo-50 transition-colors"
          >
            <Pencil className="size-3" />
            {email ? "Editar" : "Agregar"}
          </motion.button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
