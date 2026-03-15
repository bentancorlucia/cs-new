# Secretaría — Gestión de Socios y Disciplinas

## Visión General

El módulo de secretaría permite gestionar todos los socios del club, sus datos personales, disciplinas deportivas asignadas, y estado de cuotas. Solo accesible por roles `super_admin` y `secretaria`.

---

## Páginas del Panel

| Ruta | Descripción |
|------|-------------|
| `/secretaria` | Dashboard de secretaría |
| `/secretaria/socios` | Lista de socios |
| `/secretaria/socios/nuevo` | Alta de socio |
| `/secretaria/socios/[id]` | Ficha del socio |
| `/secretaria/disciplinas` | Gestión de disciplinas |

---

## Dashboard de Secretaría

Widgets resumen:
- Total de socios activos
- Socios morosos (cuota vencida)
- Altas del mes
- Socios por disciplina (gráfico de barras)
- Cuotas cobradas del mes vs. pendientes

---

## Gestión de Socios

### Lista de Socios (`/secretaria/socios`)

```
┌──────────────────────────────────────────────────────────┐
│  SOCIOS                          [+ Nuevo socio]         │
│                                                          │
│  🔍 Buscar por nombre o cédula...                       │
│                                                          │
│  Filtros: [Todos] [Activos] [Morosos] [Inactivos]       │
│  Disciplina: [Todas ▼]                                  │
│                                                          │
│  ┌──────────────────────────────────────────────────┐   │
│  │ Nombre      │ Cédula    │ Disciplinas │ Estado   │   │
│  ├──────────────────────────────────────────────────┤   │
│  │ García, M.  │ 4.567.890 │ Hockey, Fut │ ● Activo│   │
│  │ Pérez, J.   │ 3.456.789 │ Rugby      │ ● Moroso│   │
│  │ López, A.   │ 5.678.901 │ Handball   │ ○ Inact.│   │
│  └──────────────────────────────────────────────────┘   │
│                                                          │
│  Mostrando 1-20 de 487     [< 1 2 3 ... 25 >]          │
└──────────────────────────────────────────────────────────┘
```

**Funcionalidades:**
- Búsqueda por nombre, apellido o cédula (debounced)
- Filtro por estado: activo, moroso, inactivo, suspendido
- Filtro por disciplina
- Ordenar por nombre, fecha de alta, estado
- Paginación server-side
- Exportar a CSV
- Click en fila → ficha del socio

### Alta de Socio (`/secretaria/socios/nuevo`)

Dos flujos posibles:

**1. Socio que ya tiene cuenta (usuario registrado):**
- Buscar por email o cédula en la tabla `perfiles`
- Seleccionar perfil existente
- Completar datos faltantes
- Asignar rol `socio`

**2. Socio nuevo (sin cuenta):**
- Se crea invitación por email (Supabase invite)
- O se registran datos manualmente y se vincula después

**Formulario de alta:**

```typescript
const socioSchema = z.object({
  nombre: z.string().min(1, "Nombre requerido").max(100),
  apellido: z.string().min(1, "Apellido requerido").max(100),
  cedula: z.string().min(1, "Cédula requerida").max(20),
  telefono: z.string().max(20).optional(),
  fecha_nacimiento: z.string().date().optional(), // no obligatorio
  disciplinas: z.array(z.object({
    disciplina_id: z.number(),
    categoria: z.string().optional(), // "Primera", "Sub-19", etc.
  })).min(1, "Al menos una disciplina"),
});
```

**Al guardar:**
1. Crear o actualizar fila en `perfiles` con `es_socio = true`, `estado_socio = 'activo'`, `fecha_alta_socio = now()`
2. Generar `numero_socio` automático (ej: "CS-0487")
3. Asignar rol `socio` en `perfil_roles`
4. Crear registros en `perfil_disciplinas`

### Ficha del Socio (`/secretaria/socios/[id]`)

