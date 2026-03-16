import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

// Admin client with service role key — bypasses RLS.
// Only use in server-side code (API routes) after verifying authorization.
export function createAdminClient() {
  return createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}
