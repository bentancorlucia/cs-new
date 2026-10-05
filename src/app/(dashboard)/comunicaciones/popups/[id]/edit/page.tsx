import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireRole } from "@/lib/supabase/roles";
import { ROLES_LECTURA } from "@/lib/comunicaciones/server";
import { PopupForm } from "@/components/comunicaciones/popups/popup-form";
import type { PopupRow } from "@/lib/popups/types";

export const dynamic = "force-dynamic";

export default async function EditPopupPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireRole(ROLES_LECTURA);
  const { id } = await params;

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("popups" as any)
    .select("*")
    .eq("id", id)
    .single();

  if (error || !data) notFound();
  const popup = data as unknown as PopupRow;

  return (
    <div>
      <Link
        href="/comunicaciones/popups"
        className="mb-4 inline-flex items-center gap-1 text-sm text-bordo-800 hover:underline"
      >
        <ChevronLeft className="h-4 w-4" /> Volver
      </Link>
      <h1 className="mb-6 font-display text-3xl font-bold text-bordo-800">
        Editar popup
      </h1>
      <PopupForm mode="edit" initial={popup} />
    </div>
  );
}
