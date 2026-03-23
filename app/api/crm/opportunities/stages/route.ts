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
  const msg = err instanceof Error ? err.message : "Internal error";
  return NextResponse.json({ error: msg }, { status: 500 });
}

/** Resolves tenant ID. Super-admin can pass ?tenantId= with a Bearer token. */
async function resolveTenantId(request: Request): Promise<string> {
  const url = new URL(request.url);
  const overrideId = url.searchParams.get("tenantId");
  const authHeader = request.headers.get("Authorization") ?? "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : null;

  if (overrideId && token) {
    const identity = await getAdminIdentity(request);
    if (!identity?.isSuperAdmin) throw new ForbiddenError("Super-admin only");
    return overrideId;
  }

  const tenant = await getTenant();
  return tenant.id;
}

// ── GET ──────────────────────────────────────────────────────────────────────

export async function GET(request: Request) {
  try {
    const tenantId = await resolveTenantId(request);
    const sb = makeSb(tenantId);

    const { data, error } = await sb
      .from("opportunity_stages")
      .select("key, label, order_index")
      .eq("tenant_id", tenantId)
      .order("order_index");

    if (error) throw new Error(error.message);
    return NextResponse.json(data ?? []);
  } catch (err) {
    return errResponse(err);
  }
}

// ── PUT ──────────────────────────────────────────────────────────────────────

export async function PUT(request: Request) {
  try {
    const tenantId = await resolveTenantId(request);
    const sb = makeSb(tenantId);

    const body = await request.json();
    const stages: { key: string; label: string; order_index: number }[] = body.stages ?? [];
    const fallbackStage: string | undefined = body.fallbackStage;

    if (!stages.length) {
      return NextResponse.json({ error: "At least one stage is required" }, { status: 400 });
    }

    const newKeys = stages.map((s) => s.key);
    let migratedCount = 0;

    // Migrate orphaned opportunities before replacing stages
    if (fallbackStage) {
      const { data: migrated } = await sb
        .from("opportunities")
        .update({ stage: fallbackStage })
        .eq("tenant_id", tenantId)
        .not("stage", "in", `(${newKeys.join(",")})`)
        .not("stage", "is", null)
        .select("id");
      migratedCount = migrated?.length ?? 0;
    }

    // Replace all stages for this tenant
    const { error: delErr } = await sb
      .from("opportunity_stages")
      .delete()
      .eq("tenant_id", tenantId);
    if (delErr) throw new Error(delErr.message);

    const { error: insErr } = await sb
      .from("opportunity_stages")
      .insert(stages.map((s) => ({ ...s, tenant_id: tenantId })));
    if (insErr) throw new Error(insErr.message);

    return NextResponse.json({ ok: true, migratedCount });
  } catch (err) {
    return errResponse(err);
  }
}
