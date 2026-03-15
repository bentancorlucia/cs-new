"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import {
  User,
  Mail,
  Phone,
  Calendar,
  CreditCard,
  LogOut,
  Loader2,
  Shield,
  Ticket,
  ShoppingBag,
  Pencil,
  Check,
  X,
  Camera,
  QrCode,
} from "lucide-react";
import { toast } from "sonner";

import { createBrowserClient } from "@/lib/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  staggerContainer,
  fadeInUp,
  springSmooth,
  easeSmooth,
  scaleIn,
} from "@/lib/motion";

// ── Types ──────────────────────────────────────────────

interface Perfil {
  id: string;
  nombre: string;
  apellido: string;
  cedula: string | null;
  telefono: string | null;
  fecha_nacimiento: string | null;
  avatar_url: string | null;
  es_socio: boolean;
  numero_socio: string | null;
  estado_socio: "activo" | "inactivo" | "moroso" | "suspendido";
  fecha_alta_socio: string | null;
  email: string;
  disciplinas: { nombre: string; categoria: string | null }[];
  roles: string[];
}

// ── Constants ──────────────────────────────────────────

const estadoColors: Record<string, string> = {
  activo: "bg-emerald-100 text-emerald-800 border-emerald-200",
  inactivo: "bg-gray-100 text-gray-800 border-gray-200",
  moroso: "bg-amber-100 text-amber-800 border-amber-200",
  suspendido: "bg-red-100 text-red-800 border-red-200",
};

const estadoDot: Record<string, string> = {
  activo: "bg-emerald-500",
  inactivo: "bg-gray-400",
  moroso: "bg-amber-500",
  suspendido: "bg-red-500",
};

// ── Main Component ─────────────────────────────────────

