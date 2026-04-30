# GroundGame — CRM Dashboard Overhaul
## Feature Spec for Claude Code
**Status:** Pre-development planning
**Files modified:** `app/crm/page.tsx`, `app/crm/settings/dashboard/page.tsx` (new)
**Scope:** AdminDashboard, FieldDashboard, Dashboard Settings page

---

## 0. Context

This spec covers a full redesign of the CRM home screen (`app/crm/page.tsx`) and a new Dashboard Settings page (`app/crm/settings/dashboard/page.tsx`). The goals are:

1. Migrate the dashboard from the old light-mode CSS variable system to the dark `S` token system established during the SitRep modernization (documented in `VisualGuide.md`)
2. Replace static, informational-only widgets with meaningful, actionable data — everything on the dashboard links somewhere
3. Introduce per-user customizable KPI cards for admin users, and Director-controlled KPI cards for field users
4. Replace the opportunity pipeline with a horizontally scrollable Kanban-style column view
5. Add Suspense streaming with shimmer skeleton loading so sections appear progressively
6. Sharpen the visual and tonal distinction between the Admin and Field dashboards

The dashboard is already dark-themed visually, but uses old CSS variables (`--gg-card: white`, `--gg-border: #e5e7eb`, `--gg-text-dim: #6b7280`) that are fragile and inconsistent with the rest of the modernized CRM. This migration is a cleanup, not a mode change.

---

## 1. Design System — `S` Token Migration

Define the `S` token object at the top of `page.tsx`. Copy verbatim from `VisualGuide.md` Section 1:

```ts
const S = {
  bg:        "rgb(10 13 20)",
  surface:   "rgb(14 18 28)",
  card:      "rgb(20 25 38)",
  border:    "rgba(255,255,255,.07)",
  text:      "rgb(236 240 245)",
  dim:       "rgb(100 116 139)",
  dimBright: "rgb(148 163 184)",
} as const;
```

**Replace every old CSS variable reference throughout `page.tsx`:**

| Old | New |
|-----|-----|
| `var(--gg-card, white)` | `S.card` |
| `var(--gg-border, #e5e7eb)` | `S.border` |
| `var(--gg-text, #111)` | `S.text` |
| `var(--gg-text-dim, #6b7280)` | `S.dim` |
| `var(--gg-text-dim, #9ca3af)` | `S.dim` |
| `var(--gg-bg, #f9fafb)` | `S.surface` |
| `#0f172a` (hardcoded dark text on sitrep rows) | `S.text` |
| `#64748b` (hardcoded dim text) | `S.dim` |

**Updated shared constants — replace existing:**

```ts
const card: React.CSSProperties = {
  background: S.card,
  border: `1px solid ${S.border}`,
  borderRadius: 12,
  padding: "20px 22px",
};

const sectionLabel: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 700,
  textTransform: "uppercase",
  letterSpacing: "0.07em",
  color: S.dim,
  margin: "0 0 16px",
};
```

**Updated hover CSS classes — replace the `<style>` block at the top of each dashboard:**

```css
.db-kpi { transition: transform .12s ease, box-shadow .12s ease, border-color .15s ease; }
.db-kpi:hover { transform: translateY(-2px) !important; border-color: color-mix(in srgb, var(--gg-primary, #2563eb) 35%, transparent) !important; }
.db-list-row { transition: transform .12s ease, background .12s ease; }
.db-list-row:hover { background: rgba(255,255,255,.03) !important; transform: translateX(2px); }
.db-stop-row { transition: background .12s ease; }
.db-stop-row:hover { background: rgba(255,255,255,.03) !important; }
.db-sitrep-row { transition: transform .12s ease, box-shadow .12s ease; }
.db-sitrep-row:hover { transform: translateY(-1.5px) !important; box-shadow: inset 3px 0 0 0 var(--accent), 0 4px 14px rgba(0,0,0,.35) !important; }
.db-stage-col { transition: background .12s ease, border-color .12s ease; }
.db-stage-col:hover { background: rgba(255,255,255,.04) !important; border-color: color-mix(in srgb, var(--gg-primary, #2563eb) 30%, transparent) !important; }
@keyframes shimmer { 0% { opacity: .5; } 50% { opacity: 1; } 100% { opacity: .5; } }
```

---

## 2. Updated `ProgressBar` Component

Replace the existing `ProgressBar` with this dark-surface version:

