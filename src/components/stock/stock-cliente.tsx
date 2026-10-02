"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import {
  AlertTriangle,
  ChevronRight,
  ClipboardCheck,
  ClipboardList,
  Clock,
  History,
  Package,
  PackageMinus,
  PackageOpen,
  PackageX,
  Search,
  Wallet,
} from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { formatImporte } from "@/lib/contabilidad/formato";
import { AYUDA_STOCK, costoPromedio } from "@/lib/comercial/stock";
import { easeSmooth, fadeInUp, springSmooth, staggerContainer } from "@/lib/motion";
import { EnteroAnimado, ImporteAnimado } from "@/components/contabilidad/reportes/importe-animado";
import { TituloReporte } from "@/components/contabilidad/reportes/titulo-reporte";
import { BajaDialog, type CentroCosto } from "./baja-dialog";
import { ControlMercaderiaAlerta, type ControlMercaderiaVista } from "./control-mercaderia-alerta";
import type { ItemVista, ProductoVista } from "./tipos";

type Filtro = "todos" | "bajo" | "agotados" | "reservados" | "sin_movimientos";

const FILTROS: { id: Filtro; label: string }[] = [
  { id: "todos", label: "Todos" },
  { id: "bajo", label: "Stock bajo" },
  { id: "agotados", label: "Agotados" },
  { id: "reservados", label: "Con reservas" },
  { id: "sin_movimientos", label: "Sin movimientos" },
];

const vendible = (p: ProductoVista) => p.activo || p.activoPos;
const esBajo = (p: ProductoVista) => p.stock > 0 && p.stock <= p.stockMinimo;