export default function MiCuentaPage() {
  const router = useRouter();
  const [perfil, setPerfil] = useState<Perfil | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [showCarnet, setShowCarnet] = useState(false);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);

  // Edit form state
  const [editForm, setEditForm] = useState({
    nombre: "",
    apellido: "",
    telefono: "",
  });

  const fileInputRef = useRef<HTMLInputElement>(null);

  const fetchPerfil = useCallback(async () => {
    try {
      const res = await fetch("/api/perfil");
      if (res.status === 401) {
        router.push("/login");
        return;
      }
      const data = await res.json();
      setPerfil(data);
      setEditForm({
        nombre: data.nombre || "",
        apellido: data.apellido || "",
        telefono: data.telefono || "",
      });
    } catch {
      toast.error("Error al cargar perfil");
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    fetchPerfil();
  }, [fetchPerfil]);

  const handleSave = async () => {
    if (!editForm.nombre.trim() || !editForm.apellido.trim()) {
      toast.error("Nombre y apellido son requeridos");
      return;
    }

    setSaving(true);
    try {
      const res = await fetch("/api/perfil", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nombre: editForm.nombre.trim(),
          apellido: editForm.apellido.trim(),
          telefono: editForm.telefono.trim() || null,
        }),
      });

      if (!res.ok) throw new Error();

      toast.success("Perfil actualizado");
      setEditing(false);
      await fetchPerfil();
    } catch {
      toast.error("Error al guardar");
    } finally {
      setSaving(false);
    }
  };

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !perfil) return;

    if (!file.type.startsWith("image/")) {
      toast.error("Solo se permiten imágenes");
      return;
    }

    if (file.size > 2 * 1024 * 1024) {
      toast.error("La imagen no puede superar 2MB");
      return;
    }

    setUploadingAvatar(true);
    try {
      const supabase = createBrowserClient();
      const ext = file.name.split(".").pop();
      const path = `${perfil.id}/avatar.${ext}`;

      const { error: uploadError } = await supabase.storage
        .from("avatars")
        .upload(path, file, { upsert: true });

      if (uploadError) throw uploadError;

      const {
        data: { publicUrl },
      } = supabase.storage.from("avatars").getPublicUrl(path);

      // Update profile with new avatar URL
      const res = await fetch("/api/perfil", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ avatar_url: publicUrl }),
      });

      if (!res.ok) throw new Error();

      toast.success("Avatar actualizado");
      await fetchPerfil();
    } catch {
      toast.error("Error al subir avatar");
    } finally {
      setUploadingAvatar(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleShowCarnet = async () => {
    setShowCarnet(true);
    if (!perfil || qrDataUrl) return;

    try {
      const QRCode = (await import("qrcode")).default;
      const dataUrl = await QRCode.toDataURL(perfil.id, {
        width: 400,
        margin: 2,
        color: { dark: "#730d32", light: "#ffffff" },
        errorCorrectionLevel: "H",
      });
      setQrDataUrl(dataUrl);
    } catch {
      // QR generation failed silently
    }
  };

  const handleLogout = async () => {
    const supabase = createBrowserClient();
    await supabase.auth.signOut();
    toast.success("Sesión cerrada");
    router.push("/");
    router.refresh();
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="size-8 animate-spin text-bordo-700" />
      </div>
    );
  }

  if (!perfil) return null;

  const initials = `${perfil.nombre.charAt(0)}${perfil.apellido.charAt(0)}`.toUpperCase();

  return (
    <motion.div
      variants={staggerContainer}
      initial="hidden"
      animate="visible"
      className="space-y-6"
    >
      {/* Header */}
      <motion.div variants={fadeInUp} transition={easeSmooth}>
        <h1 className="font-display text-2xl sm:text-3xl uppercase tracking-tightest text-foreground">
          Mi cuenta
        </h1>
        <p className="mt-1 font-body text-sm text-muted-foreground">
          Gestiona tu perfil y revisa tu actividad
        </p>
      </motion.div>

      {/* Tabs */}
      <motion.div variants={fadeInUp} transition={springSmooth}>
        <Tabs defaultValue="perfil" className="space-y-6">
          <TabsList className="grid w-full grid-cols-3 max-w-md">
            <TabsTrigger value="perfil" className="gap-1.5 text-xs sm:text-sm">
              <User className="size-3.5" />
              Perfil
            </TabsTrigger>
            <TabsTrigger value="pedidos" className="gap-1.5 text-xs sm:text-sm">
              <ShoppingBag className="size-3.5" />
              Pedidos
            </TabsTrigger>
            <TabsTrigger value="entradas" className="gap-1.5 text-xs sm:text-sm">
              <Ticket className="size-3.5" />
              Entradas
            </TabsTrigger>
          </TabsList>

          {/* ── Tab: Perfil ── */}
          <TabsContent value="perfil">
            <AnimatePresence mode="wait">
              <motion.div
                key="perfil"
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.3 }}
                className="grid lg:grid-cols-3 gap-6"
              >
                {/* Profile Card */}
                <div className="lg:col-span-2 space-y-6">
                  <Card className="border-linea shadow-card overflow-hidden">
                    {/* Avatar + Name Header */}
                    <CardHeader className="pb-4">
                      <div className="flex items-start gap-4">
                        {/* Avatar with upload */}
                        <div className="relative group">
                          <Avatar className="size-16 sm:size-20 ring-2 ring-dorado-400/30">
                            {perfil.avatar_url ? (
                              <AvatarImage
                                src={perfil.avatar_url}
                                alt={`${perfil.nombre} ${perfil.apellido}`}
                              />
                            ) : null}
                            <AvatarFallback className="bg-dorado-400 text-bordo-950 text-xl sm:text-2xl font-display font-bold">
                              {initials}
                            </AvatarFallback>
                          </Avatar>
                          <button
                            onClick={() => fileInputRef.current?.click()}
                            disabled={uploadingAvatar}
                            className="absolute inset-0 flex items-center justify-center rounded-full bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
                          >
                            {uploadingAvatar ? (
                              <Loader2 className="size-5 text-white animate-spin" />
                            ) : (
                              <Camera className="size-5 text-white" />
                            )}
                          </button>
                          <input
                            ref={fileInputRef}
                            type="file"
                            accept="image/*"
                            onChange={handleAvatarUpload}
                            className="hidden"
                          />
                        </div>

                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <CardTitle className="font-heading text-lg sm:text-xl text-bordo-800">
                              {perfil.nombre} {perfil.apellido}
                            </CardTitle>
                            {!editing && (
                              <motion.button
                                whileHover={{ scale: 1.1 }}
                                whileTap={{ scale: 0.9 }}
                                onClick={() => setEditing(true)}
                                className="p-1.5 rounded-md hover:bg-superficie transition-colors text-muted-foreground hover:text-foreground"
                              >
                                <Pencil className="size-3.5" />
                              </motion.button>
                            )}
                          </div>
                          <p className="text-sm text-muted-foreground truncate">
                            {perfil.email}
                          </p>
                          {perfil.es_socio && perfil.numero_socio && (
                            <Badge
                              variant="outline"
                              className="mt-1.5 font-mono text-xs border-bordo-200 text-bordo-700"
                            >
                              {perfil.numero_socio}
                            </Badge>
                          )}
                        </div>
                      </div>
                    </CardHeader>

                    <CardContent className="space-y-4">
                      <Separator />

                      <AnimatePresence mode="wait">
                        {editing ? (
                          <motion.div
                            key="edit"
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: "auto" }}
                            exit={{ opacity: 0, height: 0 }}
                            className="space-y-4"
                          >
                            <div className="grid sm:grid-cols-2 gap-4">
                              <div className="space-y-2">
                                <Label htmlFor="nombre">Nombre</Label>
                                <Input
                                  id="nombre"
                                  value={editForm.nombre}
                                  onChange={(e) =>
                                    setEditForm((p) => ({
                                      ...p,
                                      nombre: e.target.value,
                                    }))
                                  }
                                  placeholder="Tu nombre"
                                />
                              </div>
                              <div className="space-y-2">
                                <Label htmlFor="apellido">Apellido</Label>
                                <Input
                                  id="apellido"
                                  value={editForm.apellido}
                                  onChange={(e) =>
                                    setEditForm((p) => ({
                                      ...p,
                                      apellido: e.target.value,
                                    }))
                                  }
                                  placeholder="Tu apellido"
                                />
                              </div>
                              <div className="space-y-2 sm:col-span-2">
                                <Label htmlFor="telefono">Teléfono</Label>
                                <Input
                                  id="telefono"
                                  value={editForm.telefono}
                                  onChange={(e) =>
                                    setEditForm((p) => ({
                                      ...p,
                                      telefono: e.target.value,
                                    }))
                                  }
                                  placeholder="099 123 456"
                                />
                              </div>
                            </div>

                            <div className="flex gap-2 justify-end">
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => {
                                  setEditing(false);
                                  setEditForm({
                                    nombre: perfil.nombre,
                                    apellido: perfil.apellido,
                                    telefono: perfil.telefono || "",
                                  });
                                }}
                                disabled={saving}
                              >
                                <X className="size-4" />
                                Cancelar
                              </Button>
                              <Button
                                size="sm"
                                onClick={handleSave}
                                disabled={saving}
                                className="bg-bordo-700 hover:bg-bordo-800"
                              >
                                {saving ? (
                                  <Loader2 className="size-4 animate-spin" />
                                ) : (
                                  <Check className="size-4" />
                                )}
                                Guardar
                              </Button>
                            </div>
                          </motion.div>
                        ) : (
                          <motion.div
                            key="view"
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            className="grid sm:grid-cols-2 gap-3"
                          >
                            <InfoRow icon={Mail} label="Email" value={perfil.email} />
                            {perfil.telefono && (
                              <InfoRow
                                icon={Phone}
                                label="Teléfono"
                                value={perfil.telefono}
                              />
                            )}
                            {perfil.cedula && (
                              <InfoRow
                                icon={CreditCard}
                                label="Cédula"
                                value={perfil.cedula}
                              />
                            )}
                            {perfil.fecha_nacimiento && (
                              <InfoRow
                                icon={Calendar}
                                label="Nacimiento"
                                value={new Date(
                                  perfil.fecha_nacimiento
                                ).toLocaleDateString("es-UY")}
                              />
                            )}
                          </motion.div>
                        )}
                      </AnimatePresence>

                      {/* Socio info */}
                      {perfil.es_socio && (
                        <>
                          <Separator />
                          <div className="space-y-3">
                            <div className="flex items-center justify-between">
                              <span className="font-body text-sm font-medium text-foreground">
                                Estado de socio
                              </span>
                              <Badge
                                className={`gap-1.5 ${estadoColors[perfil.estado_socio] ?? ""}`}
                                variant="secondary"
                              >
                                <span
                                  className={`size-2 rounded-full ${estadoDot[perfil.estado_socio] ?? ""}`}
                                />
                                {perfil.estado_socio.charAt(0).toUpperCase() +
                                  perfil.estado_socio.slice(1)}
                              </Badge>
                            </div>
                            {perfil.fecha_alta_socio && (
                              <InfoRow
                                icon={Calendar}
                                label="Socio desde"
                                value={new Date(
                                  perfil.fecha_alta_socio
                                ).toLocaleDateString("es-UY")}
                              />
                            )}
                            {perfil.disciplinas.length > 0 && (
                              <div className="space-y-2">
                                <span className="text-sm text-muted-foreground font-body">
                                  Disciplinas
                                </span>
                                <div className="flex flex-wrap gap-2">
                                  {perfil.disciplinas.map((d, i) => (
                                    <Badge
                                      key={i}
                                      variant="outline"
                                      className="font-body text-xs"
                                    >
                                      {d.nombre}
                                      {d.categoria ? ` — ${d.categoria}` : ""}
                                    </Badge>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>
                        </>
                      )}

                      {/* Roles */}
                      {perfil.roles.length > 0 && (
                        <>
                          <Separator />
                          <div className="space-y-2">
                            <div className="flex items-center gap-2 text-sm text-muted-foreground">
                              <Shield className="size-4" />
                              <span className="font-body">Roles</span>
                            </div>
                            <div className="flex flex-wrap gap-2">
                              {perfil.roles.map((role) => (
                                <Badge
                                  key={role}
                                  variant="outline"
                                  className="font-body text-xs"
                                >
                                  {role}
                                </Badge>
                              ))}
                            </div>
                          </div>
                        </>
                      )}
                    </CardContent>
                  </Card>
                </div>

                {/* Sidebar */}
                <div className="space-y-4">
                  {/* Carnet Digital */}
                  {perfil.es_socio && (
                    <motion.div variants={scaleIn} transition={springSmooth}>
                      <Card className="border-bordo-200 bg-gradient-to-br from-bordo-800 to-bordo-950 text-white overflow-hidden">
                        <CardContent className="p-5 space-y-3">
                          <div className="flex items-center justify-between">
                            <span className="font-display text-xs uppercase tracking-widest text-dorado-400">
                              Club Seminario
                            </span>
                            <Badge className="bg-dorado-400/20 text-dorado-300 border-dorado-400/30 text-[10px]">
                              {perfil.estado_socio.toUpperCase()}
                            </Badge>
                          </div>

                          <div>
                            <p className="font-heading font-bold text-base">
                              {perfil.nombre} {perfil.apellido}
                            </p>
                            <p className="text-xs text-bordo-200 font-mono">
                              {perfil.numero_socio}
                            </p>
                          </div>

                          {perfil.cedula && (
                            <p className="text-xs text-bordo-300">
                              CI: {perfil.cedula}
                            </p>
                          )}

                          {perfil.disciplinas.length > 0 && (
                            <p className="text-xs text-bordo-200">
                              {perfil.disciplinas.map((d) => d.nombre).join(" · ")}
                            </p>
                          )}

                          <Button
                            variant="outline"
                            size="sm"
                            onClick={handleShowCarnet}
                            className="w-full bg-white/10 border-white/20 text-white hover:bg-white/20 hover:text-white gap-1.5 text-xs"
                          >
                            <QrCode className="size-3.5" />
                            Ver carnet QR
                          </Button>
                        </CardContent>
                      </Card>
                    </motion.div>
                  )}

                  {/* Logout */}
                  <Button
                    variant="outline"
                    onClick={handleLogout}
                    className="w-full border-red-200 text-red-600 hover:bg-red-50 hover:text-red-700"
                  >
                    <LogOut className="size-4" />
                    Cerrar sesión
                  </Button>
                </div>
              </motion.div>
            </AnimatePresence>
          </TabsContent>

          {/* ── Tab: Pedidos ── */}
          <TabsContent value="pedidos">
            <AnimatePresence mode="wait">
              <motion.div
                key="pedidos"
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.3 }}
              >
                <PedidosTab />
              </motion.div>
            </AnimatePresence>
          </TabsContent>

          {/* ── Tab: Entradas ── */}
          <TabsContent value="entradas">
            <AnimatePresence mode="wait">
              <motion.div
                key="entradas"
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.3 }}
              >
                <EntradasTab />
              </motion.div>
            </AnimatePresence>
          </TabsContent>
        </Tabs>
      </motion.div>

      {/* ── Carnet QR Dialog ── */}
      <Dialog open={showCarnet} onOpenChange={setShowCarnet}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="font-heading text-lg text-center">
              Carnet Digital
            </DialogTitle>
          </DialogHeader>
          <div className="flex flex-col items-center gap-4 py-4">
            <div className="w-full rounded-xl bg-gradient-to-br from-bordo-800 to-bordo-950 p-6 text-white text-center space-y-3">
              <p className="font-display text-xs uppercase tracking-widest text-dorado-400">
                Club Seminario
              </p>
              <div>
                <p className="font-heading font-bold text-lg">
                  {perfil.nombre} {perfil.apellido}
                </p>
                <p className="text-xs text-bordo-200 font-mono">
                  {perfil.numero_socio}
                </p>
              </div>
              {perfil.cedula && (
                <p className="text-xs text-bordo-300">CI: {perfil.cedula}</p>
              )}
              {perfil.disciplinas.length > 0 && (
                <p className="text-xs text-bordo-200">
                  {perfil.disciplinas.map((d) => d.nombre).join(" · ")}
                </p>
              )}
              {qrDataUrl ? (
                <motion.div
                  initial={{ scale: 0.8, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  className="flex justify-center pt-2"
                >
                  <div className="bg-white p-2 rounded-lg">
                    <Image
                      src={qrDataUrl}
                      alt="QR Carnet"
                      width={200}
                      height={200}
                    />
                  </div>
                </motion.div>
              ) : (
                <div className="flex justify-center pt-2">
                  <Loader2 className="size-8 animate-spin text-dorado-400" />
                </div>
              )}
              <div className="flex items-center justify-center gap-1.5 pt-1">
                <span
                  className={`size-2 rounded-full ${estadoDot[perfil.estado_socio] ?? "bg-gray-400"}`}
                />
                <span className="text-xs uppercase tracking-wide">
                  {perfil.estado_socio}
                </span>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </motion.div>
  );
}

// ── Pedidos Tab ────────────────────────────────────────

interface Pedido {
  id: number;
  numero_pedido: string;
  tipo: "online" | "pos";
  estado: string;
  subtotal: number;
  descuento: number;
  total: number;
  moneda: string;
  metodo_pago: string | null;
  notas: string | null;
  created_at: string;
  pedido_items: {
    id: number;
    cantidad: number;
    precio_unitario: number;
    subtotal: number;
    productos: { nombre: string; slug: string } | null;
  }[];
}

const PEDIDO_ESTADO_CONFIG: Record<
  string,
  { label: string; color: string }
> = {
  pendiente: { label: "Pendiente", color: "bg-yellow-100 text-yellow-700" },
  pagado: { label: "Pagado", color: "bg-blue-100 text-blue-700" },
  preparando: { label: "Preparando", color: "bg-indigo-100 text-indigo-700" },
  listo_retiro: { label: "Listo para retiro", color: "bg-emerald-100 text-emerald-700" },
  retirado: { label: "Retirado", color: "bg-green-100 text-green-700" },
  cancelado: { label: "Cancelado", color: "bg-red-100 text-red-600" },
};

function PedidosTab() {
  const [pedidos, setPedidos] = useState<Pedido[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<number | null>(null);

  useEffect(() => {
    async function fetchPedidos() {
      try {
        const res = await fetch("/api/perfil/pedidos");
        if (res.ok) {
          const data = await res.json();
          setPedidos(data);
        }
      } catch {
        // silently fail
      } finally {
        setLoading(false);
      }
    }
    fetchPedidos();
  }, []);

  if (loading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div
            key={i}
            className="h-20 rounded-xl bg-superficie animate-pulse"
          />
        ))}
      </div>
    );
  }

  if (pedidos.length === 0) {
    return (
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="flex flex-col items-center gap-3 py-16 text-muted-foreground"
      >
        <ShoppingBag className="size-16 opacity-20" />
        <p className="text-lg font-medium">No tenés pedidos</p>
        <Link
          href="/tienda"
          className="text-sm text-bordo-800 underline underline-offset-2 hover:text-bordo-700"
        >
          Ir a la tienda
        </Link>
      </motion.div>
    );
  }

  return (
    <motion.div
      variants={staggerContainer}
      initial="hidden"
      animate="visible"
      className="space-y-3"
    >
      {pedidos.map((pedido) => {
        const config =
          PEDIDO_ESTADO_CONFIG[pedido.estado] ?? PEDIDO_ESTADO_CONFIG.pendiente;
        const isExpanded = expandedId === pedido.id;

        return (
          <motion.div key={pedido.id} variants={fadeInUp}>
            <Card
              className={`border-linea transition-shadow cursor-pointer ${isExpanded ? "shadow-card" : "hover:shadow-card"}`}
              onClick={() =>
                setExpandedId(isExpanded ? null : pedido.id)
              }
            >
              <CardContent className="p-4">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-sm font-bold text-foreground">
                        #{pedido.numero_pedido}
                      </span>
                      <Badge className={`text-[10px] ${config.color}`}>
                        {config.label}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {new Date(pedido.created_at).toLocaleDateString("es-UY", {
                        day: "numeric",
                        month: "short",
                        year: "numeric",
                      })}
                      {" · "}
                      {pedido.pedido_items.length}{" "}
                      {pedido.pedido_items.length === 1
                        ? "producto"
                        : "productos"}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="font-heading font-bold text-foreground">
                      ${pedido.total.toLocaleString("es-UY")}
                    </p>
                    {pedido.metodo_pago && (
                      <p className="text-[10px] text-muted-foreground capitalize">
                        {pedido.metodo_pago.replace("_", " ")}
                      </p>
                    )}
                  </div>
                </div>

                {/* Expandable detail */}
                <AnimatePresence>
                  {isExpanded && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: "auto" }}
                      exit={{ opacity: 0, height: 0 }}
                      transition={{ duration: 0.2 }}
                      className="overflow-hidden"
                    >
                      <Separator className="my-3" />
                      <div className="space-y-2">
                        {pedido.pedido_items.map((item) => (
                          <div
                            key={item.id}
                            className="flex items-center justify-between text-sm"
                          >
                            <span className="text-muted-foreground">
                              {item.productos?.nombre ?? "Producto"}{" "}
                              <span className="text-xs">x{item.cantidad}</span>
                            </span>
                            <span className="font-mono text-xs">
                              ${item.subtotal.toLocaleString("es-UY")}
                            </span>
                          </div>
                        ))}
                        {pedido.descuento > 0 && (
                          <div className="flex items-center justify-between text-sm text-emerald-600">
                            <span>Descuento socio</span>
                            <span className="font-mono text-xs">
                              -${pedido.descuento.toLocaleString("es-UY")}
                            </span>
                          </div>
                        )}
                      </div>
                      {pedido.notas && (
                        <p className="mt-2 text-xs text-muted-foreground italic">
                          Nota: {pedido.notas}
                        </p>
                      )}
                    </motion.div>
                  )}
                </AnimatePresence>
              </CardContent>
            </Card>
          </motion.div>
        );
      })}
    </motion.div>
  );
}

