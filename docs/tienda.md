# Tienda, compras y proveedores (conectados a Contabilidad)

Reescritura del módulo de tienda para que **cada operación que mueve dinero o mercadería genere su asiento en el mismo momento y en la misma transacción** (ver `docs/contabilidad.md`). Se desarrolla en la rama `rediseno`; la tienda de producción sigue funcionando hasta el corte.

Fuentes: inventario funcional de la tienda actual (41 bugs relevados), auditoría del núcleo contable contra ContaSystem y el modelo comercial de ContaSystem (comprobantes, aplicaciones, `conexion_modulos`, costeo por capas), que allá nunca llegó a contabilizar la tienda.

## Decisiones tomadas

| Tema | Decisión |
|---|---|
| Medios de cobro | Transferencia (online y POS) y efectivo (solo POS). Sin MercadoPago. |
| Fiscal | Club no contribuyente de IVA por ahora (`contabilidad.config.regimen_iva`): el IVA de las compras es parte del costo. Si cambia, se activan las cuentas de IVA y los documentos lo discriminan. |
| Costeo | Por producto: **promedio ponderado móvil** (default) o **FIFO**. LIFO no (NIC 2). El método no cambia mientras haya stock. |
| Monedas | Compras y deudas con proveedores en UYU o USD. Ventas en UYU. Diferencia de cambio realizada al pagar en otro TC (cuentas 4.6.02.01 / 5.7.02.01). |
| Aprobaciones | Órdenes de compra y órdenes de pago: las aprueba el rol `tienda` o `tesorero`, sin topes. |
| Ventas a crédito | A **disciplinas** (pedidos mayoristas) contra "Fondos en poder de disciplinas". A **socios** ("cargar a la cuota") queda para el módulo de socios, que crea la cuenta corriente del socio. |
| Donaciones | No son ingreso: pasivo "Donaciones Olla del Hogar a transferir" hasta que se transfieren. |
| Proveedores | Es la cuenta corriente de **todo el club**, no solo de la tienda: una factura puede ser de mercadería o de cualquier gasto (con centro de costo). |
| Encargues | Lo cobrado queda como **seña** y se reconoce la venta al **retirarlo**. |
| Devoluciones | Poco frecuentes. Se admiten las dos: devolución de dinero y cambio por otro producto (una sola operación que netea). |
| Banco de cobro | La cuenta Itaú 9500100 es **solo de la tienda**: cuenta propia en el plan (1.1.01.07). |
| Depósitos | Un solo lugar físico: el stock es por ítem, sin depósitos. Se quitan depósitos y transferencias entre depósitos (hoy rotos). |

## Qué se conserva

- **Catálogo** en `public` (`productos`, `producto_variantes`, `producto_imagenes`, `categorias_producto`, `listas_precio*`, `promocodes`, `donaciones_config`) con los **mismos ids**: los carritos guardados, las URLs `/tienda/[slug]` y `/tienda/pedido/[id]` y los mails ya enviados siguen funcionando.
- **Pedidos** en `public.pedidos` / `pedido_items` como documento de venta (estados, número `CS-YYYYMMDD-NNN`, encargues/MTO, comprobante de transferencia, OCR), con la lógica nueva en funciones de la base.
- Todas las funcionalidades del checklist del inventario: variantes y precio socio, MTO, listas mayoristas, promocodes, donación en el checkout, reserva de stock con vencimiento, POS con socio por cédula y descuento, pedidos de disciplina, importación Excel, reportes.
- Las garantías que ya existen: locks ordenados, aprobación idempotente, idempotencia del checkout, precios recalculados en el servidor.

## Modelo nuevo (schema `comercial`)

| Tabla | Para qué |
|---|---|
| `items` | existencia y valor por ítem vendible (producto sin variantes o variante); `productos.stock_actual` / `producto_variantes.stock_actual` quedan como espejo, mantenido por la base, para el storefront |
| `movimientos_stock` | kardex inmutable: tipo, cantidad, **costo unitario y valor**, documento de origen, asiento |
| `capas_costo` | FIFO: lotes con cantidad restante y costo; PPP: costo promedio vigente por ítem |
| `reservas` | stock comprometido por pedido, con vencimiento (reemplaza el cálculo por estado del pedido) |
| `proveedores_cuenta` | datos comerciales del proveedor: moneda habitual, plazo de pago, cuenta de gasto sugerida (extiende `public.proveedores`) |
| `ordenes_compra`, `orden_compra_items` | pedido al proveedor; `borrador → aprobada → recibida parcial/total → cerrada / cancelada` |
| `recepciones`, `recepcion_items` | entrada de mercadería (con o sin orden), por depósito; tope = lo pendiente de la orden |
| `documentos_proveedor`, `documento_proveedor_lineas` | factura crédito/contado, nota de crédito, nota de débito, anticipo; serie + número del proveedor únicos; vencimiento; moneda y TC |
| `pagos_proveedor_nuevos` (orden de pago), `aplicaciones_proveedor` | pagos aprobados y su imputación a documentos (Σ aplicado ≤ saldo; no cruza monedas) |
| `cajas`, `caja_sesiones`, `caja_movimientos` | caja del POS: apertura con fondo, ventas en efectivo, retiros/depósitos al banco, arqueo |
| `cobros_venta` | cobro de un pedido por medio (efectivo de una sesión / transferencia a una cuenta bancaria) |
| `transferencias_donaciones` | envío de lo recaudado a la Olla |

