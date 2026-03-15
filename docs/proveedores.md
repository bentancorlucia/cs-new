# Gestión de Proveedores

## Visión General

Sistema completo de gestión de proveedores con:
- CRUD de proveedores
- Registro de compras con items
- Recepción de mercadería (actualiza stock)
- Pagos a proveedores (parciales y totales)
- Cuentas corrientes con balance de deuda
- Reportes de gastos

**Acceso**: roles `super_admin` y `tienda`

---

## Páginas

| Ruta | Descripción |
|------|-------------|
| `/admin/proveedores` | Lista de proveedores |
| `/admin/proveedores/nuevo` | Alta de proveedor |
| `/admin/proveedores/[id]` | Ficha del proveedor |
| `/admin/proveedores/[id]/compras` | Compras del proveedor |
| `/admin/compras` | Todas las compras |
| `/admin/compras/nueva` | Nueva compra |
| `/admin/compras/[id]` | Detalle de compra |

---

## CRUD de Proveedores

### Lista (`/admin/proveedores`)

```
┌──────────────────────────────────────────────────────────┐
│  PROVEEDORES                      [+ Nuevo proveedor]    │
│                                                          │
│  🔍 Buscar...                                           │
│                                                          │
│  ┌──────────────────────────────────────────────────┐   │
│  │ Nombre     │ RUT        │ Saldo CC    │ Estado  │   │
│  ├──────────────────────────────────────────────────┤   │
│  │ TextilUY   │ 21.456.789 │ $12.500 ⬆  │ Activo │   │
│  │ Deportes+  │ 21.789.012 │ $0          │ Activo │   │
│  │ Imprenta X │ 21.234.567 │ $3.200 ⬆   │ Activo │   │
│  └──────────────────────────────────────────────────┘   │
│                                                          │
│  Saldo CC ⬆ = le debemos al proveedor                  │
└──────────────────────────────────────────────────────────┘
```

### Formulario de Proveedor

```typescript
const proveedorSchema = z.object({
  nombre: z.string().min(1, "Nombre requerido").max(200),
  rut: z.string().max(20).optional(),
  razon_social: z.string().max(200).optional(),
  contacto_nombre: z.string().max(100).optional(),
  contacto_telefono: z.string().max(20).optional(),
  contacto_email: z.string().email().optional().or(z.literal("")),
  direccion: z.string().optional(),
  notas: z.string().optional(),
});
```

---

## Ficha del Proveedor (`/admin/proveedores/[id]`)

```
┌──────────────────────────────────────────────────────────┐
│  ← Volver                                    [Editar]    │
│                                                          │
│  🏢 TextilUY S.A.                                       │
│  RUT: 21.456.789-001                                     │
│                                                          │
│  ─── Contacto ───                                       │
│  Persona: Roberto Martínez                               │
│  Tel: 099 888 777                                        │
│  Email: ventas@textiluy.com                              │
│  Dirección: Av. Italia 3456, Montevideo                  │
│                                                          │
│  ─── Cuenta Corriente ───                               │
│  ┌────────────────────────────────────────┐             │
│  │        SALDO: $12.500                  │             │
│  │        (le debemos)                    │             │
│  │                                        │             │
│  │  [Registrar pago]  [Ver movimientos]   │             │
│  └────────────────────────────────────────┘             │
│                                                          │
│  ─── Productos que suministra ───                       │
│  • Camiseta Oficial (costo: $800) — Principal           │
│  • Short entrenamiento (costo: $450)                     │
│  • Medias deportivas (costo: $150) — Principal          │
│                                                          │
│  ─── Últimas Compras ───                                │
│  ┌────────────────────────────────────────────┐         │
│  │ Número     │ Fecha    │ Total   │ Estado  │         │
│  ├────────────────────────────────────────────┤         │
│  │ CMP-001    │ 10/03/26 │ $25.000 │ Recibida│         │
│  │ CMP-002    │ 01/03/26 │ $12.500 │ Confirm.│         │
│  └────────────────────────────────────────────┘         │
│                              [Ver todas] [+ Nueva compra]│
│                                                          │
│  ─── Historial de Pagos ───                             │
│  ┌────────────────────────────────────────────┐         │
│  │ Fecha    │ Monto    │ Método     │ Ref.   │         │
│  ├────────────────────────────────────────────┤         │
│  │ 12/03/26 │ $15.000  │ Transfer.  │ TX-456 │         │
│  │ 28/02/26 │ $10.000  │ Cheque     │ CH-123 │         │
│  └────────────────────────────────────────────┘         │
│                                      [+ Registrar pago]  │
└──────────────────────────────────────────────────────────┘
```

---

## Compras

### Flujo de una Compra

```
BORRADOR → CONFIRMADA → RECIBIDA
                    ↘ CANCELADA
```

1. **Borrador**: Se crea la compra con items. No afecta nada aún.
2. **Confirmar**: Se suma el total a la cuenta corriente del proveedor (deuda). No mueve stock.
3. **Recibir**: Se recibe la mercadería. Se actualiza el stock de cada producto. Se registra en `stock_movimientos`.
4. **Cancelar**: Si estaba confirmada, se revierte la deuda en la cuenta corriente.

### Crear Compra (`/admin/compras/nueva`)

