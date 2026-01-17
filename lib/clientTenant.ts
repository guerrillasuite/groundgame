'use client';
import { supabase } from "@/lib/supabase/client";

/** Resolve current tenant id for RPCs. */
export async function getTenantId(): Promise<string> {
  try {
    const { data } = await supabase.auth.getUser();
    const user = data?.user;
    // Prefer a claim you may already set on the user:
    const fromMeta =
      (user?.app_metadata as any)?.tenant_id ||
      (user?.user_metadata as any)?.tenant_id;
    if (fromMeta) return String(fromMeta);
  } catch {}
  // Fallback to a server-injected global if you added it in layout:
  // <script>window.__TENANT_ID__='0000...';</script>
  if (typeof window !== 'undefined' && (window as any).__TENANT_ID__) {
    return String((window as any).__TENANT_ID__);
  }
  // Last resort: your known test tenant id
  return '00000000-0000-0000-0000-000000000000';
}

