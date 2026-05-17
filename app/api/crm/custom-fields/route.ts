import { NextRequest, NextResponse } from "next/server";
import { getTenant } from "@/lib/tenant";
import { makeAdminSb, RECORD_TYPES, FIELD_TYPES, resolveUniqueKey } from "@/lib/crm/custom-fields";
import type { RecordType, FieldType } from "@/lib/crm/custom-fields";

export const dynamic = "force-dynamic";

// GET /api/crm/custom-fields?record_type=people[&pipeline_type_key=x][&sitrep_type_id=x][&include_archived=true]
export async function GET(req: NextRequest) {
  const { id: tenantId } = await getTenant();
  const sb = makeAdminSb(tenantId);
  const { searchParams } = new URL(req.url);

  const recordType = searchParams.get("record_type") as RecordType | null;
  if (!recordType || !RECORD_TYPES.includes(recordType)) {
    return NextResponse.json({ error: "record_type is required" }, { status: 400 });
  }

  let query = sb
    .from("custom_field_definitions")
    .select("*")
    .eq("tenant_id", tenantId)
    .eq("record_type", recordType)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });

  if (searchParams.get("include_archived") !== "true") {
    query = query.eq("is_archived", false);
  }
  if (searchParams.get("pipeline_type_key")) {
    query = query.eq("pipeline_type_key", searchParams.get("pipeline_type_key")!);
  }
  if (searchParams.get("sitrep_type_id")) {
    query = query.eq("sitrep_type_id", searchParams.get("sitrep_type_id")!);
  }
  if (searchParams.get("display_scope")) {
    query = query.eq("display_scope", searchParams.get("display_scope")!);
  }

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ definitions: data ?? [] });
}

// POST /api/crm/custom-fields
export async function POST(req: NextRequest) {
  const { id: tenantId } = await getTenant();
  const sb = makeAdminSb(tenantId);

  const body = await req.json().catch(() => null);
  if (!body?.record_type || !body?.label?.trim() || !body?.field_type) {
    return NextResponse.json({ error: "record_type, label, and field_type are required" }, { status: 400 });
  }

  const recordType = body.record_type as RecordType;
  const fieldType = body.field_type as FieldType;

  if (!RECORD_TYPES.includes(recordType)) {
    return NextResponse.json({ error: `Invalid record_type: ${recordType}` }, { status: 400 });
  }
  if (!FIELD_TYPES.includes(fieldType)) {
    return NextResponse.json({ error: `Invalid field_type: ${fieldType}` }, { status: 400 });
  }

  const fieldKey = await resolveUniqueKey(sb, tenantId, recordType, body.label.trim());

  const row: Record<string, unknown> = {
    tenant_id:         tenantId,
    record_type:       recordType,
    field_key:         fieldKey,
    label:             body.label.trim(),
    field_type:        fieldType,
    options:           Array.isArray(body.options) ? body.options : [],
    contact_type_keys: Array.isArray(body.contact_type_keys) ? body.contact_type_keys : [],
    required:          body.required === true,
    placeholder:       body.placeholder?.trim() || null,
    help_text:         body.help_text?.trim() || null,
    sort_order:        typeof body.sort_order === "number" ? body.sort_order : 0,
  };

  if (recordType === "opportunities" && body.pipeline_type_key) {
    row.pipeline_type_key = body.pipeline_type_key;
  }
  if (recordType === "sitrep_items" && body.sitrep_type_id) {
    row.sitrep_type_id = body.sitrep_type_id;
  }

  const { data, error } = await sb
    .from("custom_field_definitions")
    .insert(row)
    .select("*")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ definition: data }, { status: 201 });
}
