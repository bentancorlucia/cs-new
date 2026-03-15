# Autenticación y Sistema de Roles

## Autenticación con Supabase Auth

### Métodos de login
- **Email + contraseña** (principal)
- **Magic link** por email (alternativo)
- OAuth con Google (opcional, fase 2)

### Flujo de registro

```
1. Usuario se registra con email/contraseña + nombre + apellido
2. Trigger en DB crea fila en `perfiles`
3. Se asigna automáticamente rol `no_socio`
4. Si secretaría lo aprueba como socio → se agrega rol `socio` + datos de membresía
5. Si es staff → super_admin asigna roles adicionales
```

### Registro vía formulario

```tsx
// Campos del formulario de registro
{
  email: string;      // validar formato
  password: string;   // mínimo 8 caracteres
  nombre: string;     // requerido
  apellido: string;   // requerido
  telefono?: string;  // opcional
  cedula?: string;    // opcional
}
```

---

## Roles del Sistema

| Rol | Descripción | Paneles que ve |
|-----|-------------|----------------|
| `super_admin` | Control total | Todos los paneles |
| `tienda` | Staff de tienda | Admin Tienda + POS + Proveedores |
| `secretaria` | Staff secretaría | Secretaría (socios + disciplinas) |
| `eventos` | Staff eventos | Admin Eventos + Entradas |
| `scanner` | Portero/escáner | Solo pantalla de escaneo QR |
| `socio` | Socio activo | Mi Cuenta + descuentos + compra entradas |
| `no_socio` | Usuario base | Navegación pública + compra tienda/entradas |

### Multi-rol

Un perfil puede tener **múltiples roles simultáneos**. Por ejemplo:
- María: `socio` + `secretaria` + `eventos`
- Juan: `socio` + `scanner`
- Admin: `super_admin` (implica acceso a todo)

### Role Switcher

El dashboard tiene un componente **RoleSwitcher** en el header/sidebar que:
1. Muestra los roles activos del usuario como chips/tabs
2. Al hacer click en un rol, carga el panel correspondiente
3. Persiste la selección en `localStorage` (o cookie)
4. Si solo tiene 1 rol de dashboard, no muestra switcher

```tsx
// Ejemplo de implementación del RoleSwitcher
"use client";

import { useRoles } from "@/hooks/use-roles";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

const PANEL_CONFIG = {
  super_admin: { label: "Admin", icon: Shield, href: "/admin" },
  tienda:      { label: "Tienda", icon: Store, href: "/admin/productos" },
  secretaria:  { label: "Secretaría", icon: Users, href: "/secretaria/socios" },
  eventos:     { label: "Eventos", icon: Calendar, href: "/eventos" },
  scanner:     { label: "Scanner", icon: QrCode, href: "/eventos/scanner" },
};

export function RoleSwitcher() {
  const { roles, activeRole, setActiveRole } = useRoles();
  const dashboardRoles = roles.filter(r => r in PANEL_CONFIG);

  if (dashboardRoles.length <= 1) return null;

  return (
    <Tabs value={activeRole} onValueChange={setActiveRole}>
      <TabsList>
        {dashboardRoles.map(rol => (
          <TabsTrigger key={rol} value={rol}>
            {PANEL_CONFIG[rol].label}
          </TabsTrigger>
        ))}
      </TabsList>
    </Tabs>
  );
}
```

---

## Middleware de Protección

### `src/middleware.ts`

```typescript
import { createServerClient } from "@supabase/ssr";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// Rutas públicas que no requieren auth
const PUBLIC_ROUTES = [
  "/",
  "/club",
  "/deportes",
  "/socios",
  "/beneficios",
  "/tienda",
  "/eventos",
  "/login",
  "/registro",
];

// Mapeo de rutas protegidas a roles requeridos
const PROTECTED_ROUTES: Record<string, string[]> = {
  "/admin":             ["super_admin", "tienda"],
  "/admin/proveedores": ["super_admin", "tienda"],
  "/admin/pos":         ["super_admin", "tienda"],
  "/secretaria":        ["super_admin", "secretaria"],
  "/eventos/crear":     ["super_admin", "eventos"],
  "/eventos/entradas":  ["super_admin", "eventos"],
  "/eventos/scanner":   ["super_admin", "eventos", "scanner"],
  "/mi-cuenta":         ["super_admin", "tienda", "secretaria", "eventos", "scanner", "socio"],
};

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Permitir rutas públicas
  if (PUBLIC_ROUTES.some(route => pathname === route || pathname.startsWith(route + "/"))) {
    // Excepción: sub-rutas de dashboard dentro de /eventos
    if (!pathname.startsWith("/eventos/crear") &&
        !pathname.startsWith("/eventos/entradas") &&
        !pathname.startsWith("/eventos/scanner")) {
      return NextResponse.next();
    }
  }

  // Crear cliente Supabase con cookies
  const supabase = createServerClient(/* config */);
  const { data: { user } } = await supabase.auth.getUser();

  // Si no hay usuario, redirigir a login
  if (!user) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  // Verificar roles para rutas protegidas
  const matchedRoute = Object.keys(PROTECTED_ROUTES)
    .sort((a, b) => b.length - a.length) // más específica primero
    .find(route => pathname.startsWith(route));

  if (matchedRoute) {
    const requiredRoles = PROTECTED_ROUTES[matchedRoute];
    const { data: userRoles } = await supabase
      .from("perfil_roles")
      .select("roles(nombre)")
      .eq("perfil_id", user.id);

    const roleNames = userRoles?.map(r => r.roles.nombre) || [];
    const hasAccess = requiredRoles.some(r => roleNames.includes(r));

    if (!hasAccess) {
      return NextResponse.redirect(new URL("/", request.url));
    }
  }

  return NextResponse.next();
}
```

