"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { Loader2, X } from "lucide-react";

type Cuenta = {
  id: number;
  nombre: string;
  tipo: "bancaria" | "mercadopago" | "caja_chica" | "virtual";
  banco: string | null;
  numero_cuenta: string | null;
  titular?: string | null;
  descripcion?: string | null;
  color: string | null;
  saldo_inicial?: number | string | null;
};

export function CuentaEditModal({
  cuenta,
  open,
  onClose,
}: {
  cuenta: Cuenta;
  open: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    nombre: cuenta.nombre,
    banco: cuenta.banco ?? "",
    numero_cuenta: cuenta.numero_cuenta ?? "",
    titular: cuenta.titular ?? "",
    descripcion: cuenta.descripcion ?? "",
    color: cuenta.color ?? "#730d32",
    saldo_inicial: String(cuenta.saldo_inicial ?? 0),
  });

  useEffect(() => {
    if (open) {
      setForm({
        nombre: cuenta.nombre,
        banco: cuenta.banco ?? "",
        numero_cuenta: cuenta.numero_cuenta ?? "",
        titular: cuenta.titular ?? "",
        descripcion: cuenta.descripcion ?? "",
        color: cuenta.color ?? "#730d32",
        saldo_inicial: String(cuenta.saldo_inicial ?? 0),
      });
      setError(null);
    }
  }, [open, cuenta]);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    const res = await fetch(`/api/tesoreria/cuentas/${cuenta.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        nombre: form.nombre,
        banco: cuenta.tipo === "bancaria" ? form.banco || null : null,
        numero_cuenta: form.numero_cuenta || null,
        titular: form.titular || null,
        descripcion: form.descripcion || null,
        color: form.color || null,
        saldo_inicial: Number(form.saldo_inicial) || 0,
      }),
    });
    setSubmitting(false);
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      setError(d.error ?? "Error al guardar cambios");
      return;
    }
    onClose();
    router.refresh();
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={onClose}
        >
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.97 }}
            transition={{ type: "spring", stiffness: 300, damping: 28 }}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-lg rounded-2xl bg-white shadow-xl border border-linea overflow-hidden"
          >
            <div className="flex items-center justify-between px-5 py-4 border-b border-linea">
              <div>
                <div className="text-xs uppercase tracking-editorial text-muted-foreground font-heading">
                  Editar cuenta
                </div>
                <div className="font-heading text-lg text-bordo-900">{cuenta.nombre}</div>
              </div>
              <button
                onClick={onClose}
                className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-superficie"
              >
                <X className="size-4" />
              </button>
            </div>

            <form onSubmit={onSubmit} className="p-5 space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Nombre" required>
                  <input
                    type="text"
                    required
                    value={form.nombre}
                    onChange={(e) => setForm({ ...form, nombre: e.target.value })}
                    className="ed-input"
                  />
                </Field>
                <Field label="Saldo inicial">
                  <input
                    type="number"
                    step="0.01"
                    value={form.saldo_inicial}
                    onChange={(e) => setForm({ ...form, saldo_inicial: e.target.value })}
                    className="ed-input"
                  />
                </Field>
                {cuenta.tipo === "bancaria" && (
                  <>
                    <Field label="Banco">
                      <input
                        type="text"
                        value={form.banco}
                        onChange={(e) => setForm({ ...form, banco: e.target.value })}
                        className="ed-input"
                        placeholder="ITAU"
                      />
                    </Field>
                    <Field label="Número de cuenta">
                      <input
                        type="text"
                        value={form.numero_cuenta}
                        onChange={(e) => setForm({ ...form, numero_cuenta: e.target.value })}
                        className="ed-input"
                      />
                    </Field>
                    <Field label="Titular" full>
                      <input
                        type="text"
                        value={form.titular}
                        onChange={(e) => setForm({ ...form, titular: e.target.value })}
                        className="ed-input"
                      />
                    </Field>
                  </>
                )}
                <Field label="Color">
                  <input
                    type="color"
                    value={form.color}
                    onChange={(e) => setForm({ ...form, color: e.target.value })}
                    className="h-10 w-full rounded-lg border border-linea cursor-pointer"
                  />
                </Field>
                <Field label="Descripción" full>
                  <textarea
                    value={form.descripcion}
                    onChange={(e) => setForm({ ...form, descripcion: e.target.value })}
                    className="ed-input min-h-[60px]"
                  />
                </Field>
              </div>

              {error && <div className="text-sm text-red-600">{error}</div>}

              <div className="flex items-center justify-end gap-3 pt-2 border-t border-linea">
                <button
                  type="button"
                  onClick={onClose}
                  className="text-sm text-muted-foreground hover:text-foreground px-3 py-2"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="inline-flex items-center gap-2 rounded-full bg-bordo-800 text-white text-sm font-medium px-5 py-2 hover:bg-bordo-900 disabled:opacity-60"
                >
                  {submitting && <Loader2 className="size-4 animate-spin" />}
                  Guardar cambios
                </button>
              </div>

              <style jsx>{`
                :global(.ed-input) {
                  width: 100%;
                  border: 1px solid #e5e0db;
                  background: #fff;
                  padding: 0.5rem 0.75rem;
                  border-radius: 0.5rem;
                  font-size: 0.875rem;
                  outline: none;
                }
                :global(.ed-input:focus) {
                  border-color: #730d32;
                  box-shadow: 0 0 0 3px rgba(115, 13, 50, 0.1);
                }
              `}</style>
            </form>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function Field({
  label,
  children,
  required,
  full,
}: {
  label: string;
  children: React.ReactNode;
  required?: boolean;
  full?: boolean;
}) {
  return (
    <div className={full ? "sm:col-span-2" : ""}>
      <label className="block text-xs font-heading uppercase tracking-editorial text-muted-foreground mb-1.5">
        {label} {required && <span className="text-red-600">*</span>}
      </label>
      {children}
    </div>
  );
}
