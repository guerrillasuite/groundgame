import { createClient } from "@supabase/supabase-js";
import { getTenant } from "@/lib/tenant";
import Link from "next/link";

export const metadata = { title: "Quiz Results — GroundGame CRM" };

function makeSb(tenantId: string) {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { global: { headers: { "X-Tenant-Id": tenantId } } }
  );
}

function formatDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-US", {
    timeZone: "America/Chicago",
    month: "short", day: "numeric", year: "numeric",
    hour: "2-digit", minute: "2-digit", hour12: true,
  });
}

const RESULT_COLORS: Record<string, string> = {
  libertarian: "#eab308",
  liberal: "#3b82f6",
  conservative: "#ef4444",
  authoritarian: "#6b7280",
  centrist: "#8b5cf6",
};

export default async function QuizAdminPage() {
  const tenant = await getTenant();
  const sb = makeSb(tenant.id);

  const { data: stops } = await sb
    .from("stops")
    .select("id, stop_at, result, notes, person_id")
    .eq("tenant_id", tenant.id)
    .eq("channel", "quiz")
    .order("stop_at", { ascending: false })
    .limit(200);

  const rows = stops ?? [];

  // Batch-fetch person names + emails
  const personIds = [...new Set(rows.map((s: any) => s.person_id).filter(Boolean))];
  const { data: people } = personIds.length
    ? await sb.from("people").select("id, first_name, last_name, email").in("id", personIds)
    : { data: [] };

  const personMap = new Map(
    (people ?? []).map((p: any) => [
      p.id,
      { name: [p.first_name, p.last_name].filter(Boolean).join(" ") || "—", email: p.email ?? "" },
    ])
  );

  // Aggregate result counts
  const counts: Record<string, number> = {};
  for (const row of rows) {
    const r = (row as any).result ?? "unknown";
    counts[r] = (counts[r] ?? 0) + 1;
  }

  // Parse score from notes: "Personal: 80/100 · Economic: 60/100"
  function parseScore(notes: string | null): string {
    if (!notes) return "";
    const m = notes.match(/Personal:\s*(\d+)\/100\s*·\s*Economic:\s*(\d+)\/100/);
    return m ? `P:${m[1]} E:${m[2]}` : "";
  }

  const hasReview = rows.some((r: any) => r.notes?.includes("⚠ REVIEW"));

  return (
    <section className="stack">
      <div className="row" style={{ justifyContent: "space-between", alignItems: "center", gap: 12 }}>
        <div>
          <h1 style={{ margin: 0 }}>Political Quiz Results</h1>
          <p style={{ color: "var(--gg-muted)", fontSize: 13, margin: "4px 0 0" }}>
            {rows.length} submission{rows.length !== 1 ? "s" : ""}
          </p>
        </div>
        <a
          href="/quiz"
          target="_blank"
          rel="noopener noreferrer"
          style={{
            padding: "8px 16px", borderRadius: 8, fontSize: 13, fontWeight: 600,
            background: "var(--gg-primary, #2563eb)", color: "#fff", textDecoration: "none",
          }}
        >
          Open Quiz ↗
        </a>
      </div>

      {/* Result distribution */}
      {rows.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
          {Object.entries(counts).sort((a, b) => b[1] - a[1]).map(([res, count]) => (
            <div key={res} style={{
              padding: "6px 14px", borderRadius: 20, fontSize: 13, fontWeight: 600,
              background: `${RESULT_COLORS[res] ?? "#6b7280"}22`,
              color: RESULT_COLORS[res] ?? "#6b7280",
              border: `1px solid ${RESULT_COLORS[res] ?? "#6b7280"}44`,
            }}>
              {res.charAt(0).toUpperCase() + res.slice(1)}: {count}
            </div>
          ))}
        </div>
      )}

      {/* Review flag banner */}
      {hasReview && (
        <div style={{
          padding: "10px 16px", borderRadius: 8, fontSize: 13,
          background: "rgba(234,179,8,0.1)", border: "1px solid rgba(234,179,8,0.3)",
          color: "#ca8a04",
        }}>
          ⚠ Some submissions were flagged as possible duplicates.{" "}
          <Link href="/crm/dedupe" style={{ color: "#ca8a04", fontWeight: 700 }}>Review in Dedupe →</Link>
        </div>
      )}

      {rows.length === 0 ? (
        <p style={{ color: "var(--gg-muted)", fontSize: 14 }}>No quiz submissions yet. Share the quiz link to get started.</p>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: "1px solid var(--gg-border, #e5e7eb)" }}>
                {["When", "Name", "Email", "Result", "Score", ""].map((h) => (
                  <th key={h} style={{ padding: "8px 12px", textAlign: "left", color: "var(--gg-muted)", fontWeight: 600, whiteSpace: "nowrap" }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row: any) => {
                const person = personMap.get(row.person_id);
                const isReview = row.notes?.includes("⚠ REVIEW");
                const score = parseScore(row.notes);
                const resColor = RESULT_COLORS[row.result] ?? "#6b7280";
                return (
                  <tr
                    key={row.id}
                    style={{
                      borderBottom: "1px solid var(--gg-border, #e5e7eb)",
                      background: isReview ? "rgba(234,179,8,0.06)" : undefined,
                    }}
                  >
                    <td style={{ padding: "10px 12px", color: "var(--gg-muted)", whiteSpace: "nowrap" }}>
                      {formatDate(row.stop_at)}
                    </td>
                    <td style={{ padding: "10px 12px", fontWeight: 500 }}>
                      {row.person_id ? (
                        <Link href={`/crm/people/${row.person_id}`} style={{ color: "var(--gg-text, #111)" }}>
                          {person?.name ?? "—"}
                        </Link>
                      ) : "—"}
                      {isReview && (
                        <span title="Possible duplicate — check dedupe" style={{ marginLeft: 6, cursor: "help" }}>⚠️</span>
                      )}
                    </td>
                    <td style={{ padding: "10px 12px", color: "var(--gg-muted)" }}>
                      {person?.email || "—"}
                    </td>
                    <td style={{ padding: "10px 12px" }}>
                      <span style={{
                        padding: "2px 10px", borderRadius: 12, fontSize: 12, fontWeight: 700,
                        background: `${resColor}22`, color: resColor,
                      }}>
                        {row.result ? row.result.charAt(0).toUpperCase() + row.result.slice(1) : "—"}
                      </span>
                    </td>
                    <td style={{ padding: "10px 12px", color: "var(--gg-muted)", fontVariantNumeric: "tabular-nums" }}>
                      {score}
                    </td>
                    <td style={{ padding: "10px 12px" }}>
                      {row.person_id && (
                        <Link href={`/crm/people/${row.person_id}`} style={{ color: "var(--gg-primary, #2563eb)", fontSize: 12 }}>
                          View →
                        </Link>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
