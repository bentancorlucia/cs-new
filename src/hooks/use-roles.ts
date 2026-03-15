"use client";

import { useEffect, useState, useCallback } from "react";
import { createBrowserClient } from "@/lib/supabase/client";

type RoleJoin = { roles: { nombre: string } | null };

interface UseRolesReturn {
  roles: string[];
  activeRole: string | null;
  setActiveRole: (role: string) => void;
  hasRole: (role: string) => boolean;
  hasAnyRole: (roles: string[]) => boolean;
  isLoading: boolean;
}

const DASHBOARD_ROLES = [
  "super_admin",
  "tienda",
  "secretaria",
  "eventos",
  "scanner",
];

export function useRoles(): UseRolesReturn {
  const [roles, setRoles] = useState<string[]>([]);
  const [activeRole, setActiveRoleState] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function fetchRoles() {
      try {
        const supabase = createBrowserClient();
        const {
          data: { user },
        } = await supabase.auth.getUser();

        if (!user) {
          setIsLoading(false);
          return;
        }

        const { data } = await supabase
          .from("perfil_roles")
          .select("roles(nombre)")
          .eq("perfil_id", user.id);

        const roleNames =
          (data as unknown as RoleJoin[])
            ?.map((r) => r.roles?.nombre)
            .filter((n): n is string => !!n) || [];

        setRoles(roleNames);

        // Restore active role from localStorage or use the first dashboard role
        const saved = localStorage.getItem("cs-active-role");
        if (saved && roleNames.includes(saved)) {
          setActiveRoleState(saved);
        } else {
          const firstDashboard = roleNames.find((r) =>
            DASHBOARD_ROLES.includes(r)
          );
          if (firstDashboard) {
            setActiveRoleState(firstDashboard);
          }
        }
      } catch {
        // silently fail
      } finally {
        setIsLoading(false);
      }
    }

    fetchRoles();
  }, []);

  const setActiveRole = useCallback((role: string) => {
    setActiveRoleState(role);
    localStorage.setItem("cs-active-role", role);
  }, []);

  const hasRole = useCallback(
    (role: string) => roles.includes(role) || roles.includes("super_admin"),
    [roles]
  );

  const hasAnyRole = useCallback(
    (r: string[]) =>
      roles.includes("super_admin") || r.some((role) => roles.includes(role)),
    [roles]
  );

  return {
    roles,
    activeRole,
    setActiveRole,
    hasRole,
    hasAnyRole,
    isLoading,
  };
}
