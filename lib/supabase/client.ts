// lib/supabase/client.ts
import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";

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

// createBrowserClient stores sessions in cookies (accessible to middleware/server)
// instead of localStorage. Drop-in replacement for createClient in browser contexts.
export const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  {
    global: {
      headers: TENANT_ID ? { "X-Tenant-Id": TENANT_ID } : {},
    },
  }
);

// Preferred for client pages where you MUST have the current tenant header.
export function getSupabase(): SupabaseClient {
  const tid = resolveTenantId();
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      global: { headers: tid ? { "X-Tenant-Id": tid } : {} },
    }
  );
}
