// lib/supabase/client.ts
import { createClient, SupabaseClient } from "@supabase/supabase-js";

function resolveTenantId(): string | undefined {
  // 1) explicit runtime (if you ever set it)
  if (typeof window !== "undefined") {
    const ls =
      localStorage.getItem("tenantId") ||
      localStorage.getItem("tenant_id");
    if (ls) return ls;
    // 2) subdomain heuristic: test.groundgame.digital -> "test"
    const host = window.location.hostname;
    const parts = host.split(".");
    if (parts.length > 2) return parts[0];
  }
  // 3) dev fallback
  return process.env.NEXT_PUBLIC_TEST_TENANT_ID || undefined;
}

// NOTE: compute once for this tab; if tenant can change at runtime,
// call getSupabase() instead of using the singleton.
const TENANT_ID = resolveTenantId();

const options = {
  global: {
    headers: TENANT_ID ? { "X-Tenant-Id": TENANT_ID } : {},
  },
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
} as const;

export const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  options
);

// Preferred for client pages where you MUST have the header.
// Creates a fresh client with the current tenant each call.
export function getSupabase(): SupabaseClient {
  const tid = resolveTenantId();
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      ...options,
      global: { headers: tid ? { "X-Tenant-Id": tid } : {} },
    }
  );
}