```tsx
function ProgressBar({ pct, color = "var(--gg-primary, #2563eb)" }: { pct: number; color?: string }) {
  const clamped = Math.min(100, Math.max(0, pct));
  const fill = pct >= 100 ? "#22c55e" : pct === 0 ? "rgba(255,255,255,.06)" : color;
  return (
    <div style={{ height: 5, borderRadius: 99, background: "rgba(255,255,255,.06)", overflow: "hidden" }}>
      <div style={{
        height: "100%",
        width: `${clamped}%`,
        background: fill,
        borderRadius: 99,
        transition: "width 0.3s ease",
        boxShadow: pct > 0 && pct < 100 ? `0 0 6px ${color}66` : "none",
      }} />
    </div>
  );
}
```

---

## 3. Suspense Streaming Architecture

The current dashboard loads everything in a single `Promise.all` before rendering anything. This spec introduces Suspense streaming so each section appears as its data arrives.

**Approach:** Extract each major section of both dashboards into its own `async` server component. Each component fetches its own data. Wrap each in `<Suspense fallback={<SectionSkeleton />}>` at the page level.

**New file structure:**

```
app/crm/
  page.tsx                          — Thin shell: auth, header, Suspense wrappers only
  _sections/
    KpiRow.tsx                      — AdminDashboard KPI cards
    AttentionNeeded.tsx             — Red flags section
    PipelineKanban.tsx              — Opportunity pipeline
    ActiveLists.tsx                 — Walklist progress
    SurveyProgress.tsx              — Survey completion
    RecentActivity.tsx              — Recent stops feed
    SitRepWidget.tsx                — SitRep widget (admin)
    FieldKpiRow.tsx                 — FieldDashboard KPI cards
    FieldLists.tsx                  — Field user's assigned lists
    FieldSitRepWidget.tsx           — SitRep widget (field)
    FieldRecentStops.tsx            — Field user's recent stops
```

**Skeleton component — used as Suspense fallback for all card sections:**

```tsx
function SectionSkeleton({ rows = 4, height = 36 }: { rows?: number; height?: number }) {
  return (
    <div style={{ ...card }}>
      <div style={{
        height: 10, width: 90, background: "rgba(255,255,255,.06)",
        borderRadius: 6, marginBottom: 18, animation: "shimmer 1.5s infinite",
      }} />
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} style={{
          height, background: "rgba(255,255,255,.04)", borderRadius: 7,
          marginBottom: 6, animation: "shimmer 1.5s infinite",
          animationDelay: `${i * 0.08}s`,
        }} />
      ))}
    </div>
  );
}

function KpiSkeleton() {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 12 }}>
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} style={{
          ...card, height: 100,
          animation: "shimmer 1.5s infinite",
          animationDelay: `${i * 0.1}s`,
        }} />
      ))}
    </div>
  );
}
```

**`app/crm/page.tsx` shell structure (admin path):**

```tsx
export default async function CrmHome() {
  const [tenant, crmUser] = await Promise.all([getTenant(), getCrmUser()]);
  // auth checks...
  // fetch userName...
  // fetch dashboard settings from tenant.settings.dashboard_config

  if (crmUser.isAdmin) {
    return (
      <section style={{ maxWidth: 1100, margin: "0 auto", padding: "28px 24px", display: "flex", flexDirection: "column", gap: 20 }}>
        <style>{/* CSS classes block from Section 1 */}</style>

        {/* Header — no Suspense, renders immediately */}
        <DashboardHeader userName={userName} tenantName={tenantName} tenantId={tenant.id} />

        {/* Streamed sections */}
        <Suspense fallback={<KpiSkeleton />}>
          <KpiRow tenantId={tenant.id} userId={crmUser.userId} config={dashboardConfig} />
        </Suspense>

        <Suspense fallback={null}>
          <AttentionNeeded tenantId={tenant.id} settings={tenant.settings} />
        </Suspense>

        <Suspense fallback={<SectionSkeleton rows={5} height={52} />}>
          <PipelineKanban tenantId={tenant.id} />
        </Suspense>

        {hasNews && (
          <Suspense fallback={<SectionSkeleton rows={4} />}>
            <IntelBriefWidget tenantId={tenant.id} />
          </Suspense>
        )}

        <Suspense fallback={<SectionSkeleton rows={6} />}>
          <ActiveLists tenantId={tenant.id} />
        </Suspense>

        <Suspense fallback={<SectionSkeleton rows={4} />}>
          <SurveyProgress tenantId={tenant.id} />
        </Suspense>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
          <Suspense fallback={<SectionSkeleton rows={8} height={32} />}>
            <RecentActivity tenantId={tenant.id} settings={tenant.settings} />
          </Suspense>
          <Suspense fallback={<SectionSkeleton rows={8} height={32} />}>
            <SitRepWidget tenantId={tenant.id} settings={tenant.settings} />
          </Suspense>
        </div>
      </section>
    );
  }

  // Field dashboard path — similar structure with FieldKpiRow, FieldLists, etc.
}
```

