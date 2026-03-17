# Tesorería — Gestión Financiera del Club

## Visión General

Módulo financiero central del club. Maneja multi-cuentas en multi-moneda (UYU/USD), conciliaciones bancarias, categorías de ingresos/egresos, presupuesto, proyecciones, flujo de caja, y cierre mensual. Genera reportes PDF profesionales con gráficos.

**Acceso**: roles `super_admin` y `tesorero`

### Arquitectura de Cuentas

El club tiene **múltiples cuentas** que conviven en el sistema:

```
Cuentas del Club
├── Cuenta Club Principal (UYU)      ← cuenta madre
├── Cuenta Club USD                  ← cuenta madre en dólares
├── Cuenta Tienda (UYU)              ← cuenta separada para tienda
├── Cuenta Tienda MercadoPago        ← lo que entra por MP de la tienda
├── Cuenta Eventos MercadoPago       ← lo que entra por MP de eventos
├── Caja Chica Oficina               ← efectivo físico
└── ... (el tesorero puede crear más)
```

Las ventas de tienda van a la cuenta de tienda. Las cuotas de socios y entradas de eventos van a las cuentas correspondientes. El tesorero puede transferir entre cuentas libremente.

---

## Páginas del Panel

| Ruta | Descripción |
|------|-------------|
| `/tesoreria` | Dashboard financiero principal |
| `/tesoreria/cuentas` | Gestión de cuentas |
| `/tesoreria/cuentas/[id]` | Detalle y movimientos de una cuenta |
| `/tesoreria/movimientos` | Todos los movimientos (cross-account) |
| `/tesoreria/categorias` | Categorías de ingresos/egresos |
| `/tesoreria/transferencias` | Transferencias entre cuentas |
| `/tesoreria/conciliacion` | Conciliación bancaria |
| `/tesoreria/presupuesto` | Presupuesto por categoría |
| `/tesoreria/proyecciones` | Proyecciones financieras |
| `/tesoreria/flujo-caja` | Flujo de caja |
| `/tesoreria/cierres` | Cierres mensuales |
| `/tesoreria/reportes` | Generación de reportes PDF |

---

## Dashboard Financiero (`/tesoreria`)

```
┌──────────────────────────────────────────────────────────────────────┐
│  TESORERÍA                                          [Mar 2026 ▼]    │
│                                                                      │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐           │
│  │ Saldo    │  │ Ingresos │  │ Egresos  │  │ Resultado│           │
│  │ Total    │  │ del mes  │  │ del mes  │  │ del mes  │           │
│  │$485.200  │  │$125.800  │  │ $87.300  │  │ +$38.500 │           │
│  │ UYU      │  │ ▲12%     │  │ ▼5%      │  │ ▲28%     │           │
│  └──────────┘  └──────────┘  └──────────┘  └──────────┘           │
│                                                                      │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │  📊 Ingresos vs Egresos — Últimos 12 meses                 │    │
│  │  [Gráfico de barras agrupadas por mes]                      │    │
│  │  ████ Ingresos   ░░░░ Egresos   ─── Resultado              │    │
│  └─────────────────────────────────────────────────────────────┘    │
│                                                                      │
│  ┌──────────────────────────┐  ┌──────────────────────────────┐    │
│  │  Saldos por Cuenta       │  │  Top Categorías del Mes      │    │
│  │                          │  │                              │    │
│  │  Club Principal  $250.000│  │  Cuotas socios    +$65.000  │    │
│  │  Club USD        U$1.200 │  │  Ventas tienda    +$38.500  │    │
│  │  Tienda UYU       $45.000│  │  Entradas eventos +$22.300  │    │
│  │  Tienda MP        $82.000│  │  ──────────────────────────  │    │
│  │  Eventos MP       $35.200│  │  Sueldos          -$45.000  │    │
│  │  Caja Chica       $12.000│  │  Proveedores      -$28.000  │    │
│  │  ─── Total UYU ──────── │  │  Servicios        -$14.300  │    │
│  │  $424.200 + U$1.200      │  │                              │    │
│  └──────────────────────────┘  └──────────────────────────────┘    │
│                                                                      │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │  🔮 Proyección próximos 3 meses                             │    │
│  │  [Gráfico de línea con banda de confianza]                  │    │
│  │  Abr: +$32.000  |  May: +$28.000  |  Jun: +$15.000         │    │
│  └─────────────────────────────────────────────────────────────┘    │
│                                                                      │
│  ── Accesos rápidos ──                                              │
│  [+ Movimiento]  [Conciliar]  [Ver presupuesto]  [Generar reporte] │
└──────────────────────────────────────────────────────────────────────┘
```

