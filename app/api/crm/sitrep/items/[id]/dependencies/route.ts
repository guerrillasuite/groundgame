import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getTenant } from "@/lib/tenant";
import { getCrmUser } from "@/lib/crm-auth";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

function makeSb(tenantId: string) {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { global: { headers: { "X-Tenant-Id": tenantId } } }
  );
}

const VALID_DEP_TYPES = ["blocks", "precedes", "follows", "relates_to", "duplicates"] as const;

// GET /api/crm/sitrep/items/[id]/dependencies
// Returns deps where item is from_item_id OR to_item_id
export async function GET(_req: NextRequest, { params }: Ctx) {
  const { id } = await params;
  const tenant = await getTenant();
  const crmUser = await getCrmUser();
  if (!crmUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const sb = makeSb(tenant.id);

  const [fromResult, toResult] = await Promise.all([
    sb
      .from("sitrep_dependencies")
      .select("id, dep_type, lag_days, to_item_id, created_at, sitrep_items!to_item_id(id, title, item_type, status)")
      .eq("from_item_id", id)
      .eq("tenant_id", tenant.id),
    sb
      .from("sitrep_dependencies")
      .select("id, dep_type, lag_days, from_item_id, created_at, sitrep_items!from_item_id(id, title, item_type, status)")
      .eq("to_item_id", id)
      .eq("tenant_id", tenant.id),
  ]);

  const outgoing = (fromResult.data ?? []).map((d: any) => ({
    ...d, direction: "outgoing", other_item: d.sitrep_items,
  }));
  const incoming = (toResult.data ?? []).map((d: any) => ({
    ...d, direction: "incoming", other_item: d.sitrep_items,
  }));

  return NextResponse.json([...outgoing, ...incoming]);
}

// POST /api/crm/sitrep/items/[id]/dependencies
// Body: { to_item_id, dep_type, lag_days? }
export async function POST(req: NextRequest, { params }: Ctx) {
  const { id } = await params;
  const tenant = await getTenant();
  const crmUser = await getCrmUser();
  if (!crmUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  if (!body?.to_item_id || !body?.dep_type) {
    return NextResponse.json({ error: "to_item_id and dep_type are required" }, { status: 400 });
  }
  if (!VALID_DEP_TYPES.includes(body.dep_type)) {
    return NextResponse.json({ error: `dep_type must be one of: ${VALID_DEP_TYPES.join(", ")}` }, { status: 400 });
  }
  if (body.to_item_id === id) {
    return NextResponse.json({ error: "Cannot create self-dependency" }, { status: 400 });
  }

  const sb = makeSb(tenant.id);

  const { data, error } = await sb
    .from("sitrep_dependencies")
    .insert({
      tenant_id:    tenant.id,
      from_item_id: id,
      to_item_id:   body.to_item_id,
      dep_type:     body.dep_type,
      lag_days:     body.lag_days ?? 0,
      created_by:   crmUser.userId,
    })
    .select("id")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await sb.from("sitrep_activity").insert({
    tenant_id:  tenant.id,
    item_id:    id,
    actor_id:   crmUser.userId,
    event_type: "dep_added",
    new_value:  `${body.dep_type}:${body.to_item_id}`,
  });

  return NextResponse.json({ id: (data as any).id, created: true });
}