export function StockCliente({
  productos,
  control,
  verCostos,
  puedeOperar,
  puedeInventario,
  bajaInicial,
  centros,
  recuentosAbiertos,
  error,
}: {
  productos: ProductoVista[];
  control: ControlMercaderiaVista | null;
  verCostos: boolean;
  puedeOperar: boolean;
  puedeInventario: boolean;
  bajaInicial: string | null;
  centros: CentroCosto[];
  recuentosAbiertos: number;
  error: string | null;
}) {
  const [busqueda, setBusqueda] = useState("");
  const [filtro, setFiltro] = useState<Filtro>("todos");
  const [categoria, setCategoria] = useState<string>("todas");
  const [inactivos, setInactivos] = useState(false);
  const [abiertos, setAbiertos] = useState<Set<number>>(new Set());
  const [baja, setBaja] = useState<{ open: boolean; clave: string | null }>({
    open: !!bajaInicial && puedeOperar,
    clave: bajaInicial,
  });

  const categorias = useMemo(
    () => [...new Set(productos.map((p) => p.categoria).filter((c): c is string => !!c))].sort(),
    [productos]
  );

  const kpis = useMemo(() => {
    const activos = productos.filter(vendible);
    return {
      valor: productos.reduce((s, p) => s + p.valor, 0),
      unidades: productos.reduce((s, p) => s + p.stock, 0),
      bajo: activos.filter(esBajo).length,
      agotados: activos.filter((p) => p.stock === 0).length,
      reservadas: productos.reduce((s, p) => s + p.reservado, 0),
    };
  }, [productos]);

  const visibles = useMemo(() => {
    const t = busqueda.trim().toLowerCase();
    return productos.filter((p) => {
      if (!inactivos && !vendible(p) && p.stock === 0) return false;
      if (categoria !== "todas" && p.categoria !== categoria) return false;
      if (t) {
        const enItems = p.items.some((i) => (i.sku ?? "").toLowerCase().includes(t) || i.nombre.toLowerCase().includes(t));
        if (!p.nombre.toLowerCase().includes(t) && !(p.sku ?? "").toLowerCase().includes(t) && !enItems) return false;
      }
      switch (filtro) {
        case "bajo":
          return esBajo(p);
        case "agotados":
          return p.stock === 0;
        case "reservados":
          return p.reservado > 0;
        case "sin_movimientos":
          return p.items.some((i) => !i.conMovimientos);
        default:
          return true;
      }
    });
  }, [productos, busqueda, filtro, categoria, inactivos]);

  const sinMovimientos = productos.some((p) => p.items.some((i) => !i.conMovimientos && !i.heredado));

  function alternar(id: number) {
    setAbiertos((prev) => {
      const s = new Set(prev);
      if (s.has(id)) s.delete(id);
      else s.add(id);
      return s;
    });
  }

  const tarjetas = [
    ...(verCostos
      ? [{ label: "Valor del inventario", icon: Wallet, tono: "text-bordo-800", fondo: "bg-bordo-50", valor: <ImporteAnimado valor={kpis.valor} moneda="UYU" />, hint: "A costo, según el kardex" }]
      : []),
    { label: "Unidades en stock", icon: Package, tono: "text-foreground", fondo: "bg-superficie", valor: <EnteroAnimado valor={kpis.unidades} />, hint: `${productos.length} productos` },
    { label: "Stock bajo", icon: AlertTriangle, tono: "text-amber-600", fondo: "bg-amber-50", valor: <EnteroAnimado valor={kpis.bajo} />, hint: "Hasta el stock mínimo" },
    { label: "Agotados", icon: PackageX, tono: "text-red-600", fondo: "bg-red-50", valor: <EnteroAnimado valor={kpis.agotados} />, hint: "Activos sin stock" },
    { label: "Reservadas", icon: Clock, tono: "text-orange-600", fondo: "bg-orange-50", valor: <EnteroAnimado valor={kpis.reservadas} />, hint: "Transferencias por verificar" },
  ];

  return (
    <div className="space-y-6">
      <TituloReporte etiqueta="Tienda" titulo="Stock" descripcion={`Existencias valorizadas, reservas y kardex. ${AYUDA_STOCK}`}>
        {puedeOperar && (
          <div className="flex flex-wrap gap-2">
            {puedeInventario && sinMovimientos && (
              <Link
                href="/admin/stock/inventario-inicial"
                className={cn(buttonVariants({ variant: "outline", size: "lg" }), "rounded-full")}
              >
                <ClipboardList className="size-4" />
                Inventario inicial
              </Link>
            )}
            <Link href="/admin/stock/bajas" className={cn(buttonVariants({ variant: "outline", size: "lg" }), "rounded-full")}>
              <PackageMinus className="size-4" />
              Bajas
            </Link>
            <Link href="/admin/stock/recuentos" className={cn(buttonVariants({ variant: "outline", size: "lg" }), "relative rounded-full")}>
              <ClipboardCheck className="size-4" />
              Recuentos
              {recuentosAbiertos > 0 && (
                <motion.span
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ type: "spring", stiffness: 400, damping: 15 }}
                  className="ml-1 rounded-full bg-amber-500 px-1.5 text-[10px] font-semibold text-white"
                  title="Recuentos en borrador"
                >
                  {recuentosAbiertos}
                </motion.span>
              )}
            </Link>
            <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.97 }}>
              <Button size="lg" className="rounded-full" onClick={() => setBaja({ open: true, clave: null })}>
                <PackageMinus className="size-4" />
                Dar de baja
              </Button>
            </motion.div>
          </div>
        )}
      </TituloReporte>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700" role="alert">
          {error}
        </div>
      )}

      {verCostos && <ControlMercaderiaAlerta control={control} />}

      {/* KPIs */}
      <motion.div
        variants={staggerContainer}
        initial="hidden"
        animate="visible"
        className={cn("grid grid-cols-2 gap-3 sm:gap-4", verCostos ? "lg:grid-cols-5" : "lg:grid-cols-4")}
      >
        {tarjetas.map((t, i) => {
          const Icon = t.icon;
          return (
            <motion.div
              key={t.label}
              variants={fadeInUp}
              transition={springSmooth}
              whileHover={{ y: -2 }}
              className={cn(
                "rounded-2xl border border-linea bg-white p-4 shadow-sm",
                verCostos && i === 0 && "col-span-2 lg:col-span-1"
              )}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-[11px] text-muted-foreground font-body">{t.label}</p>
                  <p
                    className={cn(
                      "mt-1 whitespace-nowrap font-display tracking-tightest",
                      verCostos && i === 0 ? "text-xl lg:text-lg xl:text-xl" : "text-xl sm:text-2xl",
                      t.tono
                    )}
                  >
                    {t.valor}
                  </p>
                  <p className="mt-0.5 text-[10px] text-muted-foreground">{t.hint}</p>
                </div>
                <div className={cn("rounded-lg p-2", t.fondo)}>
                  <Icon className={cn("size-4", t.tono)} strokeWidth={1.75} />
                </div>
              </div>
            </motion.div>
          );
        })}
      </motion.div>

      {/* Filtros */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ ...easeSmooth, delay: 0.15 }}
        className="space-y-3"
      >
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Buscar producto, variante o SKU…"
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              className="pl-9"
            />
          </div>
          {categorias.length > 0 && (
            <Select value={categoria} onValueChange={(v) => setCategoria(v ?? "todas")}>
              <SelectTrigger className="w-full sm:w-48">
                <SelectValue placeholder="Categoría">{categoria === "todas" ? "Todas las categorías" : categoria}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todas">Todas las categorías</SelectItem>
                {categorias.map((c) => (
                  <SelectItem key={c} value={c}>
                    {c}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            <Switch checked={inactivos} onCheckedChange={setInactivos} />
            Incluir inactivos sin stock
          </label>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {FILTROS.map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => setFiltro(f.id)}
              className={cn(
                "relative rounded-full px-3 py-1 text-xs font-medium transition-colors",
                filtro === f.id ? "text-white" : "text-muted-foreground hover:text-foreground bg-superficie/60"
              )}
            >
              {filtro === f.id && (
                <motion.span
                  layoutId="filtro-stock"
                  className="absolute inset-0 rounded-full bg-bordo-800"
                  transition={springSmooth}
                />
              )}
              <span className="relative">{f.label}</span>
            </button>
          ))}
        </div>
      </motion.div>

      {/* Listado */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.2 }}
        className="overflow-hidden rounded-2xl border border-linea bg-white"
      >
        <div className="hidden grid-cols-[minmax(0,1fr)_70px_70px_80px_110px_120px_92px] gap-2 border-b border-linea bg-superficie/40 px-4 py-2.5 text-[11px] font-heading uppercase tracking-editorial text-muted-foreground md:grid">
          <span>Producto</span>
          <span className="text-right">Stock</span>
          <span className="text-right">Reserv.</span>
          <span className="text-right">Disponible</span>
          <span className="text-right">{verCostos ? "Costo prom." : ""}</span>
          <span className="text-right">{verCostos ? "Valor" : ""}</span>
          <span />
        </div>

        {visibles.length === 0 ? (
          <div className="py-16 text-center text-muted-foreground">
            <PackageOpen className="mx-auto mb-3 size-12 opacity-20" />
            <p className="text-sm">
              {productos.length === 0 ? "Todavía no hay productos en el catálogo" : "Ningún producto coincide con el filtro"}
            </p>
          </div>
        ) : (
          <motion.ul layout className="divide-y divide-linea">
            <AnimatePresence initial={false}>
              {visibles.map((p) => (
                <FilaProducto
                  key={p.id}
                  producto={p}
                  abierto={abiertos.has(p.id)}
                  onAlternar={() => alternar(p.id)}
                  verCostos={verCostos}
                  puedeOperar={puedeOperar}
                  onBaja={(clave) => setBaja({ open: true, clave })}
                />
              ))}
            </AnimatePresence>
          </motion.ul>
        )}
      </motion.div>

      {puedeOperar && (
        <BajaDialog
          open={baja.open}
          onOpenChange={(open) => setBaja((a) => ({ ...a, open }))}
          productos={productos}
          inicial={baja.clave}
          verCostos={verCostos}
          centros={centros}
        />
      )}
    </div>
  );
}

