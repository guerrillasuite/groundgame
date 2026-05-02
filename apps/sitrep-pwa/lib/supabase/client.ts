"use client";
import { createBrowserClient } from "@supabase/ssr";

function resolveTenantId(): string | undefined {
  if (typeof window === "undefined") return undefined;
  // For sitrep-pwa: tenant ID stored in localStorage after login
  const stored = localStorage.getItem("sitrep_tenant_id");
  if (stored) return stored;
  return process.env.NEXT_PUBLIC_TEST_TENANT_ID || undefined;
}

export function getSupabase() {
  const tid = resolveTenantId();
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { global: { headers: tid ? { "X-Tenant-Id": tid } : {} } }
  );
}

export const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);
