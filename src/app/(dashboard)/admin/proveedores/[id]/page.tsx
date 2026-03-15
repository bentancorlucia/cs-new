"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowLeft,
  Save,
  Truck,
  Phone,
  Mail,
  MapPin,
  User,
  DollarSign,
  FileText,
  Plus,
  ArrowUpRight,
  Package,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { createBrowserClient } from "@/lib/supabase/client";
import { fadeInUp, staggerContainer } from "@/lib/motion";
import { toast } from "sonner";
import { format } from "date-fns";
import { es } from "date-fns/locale";

interface Proveedor {
  id: number;
  nombre: string;
  rut: string | null;
  razon_social: string | null;
  contacto_nombre: string | null;
  contacto_telefono: string | null;
  contacto_email: string | null;
  direccion: string | null;
  notas: string | null;
  saldo_cuenta_corriente: number;
  activo: boolean;
}

interface Compra {
  id: number;
  numero_compra: string;
  estado: string;
  total: number;
  fecha_compra: string;
  created_at: string;
}

interface Pago {
  id: number;
  monto: number;
  metodo_pago: string;
  referencia: string | null;
  notas: string | null;
  created_at: string;
  compras_proveedor: { numero_compra: string } | null;
}

interface ProductoProveedor {
  id: number;
  costo: number | null;
  es_principal: boolean;
  productos: { id: number; nombre: string; sku: string | null };
}

interface MovimientoCuenta {
  fecha: string;
  tipo: "compra" | "pago";
  concepto: string;
  debe: number;
  haber: number;
}

