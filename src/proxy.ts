import { updateSession } from "@/lib/supabase/middleware";
import { NextResponse, type NextRequest } from "next/server";

// Rutas publicas que no requieren auth
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

// Sub-rutas de /tienda que SI requieren auth (checkout, pedido)
const TIENDA_PROTECTED_PREFIXES = [
  "/tienda/checkout",
  "/tienda/pedido",
];

// Sub-rutas de /eventos que SI requieren auth (dashboard de eventos)
const EVENTOS_PROTECTED_PREFIXES = [
  "/eventos/crear",
  "/eventos/entradas",
  "/eventos/scanner",
];

// Mapeo de rutas protegidas a roles requeridos
const PROTECTED_ROUTES: Record<string, string[]> = {
  "/admin/proveedores": ["super_admin", "tienda"],
  "/admin/pos": ["super_admin", "tienda"],
  "/admin": ["super_admin", "tienda"],
  "/secretaria": ["super_admin", "secretaria"],
  "/eventos/crear": ["super_admin", "eventos"],
  "/eventos/entradas": ["super_admin", "eventos"],
  "/eventos/scanner": ["super_admin", "eventos", "scanner"],
  "/mi-cuenta": [
    "super_admin",
    "tienda",
    "secretaria",
    "eventos",
    "scanner",
    "socio",
  ],
};

function isPublicRoute(pathname: string): boolean {
  // Check if it's a tienda sub-route that requires auth (checkout, pedido)
  if (TIENDA_PROTECTED_PREFIXES.some((p) => pathname.startsWith(p))) {
    return false;
  }

  // Check if it's an eventos dashboard sub-route (protected)
  if (EVENTOS_PROTECTED_PREFIXES.some((p) => pathname.startsWith(p))) {
    return false;
  }

  return PUBLIC_ROUTES.some(
    (route) => pathname === route || pathname.startsWith(route + "/")
  );
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Skip API routes, static files, etc.
  if (
    pathname.startsWith("/api/") ||
    pathname.startsWith("/_next/") ||
    pathname.startsWith("/images/") ||
    pathname.includes(".")
  ) {
    return NextResponse.next();
  }

  // Refresh session
  const { supabase, user, response: supabaseResponse } = await updateSession(request);

  // Allow public routes
  if (isPublicRoute(pathname)) {
    // If logged in user tries to access login/registro, redirect to home
    if (user && (pathname === "/login" || pathname === "/registro")) {
      return NextResponse.redirect(new URL("/", request.url));
    }
    return supabaseResponse;
  }

  // If not authenticated, redirect to login
  if (!user) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("redirect", pathname);
    return NextResponse.redirect(loginUrl);
  }

  // Find the most specific matching protected route
  const matchedRoute = Object.keys(PROTECTED_ROUTES)
    .sort((a, b) => b.length - a.length)
    .find((route) => pathname.startsWith(route));

  if (matchedRoute) {
    const requiredRoles = PROTECTED_ROUTES[matchedRoute];

    const { data: userRoles } = await supabase
      .from("perfil_roles")
      .select("roles(nombre)")
      .eq("perfil_id", user.id);

    type RoleJoin = { roles: { nombre: string } | null };
    const roleNames =
      (userRoles as unknown as RoleJoin[])?.map((r) => r.roles?.nombre).filter(Boolean) || [];

    const hasAccess =
      roleNames.includes("super_admin") ||
      requiredRoles.some((r) => roleNames.includes(r));

    if (!hasAccess) {
      return NextResponse.redirect(new URL("/", request.url));
    }
  }

  return supabaseResponse;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|images/).*)",
  ],
};
