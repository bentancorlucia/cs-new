# Tienda Online + Punto de Venta (POS)

## Visión General

La tienda tiene dos canales de venta:
1. **Online**: los usuarios navegan, agregan al carrito y pagan con MercadoPago. Retiran en el local (pickup).
2. **POS (Punto de Venta)**: interfaz web optimizada para tablet/PC en el local físico. Venta rápida con cobro en efectivo o MercadoPago QR.

Ambos canales comparten el mismo inventario y base de datos.

---

## Tienda Online (Pública)

### Páginas

| Ruta | Descripción |
|------|-------------|
| `/tienda` | Listado de productos con filtros y búsqueda |
| `/tienda/[slug]` | Detalle de producto |
| `/tienda/carrito` | Carrito de compras |
| `/tienda/checkout` | Proceso de pago |
| `/tienda/pedido/[id]` | Confirmación de pedido |

### Listado de productos (`/tienda`)

```
┌─────────────────────────────────────────────┐
│  🔍 Buscar productos...                     │
│                                             │
│  Filtros: [Todas] [Ropa] [Accesorios] [...] │
│                                             │
│  ┌─────────┐  ┌─────────┐  ┌─────────┐    │
│  │  📷     │  │  📷     │  │  📷     │    │
│  │ Camiseta│  │ Short   │  │ Medias  │    │
│  │ $1.500  │  │ $1.200  │  │ $500    │    │
│  │[Agregar]│  │[Agregar]│  │[Agregar]│    │
│  └─────────┘  └─────────┘  └─────────┘    │
└─────────────────────────────────────────────┘
```

**Funcionalidades:**
- Búsqueda por nombre (debounced, 300ms)
- Filtro por categoría (tabs o dropdown)
- Ordenar por: precio (asc/desc), más nuevos, más vendidos
- Paginación o infinite scroll
- Badge "Socio -X%" si el producto tiene precio de socio
- Badge "Agotado" si stock = 0
- Botón "Agregar al carrito" con animación optimistic

### Detalle de producto (`/tienda/[slug]`)

- Galería de imágenes (carousel)
- Nombre, descripción, precio (y precio socio si aplica)
- Selector de variante (talle, color) si tiene variantes
- Selector de cantidad
- Indicador de stock ("Quedan 3 unidades")
- Botón "Agregar al carrito"
- Productos relacionados (misma categoría)

### Carrito de compras

**Estado del carrito**: almacenado en `localStorage` (no requiere auth).

```typescript
interface CartItem {
  productoId: number;
  varianteId?: number;
  nombre: string;
  precio: number;
  cantidad: number;
  imagenUrl: string;
  maxStock: number;
}

interface Cart {
  items: CartItem[];
  total: number;
}
```

**Funcionalidades:**
- Modificar cantidad (1 - maxStock)
- Eliminar item
- Subtotal por item y total general
- Si el usuario está logueado y es socio, mostrar precios de socio
- Botón "Ir al checkout" (requiere auth)
- Carrito persistente entre sesiones (localStorage)

### Checkout (`/tienda/checkout`)

**Requiere autenticación**. Si no está logueado, redirigir a login con return URL.

```
1. Resumen del pedido (items, cantidades, precios)
2. Datos de contacto (pre-rellenados del perfil)
3. Nota opcional para el pedido
4. Botón "Pagar con MercadoPago" → redirige a checkout de MP
```

**Flujo de pago:**

```
Frontend                    Backend                     MercadoPago
   │                          │                            │
   │ POST /api/checkout       │                            │
   │ {items, perfil_id}       │                            │
   │ ────────────────────────>│                            │
   │                          │ Validar stock              │
   │                          │ Crear pedido (pendiente)   │
   │                          │ Crear preference MP        │
   │                          │ ───────────────────────────>│
   │                          │ <───── init_point URL ──────│
   │ <── {pedido_id, mp_url}──│                            │
   │                          │                            │
   │ Redirect a MP ──────────────────────────────────────>│
   │                          │                            │
   │                          │ Webhook: payment.approved  │
   │                          │ <──────────────────────────│
   │                          │ Actualizar pedido: pagado  │
   │                          │ Descontar stock            │
   │                          │ Enviar email confirmación  │
   │                          │                            │
   │ Redirect back_url ───────│                            │
   │ /tienda/pedido/[id]      │                            │
```

### API Route: Crear checkout

