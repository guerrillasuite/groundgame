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

type Params = { params: Promise<{ id: string }> };

// PATCH /api/crm/people/[id]/tags
// Body: { add?: string[]; remove?: string[] }  (arrays of tag UUIDs)
export async function PATCH(req: NextRequest, { params }: Params) {
  const { id: personId } = await params;
  const tenant = await getTenant();
  const sb = makeSb(tenant.id);

  const body = await req.json().catch(() => null);
  const toAdd: string[] = Array.isArray(body?.add) ? body.add : [];
  const toRemove: string[] = Array.isArray(body?.remove) ? body.remove : [];

  // Fetch current tags
  const { data: row, error: fetchErr } = await sb
    .from("tenant_people")
    .select("tags")
    .eq("person_id", personId)
    .eq("tenant_id", tenant.id)
    .single();

  if (fetchErr || !row) {
    return NextResponse.json({ error: "Person not found" }, { status: 404 });
  }

  let current: string[] = Array.isArray(row.tags) ? row.tags : [];
  // Add new tags (dedupe)
  for (const id of toAdd) {
    if (!current.includes(id)) current.push(id);
  }
  // Remove tags
  current = current.filter((id) => !toRemove.includes(id));

  const { error } = await sb
    .from("tenant_people")
    .update({ tags: current })
    .eq("person_id", personId)
    .eq("tenant_id", tenant.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ tags: current });
}
