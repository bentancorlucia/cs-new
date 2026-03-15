# Sistema de Diseno y Componentes UI

## Direccion Estetica: Editorial Sports Luxury

La identidad visual de Club Seminario fusiona la energia cruda del deporte con la sofisticacion de una revista editorial de alta gama. El sitio debe sentirse como abrir una publicacion deportiva premium — tipografia dramatica, composicion asimetrica con proposito, y una paleta que golpea con elegancia.

**Palabra clave**: *Bold refinement* — nunca timido, nunca ruidoso. Cada elemento tiene peso visual y razon de ser.

---

## Principios de Diseno

1. **Tipografia como protagonista**: Los titulos son piezas graficas en si mismos. Escala dramatica, pesos contrastantes, tracking ajustado
2. **Dinamico y fluido**: Todo se anima, todo transiciona, nada aparece de golpe (Framer Motion obligatorio)
3. **Contraste intencional**: Combinar elementos grandes con pequenos, densos con espaciosos, oscuros con claros
4. **Composicion editorial**: Layouts asimetricos, elementos que rompen la grilla, overlapping intencional
5. **Mobile-first**: Disenar para celular primero, pero no sacrificar la experiencia desktop
6. **Accesible**: Contraste WCAG AA minimo, tamanos de toque 44px, labels en inputs

---

## Sistema Tipografico

### Fuentes

La tipografia es el elemento diferenciador principal. Usamos un sistema de tres niveles:

| Rol | Fuente | Peso | Uso |
|-----|--------|------|-----|
| **Display** | **Clash Display** (Fontshare) | 600, 700 | Heroes, titulos principales, numeros grandes, statements |
| **Heading** | **Cabinet Grotesk** (Fontshare) | 500, 700, 800 | H2-H4, subtitulos, labels de seccion, nav items |
| **Body** | **Satoshi** (Fontshare) | 400, 500, 700 | Parrafos, UI, botones, inputs, tablas |

