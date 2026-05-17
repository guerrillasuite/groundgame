import { createClient } from "@supabase/supabase-js";
import { getCrmUser } from "@/lib/crm-auth";
import { redirect } from "next/navigation";
import ItemDetailMobile from "./ItemDetailMobile";

export const dynamic = "force-dynamic";

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

  const { data: item, error } = await sb
    .from("sitrep_items")
    .select("*")
    .eq("id", id)
    .single();

  if (error || !item) {
    return (
      <ItemDetailMobile
        item={null}
        error="This item could not be found. It may have been deleted."
        children={[]}
        types={[]}
        userId={user.userId}
        tenantId=""
        customFieldDefs={[]}
      />
    );
  }

  const i = item as any;
  const isCreator = i.created_by === user.userId;

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

  if (i.visibility === "private" && !isCreator) {
    return (
      <ItemDetailMobile
        item={null}
        error="This is a private item."
        children={[]}
        types={[]}
        userId={user.userId}
        tenantId=""
        customFieldDefs={[]}
      />
    );
  }

  const tenantId = i.tenant_id as string | undefined;
  const { data: typesData } = tenantId
    ? await sb.from("sitrep_item_types").select("id, name, slug, color, sort_order")
        .eq("tenant_id", tenantId).order("sort_order")
    : { data: [] };
  const types = typesData ?? [];

  const itemTypeRecord = types.find((t: any) => t.slug === i.item_type);
  const sitrepTypeId = (itemTypeRecord as any)?.id ?? null;
  const [cfDefsRes, overridesRes] = await Promise.allSettled([
    tenantId
      ? (() => {
          let q = sb.from("custom_field_definitions")
            .select("field_key, label, field_type, options, sort_order, display_scope")
            .eq("tenant_id", tenantId)
            .eq("record_type", "sitrep_items")
            .eq("is_archived", false)
            .order("sort_order", { ascending: true });
          if (sitrepTypeId) q = q.eq("sitrep_type_id", sitrepTypeId);
          return q;
        })()
      : Promise.resolve({ data: [] }),
    tenantId
      ? sb.from("standard_field_overrides")
          .select("field_key, custom_label, hidden, display_scope, sort_order")
          .eq("tenant_id", tenantId)
          .eq("record_type", "sitrep_items")
      : Promise.resolve({ data: [] }),
  ]);

  const customFieldDefs = (cfDefsRes.status === "fulfilled" ? (cfDefsRes.value as any).data : null) ?? [];
  const rawOverrides    = (overridesRes.status === "fulfilled" ? (overridesRes.value as any).data : null) ?? [];
  const fieldOverrides: Record<string, { label?: string; hidden: boolean; display_scope: string; sort_order?: number }> = {};
  for (const row of rawOverrides as any[]) {
    fieldOverrides[row.field_key] = {
      label:         row.custom_label ?? undefined,
      hidden:        row.hidden === true,
      display_scope: row.display_scope ?? "snapshot",
      sort_order:    row.sort_order ?? undefined,
    };
  }

  return (
    <ItemDetailMobile
      item={{ ...i, sitrep_assignments: rawAssignments, sitrep_comments: rawComments, sitrep_activity: rawActivity }}
      children={children}
      types={types}
      userId={user.userId}
      tenantId={i.tenant_id ?? ""}
      customFieldDefs={customFieldDefs}
      fieldOverrides={fieldOverrides}
    />
  );
}
