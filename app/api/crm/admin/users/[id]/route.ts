/**
 * PATCH  /api/crm/admin/users/[id]  — update name, role, or password
 * DELETE /api/crm/admin/users/[id]  — permanently delete user
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
  const msg = err instanceof Error ? err.message : "Internal error";
  return NextResponse.json({ error: msg }, { status: 500 });
}

// Fetch target user to verify their tenantId
async function getTargetUser(userId: string) {
  const res = await fetch(`${SB_URL()}/auth/v1/admin/users/${userId}`, {
    headers: sbHeaders(),
  });
  if (!res.ok) return null;
  return res.json();
}

// ── PATCH ────────────────────────────────────────────────────────────────────

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const identity = await getAdminIdentity(request);
    if (!identity) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

    const target = await getTargetUser(id);
    if (!target) return NextResponse.json({ error: "User not found" }, { status: 404 });

    // Authorize via user_tenants — find which tenant this user belongs to
    const sb = getServiceClient();
    const { data: targetMemberships } = await sb
      .from("user_tenants")
      .select("tenant_id, role")
      .eq("user_id", id)
      .in("status", ["active", "invited"]);

    const primaryMembership = targetMemberships?.[0] ?? null;
    const targetTenantId: string | null = primaryMembership?.tenant_id ?? target.app_metadata?.tenant_id ?? null;

    if (targetTenantId) {
      assertCanManageTenant(identity, targetTenantId);
    } else if (!identity.isSuperAdmin) {
      return NextResponse.json({ error: "Not authorized" }, { status: 403 });
    }

    const body = await request.json();
    const { name, role, password } = body as {
      name?: string;
      role?: "director" | "support" | "operative";
      password?: string;
    };

    const updatePayload: Record<string, any> = {};

    if (name !== undefined) {
      updatePayload.user_metadata = {
        ...(target.user_metadata ?? {}),
        name,
      };
    }

    if (role !== undefined) {
      updatePayload.app_metadata = {
        ...(target.app_metadata ?? {}),
        role,
      };
      // Store role directly — new values are director/support/operative
      const dbRole = role;
      if (targetTenantId) {
        await sb
          .from("user_tenants")
          .update({ role: dbRole })
          .eq("user_id", id)
          .eq("tenant_id", targetTenantId);
      }
    }

    if (password) {
      updatePayload.password = password;
    }

    if (!Object.keys(updatePayload).length) {
      return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
    }

    const updateRes = await fetch(`${SB_URL()}/auth/v1/admin/users/${id}`, {
      method: "PUT",
      headers: sbHeaders(),
      body: JSON.stringify(updatePayload),
    });

    const updated = await updateRes.json();
    if (!updateRes.ok) {
      return NextResponse.json(
        { error: updated.msg ?? updated.message ?? "Failed to update user" },
        { status: updateRes.status }
      );
    }

    return NextResponse.json({
      id: updated.id,
      email: updated.email,
      name: updated.user_metadata?.name ?? "",
      role: updated.app_metadata?.role ?? null,
      tenantId: targetTenantId,
    });
  } catch (err) {
    return errResponse(err);
  }
}

// ── DELETE ───────────────────────────────────────────────────────────────────

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const identity = await getAdminIdentity(request);
    if (!identity) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

    const target = await getTargetUser(id);
    if (!target) return NextResponse.json({ error: "User not found" }, { status: 404 });

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

    // Remove user_tenants rows before deleting auth user
    await sb.from("user_tenants").delete().eq("user_id", id);

    const deleteRes = await fetch(`${SB_URL()}/auth/v1/admin/users/${id}`, {
      method: "DELETE",
      headers: sbHeaders(),
    });

    if (!deleteRes.ok) {
      const data = await deleteRes.json().catch(() => ({}));
      return NextResponse.json(
        { error: data.msg ?? data.message ?? "Failed to delete user" },
        { status: deleteRes.status }
      );
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    return errResponse(err);
  }
}
