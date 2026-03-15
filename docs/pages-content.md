# Contenido Original del Sitio — Mapeo de Páginas

## Resumen

El sitio original tiene 15 páginas. Todas se mantienen en el rediseño con las mismas rutas (adaptadas a Next.js). Se agregan páginas nuevas para tienda y eventos.

**Contenido detallado de cada página:** Los archivos `.md` con el scraping completo del sitio original están en `docs/contenido-original/`. Usar esos archivos como fuente de datos al implementar cada página.

```
docs/contenido-original/
├── 01-inicio.md
├── 02-directiva.md
├── 03-instalaciones.md
├── 04-estatuto.md
├── 05-reglamento.md
├── 06-memorias.md
├── 07-basquetbol.md
├── 08-corredores.md
├── 09-handball.md
├── 10-hockey.md
├── 11-futbol.md
├── 12-rugby.md
├── 13-voley.md
├── 14-socios.md
└── 15-beneficios.md
```

---

## Mapa de Rutas

| Página original | Nueva ruta Next.js | Tipo |
|---|---|---|
| index.html (inicio) | `/` | Server Component |
| club/directiva.html | `/club/directiva` | Server Component |
| club/instalaciones.html | `/club/instalaciones` | Server Component |
| club/estatuto.html | `/club/estatuto` | Server Component |
| club/reglamento.html | `/club/reglamento` | Server Component |
| club/memorias.html | `/club/memorias` | Server Component |
| deportes/basket.html | `/deportes/basquetbol` | Server Component |
| deportes/corredores.html | `/deportes/corredores` | Server Component |
| deportes/handball.html | `/deportes/handball` | Server Component |
| deportes/hockey.html | `/deportes/hockey` | Server Component |
| deportes/futbol.html | `/deportes/futbol` | Server Component |
| deportes/rugby.html | `/deportes/rugby` | Server Component |
| deportes/voley.html | `/deportes/voley` | Server Component |
| socios.html | `/socios` | Server Component |
| beneficios.html | `/beneficios` | Server Component |
| *NUEVO* | `/tienda` | Client + Server |
| *NUEVO* | `/eventos` | Client + Server |
| *NUEVO* | `/login` | Client Component |
| *NUEVO* | `/registro` | Client Component |
| *NUEVO* | `/mi-cuenta` | Client + Server |

---

## Contenido por Página

### 1. Inicio (`/`)

**Hero section:**
- Título: "Club Seminario"
- Subtítulo: "Club deportivo, social y cultural de la comunidad jesuita en Uruguay"
- CTA: "Hacete socio" → link a formulario de membresía
- Imagen de fondo: foto deportiva del club

**Sección "Quiénes somos":**
> Club Seminario es una institución deportiva, social y cultural que nuclea a la comunidad jesuita en Uruguay, fundada el 13 de mayo de 2010. Cuenta con más de 1.000 socios que compiten en 22 categorías a través de rugby, hockey, fútbol, handball, básquetbol y vóleibol, además de un grupo de corredores.

**Sección "Nuestra misión":**
> Brindar a sus socios y socias espacios para la práctica deportiva, actividades culturales y sociales, promoviendo valores cristianos y el desarrollo físico y espiritual.

**Sección "Deporte como herramienta":**
> Los atletas participan en más de 600 partidos anuales a través de la Liga Universitaria de Deportes (LUD), ADIC, URU, AUF, FUHC y la Asociación Uruguaya de Handball.

Cita filosófica:
> "La vida es como un gran partido donde solo se puede sentir satisfacción sabiendo que se dio todo..."

**Sección deportes:** Grid de cards con las 7 disciplinas, cada una con imagen y link a su página.

**Sección sponsors (dos niveles, logos más grandes para principales):**

Sponsors principales:
- Renato Conti
- Itaú
- UCU
- Summum

Sponsors secundarios (logos más chicos):
- Zillertal
- SUAT
- Gatorade

**Footer:** Contacto, redes sociales, mapa del sitio + sponsors.

---

### 2. Directiva (`/club/directiva`)

**Comisión Directiva:**

| Cargo | Nombre |
|-------|--------|
| Presidente | Bernardo Danero |
| Vicepresidente | María Virginia Staricco |
| Secretario | Juan Martin Rodriguez |
| Tesorero | Santiago Perez del Castillo |
| Vocal | Santiago Cardozo |
| Vocal | Javier Pereira |
| Vocal | Josefina Acosta y Lara |
| Vocal | Facundo Brown |
| Vocal | Victoria Otero |
| Suplente 1 | Inés Aguerre |
| Suplente 2 | Juan Pedro Ravenna |
| Suplente 3 | María Clara Cámara |
| Suplente 4 | Juan Ignacio Pérez del Castillo |
| Suplente 5 | Leandro Franchi |

**Comisión Fiscal:**

| Cargo | Nombre |
|-------|--------|
| Titular 1 | Martín Vallejo |
| Titular 2 | Ma. Eugenia Vargas |
| Titular 3 | José Luis Romero |
| Suplente 1 | Mariana Martin |
| Suplente 2 | Gonzalo Abreu |

---

### 3. Instalaciones (`/club/instalaciones`)

**Parque CUPRA:**
- Ubicación principal del club para actividades deportivas
- Canchas disponibles para las distintas disciplinas
- Información sobre horarios y acceso