Todo documento que mueve plata o stock se crea, aprueba, anula o revierte **solo por funciones** de la base, que escriben el documento, el kardex y el asiento juntos (`contabilidad._asiento_automatico` con `origen_tipo`/`origen_id`). Anular = revertir el asiento en la misma transacción.

## Asientos por operación

Cuentas por **proceso y rol** en `contabilidad.parametros_cuentas` (resueltas con `cuenta_para`), editables por el tesorero. Entre paréntesis, la cuenta por defecto del plan.

| Operación | Debe | Haber |
|---|---|---|
| **Venta online o POS por transferencia** (al aprobar el comprobante) | Banco de cobro (1.1.01.05) — total | Ventas a socios / no socios (4.4.01 / 4.4.02) — neto de descuentos · Donaciones a transferir (2.1.05.01) — donación |
| + costo de lo vendido | Costo de mercadería vendida (5.1.01) | Mercadería (1.1.05.01) |
| **Venta POS en efectivo** | Caja tienda (1.1.01.03) | Ventas · Donaciones |
| **Pago mixto** | al vender: Caja — efectivo / Señas (2.1.04.03); al aprobar: Banco + Señas | Ventas |
| **Encargue (MTO)** | al cobrar: Caja/Banco | Señas de encargues (2.1.04.03) |
| … al entregar | Señas | Ventas (+ costo del encargue, ver compras) |
| **Pedido de disciplina** | Fondos en poder de disciplinas (1.1.04.03, auxiliar disciplina) | Ventas a disciplinas (4.4.03, centro de costo de la disciplina) + costo |
| **Cancelación / devolución total** | reversión del asiento de venta y del costo; la mercadería vuelve al stock al mismo costo | |
| **Devolución parcial / cambio** | Devoluciones sobre ventas (4.4.09) · Mercadería | Caja/Banco (reintegro) · Costo de ventas |
| **Recepción de mercadería** | Mercadería — cantidad × costo (en USD al TC del día anterior) | Mercadería recibida a facturar (2.1.01.03, auxiliar proveedor) |
| **Factura de proveedor de mercadería** | Mercadería recibida a facturar (diferencia de precio a Mercadería si queda stock, si no a costo de ventas) | Proveedores UYU / USD (2.1.01.01/02, auxiliar proveedor, vencimiento) |
| **Factura de gasto** | Cuenta de gasto (+ centro de costo) | Proveedores |
| **Factura contado** | Mercadería o gasto | Caja / Banco |
| **Nota de crédito de proveedor** | Proveedores | Mercadería / gasto |
| **Anticipo a proveedor** | Anticipos a proveedores (1.1.04.04/05) | Banco |
| … aplicado a una factura | Proveedores | Anticipos |
| **Pago a proveedor** | Proveedores — al TC de la factura | Banco / Caja — al TC del pago · diferencia de cambio realizada |
| **Ajuste de stock** (merma / sobrante) | Ajustes y mermas (5.1.02) o Mercadería | Mercadería o Ajustes |
| **Cierre de caja** | Faltantes de caja (5.9.02) | Sobrantes de caja (4.7.02) |
| **Depósito de caja al banco** | Banco | Caja tienda |
| **Transferencia de donaciones a la Olla** | Donaciones a transferir | Banco |

Costo de lo vendido: PPP → costo promedio vigente del ítem al momento de la salida; FIFO → consume capas en orden. El kardex guarda costo y valor de cada salida, y el asiento de costo usa exactamente esos valores.

## Reglas de integridad (en la base)

