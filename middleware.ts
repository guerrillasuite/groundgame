import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// Inline copy of lib/tenant.ts hardcoded map — can't import server lib in Edge middleware
const HARDCODED_TENANTS: Record<string, string> = {
  "test":           "00000000-0000-0000-0000-000000000000",
  "localhost":      "00000000-0000-0000-0000-000000000000",
  "guerrillasuite": "85c60ca4-ee15-4d45-b27e-a8758d91f896",
  "fsm":            "038f7dc1-2892-4b37-9b08-f9c93f9d53b0",
  "riseandfite":    "d43bad5e-921a-48b7-ae83-4fa8de0d6730",
  "thunder":        "f5627732-3739-4317-87f8-f0e6b1bf980a",
  "lpky":           "96b2b6f4-cec6-4801-9287-4806a7085463",
  "lp-bexar":       "cb751fb2-b8e6-4115-af21-0aa87cb377b1",
};

function getSlug(req: NextRequest): string {
  const host = (req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? "").toLowerCase();
  return host.split(":")[0].split(".")[0] || "localhost";
}

async function resolveTenantId(slug: string): Promise<string | null> {
  if (HARDCODED_TENANTS[slug]) return HARDCODED_TENANTS[slug];
  try {
    const sb = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );
    const { data } = await sb.from("tenants").select("id").eq("slug", slug).single();
    return data?.id ?? null;
  } catch {
    return null;
  }
}

async function userBelongsToTenant(userId: string, tenantId: string): Promise<boolean> {
  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
  const { data } = await sb
    .from("user_tenants")
    .select("user_id")
    .eq("user_id", userId)
    .eq("tenant_id", tenantId)
    .in("status", ["active", "invited"])
    .limit(1);
  return (data?.length ?? 0) > 0;
}

function checkSuperAdmin(email: string): boolean {
  const list = (process.env.SUPER_ADMIN_EMAILS ?? "")
    .split(",").map((e) => e.trim().toLowerCase()).filter(Boolean);
  return list.includes(email.toLowerCase());
}

export async function middleware(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // Refresh session — required by @supabase/ssr to keep cookies fresh
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;

  // Protect /crm/* but not the login page itself
  const isCrmPage =
    pathname.startsWith("/crm") &&
    !pathname.startsWith("/crm/account/auth");

  // Protect /api/crm/*
  const isCrmApi = pathname.startsWith("/api/crm");

  // Protect PWA app routes (doors, dials, storefront, root home)
  const isPwaPage =
    (pathname === "/" ||
      pathname.startsWith("/doors") ||
      pathname.startsWith("/dials") ||
      pathname.startsWith("/storefront") ||
      pathname.startsWith("/account")) &&
    !pathname.startsWith("/account/auth") &&
    !pathname.startsWith("/account/set-password");

  // Protect PWA API routes
  // /api/survey/panel-submit and /api/survey/response are called by public hosted
  // survey pages (/s/[surveyId]) where the respondent has no session.
  const isPublicSurveySubmit =
    pathname.startsWith("/api/survey/panel-submit") ||
    pathname.startsWith("/api/survey/response");
  const isPwaApi =
    pathname.startsWith("/api/doors") ||
    (pathname.startsWith("/api/survey") && !isPublicSurveySubmit) ||
    pathname.startsWith("/api/contacts");

  if (!user) {
    if (isCrmApi || isPwaApi) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (isCrmPage) {
      const loginUrl = request.nextUrl.clone();
      loginUrl.pathname = "/crm/account/auth";
      loginUrl.searchParams.set("next", pathname);
      return NextResponse.redirect(loginUrl);
    }
    if (isPwaPage) {
      const loginUrl = request.nextUrl.clone();
      loginUrl.pathname = "/account/auth";
      loginUrl.searchParams.set("next", pathname);
      return NextResponse.redirect(loginUrl);
    }
  }

  // Tenant membership check — logged-in users can only access tenants they belong to
  if (user && (isCrmPage || isCrmApi || isPwaPage || isPwaApi)) {
    const email = user.email ?? "";
    if (!checkSuperAdmin(email)) {
      const slug = getSlug(request);
      const tenantId = await resolveTenantId(slug);
      if (tenantId) {
        const allowed = await userBelongsToTenant(user.id, tenantId);
        if (!allowed) {
          if (isCrmApi || isPwaApi) {
            return NextResponse.json({ error: "Forbidden" }, { status: 403 });
          }
          const loginUrl = request.nextUrl.clone();
          loginUrl.pathname = isCrmPage ? "/crm/account/auth" : "/account/auth";
          loginUrl.searchParams.set("error", "wrong_tenant");
          return NextResponse.redirect(loginUrl);
        }
      }
    }
  }

  return supabaseResponse;
}

export const config = {
  matcher: [
    // Match all routes except Next.js internals and static assets
    "/((?!_next/static|_next/image|favicon.ico|icons/|manifest\\.webmanifest).*)",
  ],
};
