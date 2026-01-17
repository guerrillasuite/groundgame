// app/crm/lists/page.tsx
import { getTenant } from "@/lib/tenant";
import PeopleSearch from "../_shared/PeopleSearch";
import { getServerSupabase } from "@/lib/supabase/server";


import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

// Read-only Supabase (prevents "Cookies can only be modified..." during render)
function getSupabaseReadOnly() {
  const store = cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { get: n => store.get(n)?.value, set() {}, remove() {} } }
  );
}

type Walklist = { id: string; name: string | null; mode: string | null };

export default async function ListsPage({
  searchParams,
}: {
  searchParams?: { q?: string };
}) {
  const sb = getSupabaseReadOnly();
  const tenant = await getTenant();
  const q = (searchParams?.q ?? "").trim();

  // Fetch lists (server-side filter on name/mode if q present)
  let query = sb
    .from("walklists")
    .select("id,name,mode")
    .eq("tenant_id", tenant.id)
    .order("name");

  if (q) {
    const like = `%${q}%`;
    query = query.or([`name.ilike.${like}`, `mode.ilike.${like}`].join(","));
  }

  const { data, error } = await query;
  if (error) throw new Error(error.message);

  const lists = (data ?? []) as Walklist[];

  // Group by normalized mode
  const normalizeMode = (m?: string | null) => {
    const s = (m ?? "").toLowerCase();
    if (s === "call" || s === "door") return s;
    return "other";
  };

  const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" });

  const groups: Record<"call" | "door" | "other", Walklist[]> = {
    call: [],
    door: [],
    other: [],
  };

  for (const wl of lists) groups[normalizeMode(wl.mode)].push(wl);

  // Sort each group by name naturally
  (Object.keys(groups) as Array<keyof typeof groups>).forEach((k) =>
    groups[k].sort((a, b) => collator.compare(a.name ?? "", b.name ?? "")),
  );

  const order: Array<keyof typeof groups> = ["call", "door", "other"];

  return (
    <section className="stack">
      <div className="row" style={{ justifyContent: "space-between", alignItems: "center", gap: 12 }}>
        <h1 style={{ margin: 0 }}>Lists</h1>
        <PeopleSearch placeholder="Search lists…" />
      </div>

      <div style={{ display: "grid", gap: 24 }}>
        {order
          .filter((k) => groups[k].length)
          .map((k) => (
            <div key={k}>
              <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 8 }}>
                {k === "call" ? "Call Lists" : k === "door" ? "Door Lists" : "Other Lists"}
              </h2>
              <ul style={{ display: "grid", gap: 8, listStyle: "none", padding: 0, margin: 0 }}>
                {groups[k].map((wl) => (
                  <li key={wl.id}>
                    <a
                      href={`/crm/lists/${wl.id}`}
                      style={{
                        display: "block",
                        padding: "10px 12px",
                        borderRadius: "var(--radius)",
                        boxShadow: "var(--shadow)",
                        background: "var(--brand-surface)",
                        textDecoration: "none",
                      }}
                    >
                      {wl.name ?? "(Untitled)"} —{" "}
                      <span style={{ opacity: 0.8 }}>
                        {k}
                      </span>
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ))}

        {!order.some((k) => groups[k].length) && (
          <p className="text-dim" style={{ margin: 0 }}>No lists yet.</p>
        )}
      </div>
    </section>
  );
}
