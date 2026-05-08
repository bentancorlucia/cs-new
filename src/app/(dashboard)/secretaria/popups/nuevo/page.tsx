import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { requireRole } from "@/lib/supabase/roles";
import { PopupForm } from "@/components/secretaria/popups/popup-form";

export default async function NuevoPopupPage() {
  await requireRole(["super_admin", "secretaria"]);

  return (
    <div className="px-4 py-8 md:px-8">
      <Link
        href="/secretaria/popups"
        className="mb-4 inline-flex items-center gap-1 text-sm text-bordo-800 hover:underline"
      >
        <ChevronLeft className="h-4 w-4" /> Volver
      </Link>
      <h1 className="mb-6 font-display text-3xl font-bold text-bordo-800">
        Nuevo popup
      </h1>
      <PopupForm mode="create" />
    </div>
  );
}
