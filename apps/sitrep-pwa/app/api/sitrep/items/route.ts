import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
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
  if (!body?.title?.trim() || !body?.item_type) {
    return NextResponse.json({ error: "title and item_type required" }, { status: 400 });
  }

  const tenantId = body.tenantId || null;
  // Always use admin client — service role bypasses RLS so INSERT succeeds and
  // the separate read-back works without needing RETURNING from PostgREST.
  const sb = makeAdminSb();

  // Supply our own UUID so we never have to rely on INSERT RETURNING.
  // PostgREST's RETURNING + nested selects can silently return null even when the
  // insert succeeds, which caused false 500s.
  const itemId = randomUUID();

  const { error: insertError } = await sb
    .from("sitrep_items")
    .insert({
      id:          itemId,
      tenant_id:   tenantId,
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
    });

  if (insertError) {
    return NextResponse.json({ error: insertError.message }, { status: 500 });
  }

  // Insert assignments + activity in parallel, now that we have the ID
  const role = body.item_type === "meeting" ? "organizer" : "assignee";
  const assigneeIds: string[] = Array.isArray(body.assignees) && body.assignees.length > 0
    ? body.assignees
    : [user.userId];

  await Promise.all([
    sb.from("sitrep_assignments").insert(
      assigneeIds.map((uid: string) => ({ item_id: itemId, user_id: uid, role }))
    ).catch(() => {}),
    tenantId
      ? sb.from("sitrep_activity").insert({
          tenant_id: tenantId, item_id: itemId,
          actor_id: user.userId, event_type: "created", new_value: body.title.trim(),
        }).catch(() => {})
      : Promise.resolve(),
  ]);

  // Fetch the full item (including assignments that now exist) as a separate query
  const { data: item } = await sb
    .from("sitrep_items")
    .select(SELECT)
    .eq("id", itemId)
    .single();

  return NextResponse.json(item ?? { id: itemId });
}
