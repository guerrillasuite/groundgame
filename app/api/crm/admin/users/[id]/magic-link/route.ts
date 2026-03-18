/**
 * POST /api/crm/admin/users/[id]/magic-link
 *
 * Generates a magic login link for the given user.
 * Returns { link } — admin can copy it or it gets auto-emailed.
 */

import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import {
  getAdminIdentity,
  assertCanManageTenant,
  ForbiddenError,
  UnauthorizedError,
} from "@/lib/adminAuth";

function getServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}

export const dynamic = "force-dynamic";

const SB_URL = () => process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SB_KEY = () =>
  process.env.SUPABASE_SERVICE_ROLE_KEY ??
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

function sbHeaders() {
  return {
    Authorization: `Bearer ${SB_KEY()}`,
    apikey: SB_KEY(),
    "Content-Type": "application/json",
  };
}

function errResponse(err: unknown) {
  if (err instanceof UnauthorizedError || err instanceof ForbiddenError) {
    return NextResponse.json({ error: (err as Error).message }, { status: (err as any).status });
  }
  return NextResponse.json({ error: "Internal error" }, { status: 500 });
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const identity = await getAdminIdentity(request);
    if (!identity) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

    // Fetch target user to get their email and verify tenant
    const userRes = await fetch(`${SB_URL()}/auth/v1/admin/users/${id}`, {
      headers: sbHeaders(),
    });
    if (!userRes.ok) return NextResponse.json({ error: "User not found" }, { status: 404 });

    const target = await userRes.json();

    // Authorize via user_tenants
    const sb = getServiceClient();
    const { data: targetMemberships } = await sb
      .from("user_tenants")
      .select("tenant_id")
      .eq("user_id", id)
      .in("status", ["active", "invited"]);

    const targetTenantId: string | null =
      targetMemberships?.[0]?.tenant_id ?? target.app_metadata?.tenant_id ?? null;

    if (targetTenantId) {
      assertCanManageTenant(identity, targetTenantId);
    } else if (!identity.isSuperAdmin) {
      return NextResponse.json({ error: "Not authorized" }, { status: 403 });
    }

    const email: string = target.email;
    if (!email) return NextResponse.json({ error: "User has no email" }, { status: 400 });

    const body = await request.clone().json().catch(() => ({}));
    const next: string = body.next ?? "/crm";
    const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host") ?? "";
    const proto = request.headers.get("x-forwarded-proto") ?? "https";
    const redirectTo = `${proto}://${host}/api/auth/callback?next=${encodeURIComponent(next)}`;

    const linkRes = await fetch(`${SB_URL()}/auth/v1/admin/generate_link`, {
      method: "POST",
      headers: sbHeaders(),
      body: JSON.stringify({ type: "magiclink", email, redirect_to: redirectTo }),
    });

    const linkData = await linkRes.json();
    if (!linkRes.ok) {
      return NextResponse.json(
        { error: linkData.msg ?? linkData.message ?? "Failed to generate link" },
        { status: linkRes.status }
      );
    }

    const link = linkData.action_link ?? linkData.hashed_token ?? null;
    return NextResponse.json({ link, email });
  } catch (err) {
    return errResponse(err);
  }
}
