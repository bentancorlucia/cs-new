"use server";

import { redirect } from "next/navigation";
import { createServerClient } from "@/lib/supabase/server";

export async function aprobarAutorizacion(formData: FormData) {
  const id = String(formData.get("authorization_id") ?? "");
  const supabase = await createServerClient();
  const { data, error } = await supabase.auth.oauth.approveAuthorization(id, {
    skipBrowserRedirect: true,
  });
  if (error || !data) {
    redirect(`/oauth/consent?authorization_id=${encodeURIComponent(id)}&error=aprobar`);
  }
  redirect(data.redirect_url);
}

export async function denegarAutorizacion(formData: FormData) {
  const id = String(formData.get("authorization_id") ?? "");
  const supabase = await createServerClient();
  const { data, error } = await supabase.auth.oauth.denyAuthorization(id, {
    skipBrowserRedirect: true,
  });
  if (error || !data) redirect("/mi-cuenta");
  redirect(data.redirect_url);
}