```
┌──────────────────────────────────────────────────────────┐
│  NUEVA COMPRA                                            │
│                                                          │
│  Proveedor: [▼ Seleccionar proveedor         ]          │
│  Fecha: [14/03/2026]                                     │
│  Notas: [                                    ]           │
│                                                          │
│  ─── Items ───                            [+ Agregar]   │
│  ┌──────────────────────────────────────────────────┐   │
│  │ Producto          │ Cantidad │ Costo U. │ Subtot.│   │
│  ├──────────────────────────────────────────────────┤   │
│  │ Camiseta Oficial  │ 50       │ $800     │ $40.000│   │
│  │ Short entren.     │ 30       │ $450     │ $13.500│   │
│  │ Medias deportivas │ 100      │ $150     │ $15.000│   │
│  └──────────────────────────────────────────────────┘   │
│                                                          │
│  Subtotal:   $68.500                                     │
│  Impuestos:  $0                                          │
│  TOTAL:      $68.500                                     │
│                                                          │
│  [Guardar borrador]  [Confirmar compra]                  │
└──────────────────────────────────────────────────────────┘
```

**Al seleccionar proveedor**: se filtran los productos asociados a ese proveedor para facilitar la selección, pero se puede agregar cualquier producto.

**Validación:**

```typescript
const compraSchema = z.object({
  proveedor_id: z.number().positive("Seleccionar proveedor"),
  fecha_compra: z.string().date(),
  notas: z.string().optional(),
  items: z.array(z.object({
    producto_id: z.number().positive(),
    variante_id: z.number().optional(),
    cantidad: z.number().int().positive("Cantidad debe ser mayor a 0"),
    costo_unitario: z.number().positive("Costo debe ser mayor a 0"),
  })).min(1, "Agregar al menos un item"),
});
```

### Recepción de Mercadería

Al marcar una compra como "Recibida":

```typescript
async function recibirCompra(compraId: number, userId: string) {
  const { data: compra } = await supabase
    .from("compras_proveedor")
    .select("*, compra_items(*)")
    .eq("id", compraId)
    .single();

  // Para cada item, actualizar stock
  for (const item of compra.compra_items) {
    const tabla = item.variante_id ? "producto_variantes" : "productos";
    const id = item.variante_id || item.producto_id;

    // Obtener stock actual
    const { data: producto } = await supabase
      .from(tabla)
      .select("stock_actual")
      .eq("id", id)
      .single();

    const nuevoStock = producto.stock_actual + item.cantidad;

    // Actualizar stock
    await supabase.from(tabla).update({ stock_actual: nuevoStock }).eq("id", id);

    // Registrar movimiento
    await supabase.from("stock_movimientos").insert({
      producto_id: item.producto_id,
      variante_id: item.variante_id,
      tipo: "entrada",
      cantidad: item.cantidad,
      stock_anterior: producto.stock_actual,
      stock_nuevo: nuevoStock,
      referencia_tipo: "compra",
      referencia_id: compraId,
      motivo: `Recepción compra #${compra.numero_compra}`,
      registrado_por: userId,
    });

    // Actualizar cantidad recibida en el item
    await supabase.from("compra_items").update({
      cantidad_recibida: item.cantidad,
    }).eq("id", item.id);
  }

  // Marcar compra como recibida
  await supabase.from("compras_proveedor").update({
    estado: "recibida",
    fecha_recepcion: new Date().toISOString(),
  }).eq("id", compraId);
}
```

---

## Pagos a Proveedores

### Registrar Pago

Modal desde la ficha del proveedor:

```typescript
const pagoProveedorSchema = z.object({
  monto: z.number().positive("Monto debe ser mayor a 0"),
  metodo_pago: z.enum(["efectivo", "transferencia", "cheque", "otro"]),
  referencia: z.string().optional(), // nro de transferencia, cheque, etc.
  compra_id: z.number().optional(), // si el pago es contra una compra específica
  notas: z.string().optional(),
});
```

**Al registrar un pago:**
1. Se crea registro en `pagos_proveedor`
2. Trigger en DB actualiza `saldo_cuenta_corriente` del proveedor (resta el monto)
3. Si está vinculado a una compra, se puede ver en el detalle de la compra

### Estado de Cuenta Corriente

Vista en la ficha del proveedor — movimientos cronológicos:

```
┌────────────────────────────────────────────────────┐
│ Fecha    │ Concepto                 │ Debe   │ Haber│
├────────────────────────────────────────────────────┤
│ 01/03/26 │ Compra CMP-001          │ $68.500│      │
│ 05/03/26 │ Pago transferencia      │        │$40.000│
│ 10/03/26 │ Compra CMP-002          │ $12.500│      │
│ 12/03/26 │ Pago cheque             │        │$28.500│
├────────────────────────────────────────────────────┤
│          │ SALDO                    │ $12.500│      │
└────────────────────────────────────────────────────┘
```

Esto se construye con una query que une `compras_proveedor` (confirmadas) y `pagos_proveedor`:

```sql
SELECT
  created_at AS fecha,
  'compra' AS tipo,
  CONCAT('Compra ', numero_compra) AS concepto,
  total AS debe,
  0 AS haber
FROM compras_proveedor
WHERE proveedor_id = $1 AND estado IN ('confirmada', 'recibida')

UNION ALL

SELECT
  created_at AS fecha,
  'pago' AS tipo,
  CONCAT('Pago ', metodo_pago, COALESCE(' - ' || referencia, '')) AS concepto,
  0 AS debe,
  monto AS haber
FROM pagos_proveedor
WHERE proveedor_id = $1

ORDER BY fecha ASC;
```

---

## Reportes

### Reporte de Gastos por Proveedor

- Rango de fechas configurable
- Total comprado por proveedor
- Total pagado por proveedor
- Saldo pendiente
- Gráfico de torta: distribución de gastos por proveedor

### Reporte de Productos más Comprados

- Top productos por cantidad comprada
- Costo promedio por producto
- Último costo vs. costo anterior (variación)
