import { createServerClient } from "@supabase/ssr";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

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
  const isPwaApi =
    pathname.startsWith("/api/doors") ||
    pathname.startsWith("/api/survey") ||
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

  return supabaseResponse;
}

export const config = {
  matcher: [
    // Match all routes except Next.js internals and static assets
    "/((?!_next/static|_next/image|favicon.ico|icons/|manifest\\.webmanifest).*)",
  ],
};
