# Club Seminario - Proyecto Web

## Descripción del Proyecto

Rediseño completo del sitio web de Club Seminario (clubseminario.com.uy) — club deportivo, social y cultural de la comunidad jesuita en Uruguay. El nuevo sitio incluye tienda online, gestión de eventos con entradas/QR, panel de secretaría para socios, y punto de venta físico.

## Stack Tecnológico

- **Framework**: Next.js 14+ (App Router)
- **Base de datos**: Supabase (PostgreSQL + Auth + Storage + Realtime)
- **UI**: Shadcn/ui + Tailwind CSS v4
- **Animaciones**: Framer Motion (PRIORIDAD — ver docs/ui-components.md)
- **Tipografías**: Clash Display (display), Cabinet Grotesk (headings), Satoshi (body) — de Fontshare
- **Lenguaje**: TypeScript (strict mode)
- **Pagos**: MercadoPago SDK (checkout pro + QR para POS)
- **QR**: Generación y escaneo de códigos QR para entradas y carnet de socio
- **Deployment**: Vercel
- **Idioma del sitio**: Español (Uruguay)

## Colores del Club

```
Primario (Bordó):  #730d32
Acento (Amarillo): #f7b643
Fondo claro:       #faf8f5
Fondo oscuro:      #1a1a1a
Texto principal:   #1f1f1f
Texto secundario:  #6b7280
```

## Estructura de Carpetas

```
/
├── CLAUDE.md                    # Este archivo
├── docs/                        # Documentación de skills y especificaciones
│   ├── PROMPT.md                # Prompt principal de desarrollo
│   ├── database-schema.md       # Esquema completo de Supabase
│   ├── auth-roles.md            # Sistema de autenticación y roles
│   ├── tienda-pos.md            # Tienda online + POS físico
│   ├── eventos-entradas.md      # Eventos, entradas, QR
│   ├── secretaria-socios.md     # Gestión de socios y disciplinas
│   ├── proveedores.md           # Gestión de proveedores y cuentas corrientes
│   ├── pages-content.md         # Contenido original del sitio a migrar
│   └── ui-components.md         # Sistema de diseño y componentes UI
├── src/
│   ├── app/                     # App Router de Next.js
│   │   ├── (public)/            # Páginas públicas del sitio
│   │   │   ├── page.tsx         # Home / Inicio
│   │   │   ├── club/
│   │   │   │   ├── directiva/
│   │   │   │   ├── instalaciones/
│   │   │   │   ├── estatuto/
│   │   │   │   ├── reglamento/
│   │   │   │   └── memorias/
│   │   │   ├── deportes/
│   │   │   │   ├── basquetbol/
│   │   │   │   ├── corredores/
│   │   │   │   ├── handball/
│   │   │   │   ├── hockey/
│   │   │   │   ├── futbol/
│   │   │   │   ├── rugby/
│   │   │   │   └── voley/
│   │   │   ├── socios/
│   │   │   ├── beneficios/
│   │   │   ├── tienda/           # Tienda online pública
│   │   │   └── eventos/          # Listado de eventos público
│   │   ├── (auth)/               # Login / registro
│   │   │   ├── login/
│   │   │   └── registro/
│   │   ├── (dashboard)/          # Paneles protegidos por rol
│   │   │   ├── layout.tsx        # Layout con sidebar + role switcher
│   │   │   ├── admin/            # Panel admin tienda
│   │   │   │   ├── productos/
│   │   │   │   ├── pedidos/
│   │   │   │   ├── stock/
│   │   │   │   ├── proveedores/
│   │   │   │   └── pos/          # Punto de venta físico
│   │   │   ├── eventos/          # Panel admin eventos
│   │   │   │   ├── crear/
│   │   │   │   ├── entradas/
│   │   │   │   └── scanner/      # Escáner de QR
│   │   │   ├── secretaria/       # Panel secretaría
│   │   │   │   ├── socios/
│   │   │   │   └── disciplinas/
│   │   │   └── mi-cuenta/        # Perfil del usuario / socio
│   │   ├── api/                  # Route handlers
│   │   └── layout.tsx
│   ├── components/
│   │   ├── ui/                   # Shadcn/ui components
│   │   ├── layout/               # Header, Footer, Sidebar, RoleSwitcher
│   │   ├── tienda/               # Componentes de tienda
│   │   ├── eventos/              # Componentes de eventos
│   │   ├── pos/                  # Componentes de POS
│   │   └── shared/               # Componentes compartidos
│   ├── lib/
│   │   ├── supabase/             # Cliente Supabase (server/client)
│   │   ├── mercadopago/          # Integración MercadoPago
│   │   ├── qr/                   # Generación y validación de QR
│   │   └── utils.ts
│   ├── hooks/                    # Custom hooks
│   ├── types/                    # TypeScript types (generados de Supabase + custom)
│   └── middleware.ts             # Auth middleware + role-based routing
├── supabase/
│   ├── migrations/               # Migraciones SQL
│   ├── seed.sql                  # Datos iniciales
│   └── config.toml
├── public/
│   └── images/
├── .env.local.example
├── package.json
└── tailwind.config.ts
```