**Important:** `AttentionNeeded` uses `fallback={null}` — no skeleton renders for this section. If there are no flags, it renders nothing. The shimmer would be confusing for a section that may not appear at all.

---

## 4. Dashboard Settings — Data Model

Dashboard configuration is stored in `tenants.settings` JSONB under the key `dashboard_config`. Follow the existing sub-key pattern from `VisualGuide.md` Section 14 exactly.

**Shape of `dashboard_config`:**

```ts
type DashboardConfig = {
  // Admin dashboard — per-user overrides stored separately (see below)
  admin_widgets: {
    pipeline: boolean;
    active_lists: boolean;
    survey_progress: boolean;
    recent_activity: boolean;
    sitrep: boolean;
    intel_brief: boolean;           // only relevant if tenant has "news" feature
  };

  // Field dashboard — Directors set this for ALL field users in the tenant
  field_kpi_ids: string[];          // array of up to 5 KPI IDs from the pool below
  field_widgets: {
    my_lists: boolean;
    sitrep: boolean;
    recent_stops: boolean;
  };
};
```

**Per-user KPI selection** — stored in a separate table, not the tenant settings JSONB, because each Support/Director user picks their own 5 KPIs for the admin dashboard:

```sql
CREATE TABLE user_dashboard_prefs (
  user_id UUID NOT NULL REFERENCES auth.users(id),
  tenant_id TEXT NOT NULL,
  admin_kpi_ids TEXT[] DEFAULT '{}',   -- ordered array of up to 5 KPI IDs
  PRIMARY KEY (user_id, tenant_id)
);
```

If a user has no row in `user_dashboard_prefs`, fall back to a default set of 5 KPI IDs defined as a constant in the code.

**Default admin KPI set (shown when no user preference exists):**
```ts
const DEFAULT_ADMIN_KPIS = ["stops_today", "open_opps", "pipeline_value", "active_lists", "past_due_sitrep"];
```

**Default field KPI set (used when Director has not configured field dashboard):**
```ts
const DEFAULT_FIELD_KPIS = ["my_stops_today", "my_lists", "my_past_due", "contacts_reached_today", "active_ops"];
```

---

## 5. KPI Pool — Full Definition

Each KPI has an `id`, a `label`, a data query, and whether it supports a trend delta.

**Admin KPI pool (Directors/Support choose up to 5):**

| ID | Label | Query | Trend? |
|----|-------|-------|--------|
| `stops_today` | Stops Today | Count of stops where `stop_at >= today` | No |
| `stops_this_week` | Stops This Week | Count of stops where `stop_at >= 7 days ago` | Yes — vs prior 7 days |
| `open_opps` | Open Opportunities | Count of opps not in won/lost | Yes — vs 7 days ago |
| `pipeline_value` | Pipeline Value | Sum of `amount_cents` on open opps, formatted via `fmtCurrency()` | No |
| `win_rate` | Win Rate (30d) | won / (won + lost) in last 30 days, shown as `%` | No |
| `contacts_reached_week` | Contacts Reached | Distinct `person_id` count in stops this week | Yes — vs prior week |
| `active_lists` | Active Lists | Count of walklists for tenant | No |
| `past_due_sitrep` | Past Due Items | Count of sitrep_items where overdue and status open/in_progress | No (colored red when > 0) |
| `surveys_completed_week` | Surveys This Week | Count of survey_sessions with `completed_at >= 7 days ago` | No |
| `new_people_week` | New Contacts | Count of people with `created_at >= 7 days ago` | No |

**Field KPI pool (Directors pick up to 5 for all field users):**

| ID | Label | Query | Notes |
|----|-------|-------|-------|
| `my_stops_today` | My Stops Today | Count of stops by this user today | Green glow when > 0 |
| `my_stops_week` | My Stops This Week | Count of stops by this user, 7 days | — |
| `my_lists` | My Lists | Count of assigned walklists | — |
| `my_past_due` | Past Due | Count of overdue sitrep items assigned to this user | Red when > 0 |
| `contacts_reached_today` | Contacts Reached | Distinct person_id count in my stops today | — |
| `active_ops` | Active Opps | Count of open opportunities (not won/lost) assigned to this user (`assigned_to = userId`) | — |

