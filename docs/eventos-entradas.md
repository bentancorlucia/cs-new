# Eventos, Entradas y QR

## Visión General

El módulo de eventos permite:
1. **Público**: ver eventos y comprar entradas online
2. **Admin eventos**: crear/editar eventos, configurar tipos y lotes de entradas, ver ventas
3. **Scanner**: escanear QR en la puerta del evento para validar entradas

---

## Páginas Públicas

### Listado de eventos (`/eventos`)

```
┌─────────────────────────────────────────────┐
│  EVENTOS                                     │
│                                             │
│  [Próximos] [Pasados]                       │
│                                             │
│  ┌─────────────────────────────────────┐    │
│  │ 📷 Imagen del evento               │    │
│  │                                     │    │
│  │ 🎉 Fiesta de Fin de Año            │    │
│  │ 📅 Sáb 20 Dic 2026 - 22:00        │    │
│  │ 📍 Parque CUPRA                    │    │
│  │ 🎫 Desde $500                      │    │
│  │                          [Ver más] │    │
│  └─────────────────────────────────────┘    │
│                                             │
│  ┌─────────────────────────────────────┐    │
│  │ 📷                                 │    │
│  │ 🏆 Torneo de Rugby Intercolegial   │    │
│  │ 📅 Dom 15 Nov 2026 - 10:00        │    │
│  │ 📍 Cancha Principal                │    │
│  │ 🎫 Entrada libre con registro     │    │
│  │                          [Ver más] │    │
│  └─────────────────────────────────────┘    │
└─────────────────────────────────────────────┘
```

**Funcionalidades:**
- Tabs: Próximos (default) / Pasados
- Cards con imagen, título, fecha, lugar, precio mínimo
- Solo mostrar eventos con `estado = 'publicado'`
- Ordenar por fecha (más próximo primero)

### Detalle de evento (`/eventos/[slug]`)

```
┌─────────────────────────────────────────────┐
│  📷 Hero image del evento                   │
│                                             │
│  🎉 Fiesta de Fin de Año                   │
│  📅 Sábado 20 de Diciembre, 2026 - 22:00   │
│  📍 Parque CUPRA, Montevideo               │
│                                             │
│  Descripción completa del evento...         │
│  Lorem ipsum dolor sit amet...              │
│                                             │
│  ─────── ENTRADAS ───────                  │
│                                             │
│  ┌───────────────────────────────────┐     │
│  │ 🎫 General                        │     │
│  │ Early Bird - $400 (quedan 15)     │     │
│  │ Cantidad: [- 1 +]  [Comprar]      │     │
│  ├───────────────────────────────────┤     │
│  │ 🎫 VIP                            │     │
│  │ Preventa - $1.200 (quedan 30)     │     │
│  │ Cantidad: [- 1 +]  [Comprar]      │     │
│  ├───────────────────────────────────┤     │
│  │ 🎫 Socio                          │     │
│  │ Precio único - $300               │     │
│  │ 🔒 Solo socios                    │     │
│  │ Cantidad: [- 1 +]  [Comprar]      │     │
│  └───────────────────────────────────┘     │
└─────────────────────────────────────────────┘
```

**Lógica de entradas y lotes:**

```
Evento
 └── Tipo de Entrada (ej: "General", "VIP", "Socio")
      └── Lote (ej: "Early Bird", "Preventa", "Venta General")
           - Precio específico del lote
           - Cantidad disponible
           - Fecha inicio / fin del lote
           - Estado: pendiente → activo → agotado/cerrado
```

**Selección automática de lote:**
- Para cada tipo de entrada, se muestra el **lote activo actual** (el que tiene fecha_inicio <= now AND (fecha_fin >= now OR null) AND estado = 'activo')
- Si el lote se agota, automáticamente pasa a `agotado` y se activa el siguiente
- Si no hay lotes activos, el tipo de entrada se muestra como "Agotado"

**Compra de entrada:**

```
1. Usuario selecciona tipo de entrada y cantidad
2. Click "Comprar" → requiere auth (redirect a login si no está logueado)
3. Modal de confirmación con datos:
   - Nombre del asistente (pre-rellenado del perfil)
   - Cédula (pre-rellenada del perfil)
   - Email (pre-rellenado)
4. "Pagar con MercadoPago" → misma lógica que tienda
5. Webhook confirma pago → estado entrada: 'pagada'
6. Se genera QR con el código UUID de la entrada
7. Se envía email con QR adjunto (fase 2)
8. El QR se puede ver en /mi-cuenta/entradas
```

### Mis entradas (`/mi-cuenta/entradas`)

Listado de entradas compradas por el usuario:
- Imagen del evento, nombre, fecha
- Tipo de entrada y lote
- Estado (pagada, usada, cancelada)
- Botón para ver QR (abre modal con QR grande)
- QR generado a partir del campo `codigo` (UUID) de la entrada