**Widgets con animaciones:**
- Stats cards con count-up al cargar y cambios porcentuales animados
- Gráficos con animación de entrada (recharts nativo)
- Saldos por cuenta con barras de progreso animadas
- Proyección con línea que se dibuja progresivamente

---

## Gestión de Cuentas (`/tesoreria/cuentas`)

### Tipos de Cuenta

| Tipo | Descripción |
|------|-------------|
| `bancaria` | Cuenta bancaria real (Itaú, BROU, etc.) |
| `mercadopago` | Cuenta de MercadoPago |
| `caja_chica` | Efectivo físico |
| `virtual` | Cuenta interna de control |

### CRUD de Cuentas

```typescript
const cuentaSchema = z.object({
  nombre: z.string().min(1).max(200),
  tipo: z.enum(["bancaria", "mercadopago", "caja_chica", "virtual"]),
  moneda: z.enum(["UYU", "USD"]),
  banco: z.string().max(100).optional(), // "Itaú", "BROU", etc.
  numero_cuenta: z.string().max(50).optional(),
  saldo_inicial: z.number().default(0),
  descripcion: z.string().optional(),
  color: z.string().max(7).optional(), // hex color para UI
  activa: z.boolean().default(true),
});
```

### Detalle de Cuenta (`/tesoreria/cuentas/[id]`)

- Info de la cuenta (nombre, banco, número, moneda)
- **Saldo actual** con count-up animation
- Gráfico de evolución del saldo (línea temporal)
- Tabla de movimientos de la cuenta con filtros:
  - Rango de fechas
  - Tipo (ingreso/egreso)
  - Categoría
  - Estado de conciliación (conciliado/pendiente)
- Botón "+ Movimiento" para registrar manualmente
- Botón "Conciliar" para iniciar conciliación

### Caja Chica

La caja chica es una cuenta de tipo `caja_chica` con funcionalidades extra:

- **Apertura de caja**: registrar monto inicial del día
- **Cierre/Arqueo**: registrar monto final, el sistema calcula diferencia
- **Retiro a caja chica**: transferencia desde otra cuenta a caja chica
- **Depósito de caja chica**: transferencia desde caja chica a cuenta bancaria

```
┌─────────────────────────────────────┐
│  CAJA CHICA — Oficina               │
│  Saldo: $12.000                     │
│                                     │
│  Último arqueo: 14/03/2026          │
│  Resultado: ✅ Sin diferencia       │
│                                     │
│  [Registrar gasto] [Arqueo] [Depósito a banco]
└─────────────────────────────────────┘
```

---

## Movimientos Financieros (`/tesoreria/movimientos`)

### Estructura de un Movimiento

```typescript
const movimientoSchema = z.object({
  cuenta_id: z.number().positive(),
  tipo: z.enum(["ingreso", "egreso"]),
  categoria_id: z.number().positive(),
  subcategoria_id: z.number().optional(),
  monto: z.number().positive(),
  moneda: z.enum(["UYU", "USD"]),
  fecha: z.string().date(),
  descripcion: z.string().min(1).max(500),
  comprobante_url: z.string().optional(), // foto/PDF del comprobante
  referencia: z.string().optional(), // nro de factura, recibo, etc.
  origen_tipo: z.string().optional(), // 'pedido', 'cuota', 'entrada', 'manual', 'transferencia'
  origen_id: z.number().optional(),
  notas: z.string().optional(),
});
```

### Orígenes Automáticos

Los módulos existentes generan movimientos automáticamente:

| Módulo | Evento | Cuenta destino | Categoría auto |
|--------|--------|----------------|----------------|
| Tienda (online) | Pago MP aprobado | Cuenta Tienda MP | "Ventas tienda" |
| Tienda (POS efectivo) | Venta POS | Caja Chica | "Ventas tienda" |
| Tienda (POS MP QR) | Pago QR aprobado | Cuenta Tienda MP | "Ventas tienda" |
| Secretaría | Cuota registrada | Según método pago | "Cuotas socios" |
| Eventos | Entrada pagada MP | Cuenta Eventos MP | "Entradas eventos" |
| Eventos | Entrada efectivo | Caja Chica | "Entradas eventos" |
| Proveedores | Pago a proveedor | Según método pago | "Compras proveedores" |

