# Pago por Transferencia Bancaria - Tienda Club Seminario

## Contexto
Agregar "Transferencia bancaria" como método de pago en la tienda online y POS. El usuario transfiere a la cuenta ITAU 9500100 (Club Seminario), sube comprobante obligatoriamente, y un admin verifica antes de confirmar el pedido. Extracción semi-automática de datos del comprobante via Tesseract OCR con indicadores visuales para el admin.

**Cuenta válida**: ITAU 9500100 — Titular: Club Seminario

---

# FASE 1: Base de datos + Backend core

Todo lo necesario para que el flujo funcione a nivel de datos y APIs, sin UI.

## 1.1 Migración (`supabase/migrations/019_transferencias.sql`)

- Alterar CHECK de `pedidos.estado` — agregar `'pendiente_verificacion'`
- Alterar CHECK de `pedidos.metodo_pago` — agregar `'transferencia'`
- Agregar columnas a `pedidos`: `stock_reservado BOOLEAN DEFAULT FALSE`, `stock_reservado_at TIMESTAMPTZ`
- Crear tabla `comprobantes`:
  - `id, pedido_id (FK), url, nombre_archivo, tipo (imagen|pdf), tamano_bytes`
  - `datos_extraidos JSONB` — monto, moneda, fecha, cuenta_destino, banco_destino, beneficiario, banco_origen, referencia, confianza
  - `estado (pendiente|verificado|rechazado), verificado_por, verificado_at, motivo_rechazo`
  - Trigger `updated_at`, índice en `pedido_id`
- Bucket de storage `comprobantes` — privado, 10MB, JPG/PNG/WebP/PDF
- RLS: usuarios autenticados pueden subir para sus pedidos; admin puede leer/actualizar todo

**Ref**: `supabase/migrations/002_tienda.sql`

## 1.2 Helper de stock reservado (`src/lib/stock.ts`)

- `getStockDisponible(db, productoId, varianteId?)` — retorna `stock_actual` menos cantidades en pedidos `pendiente_verificacion`

## 1.3 API checkout con transferencia (`src/app/api/checkout/route.ts`)

- Agregar `metodo_pago: z.enum(["mercadopago", "transferencia"])` al schema
- Si transferencia: crear pedido con `estado: "pendiente_verificacion"`, reservar stock, NO crear preference MP
- Retornar `{ pedido_id, numero_pedido, metodo_pago }` sin `checkout_url`

## 1.4 API upload comprobante — Nuevo `src/app/api/checkout/comprobante/route.ts` (POST)

- Auth requerida, validar pedido pertenece al usuario y está en `pendiente_verificacion`
- Upload a bucket `comprobantes` → guardar en tabla `comprobantes`
- Por ahora sin OCR (`datos_extraidos: null`) — se agrega en Fase 3

## 1.5 API verificar pedido — Nuevo `src/app/api/admin/pedidos/[id]/verificar/route.ts` (POST)

- Body: `{ accion: "aprobar" | "rechazar", motivo?: string }`
- Requiere rol tienda/super_admin
- Aprobar: re-validar stock → deducir con `stock_movimientos` → pedido a `pagado` → comprobante a `verificado`
- Rechazar: pedido a `cancelado` → comprobante a `rechazado` → liberar reserva

## 1.6 Modificar API admin pedidos (`src/app/api/admin/pedidos/route.ts`)

- Incluir `pendiente_verificacion` en conteos de tabs

## 1.7 Email verificación pendiente

- Nuevo template `orderPendingVerificationHtml` en `src/lib/email/templates.ts`
- Nueva función `sendOrderPendingVerification` en `src/lib/email/send.ts`
- Enviar al crear pedido con transferencia

### Verificación Fase 1
- [ ] POST `/api/checkout` con `metodo_pago: "transferencia"` crea pedido en `pendiente_verificacion`
- [ ] POST `/api/checkout/comprobante` sube archivo al bucket y crea registro
- [ ] POST `/api/admin/pedidos/[id]/verificar` con `aprobar` → pedido pasa a `pagado`, stock se deduce
- [ ] POST con `rechazar` → pedido a `cancelado`, stock liberado
- [ ] Email de verificación pendiente se envía

