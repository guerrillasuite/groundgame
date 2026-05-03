import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getCrmUser } from "@/lib/crm-auth";

export const dynamic = "force-dynamic";

function makeAdminSb() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}

const SELECT = "id, name, color, cal_type, sources, sort_order, user_calendar_views(id, name, color, is_default, sort_order)";

// Seed calendar types from tenant memberships when user has none
async function seedFromTenants(sb: ReturnType<typeof makeAdminSb>, userId: string) {
  const { data: memberships } = await sb
    .from("user_tenants")
    .select("tenant_id")
    .eq("user_id", userId)
    .in("status", ["active", "invited"])
    .order("created_at");

  const tenantIds = (memberships ?? []).map((m: any) => m.tenant_id as string);
  if (!tenantIds.length) return;

  const { data: tenants } = await sb
    .from("tenants")
    .select("id, name, slug")
    .in("id", tenantIds);

  const tenantMap = Object.fromEntries((tenants ?? []).map((t: any) => [t.id, t]));

  const COLORS = ["blue", "violet", "teal", "amber", "indigo", "green"];
  for (let i = 0; i < tenantIds.length; i++) {
    const tid    = tenantIds[i];
    const tenant = tenantMap[tid] as any;
    const name   = tenant?.name ?? tenant?.slug ?? `Calendar ${i + 1}`;
    const color  = COLORS[i % COLORS.length];

    const { data: calType } = await sb
      .from("user_calendar_types")
      .insert({
        owner_user_id: userId,
        name,
        color,
        cal_type:  i === 0 ? "work" : "custom",
        sources:   [{ type: "tenant", tenant_id: tid }],
        sort_order: i,
      })
      .select("id")
      .single();

    if (calType) {
      await sb.from("user_calendar_views").insert({
        calendar_type_id: calType.id,
        owner_user_id:    userId,
        name:             `My ${name}`,
        filter_config:    { assignee_filter: "me" },
        is_default:       true,
        sort_order:       0,
      }).catch(() => {});
    }
  }
}

// GET — returns user's calendar types, seeding on first use
export async function GET(_req: NextRequest) {
  const user = await getCrmUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const sb = makeAdminSb();

  const { data: existing } = await sb
    .from("user_calendar_types")
    .select(SELECT)
    .eq("owner_user_id", user.userId)
    .order("sort_order");

  if (existing && existing.length > 0) return NextResponse.json(existing);

  // First time — seed from tenant memberships
  await seedFromTenants(sb, user.userId);

  const { data: seeded } = await sb
    .from("user_calendar_types")
    .select(SELECT)
    .eq("owner_user_id", user.userId)
    .order("sort_order");

  return NextResponse.json(seeded ?? []);
}

// POST — create a new calendar type
export async function POST(req: NextRequest) {
  const user = await getCrmUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  if (!body?.name?.trim()) return NextResponse.json({ error: "name required" }, { status: 400 });

  const sb = makeAdminSb();

  const { data: maxOrder } = await sb
    .from("user_calendar_types")
    .select("sort_order")
    .eq("owner_user_id", user.userId)
    .order("sort_order", { ascending: false })
    .limit(1)
    .single();

  const { data, error } = await sb
    .from("user_calendar_types")
    .insert({
      owner_user_id: user.userId,
      name:          body.name.trim(),
      color:         body.color ?? "blue",
      cal_type:      body.cal_type ?? "custom",
      sources:       body.sources ?? [],
      sort_order:    ((maxOrder as any)?.sort_order ?? 0) + 1,
    })
    .select(SELECT)
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
