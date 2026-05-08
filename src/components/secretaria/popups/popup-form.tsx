"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { Plus, Trash2, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { fadeInUp, staggerContainerFast, springSmooth } from "@/lib/motion";
import type { PopupRow, PopupButton } from "@/lib/popups/types";
import { PopupImageUpload } from "./popup-image-upload";
import { PopupPreview } from "@/components/popups/popup-preview";

const PAGE_PRESETS: { value: string; label: string }[] = [
  { value: "*", label: "Todas las páginas" },
  { value: "/", label: "Inicio" },
  { value: "/club/*", label: "Club (todas)" },
  { value: "/deportes/*", label: "Deportes (todos)" },
  { value: "/socios", label: "Socios" },
  { value: "/beneficios", label: "Beneficios" },
  { value: "/tienda", label: "Tienda (listado)" },
  { value: "/tienda/*", label: "Tienda (detalle)" },
  { value: "/eventos", label: "Eventos (listado)" },
  { value: "/eventos/*", label: "Eventos (detalle)" },
];

const PAGE_RE = /^(\/[A-Za-z0-9\-_/]*\/?\*|\/[A-Za-z0-9\-_/]*|\*)$/;

function todayPlus(days: number) {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function toDateInput(iso: string | null | undefined) {
  if (!iso) return "";
  try {
    return new Date(iso).toISOString().slice(0, 10);
  } catch {
    return "";
  }
}

function fromDateInput(value: string, endOfDay = false) {
  // value is "YYYY-MM-DD"; convert to UY-local timestamptz
  const time = endOfDay ? "23:59:59" : "00:00:00";
  // Uruguay is UTC-3 year-round
  return new Date(`${value}T${time}-03:00`).toISOString();
}

type Props = {
  mode: "create" | "edit";
  initial?: PopupRow;
};

export function PopupForm({ mode, initial }: Props) {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);

  const [title, setTitle] = useState(initial?.title ?? "");
  const [body, setBody] = useState(initial?.body ?? "");
  const [imageUrl, setImageUrl] = useState<string | null>(
    initial?.image_url ?? null
  );
  const [buttons, setButtons] = useState<PopupButton[]>(initial?.buttons ?? []);
  const [pages, setPages] = useState<string[]>(initial?.pages ?? ["*"]);
  const [customPage, setCustomPage] = useState("");
  const [startsAt, setStartsAt] = useState(
    initial ? toDateInput(initial.starts_at) : todayPlus(0)
  );
  const [endsAt, setEndsAt] = useState(
    initial ? toDateInput(initial.ends_at) : todayPlus(14)
  );
  const [priority, setPriority] = useState<number>(initial?.priority ?? 0);
  const [status, setStatus] = useState<"draft" | "published">(
    initial?.status ?? "draft"
  );

  const allPages = useMemo(() => pages.includes("*"), [pages]);

  function togglePage(value: string) {
    setPages((prev) => {
      if (value === "*") {
        return prev.includes("*") ? [] : ["*"];
      }
      const without = prev.filter((p) => p !== "*" && p !== value);
      if (prev.includes(value)) return without;
      return [...without, value];
    });
  }

  function addCustomPage() {
    const v = customPage.trim();
    if (!v) return;
    if (!PAGE_RE.test(v)) {
      toast.error("Formato inválido. Usá /ruta o /ruta/*");
      return;
    }
    if (pages.includes(v)) {
      setCustomPage("");
      return;
    }
    setPages((prev) => [...prev.filter((p) => p !== "*"), v]);
    setCustomPage("");
  }

  function addButton() {
    if (buttons.length >= 3) return;
    setButtons((prev) => [...prev, { label: "", url: "" }]);
  }

  function updateButton(idx: number, patch: Partial<PopupButton>) {
    setButtons((prev) =>
      prev.map((b, i) => (i === idx ? { ...b, ...patch } : b))
    );
  }

  function removeButton(idx: number) {
    setButtons((prev) => prev.filter((_, i) => i !== idx));
  }

  function validate(): string[] {
    const e: string[] = [];
    if (pages.length === 0) e.push("Elegí al menos una página.");
    if (!startsAt || !endsAt) e.push("La vigencia es obligatoria.");
    if (startsAt && endsAt && new Date(endsAt) < new Date(startsAt)) {
      e.push("La fecha de fin debe ser igual o posterior al inicio.");
    }
    buttons.forEach((b, i) => {
      const hasLabel = b.label.trim().length > 0;
      const hasUrl = b.url.trim().length > 0;
      if (hasLabel !== hasUrl) {
        e.push(`Botón ${i + 1}: completá texto y URL, o eliminalo.`);
      }
      if (hasUrl && !/^(\/|https?:\/\/|mailto:)/.test(b.url.trim())) {
        e.push(`Botón ${i + 1}: URL inválida.`);
      }
    });
    return e;
  }

  async function handleSubmit() {
    const e = validate();
    setErrors(e);
    if (e.length > 0) {
      toast.error(e[0]);
      return;
    }
    setSubmitting(true);
    try {
      const payload = {
        title: title.trim() || null,
        body: body.trim() || null,
        image_url: imageUrl,
        buttons: buttons
          .filter((b) => b.label.trim() && b.url.trim())
          .map((b) => ({ label: b.label.trim(), url: b.url.trim() })),
        pages,
        starts_at: fromDateInput(startsAt),
        ends_at: fromDateInput(endsAt, true),
        priority,
        status,
      };

      const url =
        mode === "create"
          ? "/api/admin/popups"
          : `/api/admin/popups/${initial!.id}`;
      const method = mode === "create" ? "POST" : "PUT";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || "Error al guardar");

      toast.success(mode === "create" ? "Popup creado" : "Popup actualizado");
      router.push("/secretaria/popups");
      router.refresh();
    } catch (e: any) {
      toast.error(e.message || "Error al guardar");
    } finally {
      setSubmitting(false);
    }
  }

  const previewButtons = buttons.filter(
    (b) => b.label.trim() && b.url.trim()
  );

  return (
    <motion.div
      variants={staggerContainerFast}
      initial="hidden"
      animate="visible"
      className="grid grid-cols-1 gap-8 lg:grid-cols-[1.4fr_1fr]"
    >
      <div className="space-y-6">
        {/* CONTENIDO */}
        <motion.section variants={fadeInUp} transition={springSmooth} className="rounded-2xl border border-neutral-200 bg-white p-6">
          <h2 className="mb-4 font-display text-xl font-bold text-bordo-800">
            Contenido
          </h2>
          <div className="space-y-4">
            <div>
              <Label htmlFor="title">Título</Label>
              <Input
                id="title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Ej: Reservá tu lugar para el evento"
                maxLength={120}
              />
            </div>
            <div>
              <Label htmlFor="body">Mensaje</Label>
              <Textarea
                id="body"
                value={body}
                onChange={(e) => setBody(e.target.value)}
                placeholder="Texto del popup. Podés usar saltos de línea."
                rows={5}
                maxLength={2000}
              />
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Botones</Label>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={addButton}
                  disabled={buttons.length >= 3}
                >
                  <Plus className="mr-1 h-4 w-4" /> Agregar botón
                </Button>
              </div>
              {buttons.length === 0 ? (
                <p className="text-xs text-neutral-500">
                  Sin botones. El popup se cerrará solo con la X.
                </p>
              ) : (
                <div className="space-y-2">
                  {buttons.map((b, i) => (
                    <div
                      key={i}
                      className="flex flex-col gap-2 rounded-lg border border-neutral-200 bg-neutral-50 p-3 sm:flex-row sm:items-center"
                    >
                      <Input
                        value={b.label}
                        onChange={(e) =>
                          updateButton(i, { label: e.target.value })
                        }
                        placeholder="Texto del botón"
                        className="sm:flex-[1.2]"
                      />
                      <Input
                        value={b.url}
                        onChange={(e) =>
                          updateButton(i, { url: e.target.value })
                        }
                        placeholder="/ruta-interna o https://… o mailto:…"
                        className="sm:flex-[2]"
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => removeButton(i)}
                        className="text-red-600 hover:bg-red-50 hover:text-red-700"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                  <p className="text-[11px] text-neutral-500">
                    El primer botón se muestra como acción principal (en bordó).
                  </p>
                </div>
              )}
            </div>
          </div>
        </motion.section>

        {/* IMAGEN */}
        <motion.section variants={fadeInUp} transition={springSmooth} className="rounded-2xl border border-neutral-200 bg-white p-6">
          <h2 className="mb-4 font-display text-xl font-bold text-bordo-800">
            Imagen
          </h2>
          <PopupImageUpload value={imageUrl} onChange={setImageUrl} />
        </motion.section>

        {/* DÓNDE MOSTRARLO */}
        <motion.section variants={fadeInUp} transition={springSmooth} className="rounded-2xl border border-neutral-200 bg-white p-6">
          <h2 className="mb-4 font-display text-xl font-bold text-bordo-800">
            Dónde mostrarlo
          </h2>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {PAGE_PRESETS.map((p) => {
              const checked = pages.includes(p.value);
              const disabled = allPages && p.value !== "*";
              return (
                <label
                  key={p.value}
                  className={`flex items-center gap-3 rounded-lg border px-3 py-2 text-sm transition-colors ${
                    checked
                      ? "border-bordo-800 bg-bordo-50 text-bordo-800"
                      : "border-neutral-200 hover:bg-neutral-50"
                  } ${disabled ? "opacity-50" : "cursor-pointer"}`}
                >
                  <Checkbox
                    checked={checked}
                    disabled={disabled}
                    onCheckedChange={() => togglePage(p.value)}
                  />
                  <span className="flex-1">{p.label}</span>
                  <code className="text-[11px] text-neutral-500">{p.value}</code>
                </label>
              );
            })}
          </div>

          <div className="mt-4">
            <Label>Páginas personalizadas</Label>
            <div className="mt-1 flex gap-2">
              <Input
                value={customPage}
                onChange={(e) => setCustomPage(e.target.value)}
                placeholder="/mi-ruta o /seccion/*"
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addCustomPage();
                  }
                }}
                disabled={allPages}
              />
              <Button
                type="button"
                variant="outline"
                onClick={addCustomPage}
                disabled={allPages || !customPage.trim()}
              >
                Agregar
              </Button>
            </div>
            {pages.filter((p) => !PAGE_PRESETS.some((x) => x.value === p))
              .length > 0 && (
              <div className="mt-3 flex flex-wrap gap-2">
                {pages
                  .filter((p) => !PAGE_PRESETS.some((x) => x.value === p))
                  .map((p) => (
                    <Badge key={p} variant="outline" className="gap-1">
                      <code className="text-[11px]">{p}</code>
                      <button
                        type="button"
                        onClick={() => togglePage(p)}
                        className="ml-1 text-neutral-500 hover:text-red-600"
                        aria-label={`Quitar ${p}`}
                      >
                        ×
                      </button>
                    </Badge>
                  ))}
              </div>
            )}
          </div>
        </motion.section>

        {/* VIGENCIA */}
        <motion.section variants={fadeInUp} transition={springSmooth} className="rounded-2xl border border-neutral-200 bg-white p-6">
          <h2 className="mb-4 font-display text-xl font-bold text-bordo-800">
            Vigencia
          </h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="starts_at">Desde</Label>
              <Input
                id="starts_at"
                type="date"
                value={startsAt}
                onChange={(e) => setStartsAt(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="ends_at">Hasta</Label>
              <Input
                id="ends_at"
                type="date"
                value={endsAt}
                onChange={(e) => setEndsAt(e.target.value)}
              />
            </div>
          </div>
          <p className="mt-2 text-[11px] text-neutral-500">
            Horario de Uruguay (UTC-3). Inicia 00:00 del día desde, finaliza
            23:59 del día hasta.
          </p>
        </motion.section>

        {/* VISIBILIDAD */}
        <motion.section variants={fadeInUp} transition={springSmooth} className="rounded-2xl border border-neutral-200 bg-white p-6">
          <h2 className="mb-4 font-display text-xl font-bold text-bordo-800">
            Visibilidad
          </h2>
          <div className="space-y-4">
            <div className="flex items-center justify-between gap-4 rounded-lg border border-neutral-200 bg-neutral-50 p-3">
              <div>
                <p className="text-sm font-medium">
                  {status === "published" ? "Publicado" : "Borrador"}
                </p>
                <p className="text-xs text-neutral-500">
                  {status === "published"
                    ? "Visible en el sitio si está dentro de la vigencia."
                    : "Oculto al público. Útil para preparar antes de lanzar."}
                </p>
              </div>
              <Switch
                checked={status === "published"}
                onCheckedChange={(v) => setStatus(v ? "published" : "draft")}
              />
            </div>
            <div>
              <Label htmlFor="priority">Prioridad</Label>
              <Input
                id="priority"
                type="number"
                value={priority}
                onChange={(e) => setPriority(parseInt(e.target.value) || 0)}
              />
              <p className="mt-1 text-[11px] text-neutral-500">
                Si hay varios popups activos para la misma página, se muestra el
                de mayor prioridad. Empate: el más reciente.
              </p>
            </div>
          </div>
        </motion.section>

        {errors.length > 0 && (
          <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            <ul className="list-disc pl-4">
              {errors.map((e, i) => (
                <li key={i}>{e}</li>
              ))}
            </ul>
          </div>
        )}

        <div className="flex justify-end gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => router.push("/secretaria/popups")}
            disabled={submitting}
          >
            Cancelar
          </Button>
          <Button
            type="button"
            onClick={handleSubmit}
            disabled={submitting}
            className="bg-bordo-800 text-white hover:bg-bordo-700"
          >
            {submitting && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
            {mode === "create" ? "Crear popup" : "Guardar cambios"}
          </Button>
        </div>
      </div>

      <motion.div
        variants={fadeInUp}
        transition={springSmooth}
        className="lg:sticky lg:top-6 lg:self-start"
      >
        <PopupPreview
          title={title.trim() || null}
          body={body.trim() || null}
          imageUrl={imageUrl}
          buttons={previewButtons}
        />
      </motion.div>
    </motion.div>
  );
}
