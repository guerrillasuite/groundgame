import { NextRequest, NextResponse } from "next/server";
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

// POST /api/crm/tags/bulk-edit
// Body: { person_ids: string[]; add?: string[]; remove?: string[] }
export async function POST(req: NextRequest) {
  const tenant = await getTenant();
  const sb = makeSb(tenant.id);

  const body = await req.json().catch(() => null);
  const personIds: string[] = Array.isArray(body?.person_ids) ? body.person_ids : [];
  const toAdd: string[] = Array.isArray(body?.add) ? body.add : [];
  const toRemove: string[] = Array.isArray(body?.remove) ? body.remove : [];

  if (personIds.length === 0) {
    return NextResponse.json({ error: "No person_ids provided" }, { status: 400 });
  }

  // Fetch all affected rows
  const { data: rows, error: fetchErr } = await sb
    .from("tenant_people")
    .select("person_id, tags")
    .eq("tenant_id", tenant.id)
    .in("person_id", personIds);

  if (fetchErr) return NextResponse.json({ error: fetchErr.message }, { status: 500 });

  const updates = (rows ?? []).map((row: any) => {
    let tags: string[] = Array.isArray(row.tags) ? [...row.tags] : [];
    for (const id of toAdd) {
      if (!tags.includes(id)) tags.push(id);
    }
    tags = tags.filter((id) => !toRemove.includes(id));
    return { person_id: row.person_id, tenant_id: tenant.id, tags };
  });

  if (updates.length > 0) {
    const { error } = await sb
      .from("tenant_people")
      .upsert(updates, { onConflict: "tenant_id,person_id" });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ updated: updates.length });
}