**Otras sedes:**
- Colegio Seminario (Soriano 1472) — sede administrativa y oficinas
- Canchas compartidas según disciplina

---

### 4. Estatuto (`/club/estatuto`)

Página que muestra el estatuto del club. En el sitio original no tenía contenido visible (probablemente un PDF descargable). Implementar como visor de PDF o link de descarga desde Supabase Storage.

---

### 5. Reglamento (`/club/reglamento`)

Similar al estatuto. Implementar como visor de PDF o link de descarga.

---

### 6. Memorias (`/club/memorias`)

Memorias anuales del club disponibles para descarga (2014–2024). Cada memoria es un PDF.

Implementar como lista de cards por año con botón de descarga. Los PDFs se almacenan en Supabase Storage bucket `memorias/`.

Años disponibles: 2014, 2015, 2016, 2017, 2018, 2019, 2020, 2021, 2022, 2023, 2024.

---

### 7. Básquetbol (`/deportes/basquetbol`)

**Papi Basket:**
- Referente: Santiago Perez del Castillo
- Teléfono: 098 531 741
- Entrenamientos: Martes y Jueves en horario nocturno

**Mami Basket:**
- Referente: María Virginia Staricco
- Teléfono: 099 002 042
- Entrenamientos: Lunes y Miércoles

---

### 8. Corredores (`/deportes/corredores`)

- Grupo de running del club
- Referente con datos de contacto
- Horarios de entrenamiento grupales
- Participación en carreras y maratones

---

### 9. Handball (`/deportes/handball`)

**Handball Femenino:**
- Categorías y horarios de entrenamiento
- Referente y contacto

**Handball Masculino:**
- Categorías y horarios
- Referente y contacto

**Mami Handball:**
- Horarios y referente

---

### 10. Hockey (`/deportes/hockey`)

**Hockey:**
- Categorías femeninas
- Horarios de entrenamiento
- Referente y contacto

**Mami Hockey:**
- Horarios y referente

---

### 11. Fútbol (`/deportes/futbol`)

**Fútbol Femenino:**
- 2 planteles
- Horarios y referente

**Fútbol Masculino:**
- 7 categorías (desde juveniles hasta primera)
- Horarios por categoría
- Referente y contacto

**Mami Fútbol:**
- Horarios y referente

---

### 12. Rugby (`/deportes/rugby`)

**Categorías:**
- M19 (menores de 19)
- Intermedia
- Primera

Horarios, referentes y contacto para cada categoría.

---

### 13. Vóleibol (`/deportes/voley`)

**Papi Volley:**
- Horarios y referente

**Mami Volley:**
- Horarios y referente

---

### 14. Socios (`/socios`)

**Tipos de membresía:**

| Tipo | Cuota mensual | Descripción |
|------|---------------|-------------|
| Socio Colaborador | $480 UYU | Recibe tarjeta de membresía, acceso a beneficios |
| Socio Deportivo | Contactar coordinador | Para quienes participan en disciplinas deportivas |

**Para ser socio:**
- Formulario online (actualmente Google Form: `https://forms.gle/S672snEbvEPWgfHm9`)
- En el rediseño: formulario integrado en la web o link al registro + solicitud

**Contacto:**
- Teléfono: 099 613 671
- Email: secretaria@clubseminario.com.uy
- Dirección: Soriano 1472, Colegio Seminario, Oficina
- Horario: Martes, jueves y viernes de 10 a 13 hs

---

### 15. Beneficios (`/beneficios`)

**Tarjeta de membresía:**
- Personalizada con nombre, apellido y cédula
- Intransferible
- Requiere presentar documento para usar descuentos
- Descuentos del 5% al 50% en: gastronomía, automotor, catering, tecnología, veterinaria, hotelería, indumentaria, bienestar, estética, deportes

**Sponsors/Partners (dos niveles):**

Sponsors principales:
- Renato Conti
- Itaú
- UCU
- Summum

Sponsors secundarios:
- Zillertal
- SUAT
- Gatorade

---

## Navegación Principal

```
Logo | Club ▼ | Deportes ▼ | Socios | Beneficios | Tienda | Eventos | [Login/Perfil]
       │          │
       ├ Directiva    ├ Básquetbol
       ├ Instalaciones├ Corredores
       ├ Estatuto     ├ Handball
       ├ Reglamento   ├ Hockey
       └ Memorias     ├ Fútbol
                      ├ Rugby
                      └ Vóleibol
```

En mobile: hamburger menu con acordeones para los dropdowns.

---

## SEO y Metadata

Cada página debe tener:
- `title`: "Club Seminario — {Nombre de la página}"
- `description`: Descripción relevante de la página
- `og:image`: Imagen representativa
- URL canónica

```typescript
// Ejemplo en Next.js
export const metadata: Metadata = {
  title: "Básquetbol — Club Seminario",
  description: "Papi Basket y Mami Basket del Club Seminario. Horarios, categorías y contacto.",
  openGraph: {
    title: "Básquetbol — Club Seminario",
    description: "...",
    images: ["/images/deportes/basquetbol.jpg"],
  },
};
```

---

## Contacto General (Footer)

- **Teléfono:** 099 613 671
- **Email:** secretaria@clubseminario.com.uy
- **Dirección:** Soriano 1472, Colegio Seminario
- **Redes sociales:** Facebook, Instagram, X (Twitter)
- **Instagram tienda:** @clubseminariotienda
