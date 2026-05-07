"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";

const TIPOS = [
  { value: "bancaria", label: "Bancaria (ITAÚ)" },
  { value: "caja_chica", label: "Caja chica" },
  { value: "mercadopago", label: "MercadoPago" },
  { value: "virtual", label: "Otra" },
] as const;

export function CuentaForm() {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    nombre: "",
    tipo: "bancaria" as (typeof TIPOS)[number]["value"],
    moneda: "UYU" as "UYU" | "USD",
    banco: "ITAU",
    numero_cuenta: "",
    titular: "",
    saldo_inicial: "0",
    descripcion: "",
    color: "#730d32",
  });

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    const res = await fetch("/api/tesoreria/cuentas", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...form,
        saldo_inicial: Number(form.saldo_inicial) || 0,
        banco: form.tipo === "bancaria" ? form.banco || "ITAU" : null,
      }),
    });
    setSubmitting(false);
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      setError(d.error ?? "Error al crear cuenta");
      return;
    }
    router.push("/tesoreria/cuentas");
    router.refresh();
  };

  return (
    <form onSubmit={onSubmit} className="space-y-4 rounded-2xl border border-linea bg-white p-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Nombre" required>
          <input
            type="text"
            required
            value={form.nombre}
            onChange={(e) => setForm({ ...form, nombre: e.target.value })}
            className="input"
            placeholder="ITAÚ UYU"
          />
        </Field>
        <Field label="Tipo">
          <select
            value={form.tipo}
            onChange={(e) =>
              setForm({ ...form, tipo: e.target.value as typeof form.tipo })
            }
            className="input"
          >
            {TIPOS.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Moneda">
          <select
            value={form.moneda}
            onChange={(e) => setForm({ ...form, moneda: e.target.value as "UYU" | "USD" })}
            className="input"
          >
            <option value="UYU">UYU — Pesos uruguayos</option>
            <option value="USD">USD — Dólares</option>
          </select>
        </Field>
        <Field label="Saldo inicial">
          <input
            type="number"
            step="0.01"
            value={form.saldo_inicial}
            onChange={(e) => setForm({ ...form, saldo_inicial: e.target.value })}
            className="input"
          />
        </Field>
        {form.tipo === "bancaria" && (
          <>
            <Field label="Número de cuenta">
              <input
                type="text"
                value={form.numero_cuenta}
                onChange={(e) => setForm({ ...form, numero_cuenta: e.target.value })}
                className="input"
                placeholder="0000000000"
              />
            </Field>
            <Field label="Titular">
              <input
                type="text"
                value={form.titular}
                onChange={(e) => setForm({ ...form, titular: e.target.value })}
                className="input"
                placeholder="Club Seminario"
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
            className="input min-h-[60px]"
            placeholder="Cuenta principal en pesos…"
          />
        </Field>
      </div>

      {error && <div className="text-sm text-red-600">{error}</div>}

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={submitting}
          className="inline-flex items-center gap-2 rounded-full bg-bordo-800 text-white text-sm font-medium px-5 py-2 hover:bg-bordo-900 disabled:opacity-60"
        >
          {submitting && <Loader2 className="size-4 animate-spin" />}
          Crear cuenta
        </button>
        <button
          type="button"
          onClick={() => history.back()}
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          Cancelar
        </button>
      </div>

      <style jsx>{`
        :global(.input) {
          width: 100%;
          border: 1px solid #e5e0db;
          background: #fff;
          padding: 0.5rem 0.75rem;
          border-radius: 0.5rem;
          font-size: 0.875rem;
          outline: none;
        }
        :global(.input:focus) {
          border-color: #730d32;
          box-shadow: 0 0 0 3px rgba(115, 13, 50, 0.1);
        }
      `}</style>
    </form>
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