**Implementación**: cada módulo emite un evento (via función helper o Supabase trigger) que crea el movimiento en tesorería automáticamente.

```typescript
// src/lib/tesoreria/registrar-movimiento.ts
export async function registrarMovimientoAutomatico({
  cuenta_id,
  tipo,
  categoria_slug,
  monto,
  moneda = "UYU",
  descripcion,
  origen_tipo,
  origen_id,
}: MovimientoAutoParams) {
  const supabase = createServerClient();

  // Buscar categoría por slug
  const { data: categoria } = await supabase
    .from("categorias_financieras")
    .select("id")
    .eq("slug", categoria_slug)
    .single();

  // Crear movimiento
  const { data: movimiento } = await supabase
    .from("movimientos_financieros")
    .insert({
      cuenta_id,
      tipo,
      categoria_id: categoria.id,
      monto,
      moneda,
      fecha: new Date().toISOString().split("T")[0],
      descripcion,
      origen_tipo,
      origen_id,
      conciliado: tipo === "ingreso" && origen_tipo?.includes("mercadopago"),
      registrado_por: null, // automático
    })
    .select()
    .single();

  // Actualizar saldo de la cuenta
  const delta = tipo === "ingreso" ? monto : -monto;
  await supabase.rpc("actualizar_saldo_cuenta", {
    p_cuenta_id: cuenta_id,
    p_delta: delta,
  });

  return movimiento;
}
```

### Vista de Movimientos

```
┌──────────────────────────────────────────────────────────────────────┐
│  MOVIMIENTOS                          [+ Nuevo movimiento]           │
│                                                                      │
│  Cuenta: [Todas ▼]  Tipo: [Todos ▼]  Categoría: [Todas ▼]         │
│  Desde: [01/03/2026]  Hasta: [31/03/2026]   [🔍 Buscar...]        │
│                                                                      │
│  ┌────────────────────────────────────────────────────────────┐     │
│  │ Fecha    │ Descripción        │ Cuenta    │ Cat.    │ Monto│     │
│  ├────────────────────────────────────────────────────────────┤     │
│  │ 14/03/26 │ Venta POS #CS-042  │ Caja Chica│ Ventas  │+$3.200│   │
│  │ 14/03/26 │ Compra insumos     │ Club Ppal │ Compras │-$8.500│   │
│  │ 13/03/26 │ Cuota Mar - García │ Club Ppal │ Cuotas  │  +$480│   │
│  │ 13/03/26 │ Pago luz oficina   │ Club Ppal │ Servicios│-$2.100│  │
│  │ 12/03/26 │ Entrada evento #45 │ Eventos MP│ Entradas│+$1.500│   │
│  │ 12/03/26 │ Transf. interna    │ Tienda→Club│ Transf.│$45.000│   │
│  └────────────────────────────────────────────────────────────┘     │
│                                                                      │
│  Ingresos: $125.800  |  Egresos: $87.300  |  Neto: +$38.500        │
│  [Exportar CSV]  [Exportar PDF]                                      │
└──────────────────────────────────────────────────────────────────────┘
```

---

## Categorías Financieras (`/tesoreria/categorias`)

Sistema jerárquico de categorías para clasificar ingresos y egresos. Las crea y administra el tesorero.

### Estructura

```
Ingresos
├── Cuotas de socios
│   ├── Cuota colaborador
│   └── Cuota deportivo
├── Ventas tienda
│   ├── Ventas online
│   └── Ventas POS
├── Entradas eventos
├── Donaciones
├── Sponsors
│   ├── Sponsors principales
│   └── Sponsors secundarios
├── Alquiler de instalaciones
└── Otros ingresos

Egresos
├── Compras proveedores
│   ├── Mercadería tienda
│   └── Insumos deportivos
├── Servicios
│   ├── Luz
│   ├── Agua
│   ├── Internet
│   └── Teléfono
├── Sueldos y honorarios
├── Alquiler canchas
├── Mantenimiento
├── Transporte
├── Seguros
├── Impuestos y tasas
├── Eventos (gastos)
│   ├── Logística
│   ├── Sonido/iluminación
│   └── Catering
├── Marketing y comunicación
└── Otros egresos
```

### CRUD de Categorías

