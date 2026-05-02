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

  const { data: item, error } = await sb
    .from("sitrep_items")
    .select(`
      id, item_type, title, description, location, status, priority,
      due_date, start_at, end_at, is_all_day, agenda, meeting_notes,
      mission_id, parent_item_id, depth,
      visibility, created_by, created_at, updated_at,
      sitrep_assignments(user_id, role),
      sitrep_comments(id, body, author_id, created_at),
      sitrep_activity(id, event_type, old_value, new_value, actor_id, created_at)
    `)
    .eq("id", id)
    .eq("tenant_id", tenant.id)
    .single();

  if (error || !item) redirect("/list");

  const i = item as any;
  if (i.visibility === "private" && i.created_by !== user.userId) redirect("/list");

  // Child items
  const { data: children } = await sb
    .from("sitrep_items")
    .select("id, title, item_type, status, due_date, start_at, priority")
    .eq("parent_item_id", id)
    .eq("tenant_id", tenant.id)
    .order("due_date", { ascending: true, nullsFirst: false });

  // Types for color
  const { data: types } = await sb
    .from("sitrep_item_types")
    .select("id, name, slug, color, sort_order")
    .eq("tenant_id", tenant.id)
    .order("sort_order");

  return (
    <ItemDetailMobile
      item={i}
      children={children ?? []}
      types={types ?? []}
      userId={user.userId}
      tenantId={tenant.id}
    />
  );
}
