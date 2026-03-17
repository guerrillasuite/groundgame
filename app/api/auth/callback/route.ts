// app/api/auth/callback/route.ts
// Handles the PKCE code exchange for magic links (and OAuth if used later).
// Supabase redirects here after clicking the email link; we exchange the code
// for a session, set the cookies directly on the redirect response, then
// forward the user into the CRM.

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/crm";

  // Behind Railway's reverse proxy, request.nextUrl.origin resolves to the
  // internal address (localhost:8080). Use forwarded headers for the real origin.
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host") ?? request.nextUrl.host;
  const proto = request.headers.get("x-forwarded-proto") ?? "https";
  const origin = `${proto}://${host}`;

  if (code) {
    const cookieStore = await cookies();

    // Collect cookies written during exchangeCodeForSession so we can
    // attach them directly to the redirect response.
    const pendingCookies: Array<{ name: string; value: string; options: any }> = [];

    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return cookieStore.getAll();
          },
          setAll(cookiesToSet) {
            pendingCookies.push(...cookiesToSet);
          },
        },
      }
    );

    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      const response = NextResponse.redirect(`${origin}${next}`);
      // Write session cookies onto the redirect response
      for (const { name, value, options } of pendingCookies) {
        response.cookies.set(name, value, options);
      }
      return response;
    }
  }

  // Code missing or exchange failed — send back to login with an error flag
  return NextResponse.redirect(`${origin}/crm/account/auth?error=auth_callback_error`);
}