---

## Hook `useRoles`

```typescript
"use client";

import { useEffect, useState } from "react";
import { createBrowserClient } from "@/lib/supabase/client";

interface UseRolesReturn {
  roles: string[];
  activeRole: string | null;
  setActiveRole: (role: string) => void;
  hasRole: (role: string) => boolean;
  hasAnyRole: (roles: string[]) => boolean;
  isLoading: boolean;
}

export function useRoles(): UseRolesReturn {
  const [roles, setRoles] = useState<string[]>([]);
  const [activeRole, setActiveRoleState] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function fetchRoles() {
      const supabase = createBrowserClient();
      const { data: { user } } = await supabase.auth.getUser();

      if (!user) {
        setIsLoading(false);
        return;
      }

      const { data } = await supabase
        .from("perfil_roles")
        .select("roles(nombre)")
        .eq("perfil_id", user.id);

      const roleNames = data?.map(r => r.roles.nombre) || [];
      setRoles(roleNames);

      // Restaurar rol activo de localStorage o usar el primero
      const saved = localStorage.getItem("activeRole");
      if (saved && roleNames.includes(saved)) {
        setActiveRoleState(saved);
      } else if (roleNames.length > 0) {
        setActiveRoleState(roleNames[0]);
      }

      setIsLoading(false);
    }

    fetchRoles();
  }, []);

  const setActiveRole = (role: string) => {
    setActiveRoleState(role);
    localStorage.setItem("activeRole", role);
  };

  return {
    roles,
    activeRole,
    setActiveRole,
    hasRole: (role) => roles.includes(role) || roles.includes("super_admin"),
    hasAnyRole: (r) => r.some(role => roles.includes(role)) || roles.includes("super_admin"),
    isLoading,
  };
}
```

---

## Server-side: Verificación de Roles

Para API routes y Server Components:

```typescript
// src/lib/supabase/roles.ts
import { createServerClient } from "@/lib/supabase/server";

export async function getUserRoles(): Promise<string[]> {
  const supabase = createServerClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) return [];

  const { data } = await supabase
    .from("perfil_roles")
    .select("roles(nombre)")
    .eq("perfil_id", user.id);

  return data?.map(r => r.roles.nombre) || [];
}

export async function requireRole(roles: string[]) {
  const userRoles = await getUserRoles();
  const hasAccess = roles.some(r => userRoles.includes(r)) || userRoles.includes("super_admin");

  if (!hasAccess) {
    throw new Error("No autorizado");
  }

  return userRoles;
}
```

---

## Asignación de Roles

Solo `super_admin` y `secretaria` pueden asignar roles (excepto `super_admin` que solo lo asigna otro `super_admin`).

```typescript
// API Route: POST /api/roles/asignar
export async function POST(request: Request) {
  const supabase = createServerClient();
  const { data: { user } } = await supabase.auth.getUser();

  // Verificar que el usuario actual es admin o secretaria
  await requireRole(["super_admin", "secretaria"]);

  const { perfil_id, rol_nombre } = await request.json();

  // Solo super_admin puede asignar super_admin
  if (rol_nombre === "super_admin") {
    await requireRole(["super_admin"]);
  }

  // Buscar ID del rol
  const { data: rol } = await supabase
    .from("roles")
    .select("id")
    .eq("nombre", rol_nombre)
    .single();

  // Asignar
  const { error } = await supabase
    .from("perfil_roles")
    .insert({
      perfil_id,
      rol_id: rol.id,
      asignado_por: user.id,
    });

  if (error) throw error;

  return Response.json({ success: true });
}
```
