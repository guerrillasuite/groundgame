import { NextRequest, NextResponse } from "next/server";
import { getCrmUser, requireSuperAdminApi } from "@/lib/crm-auth";
import { makeAdminSb } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

// GET — public to any authenticated user (used by GroundGame seed fallback)
export async function GET() {
  const user = await getCrmUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const sb = makeAdminSb();
  const { data, error } = await sb
    .from("sitrep_global_type_templates")
    .select("*")
    .order("sort_order")
    .order("created_at");

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? []);
}

// POST — SuperAdmin only
export async function POST(req: NextRequest) {
  const denied = await requireSuperAdminApi();
  if (denied) return denied;

  const body = await req.json().catch(() => null);
  if (!body?.name?.trim()) return NextResponse.json({ error: "name required" }, { status: 400 });

  const slug = body.name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

  const sb = makeAdminSb();

  // Soft cap at 8 templates
  const { count } = await sb
    .from("sitrep_global_type_templates")
    .select("id", { count: "exact", head: true });
  if ((count ?? 0) >= 8) {
    return NextResponse.json({ error: "Maximum of 8 global templates. Deactivate one first.", warn: true }, { status: 422 });
  }

  const { data, error } = await sb
    .from("sitrep_global_type_templates")
    .insert({
      name:             body.name.trim(),
      slug,
      color:            body.color ?? "blue",
      icon:             body.icon ?? null,
      is_mission_type:  body.is_mission_type ?? false,
      show_in_kanban:   body.show_in_kanban ?? true,
      booking_enabled:  body.booking_enabled ?? false,
      stages:           body.stages ?? [],
      sort_order:       body.sort_order ?? 100,
      is_active:        true,
    })
    .select("*")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data, { status: 201 });
}
