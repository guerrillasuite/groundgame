import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getTenant } from "@/lib/tenant";

export const dynamic = "force-dynamic";

function makeSb(tenantId: string) {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { global: { headers: { "X-Tenant-Id": tenantId } } }
  );
}

export async function POST(request: Request) {
  const tenant = await getTenant();

  const body = await request.json();
  const { type, keepId, deleteIds } = body as {
    type: "people" | "households" | "companies" | "locations" | "opportunities" | "stops";
    keepId: string;
    deleteIds: string[];
  };

  if (!type || !keepId || !deleteIds?.length) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  const sb = makeSb(tenant.id);

  // ── Merge people ──────────────────────────────────────────────────────────
  if (type === "people") {
    // Safety guard: only delete a person record if NO other tenant links them.
    // If another tenant links the duplicate, just remove this tenant's link instead.
    const { data: sharedLinks } = await sb
      .from("tenant_people")
      .select("person_id, tenant_id")
      .in("person_id", deleteIds)
      .neq("tenant_id", tenant.id);

    const sharedPersonIds = new Set((sharedLinks ?? []).map((r: any) => r.person_id));
    const safeToDelete = deleteIds.filter((id) => !sharedPersonIds.has(id));
    const unlinkOnly = deleteIds.filter((id) => sharedPersonIds.has(id));

    // For records shared with other tenants: redirect tenant_people → keeper, unlink duplicate
    if (unlinkOnly.length > 0) {
      // Delete this tenant's link to the duplicate (but keep the global record)
      await sb.from("tenant_people").delete().eq("tenant_id", tenant.id).in("person_id", unlinkOnly);
    }

    // For records only this tenant has: atomically reassign all references and delete
    if (safeToDelete.length > 0) {
      const { error: mergeErr } = await sb.rpc("gs_merge_people_v1", {
        p_tenant_id:  tenant.id,
        p_keep_id:    keepId,
        p_delete_ids: safeToDelete,
      });
      if (mergeErr) return NextResponse.json({ error: `merge failed: ${mergeErr.message}` }, { status: 500 });
    }

    return NextResponse.json({ merged: deleteIds.length });
  }

  // ── Merge households ──────────────────────────────────────────────────────
  if (type === "households") {
    const { data, error } = await sb.rpc("gs_merge_households_v1", {
      p_tenant_id: tenant.id, p_keep_id: keepId, p_delete_ids: deleteIds,
    });
    if (error) return NextResponse.json({ error: `merge failed: ${error.message}` }, { status: 500 });
    return NextResponse.json({ merged: (data as any) ?? deleteIds.length });
  }

  // ── Merge companies ───────────────────────────────────────────────────────
  if (type === "companies") {
    const { data, error } = await sb.rpc("gs_merge_companies_v1", {
      p_tenant_id: tenant.id, p_keep_id: keepId, p_delete_ids: deleteIds,
    });
    if (error) return NextResponse.json({ error: `merge failed: ${error.message}` }, { status: 500 });
    return NextResponse.json({ merged: (data as any) ?? deleteIds.length });
  }

  // ── Merge locations ───────────────────────────────────────────────────────
  if (type === "locations") {
    const { data, error } = await sb.rpc("gs_merge_locations_v1", {
      p_tenant_id: tenant.id, p_keep_id: keepId, p_delete_ids: deleteIds,
    });
    if (error) return NextResponse.json({ error: `merge failed: ${error.message}` }, { status: 500 });
    return NextResponse.json({ merged: (data as any) ?? deleteIds.length });
  }

  // ── Merge opportunities ───────────────────────────────────────────────────
  if (type === "opportunities") {
    const { data, error } = await sb.rpc("gs_merge_opportunities_v1", {
      p_tenant_id: tenant.id, p_keep_id: keepId, p_delete_ids: deleteIds,
    });
    if (error) return NextResponse.json({ error: `merge failed: ${error.message}` }, { status: 500 });
    return NextResponse.json({ merged: (data as any) ?? deleteIds.length });
  }

  // ── Merge stops ───────────────────────────────────────────────────────────
  if (type === "stops") {
    const { data, error } = await sb.rpc("gs_merge_stops_v1", {
      p_tenant_id: tenant.id, p_keep_id: keepId, p_delete_ids: deleteIds,
    });
    if (error) return NextResponse.json({ error: `merge failed: ${error.message}` }, { status: 500 });
    return NextResponse.json({ merged: (data as any) ?? deleteIds.length });
  }

  return NextResponse.json({ error: "Unknown type" }, { status: 400 });
}
