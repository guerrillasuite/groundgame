import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getCrmUser } from "@/lib/crm-auth";
import { makeServiceSb } from "@/lib/tenant";

export const dynamic = "force-dynamic";

const SELECT = `
  id, tenant_id, squad_id, item_type, title, description, location, status, priority,
  due_date, start_at, end_at, is_all_day,
  mission_id, parent_item_id, depth,
  visibility, created_by, created_at,
  sitrep_assignments(user_id, role)
`;

// Service role, no tenant header — bypasses ALL RLS, queries across every tenant
function makeAdminSb() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}

// PostgREST has a URL-length limit on large .in() arrays — chunk to stay safe
async function fetchItemsByIds(sb: ReturnType<typeof makeAdminSb>, ids: string[]): Promise<any[]> {
  const CHUNK = 150;
  const chunks: string[][] = [];
  for (let i = 0; i < ids.length; i += CHUNK) chunks.push(ids.slice(i, i + CHUNK));

  const results = await Promise.all(
    chunks.map((chunk) =>
      sb.from("sitrep_items").select(SELECT).in("id", chunk).limit(CHUNK)
    )
  );
  return results.flatMap((r) => r.data ?? []);
}

// GET /api/sitrep/items
// Returns every item this user can see: assigned, created, or in a squad they belong to.
export async function GET(_req: NextRequest) {
  const user = await getCrmUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const sb = makeAdminSb();

  // Fetch assignments + squad memberships in parallel
  const [assignRes, squadRes] = await Promise.all([
    sb.from("sitrep_assignments").select("item_id").eq("user_id", user.userId),
    sb.from("squad_members").select("squad_id").eq("user_id", user.userId),
  ]);

  if (assignRes.error) return NextResponse.json({ error: assignRes.error.message }, { status: 500 });

  const assignedIds = [...new Set((assignRes.data ?? []).map((a: any) => a.item_id as string))];
  const squadIds    = (squadRes.data ?? []).map((m: any) => m.squad_id as string);

  // Parallel: assigned items + created by user + squad items (non-private)
  const [assignedItems, createdRes, ...squadResults] = await Promise.all([
    assignedIds.length > 0
      ? fetchItemsByIds(sb, assignedIds)
      : Promise.resolve([] as any[]),
    sb.from("sitrep_items").select(SELECT).eq("created_by", user.userId).limit(500),
    ...squadIds.map((squadId) =>
      sb.from("sitrep_items")
        .select(SELECT)
        .eq("squad_id", squadId)
        .neq("visibility", "private")
        .limit(500)
        .then((r) => r.data ?? [])
    ),
  ]);

  // Merge and dedup
  const seen = new Set<string>();
  const items: any[] = [];
  for (const item of [...assignedItems, ...(createdRes.data ?? []), ...squadResults.flat()]) {
    if (!seen.has(item.id)) {
      seen.add(item.id);
      items.push(item);
    }
  }

  // Sort by effective date, nulls last
  items.sort((a, b) => {
    const da = a.due_date ?? a.start_at;
    const db = b.due_date ?? b.start_at;
    if (!da && !db) return 0;
    if (!da) return 1;
    if (!db) return -1;
    return da.localeCompare(db);
  });

  return NextResponse.json(items);
}

// POST /api/sitrep/items — creates in the specified tenant
export async function POST(req: NextRequest) {
  const user = await getCrmUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  if (!body?.title?.trim() || !body?.item_type || !body?.tenantId) {
    return NextResponse.json({ error: "title, item_type, tenantId required" }, { status: 400 });
  }

  const sb = makeServiceSb(body.tenantId);

  const { data: item, error } = await sb
    .from("sitrep_items")
    .insert({
      tenant_id:   body.tenantId,
      squad_id:    body.squad_id ?? null,
      item_type:   body.item_type,
      title:       body.title.trim(),
      status:      "open",
      priority:    body.item_type === "task" ? (body.priority ?? "normal") : null,
      due_date:    body.item_type === "task" ? (body.due_date ?? null) : null,
      start_at:    body.item_type !== "task" ? (body.due_date ?? null) : null,
      location:    body.location ?? null,
      visibility:  body.visibility ?? "team",
      created_by:  user.userId,
      depth:       0,
    })
    .select(SELECT)
    .single();

  if (error || !item) return NextResponse.json({ error: error?.message ?? "Failed" }, { status: 500 });

  await sb.from("sitrep_assignments").insert({
    item_id: (item as any).id,
    user_id: user.userId,
    role:    body.item_type === "meeting" ? "organizer" : "assignee",
  }).catch(() => {});

  await sb.from("sitrep_activity").insert({
    tenant_id: body.tenantId, item_id: (item as any).id,
    actor_id: user.userId, event_type: "created", new_value: body.title.trim(),
  }).catch(() => {});

  return NextResponse.json(item);
}
