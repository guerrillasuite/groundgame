import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getTenant } from "@/lib/tenant";
import { requireDirectorApi } from "@/lib/crm-auth";

export const dynamic = "force-dynamic";

function makeSb(tenantId: string) {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { global: { headers: { "X-Tenant-Id": tenantId } } }
  );
}

export type ContactTypeWithStages = {
  key: string;
  label: string;
  order_index: number;
  stages: { key: string; label: string; order_index: number }[];
};

// GET /api/crm/settings/contact-types
export async function GET() {
  const tenant = await getTenant();
  const sb = makeSb(tenant.id);

  const { data: types, error: typesErr } = await sb
    .from("tenant_contact_types")
    .select("key, label, order_index")
    .eq("tenant_id", tenant.id)
    .order("order_index");

  if (typesErr) return NextResponse.json({ error: typesErr.message }, { status: 500 });

  const contactTypes: ContactTypeWithStages[] = Array.isArray(types) ? [...types] : [];

  if (contactTypes.length > 0) {
    const keys = contactTypes.map((t) => t.key);
    const { data: stages } = await sb
      .from("opportunity_stages")
      .select("key, label, order_index, contact_type_key")
      .eq("tenant_id", tenant.id)
      .in("contact_type_key", keys)
      .order("order_index");

    const stagesByType: Record<string, { key: string; label: string; order_index: number }[]> = {};
    for (const s of (stages ?? []) as any[]) {
      if (!stagesByType[s.contact_type_key]) stagesByType[s.contact_type_key] = [];
      stagesByType[s.contact_type_key].push({ key: s.key, label: s.label, order_index: s.order_index });
    }

    for (const ct of contactTypes) {
      ct.stages = stagesByType[ct.key] ?? [];
    }
  }

  return NextResponse.json(contactTypes);
}

// PUT /api/crm/settings/contact-types
export async function PUT(req: NextRequest) {
  const denied = await requireDirectorApi();
  if (denied) return denied;
  const tenant = await getTenant();
  const sb = makeSb(tenant.id);

  const body = await req.json().catch(() => null);
  const contactTypes: ContactTypeWithStages[] = body?.contactTypes ?? [];
  const fallbackMap: Record<string, string> | undefined = body?.fallbackMap;

  // Migrate orphaned opportunity pipeline values
  if (fallbackMap && Object.keys(fallbackMap).length > 0) {
    for (const [oldKey, newKey] of Object.entries(fallbackMap)) {
      await sb
        .from("opportunities")
        .update({ pipeline: newKey })
        .eq("tenant_id", tenant.id)
        .eq("pipeline", oldKey);
    }
  }

  // Replace all tenant_contact_types
  await sb.from("tenant_contact_types").delete().eq("tenant_id", tenant.id);

  if (contactTypes.length > 0) {
    const { error: insErr } = await sb
      .from("tenant_contact_types")
      .insert(contactTypes.map((ct) => ({
        tenant_id: tenant.id,
        key: ct.key,
        label: ct.label,
        order_index: ct.order_index,
      })));
    if (insErr) return NextResponse.json({ error: insErr.message }, { status: 500 });
  }

  // Replace all opportunity_stages that have a contact_type_key for this tenant
  const { data: existingTaggedStages } = await sb
    .from("opportunity_stages")
    .select("id")
    .eq("tenant_id", tenant.id)
    .not("contact_type_key", "is", null);

  if ((existingTaggedStages ?? []).length > 0) {
    await sb
      .from("opportunity_stages")
      .delete()
      .eq("tenant_id", tenant.id)
      .not("contact_type_key", "is", null);
  }

  const newStages: any[] = [];
  for (const ct of contactTypes) {
    for (const s of ct.stages ?? []) {
      newStages.push({
        tenant_id: tenant.id,
        key: s.key,
        label: s.label,
        order_index: s.order_index,
        contact_type_key: ct.key,
      });
    }
  }

  if (newStages.length > 0) {
    const { error: stageErr } = await sb.from("opportunity_stages").insert(newStages);
    if (stageErr) return NextResponse.json({ error: stageErr.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
