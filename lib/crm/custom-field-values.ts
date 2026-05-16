import { NextRequest, NextResponse } from "next/server";
import { getTenant } from "@/lib/tenant";
import { makeAdminSb, CUSTOM_COLUMN, VALUE_TABLE, VALUE_PK } from "@/lib/crm/custom-fields";
import type { RecordType } from "@/lib/crm/custom-fields";

/**
 * Generic handler for PATCH /api/crm/<type>/[id]/custom-data (or custom-fields).
 * Merges the incoming key/value pairs into the existing JSONB column.
 * recordId is the record's primary key value.
 */
export async function handleCustomFieldPatch(
  req: NextRequest,
  recordType: RecordType,
  recordId: string,
): Promise<NextResponse> {
  const { id: tenantId } = await getTenant();
  const sb = makeAdminSb(tenantId);

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return NextResponse.json({ error: "Body must be a flat key/value object" }, { status: 400 });
  }

  const col   = CUSTOM_COLUMN[recordType];
  const table = VALUE_TABLE[recordType];
  const pk    = VALUE_PK[recordType];

  // Fetch existing JSONB to merge (prevents concurrent saves clobbering sibling keys)
  const { data: existing } = await sb
    .from(table)
    .select(col)
    .eq("tenant_id", tenantId)
    .eq(pk, recordId)
    .maybeSingle();

  const merged = { ...((existing as any)?.[col] ?? {}), ...body };

  const { error } = await sb
    .from(table)
    .update({ [col]: merged })
    .eq("tenant_id", tenantId)
    .eq(pk, recordId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ updated: true });
}