```typescript
const categoriaFinancieraSchema = z.object({
  nombre: z.string().min(1).max(100),
  slug: z.string().min(1).max(100),
  tipo: z.enum(["ingreso", "egreso"]),
  padre_id: z.number().optional(), // para subcategorías
  color: z.string().max(7).optional(), // hex para gráficos
  icono: z.string().max(50).optional(), // nombre del icono Lucide
  presupuesto_mensual: z.number().optional(), // monto esperado por mes
  activa: z.boolean().default(true),
});
```

**UI**: Vista de árbol drag & drop para reordenar. Cada categoría con color e ícono para identificación rápida en gráficos.

---

## Transferencias Entre Cuentas (`/tesoreria/transferencias`)

Mover dinero entre cuentas del club.

```typescript
const transferenciaSchema = z.object({
  cuenta_origen_id: z.number().positive(),
  cuenta_destino_id: z.number().positive(),
  monto: z.number().positive(),
  moneda: z.enum(["UYU", "USD"]),
  tipo_cambio: z.number().optional(), // si es conversión UYU↔USD
  fecha: z.string().date(),
  descripcion: z.string().min(1),
  comprobante_url: z.string().optional(),
});
```

**Al ejecutar una transferencia:**
1. Se crea un movimiento tipo `egreso` en la cuenta origen (categoría: "Transferencia interna")
2. Se crea un movimiento tipo `ingreso` en la cuenta destino (categoría: "Transferencia interna")
3. Ambos movimientos se vinculan entre sí (`transferencia_id`)
4. Se actualizan saldos de ambas cuentas
5. Si las monedas son diferentes (UYU→USD o viceversa), se registra el tipo de cambio usado

```
┌─────────────────────────────────────┐
│  NUEVA TRANSFERENCIA                │
│                                     │
│  Desde: [Tienda MP ▼]    $82.000   │
│  Hacia: [Club Principal ▼] $250.000│
│                                     │
│  Monto: [$45.000      ]            │
│  Moneda: [UYU ▼]                   │
│                                     │
│  Descripción: [Recaudación tienda  ]│
│  Fecha: [14/03/2026]               │
│  Comprobante: [📎 Subir archivo]   │
│                                     │
│  [Cancelar]  [Transferir]           │
└─────────────────────────────────────┘
```

---

## Conciliación Bancaria (`/tesoreria/conciliacion`)

Proceso para verificar que los movimientos registrados en el sistema coinciden con los del banco.

### Flujo de Conciliación

```
1. Tesorero selecciona cuenta bancaria y período
2. Sube extracto del banco (CSV o Excel)
3. Sistema parsea el archivo y lista los movimientos del banco
4. Sistema intenta matchear automáticamente (por monto + fecha ± 2 días)
5. Tesorero revisa matches, confirma o corrige manualmente
6. Movimientos sin match del banco → "pendientes de registro" (crear movimiento)
7. Movimientos sin match del sistema → "pendientes de conciliación" (buscar en banco)
8. Al finalizar, se marca el período como conciliado
```

### UI de Conciliación

```
┌──────────────────────────────────────────────────────────────────────┐
│  CONCILIACIÓN — Cuenta Club Principal — Marzo 2026                   │
│                                                                      │
│  📄 Extracto: [extracto_marzo_2026.csv]  [Subir nuevo]              │
│                                                                      │
│  Saldo banco: $252.340   |   Saldo sistema: $250.000                │
│  Diferencia: $2.340 ⚠️                                              │
│                                                                      │
│  ── MATCHEADOS AUTOMÁTICAMENTE (12) ──              [✅ Confirmar todos]│
│  ┌────────────────────────────────────────────────────────────┐     │
│  │ Sistema              │ Banco                │ Estado       │     │
│  ├────────────────────────────────────────────────────────────┤     │
│  │ 01/03 Cuota +$480    │ 01/03 TRF +$480     │ ✅ Match    │     │
│  │ 03/03 Luz -$2.100    │ 03/03 DEB -$2.100   │ ✅ Match    │     │
│  │ ...                  │ ...                   │             │     │
│  └────────────────────────────────────────────────────────────┘     │
│                                                                      │
│  ── SIN MATCH EN SISTEMA (2) ──    (movimientos del banco sin par)  │
│  ┌────────────────────────────────────────────────────────────┐     │
│  │ 10/03 TRF RECIBIDA +$1.800   │ [Crear movimiento] [Ignorar]│    │
│  │ 15/03 COMISION BCO -$540      │ [Crear movimiento] [Ignorar]│    │
│  └────────────────────────────────────────────────────────────┘     │
│                                                                      │
│  ── SIN MATCH EN BANCO (1) ──     (movimientos del sistema sin par) │
│  ┌────────────────────────────────────────────────────────────┐     │
│  │ 12/03 Pago proveedor -$8.500  │ [Buscar en banco] [Posponer]│   │
│  └────────────────────────────────────────────────────────────┘     │
│                                                                      │
│  [Cancelar]                          [Finalizar conciliación]        │
└──────────────────────────────────────────────────────────────────────┘
```

