import { createClient } from "@supabase/supabase-js";
import { getCrmUser } from "@/lib/crm-auth";
import { redirect } from "next/navigation";
import ItemDetailMobile from "./ItemDetailMobile";

export const dynamic = "force-dynamic";

// Unscoped service-role client — matches how the GET /api/sitrep/items list route
// fetches items across all tenants. No tenant_id filter so work-calendar items
// and sub-tasks owned by other tenants are always reachable.
function makeAdminSb() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}

export default async function ItemDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const user = await getCrmUser();
  if (!user) redirect("/login");

  const sb = makeAdminSb();

  // Fetch by ID only — no tenant filter, so work-calendar / mission sub-task items load
  const { data: item, error } = await sb
    .from("sitrep_items")
    .select("*")
    .eq("id", id)
    .single();

  if (error || !item) redirect("/list");

  const i = item as any;

  // Access check: must be creator or assignee (mirrors the GET list route)
  // Private items additionally require the user to be the creator.
  const isCreator = i.created_by === user.userId;

  // Fetch relations — each wrapped so a missing table returns [] silently
  const [assignmentsRes, commentsRes, activityRes, childrenRes] = await Promise.allSettled([
    sb.from("sitrep_assignments").select("user_id, role").eq("item_id", id),
    sb.from("sitrep_comments").select("id, body, author_id, created_at").eq("item_id", id).order("created_at"),
    sb.from("sitrep_activity").select("id, event_type, old_value, new_value, actor_id, created_at").eq("item_id", id).order("created_at"),
    sb.from("sitrep_items").select("id, title, item_type, status, due_date, start_at, priority")
      .eq("parent_item_id", id).order("due_date", { ascending: true, nullsFirst: false }),
  ]);

  const rawAssignments = assignmentsRes.status === "fulfilled" ? (assignmentsRes.value.data ?? []) : [];
  const rawComments    = commentsRes.status    === "fulfilled" ? (commentsRes.value.data    ?? []) : [];
  const rawActivity    = activityRes.status    === "fulfilled" ? (activityRes.value.data    ?? []) : [];
  const children       = childrenRes.status    === "fulfilled" ? (childrenRes.value.data    ?? []) : [];

  const isAssigned = rawAssignments.some((a: any) => a.user_id === user.userId);
  if (!isCreator && !isAssigned) redirect("/list");
  if (i.visibility === "private" && !isCreator) redirect("/list");

  // Item types — scoped to the item's own tenant
  const tenantId = i.tenant_id as string | undefined;
  const { data: typesData } = tenantId
    ? await sb.from("sitrep_item_types").select("id, name, slug, color, sort_order")
        .eq("tenant_id", tenantId).order("sort_order")
    : { data: [] };
  const types = typesData ?? [];

  // Custom field definitions for this item's type
  const itemTypeRecord = types.find((t: any) => t.slug === i.item_type);
  const sitrepTypeId = (itemTypeRecord as any)?.id ?? null;
  const { data: cfDefsData } = (tenantId && sitrepTypeId)
    ? await sb.from("custom_field_definitions")
        .select("field_key, label, field_type, options, sort_order")
        .eq("tenant_id", tenantId)
        .eq("record_type", "sitrep_items")
        .eq("sitrep_type_id", sitrepTypeId)
        .eq("is_archived", false)
        .order("sort_order", { ascending: true })
    : { data: [] };
  const customFieldDefs = cfDefsData ?? [];

  return (
    <ItemDetailMobile
      item={{ ...i, sitrep_assignments: rawAssignments, sitrep_comments: rawComments, sitrep_activity: rawActivity }}
      children={children}
      types={types}
      userId={user.userId}
      tenantId={i.tenant_id ?? ""}
      customFieldDefs={customFieldDefs}
    />
  );
}