```
┌──────────────────────────────────────────────────────────┐
│  ← Volver                                    [Editar]    │
│                                                          │
│  👤 María García López              Estado: ● Activo     │
│  Socio #CS-0487                                          │
│                                                          │
│  ─── Datos Personales ───                                │
│  Cédula: 4.567.890-1                                     │
│  Teléfono: 099 123 456                                   │
│  Fecha de nacimiento: 15/03/1995                         │
│  Email: maria@email.com                                  │
│  Socio desde: 01/03/2024                                 │
│                                                          │
│  ─── Disciplinas ───                                     │
│  • Hockey — Mami Hockey              [Quitar]            │
│  • Fútbol — Femenino Primera          [Quitar]            │
│                                 [+ Agregar disciplina]   │
│                                                          │
│  ─── Historial de Cuotas ───                            │
│  ┌────────────────────────────────────────────┐         │
│  │ Período    │ Monto  │ Método    │ Estado  │         │
│  ├────────────────────────────────────────────┤         │
│  │ Mar 2026   │ $480   │ Efectivo  │ ✅ Pago │         │
│  │ Feb 2026   │ $480   │ Transfer. │ ✅ Pago │         │
│  │ Ene 2026   │        │           │ ❌ Debe │         │
│  └────────────────────────────────────────────┘         │
│                                  [Registrar pago]        │
│                                                          │
│  ─── Acciones ───                                       │
│  [Cambiar estado ▼] [Asignar roles] [Eliminar socio]   │
└──────────────────────────────────────────────────────────┘
```

### Registrar Pago de Cuota

Modal o formulario inline:

```typescript
const pagoSocioSchema = z.object({
  monto: z.number().positive(),
  periodo_mes: z.number().min(1).max(12),
  periodo_anio: z.number().min(2020),
  metodo_pago: z.enum(["efectivo", "mercadopago", "transferencia"]),
  referencia_pago: z.string().optional(), // nro de transferencia, etc.
  notas: z.string().optional(),
});
```

### Cambio de Estado

| Estado | Significado | Acción |
|--------|-------------|--------|
| `activo` | Al día con cuotas | Estado normal |
| `moroso` | Debe 1+ cuotas | Se marca manual o automático (cron) |
| `inactivo` | Se dio de baja | Pierde acceso de socio |
| `suspendido` | Suspensión temporal | Secretaría decide |

Al cambiar a `inactivo`:
- Se remueve rol `socio` de `perfil_roles`
- Se marca `es_socio = false`
- Se mantiene historial

Al reactivar:
- Se restaura rol `socio`
- Se marca `es_socio = true`

---

## Gestión de Disciplinas

### Lista de Disciplinas (`/secretaria/disciplinas`)

CRUD de las disciplinas del club:
- Nombre, slug, descripción
- Imagen representativa
- Contacto del coordinador (nombre, teléfono, email)
- Toggle activa/inactiva
- Cantidad de socios en la disciplina

### Categorías por Disciplina

Cada disciplina puede tener categorías (ej: para Fútbol: "Femenino", "Primera", "Sub-19", etc.)

Las categorías se asignan como texto libre en `perfil_disciplinas.categoria`, pero se pueden sugerir con un campo autocomplete basado en categorías existentes para esa disciplina.

---

## Carnet Digital del Socio

Disponible en `/mi-cuenta` para usuarios con rol `socio`:

```
┌─────────────────────────────┐
│  CLUB SEMINARIO             │
│  ─────────────────────────  │
│                             │
│  👤 María García López      │
│  Socio #CS-0487             │
│  CI: 4.567.890-1            │
│                             │
│  Disciplinas:               │
│  Hockey • Fútbol            │
│                             │
│  ┌─────────────┐           │
│  │ QR CODE     │           │
│  │ (perfil_id) │           │
│  └─────────────┘           │
│                             │
│  Estado: ● ACTIVO           │
│  Válido hasta: Mar 2026     │
└─────────────────────────────┘
```

El QR del carnet contiene el `perfil_id` (UUID) y puede ser escaneado en el local para verificar membresía y aplicar descuentos.

---

## Detección Automática de Morosos (Opcional - Fase 2)

Supabase Edge Function o cron job que:
1. Corre el 1ro de cada mes
2. Revisa qué socios activos no tienen pago del mes anterior
3. Los marca como `moroso`
4. (Opcional) Envía notificación por email

```sql
-- Ejemplo de query para detectar morosos
UPDATE perfiles
SET estado_socio = 'moroso', updated_at = NOW()
WHERE es_socio = TRUE
  AND estado_socio = 'activo'
  AND id NOT IN (
    SELECT perfil_id FROM pagos_socios
    WHERE periodo_mes = EXTRACT(MONTH FROM NOW() - INTERVAL '1 month')
    AND periodo_anio = EXTRACT(YEAR FROM NOW() - INTERVAL '1 month')
  );
```
