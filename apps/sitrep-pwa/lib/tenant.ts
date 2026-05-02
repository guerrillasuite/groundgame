// lib/tenant.ts — sitrep-pwa variant
// Identifies tenant from the authenticated user's session, not subdomain.

import { createClient } from "@supabase/supabase-js";
import { getCrmUser } from "./crm-auth";

export type Tenant = {
  id: string;
  slug: string;
  features: string[];
  plan: string;
  branding: Record<string, unknown>;
  settings: Record<string, unknown>;
};

export async function getTenant(explicitUserId?: string): Promise<Tenant | null> {
  let userId = explicitUserId;

  if (!userId) {
    const user = await getCrmUser();
    if (!user) return null;
    userId = user.userId;
  }

  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  // Check for active tenant switcher override in future; for v1 use primary membership
  const { data: memberships } = await sb
    .from("user_tenants")
    .select("tenant_id, role")
    .eq("user_id", userId)
    .in("status", ["active", "invited"])
    .order("created_at")
    .limit(10);

  if (!memberships?.length) return null;

  const tenantId = memberships[0].tenant_id;

  const { data: tenant } = await sb
    .from("tenants")
    .select("id, slug, features, plan, branding, settings")
    .eq("id", tenantId)
    .single();

  if (!tenant) return null;

  return {
    id: tenant.id,
    slug: tenant.slug ?? "unknown",
    features: (tenant.features as string[]) ?? [],
    plan: tenant.plan ?? "pro",
    branding: (tenant.branding as Record<string, unknown>) ?? {},
    settings: (tenant.settings as Record<string, unknown>) ?? {},
  };
}

export function makeServiceSb(tenantId: string) {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { global: { headers: { "X-Tenant-Id": tenantId } } }
  );
}