> Todas las fuentes son de [Fontshare](https://www.fontshare.com/) — gratuitas para uso comercial, alto rendimiento, y con personalidad real. Nada generico.

### Escala Tipografica

Sistema de escala con contraste dramatico entre niveles. Los titulos son GRANDES, el body es legible.

```
--text-hero:     clamp(3.5rem, 8vw, 8rem)    /* Hero principal — impacto maximo */
--text-display:  clamp(2.5rem, 5vw, 5rem)     /* Titulos de seccion */
--text-h1:       clamp(2rem, 3.5vw, 3.5rem)   /* H1 de paginas internas */
--text-h2:       clamp(1.5rem, 2.5vw, 2.25rem)/* H2 */
--text-h3:       clamp(1.25rem, 2vw, 1.5rem)  /* H3 */
--text-h4:       1.125rem                      /* H4 */
--text-body:     1rem                          /* Body principal */
--text-small:    0.875rem                      /* Captions, metadata */
--text-xs:       0.75rem                       /* Badges, labels diminutos */
```

### Reglas Tipograficas

- **Titulos display**: `font-display`, `uppercase`, `tracking-tight` (-0.02em a -0.04em), `leading-none` (0.9-0.95)
- **Headings**: `font-heading`, `tracking-tight` (-0.01em), `leading-tight` (1.1-1.2)
- **Body**: `font-body`, `tracking-normal`, `leading-relaxed` (1.6-1.7)
- **Numeros grandes** (precios, stats, contadores): `font-display`, `tabular-nums`, tamano exagerado respecto al contexto
- **Labels de seccion**: `font-heading`, `uppercase`, `tracking-widest` (0.15em), `text-small`, color `text-muted`
- **Nunca usar mas de 2 pesos** en un mismo componente — crear jerarquia con tamano y tracking, no con bold vs regular

### Tecnicas Tipograficas Avanzadas

- **Split text animations**: Los titulos hero se animan letra por letra o palabra por palabra con stagger
- **Text gradient**: Titulos selectos con gradient de bordo a dorado usando `bg-clip-text`
- **Mixed weight titles**: Combinar peso 400 con 700 en el mismo titulo para crear enfasis ("Somos **Seminario**")
- **Outlined text**: Titulos decorativos con `-webkit-text-stroke` sobre fondos con imagen
- **Numeros oversized**: En stats y dashboards, los numeros tienen un tamano 3-4x mayor que su label

---

## Paleta de Colores

### Colores Base

```
Bordo primario:   #730d32   — Identidad. Usado en CTAs primarios, acentos fuertes, hover states
Dorado acento:    #f7b643   — Energia. Badges, highlights, elementos de accion secundarios
Crema fondo:      #faf8f5   — Calidez. Background principal, respira
Oscuro:           #1a1a1a   — Profundidad. Footer, hero overlays, texto principal
Texto:            #1f1f1f   — Legibilidad. Body text
Texto muted:      #94918b   — Contexto. Metadata, placeholders, captions (warm gray, no cool gray)
```

### Paleta Extendida — Tailwind Config

```typescript
// tailwind.config.ts
import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        bordo: {
          50: "#fdf2f5",
          100: "#fce7ec",
          200: "#f9d0db",
          300: "#f4a9bc",
          400: "#ec7596",
          500: "#e04a74",
          600: "#cc2a5a",
          700: "#ab1d47",
          800: "#730d32", // PRIMARY
          900: "#5f0b29",
          950: "#3a0417",
        },
        dorado: {
          50: "#fefbf0",
          100: "#fef5d4",
          200: "#fdeaa8",
          300: "#f7b643", // PRIMARY ACCENT
          400: "#f5a623",
          500: "#e8900a",
          600: "#cc6e06",
          700: "#a94f09",
          800: "#8a3e10",
          900: "#723410",
        },
        fondo: "#faf8f5",
        superficie: "#f5f2ed",  // cards, elevated surfaces
        linea: "#e8e4de",       // borders, dividers (warm)
      },
      fontFamily: {
        display: ['"Clash Display"', "sans-serif"],
        heading: ['"Cabinet Grotesk"', "sans-serif"],
        body: ['"Satoshi"', "sans-serif"],
        sans: ['"Satoshi"', "sans-serif"], // default de Tailwind
      },
      fontSize: {
        hero: ["clamp(3.5rem, 8vw, 8rem)", { lineHeight: "0.9", letterSpacing: "-0.04em" }],
        display: ["clamp(2.5rem, 5vw, 5rem)", { lineHeight: "0.95", letterSpacing: "-0.03em" }],
        "title-1": ["clamp(2rem, 3.5vw, 3.5rem)", { lineHeight: "1.05", letterSpacing: "-0.02em" }],
        "title-2": ["clamp(1.5rem, 2.5vw, 2.25rem)", { lineHeight: "1.1", letterSpacing: "-0.01em" }],
        "title-3": ["clamp(1.25rem, 2vw, 1.5rem)", { lineHeight: "1.2", letterSpacing: "-0.01em" }],
      },
      letterSpacing: {
        tightest: "-0.04em",
        editorial: "0.15em",
      },
      borderRadius: {
        DEFAULT: "0.625rem", // 10px — ligeramente mas redondeado que 8px
        lg: "0.875rem",
        xl: "1.25rem",
        "2xl": "1.5rem",
      },
      boxShadow: {
        "card": "0 1px 3px rgba(26, 26, 26, 0.04), 0 4px 12px rgba(26, 26, 26, 0.03)",
        "card-hover": "0 8px 30px rgba(115, 13, 50, 0.08), 0 2px 8px rgba(26, 26, 26, 0.04)",
        "elevated": "0 12px 40px rgba(26, 26, 26, 0.08), 0 4px 12px rgba(26, 26, 26, 0.04)",
        "bordo-glow": "0 0 40px rgba(115, 13, 50, 0.15)",
        "dorado-glow": "0 0 30px rgba(247, 182, 67, 0.2)",
        "inner-border": "inset 0 0 0 1px rgba(26, 26, 26, 0.06)",
      },
      backgroundImage: {
        "gradient-bordo": "linear-gradient(135deg, #730d32, #3a0417)",
        "gradient-dorado": "linear-gradient(135deg, #f7b643, #e8900a)",
        "gradient-warm": "linear-gradient(180deg, #faf8f5 0%, #f5f2ed 100%)",
        "gradient-hero": "linear-gradient(180deg, rgba(26,26,26,0) 0%, rgba(26,26,26,0.4) 40%, rgba(26,26,26,0.85) 100%)",
        "noise": "url('/images/noise.png')",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
};

export default config;
```

### Uso del Color — Reglas

- **Bordo** es el color de poder. Usarlo con intencion: CTAs principales, hovers, acentos de marca. No saturar.
- **Dorado** es el color de energia. Badges, highlights, notificaciones, elementos que necesitan atencion.
- **El fondo NO es blanco puro** — es crema calido (#faf8f5). Esto le da calidez sin esfuerzo.
- **Las superficies elevadas** (cards, modals, popovers) usan blanco puro (#ffffff) para crear contraste con el fondo crema.
- **Los borders son calidos** (#e8e4de), nunca gris frio. Esto mantiene la coherencia con el fondo crema.
- **Texto muted es warm gray** (#94918b), no cool gray. Coherencia termica en toda la paleta.

---

## Shadcn/ui — Tema Personalizado

```css
/* src/app/globals.css */
@layer base {
  :root {
    --background: 35 33% 97%;        /* #faf8f5 */
    --foreground: 0 0% 12%;          /* #1f1f1f */
    --card: 0 0% 100%;
    --card-foreground: 0 0% 12%;
    --popover: 0 0% 100%;
    --popover-foreground: 0 0% 12%;
    --primary: 342 80% 25%;          /* #730d32 bordo */
    --primary-foreground: 0 0% 100%;
    --secondary: 38 92% 62%;         /* #f7b643 dorado */
    --secondary-foreground: 0 0% 12%;
    --muted: 30 8% 56%;              /* #94918b warm gray */
    --muted-foreground: 30 8% 56%;
    --accent: 32 20% 94%;            /* #f5f2ed superficie */
    --accent-foreground: 0 0% 12%;
    --destructive: 0 84% 60%;
    --destructive-foreground: 0 0% 100%;
    --border: 32 18% 88%;            /* #e8e4de warm border */
    --input: 32 18% 88%;
    --ring: 342 80% 25%;
    --radius: 0.625rem;
  }
}
```

---

## Texturas y Atmosfera Visual

El sitio NO es flat. Tiene profundidad y textura sutil que lo separa de lo generico.

### Noise Texture
Overlay de grain sutil en secciones hero y fondos oscuros. Genera un archivo PNG de 200x200px con noise al 3-5% de opacidad.

```css
.noise-overlay {
  position: relative;
}
.noise-overlay::after {
  content: "";
  position: absolute;
  inset: 0;
  background-image: url('/images/noise.png');
  background-repeat: repeat;
  opacity: 0.4;
  pointer-events: none;
  mix-blend-mode: overlay;
}
```

### Gradient Mesh (Hero backgrounds)
Para secciones sin imagen de fondo, usar gradient mesh animados con colores del club:

```css
.gradient-mesh {
  background:
    radial-gradient(ellipse at 20% 50%, rgba(115, 13, 50, 0.15) 0%, transparent 50%),
    radial-gradient(ellipse at 80% 20%, rgba(247, 182, 67, 0.1) 0%, transparent 50%),
    radial-gradient(ellipse at 60% 80%, rgba(115, 13, 50, 0.08) 0%, transparent 50%),
    #faf8f5;
}
```

### Lineas Decorativas
Lineas finas diagonales o horizontales como separadores de seccion. Usar el color `linea` (#e8e4de) o bordo con opacidad baja.

```tsx
// Separador editorial entre secciones
<div className="relative py-16">
  <div className="absolute left-0 right-0 top-1/2 h-px bg-linea" />
  <span className="relative z-10 bg-fondo px-6 font-heading text-xs uppercase tracking-editorial text-bordo-800/60 mx-auto block w-fit">
    Deportes
  </span>
</div>
```

### Geometric Accents
Elementos geometricos decorativos inspirados en formas deportivas — lineas de cancha, circulos, angulos. Usados como background elements con opacidad baja.

---

## Componentes del Layout

### Header / Navbar

```
Desktop:
┌──────────────────────────────────────────────────────────────────────────┐
│  [Logo]                                                                  │
│  CLUB SEMINARIO    Club ▼   Deportes ▼   Socios   Beneficios   Tienda   │
│                                                     Eventos  [Cart] [→] │
└──────────────────────────────────────────────────────────────────────────┘

Mobile:
┌────────────────────────────┐
│ [Menu]   [Logo]     [Cart] │
└────────────────────────────┘
```

**Estilo visual:**
- `font-heading` para nav items, `uppercase`, `tracking-editorial`, `text-xs` en desktop
- Logo: logotipo tipografico en `font-display`, peso 700, tracking tight. Sin escudo/icono a menos que exista uno bueno
- Boton login: pill shape con borde bordo, hover fill bordo + texto blanco
- Indicador de item activo: linea dorada de 2px debajo, animada con `layoutId`

**Comportamiento:**
- Sticky con glass-morphism animado (`useScroll` + `useTransform`): blur + opacidad transicionan
- Al scrollear, el navbar se compacta sutilmente (padding reduce de py-6 a py-3)
- Dropdowns con Shadcn `NavigationMenu` + animacion de entrada (scale + fade desde arriba)
- En mobile: Sheet fullscreen con fondo bordo-950 y nav items en `font-display`, `text-title-2`, `uppercase`
- Badge del carrito con bump animation al agregar items (scale spring 1 -> 1.3 -> 1)
- Menu items con hover: color transiciona a bordo-800, underline aparece con scaleX animation

### Footer

```
┌───────────────────────────────────────────────────────────────────────────┐
│                                                                           │
│  CLUB                                                                     │
│  SEMINARIO          ────────────────────────────────────────────────────  │
│                                                                           │
│  Club deportivo, social y cultural                                        │
│  de la comunidad jesuita en Uruguay.                                      │
│                                                                           │
│  EL CLUB             DEPORTES            SOCIOS             CONTACTO      │
│  Directiva           Basquetbol          Hacete socio       099 613 671   │
│  Instalaciones       Corredores          Beneficios         secretaria@.. │
│  Estatuto            Handball            Tienda             Soriano 1472  │
│  Reglamento          Hockey                                 Montevideo    │
│  Memorias            Futbol              HORARIO                          │
│                      Rugby               Mar, Jue, Vie                    │
│                      Voley               10 a 13 hs                       │
│                                                                           │
│  ─────────────────────────────────────────────────────────────────────── │
│                                                                           │
│  [Instagram]  [Facebook]  [X]            (c) 2026 Club Seminario         │
│                                                                           │
└───────────────────────────────────────────────────────────────────────────┘
```

- Fondo: `bordo-950` (#3a0417) — mas profundo que negro, con textura noise overlay
- Nombre del club en `font-display`, `text-display`, `uppercase`, color dorado-300
- Column headers en `font-heading`, `uppercase`, `tracking-editorial`, `text-xs`, color dorado-300/60
- Links en `font-body`, color white/60, hover white con transicion
- Linea divisoria en bordo-800/30
- Iconos de redes: circulos outline con hover fill dorado
- El footer tiene presencia visual — no es un afterthought

### Sidebar del Dashboard

```
┌──────────────────────┐
│                      │
│  CS                  │
│  ────────────────    │
│                      │
│  [Role Switcher]     │
│  ────────────────    │
│                      │
│  TIENDA              │
│    Productos         │
│    Pedidos           │
│    Stock             │
│    POS               │
│    Proveedores       │
│                      │
│  EVENTOS             │
│    Eventos           │
│    Entradas          │
│    Scanner           │
│                      │
│  SECRETARIA          │
│    Socios            │
│    Disciplinas       │
│                      │
│  ────────────────    │
│    Mi cuenta         │
│    Cerrar sesion     │
│                      │
└──────────────────────┘
```

**Estilo visual:**
- Fondo: blanco puro con `shadow-inner-border` en el borde derecho
- Logo: monograma "CS" en `font-display`, `text-bordo-800`, peso 700
- Section labels: `font-heading`, `uppercase`, `tracking-editorial`, `text-xs`, `text-muted`
- Nav items: `font-body`, peso 500, `text-sm`
- Active item: fondo `bordo-50`, texto `bordo-800`, borde izquierdo de 2px `bordo-800` (animado con layoutId)
- Sin emojis/iconos decorativos — solo iconos de Lucide, stroke 1.5, tamano 18px, color hereda del texto
- Collapsible en desktop con width animation suave (toggle para mini sidebar con solo iconos)
- Sheet en mobile con spring transition
- AnimatePresence al cambiar rol

---

## Componentes Compartidos

### Hero Section

La pieza central de las paginas publicas. Impacto maximo.

```tsx
interface HeroProps {
  title: string;           // Puede contener <em> para palabras con peso diferente
  subtitle?: string;
  eyebrow?: string;        // Label encima del titulo (ej: "DEPORTES", "TIENDA")
  cta?: { label: string; href: string };
  secondaryCta?: { label: string; href: string };
  backgroundImage?: string;
  variant?: "full" | "split" | "minimal"; // full = 85vh, split = mitad img, minimal = sin imagen
}
```

**Variant: Full (Home)**
- Height: `min-h-[85vh]` hasta `min-h-screen`
- Imagen de fondo con parallax (`useTransform` de scrollY) + zoom sutil en scroll (scale 1 -> 1.08)
- Overlay gradient: `bg-gradient-hero` (transparente arriba, oscuro abajo)
- Noise texture overlay
- Eyebrow: `font-heading`, `uppercase`, `tracking-editorial`, `text-xs`, color `dorado-300`, con fade-in (delay 0.1s)
- Titulo: `font-display`, `text-hero`, `uppercase`, `tracking-tightest`, color blanco, con split-text animation o fade-in-up (delay 0.3s)
- Subtitulo: `font-body`, `text-lg md:text-xl`, color `white/70`, max-w-xl, fade-in-up (delay 0.5s)
- CTA primario: pill shape, `bg-dorado-300`, `text-bordo-950`, `font-heading`, `uppercase`, `tracking-wide`, fade-in-up (delay 0.7s)
- CTA secundario: pill outline blanco, hover fill blanco + texto bordo-950
- Contenido desaparece con fade-out en scroll (opacity 1 -> 0 entre 0px y 400px)
- **Scroll indicator**: chevron animado (bounce infinito) en la parte inferior

**Variant: Split (Paginas de seccion)**
- Grid de 2 columnas en desktop: texto a la izquierda, imagen a la derecha
- La imagen tiene clip-path diagonal o rounded corners asimetricos
- Mas contenido, mas compacto que el full hero

**Variant: Minimal (Paginas internas)**
- Sin imagen de fondo, fondo crema con gradient mesh sutil
- Titulo centrado, mas pequeno (`text-display`)
- Breadcrumb encima

### Section Header

Componente para encabezar cada seccion dentro de una pagina.

```tsx
interface SectionHeaderProps {
  eyebrow?: string;      // "NUESTRAS DISCIPLINAS"
  title: string;         // "El deporte nos une"
  description?: string;
  align?: "left" | "center";
}
```

- Eyebrow: `font-heading`, `uppercase`, `tracking-editorial`, `text-xs`, `text-bordo-800`
- Title: `font-display`, `text-display`, `uppercase`, `tracking-tightest`
- Description: `font-body`, `text-lg`, `text-muted`, `max-w-2xl`
- Animacion: eyebrow fade-in, titulo fade-in-up (delay 0.1s), descripcion fade-in-up (delay 0.2s)
- Si `align="left"`: linea decorativa vertical de 3px en bordo-800 al costado izquierdo

### Sport Card

```tsx
interface SportCardProps {
  nombre: string;
  slug: string;
  imagen: string;
  descripcion?: string;
}
```

**Estilo editorial:**
- Aspect ratio 3/4 (portrait, como foto de revista)
- Imagen full-bleed con `object-cover`, overflow hidden
- Overlay gradient desde abajo (negro 70% -> transparente)
- Nombre en `font-display`, `text-title-2`, `uppercase`, `tracking-tight`, color blanco, posicionado abajo-izquierda con padding
- Flecha o icono sutil en la esquina inferior derecha
- **Hover**: imagen zoom (scale 1.06, duration 0.5s ease-out), overlay se aclara, nombre se mueve up 4px, flecha aparece con slide-in
- **Sin borde, sin border-radius** — los sport cards son raw y full-bleed para dar drama
- Entrada en viewport: stagger fade-in-up con scale sutil

### Product Card

```tsx
interface ProductCardProps {
  nombre: string;
  slug: string;
  precio: number;
  precioSocio?: number;
  imagenUrl: string;
  stockActual: number;
  categoria?: string;
  onAddToCart: () => void;
}
```

**Estilo moderno:**
- Card con `bg-white`, `rounded-xl`, `shadow-card`, hover `shadow-card-hover`
- Imagen con aspect-ratio 1/1 (cuadrada), `rounded-lg` dentro de la card con padding de 12px (imagen no toca los bordes)
- Fondo de la imagen: `bg-superficie` (crema oscuro) — da sensacion de producto flotando
- Categoria: `font-heading`, `uppercase`, `tracking-editorial`, `text-xs`, `text-muted`, encima del nombre
- Nombre: `font-heading`, peso 600, `text-sm`, truncado a 2 lineas
- Precio: `font-display`, `text-title-3`, `text-bordo-800`
- Precio socio: badge pill en `bg-dorado-100`, `text-dorado-700`, `font-heading`, `text-xs`
- Badge "Agotado": pill en `bg-bordo-50`, `text-bordo-800`, posicionado sobre la imagen
- Boton "Agregar": icono de plus en circulo, `bg-bordo-800`, color blanco, posicionado bottom-right de la imagen
- **Hover**: card lift (y: -4), imagen zoom sutil (1.03), boton agregar scale-in si estaba oculto
- Al agregar: boton bounce + feedback haptico visual (flash dorado en el borde de la card)

### Event Card

```tsx
interface EventCardProps {
  titulo: string;
  slug: string;
  imagen?: string;
  fechaInicio: string;
  lugar: string;
  precioDesde?: number;
  esGratuito: boolean;
}
```

**Estilo:**
- Layout horizontal en desktop (imagen a la izquierda, info a la derecha), vertical en mobile
- Fecha formateada de manera editorial: dia en `font-display` gigante (`text-title-1`), mes en `font-heading` `uppercase` `text-xs`
- Titulo en `font-heading`, peso 700, `text-title-3`
- Lugar y precio en `font-body`, `text-sm`, `text-muted`
- Badge "Gratuito" en `bg-dorado-300`, `text-bordo-950`, `font-heading`, `text-xs`
- Linea separadora vertical entre la fecha y el contenido (color bordo-200)

### Stats Card (Dashboard)

```tsx
interface StatsCardProps {
  title: string;
  value: string | number;
  icon: LucideIcon;
  change?: { value: number; label: string };
  variant?: "default" | "success" | "warning" | "danger";
}
```

- Card con `bg-white`, `rounded-xl`, `shadow-card`
- Icono en circulo con fondo `bordo-50` (o variante segun estado)
- Title: `font-heading`, `text-xs`, `uppercase`, `tracking-editorial`, `text-muted`
- Value: `font-display`, `text-title-1`, `text-bordo-950`, con count-up animation al entrar en viewport
- Change: flecha + porcentaje en verde o rojo, `font-body`, `text-sm`

### Data Table

Para tablas del dashboard (pedidos, socios, productos, etc.):

- Header: `font-heading`, `uppercase`, `tracking-editorial`, `text-xs`, `text-muted`, fondo `superficie`
- Rows: `font-body`, `text-sm`, borde inferior `linea`
- Hover row: fondo `bordo-50/50` con transicion
- Acciones: iconos de Lucide sin texto, tooltip en hover
- Paginacion: botones pill, active con `bg-bordo-800 text-white`
- Sorting indicator: flecha animada con rotacion
- En mobile: cambiar a card layout con los datos mas importantes

### Empty State

```tsx
interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description: string;
  action?: { label: string; onClick: () => void };
}
```

- Centrado vertical y horizontal
- Icono grande (48px) en `text-bordo-200`, con animacion sutil de float (y oscillation)
- Title: `font-heading`, peso 600
- Description: `font-body`, `text-muted`
- Action button: estilo secundario (outline bordo)

---

## Botones

Sistema de botones consistente y bold:

### Variantes

| Variante | Estilo | Uso |
|----------|--------|-----|
| **Primary** | `bg-bordo-800`, `text-white`, hover `bg-bordo-900` | Acciones principales: Comprar, Guardar, Confirmar |
| **Secondary** | `bg-dorado-300`, `text-bordo-950`, hover `bg-dorado-400` | Acciones de energia: Agregar, Destacar |
| **Outline** | `border-2 border-bordo-800`, `text-bordo-800`, hover fill | Acciones secundarias |
| **Ghost** | transparente, `text-bordo-800`, hover `bg-bordo-50` | Acciones terciarias, nav items |
| **Destructive** | `bg-red-600`, `text-white` | Eliminar, Cancelar irreversible |

### Anatomia

- `font-heading`, `uppercase`, `tracking-wide`, `text-sm`
- Padding: `px-6 py-2.5` (default), `px-8 py-3` (large), `px-4 py-2` (small)
- Border radius: `rounded-full` (pill shape siempre)
- Transicion: todos los estados con `springBouncy`
- `whileHover={{ scale: 1.02, y: -1 }}`, `whileTap={{ scale: 0.97 }}`
- Loading state: spinner reemplaza el texto con crossfade, boton no cambia de tamano
- Iconos: a la izquierda del texto, 18px, gap de 8px

---

## Inputs y Forms

- Labels: `font-heading`, `text-sm`, peso 500, encima del input con gap de 6px
- Inputs: `bg-white`, `border border-linea`, `rounded-lg`, padding `px-4 py-3`
- Focus: `border-bordo-800`, `ring-2 ring-bordo-800/10`, transicion smooth
- Placeholder: `text-muted`, `font-body`
- Error: `border-red-500`, mensaje de error en `text-red-600`, `text-xs`, `font-body`, con shake animation
- Helper text: `text-muted`, `text-xs`, debajo del input

---

## Patrones de Carga

### Loading States

- Skeleton con shimmer effect en tonos calidos (match con fondo crema)
- AnimatePresence mode="wait" para transicionar skeleton -> contenido real
- Next.js `loading.tsx` con fade-in skeleton para transiciones de pagina
- Nunca flash de contenido vacio — siempre skeleton -> animate -> content

```css
.skeleton-shimmer {
  background: linear-gradient(
    90deg,
    #f5f2ed 0%,
    #faf8f5 50%,
    #f5f2ed 100%
  );
  background-size: 200% 100%;
  animation: shimmer 1.5s infinite ease-in-out;
}

@keyframes shimmer {
  0% { background-position: -200% 0; }
  100% { background-position: 200% 0; }
}
```

### Error States

- Toast (Sonner) para errores de acciones
- Inline errors en formularios con Zod + shake animation
- Paginas de error con ilustracion minimalista (linea art en bordo-200)

### Toast / Notifications

```tsx
<Toaster
  position="bottom-right"
  toastOptions={{
    style: {
      background: "#ffffff",
      border: "1px solid #e8e4de",
      fontFamily: '"Satoshi", sans-serif',
      borderRadius: "0.875rem",
    },
    duration: 3000,
  }}
  visibleToasts={3}
/>
```

---

## Responsive Breakpoints

```
sm:  640px   (telefonos grandes)
md:  768px   (tablets portrait)
lg:  1024px  (tablets landscape / laptops)
xl:  1280px  (desktops)
2xl: 1536px  (pantallas grandes)
```

**Reglas:**
- Grid de productos: 1 col (mobile) -> 2 col (sm) -> 3 col (lg) -> 4 col (xl)
- Sport cards: 1 col (mobile) -> 2 col (md) -> 3 col (lg) -> 4 col (xl)
- Sidebar: sheet en < lg, visible en >= lg
- Navbar: hamburger en < md, horizontal en >= md
- Tablas: card layout en < md, tabla en >= md
- Hero text: escala de clamp() se encarga automaticamente
- Spacing de secciones: `py-16 md:py-24 lg:py-32` — generoso, que respire

---

## Motion Design System

Las animaciones y transiciones son un requerimiento central. El sitio debe sentirse premium, dinamico y vivo. Framer Motion es obligatorio en toda la aplicacion.

### Principios de Motion

1. **Nada aparece de golpe** — todo contenido entra animado
2. **Toda interaccion tiene feedback** — hover, press, focus, drag
3. **Las transiciones conectan estados** — nunca un corte abrupto
4. **Performance primero** — usar `transform` y `opacity` (GPU-accelerated), evitar animar layout properties
5. **Stagger para grupos** — listas y grids en cascada
6. **Springs > easing** — springs para interacciones (se sienten fisicas), easing para contenido (se sienten cinematicas)

### Configuracion Global

```typescript
// src/lib/motion.ts

// Variantes de entrada
export const fadeInUp = {
  hidden: { opacity: 0, y: 24 },
  visible: { opacity: 1, y: 0 },
};

export const fadeInDown = {
  hidden: { opacity: 0, y: -24 },
  visible: { opacity: 1, y: 0 },
};

export const fadeInLeft = {
  hidden: { opacity: 0, x: -32 },
  visible: { opacity: 1, x: 0 },
};

export const fadeInRight = {
  hidden: { opacity: 0, x: 32 },
  visible: { opacity: 1, x: 0 },
};

export const scaleIn = {
  hidden: { opacity: 0, scale: 0.92 },
  visible: { opacity: 1, scale: 1 },
};

export const blurIn = {
  hidden: { opacity: 0, filter: "blur(12px)" },
  visible: { opacity: 1, filter: "blur(0px)" },
};

// Stagger
export const staggerContainer = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.08,
      delayChildren: 0.1,
    },
  },
};

export const staggerContainerFast = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.04,
      delayChildren: 0.05,
    },
  },
};

// Springs
export const springBouncy = { type: "spring", stiffness: 400, damping: 25 };
export const springSmooth = { type: "spring", stiffness: 300, damping: 30 };
export const springGentle = { type: "spring", stiffness: 200, damping: 20 };

// Eases cinematicos
export const easeSmooth = { duration: 0.5, ease: [0.25, 0.46, 0.45, 0.94] };
export const easeSnappy = { duration: 0.3, ease: [0.33, 1, 0.68, 1] };
export const easeDramatic = { duration: 0.8, ease: [0.16, 1, 0.3, 1] };

// Transiciones de pagina
export const pageTransition = {
  initial: { opacity: 0, y: 12 },
  animate: { opacity: 1, y: 0, transition: easeSmooth },
  exit: { opacity: 0, y: -8, transition: { duration: 0.25 } },
};
```

### Scroll-Triggered Animations

Obligatorio en todas las paginas publicas. Cada seccion que entra en viewport se anima.

```tsx
// src/components/shared/animate-on-scroll.tsx
"use client";

import { motion, useInView } from "framer-motion";
import { useRef } from "react";
import { staggerContainer } from "@/lib/motion";

interface AnimateOnScrollProps {
  children: React.ReactNode;
  className?: string;
  variant?: "fadeInUp" | "fadeInLeft" | "fadeInRight" | "scaleIn" | "blurIn";
  delay?: number;
  once?: boolean;
}

export function AnimateOnScroll({
  children,
  className,
  variant = "fadeInUp",
  delay = 0,
  once = true,
}: AnimateOnScrollProps) {
  const ref = useRef(null);
  const isInView = useInView(ref, { once, margin: "-80px" });

  const variants = {
    fadeInUp: { hidden: { opacity: 0, y: 30 }, visible: { opacity: 1, y: 0 } },
    fadeInLeft: { hidden: { opacity: 0, x: -40 }, visible: { opacity: 1, x: 0 } },
    fadeInRight: { hidden: { opacity: 0, x: 40 }, visible: { opacity: 1, x: 0 } },
    scaleIn: { hidden: { opacity: 0, scale: 0.92 }, visible: { opacity: 1, scale: 1 } },
    blurIn: { hidden: { opacity: 0, filter: "blur(12px)" }, visible: { opacity: 1, filter: "blur(0px)" } },
  };

  return (
    <motion.div
      ref={ref}
      className={className}
      initial="hidden"
      animate={isInView ? "visible" : "hidden"}
      variants={variants[variant]}
      transition={{ duration: 0.7, delay, ease: [0.16, 1, 0.3, 1] }}
    >
      {children}
    </motion.div>
  );
}

export function AnimateStaggerGroup({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, margin: "-60px" });

  return (
    <motion.div
      ref={ref}
      className={className}
      initial="hidden"
      animate={isInView ? "visible" : "hidden"}
      variants={staggerContainer}
    >
      {children}
    </motion.div>
  );
}
```

### Page Transitions

```tsx
// src/components/layout/page-transition.tsx
"use client";

import { motion } from "framer-motion";
import { pageTransition } from "@/lib/motion";

export function PageTransition({ children }: { children: React.ReactNode }) {
  return (
    <motion.div
      initial={pageTransition.initial}
      animate={pageTransition.animate}
      exit={pageTransition.exit}
    >
      {children}
    </motion.div>
  );
}
```

### Micro-Interacciones por Componente

#### Botones
```tsx
<motion.button
  whileHover={{ scale: 1.02, y: -1 }}
  whileTap={{ scale: 0.97 }}
  transition={springBouncy}
/>
```

#### Cards
```tsx
<motion.div
  whileHover={{
    y: -4,
    boxShadow: "0 8px 30px rgba(115, 13, 50, 0.08), 0 2px 8px rgba(26, 26, 26, 0.04)",
    transition: { duration: 0.3 }
  }}
/>
```

#### Navbar — Glass Morphism
```tsx
const { scrollY } = useScroll();
const navBg = useTransform(scrollY, [0, 100], [
  "rgba(250, 248, 245, 0)",
  "rgba(250, 248, 245, 0.9)"
]);
const navBlur = useTransform(scrollY, [0, 100], ["blur(0px)", "blur(16px)"]);
const navPadding = useTransform(scrollY, [0, 100], ["1.5rem", "0.75rem"]);

<motion.nav style={{
  backgroundColor: navBg,
  backdropFilter: navBlur,
  paddingTop: navPadding,
  paddingBottom: navPadding,
}} />
```

#### Sidebar Active Indicator
```tsx
<motion.div className="relative" whileHover={{ x: 4 }} transition={springBouncy}>
  {isActive && (
    <motion.div
      layoutId="sidebar-active-indicator"
      className="absolute left-0 top-0 bottom-0 w-0.5 bg-bordo-800 rounded-full"
      transition={springSmooth}
    />
  )}
</motion.div>
```

#### Tabs Indicator
```tsx
{activeTab === tab.value && (
  <motion.div
    layoutId="tab-indicator"
    className="absolute bottom-0 left-0 right-0 h-0.5 bg-bordo-800"
    transition={springBouncy}
  />
)}
```

#### Carrito — Agregar Item
```tsx
<motion.div
  initial={{ opacity: 0, x: 40, height: 0 }}
  animate={{ opacity: 1, x: 0, height: "auto" }}
  exit={{ opacity: 0, x: -40, height: 0 }}
  transition={springSmooth}
/>
```

#### Contadores Animados
```tsx
function AnimatedCounter({ value }: { value: number }) {
  const spring = useSpring(value, { stiffness: 100, damping: 30 });
  return <motion.span>{spring}</motion.span>;
}
```

### Hero Section — Parallax

```tsx
"use client";

import { motion, useScroll, useTransform } from "framer-motion";

export function HeroSection({ title, subtitle, eyebrow, backgroundImage, cta }: HeroProps) {
  const { scrollY } = useScroll();
  const y = useTransform(scrollY, [0, 500], [0, 150]);
  const opacity = useTransform(scrollY, [0, 400], [1, 0]);
  const scale = useTransform(scrollY, [0, 500], [1, 1.08]);

  return (
    <section className="relative min-h-[85vh] overflow-hidden">
      {/* Background con parallax */}
      <motion.div style={{ y, scale }} className="absolute inset-0">
        <img src={backgroundImage} className="w-full h-full object-cover" alt="" />
        <div className="absolute inset-0 bg-gradient-hero" />
        <div className="absolute inset-0 noise-overlay" />
      </motion.div>

      {/* Contenido */}
      <motion.div
        style={{ opacity }}
        className="relative z-10 flex flex-col items-center justify-end h-full text-center px-6 pb-20"
      >
        {eyebrow && (
          <motion.span
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.1, ease: [0.16, 1, 0.3, 1] }}
            className="font-heading text-xs uppercase tracking-editorial text-dorado-300 mb-4"
          >
            {eyebrow}
          </motion.span>
        )}
        <motion.h1
          initial={{ opacity: 0, y: 40 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.3, ease: [0.16, 1, 0.3, 1] }}
          className="font-display text-hero uppercase tracking-tightest text-white max-w-5xl"
        >
          {title}
        </motion.h1>
        {subtitle && (
          <motion.p
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.5, ease: [0.16, 1, 0.3, 1] }}
            className="font-body text-lg md:text-xl text-white/70 mt-6 max-w-xl"
          >
            {subtitle}
          </motion.p>
        )}
        {cta && (
          <motion.a
            href={cta.href}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.7, ease: [0.16, 1, 0.3, 1] }}
            whileHover={{ scale: 1.04, y: -2 }}
            whileTap={{ scale: 0.97 }}
            className="mt-10 px-8 py-3 bg-dorado-300 text-bordo-950 font-heading text-sm uppercase tracking-wide rounded-full"
          >
            {cta.label}
          </motion.a>
        )}
      </motion.div>

      {/* Scroll indicator */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 1.2 }}
        className="absolute bottom-6 left-1/2 -translate-x-1/2 z-10"
      >
        <motion.div
          animate={{ y: [0, 8, 0] }}
          transition={{ repeat: Infinity, duration: 1.5, ease: "easeInOut" }}
          className="w-5 h-8 rounded-full border-2 border-white/30 flex items-start justify-center pt-1.5"
        >
          <div className="w-1 h-2 rounded-full bg-white/60" />
        </motion.div>
      </motion.div>
    </section>
  );
}
```

### Checklist de Animaciones por Pagina

| Pagina | Animaciones requeridas |
|--------|----------------------|
| **Home** | Hero parallax + fade + split-text, secciones fade-in on scroll, grid deportes stagger, stats count-up, separadores editoriales |
| **Deportes/[slug]** | Split hero, info cards stagger, galeria con crossfade, contacto slide-in |
| **Club/** | Page transition, directivos stagger con foto zoom, instalaciones gallery |
| **Tienda** | Product grid stagger, filtros tab-indicator, add-to-cart bounce + flash |
| **Tienda/[slug]** | Image gallery crossfade, info slide-in, variantes spring, related stagger |
| **Carrito** | Items AnimatePresence, total count-up, checkout button pulse |
| **Eventos** | Event cards stagger, fecha grande animada, tabs indicator |
| **Eventos/[slug]** | Hero fade, lotes stagger, progress bars, compra modal scale-in |
| **Scanner** | Camera fade-in, scan flash overlay, result slide-up, stats count-up |
| **Dashboard** | Stats cards stagger + count-up, charts animate-in, table rows stagger |
| **POS** | Product grid instant, cart items spring, total animate, QR modal scale |
| **Login/Registro** | Form blur-in, input focus glow, error shake, boton state transitions |
| **Mi cuenta** | Profile card scale-in, tabs transition, carnet QR pulse |

### CSS Global Requerido

```css
/* src/app/globals.css */

/* Font imports desde Fontshare CDN */
@import url('https://api.fontshare.com/v2/css?f[]=clash-display@600,700&f[]=cabinet-grotesk@500,700,800&f[]=satoshi@400,500,700&display=swap');

/* Smooth scrolling global */
html {
  scroll-behavior: smooth;
}

/* Base body */
body {
  font-family: "Satoshi", sans-serif;
  color: #1f1f1f;
  background-color: #faf8f5;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}

/* Deshabilitar animaciones si el usuario lo prefiere */
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
    scroll-behavior: auto !important;
  }
}

/* Focus visible */
*:focus-visible {
  outline: none;
  box-shadow: 0 0 0 2px #faf8f5, 0 0 0 4px #730d32;
  transition: box-shadow 0.2s ease;
}

/* Selection */
::selection {
  background-color: rgba(115, 13, 50, 0.15);
  color: #1f1f1f;
}

/* Cursor pointer en elementos interactivos */
button, a, [role="button"], input[type="checkbox"], input[type="radio"], select {
  cursor: pointer;
}

/* Transiciones suaves base */
a, button, input, textarea, select {
  transition: color 0.2s ease, background-color 0.2s ease, border-color 0.2s ease, box-shadow 0.2s ease;
}

/* Text gradient utility */
.text-gradient-bordo {
  background: linear-gradient(135deg, #730d32, #ab1d47);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}

.text-gradient-dorado {
  background: linear-gradient(135deg, #f7b643, #e8900a);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}

/* Skeleton shimmer (tonos calidos) */
.skeleton-shimmer {
  background: linear-gradient(
    90deg,
    #f5f2ed 0%,
    #faf8f5 50%,
    #f5f2ed 100%
  );
  background-size: 200% 100%;
  animation: shimmer 1.5s infinite ease-in-out;
}

@keyframes shimmer {
  0% { background-position: -200% 0; }
  100% { background-position: 200% 0; }
}

/* Noise overlay utility */
.noise-overlay::after {
  content: "";
  position: absolute;
  inset: 0;
  background-image: url('/images/noise.png');
  background-repeat: repeat;
  opacity: 0.35;
  pointer-events: none;
  mix-blend-mode: overlay;
}
```

---

## Fuentes — Instalacion

### Opcion 1: CDN (rapido, para desarrollo)
```html
<!-- En src/app/layout.tsx <head> -->
<link href="https://api.fontshare.com/v2/css?f[]=clash-display@600,700&f[]=cabinet-grotesk@500,700,800&f[]=satoshi@400,500,700&display=swap" rel="stylesheet" />
```

### Opcion 2: Self-hosted (produccion, mejor performance)
Descargar las fuentes de Fontshare, colocar en `/public/fonts/`, y usar `@font-face` en globals.css:

```css
@font-face {
  font-family: "Clash Display";
  src: url("/fonts/ClashDisplay-Semibold.woff2") format("woff2");
  font-weight: 600;
  font-display: swap;
}
@font-face {
  font-family: "Clash Display";
  src: url("/fonts/ClashDisplay-Bold.woff2") format("woff2");
  font-weight: 700;
  font-display: swap;
}
/* ... Cabinet Grotesk y Satoshi igual */
```

Para produccion, usar `next/font/local` para optimizacion automatica:

```tsx
// src/app/layout.tsx
import localFont from "next/font/local";

const clashDisplay = localFont({
  src: [
    { path: "../fonts/ClashDisplay-Semibold.woff2", weight: "600" },
    { path: "../fonts/ClashDisplay-Bold.woff2", weight: "700" },
  ],
  variable: "--font-display",
  display: "swap",
});

const cabinetGrotesk = localFont({
  src: [
    { path: "../fonts/CabinetGrotesk-Medium.woff2", weight: "500" },
    { path: "../fonts/CabinetGrotesk-Bold.woff2", weight: "700" },
    { path: "../fonts/CabinetGrotesk-Extrabold.woff2", weight: "800" },
  ],
  variable: "--font-heading",
  display: "swap",
});

const satoshi = localFont({
  src: [
    { path: "../fonts/Satoshi-Regular.woff2", weight: "400" },
    { path: "../fonts/Satoshi-Medium.woff2", weight: "500" },
    { path: "../fonts/Satoshi-Bold.woff2", weight: "700" },
  ],
  variable: "--font-body",
  display: "swap",
});

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html className={`${clashDisplay.variable} ${cabinetGrotesk.variable} ${satoshi.variable}`}>
      <body className="font-body bg-fondo text-foreground antialiased">
        {children}
      </body>
    </html>
  );
}
```

---

## Librerias UI

| Libreria | Uso |
|----------|-----|
| `framer-motion` | **OBLIGATORIO** — Motor de animaciones y transiciones |
| `@tanstack/react-table` | Tablas con sorting/filtering/pagination |
| `sonner` | Toasts y notificaciones |
| `react-hook-form` | Formularios con Zod |
| `@hookform/resolvers` | Resolver de Zod |
| `recharts` | Graficos en dashboards |
| `date-fns` | Formateo de fechas (en espanol) |
| `lucide-react` | Iconos — stroke 1.5, tamano 18-20px |
| `@yudiel/react-qr-scanner` | Escaner de camara |
| `qrcode` | Generacion de QR |
