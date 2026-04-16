/**
 * GET    /api/crm/admin/users/[id]/tenants  — list user's tenant memberships
 * POST   /api/crm/admin/users/[id]/tenants  — add a tenant { tenantId, role }
 * DELETE /api/crm/admin/users/[id]/tenants  — remove a tenant { tenantId }
 * PATCH  /api/crm/admin/users/[id]/tenants  — set default tenant { tenantId }
 */

import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getAdminIdentity, assertSuperAdmin, UnauthorizedError, ForbiddenError } from "@/lib/adminAuth";

export const dynamic = "force-dynamic";

function sb() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}

function errResponse(err: unknown) {
  if (err instanceof UnauthorizedError || err instanceof ForbiddenError) {
    return NextResponse.json({ error: (err as Error).message }, { status: (err as any).status });
  }
  const msg = err instanceof Error ? err.message : "Internal error";
  return NextResponse.json({ error: msg }, { status: 500 });
}

type Params = { params: Promise<{ id: string }> };

// ── GET ───────────────────────────────────────────────────────────────────────

export async function GET(request: Request, { params }: Params) {
  try {
    const identity = await getAdminIdentity(request);
    assertSuperAdmin(identity);
    const { id } = await params;

    const { data, error } = await sb()
      .from("user_tenants")
      .select("tenant_id, role, is_default, status")
      .eq("user_id", id)
      .order("is_default", { ascending: false });

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json(data ?? []);
  } catch (err) {
    return errResponse(err);
  }
}

// ── POST — add tenant ──────────────────────────────────────────────────────────

export async function POST(request: Request, { params }: Params) {
  try {
    const identity = await getAdminIdentity(request);
    assertSuperAdmin(identity);
    const { id } = await params;

    const { tenantId, role } = await request.json() as { tenantId: string; role: string };
    if (!tenantId || !role) {
      return NextResponse.json({ error: "tenantId and role are required" }, { status: 400 });
    }

    const dbRole = role; // director | support | operative

    const { error } = await sb()
      .from("user_tenants")
      .insert({ user_id: id, tenant_id: tenantId, role: dbRole, status: "active", is_default: false });

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ success: true });
  } catch (err) {
    return errResponse(err);
  }
}

// ── DELETE — remove tenant ────────────────────────────────────────────────────

export async function DELETE(request: Request, { params }: Params) {
  try {
    const identity = await getAdminIdentity(request);
    assertSuperAdmin(identity);
    const { id } = await params;

    const { tenantId } = await request.json() as { tenantId: string };
    if (!tenantId) return NextResponse.json({ error: "tenantId is required" }, { status: 400 });

    const { error } = await sb()
      .from("user_tenants")
      .delete()
      .eq("user_id", id)
      .eq("tenant_id", tenantId);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ success: true });
  } catch (err) {
    return errResponse(err);
  }
}

// ── PATCH — set default tenant ────────────────────────────────────────────────

export async function PATCH(request: Request, { params }: Params) {
  try {
    const identity = await getAdminIdentity(request);
    assertSuperAdmin(identity);
    const { id } = await params;

    const { tenantId } = await request.json() as { tenantId: string };
    if (!tenantId) return NextResponse.json({ error: "tenantId is required" }, { status: 400 });

    const client = sb();

    // Clear existing default, then set new one
    await client.from("user_tenants").update({ is_default: false }).eq("user_id", id);
    const { error } = await client
      .from("user_tenants")
      .update({ is_default: true })
      .eq("user_id", id)
      .eq("tenant_id", tenantId);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ success: true });
  } catch (err) {
    return errResponse(err);
  }
}
