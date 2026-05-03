import { getCrmUser } from "@/lib/crm-auth";
import { getTenant, makeServiceSb } from "@/lib/tenant";
import { redirect } from "next/navigation";
import ItemDetailMobile from "./ItemDetailMobile";

export const dynamic = "force-dynamic";

export default async function ItemDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const user = await getCrmUser();
  if (!user) redirect("/login");

  const tenant = await getTenant(user.userId);
  if (!tenant) redirect("/login");

  const sb = makeServiceSb(tenant.id);

  // Use select("*") so the page never breaks from schema additions/removals.
  // Related tables are fetched separately with independent error handling.
  const { data: item, error } = await sb
    .from("sitrep_items")
    .select("*")
    .eq("id", id)
    .eq("tenant_id", tenant.id)
    .single();

  if (error || !item) redirect("/list");

  // Fetch relations separately — each is silently ignored if the table doesn't exist yet
  const [assignmentsRes, commentsRes, activityRes] = await Promise.allSettled([
    sb.from("sitrep_assignments").select("user_id, role").eq("item_id", id),
    sb.from("sitrep_comments").select("id, body, author_id, created_at").eq("item_id", id).order("created_at"),
    sb.from("sitrep_activity").select("id, event_type, old_value, new_value, actor_id, created_at").eq("item_id", id).order("created_at"),
  ]);

  const rawAssignments = assignmentsRes.status === "fulfilled" ? (assignmentsRes.value.data ?? []) : [];
  const rawComments    = commentsRes.status    === "fulfilled" ? (commentsRes.value.data    ?? []) : [];
  const rawActivity    = activityRes.status    === "fulfilled" ? (activityRes.value.data    ?? []) : [];

  const i = item as any;
  if (i.visibility === "private" && i.created_by !== user.userId) redirect("/list");

  // Child items and types — also wrapped defensively
  const [childrenRes, typesRes] = await Promise.allSettled([
    sb.from("sitrep_items")
      .select("id, title, item_type, status, due_date, start_at, priority")
      .eq("parent_item_id", id)
      .eq("tenant_id", tenant.id)
      .order("due_date", { ascending: true, nullsFirst: false }),
    sb.from("sitrep_item_types")
      .select("id, name, slug, color, sort_order")
      .eq("tenant_id", tenant.id)
      .order("sort_order"),
  ]);

  const children = childrenRes.status === "fulfilled" ? (childrenRes.value.data ?? []) : [];
  const types    = typesRes.status    === "fulfilled" ? (typesRes.value.data    ?? []) : [];

  return (
    <ItemDetailMobile
      item={{ ...i, sitrep_assignments: rawAssignments, sitrep_comments: rawComments, sitrep_activity: rawActivity }}
      children={children}
      types={types}
      userId={user.userId}
      tenantId={tenant.id}
    />
  );
}
