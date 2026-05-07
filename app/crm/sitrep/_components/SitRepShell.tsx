"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  defaultContext, contextFromView, loadActiveViewId, saveActiveViewId,
  type CalendarContext, type SitRepView,
} from "@/lib/sitrep-calendar-filter";
import { SitRepFilterContext } from "../SitRepFilterContext";
import CalendarSwitcher from "../calendar/CalendarSwitcher";

type SquadInfo = { id: string; name: string; color: string; tenantId: string; role: string };
type OrgInfo   = { id: string; name: string };
type TypeInfo  = { slug: string; name: string; color: string };

const S = {
  bg:     "rgb(10 13 20)",
  border: "rgba(255,255,255,.07)",
  text:   "rgb(236 240 245)",
  dim:    "rgb(100 116 139)",
} as const;

const VIEWS = [
  { key: "list",     label: "List",     href: "/crm/sitrep" },
  { key: "kanban",   label: "Kanban",   href: "/crm/sitrep/kanban" },
  { key: "timeline", label: "Timeline", href: "/crm/sitrep/timeline" },
  { key: "calendar", label: "Calendar", href: "/crm/sitrep/calendar" },
] as const;

function NavBar({ sidebarOpen, onToggle }: { sidebarOpen: boolean; onToggle: () => void }) {
  const pathname = usePathname();
  const active =
    pathname.startsWith("/crm/sitrep/calendar") ? "calendar" :
    pathname.startsWith("/crm/sitrep/timeline") ? "timeline" :
    pathname.startsWith("/crm/sitrep/kanban")   ? "kanban"   : "list";

  return (
    <div style={{
      position: "sticky", top: 0, zIndex: 40,
      height: 48, flexShrink: 0,
      background: S.bg, borderBottom: `1px solid ${S.border}`,
      display: "flex", alignItems: "center", padding: "0 20px", gap: 16,
    }}>
      <span style={{ fontSize: 14, fontWeight: 800, color: S.text, letterSpacing: "0.04em", marginRight: 4 }}>
        SitRep
      </span>
      <div style={{ width: 1, height: 18, background: S.border }} />
      <div style={{
        display: "flex", background: "rgba(255,255,255,.06)",
        borderRadius: 10, padding: 3, gap: 2, border: `1px solid ${S.border}`,
      }}>
        {VIEWS.map((v) => (
          <Link key={v.key} href={v.href} style={{
            padding: "4px 14px", borderRadius: 7, fontSize: 12, fontWeight: 600,
            textDecoration: "none", transition: "background .12s, color .12s",
            background: active === v.key ? "rgba(255,255,255,.12)" : "transparent",
            color: active === v.key ? S.text : S.dim,
          }}>{v.label}</Link>
        ))}
      </div>
      <div style={{ marginLeft: "auto" }}>
        <button
          onClick={onToggle}
          title="Toggle filter sidebar"
          style={{
            padding: "4px 10px", borderRadius: 7, fontSize: 12, fontWeight: 600,
            background: sidebarOpen ? "rgba(99,102,241,.18)" : "rgba(255,255,255,.06)",
            border: `1px solid ${sidebarOpen ? "rgba(99,102,241,.35)" : S.border}`,
            color: sidebarOpen ? "#a5b4fc" : S.dim,
            cursor: "pointer",
          }}
        >Filters</button>
      </div>
    </div>
  );
}

export default function SitRepShell({
  initialViews,
  squads,
  tenantId,
  tenantName,
  currentUserId,
  allTypes,
  children,
}: {
  initialViews:  SitRepView[];
  squads:        SquadInfo[];
  tenantId:      string;
  tenantName:    string;
  currentUserId: string;
  allTypes:      TypeInfo[];
  children:      React.ReactNode;
}) {
  const [views, setViews]               = useState<SitRepView[]>(initialViews);
  const [activeViewId, setActiveViewId] = useState<string | null>(null);
  const [context, setContext]           = useState<CalendarContext>(() =>
    defaultContext([tenantId], squads.map((s) => s.id))
  );
  const [sidebarOpen, setSidebarOpen]   = useState(true);

  const orgs: OrgInfo[] = [{ id: tenantId, name: tenantName }];

  // Init active view from localStorage on mount
  useEffect(() => {
    const savedId = loadActiveViewId();
    const view =
      views.find((v) => v.id === savedId) ??
      views.find((v) => v.is_default) ??
      views[0];
    if (view) {
      setActiveViewId(view.id);
      setContext(contextFromView(view));
      saveActiveViewId(view.id);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function selectView(id: string) {
    const view = views.find((v) => v.id === id);
    if (!view) return;
    setActiveViewId(id);
    setContext(contextFromView(view));
    saveActiveViewId(id);
  }

  function handleContextChange(next: CalendarContext) {
    setContext(next);
    if (!activeViewId) return;
    fetch(`/api/crm/sitrep/views/${activeViewId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        toggle_state: {
          org_ids:      next.orgIds,
          squad_ids:    next.squadIds,
          personal:     next.personalOn,
          favorite_ids: next.favoriteIds,
          filters:      next.filters,
        },
      }),
    }).catch(() => {});
  }

  async function handleViewsChanged() {
    const res = await fetch("/api/crm/sitrep/views");
    if (!res.ok) return;
    const data: SitRepView[] = await res.json();
    setViews(data);
    const active = data.find((v) => v.id === activeViewId);
    if (active) setContext(contextFromView(active));
  }

  return (
    <SitRepFilterContext.Provider value={{
      context,
      onContextChange:  handleContextChange,
      views,
      activeViewId,
      onSelectView:     selectView,
      onViewsChanged:   handleViewsChanged,
    }}>
      <div style={{ display: "flex", flexDirection: "column", minHeight: "100vh", background: S.bg }}>
        <NavBar sidebarOpen={sidebarOpen} onToggle={() => setSidebarOpen((v) => !v)} />
        <div style={{ flex: 1, minHeight: 0, display: "flex", overflow: "hidden" }}>
          {sidebarOpen && (
            <CalendarSwitcher
              views={views}
              activeViewId={activeViewId}
              onSelectView={selectView}
              squads={squads}
              orgs={orgs}
              allTypes={allTypes}
              context={context}
              onContextChange={handleContextChange}
              onViewsChanged={handleViewsChanged}
            />
          )}
          <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column", overflow: "hidden" }}>
            {children}
          </div>
        </div>
      </div>
    </SitRepFilterContext.Provider>
  );
}
