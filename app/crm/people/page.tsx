import { createClient } from "@supabase/supabase-js";
import { getTenant } from "@/lib/tenant";
import SearchListPage from "@/app/components/crm/SearchListPage";
import CreatePersonWizard from "@/app/crm/_shared/CreatePersonWizard";
import { createPersonAction } from "@/app/crm/_shared/mutations";

function makeSb(tenantId: string) {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { global: { headers: { "X-Tenant-Id": tenantId } } }
  );
}

async function boundCreateAction(fd: FormData) {
  "use server";
  return createPersonAction("/crm/people", fd);
}

export default async function PeoplePage() {
  const tenant = await getTenant();
  const sb = makeSb(tenant.id);

  const { data: ctData } = await sb
    .from("tenant_contact_types")
    .select("key, label")
    .eq("tenant_id", tenant.id)
    .order("order_index");

  const contactTypeOptions = Array.isArray(ctData) && ctData.length > 0
    ? (ctData as { key: string; label: string }[]).map((ct) => ct.key)
    : undefined;

  return (
    <SearchListPage
      title="People"
      searchEndpoint="/api/crm/people/search"
      searchPlaceholder="Search by name, email, phone…"
      columns={[
        { key: "name",         label: "Name",         width: 200 },
        { key: "email",        label: "Email",        width: 220 },
        { key: "phone",        label: "Phone",        width: 140 },
        { key: "contact_type", label: "Contact Type", width: 130 },
      ]}
      target="people"
      rowHrefPrefix="/crm/people/"
      headerActions={<CreatePersonWizard action={boundCreateAction} />}
      contactTypeOptions={contactTypeOptions}
    />
  );
}
