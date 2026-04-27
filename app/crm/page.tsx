export const dynamic = "force-dynamic";

import { Suspense } from "react";
import { createClient } from "@supabase/supabase-js";
import { getTenant } from "@/lib/tenant";
import { getCrmUser } from "@/lib/crm-auth";
import { hasFeature } from "@/lib/features";
import { card, DEFAULT_ADMIN_KPIS, DEFAULT_FIELD_KPIS } from "./_sections/_helpers";

// ── Admin sections ────────────────────────────────────────────────────────────
import { DashboardHeader } from "./_sections/DashboardHeader";
import { KpiRow } from "./_sections/KpiRow";
import { AttentionNeeded } from "./_sections/AttentionNeeded";
import { PipelineKanban } from "./_sections/PipelineKanban";
import { ActiveLists } from "./_sections/ActiveLists";
import { SurveyProgress } from "./_sections/SurveyProgress";
import { RecentActivity } from "./_sections/RecentActivity";
import { SitRepWidget } from "./_sections/SitRepWidget";
import { IntelBriefWidget } from "./_sections/IntelBriefWidget";

// ── Field sections ────────────────────────────────────────────────────────────
import { FieldHeader } from "./_sections/FieldHeader";
import { FieldKpiRow } from "./_sections/FieldKpiRow";
import { FieldLists } from "./_sections/FieldLists";
import { FieldSitRepWidget } from "./_sections/FieldSitRepWidget";
import { FieldRecentStops } from "./_sections/FieldRecentStops";

// ── Skeleton components ───────────────────────────────────────────────────────

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

function KpiSkeleton({ count = 5 }: { count?: number }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: `repeat(${count}, 1fr)`, gap: 12 }}>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} style={{
          ...card, height: 100,
          animation: "shimmer 1.5s infinite",
          animationDelay: `${i * 0.1}s`,
        }} />
      ))}
    </div>
  );
}

// ── Shared CSS ────────────────────────────────────────────────────────────────

const DASHBOARD_CSS = `
  .db-kpi { transition: transform .12s ease, box-shadow .12s ease, border-color .15s ease; }
  .db-kpi:hover { transform: translateY(-2px) !important; }
  .db-list-row { transition: transform .12s ease, background .12s ease; }
  .db-list-row:hover { background: rgba(255,255,255,.03) !important; transform: translateX(2px); }
  .db-stop-row { transition: background .12s ease; }
  .db-stop-row:hover { background: rgba(255,255,255,.03) !important; }
  .db-sitrep-row { transition: transform .12s ease, box-shadow .12s ease; }
  .db-sitrep-row:hover { transform: translateY(-1.5px) !important; box-shadow: inset 3px 0 0 0 var(--accent), 0 4px 14px rgba(0,0,0,.35) !important; }
  .db-stage-col { transition: background .12s ease, border-color .12s ease; }
  .db-stage-col:hover { background: rgba(255,255,255,.04) !important; }
  @keyframes shimmer { 0% { opacity: .5; } 50% { opacity: 1; } 100% { opacity: .5; } }
`;

// ── Page ──────────────────────────────────────────────────────────────────────