---

# FASE 2: UI — Checkout online + Confirmación + Admin

## 2.1 Checkout (`src/app/(public)/tienda/checkout/checkout-client.tsx`)

- **Selector de método de pago**: dos radio-cards animadas (MercadoPago / Transferencia)
- **Panel datos bancarios** (visible si transferencia): ITAU, Cuenta 9500100, Titular: Club Seminario, botón copiar
- **Upload comprobante** (obligatorio): drag & drop, preview imagen/PDF, max 10MB
- **Flujo submit**: POST checkout → POST comprobante → limpiar carrito → redirect confirmación
- **Botón**: "Confirmar pedido" (disabled sin archivo), "Pagar con MercadoPago" si MP

## 2.2 Confirmación pedido (`src/app/(public)/tienda/pedido/[id]/pedido-confirmacion-client.tsx`)

- Agregar `pendiente_verificacion` a `ESTADO_CONFIG` (icono reloj, color amber)
- Mensaje: "Tu transferencia fue recibida y está siendo verificada"

## 2.3 Admin pedidos lista (`src/app/(dashboard)/admin/pedidos/page.tsx`)

- Tab "Por conciliar" con badge de conteo
- Badge estado orange para `pendiente_verificacion`
- Botón "Verificar" que lleva al detalle

## 2.4 Admin pedido detalle (`src/app/(dashboard)/admin/pedidos/[id]/page.tsx`)

- **Visor de comprobante**: imagen inline con zoom / PDF embed
- **Acciones**: botón "Aprobar transferencia" (verde) + "Rechazar" (rojo, dialog con motivo)
- Actualizar stepper de estados para incluir `pendiente_verificacion`

### Verificación Fase 2
- [ ] Checkout muestra selector MP/Transferencia con animaciones
- [ ] Seleccionar transferencia muestra datos bancarios y upload
- [ ] No se puede confirmar sin subir comprobante
- [ ] Flujo completo: seleccionar → subir → confirmar → redirect a confirmación
- [ ] Confirmación muestra estado "Verificación pendiente" con mensaje
- [ ] Admin ve tab "Por conciliar" con pedidos pendientes
- [ ] Admin puede ver comprobante y aprobar/rechazar desde detalle

---

# FASE 3: OCR — Extracción semi-automática de comprobantes

Basado en análisis de comprobantes reales de 7 bancos: Santander, Itaú, Prex, HSBC, BROU, Scotiabank, BBVA.

## 3.1 Dependencias

- `tesseract.js` — OCR en Node.js con soporte español
- `pdf-parse` — extraer texto de PDFs sin OCR

## 3.2 Módulo de extracción (`src/lib/comprobante/extract.ts`)

```typescript
interface ComprobanteExtractionResult {
  monto: number | null;
  moneda: string | null;           // "UYU" | "$"
  fecha: string | null;            // ISO date
  cuenta_destino: string | null;
  banco_destino: string | null;
  beneficiario: string | null;
  banco_origen: string | null;
  referencia: string | null;
  confianza: number;               // 0-1
}
```

## 3.3 Pipeline

**Paso 1 — Extraer texto:**
- PDF: `pdf-parse` (texto directo, rápido). Fallback Tesseract si no hay texto
- Imágenes: Tesseract.js con lang `spa`

**Paso 2 — Regex genéricos** (no por banco):

| Campo | Patrones | Notas |
|-------|----------|-------|
| Monto | `(?:UYU\|\$)\s*[\d.,]+` cerca de "monto", "importe", "transferido", "acreditar" | Parsear `2.840,00` → 2840.00 |
| Cuenta destino | Números 5-20 dígitos cerca de "destino", "hacia", "reciben" | Validar contra 9500100 |
| Banco destino | `ITAU\|Itaú\|Itau` cerca de "destino", "hacia", "reciben" | Señal principal |
| Beneficiario | Texto después de "beneficiari", "nombre de cuenta" | "Club Seminario", "BORDO" |
| Fecha | `\d{1,2}/\d{1,2}/\d{4}`, `\d+ de \w+ \d{4}` | Múltiples formatos |
| Referencia | Números 7+ dígitos cerca de "referencia", "operación", "transacción" | ID único |
| Banco origen | Keywords: "Santander", "itaú", "Prex", "HSBC", "BROU", "Scotiabank", "BBVA" | En todo el texto |

