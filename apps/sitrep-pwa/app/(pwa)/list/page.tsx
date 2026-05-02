import { getCrmUser } from "@/lib/crm-auth";
import { getTenant, makeServiceSb } from "@/lib/tenant";
import { redirect } from "next/navigation";
import ListPanel from "./ListPanel";

export const dynamic = "force-dynamic";

export default async function ListPage() {
  const user = await getCrmUser();
  if (!user) redirect("/login");

  const tenant = await getTenant(user.userId);
  if (!tenant) redirect("/login");

  const sb = makeServiceSb(tenant.id);

  // Fetch item types
  const { data: types } = await sb
    .from("sitrep_item_types")
    .select("id, name, slug, color, sort_order")
    .eq("tenant_id", tenant.id)
    .order("sort_order");

  return (
    <ListPanel
      userId={user.userId}
      tenantId={tenant.id}
      initialTypes={types ?? []}
    />
  );
}