function Numeros({
  item,
  verCostos,
  fuerte,
}: {
  item: Pick<ItemVista, "stock" | "reservado" | "disponible" | "valor">;
  verCostos: boolean;
  fuerte?: boolean;
}) {
  const prom = costoPromedio(item.stock, item.valor);
  return (
    <>
      <span className={cn("text-right tabular-nums", fuerte && "font-heading text-base", item.stock === 0 && "text-red-600")}>
        {item.stock}
      </span>
      <span className={cn("text-right tabular-nums", item.reservado > 0 ? "text-orange-600" : "text-muted-foreground/60")}>
        {item.reservado || "—"}
      </span>
      <span className="text-right tabular-nums">{item.disponible}</span>
      <span className="text-right tabular-nums text-muted-foreground">
        {verCostos ? (prom !== null ? formatImporte(prom) : "—") : ""}
      </span>
      <span className="text-right tabular-nums">{verCostos ? formatImporte(item.valor) : ""}</span>
    </>
  );
}

function FilaProducto({
  producto: p,
  abierto,
  onAlternar,
  verCostos,
  puedeOperar,
  onBaja,
}: {
  producto: ProductoVista;
  abierto: boolean;
  onAlternar: () => void;
  verCostos: boolean;
  puedeOperar: boolean;
  onBaja: (clave: string | null) => void;
}) {
  const bajo = esBajo(p);
  const agotado = p.stock === 0;
  const unico = !p.tieneVariantes ? p.items[0] : null;
  const prom = costoPromedio(p.stock, p.valor);

  return (
    <motion.li
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, height: 0 }}
      transition={springSmooth}
    >
      <div
        className={cn(
          "grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2 px-4 py-3 text-sm transition-colors md:grid-cols-[minmax(0,1fr)_70px_70px_80px_110px_120px_92px]",
          p.tieneVariantes && "cursor-pointer hover:bg-superficie/40"
        )}
        onClick={p.tieneVariantes ? onAlternar : undefined}
      >
        <div className="flex min-w-0 items-center gap-2">
          {p.tieneVariantes ? (
            <motion.span animate={{ rotate: abierto ? 90 : 0 }} transition={{ duration: 0.15 }} className="shrink-0">
              <ChevronRight className="size-4 text-muted-foreground" />
            </motion.span>
          ) : (
            <span className="w-4 shrink-0" />
          )}
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-1.5">
              <Link
                href={`/admin/productos/${p.id}`}
                onClick={(e) => e.stopPropagation()}
                className="truncate font-medium hover:text-bordo-700"
              >
                {p.nombre}
              </Link>
              {agotado ? (
                <span className="rounded-full bg-red-100 px-1.5 py-0.5 text-[10px] font-medium text-red-700">Agotado</span>
              ) : bajo ? (
                <span className="rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-700">Bajo</span>
              ) : null}
              {!vendible(p) && <span className="rounded-full bg-superficie px-1.5 py-0.5 text-[10px] text-muted-foreground">Inactivo</span>}
              {p.metodo === "fifo" && <span className="rounded-full border border-linea px-1.5 py-0.5 text-[10px] text-muted-foreground">FIFO</span>}
            </div>
            <p className="truncate text-[11px] text-muted-foreground">
              {[p.sku && `SKU ${p.sku}`, p.categoria, p.tieneVariantes && `${p.items.length} variantes`, `mín. ${p.stockMinimo}`]
                .filter(Boolean)
                .join(" · ")}
            </p>
            {/* Mobile */}
            <p className="mt-1 text-xs text-muted-foreground md:hidden">
              <span className={cn("font-medium text-foreground", agotado && "text-red-600")}>{p.stock} u.</span>
              {p.reservado > 0 && <span className="text-orange-600"> · {p.reservado} reserv.</span>}
              {verCostos && <span> · $ {formatImporte(p.valor)}</span>}
              {verCostos && prom !== null && <span> · prom. {formatImporte(prom)}</span>}
            </p>
          </div>
        </div>

        <div className="hidden md:contents">
          <Numeros item={p} verCostos={verCostos} fuerte />
        </div>

        <div className="flex items-center justify-end gap-1" onClick={(e) => e.stopPropagation()}>
          {puedeOperar && p.stock > 0 && (
            <Button
              variant="outline"
              size="icon-sm"
              title="Dar de baja"
              aria-label={`Dar de baja ${p.nombre}`}
              onClick={() => onBaja(unico ? unico.clave : null)}
            >
              <PackageMinus className="size-3.5" />
            </Button>
          )}
          <Link
            href={`/admin/stock/kardex/${p.id}`}
            title="Kardex"
            aria-label={`Kardex de ${p.nombre}`}
            className={buttonVariants({ variant: "ghost", size: "icon-sm" })}
          >
            <History className="size-3.5" />
          </Link>
        </div>
      </div>

      <AnimatePresence initial={false}>
        {p.tieneVariantes && abierto && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={springSmooth}
            className="overflow-hidden bg-superficie/30"
          >
            {p.items.map((it) => (
              <div
                key={it.clave}
                className={cn(
                  "grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2 border-t border-linea/60 py-2 pl-12 pr-4 text-xs md:grid-cols-[minmax(0,1fr)_70px_70px_80px_110px_120px_92px]",
                  !it.activo && "opacity-60"
                )}
              >
                <div className="min-w-0">
                  <span className="font-medium">{it.nombre}</span>
                  {it.sku && <span className="ml-2 font-mono text-[10px] text-muted-foreground">{it.sku}</span>}
                  {!it.activo && <span className="ml-2 text-[10px] text-muted-foreground">(inactiva)</span>}
                  <p className="mt-0.5 text-[11px] text-muted-foreground md:hidden">
                    {it.stock} u.{it.reservado > 0 && ` · ${it.reservado} reserv.`}
                    {verCostos && ` · $ ${formatImporte(it.valor)}`}
                  </p>
                </div>
                <div className="hidden md:contents">
                  <Numeros item={it} verCostos={verCostos} />
                </div>
                <div className="flex justify-end gap-1">
                  {puedeOperar && it.stock > 0 && (
                    <Button
                      variant="ghost"
                      size="icon-xs"
                      title="Dar de baja"
                      aria-label={`Dar de baja ${p.nombre} ${it.nombre}`}
                      onClick={() => onBaja(it.clave)}
                    >
                      <PackageMinus className="size-3" />
                    </Button>
                  )}
                  <Link
                    href={`/admin/stock/kardex/${p.id}?variante=${it.varianteId ?? 0}`}
                    title="Kardex"
                    aria-label={`Kardex de ${it.nombre}`}
                    className={buttonVariants({ variant: "ghost", size: "icon-xs" })}
                  >
                    <History className="size-3" />
                  </Link>
                </div>
              </div>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </motion.li>
  );
}