**Implementation note:** Each KPI section component receives the user's selected `kpi_ids` array and runs only the queries needed for those KPIs. Do not run all 10 queries on every load — only query what is selected. Use a `switch` or `Map` to build the query set from the ID list.

---

## 6. KPI Card Design

Each KPI card is a `<Link>` to the relevant CRM page (see link targets in Section 11). All cards use the same base structure:

```tsx
<Link href={kpi.href} className="db-kpi" style={{
  ...card,
  textDecoration: "none",
  color: "inherit",
  display: "block",
  boxShadow: `inset 3px 0 0 0 ${kpi.color}`,
  cursor: "pointer",
}}>
  {/* Big number */}
  <div style={{ fontSize: 28, fontWeight: 800, lineHeight: 1, color: kpi.alertColor ?? S.text }}>
    {kpi.value}
  </div>

  {/* Label */}
  <div style={{
    fontSize: 11, fontWeight: 700, textTransform: "uppercase",
    letterSpacing: "0.06em", color: S.dim, marginTop: 6,
  }}>
    {kpi.label}
  </div>

  {/* Trend delta — only renders if kpi.trend is defined */}
  {kpi.trend && (
    <div style={{
      fontSize: 11, marginTop: 4, fontWeight: 600,
      color: kpi.trend > 0 ? "#22c55e" : kpi.trend < 0 ? "#ef4444" : S.dim,
    }}>
      {kpi.trend > 0 ? "+" : ""}{kpi.trend} vs last week
    </div>
  )}
</Link>
```

**Alert coloring rules:**
- `past_due_sitrep`: number turns `#ef4444` when > 0, `#22c55e` when 0
- `my_past_due`: same — red when > 0, green when 0
- `my_stops_today`: number gets `text-shadow: 0 0 12px rgba(34,197,94,0.6)` when > 0
- All others: `S.text`

**Grid layout:**
```tsx
<div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 12 }}>
```
Field dashboard uses `repeat(4, 1fr)` or `repeat(5, 1fr)` depending on how many the Director has configured.

---

## 7. Admin Dashboard — Section Specs

### 7.1 Header

```tsx
async function DashboardHeader({ tenantId, tenantName, userName }: ...) {
  const sb = makeSb(tenantId);
  const todayStart = new Date(); todayStart.setHours(0,0,0,0);
  const { count: stopsToday } = await sb
    .from("stops")
    .select("*", { count: "exact", head: true })
    .eq("tenant_id", tenantId)
    .gte("stop_at", todayStart.toISOString());

  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";

  return (
    <div style={{ borderBottom: `1px solid ${S.border}`, paddingBottom: 18 }}>
      <h1 style={{ margin: 0, fontSize: 24, fontWeight: 800, color: S.text }}>
        {greeting}{userName ? `, ${userName.split(" ")[0]}` : ""} 👋
      </h1>
      <p style={{ margin: "4px 0 0", color: S.dim, fontSize: 14 }}>
        <span style={{ color: S.dimBright }}>{tenantName}</span>
        {" · "}
        {new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}
        {stopsToday > 0 && (
          <span style={{ color: S.dimBright }}>
            {" · "}{stopsToday.toLocaleString()} stop{stopsToday !== 1 ? "s" : ""} logged today
          </span>
        )}
      </p>
    </div>
  );
}
```

### 7.2 Attention Needed

Renders only when there are red flags. No skeleton fallback.

**Red flags (same logic as current, updated styles):**
- Overdue SitRep items
- Lists with 0 stops (stale)
- Lists at 90%+ completion (nearly done — green, not red)

```tsx
// Card when rendered:
{
  background: "rgba(239,68,68,0.07)",
  border: "1px solid rgba(239,68,68,0.22)",
  borderRadius: 12,
  padding: "16px 20px",
}
```

Each alert row is a `<Link>` — not bare text. Overdue items link to `/crm/sitrep`. Stale lists link to `/crm/lists/{id}`. Nearly-done lists link to `/crm/lists/{id}`.

Row structure:
```tsx
<Link href={href} style={{ display: "flex", alignItems: "center", gap: 10, textDecoration: "none", padding: "6px 0" }}>
  <span style={{ width: 8, height: 8, borderRadius: "50%", background: dotColor, flexShrink: 0, display: "inline-block" }} />
  <span style={{ fontSize: 13, fontWeight: 600, color: textColor }}>{message}</span>
  <span style={{ marginLeft: "auto", fontSize: 11, color: S.dim }}>→</span>
</Link>
```

