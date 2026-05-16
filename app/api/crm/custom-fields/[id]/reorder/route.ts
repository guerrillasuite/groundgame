import { NextRequest, NextResponse } from "next/server";
import { getTenant } from "@/lib/tenant";
import { makeAdminSb } from "@/lib/crm/custom-fields";

export const dynamic = "force-dynamic";

// PATCH /api/crm/custom-fields/[id]/reorder
// Body: { order: ["uuid1", "uuid2", ...] }  — full ordered list of IDs for this record_type
export async function PATCH(req: NextRequest) {
  const { id: tenantId } = await getTenant();
  const sb = makeAdminSb(tenantId);

  const body = await req.json().catch(() => null);
  if (!Array.isArray(body?.order)) {
    return NextResponse.json({ error: "order array is required" }, { status: 400 });
  }

  const updates = (body.order as string[]).map((id, index) =>
    sb
      .from("custom_field_definitions")
      .update({ sort_order: index, updated_at: new Date().toISOString() })
      .eq("id", id)
      .eq("tenant_id", tenantId)
  );

  await Promise.all(updates);
  return NextResponse.json({ reordered: true });
}
