import { requireDirectorPage } from "@/lib/crm-auth";
import { createClient } from "@supabase/supabase-js";
import { getTenant } from "@/lib/tenant";
import CustomFieldsPanel from "./CustomFieldsPanel";

export const dynamic = "force-dynamic";

function makeSb(tenantId: string) {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { global: { headers: { "X-Tenant-Id": tenantId } } }
  );
}

export default async function CustomFieldsPage() {
  await requireDirectorPage();
  const { id: tenantId } = await getTenant();
  const sb = makeSb(tenantId);

  // Fetch all non-archived definitions upfront so the client can tab-switch without refetching
  const { data: definitions } = await sb
    .from("custom_field_definitions")
    .select("*")
    .eq("tenant_id", tenantId)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });

  // Contact types for People tab section headers
  const { data: contactTypes } = await sb
    .from("tenant_contact_types")
    .select("key,label")
    .eq("tenant_id", tenantId)
    .order("order_index", { ascending: true });

  return (
    <CustomFieldsPanel
      initialDefinitions={definitions ?? []}
      contactTypes={(contactTypes ?? []).map((ct: any) => ({ key: ct.key, label: ct.label || ct.key }))}
    />
  );
}