Dot/text colors: overdue → `#ef4444`, stale → `#f59e0b`, nearly-done → `#22c55e`.

### 7.3 Opportunity Pipeline Kanban

Horizontally scrollable column layout. Each column is one stage.

```tsx
// Wrapper — enables horizontal scroll
<div style={{ overflowX: "auto", paddingBottom: 8 }}>
  <div style={{ display: "flex", gap: 10, minWidth: "max-content" }}>
    {stageList.map((stage, i) => {
      const data = oppByStage.get(stage.key) ?? { count: 0, amount: 0 };
      const color = stageColor(stage.key, i, stageList.length);
      return (
        <Link
          key={stage.key}
          href={`/crm/opportunities?stage=${stage.key}`}
          className="db-stage-col"
          style={{
            width: 160,
            flexShrink: 0,
            background: "rgba(255,255,255,.02)",
            border: `1px solid ${S.border}`,
            borderRadius: 10,
            padding: "14px 16px",
            textDecoration: "none",
            color: "inherit",
            boxShadow: `inset 0 3px 0 0 ${color}`,  // top accent bar per stage
          }}
        >
          {/* Stage name */}
          <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: S.dim, marginBottom: 10 }}>
            {stage.label}
          </div>

          {/* Deal count — big number */}
          <div style={{ fontSize: 26, fontWeight: 800, color: data.count > 0 ? S.text : S.dim, lineHeight: 1 }}>
            {data.count}
          </div>

          {/* Value */}
          {data.amount > 0 && (
            <div style={{ fontSize: 12, color, fontWeight: 600, marginTop: 4 }}>
              {fmtCurrency(data.amount)}
            </div>
          )}
        </Link>
      );
    })}
  </div>
</div>
```

The accent bar here sits at the **top** of each column (`inset 0 3px 0 0` instead of the usual left bar) — visually distinguishes stage columns from list rows and feels more like Kanban column headers.

Add a card wrapper around the whole section with a header row:
```
🎯 Opportunity Pipeline        $X total · Y deals in play        View all →
```
"View all →" links to `/crm/opportunities`. Total pipeline value and deal count computed from existing `opps` data — no extra query.

### 7.4 Active Lists

Same structure as current. Updates:

**Mode badge — dark pill style:**
```tsx
// Call
{ background: "rgba(59,130,246,.12)", color: "#60a5fa", border: "1px solid rgba(59,130,246,.2)", fontSize: 10, fontWeight: 700, padding: "2px 7px", borderRadius: 4 }
// Knock
{ background: "rgba(16,185,129,.12)", color: "#34d399", border: "1px solid rgba(16,185,129,.2)", fontSize: 10, fontWeight: 700, padding: "2px 7px", borderRadius: 4 }
```

Row: name in `S.text`, done/total count in `S.dimBright`, last stop time in `S.dim`. Each row is a `<Link href={/crm/lists/${list.id}}>`.

### 7.5 Survey Progress

Minor update only — dark surface tokens. Card background to `rgba(255,255,255,.04)`, border to `S.border`, text to `S.text`. Cap display at 6 surveys. Each card links to `/crm/survey/${survey.id}/results`.

### 7.6 Recent Activity

Each stop row is now a `<Link href={/crm/people/${stop.person_id}}>` when a `person_id` exists. Rows without a person_id render as `<div>`.

Add a channel badge to each row:
```tsx
<span style={{ fontSize: 11, color: S.dim, flexShrink: 0 }}>
  {stop.channel === "call" ? "📞" : "🚪"}
</span>
```

Row order: `[disposition dot] [channel badge] [person name] [result label] [time ago]`

Result label uses disposition color from `colorMap`. Time uses `timeAgo()`.

Header row: `⚡ Recent Activity` label on left, `All activity →` link to `/crm/stops` on right.

### 7.7 SitRep Widget

The SitRep widget rendering logic (`renderSitrepRow`, `groupItems`, `wCfg`, etc.) carries over. Only the surface tokens update. Verify the `--accent` CSS custom property trick from `VisualGuide.md` Section 12 is still applied to sitrep rows.

**SitRep row text color by status** — the widget only shows `open`, `in_progress`, and `confirmed` items (the query filters out `done`):

