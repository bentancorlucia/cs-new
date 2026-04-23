"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import Image from "next/image";
import { motion, AnimatePresence, useMotionValue, useTransform, animate } from "framer-motion";
import {
  Search,
  Plus,
  Minus,
  Trash2,
  Banknote,
  UserSearch,
  X,
  ShoppingCart,
  PackageOpen,
  Check,
  Loader2,
  ArrowLeft,
  Percent,
  Building2,
  Upload,
  Copy,
  FileImage,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { createBrowserClient } from "@/lib/supabase/client";
import { toast } from "sonner";
import {
  fadeInUp,
  fadeInLeft,
  fadeInRight,
  scaleIn,
  staggerContainer,
  staggerContainerFast,
  springBouncy,
  springSmooth,
  easeSnappy,
} from "@/lib/motion";

// ─── Types ───────────────────────────────────────────────────

interface ProductoVariante {
  id: number;
  nombre: string;
  sku: string | null;
  precio_override: number | null;
  stock_actual: number;
  atributos: Record<string, string>;
  activo: boolean;
}

interface Producto {
  id: number;
  nombre: string;
  slug: string;
  precio: number;
  precio_socio: number | null;
  stock_actual: number;
  categoria_id: number | null;
  activo: boolean;
  imagen_url: string | null;
  imagen_focal_point: string | null;
  variantes: ProductoVariante[];
}

interface Categoria {
  id: number;
  nombre: string;
  slug: string;
}

interface POSCartItem {
  producto_id: number;
  variante_id: number | null;
  nombre: string;
  precio: number;
  precio_socio: number | null;
  cantidad: number;
  stock_actual: number;
  imagen_url: string | null;
  imagen_focal_point: string | null;
}

interface SocioInfo {
  id: string;
  nombre: string;
  apellido: string;
  cedula: string | null;
  es_socio: boolean;
}

// ─── Animated Counter ────────────────────────────────────────

function AnimatedPrice({ value }: { value: number }) {
  const motionVal = useMotionValue(0);
  const display = useTransform(motionVal, (v) =>
    `$${Math.round(v).toLocaleString("es-UY")}`
  );

  useEffect(() => {
    const controls = animate(motionVal, value, {
      duration: 0.4,
      ease: [0.25, 0.46, 0.45, 0.94],
    });
    return controls.stop;
  }, [value, motionVal]);

  return <motion.span>{display}</motion.span>;
}

// ─── Product Card (POS) ─────────────────────────────────────

function POSProductCard({
  producto,
  onAdd,
  usarPrecioSocio,
}: {
  producto: Producto;
  onAdd: (p: Producto) => void;
  usarPrecioSocio: boolean;
}) {
  const precio = usarPrecioSocio && producto.precio_socio
    ? producto.precio_socio
    : producto.precio;
  const sinStock = producto.stock_actual <= 0;

  return (
    <motion.button
      variants={fadeInUp}
      whileHover={sinStock ? {} : { scale: 1.03, y: -2 }}
      whileTap={sinStock ? {} : { scale: 0.97 }}
      transition={springBouncy}
      onClick={() => !sinStock && onAdd(producto)}
      disabled={sinStock}
      className={`
        relative flex flex-col items-center rounded-xl border bg-white p-3 text-center
        transition-shadow duration-200 cursor-pointer select-none
        ${sinStock
          ? "opacity-50 cursor-not-allowed border-gray-200"
          : "border-linea hover:shadow-card hover:border-bordo-200 active:shadow-sm"
        }
      `}
    >
      {/* Image */}
      <div className="relative w-full aspect-square rounded-lg bg-superficie overflow-hidden mb-2">
        {producto.imagen_url ? (
          <Image
            src={producto.imagen_url}
            alt={producto.nombre}
            fill
            className="object-cover"
            style={{ objectPosition: producto.imagen_focal_point || "50% 50%" }}
            sizes="120px"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-muted-foreground">
            <PackageOpen className="size-8" strokeWidth={1} />
          </div>
        )}
        {sinStock && (
          <div className="absolute inset-0 bg-white/70 flex items-center justify-center">
            <Badge variant="destructive" className="text-xs">Agotado</Badge>
          </div>
        )}
      </div>

      {/* Info */}
      <p className="font-body font-medium text-sm leading-tight line-clamp-2 mb-1">
        {producto.nombre}
      </p>
      <p className="font-heading font-bold text-bordo-700 text-base">
        ${precio.toLocaleString("es-UY")}
      </p>
      {usarPrecioSocio && producto.precio_socio && (
        <p className="text-xs text-muted-foreground line-through">
          ${producto.precio.toLocaleString("es-UY")}
        </p>
      )}

      {/* Stock badge */}
      <span className="text-[10px] text-muted-foreground mt-1">
        Stock: {producto.stock_actual}
      </span>

      {/* Variants indicator */}
      {producto.variantes.length > 0 && (
        <Badge variant="outline" className="mt-1 text-[9px] px-1.5 py-0 border-bordo-200 text-bordo-600">
          {producto.variantes.length} variantes
        </Badge>
      )}

      {/* Add overlay */}
      {!sinStock && (
        <motion.div
          initial={{ opacity: 0 }}
          whileHover={{ opacity: 1 }}
          className="absolute inset-0 rounded-xl bg-bordo-800/10 flex items-center justify-center"
        >
          <div className="bg-bordo-800 text-white rounded-full p-2 shadow-lg">
            <Plus className="size-5" />
          </div>
        </motion.div>
      )}
    </motion.button>
  );
}

// ─── Cart Item Row ──────────────────────────────────────────

function CartItemRow({
  item,
  usarPrecioSocio,
  onUpdateQty,
  onRemove,
}: {
  item: POSCartItem;
  usarPrecioSocio: boolean;
  onUpdateQty: (productoId: number, varianteId: number | null, qty: number) => void;
  onRemove: (productoId: number, varianteId: number | null) => void;
}) {
  const precio = usarPrecioSocio && item.precio_socio
    ? item.precio_socio
    : item.precio;

  return (
    <motion.div
      layout
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20, height: 0, marginBottom: 0 }}
      transition={springSmooth}
      className="flex items-center gap-3 py-2"
    >
      {/* Thumbnail */}
      <div className="size-10 rounded-lg bg-superficie overflow-hidden shrink-0">
        {item.imagen_url ? (
          <Image
            src={item.imagen_url}
            alt={item.nombre}
            width={40}
            height={40}
            className="object-cover w-full h-full"
            style={{ objectPosition: item.imagen_focal_point || "50% 50%" }}
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <PackageOpen className="size-4 text-muted-foreground" strokeWidth={1} />
          </div>
        )}
      </div>

      {/* Name & price */}
      <div className="flex-1 min-w-0">
        <p className="font-body font-medium text-sm leading-tight truncate">
          {item.nombre}
        </p>
        <p className="text-xs text-muted-foreground">
          ${precio.toLocaleString("es-UY")} c/u
        </p>
      </div>

      {/* Quantity controls */}
      <div className="flex items-center gap-1">
        <motion.button
          whileTap={{ scale: 0.85 }}
          onClick={() => onUpdateQty(item.producto_id, item.variante_id, item.cantidad - 1)}
          className="size-7 rounded-md bg-superficie flex items-center justify-center text-foreground hover:bg-gray-200 transition-colors"
        >
          <Minus className="size-3.5" />
        </motion.button>
        <span className="w-6 text-center font-body font-semibold text-sm">
          {item.cantidad}
        </span>
        <motion.button
          whileTap={{ scale: 0.85 }}
          onClick={() => onUpdateQty(item.producto_id, item.variante_id, item.cantidad + 1)}
          disabled={item.cantidad >= item.stock_actual}
          className="size-7 rounded-md bg-superficie flex items-center justify-center text-foreground hover:bg-gray-200 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <Plus className="size-3.5" />
        </motion.button>
      </div>

      {/* Subtotal */}
      <span className="font-heading font-bold text-sm w-20 text-right">
        ${(precio * item.cantidad).toLocaleString("es-UY")}
      </span>

      {/* Remove */}
      <motion.button
        whileTap={{ scale: 0.85 }}
        onClick={() => onRemove(item.producto_id, item.variante_id)}
        className="size-7 rounded-md flex items-center justify-center text-muted-foreground hover:text-red-600 hover:bg-red-50 transition-colors"
      >
        <Trash2 className="size-3.5" />
      </motion.button>
    </motion.div>
  );
}