```typescript
// POST /api/checkout
export async function POST(request: Request) {
  const supabase = createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "No autorizado" }, { status: 401 });

  const { items } = await request.json(); // [{productoId, varianteId?, cantidad}]

  // 1. Validar stock de cada item
  for (const item of items) {
    const { data: producto } = await supabase
      .from("productos")
      .select("stock_actual, precio, precio_socio, nombre")
      .eq("id", item.productoId)
      .single();

    if (producto.stock_actual < item.cantidad) {
      return Response.json({
        error: `Stock insuficiente para ${producto.nombre}`
      }, { status: 400 });
    }
  }

  // 2. Calcular totales (verificar si es socio para precios)
  const perfil = await supabase.from("perfiles").select("es_socio").eq("id", user.id).single();
  // ... calcular subtotal, descuentos, total

  // 3. Crear pedido en DB
  const { data: pedido } = await supabase.from("pedidos").insert({
    perfil_id: user.id,
    tipo: "online",
    estado: "pendiente",
    subtotal,
    descuento,
    total,
    metodo_pago: "mercadopago",
  }).select().single();

  // 4. Crear items del pedido
  // ... insert pedido_items

  // 5. Crear preferencia MercadoPago
  const preference = await mercadopago.preferences.create({
    items: items.map(/* ... */),
    back_urls: {
      success: `${APP_URL}/tienda/pedido/${pedido.id}`,
      failure: `${APP_URL}/tienda/carrito`,
    },
    notification_url: `${APP_URL}/api/webhooks/mercadopago`,
    external_reference: pedido.numero_pedido,
  });

  // 6. Guardar preference_id
  await supabase.from("pedidos").update({
    mercadopago_preference_id: preference.id,
  }).eq("id", pedido.id);

  return Response.json({
    pedido_id: pedido.id,
    checkout_url: preference.init_point,
  });
}
```

### Webhook MercadoPago

```typescript
// POST /api/webhooks/mercadopago
export async function POST(request: Request) {
  const body = await request.json();

  if (body.type === "payment") {
    const payment = await mercadopago.payment.get(body.data.id);

    if (payment.status === "approved") {
      const pedido = await supabase.from("pedidos")
        .select("*")
        .eq("numero_pedido", payment.external_reference)
        .single();

      // Actualizar pedido
      await supabase.from("pedidos").update({
        estado: "pagado",
        mercadopago_payment_id: payment.id.toString(),
      }).eq("id", pedido.data.id);

      // Descontar stock
      // ... por cada item del pedido

      // Registrar pago
      await supabase.from("pagos_mercadopago").insert({
        tipo_origen: "pedido",
        origen_id: pedido.data.id,
        mercadopago_payment_id: payment.id.toString(),
        mercadopago_status: payment.status,
        monto: payment.transaction_amount,
        raw_data: payment,
      });

      // TODO: Enviar email de confirmación
    }
  }

  return Response.json({ received: true });
}
```

---

## Panel Admin Tienda

**Acceso**: roles `super_admin` y `tienda`

### Páginas del panel

| Ruta | Descripción |
|------|-------------|
| `/admin/productos` | CRUD de productos |
| `/admin/productos/nuevo` | Crear producto |
| `/admin/productos/[id]` | Editar producto |
| `/admin/categorias` | Gestión de categorías |
| `/admin/pedidos` | Lista de pedidos (online + POS) |
| `/admin/pedidos/[id]` | Detalle de pedido |
| `/admin/stock` | Vista de stock + movimientos |
| `/admin/pos` | Punto de venta |

### Dashboard de tienda

Widgets resumen:
- Ventas del día (monto + cantidad)
- Pedidos pendientes de retiro
- Productos con stock bajo (< stock_mínimo)
- Gráfico de ventas últimos 30 días

### CRUD Productos

**Crear/Editar producto:**
- Nombre, slug (auto-generado), descripción, descripción corta
- Categoría (select)
- Precio, precio socio (opcional)
- SKU (opcional)
- Stock actual, stock mínimo
- Imágenes (upload múltiple a Supabase Storage, drag to reorder)
- Variantes (tabla editable inline: nombre, SKU, precio override, stock)
- Toggle activo/destacado
- Proveedores asociados (multi-select con costo)

**Validación con Zod:**

```typescript
const productoSchema = z.object({
  nombre: z.string().min(1, "Nombre requerido").max(200),
  descripcion: z.string().optional(),
  descripcion_corta: z.string().max(300).optional(),
  categoria_id: z.number().positive().optional(),
  precio: z.number().positive("Precio debe ser mayor a 0"),
  precio_socio: z.number().positive().optional().nullable(),
  sku: z.string().max(50).optional(),
  stock_actual: z.number().int().min(0),
  stock_minimo: z.number().int().min(0).default(5),
  activo: z.boolean().default(true),
  destacado: z.boolean().default(false),
});
```

### Gestión de Pedidos

**Vista lista:**
- Tabla con: número, fecha, cliente, tipo (online/POS), total, estado
- Filtros: por estado, tipo, rango de fechas
- Búsqueda por número de pedido o nombre cliente