| Status | Row background | Text color |
|--------|---------------|------------|
| `open` | `shades[3] + "55"` — light pastel | `#0f172a` (dark, readable on pastel) |
| `in_progress` | `shades[3] + "55"` — light pastel | `#0f172a` (dark, readable on pastel) |
| `confirmed` | `shades[1] + "33"` — dark tint | `S.text` = `rgb(236 240 245)` (light, readable on dark) |

```tsx
const bgStyle = item.status === "confirmed"
  ? sitrepShades(item)[1] + "33"   // dark background for confirmed events
  : sitrepShades(item)[3] + "55";  // light pastel for open/in_progress
const textColor = item.status === "confirmed" ? S.text : "#0f172a";
```

Header: `📋 SitRep` label on left, `Full SitRep →` link to `/crm/sitrep` on right.

---

## 8. Field Dashboard — Section Specs

### 8.1 Header

Same structure as admin header. Add the conditional stop banner:

```tsx
{stopsToday > 0 && (
  <div style={{
    marginTop: 12,
    background: "rgba(34,197,94,.08)",
    border: "1px solid rgba(34,197,94,.2)",
    borderRadius: 8,
    padding: "10px 16px",
    fontSize: 13,
    fontWeight: 600,
    color: "#4ade80",
  }}>
    🔥 You've logged {stopsToday} stop{stopsToday !== 1 ? "s" : ""} today. Keep it up!
  </div>
)}
```

`stopsToday` here is scoped to the current user's stops (not tenant-wide like admin).

### 8.2 Field KPI Row

Directors configure up to 5 KPIs for all field users in the tenant. The `FieldKpiRow` component reads `tenant.settings.dashboard_config.field_kpi_ids`, falls back to `DEFAULT_FIELD_KPIS` if not set. Queries only what is selected. Renders with the same `<Link>` card structure as admin KPI cards.

### 8.3 My Lists

Same updates as admin Active Lists (dark tokens, mode badges, progress bar). Additional field-specific states:

**100% complete:**
Replace percentage with a `🎉 Done!` badge:
```tsx
<span style={{ fontSize: 11, fontWeight: 700, color: "#22c55e", background: "rgba(34,197,94,.12)", border: "1px solid rgba(34,197,94,.2)", padding: "2px 8px", borderRadius: 4 }}>
  🎉 Done!
</span>
```
Make the progress bar fully green (already handled by `ProgressBar` component when `pct >= 100`).

**Unstarted (0 stops, assigned > 24h ago):**
Add a subtle amber indicator inline after the list name:
```tsx
<span style={{ fontSize: 10, color: "#f59e0b", marginLeft: 6, fontWeight: 600 }}>• Unstarted</span>
```
Compute: list has no stops in `stopCounts` and `list.created_at < 24h ago`.

### 8.4 Field SitRep Widget

Same as admin SitRep widget but scoped to the current user (existing `myItems` / `myGroups` logic carries over). Dark surface token update only.

### 8.5 Recent Stops

Field users cannot navigate to `/crm/people/:id`. Rows render as `<div>`, not `<Link>`.

**Why:** `/crm/people/:id` is an admin-only route. Field users who click it would land on a page they can't use. Eventually, when field users have their own People records and a dedicated limited "my contacts" view is built, this can open up — but it must be a purpose-built field view, not the admin detail page. The current `page.tsx` code incorrectly renders these as `<Link>` — that is a bug to fix during implementation.

Result label: larger and bolder than the admin version — this is the most important datum for the rep reviewing their own stops.
```tsx
<span style={{ fontSize: 13, color, fontWeight: 800, flexShrink: 0 }}>{stop.result ?? "—"}</span>
```

---

## 9. Empty States — All Sections

Replace all current italic gray text empty states with these. Style:
```tsx
<p style={{ fontSize: 13, color: S.dim, fontStyle: "italic", margin: "4px 0" }}>
  {message}
</p>
```

| Section | Message |
|---------|---------|
| Admin: Pipeline | No open opportunities yet. | 
| Admin: Active Lists | No active lists yet. Create one in Lists → |
| Admin: Survey Progress | (section does not render — already handled) |
| Admin: Recent Activity | No stops recorded yet. Time to hit the field. |
| Admin: SitRep | All clear. Nothing on the board. |
| Field: My Lists | No lists assigned yet. Check back with your team lead. |
| Field: Recent Stops | No stops logged yet — time to make some contacts! 🚪 |
| Field: SitRep | All clear. Nothing on the board. |

For Active Lists empty state, the `→` should be a `<Link href="/crm/lists">` inline — the whole sentence is not a link, just the destination word.

---

## 10. Dashboard Settings Page