export default async function CrmHome() {
  const [tenant, crmUser] = await Promise.all([getTenant(), getCrmUser()]);

  if (!crmUser) {
    return (
      <section className="stack">
        <h1>Welcome to GroundGame</h1>
        <p>Please sign in to continue.</p>
      </section>
    );
  }

  const tenantName = (tenant.branding as any)?.appName ?? tenant.slug ?? "GroundGame";
  const settings = (tenant as any).settings ?? {};

  // Fetch userName + dashboard prefs in parallel
  const adminSb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  const [authUserResult, kpiPrefsResult] = await Promise.all([
    adminSb.auth.admin.getUserById(crmUser.userId),
    crmUser.isAdmin
      ? Promise.resolve(
          adminSb.from("user_dashboard_prefs")
            .select("admin_kpi_ids")
            .eq("user_id", crmUser.userId)
            .eq("tenant_id", tenant.id)
            .maybeSingle()
        ).catch(() => ({ data: null }))
      : Promise.resolve({ data: null }),
  ]);

  const authUser = authUserResult.data?.user;
  const userName = authUser?.user_metadata?.name ?? authUser?.user_metadata?.full_name ?? authUser?.email?.split("@")[0] ?? "";

  // Dashboard config
  const dashConfig = settings.dashboard_config ?? {};
  const adminWidgets = { pipeline: true, active_lists: true, survey_progress: true, recent_activity: true, sitrep: true, intel_brief: true, ...((dashConfig.admin_widgets ?? {}) as object) } as Record<string, boolean>;
  const fieldKpiIds: string[] = dashConfig.field_kpi_ids ?? DEFAULT_FIELD_KPIS;
  const fieldWidgets = { my_lists: true, sitrep: true, recent_stops: true, ...((dashConfig.field_widgets ?? {}) as object) } as Record<string, boolean>;

  // Per-user KPI IDs (admin only)
  const rawKpiIds: string[] = (kpiPrefsResult.data as any)?.admin_kpi_ids ?? [];
  const adminKpiIds = rawKpiIds.length > 0 ? rawKpiIds : DEFAULT_ADMIN_KPIS;

  const hasNews = hasFeature(tenant.features, "news");

  // ── Admin layout ────────────────────────────────────────────────────────────
  if (crmUser.isAdmin) {
    return (
      <section style={{ maxWidth: 1100, margin: "0 auto", padding: "28px 24px", display: "flex", flexDirection: "column", gap: 20 }}>
        <style>{DASHBOARD_CSS}</style>

        <DashboardHeader tenantId={tenant.id} tenantName={tenantName} userName={userName} />

        <Suspense fallback={<KpiSkeleton count={adminKpiIds.length} />}>
          <KpiRow tenantId={tenant.id} kpiIds={adminKpiIds} />
        </Suspense>

        <Suspense fallback={null}>
          <AttentionNeeded tenantId={tenant.id} />
        </Suspense>

        {adminWidgets.pipeline && (
          <Suspense fallback={<SectionSkeleton rows={5} height={52} />}>
            <PipelineKanban tenantId={tenant.id} />
          </Suspense>
        )}

        {hasNews && adminWidgets.intel_brief && (
          <Suspense fallback={<SectionSkeleton rows={4} />}>
            <IntelBriefWidget tenantId={tenant.id} />
          </Suspense>
        )}

        {adminWidgets.active_lists && (
          <Suspense fallback={<SectionSkeleton rows={6} />}>
            <ActiveLists tenantId={tenant.id} />
          </Suspense>
        )}

        {adminWidgets.survey_progress && (
          <Suspense fallback={<SectionSkeleton rows={3} height={72} />}>
            <SurveyProgress tenantId={tenant.id} />
          </Suspense>
        )}

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
          {adminWidgets.recent_activity && (
            <Suspense fallback={<SectionSkeleton rows={8} height={32} />}>
              <RecentActivity tenantId={tenant.id} settings={settings} />
            </Suspense>
          )}
          {adminWidgets.sitrep && (
            <Suspense fallback={<SectionSkeleton rows={8} height={32} />}>
              <SitRepWidget tenantId={tenant.id} settings={settings} />
            </Suspense>
          )}
        </div>
      </section>
    );
  }

  // ── Field layout ────────────────────────────────────────────────────────────
  return (
    <section style={{ maxWidth: 860, margin: "0 auto", padding: "28px 24px", display: "flex", flexDirection: "column", gap: 20 }}>
      <style>{DASHBOARD_CSS}</style>

      <FieldHeader tenantId={tenant.id} userId={crmUser.userId} userName={userName} />

      <Suspense fallback={<KpiSkeleton count={fieldKpiIds.length} />}>
        <FieldKpiRow tenantId={tenant.id} userId={crmUser.userId} kpiIds={fieldKpiIds} />
      </Suspense>

      {fieldWidgets.my_lists && (
        <Suspense fallback={<SectionSkeleton rows={5} height={48} />}>
          <FieldLists tenantId={tenant.id} userId={crmUser.userId} />
        </Suspense>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        {fieldWidgets.sitrep && (
          <Suspense fallback={<SectionSkeleton rows={6} height={32} />}>
            <FieldSitRepWidget tenantId={tenant.id} userId={crmUser.userId} />
          </Suspense>
        )}
        {fieldWidgets.recent_stops && (
          <Suspense fallback={<SectionSkeleton rows={6} height={32} />}>
            <FieldRecentStops tenantId={tenant.id} userId={crmUser.userId} settings={settings} />
          </Suspense>
        )}
      </div>
    </section>
  );
}
