// lib/crm-auth.ts (server-only) — adapted for sitrep-pwa
import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

const SUPER_ADMIN_EMAILS = (process.env.SUPER_ADMIN_EMAILS ?? "")
  .split(",")
  .map((e) => e.trim().toLowerCase())
  .filter(Boolean);

export type CrmUser = {
  userId: string;
  email: string;
  role: "director" | "support" | "operative" | null;
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
        getAll() { return cookieStore.getAll(); },
        setAll() {},
      },
    }
  );

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const isSuperAdmin = SUPER_ADMIN_EMAILS.includes(user.email?.toLowerCase() ?? "");

  const adminSb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
  const { data: memberships } = await adminSb
    .from("user_tenants")
    .select("role")
    .eq("user_id", user.id)
    .in("status", ["active", "invited"]);

  const primaryRole = memberships?.[0]?.role ?? null;
  const role =
    isSuperAdmin ? "director" as const
    : ["director", "admin", "owner"].includes(primaryRole ?? "") ? "director" as const
    : ["support", "manager"].includes(primaryRole ?? "") ? "support" as const
    : ["operative", "staff", "field"].includes(primaryRole ?? "") ? "operative" as const
    : null;

  const isAdmin = isSuperAdmin || role === "director" || role === "support";

  return { userId: user.id, email: user.email ?? "", role, isAdmin, isSuperAdmin };
}

export async function requireSuperAdminApi(): Promise<NextResponse | null> {
  const user = await getCrmUser();
  if (!user?.isSuperAdmin) {
    return NextResponse.json({ error: "SuperAdmin access required" }, { status: 403 });
  }
  return null;
}

export async function requireCrmApi(): Promise<NextResponse | null> {
  const user = await getCrmUser();
  if (!user || user.role === null) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }
  return null;
}
