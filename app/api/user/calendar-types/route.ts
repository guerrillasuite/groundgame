import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getCrmUser } from "@/lib/crm-auth";
import { getTenant } from "@/lib/tenant";

export const dynamic = "force-dynamic";

const URL_  = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const KEY   = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const sb    = () => createClient(URL_, KEY);

const TYPE_SELECT = "id, name, color, cal_type, sources, delegate_for, sort_order, user_calendar_views(id, name, color, filter_config, is_default, sort_order)";

export async function GET() {
  const crmUser = await getCrmUser();
  if (!crmUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data, error } = await sb()
    .from("user_calendar_types")
    .select(TYPE_SELECT)
    .eq("owner_user_id", crmUser.userId)
    .order("sort_order")
    .order("created_at");

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? []);
}

export async function POST(req: NextRequest) {
  const crmUser = await getCrmUser();
  if (!crmUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const tenant = await getTenant();
  const body = await req.json().catch(() => null);
  if (!body?.name?.trim() || !body?.cal_type) {
    return NextResponse.json({ error: "name and cal_type required" }, { status: 400 });
  }

  // Enforce max 5 calendar types per user
  const { count } = await sb()
    .from("user_calendar_types")
    .select("id", { count: "exact", head: true })
    .eq("owner_user_id", crmUser.userId);
  if ((count ?? 0) >= 5) {
    return NextResponse.json({ error: "Maximum 5 calendar types per user" }, { status: 400 });
  }

  const sources = body.sources ?? (
    body.cal_type === "personal" ? [{ type: "personal" }] :
    body.cal_type === "family"   ? [{ type: "personal" }] :
    [{ type: "tenant", tenant_id: tenant.id }]  // work + custom both default to current tenant
  );

  const { data, error } = await sb()
    .from("user_calendar_types")
    .insert({
      owner_user_id: crmUser.userId,
      name:          body.name.trim(),
      color:         body.color ?? "blue",
      cal_type:      body.cal_type,
      sources,
      sort_order:    body.sort_order ?? 99,
    })
    .select(TYPE_SELECT)
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data, { status: 201 });
}
