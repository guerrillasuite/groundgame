import { createClient } from "@supabase/supabase-js";
import { getTenant } from "@/lib/tenant";
import { getCrmUser } from "@/lib/crm-auth";
import SearchListPage from "@/app/components/crm/SearchListPage";
import GeocodeButton from "./GeocodeButton";
import CreateLocationButton from "./CreateLocationButton";
import Link from "next/link";

function makeSb(tenantId: string) {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { global: { headers: { "X-Tenant-Id": tenantId } } }
  );
}

const modeLabel: Record<string, string> = { call: "Call", knock: "Walk", door: "Walk" };

export default async function LocationsPage() {
  const [tenant, crmUser] = await Promise.all([getTenant(), getCrmUser()]);
  const sb = makeSb(tenant.id);

  const [{ data: rawLists }, { data: assignments }] = await Promise.all([
    sb.from("walklists").select("id, name, mode, walklist_items(count)").eq("tenant_id", tenant.id).order("name"),
    crmUser && !crmUser.isAdmin
      ? sb.from("walklist_assignments").select("walklist_id").eq("user_id", crmUser.userId).eq("tenant_id", tenant.id)
      : Promise.resolve({ data: null }),
  ]);

  const assignedIds = new Set((assignments ?? []).map((a: any) => a.walklist_id));
  const allLists = (rawLists ?? []).map((w: any) => ({ id: w.id, name: w.name, mode: w.mode, count: w.walklist_items?.[0]?.count ?? 0 }));
  const lists = crmUser?.isAdmin ? allLists : allLists.filter((w) => assignedIds.has(w.id));

  const defaultContent = lists.length > 0 ? (
    <div style={{ display: "grid", gap: 8 }}>
      <p style={{ margin: "0 0 4px", fontSize: 13, color: "var(--gg-text-dim, #6b7280)" }}>
        Your lists — or search above to find specific locations.
      </p>
      {lists.map((wl) => {
        const m = (wl.mode ?? "").toLowerCase();
        const isCall = m === "call";
        return (
          <Link key={wl.id} href={`/crm/lists/${wl.id}`} style={{
            display: "flex", alignItems: "center", justifyContent: "space-between",
            padding: "10px 14px", borderRadius: 8, textDecoration: "none", color: "inherit",
            border: "1px solid var(--gg-border, #e5e7eb)", background: "var(--gg-card, white)",
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
              <span style={{ fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{wl.name ?? "(Untitled)"}</span>
              <span style={{ fontSize: 11, fontWeight: 600, padding: "2px 7px", borderRadius: 10, flexShrink: 0,
                background: isCall ? "rgba(59,130,246,0.1)" : "rgba(34,197,94,0.1)",
                color: isCall ? "#1d4ed8" : "#166534",
              }}>
                {modeLabel[wl.mode ?? ""] ?? (wl.mode ?? "List")}
              </span>
            </div>
            <span style={{ fontSize: 13, opacity: 0.6, flexShrink: 0 }}>{(wl.count ?? 0).toLocaleString()} targets</span>
          </Link>
        );
      })}
    </div>
  ) : null;

  return (
    <SearchListPage
      title="Locations"
      searchEndpoint="/api/crm/locations/search"
      searchPlaceholder="Search by address, city, state, zip…"
      target="locations"
      columns={[{ key: "address", label: "Address", width: 520 }]}
      rowHrefPrefix="/crm/locations/"
      headerActions={
        <div style={{ display: "flex", gap: 8 }}>
          <CreateLocationButton />
          <GeocodeButton />
        </div>
      }
      defaultContent={defaultContent}
    />
  );
}