---

## Panel Admin Eventos

**Acceso**: roles `super_admin` y `eventos`

### Páginas

| Ruta | Descripción |
|------|-------------|
| `/eventos/admin` | Dashboard de eventos |
| `/eventos/crear` | Crear evento |
| `/eventos/[id]/editar` | Editar evento |
| `/eventos/[id]/entradas` | Gestión de entradas del evento |
| `/eventos/scanner` | Escáner de QR |

### Crear/Editar Evento

**Formulario:**

```typescript
const eventoSchema = z.object({
  titulo: z.string().min(1).max(200),
  slug: z.string().min(1).max(200), // auto-generado
  descripcion: z.string().optional(),
  descripcion_corta: z.string().max(300).optional(),
  imagen_url: z.string().url().optional(),
  lugar: z.string().max(200),
  direccion: z.string().optional(),
  fecha_inicio: z.string().datetime(),
  fecha_fin: z.string().datetime().optional(),
  capacidad_total: z.number().int().positive().optional(),
  es_gratuito: z.boolean().default(false),
  requiere_registro: z.boolean().default(true),
});
```

**Gestión de tipos de entrada (inline en el formulario):**

```
┌─────────────────────────────────────────────┐
│  TIPOS DE ENTRADA                [+ Agregar]│
│                                             │
│  ┌─────────────────────────────────────┐   │
│  │ Nombre: [General        ]           │   │
│  │ Precio base: [$500      ]           │   │
│  │ Capacidad: [200         ]           │   │
│  │ □ Solo socios                       │   │
│  │                                     │   │
│  │ LOTES:                   [+ Lote]   │   │
│  │ ┌─────────────────────────────┐    │   │
│  │ │ Early Bird | $400 | 50 uds │    │   │
│  │ │ 01/12 - 10/12 | Activo     │    │   │
│  │ └─────────────────────────────┘    │   │
│  │ ┌─────────────────────────────┐    │   │
│  │ │ Preventa | $500 | 100 uds  │    │   │
│  │ │ 10/12 - 18/12 | Pendiente  │    │   │
│  │ └─────────────────────────────┘    │   │
│  │ ┌─────────────────────────────┐    │   │
│  │ │ Puerta | $700 | 50 uds     │    │   │
│  │ │ 20/12 - 20/12 | Pendiente  │    │   │
│  │ └─────────────────────────────┘    │   │
│  └─────────────────────────────────────┘   │
│                                             │
│  ┌─────────────────────────────────────┐   │
│  │ Nombre: [VIP             ]          │   │
│  │ Precio base: [$1200      ]          │   │
│  │ ... (similar)                       │   │
│  └─────────────────────────────────────┘   │
└─────────────────────────────────────────────┘
```

### Dashboard de Eventos

- Lista de todos los eventos (tabs: Próximos / Pasados / Borradores)
- Por cada evento: entradas vendidas / capacidad, recaudación
- Accesos rápidos: editar, ver entradas, abrir scanner

### Gestión de Entradas por Evento

Vista detallada de las entradas de un evento:
- Tabla: nombre asistente, cédula, tipo, lote, estado, fecha compra
- Filtros por tipo, lote, estado
- Exportar a CSV
- Venta manual: emitir entrada sin cobro (cortesía) o con cobro en efectivo
- Estadísticas: vendidas por tipo, por lote, recaudación total, % capacidad

---

## Escáner de QR

**Ruta**: `/eventos/scanner`
**Acceso**: roles `super_admin`, `eventos`, `scanner`

### Interfaz

```
┌─────────────────────────────────────┐
│  SCANNER DE ENTRADAS                │
│                                     │
│  Evento: [▼ Seleccionar evento   ]  │
│                                     │
│  ┌───────────────────────────┐     │
│  │                           │     │
│  │      📷 CÁMARA            │     │
│  │      (escaneando...)      │     │
│  │                           │     │
│  └───────────────────────────┘     │
│                                     │
│  ──── Último escaneo ────          │
│                                     │
│  ✅ VÁLIDO                          │
│  María García - General             │
│  Entrada #a1b2c3d4                  │
│  Escaneada: 22:15                   │
│                                     │
│  ──── Estadísticas ────            │
│  Ingresaron: 145 / 300              │
│  ████████████░░░░ 48%               │
│                                     │
│  ──── Últimos escaneos ────        │
│  22:15 ✅ María García              │
│  22:14 ❌ QR no válido              │
│  22:13 ✅ Juan Pérez                │
│  22:12 ⚠️ Ya ingresó               │
└─────────────────────────────────────┘
```

### Lógica del Scanner

