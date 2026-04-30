import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getTenant } from "@/lib/tenant";
import { getCrmUser } from "@/lib/crm-auth";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string; dep_id: string }> };

function makeSb(tenantId: string) {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { global: { headers: { "X-Tenant-Id": tenantId } } }
  );
}

// DELETE /api/crm/sitrep/items/[id]/dependencies/[dep_id]
export async function DELETE(_req: NextRequest, { params }: Ctx) {
  const { id, dep_id } = await params;
  const tenant = await getTenant();
  const crmUser = await getCrmUser();
  if (!crmUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const sb = makeSb(tenant.id);

  const { data: dep } = await sb
    .from("sitrep_dependencies")
    .select("id, from_item_id, dep_type, to_item_id")
    .eq("id", dep_id)
    .eq("tenant_id", tenant.id)
    .single();

  if (!dep) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { error } = await sb
    .from("sitrep_dependencies")
    .delete()
    .eq("id", dep_id)
    .eq("tenant_id", tenant.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await sb.from("sitrep_activity").insert({
    tenant_id:  tenant.id,
    item_id:    id,
    actor_id:   crmUser.userId,
    event_type: "dep_removed",
    old_value:  `${(dep as any).dep_type}:${(dep as any).to_item_id}`,
  });

  return NextResponse.json({ ok: true });
}
