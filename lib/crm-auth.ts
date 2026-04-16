// lib/crm-auth.ts (server-only)
// Returns the current CRM user's identity from the session cookie.
// Also exports role-guard helpers for use in server components and API routes.

import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

const SUPER_ADMIN_EMAILS = (process.env.SUPER_ADMIN_EMAILS ?? "")
  .split(",")
  .map((e) => e.trim().toLowerCase())
  .filter(Boolean);

export type CrmUser = {
  userId: string;
  role: "director" | "support" | "operative" | null;
  isAdmin: boolean;   // true for director and support (CRM access); false for operative
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

  const primaryRole = memberships?.[0]?.role ?? null;
  const role =
    isSuperAdmin ? "director" as const
    : ["director", "admin", "owner"].includes(primaryRole ?? "") ? "director" as const
    : ["support", "manager"].includes(primaryRole ?? "") ? "support" as const
    : ["operative", "staff", "field"].includes(primaryRole ?? "") ? "operative" as const
    : null;

  const isAdmin = isSuperAdmin || role === "director" || role === "support";

  return { userId: user.id, role, isAdmin, isSuperAdmin };
}

// ── Role guards for server components (use redirect) ─────────────────────────
// Import `redirect` from "next/navigation" in the calling page.

/**
 * Call at the top of any CRM server component.
 * Operatives have no CRM access — redirects them to the PWA root.
 * Returns the CrmUser if access is allowed (may be null if not logged in —
 * pages that need a guaranteed user should also check for null).
 */
export async function requireCrmAccess(): Promise<CrmUser | null> {
  const { redirect } = await import("next/navigation");
  const user = await getCrmUser();
  if (user?.role === "operative") redirect("/");
  return user;
}

/**
 * Call at the top of Director-only server components (settings, import,
 * dedupe, cleanup, bulk-edit, products, user management).
 * Redirects Support and Operative users to /crm.
 */
export async function requireDirectorPage(): Promise<CrmUser> {
  const { redirect } = await import("next/navigation");
  const user = await getCrmUser();
  if (!user || (user.role !== "director" && !user.isSuperAdmin)) redirect("/crm");
  return user;
}

// ── Role guards for API routes (return NextResponse) ─────────────────────────

import { NextResponse } from "next/server";

/**
 * Returns a 403 NextResponse if the current cookie session is not a Director.
 * Returns null if the check passes (caller continues normally).
 * Usage: const denied = await requireDirectorApi(); if (denied) return denied;
 */
export async function requireDirectorApi(): Promise<NextResponse | null> {
  const user = await getCrmUser();
  if (!user || (user.role !== "director" && !user.isSuperAdmin)) {
    return NextResponse.json({ error: "Director access required" }, { status: 403 });
  }
  return null;
}

/**
 * Returns a 403 NextResponse if the current session is an Operative (no CRM access).
 * Support and Directors pass through.
 */
export async function requireCrmApi(): Promise<NextResponse | null> {
  const user = await getCrmUser();
  if (!user || user.role === "operative" || user.role === null) {
    return NextResponse.json({ error: "CRM access required" }, { status: 403 });
  }
  return null;
}
