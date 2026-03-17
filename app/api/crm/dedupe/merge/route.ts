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
    type: "people" | "households";
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

    // For records only this tenant has: safe to fully delete
    if (safeToDelete.length > 0) {
      // Remove from junction table first
      await sb.from("person_households").delete().eq("tenant_id", tenant.id).in("person_id", safeToDelete);
      // Remove this tenant's link
      await sb.from("tenant_people").delete().eq("tenant_id", tenant.id).in("person_id", safeToDelete);
      // Delete the duplicate person records (no other tenant references them)
      const { error: delErr } = await sb.from("people").delete().in("id", safeToDelete);
      if (delErr) return NextResponse.json({ error: `people delete: ${delErr.message}` }, { status: 500 });
    }

    return NextResponse.json({ merged: deleteIds.length });
  }

  // ── Merge households ──────────────────────────────────────────────────────
  if (type === "households") {
    // Move all people from duplicate households → keeper
    const { error: peopleErr } = await sb
      .from("people")
      .update({ household_id: keepId })
      .eq("tenant_id", tenant.id)
      .in("household_id", deleteIds);

    if (peopleErr) return NextResponse.json({ error: `people update: ${peopleErr.message}` }, { status: 500 });

    // Move person_households junction entries → keeper (upsert to avoid duplicate conflicts)
    const { data: phRows } = await sb
      .from("person_households")
      .select("person_id")
      .eq("tenant_id", tenant.id)
      .in("household_id", deleteIds);

    if (phRows && phRows.length > 0) {
      // Delete old junction rows
      await sb.from("person_households").delete().eq("tenant_id", tenant.id).in("household_id", deleteIds);
      // Re-insert pointing to keeper (ignore conflicts in case person already in keeper)
      const newRows = phRows.map((r: any) => ({ tenant_id: tenant.id, household_id: keepId, person_id: r.person_id }));
      await sb.from("person_households").upsert(newRows, { onConflict: "tenant_id,household_id,person_id", ignoreDuplicates: true });
    }

    // Delete duplicate households
    const { error: delErr, count } = await sb
      .from("households")
      .delete({ count: "exact" })
      .eq("tenant_id", tenant.id)
      .in("id", deleteIds);

    if (delErr) return NextResponse.json({ error: `households delete: ${delErr.message}` }, { status: 500 });

    // Refresh household name from current residents
    const { data: residents } = await sb
      .from("people")
      .select("last_name")
      .eq("tenant_id", tenant.id)
      .eq("household_id", keepId);

    const names = [...new Set((residents ?? []).map((r: any) => (r.last_name ?? "").trim()).filter(Boolean))].slice(0, 3);
    if (names.length > 0) {
      await sb.from("households").update({ name: names.join(" / ") }).eq("id", keepId).eq("tenant_id", tenant.id);
    }

    return NextResponse.json({ merged: count ?? deleteIds.length });
  }

  return NextResponse.json({ error: "Unknown type" }, { status: 400 });
}
