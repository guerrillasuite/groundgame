export const dynamic = "force-dynamic";

import { getTenant } from "@/lib/tenant";
import { hasFeature } from "@/lib/features";
import { getCrmUser } from "@/lib/crm-auth";
import { createClient } from "@supabase/supabase-js";
import { redirect } from "next/navigation";
import Link from "next/link";
import { colorHex } from "@/lib/intel-brief-colors";

function makeSb() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}

function timeAgo(dateStr: string | null): string {
  if (!dateStr) return "—";
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days === 1) return "1d ago";
  if (days < 7) return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function isLive(dateStr: string | null): boolean {
  if (!dateStr) return false;
  return Date.now() - new Date(dateStr).getTime() < 2 * 60 * 60 * 1000;
}

function scoreColor(score: number): { bg: string; text: string } {
  if (score >= 8.5) return { bg: "rgba(34,197,94,0.15)", text: "#16a34a" };
  if (score >= 7.0) return { bg: "rgba(234,179,8,0.15)", text: "#b45309" };
  return { bg: "rgba(99,102,241,0.12)", text: "#4f46e5" };
}

interface Props {
  searchParams: Promise<{ cat?: string; score?: string; days?: string }>;
}

export default async function IntelBriefPage({ searchParams }: Props) {
  const [tenant, user, { cat, score: scoreFilter, days }] = await Promise.all([
    getTenant(),
    getCrmUser(),
    searchParams,
  ]);

  if (!hasFeature(tenant.features, "news")) redirect("/crm");

  const sb = makeSb();

  const [settingsRow, rawArticles] = await Promise.all([
    sb.from("tenant_news_settings").select("*").eq("tenant_id", tenant.id).maybeSingle().then(r => r.data),
    sb.from("tenant_article_relevance")
      .select("final_score, rule_score, ai_relevance_score, scored_at, news_articles!article_id(id, url, title, source_domain, published_at, snippet, categories)")
      .eq("tenant_id", tenant.id)
      .order("final_score", { ascending: false })
      .limit(200)
      .then(r => r.data ?? []),
  ]);

  const threshold: number = settingsRow?.display_threshold ?? 6.5;
  const categories: { key: string; label: string; color: string }[] = settingsRow?.categories ?? [];

  // Build category map for quick lookup
  const catMap = new Map(categories.map((c) => [c.key, c]));

  // Filter articles
  let articles = (rawArticles as any[]).filter((row) => {
    const a = row.news_articles;
    if (!a) return false;
    if ((row.final_score ?? 0) < threshold) return false;
    if (scoreFilter === "high" && row.final_score < 8.5) return false;
    if (scoreFilter === "mid" && (row.final_score < 7.0 || row.final_score >= 8.5)) return false;
    if (cat && !(a.categories ?? []).includes(cat)) return false;
    if (days) {
      const cutoff = Date.now() - parseInt(days) * 86400000;
      if (a.published_at && new Date(a.published_at).getTime() < cutoff) return false;
    }
    return true;
  });

  const lastUpdated = articles.length > 0
    ? Math.max(...articles.map((r) => r.scored_at ? new Date(r.scored_at).getTime() : 0))
    : null;

  const isDirector = user?.isAdmin;

  return (
    <div style={{ maxWidth: 960, margin: "0 auto" }}>
      <style>{`
        .ib-card { transition: transform .15s ease, box-shadow .15s ease; }
        .ib-card:hover { transform: translateY(-2px); box-shadow: 0 8px 28px rgba(0,0,0,.12); }
        .ib-filter-pill { transition: background .12s, color .12s; cursor: pointer; text-decoration: none; }
        .ib-filter-pill:hover { opacity: .85; }
        .ib-cat-badge { display: inline-flex; align-items: center; gap: 3px; font-size: 10px; font-weight: 700; padding: 2px 7px; border-radius: 999px; letter-spacing: .04em; text-transform: uppercase; }
        @keyframes pulse { 0%,100% { opacity: 1 } 50% { opacity: .3 } }
        .live-dot { width: 7px; height: 7px; border-radius: 50%; background: #ef4444; animation: pulse 1.6s ease-in-out infinite; display: inline-block; flex-shrink: 0; }
        .score-tip { position: relative; }
        .score-tip:hover::after { content: attr(data-tip); position: absolute; bottom: calc(100% + 6px); right: 0; background: #1e293b; color: #f1f5f9; font-size: 11px; font-weight: 500; white-space: pre; padding: 6px 10px; border-radius: 7px; z-index: 50; pointer-events: none; line-height: 1.6; }
      `}</style>

      {/* Page header */}
      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", marginBottom: 20 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 26, fontWeight: 800, letterSpacing: "-.02em" }}>
            📡 Intel Brief
          </h1>
          <p style={{ margin: "4px 0 0", fontSize: 13, color: "var(--gg-text-dim, #6b7280)" }}>
            {lastUpdated
              ? `Last scored ${timeAgo(new Date(lastUpdated).toISOString())}`
              : "No articles scored yet — check back after the first ingestion run."}
          </p>
        </div>
        {isDirector && (
          <Link href="/crm/settings/intel-brief" style={{ fontSize: 13, color: "var(--gg-primary, #2563eb)", textDecoration: "none", fontWeight: 600 }}>
            ⚙ Settings
          </Link>
        )}
      </div>

      {/* Sticky filter bar */}
      <div style={{
        position: "sticky", top: 56, zIndex: 30,
        background: "var(--gg-surface, rgba(255,255,255,0.85))",
        backdropFilter: "blur(12px)",
        borderBottom: "1px solid var(--gg-border, #e5e7eb)",
        marginBottom: 24, marginLeft: -20, marginRight: -20,
        padding: "10px 20px",
        display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center",
      }}>
        {/* Category filters */}
        <span style={{ fontSize: 11, fontWeight: 700, color: "var(--gg-text-dim,#6b7280)", textTransform: "uppercase", letterSpacing: ".06em", marginRight: 4 }}>
          Filter:
        </span>
        <FilterPill href={buildUrl({ cat: undefined, scoreFilter, days })} active={!cat} label="All" />
        {categories.map((c) => (
          <FilterPill
            key={c.key}
            href={buildUrl({ cat: cat === c.key ? undefined : c.key, scoreFilter, days })}
            active={cat === c.key}
            label={c.label}
            color={colorHex(c.color)}
          />
        ))}

        <div style={{ marginLeft: "auto", display: "flex", gap: 6 }}>
          {/* Score filter */}
          {[
            { label: "All Scores", val: undefined },
            { label: "High (8.5+)", val: "high" },
            { label: "Mid (7–8.5)", val: "mid" },
          ].map(({ label, val }) => (
            <FilterPill
              key={label}
              href={buildUrl({ cat, scoreFilter: val, days })}
              active={scoreFilter === val || (!scoreFilter && !val)}
              label={label}
            />
          ))}

          {/* Date filter */}
          {[
            { label: "Any Time", val: undefined },
            { label: "Today", val: "1" },
            { label: "7 Days", val: "7" },
          ].map(({ label, val }) => (
            <FilterPill
              key={label}
              href={buildUrl({ cat, scoreFilter, days: val })}
              active={days === val || (!days && !val)}
              label={label}
            />
          ))}
        </div>
      </div>

      {/* Article count */}
      <p style={{ margin: "0 0 16px", fontSize: 13, color: "var(--gg-text-dim,#6b7280)", fontWeight: 500 }}>
        {articles.length === 0 ? "No articles match your filters." : `${articles.length} article${articles.length !== 1 ? "s" : ""}`}
      </p>

      {/* Articles grid */}
      {articles.length === 0 ? (
        <EmptyState hasSettings={!!settingsRow} isDirector={!!isDirector} />
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(420px, 1fr))", gap: 16 }}>
          {articles.map((row: any) => {
            const a = row.news_articles;
            const live = isLive(a.published_at);
            const sc = scoreColor(row.final_score ?? 0);
            const tip = `Rule: ${row.rule_score ?? "—"} × 0.4\nAI: ${row.ai_relevance_score ?? "—"} × 0.6\n─────────────\nFinal: ${row.final_score ?? "—"}`;
            const articleCats: string[] = a.categories ?? [];
            return (
              <div key={a.id} className="ib-card" style={{
                background: "var(--gg-card,white)",
                border: "1px solid var(--gg-border,#e5e7eb)",
                borderRadius: 12,
                padding: "16px 18px",
                display: "flex", flexDirection: "column", gap: 10,
              }}>
                {/* Top row: live dot + categories + score */}
                <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                  {live && <span className="live-dot" title="Published in the last 2 hours" />}
                  {articleCats.map((key) => {
                    const cat = catMap.get(key);
                    const hex = cat ? colorHex(cat.color) : "#9ca3af";
                    return (
                      <span key={key} className="ib-cat-badge" style={{
                        background: hex + "22",
                        color: hex,
                        border: `1px solid ${hex}44`,
                      }}>
                        {cat?.label ?? key}
                      </span>
                    );
                  })}
                  <span
                    className="score-tip"
                    data-tip={tip}
                    style={{
                      marginLeft: "auto", flexShrink: 0,
                      fontSize: 12, fontWeight: 800,
                      background: sc.bg, color: sc.text,
                      padding: "3px 9px", borderRadius: 999,
                      cursor: "default", letterSpacing: "-.01em",
                    }}
                  >
                    {(row.final_score ?? 0).toFixed(1)}
                  </span>
                </div>

                {/* Title */}
                <a
                  href={a.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    fontSize: 15, fontWeight: 700, lineHeight: 1.35,
                    color: "var(--gg-text,#111)",
                    textDecoration: "none",
                    display: "-webkit-box", WebkitLineClamp: 3, WebkitBoxOrient: "vertical", overflow: "hidden",
                  }}
                >
                  {a.title ?? "(No title)"}
                </a>

                {/* Snippet */}
                {a.snippet && (
                  <p style={{
                    margin: 0, fontSize: 13, lineHeight: 1.5,
                    color: "var(--gg-text-dim,#6b7280)",
                    display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden",
                  }}>
                    {a.snippet}
                  </p>
                )}

                {/* Footer: source + time */}
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: "auto" }}>
                  <span style={{ fontSize: 11, fontWeight: 600, color: "var(--gg-text-dim,#9ca3af)", textTransform: "lowercase" }}>
                    {a.source_domain ?? "unknown source"}
                  </span>
                  <span style={{ fontSize: 11, color: "var(--gg-border,#d1d5db)" }}>·</span>
                  <span style={{ fontSize: 11, color: "var(--gg-text-dim,#9ca3af)" }}>
                    {timeAgo(a.published_at)}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function buildUrl({ cat, scoreFilter, days }: { cat?: string; scoreFilter?: string; days?: string }): string {
  const p = new URLSearchParams();
  if (cat) p.set("cat", cat);
  if (scoreFilter) p.set("score", scoreFilter);
  if (days) p.set("days", days);
  const q = p.toString();
  return `/crm/intel-brief${q ? "?" + q : ""}`;
}

function FilterPill({ href, active, label, color }: { href: string; active: boolean; label: string; color?: string }) {
  const bg = active
    ? (color ? color + "22" : "rgba(37,99,235,0.1)")
    : "transparent";
  const text = active
    ? (color ?? "var(--gg-primary,#2563eb)")
    : "var(--gg-text-dim,#6b7280)";
  const border = active
    ? (color ? color + "55" : "rgba(37,99,235,0.3)")
    : "var(--gg-border,#e5e7eb)";
  return (
    <Link href={href} className="ib-filter-pill" style={{
      fontSize: 12, fontWeight: 600,
      padding: "4px 12px", borderRadius: 999,
      background: bg, color: text,
      border: `1px solid ${border}`,
      textDecoration: "none", whiteSpace: "nowrap",
    }}>
      {label}
    </Link>
  );
}

function EmptyState({ hasSettings, isDirector }: { hasSettings: boolean; isDirector: boolean }) {
  return (
    <div style={{
      textAlign: "center", padding: "64px 24px",
      background: "var(--gg-card,white)",
      border: "1px solid var(--gg-border,#e5e7eb)",
      borderRadius: 16,
    }}>
      <div style={{ fontSize: 48, marginBottom: 16 }}>📡</div>
      <h2 style={{ margin: "0 0 8px", fontSize: 18, fontWeight: 700 }}>
        {hasSettings ? "No articles yet" : "Intel Brief isn't configured"}
      </h2>
      <p style={{ margin: "0 0 20px", fontSize: 14, color: "var(--gg-text-dim,#6b7280)", maxWidth: 360, marginInline: "auto" }}>
        {hasSettings
          ? "Articles will appear here once the ingestion pipeline runs. Check back soon."
          : "Set up keywords in settings so the system knows what news to track for you."}
      </p>
      {isDirector && (
        <Link href="/crm/settings/intel-brief" style={{
          display: "inline-block", padding: "10px 20px",
          background: "var(--gg-primary,#2563eb)", color: "white",
          borderRadius: 8, textDecoration: "none", fontWeight: 600, fontSize: 14,
        }}>
          Configure Intel Brief →
        </Link>
      )}
    </div>
  );
}
