/**
 * lib/adminAuth.ts
 *
 * Validates the caller's Supabase JWT and determines admin identity.
 * Used by all /api/crm/admin/* routes.
 *
 * Super-admin is determined by SUPER_ADMIN_EMAILS env var (comma-separated).
 * Tenant admin is determined by app_metadata.role === "admin" + app_metadata.tenant_id.
 */

import { createClient } from "@supabase/supabase-js";

export type AdminRole = "super_admin" | "director" | "support" | "operative" | null;

export type AdminIdentity = {
  userId: string;
  email: string;
  isSuperAdmin: boolean;
  tenantId: string | null;  // primary tenant (is_default=true or first)
  role: AdminRole;           // role for primary tenant
  tenantMemberships: { tenantId: string; role: string }[];
};

function makeSuperAdminEmails(): Set<string> {
  const raw = process.env.SUPER_ADMIN_EMAILS ?? "";
  return new Set(
    raw
      .split(",")
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean)
  );
}

function getServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  return createClient(url, key);
}

/**
 * Reads the Bearer token from the Authorization header, validates it with
 * Supabase, and returns the caller's admin identity.
 * Returns null if unauthenticated or token is invalid.
 */
export async function getAdminIdentity(
  request: Request
): Promise<AdminIdentity | null> {
  const authHeader = request.headers.get("Authorization") ?? "";
  const token = authHeader.startsWith("Bearer ")
    ? authHeader.slice(7).trim()
    : null;

  if (!token) return null;

  const sb = getServiceClient();
  const { data, error } = await sb.auth.getUser(token);
  if (error || !data.user) return null;

  const user = data.user;
  const email = (user.email ?? "").toLowerCase();
  const superAdmins = makeSuperAdminEmails();
  const isSuperAdmin = superAdmins.has(email);

  // Query user_tenants as the source of truth for tenant membership
  const { data: memberships } = await sb
    .from("user_tenants")
    .select("tenant_id, role, is_default")
    .eq("user_id", user.id)
    .in("status", ["active", "invited"]);

  const primary = memberships?.find((m) => m.is_default) ?? memberships?.[0] ?? null;
  const tenantId: string | null = primary?.tenant_id ?? null;
  const dbRole = primary?.role ?? null;

  const role: AdminRole = isSuperAdmin
    ? "super_admin"
    : dbRole === "director" || dbRole === "admin" || dbRole === "owner" ? "director"
    : dbRole === "support" || dbRole === "manager" ? "support"
    : dbRole === "operative" || dbRole === "staff" || dbRole === "field" ? "operative"
    : null;

  const tenantMemberships = (memberships ?? []).map((m) => ({
    tenantId: m.tenant_id as string,
    role: m.role as string,
  }));

  return { userId: user.id, email, isSuperAdmin, tenantId, role, tenantMemberships };
}

/**
 * Throws a Response with 401/403 if the identity is not sufficient.
 * - requireSuperAdmin: caller must be super-admin
 * - requireTenantId: caller must be super-admin OR admin for that specific tenant
 */
export function assertSuperAdmin(identity: AdminIdentity | null): void {
  if (!identity) throw new UnauthorizedError("Not authenticated");
  if (!identity.isSuperAdmin) throw new ForbiddenError("Super-admin only");
}

export function assertCanManageTenant(
  identity: AdminIdentity | null,
  tenantId: string
): void {
  if (!identity) throw new UnauthorizedError("Not authenticated");
  if (identity.isSuperAdmin) return;
  const canManage = identity.tenantMemberships.some(
    (m) => m.tenantId === tenantId && ["director", "support", "admin", "owner"].includes(m.role)
  );
  if (!canManage) throw new ForbiddenError("Not authorized for this tenant");
}

export class UnauthorizedError extends Error {
  readonly status = 401;
  constructor(msg: string) {
    super(msg);
    this.name = "UnauthorizedError";
  }
}

export class ForbiddenError extends Error {
  readonly status = 403;
  constructor(msg: string) {
    super(msg);
    this.name = "ForbiddenError";
  }
}

/** Wraps an admin route handler with auth error handling. */
export function adminRoute(
  handler: (req: Request, identity: AdminIdentity) => Promise<Response>
) {
  return async (req: Request): Promise<Response> => {
    try {
      const identity = await getAdminIdentity(req);
      if (!identity) {
        return new Response(JSON.stringify({ error: "Not authenticated" }), {
          status: 401,
          headers: { "Content-Type": "application/json" },
        });
      }
      return await handler(req, identity);
    } catch (err: any) {
      const status = err.status ?? 500;
      return new Response(JSON.stringify({ error: err.message ?? "Error" }), {
        status,
        headers: { "Content-Type": "application/json" },
      });
    }
  };
}
