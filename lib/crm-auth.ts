// lib/crm-auth.ts (server-only)
// Returns the current CRM user's identity from the session cookie.

import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

const SUPER_ADMIN_EMAILS = (process.env.SUPER_ADMIN_EMAILS ?? "")
  .split(",")
  .map((e) => e.trim().toLowerCase())
  .filter(Boolean);

export type CrmUser = {
  userId: string;
  isAdmin: boolean;
  isSuperAdmin: boolean;
};

export async function getCrmUser(): Promise<CrmUser | null> {
  const cookieStore = await cookies();

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll() {
          // read-only in server components
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const isSuperAdmin = SUPER_ADMIN_EMAILS.includes(
    user.email?.toLowerCase() ?? ""
  );

  // Use user_tenants as source of truth for role
  const adminSb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
  const { data: memberships } = await adminSb
    .from("user_tenants")
    .select("role")
    .eq("user_id", user.id)
    .in("status", ["active", "invited"]);

  const isAdmin =
    isSuperAdmin ||
    memberships?.some((m) => ["admin", "owner", "manager"].includes(m.role)) === true;

  return { userId: user.id, isAdmin, isSuperAdmin };
}
