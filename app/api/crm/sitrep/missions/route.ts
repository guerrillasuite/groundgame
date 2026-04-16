import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getTenant } from "@/lib/tenant";
import { getCrmUser } from "@/lib/crm-auth";

export const dynamic = "force-dynamic";

function makeSb(tenantId: string) {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { global: { headers: { "X-Tenant-Id": tenantId } } }
  );
}

// GET /api/crm/sitrep/missions
export async function GET(_req: NextRequest) {
  const tenant = await getTenant();
  const crmUser = await getCrmUser();
  if (!crmUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const sb = makeSb(tenant.id);

  const { data, error } = await sb
    .from("sitrep_missions")
    .select("id, title, description, status, due_date, visibility, created_by, created_at, updated_at")
    .eq("tenant_id", tenant.id)
    .order("due_date", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Visibility filter
  const missions = (data ?? []).filter((m: any) => {
    if (m.visibility === "private") return m.created_by === crmUser.userId;
    return true;
  });

  return NextResponse.json(missions);
}

// POST /api/crm/sitrep/missions
export async function POST(req: NextRequest) {
  const tenant = await getTenant();
  const crmUser = await getCrmUser();
  if (!crmUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  if (!body?.title?.trim()) {
    return NextResponse.json({ error: "title is required" }, { status: 400 });
  }

  const sb = makeSb(tenant.id);

  const { data, error } = await sb
    .from("sitrep_missions")
    .insert({
      tenant_id:   tenant.id,
      title:       body.title.trim(),
      description: body.description ?? null,
      status:      body.status ?? "planning",
      due_date:    body.due_date ?? null,
      visibility:  body.visibility ?? "team",
      created_by:  crmUser.userId,
    })
    .select("id")
    .single();

  if (error || !data) {
    return NextResponse.json({ error: error?.message ?? "Failed to create mission" }, { status: 500 });
  }

  return NextResponse.json({ id: (data as any).id, created: true });
}