// ─── Main POS Component ─────────────────────────────────────

export function POSClient() {
  const supabase = useMemo(() => createBrowserClient(), []);

  // State
  const [productos, setProductos] = useState<Producto[]>([]);
  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [categoriaActiva, setCategoriaActiva] = useState<number | null>(null);
  const [cart, setCart] = useState<POSCartItem[]>([]);
  const [nombreCliente, setNombreCliente] = useState("");
  const [socio, setSocio] = useState<SocioInfo | null>(null);
  const [buscandoSocio, setBuscandoSocio] = useState(false);
  const [cedulaBusqueda, setCedulaBusqueda] = useState("");
  const [showSocioSearch, setShowSocioSearch] = useState(false);
  const [showEfectivoModal, setShowEfectivoModal] = useState(false);
  const [procesando, setProcesando] = useState(false);
  const [ventaExitosa, setVentaExitosa] = useState(false);
  const [showMobileCart, setShowMobileCart] = useState(false);
  const [showDescuento, setShowDescuento] = useState(false);
  const [descuentoManualTipo, setDescuentoManualTipo] = useState<"porcentaje" | "fijo">("porcentaje");
  const [descuentoManualValor, setDescuentoManualValor] = useState("");
  const [descuentoManualMotivo, setDescuentoManualMotivo] = useState("");
  const [showTransferenciaModal, setShowTransferenciaModal] = useState(false);
  const [comprobanteFile, setComprobanteFile] = useState<File | null>(null);
  const [comprobantePreview, setComprobantePreview] = useState<string | null>(null);
  const [subiendoComprobante, setSubiendoComprobante] = useState(false);
  const [transferExitosa, setTransferExitosa] = useState(false);
  const [cuentaCopiada, setCuentaCopiada] = useState(false);
  const [showVariantePicker, setShowVariantePicker] = useState(false);
  const [productoVarianteSeleccion, setProductoVarianteSeleccion] = useState<Producto | null>(null);
  const comprobanteInputRef = useRef<HTMLInputElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  // Computed
  const usarPrecioSocio = socio?.es_socio === true;

  const subtotal = useMemo(
    () =>
      cart.reduce((sum, item) => {
        const precio = usarPrecioSocio && item.precio_socio
          ? item.precio_socio
          : item.precio;
        return sum + precio * item.cantidad;
      }, 0),
    [cart, usarPrecioSocio]
  );

  const descuentoSocio = useMemo(() => {
    if (!usarPrecioSocio) return 0;
    const totalSinDesc = cart.reduce(
      (sum, item) => sum + item.precio * item.cantidad,
      0
    );
    return totalSinDesc - subtotal;
  }, [cart, subtotal, usarPrecioSocio]);

  const descuentoManualMonto = useMemo(() => {
    const val = parseFloat(descuentoManualValor) || 0;
    if (val <= 0) return 0;
    if (descuentoManualTipo === "porcentaje") {
      return Math.round(subtotal * (val / 100));
    }
    return Math.min(val, subtotal);
  }, [subtotal, descuentoManualTipo, descuentoManualValor]);

  const descuentoManualPct = descuentoManualTipo === "porcentaje"
    ? (parseFloat(descuentoManualValor) || 0)
    : 0;

  const total = subtotal - descuentoManualMonto;

  // ─── Data fetching ─────────────────────────────────────────

  const fetchProductos = useCallback(async () => {
    setLoading(true);
    const db = supabase as any;

    const { data: prods } = await db
      .from("productos")
      .select("id, nombre, slug, precio, precio_socio, stock_actual, categoria_id, activo, producto_imagenes(url, es_principal, focal_point), producto_variantes(id, nombre, sku, precio_override, stock_actual, atributos, activo)")
      .eq("activo", true)
      .order("nombre");

    const { data: cats } = await db
      .from("categorias_producto")
      .select("id, nombre, slug")
      .eq("activa", true)
      .order("orden");

    const mapped = (prods || []).map((p: any) => {
      const img = p.producto_imagenes?.find((i: any) => i.es_principal) || p.producto_imagenes?.[0];
      const variantes = (p.producto_variantes || []).filter((v: any) => v.activo);
      return {
        id: p.id,
        nombre: p.nombre,
        slug: p.slug,
        precio: p.precio,
        precio_socio: p.precio_socio,
        stock_actual: p.stock_actual,
        categoria_id: p.categoria_id,
        activo: p.activo,
        imagen_url: img?.url || null,
        imagen_focal_point: img?.focal_point || null,
        variantes,
      };
    });

    setProductos(mapped);
    setCategorias(cats || []);
    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    fetchProductos();
  }, [fetchProductos]);

  // ─── Filtered products ────────────────────────────────────

  const productosFiltrados = useMemo(() => {
    let filtered = productos;
    if (categoriaActiva) {
      filtered = filtered.filter((p) => p.categoria_id === categoriaActiva);
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      filtered = filtered.filter((p) => p.nombre.toLowerCase().includes(q));
    }
    return filtered;
  }, [productos, categoriaActiva, search]);

  // ─── Cart actions ─────────────────────────────────────────

  // Cart key for uniqueness: producto_id + variante_id
  const cartKey = (productoId: number, varianteId: number | null) =>
    `${productoId}-${varianteId ?? "base"}`;

  const addToCartDirect = useCallback((producto: Producto, variante: ProductoVariante | null) => {
    const key = cartKey(producto.id, variante?.id ?? null);
    const stock = variante ? variante.stock_actual : producto.stock_actual;
    const precio = variante?.precio_override ?? producto.precio;
    const nombre = variante
      ? `${producto.nombre} - ${variante.nombre}`
      : producto.nombre;

    setCart((prev) => {
      const existing = prev.find(
        (i) => cartKey(i.producto_id, i.variante_id) === key
      );
      if (existing) {
        if (existing.cantidad >= stock) return prev;
        return prev.map((i) =>
          cartKey(i.producto_id, i.variante_id) === key
            ? { ...i, cantidad: i.cantidad + 1 }
            : i
        );
      }
      return [
        ...prev,
        {
          producto_id: producto.id,
          variante_id: variante?.id ?? null,
          nombre,
          precio,
          precio_socio: producto.precio_socio,
          cantidad: 1,
          stock_actual: stock,
          imagen_url: producto.imagen_url,
          imagen_focal_point: producto.imagen_focal_point,
        },
      ];
    });

    // Close variant picker if open
    setShowVariantePicker(false);
    setProductoVarianteSeleccion(null);
  }, []);

  const handleProductClick = useCallback((producto: Producto) => {
    if (producto.variantes.length > 0) {
      setProductoVarianteSeleccion(producto);
      setShowVariantePicker(true);
    } else {
      addToCartDirect(producto, null);
    }
  }, [addToCartDirect]);

  const updateCartQty = useCallback((productoId: number, varianteId: number | null, qty: number) => {
    const key = cartKey(productoId, varianteId);
    setCart((prev) => {
      if (qty <= 0) return prev.filter((i) => cartKey(i.producto_id, i.variante_id) !== key);
      return prev.map((i) =>
        cartKey(i.producto_id, i.variante_id) === key
          ? { ...i, cantidad: Math.min(qty, i.stock_actual) }
          : i
      );
    });
  }, []);

  const removeFromCart = useCallback((productoId: number, varianteId: number | null) => {
    const key = cartKey(productoId, varianteId);
    setCart((prev) => prev.filter((i) => cartKey(i.producto_id, i.variante_id) !== key));
  }, []);

  const clearCart = useCallback(() => {
    setCart([]);
    setNombreCliente("");
    setSocio(null);
    setCedulaBusqueda("");
  }, []);

  // ─── Socio search ─────────────────────────────────────────

  const buscarSocio = useCallback(async () => {
    if (!cedulaBusqueda.trim()) return;
    setBuscandoSocio(true);

    const db = supabase as any;
    const { data, error } = await db
      .from("perfiles")
      .select("id, nombre, apellido, cedula, es_socio")
      .or(`cedula.eq.${cedulaBusqueda.trim()}`)
      .limit(1)
      .single();

    if (error || !data) {
      toast.error("No se encontró un socio con esa cédula o número");
    } else {
      setSocio(data as SocioInfo);
      setShowSocioSearch(false);
      toast.success(`Socio: ${data.nombre} ${data.apellido}`);
    }
    setBuscandoSocio(false);
  }, [cedulaBusqueda, supabase]);

  // ─── Process sale ─────────────────────────────────────────

  const procesarVentaEfectivo = useCallback(
    async () => {
      if (cart.length === 0) return;
      setProcesando(true);

      try {
        const items = cart.map((item) => ({
          producto_id: item.producto_id,
          variante_id: item.variante_id,
          cantidad: item.cantidad,
          precio_unitario:
            usarPrecioSocio && item.precio_socio
              ? item.precio_socio
              : item.precio,
        }));

        const res = await fetch("/api/admin/pos/venta", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            items,
            metodo_pago: "efectivo",
            nombre_cliente: nombreCliente || null,
            perfil_socio_id: socio?.id || null,
            descuento: descuentoSocio + descuentoManualMonto,
            descuento_tipo: descuentoManualMonto > 0 ? descuentoManualTipo : (descuentoSocio > 0 ? "socio" : null),
            descuento_porcentaje: descuentoManualPct > 0 ? descuentoManualPct : null,
            descuento_motivo: descuentoManualMotivo || null,
            notas: null,
          }),
        });

        const json = await res.json();

        if (!res.ok) {
          toast.error(json.error || "Error al procesar la venta");
          setProcesando(false);
          return;
        }

        setVentaExitosa(true);
        toast.success(`Venta #${json.data.numero_pedido} registrada`);

        // Refresh products for updated stock
        fetchProductos();

        // Reset after showing success
        setTimeout(() => {
          setVentaExitosa(false);
          setShowEfectivoModal(false);
          clearCart();
        }, 2000);
      } catch (err) {
        toast.error("Error de conexión");
      } finally {
        setProcesando(false);
      }
    },
    [cart, nombreCliente, socio, usarPrecioSocio, descuentoSocio, descuentoManualMonto, descuentoManualTipo, descuentoManualPct, descuentoManualMotivo, clearCart, fetchProductos]
  );

  // ─── Process transfer sale ───────────────────────────────

  const procesarTransferencia = useCallback(async () => {
    if (cart.length === 0 || !comprobanteFile) return;
    setSubiendoComprobante(true);

    try {
      // 1. Create order with transferencia
      const items = cart.map((item) => ({
        producto_id: item.producto_id,
        variante_id: item.variante_id,
        cantidad: item.cantidad,
        precio_unitario:
          usarPrecioSocio && item.precio_socio
            ? item.precio_socio
            : item.precio,
      }));

      const res = await fetch("/api/admin/pos/venta", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items,
          metodo_pago: "transferencia",
          nombre_cliente: nombreCliente || null,
          perfil_socio_id: socio?.id || null,
          descuento: descuentoSocio + descuentoManualMonto,
          descuento_tipo: descuentoManualMonto > 0 ? descuentoManualTipo : (descuentoSocio > 0 ? "socio" : null),
          descuento_porcentaje: descuentoManualPct > 0 ? descuentoManualPct : null,
          descuento_motivo: descuentoManualMotivo || null,
          notas: null,
        }),
      });

      const json = await res.json();

      if (!res.ok) {
        toast.error(json.error || "Error al procesar la venta");
        setSubiendoComprobante(false);
        return;
      }

      // 2. Upload comprobante
      const formData = new FormData();
      formData.append("archivo", comprobanteFile);
      formData.append("pedido_id", String(json.data.id));

      const compRes = await fetch("/api/admin/pos/comprobante", {
        method: "POST",
        body: formData,
      });

      if (!compRes.ok) {
        const compJson = await compRes.json();
        toast.error(compJson.error || "Error al subir comprobante");
        setSubiendoComprobante(false);
        return;
      }

      // 3. Success
      setTransferExitosa(true);
      toast.success(`Venta #${json.data.numero_pedido} pendiente de verificación`);
      fetchProductos();

      setTimeout(() => {
        setTransferExitosa(false);
        setShowTransferenciaModal(false);
        setComprobanteFile(null);
        setComprobantePreview(null);
        clearCart();
      }, 2000);
    } catch (err) {
      toast.error("Error de conexión");
    } finally {
      setSubiendoComprobante(false);
    }
  }, [cart, comprobanteFile, nombreCliente, socio, usarPrecioSocio, descuentoSocio, descuentoManualMonto, descuentoManualTipo, descuentoManualPct, descuentoManualMotivo, clearCart, fetchProductos]);

  // Handle file selection for comprobante
  const handleComprobanteSelect = useCallback((file: File | null) => {
    if (!file) return;
    const allowed = ["image/jpeg", "image/png", "image/webp", "application/pdf"];
    if (!allowed.includes(file.type)) {
      toast.error("Formato no permitido. Usá JPG, PNG, WebP o PDF.");
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      toast.error("El archivo no puede superar 10MB");
      return;
    }
    setComprobanteFile(file);
    if (file.type.startsWith("image/")) {
      const url = URL.createObjectURL(file);
      setComprobantePreview(url);
    } else {
      setComprobantePreview(null);
    }
  }, []);

  const copiarCuenta = useCallback(() => {
    navigator.clipboard.writeText("9500100");
    setCuentaCopiada(true);
    setTimeout(() => setCuentaCopiada(false), 2000);
  }, []);

  // ─── Keyboard shortcut: focus search ──────────────────────

  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === "/" && !e.ctrlKey && !e.metaKey) {
        const active = document.activeElement?.tagName;
        if (active !== "INPUT" && active !== "TEXTAREA") {
          e.preventDefault();
          searchRef.current?.focus();
        }
      }
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, []);

  // ─── Render ───────────────────────────────────────────────

  return (
    <div className="h-[calc(100vh-2rem)] lg:h-[calc(100vh-4rem)] flex flex-col lg:flex-row gap-4">
      {/* ═══ LEFT PANEL: Products ═══ */}
      <motion.div
        variants={fadeInLeft}
        initial="hidden"
        animate="visible"
        transition={easeSnappy}
        className="flex-1 flex flex-col min-h-0 bg-white rounded-2xl shadow-card border border-linea overflow-hidden"
      >
        {/* Header */}
        <div className="p-4 border-b border-linea space-y-3">
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
            <Input
              ref={searchRef}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder='Buscar producto... (presioná "/" )'
              className="pl-10 h-11 text-base font-body bg-superficie border-none rounded-xl"
            />
            {search && (
              <button
                onClick={() => setSearch("")}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                <X className="size-4" />
              </button>
            )}
          </div>

          {/* Category filters */}
          <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
            <motion.button
              whileTap={{ scale: 0.95 }}
              onClick={() => setCategoriaActiva(null)}
              className={`
                shrink-0 px-4 py-2 rounded-xl text-sm font-body font-medium transition-all duration-200
                ${!categoriaActiva
                  ? "bg-bordo-800 text-white shadow-sm"
                  : "bg-superficie text-foreground hover:bg-gray-200"
                }
              `}
            >
              Todas
            </motion.button>
            {categorias.map((cat) => (
              <motion.button
                key={cat.id}
                whileTap={{ scale: 0.95 }}
                onClick={() =>
                  setCategoriaActiva(categoriaActiva === cat.id ? null : cat.id)
                }
                className={`
                  shrink-0 px-4 py-2 rounded-xl text-sm font-body font-medium transition-all duration-200
                  ${categoriaActiva === cat.id
                    ? "bg-bordo-800 text-white shadow-sm"
                    : "bg-superficie text-foreground hover:bg-gray-200"
                  }
                `}
              >
                {cat.nombre}
              </motion.button>
            ))}
          </div>
        </div>

        {/* Product Grid */}
        <div className="flex-1 overflow-y-auto p-4">
          {loading ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 gap-3">
              {Array.from({ length: 12 }).map((_, i) => (
                <Skeleton key={i} className="aspect-[3/4] rounded-xl" />
              ))}
            </div>
          ) : productosFiltrados.length === 0 ? (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="flex flex-col items-center justify-center h-full text-muted-foreground"
            >
              <PackageOpen className="size-12 mb-3" strokeWidth={1} />
              <p className="font-body">No se encontraron productos</p>
            </motion.div>
          ) : (
            <motion.div
              variants={staggerContainer}
              initial="hidden"
              animate="visible"
              className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 gap-3"
            >
              {productosFiltrados.map((producto) => (
                <POSProductCard
                  key={producto.id}
                  producto={producto}
                  onAdd={handleProductClick}
                  usarPrecioSocio={usarPrecioSocio}
                />
              ))}
            </motion.div>
          )}
        </div>
      </motion.div>

      {/* ═══ Mobile cart toggle ═══ */}
      <AnimatePresence>
        {cart.length > 0 && !showMobileCart && (
          <motion.button
            initial={{ y: 100, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 100, opacity: 0 }}
            transition={springBouncy}
            onClick={() => setShowMobileCart(true)}
            className="lg:hidden fixed bottom-6 right-6 z-40 bg-bordo-800 text-white rounded-2xl px-5 py-3 shadow-xl flex items-center gap-3"
          >
            <ShoppingCart className="size-5" />
            <span className="font-heading font-bold">{cart.length}</span>
            <Separator orientation="vertical" className="h-5 bg-white/30" />
            <span className="font-heading font-bold">
              ${total.toLocaleString("es-UY")}
            </span>
          </motion.button>
        )}
      </AnimatePresence>

      {/* ═══ RIGHT PANEL: Cart ═══ */}
      <motion.div
        variants={fadeInRight}
        initial="hidden"
        animate="visible"
        transition={easeSnappy}
        className={`
          w-full lg:w-[380px] xl:w-[420px] flex flex-col bg-white rounded-2xl shadow-card border border-linea overflow-hidden shrink-0
          ${showMobileCart
            ? "fixed inset-0 z-50 rounded-none lg:relative lg:inset-auto lg:z-auto lg:rounded-2xl"
            : "hidden lg:flex"
          }
        `}
      >
        {/* Cart header */}
        <div className="p-4 border-b border-linea flex items-center justify-between">
          <div className="flex items-center gap-2">
            {showMobileCart && (
              <button
                onClick={() => setShowMobileCart(false)}
                className="lg:hidden mr-1 p-1"
              >
                <ArrowLeft className="size-5" />
              </button>
            )}
            <ShoppingCart className="size-5 text-bordo-700" />
            <h2 className="font-heading font-bold text-lg">Carrito</h2>
            {cart.length > 0 && (
              <Badge variant="secondary" className="ml-1 font-body">
                {cart.length}
              </Badge>
            )}
          </div>
          {cart.length > 0 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={clearCart}
              className="text-muted-foreground hover:text-red-600 text-xs"
            >
              <Trash2 className="size-3.5 mr-1" />
              Limpiar
            </Button>
          )}
        </div>

        {/* Cart items */}
        <div className="flex-1 overflow-y-auto px-4">
          {cart.length === 0 ? (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="flex flex-col items-center justify-center h-full text-muted-foreground py-12"
            >
              <ShoppingCart className="size-10 mb-3" strokeWidth={1} />
              <p className="font-body text-sm">Agregá productos para empezar</p>
            </motion.div>
          ) : (
            <AnimatePresence mode="popLayout">
              {cart.map((item) => (
                <CartItemRow
                  key={`${item.producto_id}-${item.variante_id ?? "base"}`}
                  item={item}
                  usarPrecioSocio={usarPrecioSocio}
                  onUpdateQty={updateCartQty}
                  onRemove={removeFromCart}
                />
              ))}
            </AnimatePresence>
          )}
        </div>

        {/* Cart footer */}
        <div className="border-t border-linea p-4 space-y-3">
          {/* Customer name */}
          <Input
            value={nombreCliente}
            onChange={(e) => setNombreCliente(e.target.value)}
            placeholder="Nombre del cliente (opcional)"
            className="h-9 text-sm bg-superficie border-none rounded-lg"
          />

          {/* Socio lookup */}
          {socio ? (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex items-center justify-between bg-amarillo-50 border border-amarillo-200 rounded-lg px-3 py-2"
            >
              <div>
                <p className="text-sm font-body font-medium">
                  {socio.nombre} {socio.apellido}
                </p>
                <p className="text-xs text-muted-foreground">
                  Socio - CI: {socio.cedula}
                </p>
              </div>
              <button
                onClick={() => setSocio(null)}
                className="text-muted-foreground hover:text-foreground"
              >
                <X className="size-4" />
              </button>
            </motion.div>
          ) : (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowSocioSearch(true)}
              className="w-full text-sm rounded-lg"
            >
              <UserSearch className="size-4 mr-2" />
              Buscar socio (descuento)
            </Button>
          )}

          {/* Descuento manual */}
          <AnimatePresence>
            {showDescuento ? (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                className="space-y-2 rounded-lg border border-amber-200 bg-amber-50/50 p-3"
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-amber-800">Descuento manual</span>
                  <button
                    type="button"
                    onClick={() => {
                      setShowDescuento(false);
                      setDescuentoManualValor("");
                      setDescuentoManualMotivo("");
                    }}
                    className="text-muted-foreground hover:text-foreground"
                  >
                    <X className="size-3.5" />
                  </button>
                </div>

                <div className="flex gap-1.5">
                  <button
                    type="button"
                    onClick={() => setDescuentoManualTipo("porcentaje")}
                    className={`flex-1 rounded-md px-2 py-1 text-xs font-medium transition-colors ${
                      descuentoManualTipo === "porcentaje"
                        ? "bg-primary text-white"
                        : "bg-muted text-muted-foreground"
                    }`}
                  >
                    %
                  </button>
                  <button
                    type="button"
                    onClick={() => setDescuentoManualTipo("fijo")}
                    className={`flex-1 rounded-md px-2 py-1 text-xs font-medium transition-colors ${
                      descuentoManualTipo === "fijo"
                        ? "bg-primary text-white"
                        : "bg-muted text-muted-foreground"
                    }`}
                  >
                    $ Fijo
                  </button>
                </div>

                <Input
                  type="number"
                  min="0"
                  max={descuentoManualTipo === "porcentaje" ? "100" : undefined}
                  value={descuentoManualValor}
                  onChange={(e) => setDescuentoManualValor(e.target.value)}
                  placeholder={descuentoManualTipo === "porcentaje" ? "Ej: 10" : "Ej: 500"}
                  className="h-8 text-sm"
                />

                <Input
                  value={descuentoManualMotivo}
                  onChange={(e) => setDescuentoManualMotivo(e.target.value)}
                  placeholder="Motivo (opcional)"
                  className="h-8 text-xs"
                />

                {descuentoManualMonto > 0 && (
                  <motion.p
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="text-xs text-green-600 flex items-center gap-1"
                  >
                    <Check className="size-3" />
                    -${descuentoManualMonto.toLocaleString("es-UY")}
                  </motion.p>
                )}
              </motion.div>
            ) : (
              <motion.button
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                type="button"
                onClick={() => setShowDescuento(true)}
                className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-primary transition-colors"
              >
                <Percent className="size-3" />
                Aplicar descuento manual
              </motion.button>
            )}
          </AnimatePresence>

          {/* Totals */}
          <div className="space-y-1 pt-1">
            <div className="flex justify-between text-sm text-muted-foreground font-body">
              <span>Subtotal</span>
              <AnimatedPrice value={usarPrecioSocio ? subtotal + descuentoSocio : subtotal} />
            </div>
            {descuentoSocio > 0 && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                className="flex justify-between text-sm text-green-600 font-body"
              >
                <span>Descuento socio</span>
                <span>-${descuentoSocio.toLocaleString("es-UY")}</span>
              </motion.div>
            )}
            {descuentoManualMonto > 0 && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                className="flex justify-between text-sm text-amber-600 font-body"
              >
                <span>
                  Desc. manual
                  {descuentoManualTipo === "porcentaje" && ` (${descuentoManualValor}%)`}
                </span>
                <span>-${descuentoManualMonto.toLocaleString("es-UY")}</span>
              </motion.div>
            )}
            <Separator />
            <div className="flex justify-between font-heading font-bold text-xl">
              <span>Total</span>
              <AnimatedPrice value={total} />
            </div>
          </div>

          {/* Payment buttons */}
          <div className="grid grid-cols-2 gap-2 pt-1">
            <motion.div whileTap={{ scale: 0.97 }}>
              <Button
                onClick={() => setShowEfectivoModal(true)}
                disabled={cart.length === 0 || procesando}
                className="w-full h-14 bg-green-600 hover:bg-green-700 text-white rounded-xl font-heading font-bold text-sm gap-1.5"
              >
                <Banknote className="size-5" />
                Efectivo
              </Button>
            </motion.div>
            <motion.div whileTap={{ scale: 0.97 }}>
              <Button
                onClick={() => setShowTransferenciaModal(true)}
                disabled={cart.length === 0 || procesando}
                className="w-full h-14 bg-amber-500 hover:bg-amber-600 text-white rounded-xl font-heading font-bold text-sm gap-1.5"
              >
                <Building2 className="size-5" />
                Transferencia
              </Button>
            </motion.div>
          </div>
        </div>
      </motion.div>

      {/* ═══ MODALS ═══ */}

      {/* Variant Picker Modal */}
      <Dialog
        open={showVariantePicker}
        onOpenChange={(open) => {
          setShowVariantePicker(open);
          if (!open) setProductoVarianteSeleccion(null);
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-heading">
              {productoVarianteSeleccion?.nombre}
            </DialogTitle>
            <DialogDescription>
              Elegí la variante para agregar al carrito.
            </DialogDescription>
          </DialogHeader>
          {productoVarianteSeleccion && (
            <motion.div
              variants={staggerContainerFast}
              initial="hidden"
              animate="visible"
              className="grid gap-2 py-2 max-h-[60vh] overflow-y-auto"
            >
              {productoVarianteSeleccion.variantes.map((v) => {
                const precio = v.precio_override ?? productoVarianteSeleccion.precio;
                const sinStock = v.stock_actual <= 0;
                const attrLabel = Object.values(v.atributos || {}).join(" / ") || v.nombre;
                return (
                  <motion.button
                    key={v.id}
                    variants={fadeInUp}
                    whileHover={sinStock ? {} : { scale: 1.01 }}
                    whileTap={sinStock ? {} : { scale: 0.98 }}
                    disabled={sinStock}
                    onClick={() => addToCartDirect(productoVarianteSeleccion, v)}
                    className={`
                      flex items-center justify-between gap-3 rounded-xl border p-3 text-left transition-all
                      ${sinStock
                        ? "opacity-40 cursor-not-allowed border-gray-200 bg-gray-50"
                        : "border-linea hover:border-bordo-300 hover:bg-bordo-50/50 cursor-pointer"
                      }
                    `}
                  >
                    <div className="flex-1 min-w-0">
                      <p className="font-body font-medium text-sm">{attrLabel}</p>
                      {v.sku && (
                        <p className="text-[11px] text-muted-foreground font-mono">{v.sku}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <span className="text-xs text-muted-foreground">
                        Stock: {v.stock_actual}
                      </span>
                      <span className="font-heading font-bold text-sm text-bordo-700">
                        ${precio.toLocaleString("es-UY")}
                      </span>
                      {!sinStock && (
                        <div className="size-7 rounded-lg bg-bordo-800 text-white flex items-center justify-center">
                          <Plus className="size-4" />
                        </div>
                      )}
                    </div>
                  </motion.button>
                );
              })}
            </motion.div>
          )}
        </DialogContent>
      </Dialog>

      {/* Socio Search Modal */}
      <Dialog open={showSocioSearch} onOpenChange={setShowSocioSearch}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-heading">Buscar socio</DialogTitle>
            <DialogDescription>
              Ingresá la cédula o número de socio para aplicar descuento.
            </DialogDescription>
          </DialogHeader>
          <div className="flex gap-2">
            <Input
              value={cedulaBusqueda}
              onChange={(e) => setCedulaBusqueda(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && buscarSocio()}
              placeholder="Cédula o N° de socio"
              className="flex-1"
              autoFocus
            />
            <Button onClick={buscarSocio} disabled={buscandoSocio}>
              {buscandoSocio ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Search className="size-4" />
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Cash Confirmation Modal */}
      <Dialog open={showEfectivoModal} onOpenChange={setShowEfectivoModal}>
        <DialogContent className="sm:max-w-sm">
          <AnimatePresence mode="wait">
            {ventaExitosa ? (
              <motion.div
                key="success"
                variants={scaleIn}
                initial="hidden"
                animate="visible"
                transition={springBouncy}
                className="flex flex-col items-center py-8"
              >
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ ...springBouncy, delay: 0.1 }}
                  className="size-16 rounded-full bg-green-100 flex items-center justify-center mb-4"
                >
                  <Check className="size-8 text-green-600" />
                </motion.div>
                <h3 className="font-heading font-bold text-xl mb-1">¡Venta registrada!</h3>
                <p className="text-muted-foreground text-sm font-body">
                  El carrito se limpiará automáticamente
                </p>
              </motion.div>
            ) : (
              <motion.div key="confirm">
                <DialogHeader>
                  <DialogTitle className="font-heading">Confirmar cobro en efectivo</DialogTitle>
                  <DialogDescription>
                    Se registrará la venta y se descontará el stock.
                  </DialogDescription>
                </DialogHeader>
                <div className="py-4">
                  <div className="bg-superficie rounded-xl p-4 space-y-2">
                    {cart.map((item) => {
                      const precio = usarPrecioSocio && item.precio_socio
                        ? item.precio_socio
                        : item.precio;
                      return (
                        <div key={`${item.producto_id}-${item.variante_id ?? "base"}`} className="flex justify-between text-sm font-body">
                          <span>
                            {item.nombre} × {item.cantidad}
                          </span>
                          <span className="font-medium">
                            ${(precio * item.cantidad).toLocaleString("es-UY")}
                          </span>
                        </div>
                      );
                    })}
                    <Separator />
                    <div className="flex justify-between font-heading font-bold text-lg">
                      <span>Total</span>
                      <span>${total.toLocaleString("es-UY")}</span>
                    </div>
                  </div>
                </div>
                <DialogFooter>
                  <Button
                    variant="outline"
                    onClick={() => setShowEfectivoModal(false)}
                    disabled={procesando}
                  >
                    Cancelar
                  </Button>
                  <Button
                    onClick={() => procesarVentaEfectivo()}
                    disabled={procesando}
                    className="bg-green-600 hover:bg-green-700 text-white gap-2"
                  >
                    {procesando ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      <Banknote className="size-4" />
                    )}
                    Cobrar ${total.toLocaleString("es-UY")}
                  </Button>
                </DialogFooter>
              </motion.div>
            )}
          </AnimatePresence>
        </DialogContent>
      </Dialog>

      {/* Transferencia Modal */}
      <Dialog
        open={showTransferenciaModal}
        onOpenChange={(open) => {
          setShowTransferenciaModal(open);
          if (!open && !transferExitosa) {
            setComprobanteFile(null);
            setComprobantePreview(null);
          }
        }}
      >
        <DialogContent className="sm:max-w-md">
          <AnimatePresence mode="wait">
            {transferExitosa ? (
              <motion.div
                key="transfer-success"
                variants={scaleIn}
                initial="hidden"
                animate="visible"
                transition={springBouncy}
                className="flex flex-col items-center py-8"
              >
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ ...springBouncy, delay: 0.1 }}
                  className="size-16 rounded-full bg-amber-100 flex items-center justify-center mb-4"
                >
                  <Check className="size-8 text-amber-600" />
                </motion.div>
                <h3 className="font-heading font-bold text-xl mb-1">Venta registrada</h3>
                <p className="text-muted-foreground text-sm font-body text-center">
                  Pendiente de verificación en &quot;Por conciliar&quot;
                </p>
              </motion.div>
            ) : (
              <motion.div key="transfer-form">
                <DialogHeader>
                  <DialogTitle className="font-heading">Pago por transferencia</DialogTitle>
                  <DialogDescription>
                    Datos bancarios para la transferencia y comprobante.
                  </DialogDescription>
                </DialogHeader>

                <div className="py-4 space-y-4">
                  {/* Bank details */}
                  <motion.div
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="bg-superficie rounded-xl p-4 space-y-2"
                  >
                    <div className="flex items-center gap-2 mb-2">
                      <Building2 className="size-4 text-bordo-700" />
                      <span className="font-heading font-bold text-sm text-bordo-800">
                        Datos bancarios
                      </span>
                    </div>
                    <div className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm font-body">
                      <span className="text-muted-foreground">Banco:</span>
                      <span className="font-medium">ITAU</span>
                      <span className="text-muted-foreground">Cuenta:</span>
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-bold text-bordo-800">9500100</span>
                        <motion.button
                          whileTap={{ scale: 0.9 }}
                          onClick={copiarCuenta}
                          className="text-muted-foreground hover:text-bordo-700 transition-colors"
                          title="Copiar número de cuenta"
                        >
                          {cuentaCopiada ? (
                            <Check className="size-3.5 text-green-600" />
                          ) : (
                            <Copy className="size-3.5" />
                          )}
                        </motion.button>
                      </div>
                      <span className="text-muted-foreground">Titular:</span>
                      <span className="font-medium">Club Seminario</span>
                    </div>
                    <div className="pt-2 border-t border-linea mt-2">
                      <div className="flex justify-between font-heading font-bold text-lg">
                        <span>Total a transferir:</span>
                        <span className="text-bordo-800">${total.toLocaleString("es-UY")}</span>
                      </div>
                    </div>
                  </motion.div>

                  {/* Upload comprobante */}
                  <motion.div
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.1 }}
                    className="space-y-2"
                  >
                    <label className="text-sm font-body font-medium">
                      Comprobante de transferencia
                    </label>
                    <input
                      ref={comprobanteInputRef}
                      type="file"
                      accept="image/jpeg,image/png,image/webp,application/pdf"
                      className="hidden"
                      onChange={(e) => handleComprobanteSelect(e.target.files?.[0] || null)}
                    />

                    {comprobanteFile ? (
                      <motion.div
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        className="relative border-2 border-green-200 bg-green-50/50 rounded-xl p-3"
                      >
                        <div className="flex items-center gap-3">
                          {comprobantePreview ? (
                            <img
                              src={comprobantePreview}
                              alt="Preview"
                              className="size-16 rounded-lg object-cover border border-linea"
                            />
                          ) : (
                            <div className="size-16 rounded-lg bg-superficie flex items-center justify-center border border-linea">
                              <FileImage className="size-6 text-muted-foreground" />
                            </div>
                          )}
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-body font-medium truncate">
                              {comprobanteFile.name}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {(comprobanteFile.size / 1024).toFixed(0)} KB
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={() => {
                              setComprobanteFile(null);
                              setComprobantePreview(null);
                              if (comprobanteInputRef.current) {
                                comprobanteInputRef.current.value = "";
                              }
                            }}
                            className="text-muted-foreground hover:text-red-600 transition-colors"
                          >
                            <X className="size-4" />
                          </button>
                        </div>
                      </motion.div>
                    ) : (
                      <motion.button
                        type="button"
                        whileHover={{ scale: 1.01 }}
                        whileTap={{ scale: 0.98 }}
                        onClick={() => comprobanteInputRef.current?.click()}
                        onDragOver={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                        }}
                        onDrop={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          handleComprobanteSelect(e.dataTransfer.files?.[0] || null);
                        }}
                        className="w-full border-2 border-dashed border-gray-300 hover:border-bordo-400 rounded-xl p-6 flex flex-col items-center gap-2 text-muted-foreground hover:text-bordo-700 transition-colors cursor-pointer"
                      >
                        <Upload className="size-6" />
                        <span className="text-sm font-body font-medium">
                          Subir comprobante
                        </span>
                        <span className="text-xs">
                          JPG, PNG, WebP o PDF (máx. 10MB)
                        </span>
                      </motion.button>
                    )}
                  </motion.div>
                </div>

                <DialogFooter className="gap-2">
                  <Button
                    variant="outline"
                    onClick={() => {
                      setShowTransferenciaModal(false);
                      setComprobanteFile(null);
                      setComprobantePreview(null);
                    }}
                    disabled={subiendoComprobante}
                  >
                    Cancelar
                  </Button>
                  <Button
                    onClick={procesarTransferencia}
                    disabled={!comprobanteFile || subiendoComprobante}
                    className="bg-amber-500 hover:bg-amber-600 text-white gap-2"
                  >
                    {subiendoComprobante ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      <Building2 className="size-4" />
                    )}
                    {subiendoComprobante ? "Procesando..." : `Confirmar $${total.toLocaleString("es-UY")}`}
                  </Button>
                </DialogFooter>
              </motion.div>
            )}
          </AnimatePresence>
        </DialogContent>
      </Dialog>
    </div>
  );
}
