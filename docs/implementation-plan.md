# Plan de Implementación por Fases

## Cómo usar este plan

Decí **"implementa fase X"** y Claude leerá esta sección, los docs referenciados, y ejecutará todos los pasos de esa fase. Cada fase es autocontenida y se puede implementar de forma incremental.

**Regla de oro:** No avanzar a la siguiente fase hasta que la actual funcione correctamente.

---

## Fase 1 — Setup del Proyecto

**Objetivo:** Proyecto Next.js funcional con todas las dependencias instaladas y configuración base.

**Docs de referencia:** `CLAUDE.md`

### Tareas:

1.1. Crear proyecto Next.js 14+ con App Router y TypeScript strict
```bash
npx create-next-app@latest club-seminario --typescript --tailwind --eslint --app --src-dir
```

1.2. Instalar dependencias core:
```bash
npm install @supabase/supabase-js @supabase/ssr
npm install framer-motion
npm install zod react-hook-form @hookform/resolvers
npm install sonner
npm install date-fns
npm install lucide-react
npm install recharts
npm install @tanstack/react-table
```

1.3. Instalar y configurar Shadcn/ui:
```bash
npx shadcn@latest init
```
- Configurar tema con colores del club (bordó #730d32, dorado #f7b643)
- Instalar componentes base: button, input, card, dialog, sheet, tabs, dropdown-menu, navigation-menu, table, badge, skeleton, avatar, separator, tooltip, select, textarea, label, checkbox, radio-group, switch, popover, command, form

1.4. Configurar Tailwind con paleta extendida (ver `docs/ui-components.md` → Paleta de Colores)

1.5. Configurar variables CSS de Shadcn con colores del club (ver `docs/ui-components.md` → Tema Personalizado)

1.6. Crear estructura de carpetas completa según `CLAUDE.md` → Estructura de Carpetas (solo carpetas y archivos vacíos placeholder)

1.7. Crear `src/lib/motion.ts` con todas las constantes de animación (ver `docs/ui-components.md` → Configuración Global)

1.8. Crear `.env.local.example` con todas las variables de entorno

1.9. Crear CSS global (`src/app/globals.css`) con smooth scrolling, prefers-reduced-motion, shimmer keyframes, y transiciones base (ver `docs/ui-components.md` → CSS Global Requerido)

1.10. Verificar que `npm run dev` funciona sin errores

### Entregable:
- Proyecto Next.js corriendo en `localhost:3000` con página en blanco estilizada con los colores del club
- Todas las dependencias instaladas
- Estructura de carpetas lista

---

## Fase 2 — Supabase: Base de Datos y Auth

**Objetivo:** Base de datos completa con todas las tablas, triggers, RLS, e integración de auth funcionando.

**Docs de referencia:** `docs/database-schema.md`, `docs/auth-roles.md`

### Tareas:

2.1. Inicializar Supabase en el proyecto:
```bash
npx supabase init
```

2.2. Crear migraciones SQL con TODAS las tablas del schema (ver `docs/database-schema.md`):
- Migración 001: `perfiles`, `roles`, `perfil_roles`, `disciplinas`, `perfil_disciplinas`, `pagos_socios`
- Migración 002: `categorias_producto`, `productos`, `producto_variantes`, `producto_imagenes`, `pedidos`, `pedido_items`, `stock_movimientos`, `pagos_mercadopago`
- Migración 003: `proveedores`, `producto_proveedores`, `compras_proveedor`, `compra_items`, `pagos_proveedor`
- Migración 004: `eventos`, `tipo_entradas`, `lotes_entrada`, `entradas`, `escaneos_entrada`
- Migración 005: `contenido_paginas`, `memorias`, `directivos`
- Migración 006: Triggers (handle_new_user, generar_numero_pedido, actualizar_saldo_proveedor, actualizar_deuda_compra)
- Migración 007: Funciones helper (`tiene_rol`, `tiene_algun_rol`)
- Migración 008: Índices
- Migración 009: RLS policies para todas las tablas

2.3. Crear seed con datos iniciales:
- 7 roles del sistema
- 7 disciplinas deportivas
- Contenido de páginas institucionales (de `docs/pages-content.md`)
- Directivos actuales
- Memorias (2014–2024)

2.4. Crear Storage buckets: `productos`, `eventos`, `avatars`, `memorias`, `documentos`

2.5. Configurar Supabase Auth:
- Habilitar email/password
- Configurar redirect URLs
- Verificar que el trigger `handle_new_user` crea perfil automáticamente

2.6. Crear clientes de Supabase:
- `src/lib/supabase/server.ts` — `createServerClient` para Server Components y Route Handlers
- `src/lib/supabase/client.ts` — `createBrowserClient` para Client Components
- `src/lib/supabase/middleware.ts` — Cliente para middleware

2.7. Generar tipos TypeScript de Supabase:
```bash
npx supabase gen types typescript --local > src/types/database.ts
```

2.8. Ejecutar migraciones y seed, verificar que todo funciona:
```bash
npx supabase db push
```

### Entregable:
- Base de datos completa con 27 tablas, triggers, RLS e índices
- Auth configurado y funcionando
- Tipos TypeScript generados
- Clientes de Supabase para server y client

---

## Fase 3 — Autenticación y Sistema de Roles

**Objetivo:** Login, registro, middleware de protección de rutas, y sistema de multi-rol funcionando.

**Docs de referencia:** `docs/auth-roles.md`

### Tareas:

3.1. Crear `src/middleware.ts` con protección de rutas por rol (ver `docs/auth-roles.md` → Middleware de Protección)

3.2. Crear hook `src/hooks/use-roles.ts` para obtener roles del usuario actual (ver `docs/auth-roles.md` → Hook useRoles)

3.3. Crear `src/lib/supabase/roles.ts` con funciones server-side `getUserRoles()` y `requireRole()` (ver `docs/auth-roles.md` → Server-side)

3.4. Crear página de Login (`/login`):
- Formulario email + contraseña
- Link a registro
- Redirect post-login según roles
- Animaciones: form fade-in, input focus glow, button states

3.5. Crear página de Registro (`/registro`):
- Formulario: email, contraseña, nombre, apellido, teléfono (opcional), cédula (opcional)
- Validación con Zod
- Auto-asignación de rol `no_socio`
- Animaciones: form fade-in, success feedback

3.6. Crear API route para asignar roles: `POST /api/roles/asignar` (ver `docs/auth-roles.md` → Asignación de Roles)

3.7. Crear API route para obtener roles del usuario logueado: `GET /api/roles/me`

3.8. Verificar flujo completo: registro → login → redirect según rol → logout

### Entregable:
- Login y registro funcionando con Supabase Auth
- Middleware protegiendo rutas según roles
- Hook `useRoles` listo para usar en componentes client
- Funciones server-side de roles listas

---

## Fase 4 — Layout y Navegación

**Objetivo:** Layout público completo (navbar, footer), layout del dashboard (sidebar, role switcher), y navegación fluida con animaciones.

**Docs de referencia:** `docs/ui-components.md`, `docs/pages-content.md`

### Tareas:

4.1. Crear componente `PageTransition` (ver `docs/ui-components.md` → Page Transitions)

4.2. Crear componente `AnimateOnScroll` y `AnimateStaggerGroup` (ver `docs/ui-components.md` → Scroll-Triggered Animations)

4.3. Crear Header/Navbar público:
- Logo + nombre del club
- NavigationMenu con dropdowns para Club y Deportes
- Links directos: Socios, Beneficios, Tienda, Eventos
- Badge de carrito con bump animation
- Botón Login / Avatar del usuario logueado con dropdown
- Glass-morphism animado en scroll (ver `docs/ui-components.md` → Navbar)
- Versión mobile: Sheet lateral con acordeones

4.4. Crear Footer:
- Columnas: Club, Deportes, Socios, Contacto
- Redes sociales con iconos Lucide
- Copyright
- Fondo oscuro (#1a1a1a)

4.5. Crear layout público `src/app/(public)/layout.tsx` con Header + Footer + PageTransition

4.6. Crear Sidebar del Dashboard:
- Active indicator animado con layoutId
- Hover translate-x en items
- Collapsible en desktop, Sheet en mobile
- Secciones dinámicas según rol activo
- AnimatePresence al cambiar de rol

4.7. Crear componente `RoleSwitcher` (ver `docs/auth-roles.md` → Role Switcher)

4.8. Crear layout del dashboard `src/app/(dashboard)/layout.tsx` con Sidebar + RoleSwitcher

4.9. Verificar navegación completa: todas las rutas públicas navegan correctamente, dashboard muestra sidebar correcta según rol

### Entregable:
- Navbar público con glass-morphism y mega-menu animado
- Footer completo
- Sidebar del dashboard con role switcher
- Transiciones de página funcionando
- Layout mobile responsive

---

## Fase 5 — Páginas Institucionales Públicas

**Objetivo:** Todas las 15 páginas originales del sitio implementadas con contenido real y animaciones.

**Docs de referencia:** `docs/pages-content.md`, `docs/ui-components.md`

### Tareas:

5.1. Crear componente `HeroSection` con parallax (ver `docs/ui-components.md` → Hero Section — Parallax)

5.2. Crear componente `SportCard` con hover effects y stagger

5.3. Crear componente `StatsCard` con count-up animation

5.4. Crear página Home (`/`):
- Hero section con parallax, fade-in-up del título, subtítulo y CTA
- Sección "Quiénes somos" con fade-in on scroll
- Sección "Nuestra misión" con fade-in on scroll
- Grid de disciplinas deportivas con SportCards + stagger
- Sección sponsors con logos slide-in
- Todo el contenido de `docs/pages-content.md` → Inicio

5.5. Crear página Directiva (`/club/directiva`):
- Hero o banner de sección
- Grid de directivos con foto, nombre y cargo
- Stagger animation en los cards de directivos
- Datos de `docs/pages-content.md` → Directiva

5.6. Crear página Instalaciones (`/club/instalaciones`):
- Info del Parque CUPRA
- Galería de imágenes (si disponibles) con zoom on hover
- Datos de `docs/pages-content.md` → Instalaciones

5.7. Crear páginas Estatuto y Reglamento (`/club/estatuto`, `/club/reglamento`):
- Visor de PDF o link de descarga desde Supabase Storage

5.8. Crear página Memorias (`/club/memorias`):
- Grid de cards por año (2014–2024)
- Botón de descarga por cada memoria
- Stagger animation

5.9. Crear páginas de disciplinas deportivas (7 páginas):
- `/deportes/basquetbol`
- `/deportes/corredores`
- `/deportes/handball`
- `/deportes/hockey`
- `/deportes/futbol`
- `/deportes/rugby`
- `/deportes/voley`
- Cada una con: hero/banner, categorías, horarios, contacto del referente
- Todo el contenido de `docs/pages-content.md`
- Animaciones: page transition, info cards stagger, contacto slide-in

5.10. Crear página Socios (`/socios`):
- Info de tipos de membresía (Colaborador y Deportivo)
- CTA para hacerse socio (link a registro)
- Datos de contacto de secretaría
- Horarios de atención

5.11. Crear página Beneficios (`/beneficios`):
- Info de la tarjeta de membresía
- Categorías de descuentos
- Grid de sponsors/partners

5.12. Configurar SEO: metadata, og:image, y structured data en cada página

5.13. Verificar que todas las 15 páginas renderizan correctamente con contenido y animaciones

### Entregable:
- 15 páginas públicas con contenido real
- Todas con animaciones de scroll, stagger, page transitions
- SEO configurado
- Responsive en mobile, tablet y desktop

---

## Fase 6 — Módulo de Secretaría (Socios y Disciplinas)

**Objetivo:** Panel de secretaría completo para gestionar socios, disciplinas y cuotas.

**Docs de referencia:** `docs/secretaria-socios.md`, `docs/database-schema.md`

### Tareas:

6.1. Crear dashboard de secretaría (`/secretaria`):
- Stats cards: total socios activos, morosos, altas del mes
- Gráfico de socios por disciplina (recharts)
- Cuotas cobradas vs. pendientes del mes
- Animaciones: stagger + count-up

6.2. Crear lista de socios (`/secretaria/socios`):
- DataTable con columnas: nombre, cédula, disciplinas, estado
- Búsqueda por nombre/cédula (debounced)
- Filtros: estado (activo/moroso/inactivo/suspendido), disciplina
- Paginación server-side
- Exportar a CSV
- Botón "+ Nuevo socio"

6.3. Crear formulario de alta de socio (`/secretaria/socios/nuevo`):
- Campos: nombre, apellido, cédula, teléfono, fecha de nacimiento (opcional)
- Selector múltiple de disciplinas con categoría
- Validación con Zod
- Flujo para vincular usuario existente o crear nuevo

6.4. Crear ficha del socio (`/secretaria/socios/[id]`):
- Datos personales editables
- Disciplinas asignadas (agregar/quitar)
- Historial de cuotas con tabla
- Registrar pago de cuota (modal)
- Cambiar estado (activo/moroso/inactivo/suspendido)
- Asignar roles adicionales

6.5. Crear gestión de disciplinas (`/secretaria/disciplinas`):
- CRUD: nombre, slug, descripción, imagen, contacto coordinador
- Toggle activa/inactiva
- Cantidad de socios por disciplina

6.6. Crear APIs:
- `GET/POST /api/socios` — listar y crear socios
- `GET/PUT/DELETE /api/socios/[id]` — ficha del socio
- `POST /api/socios/[id]/pagos` — registrar pago de cuota
- `POST /api/socios/[id]/disciplinas` — asignar disciplina
- `GET/POST/PUT /api/disciplinas` — CRUD disciplinas

6.7. Crear componente de carnet digital en `/mi-cuenta` para usuarios con rol `socio` (QR con perfil_id)

6.8. Verificar flujo completo: crear socio → asignar disciplina → registrar cuota → ver ficha → cambiar estado

### Entregable:
- Panel de secretaría funcional
- CRUD completo de socios y disciplinas
- Registro de pagos de cuotas
- Carnet digital con QR

---

## Fase 7 — Módulo de Tienda Online

**Objetivo:** Tienda pública con catálogo, carrito, y panel admin para gestionar productos, categorías y pedidos.

**Docs de referencia:** `docs/tienda-pos.md`, `docs/database-schema.md`

### Tareas:

7.1. Crear componente `ProductCard` con animaciones (hover lift, image zoom, add-to-cart bounce)

7.2. Crear hook `useCart` con estado en localStorage:
- Agregar, quitar, modificar cantidad
- Cálculo de totales
- Detección de socio para precios especiales

7.3. Crear página de listado de productos (`/tienda`):
- Búsqueda (debounced)
- Filtro por categoría (tabs con indicator animado)
- Ordenar por precio/nuevos
- Grid de ProductCards con stagger
- Paginación o infinite scroll
- Badge "Socio -X%" y "Agotado"

7.4. Crear página de detalle de producto (`/tienda/[slug]`):
- Galería de imágenes (carousel con crossfade)
- Info: nombre, descripción, precio, precio socio
- Selector de variante (talle/color)
- Selector de cantidad con stock máximo
- Botón "Agregar al carrito" animado
- Productos relacionados (stagger)

7.5. Crear página de carrito (`/tienda/carrito`):
- Lista de items con AnimatePresence (enter/exit)
- Modificar cantidad, eliminar
- Total con count-up animation
- Botón "Ir al checkout" (requiere auth)

7.6. Crear panel admin de productos (`/admin/productos`):
- DataTable con productos: nombre, categoría, precio, stock, estado
- Filtros y búsqueda
- Botón "+ Nuevo producto"

7.7. Crear formulario crear/editar producto (`/admin/productos/nuevo`, `/admin/productos/[id]`):
- Campos: nombre, slug, descripción, categoría, precio, precio socio, SKU, stock, stock mínimo
- Upload múltiple de imágenes a Supabase Storage (drag & drop, reorder)
- Gestión de variantes inline (tabla editable)
- Toggle activo/destacado
- Validación con Zod

7.8. Crear gestión de categorías (`/admin/categorias`):
- CRUD: nombre, slug, descripción, imagen, orden
- Toggle activa

7.9. Crear página de pedidos (`/admin/pedidos`):
- DataTable: número, fecha, cliente, tipo (online/POS), total, estado
- Filtros por estado, tipo, rango de fechas
- Click → detalle del pedido

7.10. Crear detalle de pedido (`/admin/pedidos/[id]`):
- Info del cliente
- Items con cantidades y precios
- Timeline de estados animada
- Botones de acción según estado (preparando → listo → retirado)

7.11. Crear vista de stock (`/admin/stock`):
- Productos con stock actual vs. mínimo
- Alertas para stock bajo
- Ajuste manual de stock (con motivo)
- Historial de movimientos

7.12. Crear APIs:
- `GET /api/productos` — catálogo público (filtros, paginación)
- `GET /api/productos/[slug]` — detalle producto
- `POST/PUT/DELETE /api/admin/productos` — CRUD admin
- `POST /api/admin/categorias` — CRUD categorías
- `GET/PUT /api/admin/pedidos` — gestión pedidos
- `POST /api/admin/stock/ajuste` — ajuste manual de stock

7.13. Verificar flujo: navegar tienda → agregar al carrito → ver carrito → admin crea producto → aparece en tienda

### Entregable:
- Tienda pública funcional con catálogo, búsqueda y carrito
- Panel admin con CRUD de productos, categorías, pedidos y stock
- Animaciones completas en toda la tienda

---

## Fase 8 — Integración MercadoPago (Tienda)

**Objetivo:** Checkout funcional con MercadoPago para compras online de la tienda.

**Docs de referencia:** `docs/tienda-pos.md` → Flujo de pago, Webhook

### Tareas:

8.1. Instalar SDK de MercadoPago:
```bash
npm install mercadopago
```

8.2. Crear `src/lib/mercadopago/client.ts` — configuración del SDK con access token

8.3. Crear página de checkout (`/tienda/checkout`):
- Resumen del pedido (items, cantidades, precios)
- Datos de contacto (pre-rellenados del perfil)
- Nota opcional
- Botón "Pagar con MercadoPago"
- Validación de stock antes de crear preferencia

8.4. Crear API route de checkout: `POST /api/checkout` (ver `docs/tienda-pos.md` → API Route: Crear checkout):
- Validar stock de cada item
- Calcular totales (con precio socio si aplica)
- Crear pedido en DB (estado: pendiente)
- Crear preferencia de MercadoPago
- Retornar URL de checkout

8.5. Crear webhook de MercadoPago: `POST /api/webhooks/mercadopago` (ver `docs/tienda-pos.md` → Webhook):
- Verificar firma del webhook
- Al pago aprobado: actualizar pedido → pagado, descontar stock, registrar pago
- Registrar en `pagos_mercadopago`

8.6. Crear página de confirmación: `/tienda/pedido/[id]`
- Mostrar estado del pedido
- Número de pedido
- Detalle de items
- Animación de éxito (confetti o checkmark animado)

8.7. Configurar back_urls (success, failure) en MercadoPago

8.8. Testing end-to-end con credenciales de test de MercadoPago

### Entregable:
- Checkout funcional de punta a punta
- Webhook procesando pagos correctamente
- Stock se descuenta al confirmar pago
- Página de confirmación de pedido

---

## Fase 9 — Punto de Venta (POS)

**Objetivo:** Interfaz de POS para venta presencial en el local, optimizada para tablet/PC.

**Docs de referencia:** `docs/tienda-pos.md` → Punto de Venta (POS)

### Tareas:

9.1. Crear página del POS (`/admin/pos`):
- Layout 2 columnas: productos (izq) + carrito (der)
- Responsive: stacked en mobile, side-by-side en >= lg

9.2. Panel izquierdo — Productos:
- Barra de búsqueda rápida
- Filtro por categoría (botones grandes, touch-friendly)
- Grid de productos con imagen, nombre, precio, stock
- Click/tap = agregar al carrito (+1)

9.3. Panel derecho — Carrito:
- Lista de items con +/- cantidad
- Eliminar item
- Campo opcional: nombre del cliente
- Campo opcional: buscar socio por cédula (para descuento)
- Subtotal y total animados

9.4. Cobro en efectivo:
- Click "Efectivo" → modal confirmación → crear pedido como `pagado`
- Opción de imprimir recibo

9.5. Cobro con MercadoPago QR:
- Click "MP QR" → generar QR dinámico → mostrar en modal
- Esperar confirmación vía webhook
- Feedback visual al confirmar pago
- (Ver `docs/tienda-pos.md` → MercadoPago QR para POS)

9.6. Crear API: `POST /api/pos/venta` — crear pedido tipo POS con descuento stock inmediato

9.7. Crear API: `POST /api/pos/qr` — generar QR dinámico de MercadoPago

9.8. Post-venta: limpiar carrito, listo para siguiente venta

9.9. Verificar flujo completo: buscar producto → agregar al carrito → cobrar efectivo → stock baja → nueva venta

### Entregable:
- POS funcional con cobro en efectivo y MercadoPago QR
- Búsqueda de socio para descuentos
- Interfaz touch-friendly para tablet
- Stock se actualiza en tiempo real

---

## Fase 10 — Módulo de Proveedores

**Objetivo:** Gestión completa de proveedores, compras, recepción de mercadería y cuentas corrientes.

**Docs de referencia:** `docs/proveedores.md`, `docs/database-schema.md`

### Tareas:

10.1. Crear lista de proveedores (`/admin/proveedores`):
- DataTable: nombre, RUT, saldo cuenta corriente, estado
- Búsqueda
- Botón "+ Nuevo proveedor"

10.2. Crear formulario de proveedor (`/admin/proveedores/nuevo`):
- Campos: nombre, RUT, razón social, contacto, dirección, notas
- Validación con Zod

10.3. Crear ficha del proveedor (`/admin/proveedores/[id]`):
- Datos editables
- Estado de cuenta corriente (saldo con indicador visual)
- Productos que suministra
- Últimas compras (tabla)
- Historial de pagos (tabla)
- Botón "Registrar pago"
- Estado de cuenta detallado (debe/haber cronológico)

10.4. Crear lista de compras (`/admin/compras`):
- DataTable: número, proveedor, fecha, total, estado
- Filtros por estado y proveedor

10.5. Crear formulario de nueva compra (`/admin/compras/nueva`):
- Selector de proveedor
- Tabla editable de items (producto, cantidad, costo unitario)
- Cálculo automático de subtotales y total
- Guardar como borrador o confirmar

10.6. Crear detalle de compra (`/admin/compras/[id]`):
- Info de la compra y proveedor
- Items con cantidades
- Botones: confirmar, recibir mercadería, cancelar
- Al recibir: actualiza stock + registra movimientos

10.7. Crear modal "Registrar pago" a proveedor:
- Monto, método de pago, referencia, notas
- Opción de vincular a compra específica
- Al guardar: trigger actualiza saldo cuenta corriente

10.8. Crear APIs:
- `GET/POST/PUT /api/admin/proveedores`
- `GET/POST/PUT /api/admin/compras`
- `POST /api/admin/compras/[id]/recibir`
- `POST /api/admin/proveedores/[id]/pagos`

10.9. Verificar flujo: crear proveedor → crear compra → confirmar → recibir mercadería (stock sube) → pagar (saldo baja)

### Entregable:
- CRUD de proveedores con ficha completa
- Gestión de compras con flujo borrador → confirmada → recibida
- Recepción de mercadería actualiza stock automáticamente
- Pagos a proveedores con cuenta corriente

---

## Fase 11 — Módulo de Eventos y Entradas

**Objetivo:** Gestión de eventos, tipos y lotes de entradas, compra online, y panel admin.

**Docs de referencia:** `docs/eventos-entradas.md`, `docs/database-schema.md`

### Tareas:

11.1. Crear componente `EventCard` con animaciones

11.2. Crear listado público de eventos (`/eventos`):
- Tabs: Próximos / Pasados
- Cards con imagen, título, fecha, lugar, precio mínimo
- Stagger animation

11.3. Crear detalle de evento (`/eventos/[slug]`):
- Hero con imagen
- Info: título, fecha, lugar, descripción
- Sección de entradas por tipo con lote activo
- Selector de cantidad
- Botón "Comprar" (requiere auth)
- Indicador de disponibilidad
- Progress bar de capacidad

11.4. Crear flujo de compra de entrada:
- Modal de confirmación con datos del asistente (pre-rellenados)
- Crear preferencia MercadoPago
- Webhook confirma → entrada pasa a `pagada`
- Generar QR con UUID de la entrada

11.5. Crear panel admin eventos (`/eventos/admin`):
- Lista de eventos (tabs: Próximos / Pasados / Borradores)
- Estadísticas por evento: vendidas/capacidad, recaudación

11.6. Crear formulario crear/editar evento (`/eventos/crear`, `/eventos/[id]/editar`):
- Campos: título, slug, descripción, imagen, lugar, fecha, capacidad
- Gestión inline de tipos de entrada (nombre, precio, capacidad, solo socios)
- Gestión inline de lotes por tipo (nombre, precio, cantidad, fechas)
- Toggle gratuito / requiere registro

11.7. Crear gestión de entradas por evento (`/eventos/[id]/entradas`):
- DataTable: asistente, cédula, tipo, lote, estado, fecha
- Filtros por tipo, lote, estado
- Venta manual (cortesía / efectivo)
- Exportar a CSV
- Estadísticas: vendidas por tipo/lote, recaudación, % capacidad

11.8. Crear APIs:
- `GET /api/eventos` — listado público
- `GET /api/eventos/[slug]` — detalle con entradas disponibles
- `POST /api/eventos/comprar` — comprar entrada (crea preferencia MP)
- `GET/POST/PUT /api/admin/eventos` — CRUD admin
- `GET /api/admin/eventos/[id]/entradas` — listado entradas

11.9. Crear sección "Mis entradas" en `/mi-cuenta/entradas`:
- Listado de entradas compradas
- QR visible para cada entrada
- Estado (pagada, usada, cancelada)

11.10. Verificar flujo: crear evento con tipos y lotes → publicar → comprar entrada → ver QR en mi cuenta

### Entregable:
- Listado público de eventos
- Compra de entradas con MercadoPago
- QR generado por entrada
- Panel admin completo
- Mis entradas con QR

---

## Fase 12 — Escáner de QR

**Objetivo:** Escáner funcional para validar entradas en la puerta del evento, con feedback visual y estadísticas en tiempo real.

**Docs de referencia:** `docs/eventos-entradas.md` → Escáner de QR

### Tareas:

12.1. Instalar librerías de QR:
```bash
npm install qrcode @yudiel/react-qr-scanner
```

12.2. Crear `src/lib/qr/generate.ts` — funciones de generación de QR (ver `docs/eventos-entradas.md` → Generación de QR)

12.3. Crear página del scanner (`/eventos/scanner`):
- Selector de evento activo
- Componente de cámara QR
- Panel de resultado del último escaneo con feedback visual (colores + sonido + vibración)
- Estadísticas: ingresaron / capacidad con progress bar
- Lista de últimos escaneos

12.4. Crear API de escaneo: `POST /api/eventos/escanear`:
- Buscar entrada por código UUID
- Validar: existe, evento correcto, no usada, no cancelada
- Si válida: marcar como `usada`
- Siempre registrar en `escaneos_entrada`
- Retornar resultado con datos del asistente

12.5. Implementar feedback visual del scanner (ver tabla de resultados en `docs/eventos-entradas.md`):
- Verde: válido
- Amarillo: ya ingresó
- Rojo: no válido / otro evento / cancelada
- Flash overlay animado con Framer Motion

12.6. Implementar Supabase Realtime para estadísticas en vivo:
- Suscribirse a inserts en `escaneos_entrada` filtrado por evento
- Actualizar contador y lista sin refresh

12.7. Verificar flujo completo: comprar entrada → obtener QR → escanear → marca como usada → intento doble rechazado

### Entregable:
- Escáner de QR funcionando con cámara
- Feedback visual y sonoro
- Estadísticas en tiempo real con Supabase Realtime
- Log completo de escaneos

---

## Fase 13 — Panel Mi Cuenta

**Objetivo:** Página de perfil personal para todos los usuarios (socios y no-socios).

**Docs de referencia:** `docs/secretaria-socios.md` → Carnet Digital, `docs/tienda-pos.md`, `docs/eventos-entradas.md`

### Tareas:

13.1. Crear página Mi Cuenta (`/mi-cuenta`):
- Datos personales editables (nombre, apellido, teléfono, avatar)
- Si es socio: carnet digital con QR, estado, disciplinas
- Tabs animados para secciones

13.2. Crear sección "Mis Pedidos" (`/mi-cuenta/pedidos`):
- Historial de pedidos de la tienda
- Estado de cada pedido
- Detalle expandible

13.3. Crear sección "Mis Entradas" (`/mi-cuenta/entradas`):
- Entradas compradas con QR
- Estado de cada entrada
- Próximos eventos con entradas activas

13.4. Crear APIs:
- `GET/PUT /api/perfil` — datos del usuario
- `GET /api/perfil/pedidos` — pedidos del usuario
- `GET /api/perfil/entradas` — entradas del usuario

13.5. Upload de avatar a Supabase Storage

13.6. Verificar que todo funciona para socio y no-socio

### Entregable:
- Página Mi Cuenta completa
- Carnet digital para socios
- Historial de pedidos y entradas
- Avatar editable

---

## Fase 14 — Pulido, Performance y QA

**Objetivo:** Pulir animaciones, optimizar performance, corregir bugs y preparar para producción.

### Tareas:

14.1. Auditoría de animaciones:
- Verificar que TODAS las páginas cumplen con el checklist de `docs/ui-components.md` → Checklist de Animaciones por Página
- Verificar `prefers-reduced-motion` desactiva animaciones
- Verificar que no hay jank o stuttering

14.2. Performance:
- Lighthouse audit (target: 90+ en todas las categorías)
- Optimizar imágenes (next/image con sizes y priority)
- Lazy loading de componentes pesados (scanner, recharts)
- Verificar bundle size (code splitting correcto)

14.3. Responsive QA:
- Testing en iPhone SE, iPhone 14, iPad, desktop 1920px
- Verificar todos los breakpoints
- POS funciona bien en tablet

14.4. Seguridad:
- Verificar todas las RLS policies
- Verificar que middleware bloquea rutas correctamente
- Verificar que webhooks validan firma
- Revisar que no hay secrets expuestos

14.5. SEO:
- Verificar metadata en todas las páginas públicas
- Sitemap.xml
- robots.txt
- og:image para compartir en redes

14.6. Accesibilidad:
- Navegación con teclado
- Labels en todos los inputs
- Alt text en imágenes
- Contraste suficiente

14.7. Error handling:
- Páginas error.tsx en cada segmento
- Manejo graceful de errores de red
- Estados vacíos con EmptyState component

14.8. Corregir todos los bugs encontrados

### Entregable:
- Aplicación pulida y lista para deploy
- Lighthouse 90+
- Sin bugs conocidos
- Accesible y responsive

---

## Fase 15 — Deploy a Producción

**Objetivo:** Aplicación desplegada en Vercel con dominio configurado.

### Tareas:

15.1. Configurar proyecto en Vercel:
- Conectar repositorio
- Configurar variables de entorno de producción

15.2. Configurar Supabase producción:
- Crear proyecto en Supabase cloud
- Ejecutar migraciones
- Ejecutar seed con datos reales
- Configurar Storage buckets

15.3. Configurar MercadoPago producción:
- Cambiar credenciales de test a producción
- Configurar webhook URL de producción

15.4. Configurar dominio:
- Apuntar `clubseminario.com.uy` a Vercel
- Configurar SSL

15.5. Subir contenido real:
- Imágenes de deportes, instalaciones
- PDFs de estatuto, reglamento, memorias
- Datos de directivos actuales
- Productos iniciales de la tienda

15.6. Crear usuario super_admin inicial

15.7. Testing final en producción

15.8. Lanzamiento

### Entregable:
- Sitio en producción en clubseminario.com.uy
- Todos los módulos funcionando
- Datos reales cargados

---

## Resumen de Fases

| Fase | Nombre | Dependencias |
|------|--------|-------------|
| 1 | Setup del Proyecto | — |
| 2 | Base de Datos y Auth | Fase 1 |
| 3 | Autenticación y Roles | Fase 2 |
| 4 | Layout y Navegación | Fase 1, 3 |
| 5 | Páginas Institucionales | Fase 4 |
| 6 | Secretaría (Socios) | Fase 4 |
| 7 | Tienda Online | Fase 4 |
| 8 | MercadoPago (Tienda) | Fase 7 |
| 9 | Punto de Venta (POS) | Fase 7, 8 |
| 10 | Proveedores | Fase 7 |
| 11 | Eventos y Entradas | Fase 4, 8 |
| 12 | Escáner de QR | Fase 11 |
| 13 | Panel Mi Cuenta | Fase 6, 7, 11 |
| 14 | Pulido y QA | Todas |
| 15 | Deploy | Fase 14 |

```
Fase 1 → Fase 2 → Fase 3 → Fase 4 ──┬── Fase 5 (Páginas)
                                       ├── Fase 6 (Secretaría) ───────────┐
                                       ├── Fase 7 (Tienda) → Fase 8 (MP) ┼→ Fase 13 (Mi Cuenta)
                                       │     ├── Fase 9 (POS)             │
                                       │     └── Fase 10 (Proveedores)    │
                                       └── Fase 11 (Eventos) → Fase 12 ──┘
                                                                    ↓
                                                              Fase 14 (QA) → Fase 15 (Deploy)
```
