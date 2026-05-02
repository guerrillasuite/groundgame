import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getCrmUser } from "@/lib/crm-auth";

export const dynamic = "force-dynamic";

const sb = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export type SharedViewData = {
  share_id:     string;
  role:         "viewer" | "editor";
  view_id:      string;
  view_name:    string;
  view_color:   string | null;
  filter_config: Record<string, any>;
  type_id:      string;
  type_name:    string;
  type_color:   string;
  owner_user_id: string;
  owner_name:   string;
};

export async function GET() {
  const crmUser = await getCrmUser();
  if (!crmUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const db = sb();

  const { data: shares, error } = await db
    .from("calendar_view_shares")
    .select("id, role, view_id")
    .eq("shared_with_user_id", crmUser.userId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!shares || shares.length === 0) return NextResponse.json([]);

  const viewIds = (shares as any[]).map((s) => s.view_id);

  const [viewsRes, ] = await Promise.all([
    db.from("user_calendar_views")
      .select("id, name, color, filter_config, calendar_type_id")
      .in("id", viewIds),
  ]);

  const views = viewsRes.data ?? [];
  const typeIds = [...new Set(views.map((v: any) => v.calendar_type_id))];

  const { data: calTypes } = await db
    .from("user_calendar_types")
    .select("id, name, color, owner_user_id")
    .in("id", typeIds);

  // Best-effort owner name lookup
  const ownerIds = [...new Set((calTypes ?? []).map((ct: any) => ct.owner_user_id))];
  const ownerMap: Record<string, string> = {};
  try {
    const res = await fetch(
      `${process.env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1/admin/users?per_page=200`,
      { headers: { Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY ?? ""}`, apikey: process.env.SUPABASE_SERVICE_ROLE_KEY ?? "" } }
    );
    if (res.ok) {
      const json = await res.json();
      for (const u of json.users ?? []) {
        if (ownerIds.includes(u.id)) {
          ownerMap[u.id] = u.user_metadata?.name ?? u.user_metadata?.full_name ?? u.email ?? u.id;
        }
      }
    }
  } catch { /* best-effort */ }

  const viewById  = new Map(views.map((v: any) => [v.id, v]));
  const typeById  = new Map((calTypes ?? []).map((ct: any) => [ct.id, ct]));

  const result: SharedViewData[] = (shares as any[]).map((s) => {
    const view    = viewById.get(s.view_id)            ?? {};
    const calType = typeById.get(view.calendar_type_id) ?? {};
    return {
      share_id:      s.id,
      role:          s.role,
      view_id:       s.view_id,
      view_name:     view.name      ?? "Unknown",
      view_color:    view.color     ?? null,
      filter_config: view.filter_config ?? {},
      type_id:       calType.id    ?? "",
      type_name:     calType.name  ?? "Unknown",
      type_color:    calType.color ?? "blue",
      owner_user_id: calType.owner_user_id ?? "",
      owner_name:    ownerMap[calType.owner_user_id] ?? "Someone",
    };
  });

  return NextResponse.json(result);
}