### Parseo de Extracto Bancario

```typescript
// src/lib/tesoreria/parsear-extracto.ts

interface MovimientoBanco {
  fecha: string;
  descripcion: string;
  monto: number;
  tipo: "ingreso" | "egreso";
  referencia?: string;
}

export function parsearExtractoCSV(csv: string, formato: string): MovimientoBanco[] {
  // Soportar formatos comunes de bancos uruguayos
  // BROU, Itaú, Santander, Scotiabank
  // Cada banco tiene su formato de CSV
  // El tesorero elige el formato al subir
}

export function matchearMovimientos(
  sistemaMovs: Movimiento[],
  bancoMovs: MovimientoBanco[],
  toleranciaDias: number = 2
): {
  matched: Array<{ sistema: Movimiento; banco: MovimientoBanco }>;
  sinMatchSistema: Movimiento[];
  sinMatchBanco: MovimientoBanco[];
} {
  // Algoritmo de matching:
  // 1. Match exacto: mismo monto + misma fecha
  // 2. Match aproximado: mismo monto + fecha ± toleranciaDias
  // 3. Lo que queda sin match va a las listas respectivas
}
```

---

## Presupuesto (`/tesoreria/presupuesto`)

El tesorero define un presupuesto mensual por categoría. El sistema compara lo real vs. lo presupuestado.

### Estructura

```typescript
const presupuestoSchema = z.object({
  anio: z.number().min(2024),
  mes: z.number().min(1).max(12),
  categoria_id: z.number().positive(),
  monto_presupuestado: z.number(),
  notas: z.string().optional(),
});
```

### UI de Presupuesto

```
┌──────────────────────────────────────────────────────────────────────┐
│  PRESUPUESTO 2026                    [Año: 2026 ▼]  [Copiar de 2025]│
│                                                                      │
│  Vista: [Mensual] [Anual acumulado]                                 │
│  Mes: [◀ Marzo 2026 ▶]                                             │
│                                                                      │
│  ── INGRESOS ──                                                     │
│  ┌────────────────────────────────────────────────────────────┐     │
│  │ Categoría          │ Presup. │ Real    │ Dif.    │ %      │     │
│  ├────────────────────────────────────────────────────────────┤     │
│  │ Cuotas socios      │ $70.000 │ $65.000 │ -$5.000 │  93%  │     │
│  │ Ventas tienda      │ $40.000 │ $38.500 │ -$1.500 │  96%  │     │
│  │ Entradas eventos   │ $25.000 │ $22.300 │ -$2.700 │  89%  │     │
│  │ Sponsors           │ $15.000 │ $15.000 │      $0 │ 100%  │     │
│  │ Otros              │  $5.000 │  $3.200 │ -$1.800 │  64%  │     │
│  ├────────────────────────────────────────────────────────────┤     │
│  │ TOTAL INGRESOS     │$155.000 │$144.000 │-$11.000 │  93%  │     │
│  └────────────────────────────────────────────────────────────┘     │
│                                                                      │
│  ── EGRESOS ──                                                      │
│  ┌────────────────────────────────────────────────────────────┐     │
│  │ Categoría          │ Presup. │ Real    │ Dif.    │ %      │     │
│  ├────────────────────────────────────────────────────────────┤     │
│  │ Sueldos            │ $45.000 │ $45.000 │      $0 │ 100%  │     │
│  │ Compras proveed.   │ $30.000 │ $28.000 │ +$2.000 │  93%  │     │
│  │ Servicios          │ $18.000 │ $14.300 │ +$3.700 │  79%  │     │
│  │ Alquiler canchas   │ $12.000 │ $12.000 │      $0 │ 100%  │     │
│  │ Otros              │ $10.000 │  $5.500 │ +$4.500 │  55%  │     │
│  ├────────────────────────────────────────────────────────────┤     │
│  │ TOTAL EGRESOS      │$115.000 │$104.800 │+$10.200 │  91%  │     │
│  └────────────────────────────────────────────────────────────┘     │
│                                                                      │
│  ══ RESULTADO ════════════════════════════════════════════════       │
│  Presupuestado: +$40.000  |  Real: +$39.200  |  Desvío: -$800      │
│                                                                      │
│  [📊 Gráfico comparativo]                                           │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │  [Gráfico de barras: presupuesto vs real por categoría]     │    │
│  │  Barras dobles: gris (presup.) + color (real)               │    │
│  │  Rojo si real > presup. en egresos                          │    │
│  │  Verde si real > presup. en ingresos                        │    │
│  └─────────────────────────────────────────────────────────────┘    │
│                                                                      │
│  [Editar presupuesto]  [Exportar PDF]                                │
└──────────────────────────────────────────────────────────────────────┘
```

