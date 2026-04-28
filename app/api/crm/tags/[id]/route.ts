/*
  Requires this SQL function (add to your migration):

  CREATE OR REPLACE FUNCTION remove_tag_from_people(p_tenant_id UUID, p_tag_id UUID)
  RETURNS void LANGUAGE sql AS $$
    UPDATE tenant_people
    SET tags = array_remove(tags, p_tag_id)
    WHERE tenant_id = p_tenant_id
      AND tags @> ARRAY[p_tag_id];
  $$;
*/

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

// PATCH /api/crm/tags/[id] — rename a tag
export async function PATCH(req: NextRequest, { params }: Params) {
  const { id } = await params;
  const tenant = await getTenant();
  const sb = makeSb(tenant.id);
  const body = await req.json().catch(() => null);
  const name = body?.name?.trim();
  if (!name) return NextResponse.json({ error: "Name is required" }, { status: 400 });

  const { data, error } = await sb
    .from("tenant_tags")
    .update({ name, updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("tenant_id", tenant.id)
    .select("id, name, created_at")
    .single();

  if (error) {
    if (error.code === "23505") {
      return NextResponse.json({ error: "A tag with this name already exists." }, { status: 409 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data);
}

// DELETE /api/crm/tags/[id] — delete a tag (cleans up tenant_people.tags array)
export async function DELETE(_req: NextRequest, { params }: Params) {
  const { id } = await params;
  const tenant = await getTenant();
  const sb = makeSb(tenant.id);

  // Verify tag belongs to this tenant
  const { data: tag } = await sb
    .from("tenant_tags")
    .select("id")
    .eq("id", id)
    .eq("tenant_id", tenant.id)
    .single();

  if (!tag) return NextResponse.json({ error: "Tag not found" }, { status: 404 });

  // Remove tag UUID from all tenant_people.tags arrays via Postgres function
  await sb.rpc("remove_tag_from_people", { p_tenant_id: tenant.id, p_tag_id: id });

  const { error } = await sb
    .from("tenant_tags")
    .delete()
    .eq("id", id)
    .eq("tenant_id", tenant.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