// ── Entradas Tab ───────────────────────────────────────

interface MiEntrada {
  id: number;
  codigo: string;
  estado: string;
  precio_pagado: number;
  nombre_asistente: string;
  created_at: string;
  usado_at: string | null;
  qr_url: string | null;
  eventos: {
    titulo: string;
    slug: string;
    imagen_url: string | null;
    fecha_inicio: string;
    lugar: string | null;
  } | null;
  tipo_entradas: { nombre: string } | null;
  lotes_entrada: { nombre: string } | null;
}

const ENTRADA_ESTADO: Record<
  string,
  { label: string; color: string; icon: typeof Check }
> = {
  pagada: { label: "Válida", color: "bg-green-100 text-green-700", icon: Check },
  usada: { label: "Usada", color: "bg-blue-100 text-blue-700", icon: Check },
  pendiente: {
    label: "Pendiente",
    color: "bg-yellow-100 text-yellow-700",
    icon: Loader2,
  },
  cancelada: { label: "Cancelada", color: "bg-red-100 text-red-600", icon: X },
  reembolsada: {
    label: "Reembolsada",
    color: "bg-red-50 text-red-500",
    icon: X,
  },
};

function EntradasTab() {
  const [entradas, setEntradas] = useState<MiEntrada[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedEntrada, setSelectedEntrada] = useState<MiEntrada | null>(
    null
  );
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);

  useEffect(() => {
    async function fetchEntradas() {
      try {
        const res = await fetch("/api/perfil/entradas");
        if (res.ok) {
          const data = await res.json();
          setEntradas(data);
        }
      } catch {
        // silently fail
      } finally {
        setLoading(false);
      }
    }
    fetchEntradas();
  }, []);

  const handleShowQR = async (entrada: MiEntrada) => {
    setSelectedEntrada(entrada);
    setQrDataUrl(null);

    if (entrada.qr_url) {
      setQrDataUrl(entrada.qr_url);
      return;
    }

    try {
      const QRCode = (await import("qrcode")).default;
      const dataUrl = await QRCode.toDataURL(entrada.codigo, {
        width: 400,
        margin: 2,
        color: { dark: "#730d32", light: "#ffffff" },
        errorCorrectionLevel: "H",
      });
      setQrDataUrl(dataUrl);
    } catch {
      // QR generation failed
    }
  };

  if (loading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div
            key={i}
            className="h-24 rounded-xl bg-superficie animate-pulse"
          />
        ))}
      </div>
    );
  }

  if (entradas.length === 0) {
    return (
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="flex flex-col items-center gap-3 py-16 text-muted-foreground"
      >
        <Ticket className="size-16 opacity-20" />
        <p className="text-lg font-medium">No tenés entradas</p>
        <Link
          href="/eventos"
          className="text-sm text-bordo-800 underline underline-offset-2 hover:text-bordo-700"
        >
          Ver eventos
        </Link>
      </motion.div>
    );
  }

  const now = new Date();
  const proximas = entradas.filter(
    (e) => e.eventos && new Date(e.eventos.fecha_inicio) >= now
  );
  const pasadas = entradas.filter(
    (e) => e.eventos && new Date(e.eventos.fecha_inicio) < now
  );

  return (
    <>
      <div className="space-y-8">
        {proximas.length > 0 && (
          <div>
            <h3 className="mb-3 font-heading font-bold text-foreground">
              Próximos eventos
            </h3>
            <motion.div
              variants={staggerContainer}
              initial="hidden"
              animate="visible"
              className="space-y-3"
            >
              {proximas.map((entrada) => (
                <EntradaCard
                  key={entrada.id}
                  entrada={entrada}
                  onShowQR={() => handleShowQR(entrada)}
                />
              ))}
            </motion.div>
          </div>
        )}

        {pasadas.length > 0 && (
          <div>
            <h3 className="mb-3 font-heading font-bold text-muted-foreground">
              Eventos pasados
            </h3>
            <motion.div
              variants={staggerContainer}
              initial="hidden"
              animate="visible"
              className="space-y-3"
            >
              {pasadas.map((entrada) => (
                <EntradaCard
                  key={entrada.id}
                  entrada={entrada}
                  onShowQR={() => handleShowQR(entrada)}
                />
              ))}
            </motion.div>
          </div>
        )}
      </div>

      {/* QR Dialog */}
      <Dialog
        open={!!selectedEntrada}
        onOpenChange={(v) => !v && setSelectedEntrada(null)}
      >
        <DialogContent className="sm:max-w-sm text-center">
          <DialogHeader>
            <DialogTitle className="font-heading text-lg">
              {selectedEntrada?.eventos?.titulo}
            </DialogTitle>
          </DialogHeader>
          <div className="py-4">
            {qrDataUrl ? (
              <motion.div
                initial={{ scale: 0.8, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                className="flex flex-col items-center gap-3"
              >
                <Image
                  src={qrDataUrl}
                  alt="QR de entrada"
                  width={256}
                  height={256}
                  className="rounded-lg"
                />
                <p className="text-xs text-muted-foreground font-mono">
                  {selectedEntrada?.codigo}
                </p>
              </motion.div>
            ) : (
              <div className="flex justify-center">
                <Loader2 className="size-8 animate-spin text-bordo-700" />
              </div>
            )}
            {selectedEntrada && (
              <div className="mt-4 text-sm text-muted-foreground space-y-1">
                <p>
                  <span className="font-medium text-foreground">
                    {selectedEntrada.nombre_asistente}
                  </span>
                </p>
                <p>{selectedEntrada.tipo_entradas?.nombre}</p>
                {selectedEntrada.lotes_entrada && (
                  <p>{selectedEntrada.lotes_entrada.nombre}</p>
                )}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

function EntradaCard({
  entrada,
  onShowQR,
}: {
  entrada: MiEntrada;
  onShowQR: () => void;
}) {
  const evento = entrada.eventos;
  if (!evento) return null;

  const fecha = new Date(evento.fecha_inicio);
  const config = ENTRADA_ESTADO[entrada.estado] ?? ENTRADA_ESTADO.pendiente;

  return (
    <motion.div
      variants={fadeInUp}
      className="rounded-xl border border-linea bg-white p-4 transition-shadow hover:shadow-card"
    >
      <div className="flex gap-4">
        <div className="relative size-20 shrink-0 overflow-hidden rounded-lg bg-superficie">
          {evento.imagen_url ? (
            <Image
              src={evento.imagen_url}
              alt={evento.titulo}
              fill
              className="object-cover"
              sizes="80px"
            />
          ) : (
            <div className="flex h-full items-center justify-center">
              <Calendar className="size-6 text-muted-foreground/30" />
            </div>
          )}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <div>
              <h4 className="font-heading font-bold text-foreground truncate">
                {evento.titulo}
              </h4>
              <div className="mt-0.5 flex flex-wrap gap-2 text-xs text-muted-foreground">
                <span className="flex items-center gap-1">
                  <Calendar className="size-3" />
                  {fecha.toLocaleDateString("es-UY", {
                    day: "numeric",
                    month: "short",
                    year: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </span>
                {evento.lugar && (
                  <span className="flex items-center gap-1">
                    <span className="size-3 text-center leading-3">📍</span>
                    {evento.lugar}
                  </span>
                )}
              </div>
            </div>
            <Badge className={`gap-1 shrink-0 text-[10px] ${config.color}`}>
              {config.label}
            </Badge>
          </div>

          <div className="mt-2 flex items-center justify-between">
            <span className="text-xs text-muted-foreground">
              {entrada.tipo_entradas?.nombre}
              {entrada.lotes_entrada
                ? ` — ${entrada.lotes_entrada.nombre}`
                : ""}
            </span>
            {entrada.estado === "pagada" && (
              <Button
                variant="outline"
                size="sm"
                className="h-7 text-xs gap-1"
                onClick={(e) => {
                  e.stopPropagation();
                  onShowQR();
                }}
              >
                <QrCode className="size-3" />
                Ver QR
              </Button>
            )}
          </div>
        </div>
      </div>
    </motion.div>
  );
}

// ── Helpers ────────────────────────────────────────────

function InfoRow({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center justify-between p-2.5 rounded-lg bg-superficie/50">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Icon className="size-4 shrink-0" />
        <span className="font-body">{label}</span>
      </div>
      <span className="font-body text-sm text-foreground font-medium truncate ml-3">
        {value}
      </span>
    </div>
  );
}