**Funcionalidades:**
- Edición inline de montos presupuestados (click en celda para editar)
- "Copiar de mes/año anterior" para no arrancar de cero
- Vista mensual y anual acumulada
- Progress bars animadas por categoría (% de ejecución)
- Barras rojas cuando el egreso real supera el presupuesto
- Barras verdes cuando el ingreso real supera el presupuesto

---

## Proyecciones Financieras (`/tesoreria/proyecciones`)

Proyecta el futuro financiero del club basándose en datos históricos, presupuesto y tendencias.

### Métodos de Proyección

1. **Basado en presupuesto**: usa los montos presupuestados para meses futuros
2. **Basado en promedio histórico**: promedio de los últimos 3/6/12 meses por categoría
3. **Basado en tendencia**: regresión lineal sobre los últimos 12 meses
4. **Mixto (recomendado)**: presupuesto donde existe, promedio histórico donde no

### UI de Proyecciones

```
┌──────────────────────────────────────────────────────────────────────┐
│  PROYECCIONES FINANCIERAS                                            │
│                                                                      │
│  Período: [Próximos 12 meses ▼]   Método: [Mixto ▼]               │
│                                                                      │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │  📈 Evolución del Saldo Total Proyectado                    │    │
│  │                                                              │    │
│  │  [Gráfico de línea]                                         │    │
│  │  ─── Histórico (sólido)                                     │    │
│  │  - - - Proyectado (punteado)                                │    │
│  │  ░░░ Banda de confianza (±15%)                              │    │
│  │                                                              │    │
│  │  $500k ┤                          ╱- - - -                  │    │
│  │  $450k ┤                    ╱─────╱                         │    │
│  │  $400k ┤              ╱─────                                │    │
│  │  $350k ┤        ╱─────                                      │    │
│  │  $300k ┤──╱─────                                            │    │
│  │        └──┬──┬──┬──┬──┬──┬──┬──┬──┬──┬──┬──┬──┬──┬──┬──   │    │
│  │          Oct Nov Dic Ene Feb Mar Abr May Jun Jul Ago Sep    │    │
│  │              histórico          │       proyectado          │    │
│  └─────────────────────────────────────────────────────────────┘    │
│                                                                      │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │  📊 Proyección por Categoría                                │    │
│  │                                                              │    │
│  │  Categoría          │ Abr    │ May    │ Jun    │ ...  │ Total│   │
│  │  ──────────────────────────────────────────────────────────  │    │
│  │  Cuotas socios      │ $68.000│ $68.000│ $55.000│      │      │   │
│  │  Ventas tienda      │ $42.000│ $38.000│ $35.000│      │      │   │
│  │  Sueldos            │-$45.000│-$45.000│-$45.000│      │      │   │
│  │  ...                │        │        │        │      │      │   │
│  │  ──────────────────────────────────────────────────────────  │    │
│  │  NETO MENSUAL       │+$32.000│+$28.000│+$15.000│      │      │   │
│  │  SALDO ACUMULADO    │$457.200│$485.200│$500.200│      │      │   │
│  └─────────────────────────────────────────────────────────────┘    │
│                                                                      │
│  ── Escenarios ──                                                   │
│  [Optimista (+20%)]  [Base (actual)]  [Pesimista (-20%)]            │
│                                                                      │
│  [Exportar PDF]  [Exportar Excel]                                    │
└──────────────────────────────────────────────────────────────────────┘
```

