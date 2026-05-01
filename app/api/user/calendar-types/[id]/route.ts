import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getCrmUser } from "@/lib/crm-auth";

export const dynamic = "force-dynamic";

const sb = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const crmUser = await getCrmUser();
  if (!crmUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Invalid body" }, { status: 400 });

  const update: Record<string, unknown> = {};
  for (const key of ["name", "color", "sources", "delegate_for", "sort_order"]) {
    if (key in body) update[key] = body[key];
  }

  const { data, error } = await sb()
    .from("user_calendar_types")
    .update(update)
    .eq("id", id)
    .eq("owner_user_id", crmUser.userId)
    .select("id, name, color, cal_type, sources, sort_order")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(data);
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const crmUser = await getCrmUser();
  if (!crmUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Don't allow deleting the last calendar type
  const { count } = await sb()
    .from("user_calendar_types")
    .select("id", { count: "exact", head: true })
    .eq("owner_user_id", crmUser.userId);
  if ((count ?? 0) <= 1) {
    return NextResponse.json({ error: "Cannot delete your last calendar" }, { status: 400 });
  }

  const { error } = await sb()
    .from("user_calendar_types")
    .delete()
    .eq("id", id)
    .eq("owner_user_id", crmUser.userId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return new NextResponse(null, { status: 204 });
}
