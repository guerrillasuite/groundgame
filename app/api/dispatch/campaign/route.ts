import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getTenant } from "@/lib/tenant";
import { getCrmUser } from "@/lib/crm-auth";
import { hasFeature } from "@/lib/features";

export const dynamic = "force-dynamic";

const ALLOWED_FIELDS = [
  "name", "subject", "preview_text", "from_name", "from_email", "reply_to",
  "design_json", "html_body", "status",
  "audience_type", "audience_list_id", "audience_segment_filters", "audience_person_ids",
  "scheduled_at", "audience_count",
] as const;

function makeSb(tenantId: string) {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { global: { headers: { "X-Tenant-Id": tenantId } } }
  );
}

function pickAllowed(body: Record<string, unknown>) {
  const result: Record<string, unknown> = {};
  for (const key of ALLOWED_FIELDS) {
    if (key in body) result[key] = body[key];
  }
  return result;
}

export async function POST(req: NextRequest) {
  const [tenant, user] = await Promise.all([getTenant(), getCrmUser()]);

  if (!hasFeature(tenant.features, "crm_dispatch") && !user?.isSuperAdmin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json();
  const fields = pickAllowed(body);

  if (!fields.name || !fields.subject || !fields.from_name || !fields.from_email) {
    return NextResponse.json({ error: "name, subject, from_name, and from_email are required" }, { status: 400 });
  }

  const sb = makeSb(tenant.id);
  const { data, error } = await sb
    .from("email_campaigns")
    .insert({
      ...fields,
      tenant_id: tenant.id,
      created_by: user?.userId ?? null,
      status: fields.status ?? "draft",
      updated_at: new Date().toISOString(),
    })
    .select("id")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ id: data.id });
}
