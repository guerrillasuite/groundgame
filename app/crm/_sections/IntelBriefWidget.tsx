import Link from "next/link";
import { S, card, sectionLabel, makeSb } from "./_helpers";

export async function IntelBriefWidget({ tenantId }: { tenantId: string }) {
  const sb = makeSb(tenantId);

  const [newsSettingsRow, articlesRaw] = await Promise.all([
    sb.from("tenant_news_settings").select("display_threshold, widget_count, categories").eq("tenant_id", tenantId).maybeSingle().then(r => r.data),
    sb.from("tenant_article_relevance").select("final_score, news_articles!article_id(url, title, source_domain, published_at)").eq("tenant_id", tenantId).order("final_score", { ascending: false }).limit(20).then(r => r.data ?? []),
  ]);

  const newsThreshold: number = (newsSettingsRow as any)?.display_threshold ?? 6.5;
  const newsCount: number = (newsSettingsRow as any)?.widget_count ?? 5;

  const topArticles = ((articlesRaw as any[]) ?? [])
    .filter((r: any) => (r.final_score ?? 0) >= newsThreshold)
    .slice(0, newsCount);

  function newsTimeAgo(d: string | null): string {
    if (!d) return "—";
    const m = Math.floor((Date.now() - new Date(d).getTime()) / 60000);
    if (m < 60) return `${m}m`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}h`;
    return `${Math.floor(h / 24)}d`;
  }

  return (
    <div style={card}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
        <p style={{ ...sectionLabel, margin: 0 }}>📡 Intel Brief</p>
        <Link href="/crm/intel-brief" style={{ fontSize: 12, color: "var(--gg-primary, #2563eb)", textDecoration: "none" }}>Full feed →</Link>
      </div>
      {topArticles.length === 0
        ? <p style={{ fontSize: 13, color: S.dim, fontStyle: "italic", margin: "4px 0" }}>No articles yet — check back after the ingestion pipeline runs.</p>
        : (
          <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
            {topArticles.map((row: any, i: number) => {
              const a = row.news_articles;
              if (!a) return null;
              const live = (Date.now() - new Date(a.published_at ?? 0).getTime()) < 7200000;
              return (
                <a key={i} href={a.url} target="_blank" rel="noopener noreferrer" className="db-stop-row" style={{
                  display: "flex", alignItems: "center", gap: 8,
                  padding: "9px 10px", borderRadius: 7, textDecoration: "none", color: "inherit",
                  borderTop: i > 0 ? `1px solid ${S.border}` : "none",
                  transition: "background .12s ease",
                }}>
                  {live && <span style={{ width: 7, height: 7, borderRadius: "50%", background: "#ef4444", flexShrink: 0 }} />}
                  <span style={{ flex: 1, fontSize: 13, fontWeight: 500, color: S.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {a.title ?? "(No title)"}
                  </span>
                  <span style={{ fontSize: 11, color: S.dim, flexShrink: 0 }}>{newsTimeAgo(a.published_at)}</span>
                  <span style={{ fontSize: 11, fontWeight: 700, color: row.final_score >= 8.5 ? "#16a34a" : "#b45309", flexShrink: 0 }}>
                    {(row.final_score ?? 0).toFixed(1)}
                  </span>
                </a>
              );
            })}
          </div>
        )
      }
    </div>
  );
}
