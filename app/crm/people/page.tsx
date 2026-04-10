import { createClient } from "@supabase/supabase-js";
import { getTenant } from "@/lib/tenant";
import SearchListPage from "@/app/components/crm/SearchListPage";
import CreatePersonWizard from "@/app/crm/_shared/CreatePersonWizard";
import { createPersonAction } from "@/app/crm/_shared/mutations";
import Link from "next/link";

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

const modeLabel: Record<string, string> = { call: "Call", knock: "Walk", door: "Walk" };

export default async function PeoplePage() {
  const tenant = await getTenant();
  const sb = makeSb(tenant.id);

  const [{ data: ctData }, { data: rawLists }] = await Promise.all([
    sb.from("tenant_contact_types").select("key, label").eq("tenant_id", tenant.id).order("order_index"),
    sb.from("walklists").select("id, name, mode, walklist_items(count)").eq("tenant_id", tenant.id).order("name"),
  ]);

  const contactTypeOptions = Array.isArray(ctData) && ctData.length > 0
    ? (ctData as { key: string; label: string }[]).map((ct) => ct.key)
    : undefined;

  const lists = (rawLists ?? []).map((w: any) => ({
    id: w.id,
    name: w.name,
    mode: w.mode,
    count: w.walklist_items?.[0]?.count ?? 0,
  }));

  const defaultContent = lists.length > 0 ? (
    <div style={{ display: "grid", gap: 8 }}>
      <p style={{ margin: "0 0 4px", fontSize: 13, color: "var(--gg-text-dim, #6b7280)" }}>
        Your lists — or search above to find specific people.
      </p>
      {lists.map((wl) => {
        const m = (wl.mode ?? "").toLowerCase();
        const isCall = m === "call";
        return (
          <Link key={wl.id} href={`/crm/lists/${wl.id}?from=people`} style={{
            display: "flex", alignItems: "center", justifyContent: "space-between",
            padding: "10px 14px", borderRadius: 8, textDecoration: "none", color: "inherit",
            border: "1px solid var(--gg-border, #e5e7eb)", background: "var(--gg-card, white)",
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
              <span style={{ fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {wl.name ?? "(Untitled)"}
              </span>
              <span style={{
                fontSize: 11, fontWeight: 600, padding: "2px 7px", borderRadius: 10, flexShrink: 0,
                background: isCall ? "rgba(59,130,246,0.1)" : "rgba(34,197,94,0.1)",
                color: isCall ? "#1d4ed8" : "#166534",
              }}>
                {modeLabel[wl.mode ?? ""] ?? (wl.mode ?? "List")}
              </span>
            </div>
            <span style={{ fontSize: 13, opacity: 0.6, flexShrink: 0 }}>
              {(wl.count ?? 0).toLocaleString()} targets
            </span>
          </Link>
        );
      })}
    </div>
  ) : null;

  return (
    <SearchListPage
      title="People"
      searchEndpoint="/api/crm/people/search"
      searchPlaceholder="Search by name, email, phone…"
      columns={[
        { key: "name",  label: "Name",  width: 200 },
        { key: "email", label: "Email", width: 220 },
        { key: "phone", label: "Phone", width: 140 },
      ]}
      target="people"
      rowHrefPrefix="/crm/people/"
      headerActions={<CreatePersonWizard action={boundCreateAction} />}
      contactTypeOptions={contactTypeOptions}
      defaultContent={defaultContent}
    />
  );
}