**Vista detalle:**
- Info del cliente (nombre, teléfono, email)
- Items del pedido con cantidades y precios
- Timeline de estados
- Botones de acción según estado:
  - `pagado` → "Marcar como Preparando"
  - `preparando` → "Listo para Retiro"
  - `listo_retiro` → "Retirado" (requiere confirmación)
  - Cualquier estado → "Cancelar" (con motivo, devuelve stock)

### Gestión de Stock

- Vista de todos los productos con stock actual vs. mínimo
- Alertas visuales para stock bajo (< mínimo)
- Historial de movimientos por producto
- Ajuste manual de stock (con motivo obligatorio)
- Cada ajuste crea un registro en `stock_movimientos`

---

## Punto de Venta (POS)

**Ruta**: `/admin/pos`
**Acceso**: roles `super_admin` y `tienda`
**Optimizado para**: tablet y PC (pantalla completa)

### Layout del POS

```
┌──────────────────────────────────────────────────────────┐
│  POS Club Seminario          [Vendedor: María] [Salir]   │
├────────────────────────────────┬─────────────────────────┤
│                                │                         │
│  🔍 Buscar producto...        │   CARRITO               │
│                                │                         │
│  [Cat 1] [Cat 2] [Cat 3]     │   Camiseta M    x1 $1500│
│                                │   Medias        x2  $500│
│  ┌──────┐ ┌──────┐ ┌──────┐  │   ─────────────────────  │
│  │ 📷   │ │ 📷   │ │ 📷   │  │                         │
│  │Camis.│ │Short │ │Medias│  │   Subtotal:      $2.500  │
│  │$1500 │ │$1200 │ │$500  │  │   Descuento socio:  -$0 │
│  │ [+]  │ │ [+]  │ │ [+]  │  │   ─────────────────────  │
│  └──────┘ └──────┘ └──────┘  │   TOTAL:         $2.500  │
│                                │                         │
│  ┌──────┐ ┌──────┐ ┌──────┐  │   ┌─────────────────┐   │
│  │ 📷   │ │ 📷   │ │ 📷   │  │   │  💵 Efectivo    │   │
│  │Gorra │ │Bolso │ │Buzo  │  │   ├─────────────────┤   │
│  │$800  │ │$2000 │ │$3000 │  │   │  📱 MP QR       │   │
│  │ [+]  │ │ [+]  │ │ [+]  │  │   ├─────────────────┤   │
│  └──────┘ └──────┘ └──────┘  │   │  🗑️ Limpiar     │   │
│                                │   └─────────────────┘   │
└────────────────────────────────┴─────────────────────────┘
```

### Funcionalidades del POS

**Panel izquierdo (productos):**
- Barra de búsqueda rápida (busca al escribir)
- Filtro por categoría (botones grandes, touch-friendly)
- Grid de productos con imagen, nombre y precio
- Click/tap para agregar al carrito (+1)
- Indicador de stock en cada producto

**Panel derecho (carrito):**
- Lista de items con cantidad editable (+/-)
- Swipe o botón para eliminar item
- Subtotal y total
- Campo opcional: nombre del cliente (para ventas a no-registrados)
- Campo opcional: buscar socio (por cédula o nombre) para aplicar descuento

**Cobro:**

1. **Efectivo**: Click → Modal de confirmación → Pedido creado como `pagado` → Imprimir recibo (opcional)
2. **MercadoPago QR**: Click → Se genera QR dinámico → Cliente escanea → Webhook confirma → Pedido pagado

### MercadoPago QR para POS

```typescript
// Generar QR dinámico para cobro en POS
async function generarQRPago(pedido: Pedido) {
  const qrData = await mercadopago.payment.createQR({
    external_reference: pedido.numero_pedido,
    title: `Club Seminario - ${pedido.numero_pedido}`,
    total_amount: pedido.total,
    items: pedido.items.map(item => ({
      title: item.nombre,
      unit_price: item.precio_unitario,
      quantity: item.cantidad,
    })),
  });

  return qrData.qr_data; // String para generar imagen QR
}
```

### Flujo completo POS

```
1. Vendedor abre /admin/pos
2. Busca/selecciona productos → se agregan al carrito
3. (Opcional) Busca socio por cédula para descuento
4. Elige método de pago:
   a. Efectivo → confirmar → pedido creado y pagado
   b. MP QR → mostrar QR → esperar webhook → confirmación automática
5. Stock se descuenta inmediatamente
6. Se crea registro en stock_movimientos (tipo: 'venta')
7. Carrito se limpia, listo para siguiente venta
```

---

## Emails Transaccionales (fase 2)

- Confirmación de pedido (con número y detalle)
- Pedido listo para retiro
- Pedido cancelado (con motivo)

Usar Resend o Supabase Edge Functions + plantillas HTML.
