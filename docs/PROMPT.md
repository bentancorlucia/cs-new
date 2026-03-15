# PROMPT — Rediseño Club Seminario

## Contexto

Sos un desarrollador senior full-stack especializado en Next.js y Supabase. Tu tarea es rediseñar completamente el sitio web de **Club Seminario** (clubseminario.com.uy), un club deportivo, social y cultural de la comunidad jesuita en Uruguay, fundado el 13 de mayo de 2010.

El sitio actual es estático (HTML/CSS/JS) con información institucional. El nuevo sitio debe ser una **aplicación web moderna, responsive y funcional** que mantenga toda la información original y agregue módulos de tienda, eventos y gestión administrativa.

## Objetivo General

Crear una aplicación Next.js 14+ con App Router que:

1. **Replique todas las páginas públicas del sitio actual** con diseño moderno (ver `docs/pages-content.md`)
2. **Agregue una tienda online** con stock, pagos por MercadoPago, y pickup (sin envíos) (ver `docs/tienda-pos.md`)
3. **Agregue un punto de venta (POS)** web simple para venta presencial en el local (ver `docs/tienda-pos.md`)
4. **Agregue gestión de proveedores** con cuentas corrientes (ver `docs/proveedores.md`)
5. **Agregue gestión de eventos** con venta de entradas, tipos y lotes, QR y escáner (ver `docs/eventos-entradas.md`)
6. **Agregue secretaría digital** para gestión de socios y disciplinas (ver `docs/secretaria-socios.md`)
7. **Implemente un sistema de roles multi-panel** (ver `docs/auth-roles.md`)

## Stack Obligatorio

| Tecnología | Uso |
|---|---|
| Next.js 14+ (App Router) | Framework principal |
| Supabase | Auth, DB (PostgreSQL), Storage, Realtime |
| Shadcn/ui | Componentes UI |
| Tailwind CSS v4 | Estilos |
| TypeScript | Todo el código, strict mode |
| Zod | Validación de formularios y APIs |
| MercadoPago SDK | Pagos (Checkout Pro + QR dinámico) |
| Vercel | Deployment |

## Colores del Club

```css
--bordo: #730d32;       /* Primario */
--amarillo: #f7b643;    /* Acento / CTAs */
--fondo-claro: #faf8f5; /* Background principal */
--fondo-oscuro: #1a1a1a;/* Footer, secciones dark */
--texto: #1f1f1f;       /* Texto principal */
--texto-muted: #6b7280; /* Texto secundario */
```

## Instrucciones de Desarrollo

### Antes de implementar cualquier módulo:
1. **Leer `CLAUDE.md`** para entender la estructura del proyecto
2. **Leer el doc específico del módulo** en `docs/` (ej: `docs/tienda-pos.md` antes de tocar la tienda)
3. **Leer `docs/database-schema.md`** para entender las relaciones entre tablas
4. **Leer `docs/auth-roles.md`** para implementar correctamente permisos y guards

### Plan de implementación por fases:
El proyecto se implementa en **15 fases incrementales**. Consultar `docs/implementation-plan.md` para el detalle completo de cada fase con tareas específicas, dependencias y entregables.

**Uso:** Decir "implementa fase X" para ejecutar una fase. No avanzar a la siguiente hasta que la actual funcione.

Resumen: Fase 1 (Setup) → 2 (DB) → 3 (Auth) → 4 (Layout) → 5 (Páginas) → 6 (Secretaría) → 7 (Tienda) → 8 (MercadoPago) → 9 (POS) → 10 (Proveedores) → 11 (Eventos) → 12 (Scanner) → 13 (Mi Cuenta) → 14 (QA) → 15 (Deploy)

### Principios clave:
- **Mobile-first**: Todo se diseña primero para mobile y se adapta a desktop
- **Server Components por defecto**: Solo usar `"use client"` cuando hay interactividad
- **RLS en toda tabla**: Row Level Security siempre activado en Supabase
- **Validación dual**: Zod en frontend + verificación en API/middleware
- **Optimistic UI**: Para acciones frecuentes (carrito, likes, etc.)
- **Accesibilidad**: Usar componentes Shadcn/ui que ya son accesibles por defecto
- **SEO**: Metadata, Open Graph, y structured data en páginas públicas
- **Idioma**: Todo en español (es-UY), sin internacionalización

### ⚡ PRIORIDAD MÁXIMA: Dinamismo, Smoothness y Animaciones
El sitio debe sentirse **vivo, dinámico y premium**. Cada interacción, transición y aparición de contenido debe ser suave y animada. Esto NO es opcional, es un requerimiento central del proyecto. Consultar `docs/ui-components.md` para la guía completa de motion design.

Principios de motion design:
- **Todo elemento visible debe animarse** al entrar en pantalla (fade, slide, scale, stagger)
- **Toda interacción tiene feedback** — hovers, clicks, focus, drags
- **Las transiciones de página son animadas** — nunca un cambio brusco de contenido
- **Los datos numéricos animan** al cambiar (count-up, spring)
- **Las listas animan** al agregar/quitar items (AnimatePresence + layout)
- **Scroll-driven animations** en todas las páginas públicas
- **Micro-interacciones** en cada componente interactivo
- Framer Motion es la librería principal y es **obligatoria**, no opcional

### Sobre el diseño visual:
- Estilo limpio, moderno, con mucho espacio en blanco
- Hero sections con imágenes de deportes del club + parallax sutil en scroll
- Cards con bordes suaves, sombras sutiles, y hover effects (lift + shadow + scale)
- Transiciones suaves en TODOS los cambios de estado (loading → content, tab switches, filtros)
- Tipografía: Inter o similar sans-serif moderna
- Iconografía: Lucide icons (incluido con Shadcn) con animaciones de entrada
- Footer con info de contacto, redes sociales y mapa del sitio
- Navbar sticky con efecto blur/glass-morphism al scrollear + transición suave de background
- Page transitions animadas (fade + slide entre rutas)
- Skeleton loaders animados (shimmer effect) en toda carga de datos
- Smooth scrolling habilitado globalmente (`scroll-behavior: smooth`)

## Variables de Entorno Necesarias

```env
# Supabase
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=

# MercadoPago
MERCADOPAGO_ACCESS_TOKEN=
MERCADOPAGO_PUBLIC_KEY=
NEXT_PUBLIC_MERCADOPAGO_PUBLIC_KEY=

# App
NEXT_PUBLIC_APP_URL=
```

## Resultado Esperado

Una aplicación web profesional, completa y funcional que:
- **Se sienta viva y dinámica** — animaciones, transiciones y micro-interacciones en toda la experiencia
- Se vea moderna y sea fácil de usar para cualquier persona
- Funcione perfectamente en celular, tablet y desktop
- **Cada interacción tenga feedback visual** — nunca un click sin respuesta, nunca un cambio sin transición
- Permita a los socios y no-socios comprar en la tienda y adquirir entradas
- Permita al staff administrar tienda, eventos, socios y proveedores desde paneles dedicados
- Sea segura, con roles bien definidos y permisos granulares
- Sea mantenible y escalable gracias a buena arquitectura y código tipado
- **Se destaque visualmente** de otros sitios de clubes deportivos por su calidad de motion design