**Funcionalidades:**
- Gráfico interactivo con tooltip al hover
- Banda de confianza (area chart semitransparente)
- 3 escenarios: optimista, base, pesimista (con slider para ajustar %)
- Tabla detallada por categoría y mes
- La línea de proyección se "dibuja" con animación al cargar
- Exportable a PDF con gráficos y tablas

---

## Flujo de Caja (`/tesoreria/flujo-caja`)

Vista de cómo queda "parado" el club mes a mes según sus ingresos y egresos.

### UI

```
┌──────────────────────────────────────────────────────────────────────┐
│  FLUJO DE CAJA 2026                                                  │
│                                                                      │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │  [Gráfico waterfall / cascada]                              │    │
│  │                                                              │    │
│  │  Cada mes es una barra:                                     │    │
│  │  - Verde arriba = ingresos                                  │    │
│  │  - Rojo abajo = egresos                                     │    │
│  │  - Línea conectora = saldo resultante                       │    │
│  │                                                              │    │
│  │  $500k ┤     ┌─┐                    ┌─┐                     │    │
│  │  $450k ┤  ┌─┐│ │  ┌─┐           ┌─┐│ │                     │    │
│  │  $400k ┤  │ ││ │  │ │  ┌─┐  ┌─┐│ ││ │                     │    │
│  │  $350k ┤──│ ││ │──│ │──│ │──│ ││ ││ │──                    │    │
│  │        └──┴─┴┴─┴──┴─┴──┴─┴──┴─┴┴─┴┴─┴──                  │    │
│  │          Ene  Feb  Mar  Abr  May  Jun                       │    │
│  └─────────────────────────────────────────────────────────────┘    │
│                                                                      │
│  ┌────────────────────────────────────────────────────────────┐     │
│  │ Mes     │ Saldo ini.│ Ingresos │ Egresos  │ Neto   │ Saldo│     │
│  ├────────────────────────────────────────────────────────────┤     │
│  │ Ene 26  │ $320.000  │ $130.000 │ $105.000 │+$25.000│$345k │     │
│  │ Feb 26  │ $345.000  │ $128.000 │ $110.000 │+$18.000│$363k │     │
│  │ Mar 26  │ $363.000  │ $144.000 │ $104.800 │+$39.200│$402k │     │
│  │ Abr 26* │ $402.200  │ $135.000 │ $103.000 │+$32.000│$434k │     │
│  │ May 26* │ $434.200  │ $130.000 │ $102.000 │+$28.000│$462k │     │
│  │ ...     │           │          │          │        │      │     │
│  └────────────────────────────────────────────────────────────┘     │
│  * = proyectado                                                      │
│                                                                      │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │  📊 Distribución de Ingresos (Marzo 2026)                   │    │
│  │  [Gráfico de torta / donut animado]                         │    │
│  │  42% Cuotas | 27% Tienda | 15% Eventos | 10% Sponsors | 6% Otro│ │
│  └─────────────────────────────────────────────────────────────┘    │
│                                                                      │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │  📊 Distribución de Egresos (Marzo 2026)                    │    │
│  │  [Gráfico de torta / donut animado]                         │    │
│  │  43% Sueldos | 27% Proveedores | 14% Servicios | 11% Alq. | 5%│ │
│  └─────────────────────────────────────────────────────────────┘    │
│                                                                      │
│  [Exportar PDF]                                                      │
└──────────────────────────────────────────────────────────────────────┘
```

---

## Cierre Mensual (`/tesoreria/cierres`)

Al finalizar un mes, el tesorero lo "cierra" formalmente. Esto:
1. **Bloquea la edición** de movimientos de ese período
2. **Genera snapshot** del estado financiero (saldos, totales por categoría)
3. **Registra** quién cerró y cuándo

### Flujo

```
1. Tesorero abre /tesoreria/cierres
2. Ve meses pendientes de cierre
3. Selecciona mes → ve resumen: ingresos, egresos, resultado, saldos por cuenta
4. Verifica que todo está correcto (conciliación hecha, sin movimientos pendientes)
5. Click "Cerrar mes" → confirmación
6. El mes queda bloqueado (movimientos no editables)
7. Se genera PDF automático del cierre
```

### Estructura de Cierre