## Convenciones de Código

- Usar `"use client"` solo cuando sea estrictamente necesario (interactividad)
- Server Components por defecto
- Supabase SSR con `createServerClient` en Server Components y Route Handlers
- Supabase Browser con `createBrowserClient` en Client Components
- Nombres de archivos: kebab-case
- Nombres de componentes: PascalCase
- Nombres de tablas en Supabase: snake_case, plural (ej: `productos`, `pedidos`)
- Validación con Zod en forms y API routes
- Siempre usar TypeScript strict
- Consultar `docs/` antes de implementar cualquier módulo

## Roles del Sistema

| Rol | Acceso |
|-----|--------|
| `super_admin` | Todo el sistema |
| `tienda` | Panel admin tienda + POS + proveedores |
| `secretaria` | Panel secretaría + gestión de socios |
| `eventos` | Panel eventos + creación + entradas |
| `scanner` | Solo escáner de QR en eventos |
| `socio` | Mi cuenta + descuentos + compra entradas |
| `no_socio` | Navegación pública + compra tienda/entradas |

Un perfil puede tener múltiples roles. El dashboard tiene un **Role Switcher** para cambiar entre paneles.

## Comandos

```bash
# Desarrollo
npm run dev

# Generar tipos de Supabase
npx supabase gen types typescript --local > src/types/database.ts

# Migraciones
npx supabase migration new <nombre>
npx supabase db push

# Linting
npm run lint
npm run type-check
```

## Reglas Importantes

1. **Nunca hardcodear credenciales** — usar variables de entorno
2. **Row Level Security (RLS)** activado en TODAS las tablas de Supabase
3. **Validar roles en middleware Y en la API** — nunca confiar solo en el frontend
4. **Optimistic UI** para acciones de tienda (agregar al carrito, etc.)
5. **Imágenes** subidas a Supabase Storage con URLs firmadas para productos
6. **MercadoPago Webhooks** para confirmar pagos — nunca marcar como pagado desde el frontend
7. **Mobile-first** — todo el diseño empieza desde mobile y escala
8. **Consultar docs/** antes de implementar módulos — ahí está la especificación completa

## ⚡ PRIORIDAD: Dinamismo, Animaciones y Smoothness

Este proyecto prioriza una experiencia visual **dinámica, fluida y premium**. La UI debe sentirse viva, no estática. Consultar `docs/ui-components.md` para la guía completa de animaciones.

**Reglas obligatorias:**
- **Framer Motion es obligatorio** en todos los componentes visibles al usuario
- **Toda transición de página** debe ser animada (fade, slide, o layout animations)
- **Todo elemento que aparece en pantalla** debe tener entrada animada (stagger, fade-in, slide-up)
- **Toda interacción del usuario** debe tener feedback visual inmediato (hover, press, focus)
- **Los números y contadores** deben animar al cambiar (count-up animations)
- **Scroll-triggered animations** en todas las secciones de páginas públicas
- **Smooth scrolling** habilitado globalmente
- **Transiciones de layout** cuando cambian datos (AnimatePresence para listas)
- **Micro-interacciones** en botones, cards, inputs, toggles y tabs
- **Nunca mostrar contenido de golpe** — siempre transicionar desde un estado anterior
