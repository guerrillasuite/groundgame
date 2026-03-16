/**
 * GET /api/crm/admin/me
 *
 * Returns the caller's admin identity: isSuperAdmin, tenantId, role.
 * Used by the client to determine which UI to show on the Users page.
 */

import { NextResponse } from "next/server";
import { getAdminIdentity } from "@/lib/adminAuth";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const identity = await getAdminIdentity(request);

  if (!identity) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  return NextResponse.json({
    userId: identity.userId,
    email: identity.email,
    isSuperAdmin: identity.isSuperAdmin,
    tenantId: identity.tenantId,
    role: identity.role,
  });
}
