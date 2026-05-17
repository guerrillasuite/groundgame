import { NextRequest, NextResponse } from "next/server";
import { getTenant } from "@/lib/tenant";
import { createClient } from "@supabase/supabase-js";
import { STANDARD_FIELDS, type RecordType } from "@/lib/crm/standard-field-overrides";

function makeSb(tenantId: string) {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { global: { headers: { "X-Tenant-Id": tenantId } } }
  );
}

const VALID_RECORD_TYPES = new Set(Object.keys(STANDARD_FIELDS));

function isValidFieldKey(recordType: RecordType, fieldKey: string): boolean {
  return STANDARD_FIELDS[recordType]?.some(f => f.key === fieldKey) ?? false;
}

// GET /api/crm/standard-field-overrides — all overrides for tenant
export async function GET() {
  const tenant = await getTenant();
  const sb = makeSb(tenant.id);
  const { data, error } = await sb
    .from("standard_field_overrides")
    .select("*")
    .eq("tenant_id", tenant.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? []);
}

// POST /api/crm/standard-field-overrides — upsert { record_type, field_key, custom_label }
export async function POST(req: NextRequest) {
  const tenant = await getTenant();
  const sb = makeSb(tenant.id);

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Invalid body" }, { status: 400 });

  const { record_type, field_key, custom_label } = body as Record<string, string>;
  if (!VALID_RECORD_TYPES.has(record_type)) {
    return NextResponse.json({ error: "Invalid record_type" }, { status: 400 });
  }
  if (!isValidFieldKey(record_type as RecordType, field_key)) {
    return NextResponse.json({ error: "Invalid field_key for this record_type" }, { status: 400 });
  }
  if (!custom_label?.trim()) {
    return NextResponse.json({ error: "custom_label required" }, { status: 400 });
  }

  const { data, error } = await sb
    .from("standard_field_overrides")
    .upsert(
      { tenant_id: tenant.id, record_type, field_key, custom_label: custom_label.trim() },
      { onConflict: "tenant_id,record_type,field_key" }
    )
    .select("*")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

// DELETE /api/crm/standard-field-overrides — body: { record_type, field_key }
export async function DELETE(req: NextRequest) {
  const tenant = await getTenant();
  const sb = makeSb(tenant.id);

  const body = await req.json().catch(() => null);
  const { record_type, field_key } = (body ?? {}) as Record<string, string>;
  if (!record_type || !field_key) {
    return NextResponse.json({ error: "record_type and field_key required" }, { status: 400 });
  }

  const { error } = await sb
    .from("standard_field_overrides")
    .delete()
    .eq("tenant_id", tenant.id)
    .eq("record_type", record_type)
    .eq("field_key", field_key);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
