import { NextRequest, NextResponse } from "next/server";
import { getTenant } from "@/lib/tenant";
import { makeAdminSb, slugifyLabel } from "@/lib/crm/custom-fields";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

// PATCH /api/crm/custom-fields/[id]
// Updatable: label, field_type, options, contact_type_keys, placeholder, help_text, required, sort_order, is_archived
// NOT updatable: field_key, record_type, tenant_id, pipeline_type_key, sitrep_type_id
export async function PATCH(req: NextRequest, { params }: Params) {
  const { id: tenantId } = await getTenant();
  const sb = makeAdminSb(tenantId);
  const { id } = await params;

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Invalid body" }, { status: 400 });

  // Strip immutable fields from incoming payload
  const { field_key, record_type, tenant_id, pipeline_type_key, sitrep_type_id, created_at, created_by, ...allowed } = body;

  const patch: Record<string, unknown> = {};
  if (allowed.label !== undefined)             patch.label             = allowed.label.trim();
  if (allowed.field_type !== undefined)        patch.field_type        = allowed.field_type;
  if (allowed.options !== undefined)           patch.options           = allowed.options;
  if (allowed.contact_type_keys !== undefined) patch.contact_type_keys = allowed.contact_type_keys;
  if (allowed.placeholder !== undefined)       patch.placeholder       = allowed.placeholder?.trim() || null;
  if (allowed.help_text !== undefined)         patch.help_text         = allowed.help_text?.trim() || null;
  if (allowed.required !== undefined)          patch.required          = allowed.required === true;
  if (allowed.sort_order !== undefined)        patch.sort_order        = allowed.sort_order;
  if (allowed.is_archived !== undefined)       patch.is_archived       = allowed.is_archived === true;
  patch.updated_at = new Date().toISOString();

  const { data, error } = await sb
    .from("custom_field_definitions")
    .update(patch)
    .eq("id", id)
    .eq("tenant_id", tenantId)
    .select("*")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ definition: data });
}

// DELETE /api/crm/custom-fields/[id] — archives only, never hard-deletes
export async function DELETE(req: NextRequest, { params }: Params) {
  const { id: tenantId } = await getTenant();
  const sb = makeAdminSb(tenantId);
  const { id } = await params;

  const { data, error } = await sb
    .from("custom_field_definitions")
    .update({ is_archived: true, updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("tenant_id", tenantId)
    .select("id")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ archived: true });
}