**File:** `app/crm/settings/dashboard/page.tsx`

**Auth:** Uses `getTenant()` and `getCrmUser()`. Redirect to `/crm` if user is not `isAdmin`. Directors can configure everything. Support users can configure only their own KPI selection (the admin KPI section).

**Page title:** "Dashboard Settings"

### 10.1 Section: My KPI Cards (Support + Director)

Shown to all admin users. Controls the KPI cards the current user sees on their own admin dashboard.

Renders all 10 admin KPI options as a selectable grid. Each option is a toggle card:
- Selected: `background: color-mix(in srgb, var(--gg-primary, #2563eb) 15%, transparent)`, `border: 1px solid color-mix(in srgb, var(--gg-primary, #2563eb) 40%, transparent)`
- Unselected: `background: rgba(255,255,255,.02)`, `border: 1px solid ${S.border}`

Show a counter: `3 / 5 selected`. Selecting a 6th disables all unselected options and shows a `"Max 5 reached"` note. Deselecting one re-enables them.

On save: upsert the user's row in `user_dashboard_prefs` with the ordered array of selected KPI IDs. Order matters — the cards appear left to right in the order selected.

KPI option card structure:
```
[KPI label in S.text, font-weight 600]
[KPI description in S.dim, font-size 12]
[Trend badge if supported: "Supports trend delta" in S.dim, font-size 11]
```

### 10.2 Section: Admin Dashboard Widgets (Director only)

Directors can toggle each widget on/off for the admin dashboard. All admin users on the tenant are affected.

Render as a list of toggle rows using the iOS-style toggle from `VisualGuide.md` Section 5:

| Widget | Toggle label | Notes |
|--------|-------------|-------|
| Attention Needed | Always on — no toggle | Not configurable |
| Opportunity Pipeline | Pipeline | — |
| Active Lists | Active Lists | — |
| Survey Progress | Survey Progress | Only shown if surveys exist |
| Intel Brief | Intel Brief | Only shown if tenant has `"news"` feature |
| Recent Activity | Recent Activity | — |
| SitRep | SitRep | Links to SitRep settings: "Configure →" next to toggle |

"Configure →" next to the SitRep toggle links to `/crm/settings/sitrep` (existing SitRep settings page).

On save: write to `tenant.settings.dashboard_config.admin_widgets` via the tenant settings sub-key PATCH pattern from `VisualGuide.md` Section 14.

### 10.3 Section: Field Dashboard (Director only)

Two sub-sections:

**Field KPI Cards:**
Same selectable grid as Section 10.1, but drawing from the field KPI pool (5 options). Director selects up to 5. These apply to all field users in the tenant. Saves to `tenant.settings.dashboard_config.field_kpi_ids`.

**Field Widgets:**
Toggle rows for field dashboard widgets:

| Widget | Toggle label |
|--------|-------------|
| My Lists | My Lists |
| SitRep | SitRep |
| Recent Stops | Recent Stops |

Saves to `tenant.settings.dashboard_config.field_widgets`.

### 10.4 Save behavior

Single `gg-btn-primary` save button at the bottom of each section. (`gg-btn-primary` is defined in `globals.css` — 14px/700 blue fill, hover/active/disabled states — it is the correct class; do not use `btn` which is the older PWA button.) Each section saves independently (not one global save). Show a success toast per section: `"Dashboard settings saved."` Brief loading spinner on the button while saving.

API route: `POST /api/crm/dashboard/settings/route.ts` — two endpoints:
- `PATCH /api/crm/dashboard/settings` — tenant-level config (admin_widgets, field_kpi_ids, field_widgets). Director only.
- `PATCH /api/crm/dashboard/kpis` — per-user KPI selection. Support + Director.

Follow the tenant settings sub-key PATCH pattern from `VisualGuide.md` Section 14 exactly for the tenant-level config. The per-user KPI config upserts directly to `user_dashboard_prefs`.

---

## 11. Link Targets — Every Interactive Element

Everything on the dashboard is a link. This table is the definitive reference:

