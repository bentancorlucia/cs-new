"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { ArrowLeft, Save, Truck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { fadeInUp, staggerContainer } from "@/lib/motion";
import Link from "next/link";

export default function NuevoProveedorPage() {
  const router = useRouter();
  const [saving, setSaving] = useState(false);

  const [form, setForm] = useState({
    nombre: "",
    rut: "",
    razon_social: "",
    contacto_nombre: "",
    contacto_telefono: "",
    contacto_email: "",
    direccion: "",
    notas: "",
  });

  function update(field: string, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.nombre.trim()) {
      toast.error("El nombre es requerido");
      return;
    }

    setSaving(true);
    try {
      const res = await fetch("/api/admin/proveedores", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          rut: form.rut || null,
          razon_social: form.razon_social || null,
          contacto_nombre: form.contacto_nombre || null,
          contacto_telefono: form.contacto_telefono || null,
          contacto_email: form.contacto_email || null,
          direccion: form.direccion || null,
          notas: form.notas || null,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Error al crear proveedor");
      }

      const { data } = await res.json();
      toast.success("Proveedor creado");
      router.push(`/admin/proveedores/${data.id}`);
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="mb-6"
      >
        <Link
          href="/admin/proveedores"
          className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="size-4" />
          Volver a proveedores
        </Link>
        <div className="flex items-center gap-3">
          <div className="flex size-10 items-center justify-center rounded-xl bg-bordo-50">
            <Truck className="size-5 text-bordo-800" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">Nuevo proveedor</h1>
            <p className="text-sm text-muted-foreground">
              Registrá un nuevo proveedor en el sistema
            </p>
          </div>
        </div>
      </motion.div>

      <motion.form
        onSubmit={handleSubmit}
        variants={staggerContainer}
        initial="hidden"
        animate="visible"
        className="space-y-6"
      >
        {/* Datos principales */}
        <motion.div
          variants={fadeInUp}
          className="rounded-xl border bg-card p-6 space-y-4"
        >
          <h2 className="font-semibold">Datos del proveedor</h2>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <Label htmlFor="nombre">Nombre *</Label>
              <Input
                id="nombre"
                value={form.nombre}
                onChange={(e) => update("nombre", e.target.value)}
                placeholder="Nombre del proveedor"
                required
              />
            </div>
            <div>
              <Label htmlFor="rut">RUT</Label>
              <Input
                id="rut"
                value={form.rut}
                onChange={(e) => update("rut", e.target.value)}
                placeholder="Ej: 21.456.789-001"
              />
            </div>
            <div>
              <Label htmlFor="razon_social">Razón social</Label>
              <Input
                id="razon_social"
                value={form.razon_social}
                onChange={(e) => update("razon_social", e.target.value)}
                placeholder="Razón social"
              />
            </div>
          </div>
        </motion.div>

        {/* Contacto */}
        <motion.div
          variants={fadeInUp}
          className="rounded-xl border bg-card p-6 space-y-4"
        >
          <h2 className="font-semibold">Contacto</h2>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="contacto_nombre">Persona de contacto</Label>
              <Input
                id="contacto_nombre"
                value={form.contacto_nombre}
                onChange={(e) => update("contacto_nombre", e.target.value)}
                placeholder="Nombre del contacto"
              />
            </div>
            <div>
              <Label htmlFor="contacto_telefono">Teléfono</Label>
              <Input
                id="contacto_telefono"
                value={form.contacto_telefono}
                onChange={(e) => update("contacto_telefono", e.target.value)}
                placeholder="Ej: 099 888 777"
              />
            </div>
            <div>
              <Label htmlFor="contacto_email">Email</Label>
              <Input
                id="contacto_email"
                type="email"
                value={form.contacto_email}
                onChange={(e) => update("contacto_email", e.target.value)}
                placeholder="email@proveedor.com"
              />
            </div>
            <div>
              <Label htmlFor="direccion">Dirección</Label>
              <Input
                id="direccion"
                value={form.direccion}
                onChange={(e) => update("direccion", e.target.value)}
                placeholder="Dirección del proveedor"
              />
            </div>
          </div>
        </motion.div>

        {/* Notas */}
        <motion.div
          variants={fadeInUp}
          className="rounded-xl border bg-card p-6 space-y-4"
        >
          <h2 className="font-semibold">Notas</h2>
          <Textarea
            value={form.notas}
            onChange={(e) => update("notas", e.target.value)}
            placeholder="Notas internas sobre el proveedor..."
            rows={3}
          />
        </motion.div>

        {/* Acciones */}
        <motion.div variants={fadeInUp} className="flex justify-end gap-3">
          <Link href="/admin/proveedores">
            <Button type="button" variant="outline">
              Cancelar
            </Button>
          </Link>
          <Button type="submit" disabled={saving}>
            <Save className="size-4" />
            {saving ? "Guardando..." : "Guardar proveedor"}
          </Button>
        </motion.div>
      </motion.form>
    </div>
  );
}
