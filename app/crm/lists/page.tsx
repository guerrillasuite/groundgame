// app/crm/lists/page.tsx
import Link from "next/link";
import { Plus } from "lucide-react";
import { getTenant } from "@/lib/tenant";
import { createClient } from "@supabase/supabase-js";
import DeleteListButton from "@/app/components/lists/DeleteListButton";
import { getCrmUser } from "@/lib/crm-auth";

function makeSb(tenantId: string) {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { global: { headers: { "X-Tenant-Id": tenantId } } }
  );
}

type Walklist = {
  id: string;
  name: string | null;
  mode: string | null;
  total_targets?: number | null;
  visited_count?: number | null;
};

const normalizeMode = (m?: string | null): "call" | "door" | "other" => {
  const s = (m ?? "").toLowerCase();
  if (s === "call") return "call";
  if (s === "door" || s === "knock") return "door";
  return "other";
};

const modeLabel: Record<string, string> = {
  call: "Call",
  knock: "Walk",
  door: "Walk",
};

export default async function ListsPage() {
  const [tenant, crmUser] = await Promise.all([getTenant(), getCrmUser()]);
  const sb = makeSb(tenant.id);

  // Fetch walklists + (for non-admins) their assignments in parallel
  const [{ data: rawLists, error: listErr }, { data: assignments }] = await Promise.all([
    sb
      .from("walklists")
      .select("id, name, mode, walklist_items(count)")
      .eq("tenant_id", tenant.id)
      .order("name"),
    crmUser && !crmUser.isAdmin
      ? sb
          .from("walklist_assignments")
          .select("walklist_id")
          .eq("user_id", crmUser.userId)
          .eq("tenant_id", tenant.id)
      : Promise.resolve({ data: null }),
  ]);

  if (listErr) throw new Error(listErr.message);

  const assignedIds = new Set((assignments ?? []).map((a: any) => a.walklist_id));

  const allWalklists: Walklist[] = (rawLists ?? []).map((w: any) => ({
    ...w,
    total_targets: w.walklist_items?.[0]?.count ?? 0,
  }));

  // Field users only see their assigned lists
  const walklists = crmUser?.isAdmin ? allWalklists : allWalklists.filter(wl => assignedIds.has(wl.id));

  const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" });

  const groups: Record<"call" | "door" | "other", Walklist[]> = {
    call: [],
    door: [],
    other: [],
  };
  for (const wl of walklists) groups[normalizeMode(wl.mode)].push(wl);
  (Object.keys(groups) as Array<keyof typeof groups>).forEach((k) =>
    groups[k].sort((a, b) => collator.compare(a.name ?? "", b.name ?? ""))
  );

  const order: Array<keyof typeof groups> = ["call", "door", "other"];

  return (
    <section className="stack">
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
        <div>
          <h1 style={{ margin: 0 }}>Lists</h1>
          <p className="text-dim" style={{ marginTop: 6 }}>
            Manage call and walk lists for your campaigns
          </p>
        </div>
        {crmUser?.isAdmin && (
          <Link
            href="/crm/lists/new"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              padding: "10px 18px",
              background: "var(--gg-primary, #2563eb)",
              color: "white",
              borderRadius: 8,
              fontWeight: 600,
              textDecoration: "none",
              whiteSpace: "nowrap",
            }}
          >
            <Plus size={16} />
            Create List
          </Link>
        )}
      </div>

      <div style={{ display: "grid", gap: 24 }}>
        {order
          .filter((k) => groups[k].length)
          .map((k) => (
            <div key={k}>
              <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 8 }}>
                {k === "call" ? "Call Lists" : k === "door" ? "Walk Lists" : "Other Lists"}
              </h2>
              <div style={{ display: "grid", gap: 8 }}>
                {groups[k].map((wl) => (
                  <div
                    key={wl.id}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      borderRadius: "var(--radius, 8px)",
                      boxShadow: "var(--shadow)",
                      background: "var(--gg-card, white)",
                      border: "1px solid var(--gg-border, #e5e7eb)",
                      gap: 12,
                      overflow: "hidden",
                    }}
                  >
                    <a
                      href={`/crm/lists/${wl.id}`}
                      style={{
                        flex: 1,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        padding: "12px 16px",
                        textDecoration: "none",
                        gap: 12,
                        minWidth: 0,
                      }}
                    >
                      <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
                        <span style={{ fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{wl.name ?? "(Untitled)"}</span>
                        <span
                          style={{
                            fontSize: 11,
                            fontWeight: 600,
                            padding: "2px 8px",
                            borderRadius: 10,
                            background: k === "call" ? "rgba(59,130,246,0.1)" : "rgba(34,197,94,0.1)",
                            color: k === "call" ? "#1d4ed8" : "#166534",
                            flexShrink: 0,
                          }}
                        >
                          {modeLabel[wl.mode ?? ""] ?? (wl.mode ?? k)}
                        </span>
                      </div>
                      <span style={{ fontSize: 13, opacity: 0.6, flexShrink: 0 }}>
                        {(wl.total_targets ?? 0).toLocaleString()} targets
                      </span>
                    </a>
                    {crmUser?.isAdmin && (
                      <div style={{ paddingRight: 12, flexShrink: 0 }}>
                        <DeleteListButton id={wl.id} name={wl.name ?? "(Untitled)"} />
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}

        {!order.some((k) => groups[k].length) && (
          <div
            style={{
              background: "var(--gg-card, white)",
              borderRadius: 12,
              padding: 48,
              textAlign: "center",
              border: "1px solid var(--gg-border, #e5e7eb)",
            }}
          >
            <h3 style={{ fontSize: 18, fontWeight: 600, marginBottom: 8 }}>No Lists Yet</h3>
            <p style={{ opacity: 0.7, marginBottom: 20 }}>
              {crmUser?.isAdmin
                ? "Create your first call or walk list to get started"
                : "You haven't been assigned to any lists yet"}
            </p>
            {crmUser?.isAdmin && (
              <Link
                href="/crm/lists/new"
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                  padding: "10px 20px",
                  background: "var(--gg-primary, #2563eb)",
                  color: "white",
                  borderRadius: 8,
                  fontWeight: 600,
                  textDecoration: "none",
                }}
              >
                <Plus size={16} />
                Create First List
              </Link>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