| Element | Link target |
|---------|------------|
| KPI card: Stops Today | `/crm/stops` |
| KPI card: Stops This Week | `/crm/stops` |
| KPI card: Open Opportunities | `/crm/opportunities` |
| KPI card: Pipeline Value | `/crm/opportunities` |
| KPI card: Win Rate | `/crm/opportunities` |
| KPI card: Contacts Reached | `/crm/people` |
| KPI card: Active Lists | `/crm/lists` |
| KPI card: Past Due Items | `/crm/sitrep` |
| KPI card: Surveys This Week | `/crm/survey` |
| KPI card: New Contacts | `/crm/people` |
| KPI card: My Stops Today | `/crm/stops` |
| KPI card: My Lists | `/crm/lists` |
| KPI card: My Past Due | `/crm/sitrep` |
| KPI card: Contacts Reached Today | `/crm/people` |
| Attention Needed: overdue items | `/crm/sitrep` |
| Attention Needed: stale list | `/crm/lists/{list.id}` |
| Attention Needed: nearly-done list | `/crm/lists/{list.id}` |
| Pipeline stage column | `/crm/opportunities?stage={stage.key}` |
| Pipeline "View all →" | `/crm/opportunities` |
| Active list row | `/crm/lists/{list.id}` |
| Active lists "View all →" | `/crm/lists` |
| Survey card | `/crm/survey/{survey.id}/results` |
| Survey "View all →" | `/crm/survey` |
| Recent activity row (with person) | `/crm/people/{person.id}` |
| Recent activity "All activity →" | `/crm/stops` |
| SitRep row | `/crm/sitrep/{item.id}` |
| SitRep "Full SitRep →" | `/crm/sitrep` |
| Intel Brief row | external (article URL, `target="_blank"`) |
| Intel Brief "Full Briefing →" | `/crm/intel-brief` |
| Field: list row | `/crm/lists/{list.id}` |
| Field: recent stop row | NOT a link (field users lack people access) |

---

## 12. New Supabase Table

```sql
CREATE TABLE user_dashboard_prefs (
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  tenant_id TEXT NOT NULL,
  admin_kpi_ids TEXT[] DEFAULT '{}',
  PRIMARY KEY (user_id, tenant_id)
);

-- RLS: users can only read/write their own row
ALTER TABLE user_dashboard_prefs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own_row" ON user_dashboard_prefs
  USING (user_id = auth.uid());
```

---

## 13. Navigation — Add Settings Link

Add "Dashboard" as a sub-item under Settings in the CRM nav (however the settings nav is currently structured). Route: `/crm/settings/dashboard`.

---

## 14. Implementation Order

1. `S` token migration — replace all CSS variables in `page.tsx`. Smoke test that the dashboard still renders correctly with no visual regressions.
2. Update `ProgressBar`, `card`, `sectionLabel`, and hover CSS classes.
3. Create the `_sections/` directory and extract each section component. Wire up Suspense wrappers in `page.tsx` shell.
4. Create `user_dashboard_prefs` table via Supabase migration.
5. Build `KpiRow` and `FieldKpiRow` components with the KPI pool logic and per-user/Director config.
6. Redesign pipeline as `PipelineKanban` component.
7. Update `AttentionNeeded` (new visual style, clickable rows).
8. Update `ActiveLists`, `SurveyProgress`, `RecentActivity`, `SitRepWidget` with dark tokens.
9. Update `FieldLists` with completion badge and unstarted indicator.
10. Update `FieldRecentStops` with non-linked rows, bold result labels.
11. Update both headers with new structure and sub-stat.
12. Update all empty states.
13. Build `/crm/settings/dashboard/page.tsx` and its two API routes.
14. Add settings page to nav.

---

## 15. What NOT to Change

- `timeAgo()`, `fmtCurrency()`, `fmtDate()`, `isOverdue()`, `sitrepEffectiveDate()`, `fmtSitrepDate()` — keep all helper functions exactly as-is
- `groupItems()` — keep as-is
- `stageColor()`, `STAGE_COLORS`, `STAGE_TERMINAL` — keep as-is
- `makeSb()` — keep as-is
- `Dot` component — keep as-is
- SitRep widget config logic (`wCfg`, `applySitrepWidgetCfg`) — keep as-is, tokens only
- Auth patterns (`getTenant()`, `getCrmUser()`) — do not alter
- Intel Brief widget — defined in the Intel Brief spec; this plan only specifies its position in the layout (between pipeline and active lists) and that it is Suspense-wrapped
- The `--accent` CSS custom property trick for sitrep rows — keep exactly as-is per `VisualGuide.md` Section 12

**Dead code to remove during migration:**
- `sitrepIcon()` — originally designed to render a leading status emoji (`⚠`, `▶`, `○`, `📅`) in SitRep rows. Superseded by the color family accent strip + row background system, which already conveys type and status more elegantly. Not called anywhere in the current render. Delete it.
- `sitrepIconColor()` — companion to `sitrepIcon()`, same story. Not called anywhere. Delete it.
