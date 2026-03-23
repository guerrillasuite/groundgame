import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getTenant } from "@/lib/tenant";
import { getAdminIdentity, ForbiddenError, UnauthorizedError } from "@/lib/adminAuth";

export const dynamic = "force-dynamic";

function makeSb(tenantId: string) {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { global: { headers: { "X-Tenant-Id": tenantId } } }
  );
}

function errResponse(err: unknown) {
  if (err instanceof UnauthorizedError || err instanceof ForbiddenError) {
    return NextResponse.json({ error: (err as Error).message }, { status: (err as any).status });
  }
  return NextResponse.json({ error: "Internal error" }, { status: 500 });
}

// ── POST ─────────────────────────────────────────────────────────────────────
// Returns how many opportunities would be orphaned by switching to newStageKeys.

export async function POST(request: Request) {
  try {
    const url = new URL(request.url);
    const overrideId = url.searchParams.get("tenantId");
    const authHeader = request.headers.get("Authorization") ?? "";
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : null;

    let tenantId: string;
    if (overrideId && token) {
      const identity = await getAdminIdentity(request);
      if (!identity?.isSuperAdmin) throw new ForbiddenError("Super-admin only");
      tenantId = overrideId;
    } else {
      const tenant = await getTenant();
      tenantId = tenant.id;
    }

    const body = await request.json();
    const newStageKeys: string[] = body.newStageKeys ?? [];

    if (!newStageKeys.length) {
      return NextResponse.json({ affectedCount: 0, orphanedStages: [] });
    }

    const sb = makeSb(tenantId);

    // Find opportunities whose current stage won't exist in the new set
    const { data, error } = await sb
      .from("opportunities")
      .select("stage")
      .eq("tenant_id", tenantId)
      .not("stage", "in", `(${newStageKeys.join(",")})`)
      .not("stage", "is", null);

    if (error) throw new Error(error.message);

    const rows = data ?? [];
    const orphanedStages = [...new Set(rows.map((r) => r.stage as string))];

    return NextResponse.json({ affectedCount: rows.length, orphanedStages });
  } catch (err) {
    return errResponse(err);
  }
}
