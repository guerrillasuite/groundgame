// lib/supabase/server.ts


// Single supabase server helper for App Router.
// Pages/layouts can safely read without cookie writes.
// Server Actions / Route Handlers can opt into writable cookies.

import { createServerClient } from "@supabase/ssr";
import { cookies, headers as nextHeaders } from "next/headers";

type Opts = { writable?: boolean };

/** Minimal slug -> tenant mapping (keeps your current naming) */
function mapSlugToTenantId(slug: string): string | null {
  switch (slug) {
    case "test":           return "00000000-0000-0000-0000-000000000000";
    case "guerrillasuite": return "85c60ca4-ee15-4d45-b27e-a8758d91f896";
    case "localhost":      return "00000000-0000-0000-0000-000000000000"; // dev fallback
    case "127.0.0.1":      return "00000000-0000-0000-0000-000000000000"; // dev fallback
    default:               return null;
  }
}

/** Resolve active tenant from the incoming request host */
function activeTenantIdFromRequest(): string | undefined {
  const h = nextHeaders();
  const host = (h.get("x-forwarded-host") ?? h.get("host") ?? "").toLowerCase();
  const hostname = host.split(":")[0];         // strip port if present
  const firstLabel = hostname.split(".")[0];   // e.g. "test" from test.groundgame.digital
  return mapSlugToTenantId(firstLabel) ?? undefined;
}

export function getSupabaseServer(opts: Opts = {}) {
  const tenantId = activeTenantIdFromRequest();

  const store = cookies();
  const cookieAdapter = opts.writable
    ? {
        get(name: string) { return store.get(name)?.value; },
        set(name: string, value: string, options?: any) {
          // Legal only in Server Actions / Route Handlers
          store.set({ name, value, ...(options ?? {}) });
        },
        remove(name: string, options?: any) {
          store.set({ name, value: "", ...(options ?? {}), maxAge: 0 });
        },
      }
    : {
        // Default = read-only during render to avoid Next cookie error
        get(name: string) { return store.get(name)?.value; },
        set() {},
        remove() {},
      };

  // Inject X-Tenant-Id so RLS can scope by subdomain (or localhost → test)
  const options =
    tenantId
      ? { cookies: cookieAdapter, global: { headers: { "X-Tenant-Id": tenantId } } }
      : { cookies: cookieAdapter };

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    options
  );
}

// Back-compat export so existing imports keep working
export const getServerSupabase = () => getSupabaseServer({ writable: false });

// For Server Actions / Route Handlers when you **need** to write cookies
export const getServerSupabaseWritable = () => getSupabaseServer({ writable: true });
