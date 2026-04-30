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

// GET /api/crm/sitrep/items/[id]/children
export async function GET(_req: NextRequest, { params }: Ctx) {
  const { id } = await params;
  const tenant = await getTenant();
  const crmUser = await getCrmUser();
  if (!crmUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const sb = makeSb(tenant.id);

  const { data, error } = await sb
    .from("sitrep_items")
    .select(`
      id, item_type, title, status, priority, due_date,
      depth, parent_item_id, created_by, created_at,
      sitrep_assignments(user_id, role)
    `)
    .eq("parent_item_id", id)
    .eq("tenant_id", tenant.id)
    .order("due_date", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // For each child, get its own child count
  const children = [...(data ?? [])] as any[];
  if (children.length > 0) {
    const childIds = children.map((c) => c.id);
    const { data: grandchildCounts } = await sb
      .from("sitrep_items")
      .select("parent_item_id")
      .in("parent_item_id", childIds)
      .eq("tenant_id", tenant.id);

    const countMap: Record<string, number> = {};
    for (const row of grandchildCounts ?? []) {
      countMap[row.parent_item_id] = (countMap[row.parent_item_id] ?? 0) + 1;
    }
    for (const child of children) {
      child.child_count = countMap[child.id] ?? 0;
    }
  }

  return NextResponse.json(children);
}