export default function ProveedorDetallePage() {
  const params = useParams();
  const router = useRouter();
  const proveedorId = params.id as string;

  const [proveedor, setProveedor] = useState<Proveedor | null>(null);
  const [compras, setCompras] = useState<Compra[]>([]);
  const [pagos, setPagos] = useState<Pago[]>([]);
  const [productos, setProductos] = useState<ProductoProveedor[]>([]);
  const [movimientos, setMovimientos] = useState<MovimientoCuenta[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState(false);
  const [pagoOpen, setPagoOpen] = useState(false);

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

  const [pagoForm, setPagoForm] = useState({
    monto: "",
    metodo_pago: "transferencia",
    referencia: "",
    notas: "",
  });

  const fetchProveedor = useCallback(async () => {
    const supabase = createBrowserClient();

    const { data } = await supabase
      .from("proveedores")
      .select("*")
      .eq("id", parseInt(proveedorId))
      .single();

    if (!data) {
      router.push("/admin/proveedores");
      return;
    }

    const prov = data as unknown as Proveedor;
    setProveedor(prov);
    setForm({
      nombre: prov.nombre || "",
      rut: prov.rut || "",
      razon_social: prov.razon_social || "",
      contacto_nombre: prov.contacto_nombre || "",
      contacto_telefono: prov.contacto_telefono || "",
      contacto_email: prov.contacto_email || "",
      direccion: prov.direccion || "",
      notas: prov.notas || "",
    });
  }, [proveedorId, router]);

  const fetchCompras = useCallback(async () => {
    const supabase = createBrowserClient();
    const { data } = await supabase
      .from("compras_proveedor")
      .select("id, numero_compra, estado, total, fecha_compra, created_at")
      .eq("proveedor_id", parseInt(proveedorId))
      .order("created_at", { ascending: false })
      .limit(10);

    setCompras((data as unknown as Compra[]) || []);
  }, [proveedorId]);

  const fetchPagos = useCallback(async () => {
    const supabase = createBrowserClient();
    const { data } = await supabase
      .from("pagos_proveedor")
      .select("*, compras_proveedor(numero_compra)")
      .eq("proveedor_id", parseInt(proveedorId))
      .order("created_at", { ascending: false })
      .limit(10);

    setPagos((data as unknown as Pago[]) || []);
  }, [proveedorId]);

  const fetchProductos = useCallback(async () => {
    const supabase = createBrowserClient();
    const { data } = await supabase
      .from("producto_proveedores")
      .select("id, costo, es_principal, productos(id, nombre, sku)")
      .eq("proveedor_id", parseInt(proveedorId));

    setProductos((data as unknown as ProductoProveedor[]) || []);
  }, [proveedorId]);

  const buildMovimientos = useCallback(() => {
    const items: MovimientoCuenta[] = [];

    compras
      .filter((c) => c.estado === "confirmada" || c.estado === "recibida")
      .forEach((c) => {
        items.push({
          fecha: c.created_at,
          tipo: "compra",
          concepto: `Compra ${c.numero_compra}`,
          debe: c.total,
          haber: 0,
        });
      });

    pagos.forEach((p) => {
      items.push({
        fecha: p.created_at,
        tipo: "pago",
        concepto: `Pago ${p.metodo_pago}${p.referencia ? ` - ${p.referencia}` : ""}`,
        debe: 0,
        haber: p.monto,
      });
    });

    items.sort(
      (a, b) => new Date(a.fecha).getTime() - new Date(b.fecha).getTime()
    );
    setMovimientos(items);
  }, [compras, pagos]);

  useEffect(() => {
    async function load() {
      setLoading(true);
      await Promise.all([
        fetchProveedor(),
        fetchCompras(),
        fetchPagos(),
        fetchProductos(),
      ]);
      setLoading(false);
    }
    load();
  }, [fetchProveedor, fetchCompras, fetchPagos, fetchProductos]);

  useEffect(() => {
    buildMovimientos();
  }, [buildMovimientos]);

  function update(field: string, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  async function handleSave() {
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/proveedores/${proveedorId}`, {
        method: "PUT",
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
        throw new Error(data.error);
      }

      toast.success("Proveedor actualizado");
      setEditing(false);
      fetchProveedor();
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setSaving(false);
    }
  }

  async function handlePago(e: React.FormEvent) {
    e.preventDefault();
    const monto = parseFloat(pagoForm.monto);
    if (!monto || monto <= 0) {
      toast.error("Ingresá un monto válido");
      return;
    }

    try {
      const res = await fetch(
        `/api/admin/proveedores/${proveedorId}/pagos`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            monto,
            metodo_pago: pagoForm.metodo_pago,
            referencia: pagoForm.referencia || null,
            notas: pagoForm.notas || null,
          }),
        }
      );

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error);
      }

      toast.success("Pago registrado");
      setPagoOpen(false);
      setPagoForm({ monto: "", metodo_pago: "transferencia", referencia: "", notas: "" });
      fetchProveedor();
      fetchPagos();
    } catch (error: any) {
      toast.error(error.message);
    }
  }

  function formatCurrency(n: number) {
    return `$${Math.abs(n).toLocaleString("es-UY")}`;
  }

  function formatDate(d: string) {
    try {
      return format(new Date(d), "dd/MM/yy", { locale: es });
    } catch {
      return d;
    }
  }

  const estadoColor: Record<string, string> = {
    borrador: "outline",
    confirmada: "secondary",
    recibida: "default",
    cancelada: "destructive",
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-40 w-full rounded-xl" />
        <Skeleton className="h-60 w-full rounded-xl" />
      </div>
    );
  }

  if (!proveedor) return null;

  return (
    <div className="mx-auto max-w-4xl">
      {/* Header */}
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

        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="flex size-12 items-center justify-center rounded-xl bg-bordo-50">
              <Truck className="size-6 text-bordo-800" />
            </div>
            <div>
              <h1 className="text-2xl font-bold">{proveedor.nombre}</h1>
              {proveedor.rut && (
                <p className="text-sm text-muted-foreground">
                  RUT: {proveedor.rut}
                </p>
              )}
            </div>
          </div>
          <Button
            variant={editing ? "default" : "outline"}
            onClick={() => (editing ? handleSave() : setEditing(true))}
            disabled={saving}
          >
            {editing ? (
              <>
                <Save className="size-4" />
                {saving ? "Guardando..." : "Guardar"}
              </>
            ) : (
              "Editar"
            )}
          </Button>
        </div>
      </motion.div>

      <motion.div
        variants={staggerContainer}
        initial="hidden"
        animate="visible"
        className="space-y-6"
      >
        {/* Saldo Cuenta Corriente */}
        <motion.div
          variants={fadeInUp}
          className="rounded-xl border bg-card p-6"
        >
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground mb-1">
                Cuenta Corriente
              </p>
              <div className="flex items-baseline gap-2">
                <motion.span
                  key={proveedor.saldo_cuenta_corriente}
                  initial={{ scale: 1.1, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  className={`text-3xl font-bold ${
                    proveedor.saldo_cuenta_corriente > 0
                      ? "text-amber-600"
                      : "text-emerald-600"
                  }`}
                >
                  {formatCurrency(proveedor.saldo_cuenta_corriente)}
                </motion.span>
                {proveedor.saldo_cuenta_corriente > 0 && (
                  <span className="text-sm text-muted-foreground">
                    (le debemos)
                  </span>
                )}
              </div>
            </div>
            <div className="flex gap-2">
              <Button onClick={() => setPagoOpen(true)}>
                <DollarSign className="size-4" />
                Registrar pago
              </Button>
              <Link href={`/admin/compras/nueva?proveedor=${proveedorId}`}>
                <Button variant="outline">
                  <Plus className="size-4" />
                  Nueva compra
                </Button>
              </Link>
            </div>
          </div>
        </motion.div>

        {/* Contacto (modo lectura o edición) */}
        <motion.div
          variants={fadeInUp}
          className="rounded-xl border bg-card p-6"
        >
          <h2 className="font-semibold mb-4">Contacto</h2>
          {editing ? (
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label>Persona de contacto</Label>
                <Input
                  value={form.contacto_nombre}
                  onChange={(e) => update("contacto_nombre", e.target.value)}
                />
              </div>
              <div>
                <Label>Teléfono</Label>
                <Input
                  value={form.contacto_telefono}
                  onChange={(e) => update("contacto_telefono", e.target.value)}
                />
              </div>
              <div>
                <Label>Email</Label>
                <Input
                  type="email"
                  value={form.contacto_email}
                  onChange={(e) => update("contacto_email", e.target.value)}
                />
              </div>
              <div>
                <Label>Dirección</Label>
                <Input
                  value={form.direccion}
                  onChange={(e) => update("direccion", e.target.value)}
                />
              </div>
              <div>
                <Label>RUT</Label>
                <Input
                  value={form.rut}
                  onChange={(e) => update("rut", e.target.value)}
                />
              </div>
              <div>
                <Label>Razón social</Label>
                <Input
                  value={form.razon_social}
                  onChange={(e) => update("razon_social", e.target.value)}
                />
              </div>
              <div className="sm:col-span-2">
                <Label>Notas</Label>
                <Textarea
                  value={form.notas}
                  onChange={(e) => update("notas", e.target.value)}
                  rows={2}
                />
              </div>
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {proveedor.contacto_nombre && (
                <div className="flex items-center gap-2 text-sm">
                  <User className="size-4 text-muted-foreground" />
                  {proveedor.contacto_nombre}
                </div>
              )}
              {proveedor.contacto_telefono && (
                <div className="flex items-center gap-2 text-sm">
                  <Phone className="size-4 text-muted-foreground" />
                  {proveedor.contacto_telefono}
                </div>
              )}
              {proveedor.contacto_email && (
                <div className="flex items-center gap-2 text-sm">
                  <Mail className="size-4 text-muted-foreground" />
                  {proveedor.contacto_email}
                </div>
              )}
              {proveedor.direccion && (
                <div className="flex items-center gap-2 text-sm">
                  <MapPin className="size-4 text-muted-foreground" />
                  {proveedor.direccion}
                </div>
              )}
              {!proveedor.contacto_nombre &&
                !proveedor.contacto_telefono &&
                !proveedor.contacto_email &&
                !proveedor.direccion && (
                  <p className="text-sm text-muted-foreground col-span-2">
                    Sin datos de contacto
                  </p>
                )}
            </div>
          )}
        </motion.div>

        {/* Tabs: Compras, Pagos, Productos, Estado de Cuenta */}
        <motion.div variants={fadeInUp}>
          <Tabs defaultValue="compras">
            <TabsList>
              <TabsTrigger value="compras">Compras</TabsTrigger>
              <TabsTrigger value="pagos">Pagos</TabsTrigger>
              <TabsTrigger value="productos">Productos</TabsTrigger>
              <TabsTrigger value="cuenta">Estado de cuenta</TabsTrigger>
            </TabsList>

            <TabsContent value="compras" className="mt-4">
              <div className="rounded-xl border bg-card">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Número</TableHead>
                      <TableHead>Fecha</TableHead>
                      <TableHead className="text-right">Total</TableHead>
                      <TableHead className="text-center">Estado</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {compras.length === 0 ? (
                      <TableRow>
                        <TableCell
                          colSpan={4}
                          className="py-8 text-center text-muted-foreground"
                        >
                          <FileText className="mx-auto mb-2 size-8 opacity-20" />
                          Sin compras registradas
                        </TableCell>
                      </TableRow>
                    ) : (
                      <AnimatePresence>
                        {compras.map((c) => (
                          <motion.tr
                            key={c.id}
                            variants={fadeInUp}
                            initial="hidden"
                            animate="visible"
                            className="border-b transition-colors hover:bg-muted/50"
                          >
                            <TableCell>
                              <Link
                                href={`/admin/compras/${c.id}`}
                                className="font-medium text-bordo hover:underline"
                              >
                                {c.numero_compra}
                              </Link>
                            </TableCell>
                            <TableCell className="text-sm">
                              {formatDate(c.fecha_compra)}
                            </TableCell>
                            <TableCell className="text-right font-medium">
                              {formatCurrency(c.total)}
                            </TableCell>
                            <TableCell className="text-center">
                              <Badge
                                variant={
                                  (estadoColor[c.estado] as any) || "outline"
                                }
                              >
                                {c.estado}
                              </Badge>
                            </TableCell>
                          </motion.tr>
                        ))}
                      </AnimatePresence>
                    )}
                  </TableBody>
                </Table>
                {compras.length > 0 && (
                  <div className="border-t px-4 py-3 flex justify-between items-center">
                    <Link
                      href={`/admin/compras?proveedor_id=${proveedorId}`}
                      className="text-sm text-bordo hover:underline"
                    >
                      Ver todas
                    </Link>
                    <Link
                      href={`/admin/compras/nueva?proveedor=${proveedorId}`}
                    >
                      <Button size="sm" variant="outline">
                        <Plus className="size-3.5" />
                        Nueva compra
                      </Button>
                    </Link>
                  </div>
                )}
              </div>
            </TabsContent>

            <TabsContent value="pagos" className="mt-4">
              <div className="rounded-xl border bg-card">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Fecha</TableHead>
                      <TableHead className="text-right">Monto</TableHead>
                      <TableHead>Método</TableHead>
                      <TableHead>Referencia</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {pagos.length === 0 ? (
                      <TableRow>
                        <TableCell
                          colSpan={4}
                          className="py-8 text-center text-muted-foreground"
                        >
                          <DollarSign className="mx-auto mb-2 size-8 opacity-20" />
                          Sin pagos registrados
                        </TableCell>
                      </TableRow>
                    ) : (
                      <AnimatePresence>
                        {pagos.map((p) => (
                          <motion.tr
                            key={p.id}
                            variants={fadeInUp}
                            initial="hidden"
                            animate="visible"
                            className="border-b transition-colors hover:bg-muted/50"
                          >
                            <TableCell className="text-sm">
                              {formatDate(p.created_at)}
                            </TableCell>
                            <TableCell className="text-right font-medium text-emerald-600">
                              {formatCurrency(p.monto)}
                            </TableCell>
                            <TableCell className="text-sm capitalize">
                              {p.metodo_pago}
                            </TableCell>
                            <TableCell className="text-sm text-muted-foreground">
                              {p.referencia || "—"}
                            </TableCell>
                          </motion.tr>
                        ))}
                      </AnimatePresence>
                    )}
                  </TableBody>
                </Table>
                <div className="border-t px-4 py-3 flex justify-end">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setPagoOpen(true)}
                  >
                    <Plus className="size-3.5" />
                    Registrar pago
                  </Button>
                </div>
              </div>
            </TabsContent>

            <TabsContent value="productos" className="mt-4">
              <div className="rounded-xl border bg-card">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Producto</TableHead>
                      <TableHead>SKU</TableHead>
                      <TableHead className="text-right">
                        Último costo
                      </TableHead>
                      <TableHead className="text-center">Principal</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {productos.length === 0 ? (
                      <TableRow>
                        <TableCell
                          colSpan={4}
                          className="py-8 text-center text-muted-foreground"
                        >
                          <Package className="mx-auto mb-2 size-8 opacity-20" />
                          Sin productos asociados
                        </TableCell>
                      </TableRow>
                    ) : (
                      productos.map((pp) => (
                        <TableRow key={pp.id}>
                          <TableCell>
                            <Link
                              href={`/admin/productos/${pp.productos.id}`}
                              className="font-medium hover:text-bordo"
                            >
                              {pp.productos.nombre}
                            </Link>
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            {pp.productos.sku || "—"}
                          </TableCell>
                          <TableCell className="text-right">
                            {pp.costo ? formatCurrency(pp.costo) : "—"}
                          </TableCell>
                          <TableCell className="text-center">
                            {pp.es_principal && (
                              <Badge variant="secondary">Principal</Badge>
                            )}
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </TabsContent>

            <TabsContent value="cuenta" className="mt-4">
              <div className="rounded-xl border bg-card">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Fecha</TableHead>
                      <TableHead>Concepto</TableHead>
                      <TableHead className="text-right">Debe</TableHead>
                      <TableHead className="text-right">Haber</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {movimientos.length === 0 ? (
                      <TableRow>
                        <TableCell
                          colSpan={4}
                          className="py-8 text-center text-muted-foreground"
                        >
                          Sin movimientos
                        </TableCell>
                      </TableRow>
                    ) : (
                      <>
                        {movimientos.map((m, i) => (
                          <TableRow key={i}>
                            <TableCell className="text-sm">
                              {formatDate(m.fecha)}
                            </TableCell>
                            <TableCell className="text-sm">
                              {m.concepto}
                            </TableCell>
                            <TableCell className="text-right font-medium">
                              {m.debe > 0 ? formatCurrency(m.debe) : ""}
                            </TableCell>
                            <TableCell className="text-right font-medium text-emerald-600">
                              {m.haber > 0 ? formatCurrency(m.haber) : ""}
                            </TableCell>
                          </TableRow>
                        ))}
                        <TableRow className="bg-muted/50 font-semibold">
                          <TableCell colSpan={2} className="text-right">
                            SALDO
                          </TableCell>
                          <TableCell
                            className={`text-right ${
                              proveedor.saldo_cuenta_corriente > 0
                                ? "text-amber-600"
                                : "text-emerald-600"
                            }`}
                          >
                            {proveedor.saldo_cuenta_corriente > 0
                              ? formatCurrency(
                                  proveedor.saldo_cuenta_corriente
                                )
                              : ""}
                          </TableCell>
                          <TableCell className="text-right text-emerald-600">
                            {proveedor.saldo_cuenta_corriente <= 0
                              ? formatCurrency(
                                  proveedor.saldo_cuenta_corriente
                                )
                              : ""}
                          </TableCell>
                        </TableRow>
                      </>
                    )}
                  </TableBody>
                </Table>
              </div>
            </TabsContent>
          </Tabs>
        </motion.div>
      </motion.div>

      {/* Modal Registrar Pago */}
      <Dialog open={pagoOpen} onOpenChange={setPagoOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Registrar pago a {proveedor.nombre}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handlePago} className="space-y-4">
            <div>
              <Label>Monto *</Label>
              <Input
                type="number"
                step="0.01"
                min="0.01"
                value={pagoForm.monto}
                onChange={(e) =>
                  setPagoForm((p) => ({ ...p, monto: e.target.value }))
                }
                placeholder="0.00"
                required
              />
            </div>
            <div>
              <Label>Método de pago *</Label>
              <Select
                value={pagoForm.metodo_pago}
                onValueChange={(v) =>
                  setPagoForm((p) => ({ ...p, metodo_pago: v ?? "transferencia" }))
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="transferencia">Transferencia</SelectItem>
                  <SelectItem value="efectivo">Efectivo</SelectItem>
                  <SelectItem value="cheque">Cheque</SelectItem>
                  <SelectItem value="otro">Otro</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Referencia</Label>
              <Input
                value={pagoForm.referencia}
                onChange={(e) =>
                  setPagoForm((p) => ({ ...p, referencia: e.target.value }))
                }
                placeholder="Nro. de transferencia, cheque, etc."
              />
            </div>
            <div>
              <Label>Notas</Label>
              <Textarea
                value={pagoForm.notas}
                onChange={(e) =>
                  setPagoForm((p) => ({ ...p, notas: e.target.value }))
                }
                rows={2}
              />
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setPagoOpen(false)}
              >
                Cancelar
              </Button>
              <Button type="submit">Registrar pago</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