**Paso 3 — Confianza:**
- 0.0: nada extraído
- 0.3: solo monto o fecha
- 0.6: monto + banco destino ITAU
- 0.8: monto + ITAU + beneficiario "seminario"
- 1.0: monto + ITAU + cuenta 9500100 + fecha

## 3.4 Ejecución sincrónica

Procesar durante el upload (~3-5s con spinner "Procesando comprobante..."):
1. Upload archivo → Tesseract/pdf-parse extrae texto → regex parsea → calcula confianza
2. Guarda en `comprobantes.datos_extraidos`

## 3.5 Integrar en API de upload comprobante

Modificar `src/app/api/checkout/comprobante/route.ts` para llamar a `extractComprobanteData()` y guardar resultado.

## 3.6 Indicadores visuales en admin detalle

Agregar al visor de comprobante en `src/app/(dashboard)/admin/pedidos/[id]/page.tsx`:

- ✅ **Banco destino ITAU** — `banco_destino` contiene "ITAU"/"Itaú"
- ✅ **Cuenta correcta** — `cuenta_destino` contiene "9500100"
- ✅ **Beneficiario correcto** — contiene "Seminario" o "BORDO"
- ✅/⚠️ **Monto coincide** — `monto` == `pedido.total` (exacto vs diferencia)
- ❌ **No se pudo extraer** — `confianza` < 0.3, verificar manualmente

### Observaciones por banco

| Banco | Formato típico | Estructura |
|-------|---------------|------------|
| Santander | PDF/web, key-value | "Monto acreditado: UYU X", Cuenta Origen / Destino separadas |
| Itaú | App mobile screenshot | "importe transferido $ X", "para Itau cuenta X" |
| Prex | App mobile card | Header "$ X", "Enviado desde" / "Reciben en" |
| HSBC | PDF/web, tabla | "Monto a transferir: UYU X", "Banco de destino: ITAU" |
| BROU | PDF formal, key-value | "Importe a acreditar: $ X", "Cuenta de destino", "Banco" |
| Scotiabank | App mobile, centrado | "Monto transferido UYU X", "Hacia Itaú XXXXXXX" |
| BBVA | PDF formal con headers | Secciones Cuenta Origen / Destino / Detalle del giro |

### Verificación Fase 3
- [ ] OCR extrae monto correctamente de imágenes de los 7 bancos
- [ ] pdf-parse extrae texto de PDFs bancarios (Santander, HSBC, BROU, BBVA)
- [ ] Admin ve datos extraídos con indicadores ✅/⚠️/❌ junto al comprobante
- [ ] Confianza ≥ 0.6 cuando banco destino es ITAU + monto extraído
- [ ] Confianza = 0 cuando OCR falla (imagen borrosa, formato no reconocido)

---

# FASE 4: POS — Transferencia en punto de venta

## 4.1 API POS venta (`src/app/api/admin/pos/venta/route.ts`)

- Agregar `"transferencia"` al enum de `metodo_pago`
- Mismo flujo: `pendiente_verificacion`, stock reservado

## 4.2 API POS comprobante — Nuevo `src/app/api/admin/pos/comprobante/route.ts` (POST)

- Upload de comprobante por parte del vendedor (requiere rol tienda/super_admin)
- Misma lógica de extracción OCR que el checkout online

## 4.3 UI POS (`src/app/(dashboard)/admin/pos/pos-client.tsx`)

- Tercer botón de pago "Transferencia" (grid-cols-2 → grid-cols-3)
- Modal con datos bancarios (ITAU 9500100) + upload de comprobante
- Flujo: crear venta → subir comprobante → confirmar

### Verificación Fase 4
- [ ] POS muestra 3 botones de pago: Efectivo / MercadoPago QR / Transferencia
- [ ] Seleccionar transferencia abre modal con datos bancarios + upload
- [ ] Venta se crea con `pendiente_verificacion`, aparece en "Por conciliar"
- [ ] Misma verificación admin funciona para ventas POS
