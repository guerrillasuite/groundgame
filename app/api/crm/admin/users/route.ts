/**
 * GET  /api/crm/admin/users?tenantId=<uuid|all>
 * POST /api/crm/admin/users
 *
 * GET  — List users. Super-admin can pass tenantId="all" or a specific UUID.
 *         Tenant admins are always scoped to their own tenant.
 *
 * POST — Create/invite a new user.
 *         Body: { email, name?, role, tenantId, password? }
 *         If no password: generates + returns an invite link.
 */

import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import {
  getAdminIdentity,
  assertCanManageTenant,
  assertSuperAdmin,
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

// ── GET ──────────────────────────────────────────────────────────────────────

export async function GET(request: Request) {
  try {
    const identity = await getAdminIdentity(request);
    if (!identity) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

    const url = new URL(request.url);
    const filterTenantId = url.searchParams.get("tenantId") ?? null;

    // Determine effective tenant filter
    let tenantFilter: string | null;
    if (identity.isSuperAdmin) {
      // Super-admin: "all" or specific UUID
      tenantFilter = filterTenantId === "all" ? null : filterTenantId;
    } else {
      // Tenant admin: always own tenant only
      if (identity.role !== "admin") {
        return NextResponse.json({ error: "Not authorized" }, { status: 403 });
      }
      tenantFilter = identity.tenantId;
    }

    if (tenantFilter) {
      const sb = getServiceClient();
      // Efficient path: query user_tenants for this tenant, then fetch only those users
      const { data: members, error: memberErr } = await sb
        .from("user_tenants")
        .select("user_id, role, is_default")
        .eq("tenant_id", tenantFilter)
        .in("status", ["active", "invited"]);

      if (memberErr) {
        return NextResponse.json({ error: "Failed to fetch members" }, { status: 502 });
      }

      const userIds = (members ?? []).map((m) => m.user_id as string);
      if (!userIds.length) return NextResponse.json([]);

      // Fetch auth user details for each member
      const authUsers = await Promise.all(
        userIds.map(async (uid) => {
          const r = await fetch(`${SB_URL()}/auth/v1/admin/users/${uid}`, { headers: sbHeaders() });
          return r.ok ? r.json() : null;
        })
      );

      const memberRoleMap = new Map((members ?? []).map((m) => [m.user_id, m.role]));

      const result = authUsers
        .filter(Boolean)
        .map((u: any) => ({
          id: u.id,
          email: u.email ?? "",
          name: u.user_metadata?.name ?? u.user_metadata?.full_name ?? "",
          role: memberRoleMap.get(u.id) ?? null,
          tenantId: tenantFilter,
          lastSignIn: u.last_sign_in_at ?? null,
          createdAt: u.created_at ?? null,
        }));

      return NextResponse.json(result);
    }

    // Super-admin "all tenants" path: fetch all auth users
    const res = await fetch(`${SB_URL()}/auth/v1/admin/users?per_page=1000`, {
      headers: sbHeaders(),
    });

    if (!res.ok) {
      return NextResponse.json({ error: "Failed to fetch users" }, { status: 502 });
    }

    const json = await res.json();
    const allUsers: any[] = json.users ?? [];

    // Pull primary tenant + role from user_tenants (is_default=true) for each user
    const sbAll = getServiceClient();
    const { data: primaryRows } = await sbAll
      .from("user_tenants")
      .select("user_id, tenant_id, role")
      .eq("is_default", true);
    const primaryMap = new Map((primaryRows ?? []).map((m) => [m.user_id as string, m]));

    const result = allUsers.map((u) => {
      const primary = primaryMap.get(u.id);
      return {
        id: u.id,
        email: u.email ?? "",
        name: u.user_metadata?.name ?? u.user_metadata?.full_name ?? "",
        role: primary?.role ?? u.app_metadata?.role ?? null,
        tenantId: primary?.tenant_id ?? u.app_metadata?.tenant_id ?? null,
        lastSignIn: u.last_sign_in_at ?? null,
        createdAt: u.created_at ?? null,
      };
    });

    return NextResponse.json(result);
  } catch (err) {
    return errResponse(err);
  }
}

// ── POST ─────────────────────────────────────────────────────────────────────

export async function POST(request: Request) {
  try {
    const identity = await getAdminIdentity(request);
    if (!identity) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

    const body = await request.json();
    const { email, name, role, tenantId, password } = body as {
      email: string;
      name?: string;
      role: "admin" | "field";
      tenantId: string;
      password?: string;
    };

    if (!email || !role || !tenantId) {
      return NextResponse.json({ error: "email, role, and tenantId are required" }, { status: 400 });
    }

    // Authorization: must be super-admin or admin for that tenant
    assertCanManageTenant(identity, tenantId);

    const payload: Record<string, any> = {
      email,
      email_confirm: true,
      user_metadata: { name: name ?? "" },
      app_metadata: { tenant_id: tenantId, role },
    };
    if (password) payload.password = password;

    const createRes = await fetch(`${SB_URL()}/auth/v1/admin/users`, {
      method: "POST",
      headers: sbHeaders(),
      body: JSON.stringify(payload),
    });

    const created = await createRes.json();
    if (!createRes.ok) {
      return NextResponse.json(
        { error: created.msg ?? created.message ?? "Failed to create user" },
        { status: createRes.status }
      );
    }

    // Map app role → DB user_role enum
    const dbRole = role === "admin" ? "admin" : "staff";
    const memberStatus = password ? "active" : "invited";

    // Insert into user_tenants so multi-tenant membership is tracked
    await fetch(`${SB_URL()}/rest/v1/user_tenants`, {
      method: "POST",
      headers: { ...sbHeaders(), Prefer: "return=minimal" },
      body: JSON.stringify({
        user_id: created.id,
        tenant_id: tenantId,
        role: dbRole,
        status: memberStatus,
        is_default: true,
      }),
    });

    let inviteLink: string | null = null;
    if (!password) {
      // Generate a magic-link invite so the admin can share it
      const linkRes = await fetch(`${SB_URL()}/auth/v1/admin/generate_link`, {
        method: "POST",
        headers: sbHeaders(),
        body: JSON.stringify({ type: "invite", email }),
      });
      if (linkRes.ok) {
        const linkData = await linkRes.json();
        inviteLink = linkData.action_link ?? linkData.hashed_token ?? null;
      }
    }

    return NextResponse.json({
      id: created.id,
      email: created.email,
      inviteLink,
    });
  } catch (err) {
    return errResponse(err);
  }
}
