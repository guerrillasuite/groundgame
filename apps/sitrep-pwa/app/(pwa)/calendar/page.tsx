import { getCrmUser } from "@/lib/crm-auth";
import { getTenant, makeServiceSb } from "@/lib/tenant";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import CalendarLayout from "./CalendarLayout";

export const dynamic = "force-dynamic";

export default async function CalendarPage() {
  const user = await getCrmUser();
  if (!user) redirect("/login");

  const tenant = await getTenant(user.userId);
  if (!tenant) redirect("/login");

  const sb = makeServiceSb(tenant.id);

  const [itemsRes, typesRes] = await Promise.all([
    sb
      .from("sitrep_items")
      .select("id, item_type, title, status, priority, due_date, start_at, end_at, is_all_day, visibility, created_by, sitrep_assignments(user_id, role)")
      .eq("tenant_id", tenant.id)
      .order("start_at", { ascending: true, nullsFirst: false })
      .order("due_date",  { ascending: true, nullsFirst: false })
      .limit(1000),
    sb
      .from("sitrep_item_types")
      .select("id, name, slug, color, sort_order")
      .eq("tenant_id", tenant.id)
      .order("sort_order"),
  ]);

  // Visibility filter
  const allItems = ((itemsRes.data ?? []) as any[]).filter((item) => {
    if (item.visibility === "private") return item.created_by === user.userId;
    if (item.visibility === "assignee_only") {
      return item.created_by === user.userId ||
        item.sitrep_assignments?.some((a: any) => a.user_id === user.userId);
    }
    return true;
  });

  return (
    <Suspense>
      <CalendarLayout
        initialItems={allItems}
        types={typesRes.data ?? []}
        userId={user.userId}
        tenantId={tenant.id}
      />
    </Suspense>
  );
}