- Stock nunca negativo; reserva ≤ disponible (stock − reservas vigentes de otros pedidos). Las reservas vencen (online y POS) y lo hace un cron.
- Kardex inmutable; `Σ movimientos = stock` por ítem y depósito; `Σ valor del kardex = saldo de Mercadería` (control diario, como el de proveedores).
- Recepción: no supera lo pendiente de la orden; idempotente.
- Documento de proveedor: serie + número únicos por proveedor; total = Σ líneas; moneda coherente con la cuenta (Proveedores UYU o USD).
- Aplicaciones: Σ aplicado ≤ saldo del documento y ≤ importe del pago; no cruza monedas; anular un pago libera sus aplicaciones (no las borra).
- **Invariante auxiliar = mayor**: saldo por proveedor según documentos = saldo de Proveedores en el mayor por auxiliar. Función de control que corre al cerrar el mes y lo bloquea si difiere (el descalce de $760 de ContaSystem).
- Precio socio, promocode, lista mayorista y recargo MTO se recalculan en el servidor; el total esperado del cliente se valida (409 si cambió).
- Un pedido cobrado no se edita: se cancela (reversión) o se le hace una devolución.
- Las cuentas de `parametros_cuentas` se validan por clase (como `cuentas_sistema`).

## Seguridad (bugs actuales que se cierran)

- Pedidos e ítems solo se crean por funciones (hoy un usuario logueado puede insertar pedidos con cualquier total y cualquiera puede insertar ítems).
- El costo deja de estar en `productos` (hoy legible por anónimos): pasa a `comercial`, sin acceso público.
- Bucket `productos`: escritura solo para `tienda`/`super_admin`.
- Promocodes, listas mayoristas y depósitos fuera del alcance de anónimos.

## Pantallas

- **Admin tienda** (`/admin`): productos (sin pisar stock), stock con kardex valorizado, ajustes, pedidos (aprobación con OCR, estados, cancelación y devoluciones), POS con caja (apertura, ventas, retiros, arqueo, ticket), pedidos de disciplina con su cuenta corriente, donaciones, reportes (ventas, costo y margen salen del kardex y de la contabilidad: un solo número).
- **Proveedores y compras** (rol `tienda` y `tesorero`): proveedores con estado de cuenta y antigüedad de deuda, órdenes de compra, recepciones, facturas y notas de crédito, anticipos, órdenes de pago con selección de facturas por vencimiento.
- **Storefront**: mismo recorrido; checkout y POS llaman a las funciones nuevas; el stock disponible se calcula bien (hoy un anónimo ve stock reservado como disponible).

## Fases

1. **Base** (`comercial` + funciones + tests pgTAP): stock y costeo, reservas, ventas y su contabilización, cancelación y devolución, caja POS, compras/recepciones, documentos y pagos de proveedores, donaciones, controles.
2. **Admin**: proveedores y compras, stock, pedidos, POS con caja, disciplinas, donaciones, reportes.
3. **Storefront y APIs**: checkout, POS, aprobación, cron de reservas; RLS nuevas.
4. **Corte**: inventario inicial valorizado (costo a definir para los productos sin costo real), pedidos abiertos, saldos de disciplinas y proveedores, donaciones pendientes ($2.000), ventas cobradas desde que se quitó la tesorería vieja (backfill idempotente), apertura de caja y banco desde el arqueo y el extracto.

## Estado

- **Fase 1 — ventas y stock: hecha** (`supabase/migrations/20261003120000_comercial_stock_ventas.sql`, tests `supabase/tests/comercial_ventas.test.sql`). Las funciones que ya usan el checkout, el POS, la aprobación, los pedidos de disciplina, la cancelación y la transferencia de donaciones mantienen su nombre y firma, pero mueven stock por el motor nuevo y asientan en la misma transacción. Requiere un ejercicio contable abierto para la fecha del día.
  - Desde esta migración `stock_actual` no se escribe a mano: las pantallas viejas de ajuste de stock, alta con stock inicial y recepción de compras dan error hasta que se reescriban (fase 2).
- **Fase 1 — compras y proveedores: hecha** (`supabase/migrations/20261003140000_comercial_compras.sql`, tests `supabase/tests/comercial_compras.test.sql`): órdenes de compra con aprobación, recepciones (tope por lo pendiente, idempotentes), facturas/notas de crédito/débito con líneas de recepción, gasto o devolución, contado o a crédito con vencimiento, órdenes de pago con aplicación a facturas y anticipos, diferencia de cambio realizada, anulaciones con reversión y control documentos = mayor por proveedor.
- **Fase 1 — caja y devoluciones: hecha** (`supabase/migrations/20261003160000_comercial_caja_devoluciones.sql`, tests `comercial_caja.test.sql`): sesiones de caja con arqueo al abrir y cerrar contra el saldo contable (faltante/sobrante), depósitos al banco, retiros, ingresos y gastos menores con asiento; las ventas en efectivo exigen caja abierta. Devoluciones y cambios en una operación (mercadería al costo de salida, reintegro o cobro neto por caja o banco).
- Pendiente: pantallas (fase 2), storefront y RLS (fase 3).
