"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowLeft,
  Banknote,
  Building2,
  Check,
  Coins,
  Lock,
  Mail,
  PackageOpen,
  Percent,
  RefreshCw,
  Search,
  ShoppingCart,
  Trash2,
  UserSearch,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import type { CatalogosCaja, EstadoCaja, TipoMovimientoCaja } from "@/lib/comercial/caja";
import { calcularDescuentoManual, precioListaUnitario, precioSocioUnitario, round2 } from "@/lib/tienda/precios";
import { easeSnappy, fadeInLeft, fadeInRight, springBouncy, springSmooth, staggerContainer } from "@/lib/motion";
import type {
  CategoriaPos,
  ItemCarrito,
  MetodoPagoPos,
  ProductoPos,
  SocioPos,
  VariantePos,
} from "@/components/pos/tipos";
import { nuevaClave, pesos } from "@/components/pos/formato";
import { PrecioAnimado } from "@/components/pos/precio-animado";
import { TarjetaProducto } from "@/components/pos/tarjeta-producto";
import { LineaCarrito, precioLinea } from "@/components/pos/linea-carrito";
import { SelectorVariante } from "@/components/pos/selector-variante";
import { DialogoEncargue } from "@/components/pos/dialogo-encargue";
import { DialogoSocio } from "@/components/pos/dialogo-socio";
import { DialogoCobro, type ConfirmacionCobro, type ResultadoVenta } from "@/components/pos/dialogo-cobro";
import { AbrirCaja } from "@/components/caja/abrir-caja";
import { BarraCaja } from "@/components/caja/barra-caja";
import { DialogoMovimiento, type DatosMovimiento } from "@/components/caja/dialogo-movimiento";
import { DialogoCierre } from "@/components/caja/dialogo-cierre";
import {
  abrirCaja,
  buscarSocio,
  cerrarCaja,
  refrescarCaja,
  refrescarCatalogo,
  registrarMovimientoCaja,
} from "./actions";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function PosClient({
  productosIniciales,
  categorias: categoriasIniciales,
  estadoInicial,
  catalogosCaja,
}: {
  productosIniciales: ProductoPos[];
  categorias: CategoriaPos[];
  estadoInicial: EstadoCaja;
  catalogosCaja: CatalogosCaja;
}) {
  // ─── Catálogo y caja ─────────────────────────────────────
  const [productos, setProductos] = useState(productosIniciales);
  const [categorias, setCategorias] = useState(categoriasIniciales);
  const [estado, setEstado] = useState(estadoInicial);
  const [soloTransferencia, setSoloTransferencia] = useState(false);
  const [actualizando, iniciarActualizacion] = useTransition();
  const cajaAbierta = !!estado.sesion;

  // ─── Venta ───────────────────────────────────────────────
  const [search, setSearch] = useState("");
  const [categoriaActiva, setCategoriaActiva] = useState<number | null>(null);
  const [cart, setCart] = useState<ItemCarrito[]>([]);
  const [nombreCliente, setNombreCliente] = useState("");
  const [emailCliente, setEmailCliente] = useState("");
  const [socio, setSocio] = useState<SocioPos | null>(null);
  const [showSocio, setShowSocio] = useState(false);
  const [showMobileCart, setShowMobileCart] = useState(false);
  const [showDescuento, setShowDescuento] = useState(false);
  const [descTipo, setDescTipo] = useState<"porcentaje" | "fijo">("porcentaje");
  const [descValor, setDescValor] = useState("");
  const [descMotivo, setDescMotivo] = useState("");
  const [productoVariantes, setProductoVariantes] = useState<ProductoPos | null>(null);
  const [productoEncargue, setProductoEncargue] = useState<ProductoPos | null>(null);

  // ─── Cobro ───────────────────────────────────────────────
  const [metodoCobro, setMetodoCobro] = useState<MetodoPagoPos | null>(null);
  const [procesando, setProcesando] = useState(false);
  const [resultado, setResultado] = useState<ResultadoVenta | null>(null);
  // Una clave por intento de cobro: reintentos y doble click no duplican la venta.
  const claveRef = useRef<string>("");
  const enviandoRef = useRef(false);

  // ─── Caja: diálogos ─────────────────────────────────────
  const [tipoMovimiento, setTipoMovimiento] = useState<TipoMovimientoCaja | null>(null);
  const [showCierre, setShowCierre] = useState(false);

  const searchRef = useRef<HTMLInputElement>(null);

  // ─── Cálculos (misma regla que el servidor) ─────────────
  const esSocio = socio?.es_socio === true;

  const subtotal = useMemo(() => cart.reduce((s, i) => s + precioLinea(i, esSocio) * i.cantidad, 0), [cart, esSocio]);
  const subtotalLista = useMemo(() => cart.reduce((s, i) => s + precioLinea(i, false) * i.cantidad, 0), [cart]);
  const descuentoSocio = round2(subtotalLista - subtotal);
  const descuentoManual = useMemo(
    () => calcularDescuentoManual(subtotal, descTipo, parseFloat(descValor.replace(",", ".")) || 0),
    [subtotal, descTipo, descValor]
  );
  const total = round2(subtotal - descuentoManual);

  const hayEncargues = cart.some((i) => i.es_encargue);
  const emailTrim = emailCliente.trim();
  const pideEmail = hayEncargues && !socio;
  const emailValido = !pideEmail || emailTrim === "" || EMAIL_RE.test(emailTrim);
  const emailParaVenta = pideEmail && emailTrim ? emailTrim : null;
  const unidades = cart.reduce((s, i) => s + i.cantidad, 0);

  const productosFiltrados = useMemo(() => {
    let lista = productos;
    if (categoriaActiva) lista = lista.filter((p) => p.categoria_id === categoriaActiva);
    const q = search.trim().toLowerCase();
    if (q) lista = lista.filter((p) => p.nombre.toLowerCase().includes(q));
    return lista;
  }, [productos, categoriaActiva, search]);

  // ─── Refrescos ──────────────────────────────────────────
  const actualizarCatalogo = useCallback(() => {
    iniciarActualizacion(async () => {
      const r = await refrescarCatalogo();
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      setProductos(r.productos);
      setCategorias(r.categorias);
    });
  }, []);

  const actualizarCaja = useCallback(async () => {
    const r = await refrescarCaja();
    if (r.ok && r.estado) setEstado(r.estado);
  }, []);

  // ─── Carrito ────────────────────────────────────────────
  const agregar = useCallback((p: ProductoPos, v: VariantePos | null) => {
    const key = `${p.id}-${v?.id ?? "base"}`;
    const maximo = v ? v.disponible : p.disponible;
    setCart((prev) => {
      const existe = prev.find((i) => i.key === key);
      if (existe) {
        if (existe.cantidad >= maximo) {
          toast.warning(`No hay más ${existe.nombre} disponibles`);
          return prev;
        }
        return prev.map((i) => (i.key === key ? { ...i, cantidad: i.cantidad + 1 } : i));
      }
      return [
        ...prev,
        {
          key,
          producto_id: p.id,
          variante_id: v?.id ?? null,
          nombre: v ? `${p.nombre} - ${v.nombre}` : p.nombre,
          precio: precioListaUnitario(p, v?.precio_override),
          precio_socio: precioSocioUnitario(p, v?.precio_override),
          cantidad: 1,
          maximo,
          imagen_url: p.imagen_url,
          imagen_focal_point: p.imagen_focal_point,
          es_encargue: false,
          personalizacion: {},
          precio_extra: 0,
          resumen: null,
        },
      ];
    });
    setProductoVariantes(null);
  }, []);

  const clickProducto = useCallback(
    (p: ProductoPos) => {
      const puedeStock = !p.mto_solo && p.disponible > 0;
      if (p.mto_disponible && !puedeStock) setProductoEncargue(p);
      else if (p.variantes.length > 0 || p.mto_disponible) setProductoVariantes(p);
      else agregar(p, null);
    },
    [agregar]
  );

  const cambiarCantidad = useCallback((key: string, n: number) => {
    setCart((prev) =>
      n <= 0 ? prev.filter((i) => i.key !== key) : prev.map((i) => (i.key === key ? { ...i, cantidad: Math.min(n, i.maximo) } : i))
    );
  }, []);

  const quitar = useCallback((key: string) => setCart((prev) => prev.filter((i) => i.key !== key)), []);

  const limpiarVenta = useCallback(() => {
    setCart([]);
    setNombreCliente("");
    setEmailCliente("");
    setSocio(null);
    setShowDescuento(false);
    setDescValor("");
    setDescMotivo("");
    setShowMobileCart(false);
  }, []);

  // ─── Cobro ──────────────────────────────────────────────
  const abrirCobro = (m: MetodoPagoPos) => {
    if (m !== "transferencia" && !cajaAbierta) {
      toast.error("Abrí la caja antes de cobrar en efectivo");
      return;
    }
    claveRef.current = nuevaClave();
    setResultado(null);
    setMetodoCobro(m);
  };

  const cerrarCobro = () => {
    if (procesando) return;
    setMetodoCobro(null);
    setResultado(null);
  };

  const confirmarCobro = async (c: ConfirmacionCobro) => {
    if (enviandoRef.current || cart.length === 0) return;
    enviandoRef.current = true;
    setProcesando(true);
    try {
      const datos = {
        idempotency_key: claveRef.current || (claveRef.current = nuevaClave()),
        items: cart.map((i) => ({
          producto_id: i.producto_id,
          variante_id: i.variante_id,
          cantidad: i.cantidad,
          es_encargue: i.es_encargue,
          personalizacion: i.personalizacion,
        })),
        metodo_pago: c.metodo,
        monto_efectivo: c.montoEfectivo,
        nombre_cliente: nombreCliente.trim() || null,
        email_cliente: emailParaVenta,
        perfil_socio_id: socio?.id ?? null,
        descuento_manual_tipo: descuentoManual > 0 ? descTipo : null,
        descuento_manual_valor: descuentoManual > 0 ? parseFloat(descValor.replace(",", ".")) || 0 : null,
        descuento_motivo: descMotivo.trim() || null,
        total_esperado: total,
      };
      const form = new FormData();
      form.append("datos", JSON.stringify(datos));
      if (c.archivo) form.append("archivo", c.archivo);

      const res = await fetch("/api/admin/pos/venta", { method: "POST", body: form });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(json.error || "No se pudo registrar la venta");
        if (json.code === "caja_cerrada") void actualizarCaja();
        if (json.code === "total_cambio" || json.faltantes) actualizarCatalogo();
        return;
      }
      setResultado({ ticket: json.ticket, pago: c.pago });
      setMetodoCobro(null);
      limpiarVenta();
      toast.success(json.idempotent_replay ? `La venta ${json.data.numero_pedido} ya estaba registrada` : `Venta ${json.data.numero_pedido} registrada`);
      actualizarCatalogo();
      if (c.metodo !== "transferencia") void actualizarCaja();
    } catch {
      toast.error("Error de conexión. Podés reintentar: si la venta ya se registró, no se duplica.");
    } finally {
      enviandoRef.current = false;
      setProcesando(false);
    }
  };

  // ─── Caja: acciones ─────────────────────────────────────
  // El estado nuevo se aplica recién en `onListo`: si se aplicara ya, la
  // pantalla de apertura desaparecería antes de mostrar la diferencia.
  const estadoAbiertoRef = useRef<EstadoCaja | null>(null);
  const onAbrirCaja = async (contado: number, notas: string | null) => {
    const r = await abrirCaja({ contado, notas });
    if (r.ok && r.estado) estadoAbiertoRef.current = r.estado;
    return r;
  };
  const cajaLista = () => {
    if (estadoAbiertoRef.current) {
      setEstado(estadoAbiertoRef.current);
      estadoAbiertoRef.current = null;
    } else {
      void actualizarCaja();
    }
  };

  const onMovimiento = async (d: DatosMovimiento) => {
    if (!estado.sesion) return { ok: false, error: "La caja no está abierta" };
    const r = await registrarMovimientoCaja({ sesion: estado.sesion.id, ...d });
    if (r.ok && r.estado) setEstado(r.estado);
    return r;
  };

  // Igual que al abrir: el estado cerrado se aplica cuando se termina de ver el resultado.
  const estadoCerradoRef = useRef<EstadoCaja | null>(null);
  const onCerrarCaja = async (contado: number, notas: string | null) => {
    if (!estado.sesion) return { ok: false, error: "La caja no está abierta" };
    const r = await cerrarCaja({ sesion: estado.sesion.id, contado, notas });
    if (r.ok) {
      estadoCerradoRef.current = r.estado ?? { ...estado, sesion: null, esperado: contado, resumen: [], movimientos: [] };
    }
    return r;
  };
  const cajaCerrada = () => {
    setShowCierre(false);
    setSoloTransferencia(false);
    if (estadoCerradoRef.current) {
      setEstado(estadoCerradoRef.current);
      estadoCerradoRef.current = null;
    } else {
      void actualizarCaja();
    }
  };

  // ─── Atajo: "/" enfoca la búsqueda ──────────────────────
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "/" && !e.ctrlKey && !e.metaKey) {
        const tag = document.activeElement?.tagName;
        if (tag !== "INPUT" && tag !== "TEXTAREA" && tag !== "SELECT") {
          e.preventDefault();
          searchRef.current?.focus();
        }
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // ─── Sin caja abierta: primero se abre ──────────────────
  if (!cajaAbierta && !soloTransferencia) {
    return (
      <AbrirCaja
        nombreCaja={estado.caja?.nombre ?? "la caja"}
        saldoContable={estado.esperado}
        onAbrir={onAbrirCaja}
        onListo={cajaLista}
        onSoloTransferencia={() => setSoloTransferencia(true)}
      />
    );
  }

  const lineasResumen = cart.map((i) => ({
    key: i.key,
    texto: `${i.nombre} × ${i.cantidad}`,
    importe: precioLinea(i, esSocio) * i.cantidad,
    encargue: i.es_encargue,
  }));

  const botonesDeshabilitados = cart.length === 0 || procesando || !emailValido;

  return (
    <div className="flex h-[calc(100dvh-6.5rem)] flex-col gap-3 lg:h-[calc(100dvh-4rem)]">
      <BarraCaja
        estado={estado}
        onMovimiento={setTipoMovimiento}
        onCerrar={() => setShowCierre(true)}
        onAbrir={() => setSoloTransferencia(false)}
      />

      <div className="flex min-h-0 flex-1 flex-col gap-4 lg:flex-row">
        {/* ═══ Productos ═══ */}
        <motion.div
          variants={fadeInLeft}
          initial="hidden"
          animate="visible"
          transition={easeSnappy}
          className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-linea bg-white shadow-card"
        >
          <div className="space-y-3 border-b border-linea p-3 sm:p-4">
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  ref={searchRef}
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder='Buscar producto… (tecla "/")'
                  className="h-12 rounded-xl border-none bg-superficie pl-10 text-base"
                />
                {search && (
                  <button
                    type="button"
                    onClick={() => setSearch("")}
                    className="absolute right-2 top-1/2 -translate-y-1/2 p-2 text-muted-foreground hover:text-foreground"
                    aria-label="Limpiar búsqueda"
                  >
                    <X className="size-4" />
                  </button>
                )}
              </div>
              <motion.button
                type="button"
                whileTap={{ scale: 0.9 }}
                onClick={actualizarCatalogo}
                disabled={actualizando}
                title="Actualizar stock y precios"
                aria-label="Actualizar catálogo"
                className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-superficie text-muted-foreground hover:text-bordo-800"
              >
                <RefreshCw className={`size-5 ${actualizando ? "animate-spin" : ""}`} />
              </motion.button>
            </div>

            <div className="scrollbar-hide -mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
              {[{ id: null as number | null, nombre: "Todas" }, ...categorias].map((cat) => {
                const activa = categoriaActiva === cat.id;
                return (
                  <motion.button
                    key={cat.id ?? "todas"}
                    type="button"
                    whileTap={{ scale: 0.95 }}
                    onClick={() => setCategoriaActiva(cat.id === null || activa ? null : cat.id)}
                    className={`relative h-10 shrink-0 rounded-xl px-4 text-sm font-medium transition-colors ${activa ? "" : "bg-superficie hover:bg-gray-200"}`}
                  >
                    {activa && (
                      <motion.span layoutId="pos-categoria" transition={springSmooth} className="absolute inset-0 rounded-xl bg-bordo-800 shadow-sm" />
                    )}
                    <span className={`relative ${activa ? "text-white" : "text-foreground"}`}>{cat.nombre}</span>
                  </motion.button>
                );
              })}
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-3 sm:p-4">
            {productosFiltrados.length === 0 ? (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="flex h-full flex-col items-center justify-center py-12 text-muted-foreground"
              >
                <PackageOpen className="mb-3 size-12" strokeWidth={1} />
                <p>{productos.length === 0 ? "No hay productos habilitados para el POS" : "No se encontraron productos"}</p>
              </motion.div>
            ) : (
              <motion.div
                variants={staggerContainer}
                initial="hidden"
                animate="visible"
                className="grid grid-cols-[repeat(auto-fill,minmax(128px,1fr))] gap-3"
              >
                <AnimatePresence mode="popLayout">
                  {productosFiltrados.map((p) => (
                    <TarjetaProducto key={p.id} producto={p} onAgregar={clickProducto} precioSocio={esSocio} />
                  ))}
                </AnimatePresence>
              </motion.div>
            )}
          </div>
        </motion.div>

        {/* ═══ Botón flotante del carrito (celular) ═══ */}
        <AnimatePresence>
          {cart.length > 0 && !showMobileCart && (
            <motion.button
              type="button"
              initial={{ y: 100, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 100, opacity: 0 }}
              transition={springBouncy}
              onClick={() => setShowMobileCart(true)}
              className="fixed bottom-5 right-5 z-40 flex items-center gap-3 rounded-2xl bg-bordo-800 px-5 py-4 text-white shadow-xl lg:hidden"
            >
              <ShoppingCart className="size-5" />
              <span className="font-heading font-bold">{unidades}</span>
              <Separator orientation="vertical" className="h-5 bg-white/30" />
              <PrecioAnimado valor={total} className="font-heading font-bold" />
            </motion.button>
          )}
        </AnimatePresence>

        {/* ═══ Carrito ═══ */}
        <motion.div
          variants={fadeInRight}
          initial="hidden"
          animate="visible"
          transition={easeSnappy}
          className={`w-full shrink-0 flex-col overflow-hidden border border-linea bg-white shadow-card lg:w-[340px] xl:w-[390px] 2xl:w-[430px]
            ${showMobileCart ? "fixed inset-0 z-50 flex rounded-none lg:relative lg:inset-auto lg:z-auto lg:rounded-2xl" : "hidden rounded-2xl lg:flex"}`}
        >
          <div className="flex items-center justify-between border-b border-linea p-4">
            <div className="flex items-center gap-2">
              {showMobileCart && (
                <button type="button" onClick={() => setShowMobileCart(false)} className="mr-1 p-2 lg:hidden" aria-label="Volver">
                  <ArrowLeft className="size-5" />
                </button>
              )}
              <ShoppingCart className="size-5 text-bordo-700" />
              <h2 className="font-heading text-lg font-bold">Carrito</h2>
              <AnimatePresence>
                {unidades > 0 && (
                  <motion.span initial={{ scale: 0 }} animate={{ scale: 1 }} exit={{ scale: 0 }}>
                    <Badge variant="secondary">{unidades}</Badge>
                  </motion.span>
                )}
              </AnimatePresence>
            </div>
            {cart.length > 0 && (
              <Button variant="ghost" size="sm" onClick={limpiarVenta} className="h-9 text-xs text-muted-foreground hover:text-red-600">
                <Trash2 className="mr-1 size-3.5" />
                Vaciar
              </Button>
            )}
          </div>

          <div className="flex-1 overflow-y-auto px-4">
            {cart.length === 0 ? (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="flex h-full flex-col items-center justify-center py-12 text-muted-foreground"
              >
                <ShoppingCart className="mb-3 size-10" strokeWidth={1} />
                <p className="text-sm">Tocá un producto para empezar</p>
              </motion.div>
            ) : (
              <AnimatePresence mode="popLayout">
                {cart.map((i) => (
                  <LineaCarrito key={i.key} item={i} precioSocio={esSocio} onCantidad={cambiarCantidad} onQuitar={quitar} />
                ))}
              </AnimatePresence>
            )}
          </div>

          <div className="space-y-3 border-t border-linea p-4">
            <Input
              value={nombreCliente}
              onChange={(e) => setNombreCliente(e.target.value)}
              placeholder="Nombre del cliente (opcional)"
              className="h-11 rounded-lg border-none bg-superficie text-sm"
            />

            <AnimatePresence initial={false}>
              {hayEncargues && (
                <motion.div
                  key="email"
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={springSmooth}
                  className="overflow-hidden"
                >
                  {socio ? (
                    <p className="flex items-center gap-1.5 rounded-lg bg-superficie px-3 py-2 text-xs text-muted-foreground">
                      <Mail className="size-3.5 shrink-0" />
                      Los avisos del encargue van al email de la cuenta del socio.
                    </p>
                  ) : (
                    <div className="space-y-1">
                      <div className="relative">
                        <Mail className="absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
                        <Input
                          type="email"
                          inputMode="email"
                          autoComplete="off"
                          value={emailCliente}
                          onChange={(e) => setEmailCliente(e.target.value)}
                          placeholder="Email para avisos del encargue"
                          aria-invalid={!emailValido}
                          className="h-11 rounded-lg border-none bg-superficie pl-8 text-sm"
                        />
                      </div>
                      <p className={`text-[11px] ${!emailValido ? "text-red-600" : emailTrim ? "text-green-700" : "text-amber-700"}`}>
                        {!emailValido
                          ? "Email inválido"
                          : emailTrim
                            ? "Le avisamos por mail cuando esté listo para retirar."
                            : "Sin email no se le puede avisar cuando esté listo."}
                      </p>
                    </div>
                  )}
                </motion.div>
              )}
            </AnimatePresence>

            <div className="flex gap-2">
              {socio ? (
                <motion.div
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  className={`flex flex-1 items-center justify-between rounded-lg border px-3 py-2 ${esSocio ? "border-dorado-300/70 bg-dorado-300/15" : "border-linea bg-superficie"}`}
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">
                      {socio.nombre} {socio.apellido}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {esSocio ? "Socio" : "No socio"} · CI {socio.cedula}
                    </p>
                  </div>
                  <button type="button" onClick={() => setSocio(null)} className="p-2 text-muted-foreground hover:text-foreground" aria-label="Quitar socio">
                    <X className="size-4" />
                  </button>
                </motion.div>
              ) : (
                <Button variant="outline" onClick={() => setShowSocio(true)} className="h-11 flex-1 rounded-lg text-sm">
                  <UserSearch className="mr-2 size-4" />
                  Socio (precio socio)
                </Button>
              )}
              {!showDescuento && (
                <Button
                  variant="outline"
                  onClick={() => setShowDescuento(true)}
                  className="h-11 rounded-lg text-sm"
                  title="Descuento manual"
                >
                  <Percent className="size-4" />
                </Button>
              )}
            </div>

            <AnimatePresence initial={false}>
              {showDescuento && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  className="overflow-hidden"
                >
                  <div className="space-y-2 rounded-lg border border-amber-200 bg-amber-50/50 p-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-amber-800">Descuento manual</span>
                      <button
                        type="button"
                        onClick={() => {
                          setShowDescuento(false);
                          setDescValor("");
                          setDescMotivo("");
                        }}
                        className="p-1 text-muted-foreground hover:text-foreground"
                        aria-label="Quitar descuento"
                      >
                        <X className="size-4" />
                      </button>
                    </div>
                    <div className="grid grid-cols-[auto_1fr] gap-2">
                      <div className="flex gap-1 rounded-lg bg-white p-1">
                        {(["porcentaje", "fijo"] as const).map((t) => (
                          <button
                            key={t}
                            type="button"
                            onClick={() => setDescTipo(t)}
                            className={`h-9 rounded-md px-3 text-sm font-medium transition-colors ${descTipo === t ? "bg-primary text-white" : "text-muted-foreground"}`}
                          >
                            {t === "porcentaje" ? "%" : "$"}
                          </button>
                        ))}
                      </div>
                      <Input
                        inputMode="decimal"
                        value={descValor}
                        onChange={(e) => setDescValor(e.target.value.replace(/[^\d,.]/g, ""))}
                        placeholder={descTipo === "porcentaje" ? "Ej.: 10" : "Ej.: 500"}
                        className="h-11 text-base"
                      />
                    </div>
                    <Input
                      value={descMotivo}
                      onChange={(e) => setDescMotivo(e.target.value)}
                      placeholder="Motivo (opcional)"
                      className="h-10 text-sm"
                      maxLength={500}
                    />
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            <div className="space-y-1 pt-1">
              <div className="flex justify-between text-sm text-muted-foreground">
                <span>Subtotal</span>
                <PrecioAnimado valor={subtotalLista} />
              </div>
              <AnimatePresence initial={false}>
                {descuentoSocio > 0 && (
                  <motion.div
                    key="ds"
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                    className="flex justify-between text-sm text-green-700"
                  >
                    <span>Beneficio socio</span>
                    <span className="tabular-nums">- {pesos(descuentoSocio)}</span>
                  </motion.div>
                )}
                {descuentoManual > 0 && (
                  <motion.div
                    key="dm"
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                    className="flex justify-between text-sm text-amber-700"
                  >
                    <span>Descuento{descTipo === "porcentaje" ? ` (${descValor}%)` : ""}</span>
                    <span className="tabular-nums">- {pesos(descuentoManual)}</span>
                  </motion.div>
                )}
              </AnimatePresence>
              <Separator />
              <div className="flex items-baseline justify-between font-heading text-2xl font-bold">
                <span>Total</span>
                <PrecioAnimado valor={total} />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2 pt-1">
              <motion.div whileTap={{ scale: 0.97 }}>
                <Button
                  onClick={() => abrirCobro("efectivo")}
                  disabled={botonesDeshabilitados || !cajaAbierta}
                  className="h-14 w-full gap-1.5 rounded-xl bg-green-600 font-heading text-base font-bold text-white hover:bg-green-700"
                >
                  {cajaAbierta ? <Banknote className="size-5" /> : <Lock className="size-4" />}
                  Efectivo
                </Button>
              </motion.div>
              <motion.div whileTap={{ scale: 0.97 }}>
                <Button
                  onClick={() => abrirCobro("transferencia")}
                  disabled={botonesDeshabilitados}
                  className="h-14 w-full gap-1.5 rounded-xl bg-amber-500 font-heading text-base font-bold text-white hover:bg-amber-600"
                >
                  <Building2 className="size-5" />
                  Transferencia
                </Button>
              </motion.div>
              <motion.div whileTap={{ scale: 0.97 }} className="col-span-2">
                <Button
                  variant="outline"
                  onClick={() => abrirCobro("mixto")}
                  disabled={botonesDeshabilitados || !cajaAbierta}
                  className="h-12 w-full gap-1.5 rounded-xl border-bordo-200 font-heading text-sm font-bold text-bordo-800 hover:bg-bordo-50 hover:text-bordo-900"
                >
                  {cajaAbierta ? <Coins className="size-4" /> : <Lock className="size-4" />}
                  Mixto: efectivo + transferencia
                </Button>
              </motion.div>
            </div>
            <AnimatePresence initial={false}>
              {!cajaAbierta && (
                <motion.p
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  className="flex items-center gap-1.5 text-xs text-amber-800"
                >
                  <Lock className="size-3.5" />
                  Para cobrar en efectivo o mixto, abrí la caja.
                </motion.p>
              )}
            </AnimatePresence>
          </div>
        </motion.div>
      </div>

      {/* ═══ Diálogos ═══ */}
      <SelectorVariante
        producto={productoVariantes}
        onCerrar={() => setProductoVariantes(null)}
        onElegir={agregar}
        onEncargar={(p) => {
          setProductoVariantes(null);
          setProductoEncargue(p);
        }}
      />
      <DialogoEncargue
        producto={productoEncargue}
        esSocio={esSocio}
        onCerrar={() => setProductoEncargue(null)}
        onAgregar={(item) => {
          setCart((prev) => [...prev, item]);
          toast.success(`${item.nombre} agregado como encargue`, { icon: <Check className="size-4" /> });
          setProductoEncargue(null);
        }}
      />
      <DialogoSocio
        abierto={showSocio}
        onCambio={setShowSocio}
        buscar={buscarSocio}
        onEncontrado={(s) => {
          setSocio(s);
          setShowSocio(false);
        }}
      />
      <DialogoCobro
        metodo={metodoCobro}
        total={total}
        lineas={lineasResumen}
        emailAviso={emailParaVenta}
        hayEncargues={hayEncargues}
        procesando={procesando}
        resultado={resultado}
        onConfirmar={confirmarCobro}
        onCerrar={cerrarCobro}
      />
      <DialogoMovimiento
        tipo={tipoMovimiento}
        catalogos={catalogosCaja}
        esperado={estado.esperado}
        onCambiarTipo={setTipoMovimiento}
        onCerrar={() => setTipoMovimiento(null)}
        onRegistrar={onMovimiento}
      />
      <DialogoCierre
        abierto={showCierre}
        estado={estado}
        onCerrarDialogo={() => setShowCierre(false)}
        onCerrarCaja={onCerrarCaja}
        onListo={cajaCerrada}
      />
    </div>
  );
}