```typescript
async function escanearEntrada(codigo: string, eventoId: number, scannerId: string) {
  // 1. Buscar entrada por código UUID
  const { data: entrada } = await supabase
    .from("entradas")
    .select("*, tipo_entradas(nombre), eventos(titulo)")
    .eq("codigo", codigo)
    .single();

  let resultado: string;

  if (!entrada) {
    resultado = "no_encontrado";
  } else if (entrada.evento_id !== eventoId) {
    resultado = "evento_incorrecto";
  } else if (entrada.estado === "usada") {
    resultado = "ya_usado";
  } else if (entrada.estado === "cancelada" || entrada.estado === "reembolsada") {
    resultado = "cancelada";
  } else if (entrada.estado === "pagada") {
    // ✅ Válida — marcar como usada
    await supabase.from("entradas").update({
      estado: "usada",
      usado_at: new Date().toISOString(),
      usado_por: scannerId,
    }).eq("id", entrada.id);

    resultado = "valido";
  }

  // Registrar escaneo (siempre, incluso fallidos)
  await supabase.from("escaneos_entrada").insert({
    entrada_id: entrada?.id,
    codigo_escaneado: codigo,
    evento_id: eventoId,
    resultado,
    escaneado_por: scannerId,
  });

  return { resultado, entrada };
}
```

### Implementación de la cámara

Usar librería `html5-qrcode` o `@yudiel/react-qr-scanner`:

```typescript
"use client";

import { Scanner } from "@yudiel/react-qr-scanner";

export function QRScanner({ eventoId }: { eventoId: number }) {
  const [resultado, setResultado] = useState(null);

  const handleScan = async (data: string) => {
    // Debounce para evitar escaneos dobles
    const res = await fetch("/api/eventos/escanear", {
      method: "POST",
      body: JSON.stringify({ codigo: data, evento_id: eventoId }),
    });
    const json = await res.json();
    setResultado(json);

    // Feedback visual + sonido
    if (json.resultado === "valido") {
      playSound("success");
      vibrate(200);
    } else {
      playSound("error");
      vibrate([100, 50, 100]);
    }
  };

  return (
    <div>
      <Scanner onScan={handleScan} />
      <ResultadoEscaneo resultado={resultado} />
    </div>
  );
}
```

### Feedback visual del scanner

| Resultado | Color | Sonido | Mensaje |
|-----------|-------|--------|---------|
| `valido` | Verde (#22c55e) | ✅ Beep corto | "VÁLIDO - [Nombre] - [Tipo]" |
| `ya_usado` | Amarillo (#f59e0b) | ⚠️ Doble beep | "YA INGRESÓ - [hora uso]" |
| `no_encontrado` | Rojo (#ef4444) | ❌ Beep largo | "QR NO VÁLIDO" |
| `evento_incorrecto` | Rojo | ❌ | "ENTRADA DE OTRO EVENTO" |
| `cancelada` | Rojo | ❌ | "ENTRADA CANCELADA" |

### Estadísticas en tiempo real

Usar **Supabase Realtime** para actualizar las estadísticas del scanner en tiempo real:

```typescript
useEffect(() => {
  const channel = supabase
    .channel("escaneos")
    .on("postgres_changes", {
      event: "INSERT",
      schema: "public",
      table: "escaneos_entrada",
      filter: `evento_id=eq.${eventoId}`,
    }, (payload) => {
      // Actualizar contador y lista de últimos escaneos
      setEscaneos(prev => [payload.new, ...prev]);
      setIngresaron(prev => payload.new.resultado === "valido" ? prev + 1 : prev);
    })
    .subscribe();

  return () => supabase.removeChannel(channel);
}, [eventoId]);
```

---

## Generación de QR

```typescript
// src/lib/qr/generate.ts
import QRCode from "qrcode";

export async function generarQREntrada(codigo: string): Promise<string> {
  // Genera un data URL del QR
  const qrDataUrl = await QRCode.toDataURL(codigo, {
    width: 400,
    margin: 2,
    color: {
      dark: "#730d32", // bordó del club
      light: "#ffffff",
    },
    errorCorrectionLevel: "H", // máxima corrección
  });

  return qrDataUrl;
}

// Alternativamente, subir imagen a Supabase Storage
export async function generarYGuardarQR(entradaId: number, codigo: string) {
  const buffer = await QRCode.toBuffer(codigo, { width: 400 });

  const { data } = await supabase.storage
    .from("qr-entradas")
    .upload(`${entradaId}.png`, buffer, {
      contentType: "image/png",
    });

  const { data: { publicUrl } } = supabase.storage
    .from("qr-entradas")
    .getPublicUrl(`${entradaId}.png`);

  // Guardar URL en la entrada
  await supabase.from("entradas").update({ qr_url: publicUrl }).eq("id", entradaId);

  return publicUrl;
}
```