```typescript
const cierreSchema = z.object({
  anio: z.number(),
  mes: z.number().min(1).max(12),
  total_ingresos: z.number(),
  total_egresos: z.number(),
  resultado: z.number(),
  saldos_snapshot: z.record(z.number()), // { cuenta_id: saldo }
  estado: z.enum(["abierto", "cerrado"]),
  cerrado_por: z.string().uuid().optional(),
  cerrado_at: z.string().datetime().optional(),
  notas: z.string().optional(),
});
```

**Protección:** Si un período está cerrado, cualquier intento de crear/editar/eliminar movimientos de ese período se rechaza tanto en frontend como en RLS:

```sql
-- RLS policy: no modificar movimientos de períodos cerrados
CREATE POLICY "No editar movimientos cerrados"
  ON movimientos_financieros
  FOR UPDATE
  USING (
    NOT EXISTS (
      SELECT 1 FROM cierres_mensuales
      WHERE estado = 'cerrado'
      AND anio = EXTRACT(YEAR FROM movimientos_financieros.fecha)
      AND mes = EXTRACT(MONTH FROM movimientos_financieros.fecha)
    )
  );
```

---

## Reportes PDF (`/tesoreria/reportes`)

Generación de PDFs profesionales con branding del club.

### Tipos de Reporte

| Reporte | Contenido |
|---------|-----------|
| **Estado de Resultados** | Ingresos y egresos por categoría del período. Resultado neto. Comparación con período anterior. |
| **Flujo de Caja** | Tabla mes a mes + gráfico waterfall. Saldo inicial, movimientos, saldo final. |
| **Balance por Cuenta** | Saldo y movimientos de cada cuenta. Gráfico de distribución. |
| **Presupuesto vs Real** | Tabla comparativa + gráfico de barras dobles. Desvíos por categoría. |
| **Proyección** | Tabla de proyección a 12 meses + gráfico con escenarios. |
| **Cierre Mensual** | Resumen completo del mes: resultados, saldos, movimientos destacados. |
| **Informe de Conciliación** | Estado de conciliación por cuenta, movimientos pendientes. |

### Diseño del PDF

```
┌──────────────────────────────────────┐
│  [Logo Club]   CLUB SEMINARIO        │
│               Estado de Resultados   │
│               Marzo 2026             │
│                                      │
│  ─────────────────────────────────── │
│                                      │
│  INGRESOS                            │
│  Cuotas de socios........... $65.000 │
│  Ventas tienda.............. $38.500 │
│  Entradas eventos........... $22.300 │
│  Sponsors................... $15.000 │
│  Otros ingresos.............. $3.200 │
│  TOTAL INGRESOS............ $144.000 │
│                                      │
│  EGRESOS                             │
│  Sueldos y honorarios....... $45.000 │
│  Compras proveedores........ $28.000 │
│  Servicios.................. $14.300 │
│  ...                                 │
│  TOTAL EGRESOS............. $104.800 │
│                                      │
│  ═══════════════════════════════════ │
│  RESULTADO NETO............ +$39.200 │
│                                      │
│  [Gráfico de barras incrustado]      │
│                                      │
│  ─────────────────────────────────── │
│  Generado: 17/03/2026 14:30         │
│  Club Seminario — Tesorería          │
└──────────────────────────────────────┘
```

**Implementación:** Usar librería de generación de PDF server-side (ej: `@react-pdf/renderer` o `puppeteer` para renderizar HTML → PDF).

---

## Ideas Adicionales

### 1. Tipo de Cambio USD/UYU
- Widget en el dashboard con tipo de cambio actual (consultar API del BCU o similar)
- Al registrar movimientos en USD, guardar tipo de cambio del día
- Vista de saldos totales convertidos a una moneda base

### 2. Comprobantes Digitales
- Upload de foto/PDF del comprobante por cada movimiento
- Almacenados en Supabase Storage bucket `comprobantes/`
- Visor inline en el detalle del movimiento

### 3. Tags/Etiquetas en Movimientos
- Además de categoría, poder agregar tags libres (ej: "torneo-2026", "sponsor-itau", "mantenimiento-cupra")
- Filtrar y agrupar por tags
- Útil para tracking de gastos por proyecto/evento específico

### 4. Dashboard Comparativo
- Comparar cualquier período con otro (ej: Marzo 2026 vs Marzo 2025)
- Gráfico side-by-side
- Variación porcentual por categoría

### 5. Resumen para Memoria Anual
- Generar automáticamente las tablas financieras para la memoria anual del club
- Exportable como sección del PDF de memoria
