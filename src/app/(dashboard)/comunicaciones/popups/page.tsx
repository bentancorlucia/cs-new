import Link from "next/link";
import { Plus } from "lucide-react";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireRole } from "@/lib/supabase/roles";
import { Button } from "@/components/ui/button";
import { PopupsTable } from "@/components/comunicaciones/popups/popups-table";
import type { PopupRow } from "@/lib/popups/types";

export const dynamic = "force-dynamic";

export default async function PopupsPage() {
  await requireRole(["super_admin", "secretaria"]);
  const supabase = createAdminClient();

  const { data } = await supabase
    .from("popups" as any)
    .select("*")
    .order("priority", { ascending: false })
    .order("updated_at", { ascending: false });

  const popups = (data ?? []) as unknown as PopupRow[];

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-bold text-bordo-800">
            Popups
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-neutral-600">
            Mensajes emergentes que aparecen en el sitio público. Programá la
            vigencia, elegí en qué páginas mostrarlos y agregá botones con
            enlaces internos o externos.
          </p>
        </div>
        <Link href="/comunicaciones/popups/nuevo">
          <Button className="bg-bordo-800 text-white hover:bg-bordo-700">
            <Plus className="mr-1 h-4 w-4" /> Nuevo popup
          </Button>
        </Link>
      </div>

      <PopupsTable popups={popups} />
    </div>
  );
}
