"use client";

import { useEffect, useState } from "react";
import {
  filterItems,
  defaultContext,
  contextFromView,
  loadActiveViewId,
  saveActiveViewId,
  type CalendarContext,
  type SitRepView,
} from "@/lib/sitrep-calendar-filter";
import CalendarSwitcher from "./CalendarSwitcher";
import SitRepCalendar from "./SitRepCalendar";

type SitRepItem = Parameters<typeof SitRepCalendar>[0]["initialItems"][number];

type SquadInfo = { id: string; name: string; color: string; tenantId: string; role: string };

export default function CalendarLayout({
  initialItems,
  missions,
  users,
  currentUserId,
  hasMissions,
  typeColors,
  tenantId,
  views: initialViews,
  squads,
}: {
  initialItems:   SitRepItem[];
  missions:       any[];
  users:          { id: string; name: string; email: string }[];
  currentUserId:  string;
  hasMissions:    boolean;
  typeColors:     Record<string, string>;
  tenantId:       string;
  views:          SitRepView[];
  squads:         SquadInfo[];
}) {
  const [views, setViews]           = useState<SitRepView[]>(initialViews);
  const [activeViewId, setActiveViewId] = useState<string | null>(null);
  const [context, setContext]       = useState<CalendarContext>(() =>
    defaultContext([tenantId], squads.map((s) => s.id))
  );
  const [sidebarOpen, setSidebarOpen] = useState(true);

  // Init active view from localStorage or first default
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

  // Immediate filter update + fire-and-forget save
  function handleContextChange(next: CalendarContext) {
    setContext(next);
    if (!activeViewId) return;
    const toggle_state = {
      org_ids:      next.orgIds,
      squad_ids:    next.squadIds,
      personal:     next.personalOn,
      favorite_ids: next.favoriteIds,
      filters:      next.filters,
    };
    fetch(`/api/crm/sitrep/views/${activeViewId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ toggle_state }),
    }).catch(() => {});
  }

  async function handleViewsChanged() {
    const res = await fetch("/api/crm/sitrep/views");
    if (!res.ok) return;
    const data: SitRepView[] = await res.json();
    setViews(data);
    // Re-sync context if active view changed
    const active = data.find((v) => v.id === activeViewId);
    if (active) setContext(contextFromView(active));
  }

  const displayItems = filterItems(initialItems as any[], currentUserId, context);

  return (
    <div style={{ display: "flex", height: "100%", overflow: "hidden", background: "rgb(10 13 20)" }}>
      {/* Sidebar toggle */}
      <button
        onClick={() => setSidebarOpen((v) => !v)}
        title={sidebarOpen ? "Hide sidebar" : "Show sidebar"}
        style={{
          position: "absolute", left: sidebarOpen ? 220 : 0, top: "calc(50% - 24px)", zIndex: 20,
          width: 16, height: 48, background: "rgb(22 28 40)",
          border: "1px solid rgba(255,255,255,.07)", borderLeft: "none",
          borderRadius: "0 6px 6px 0", cursor: "pointer", color: "rgb(100 116 139)",
          fontSize: 10, display: "flex", alignItems: "center", justifyContent: "center",
          transition: "left .15s",
        }}
      >
        {sidebarOpen ? "‹" : "›"}
      </button>

      {sidebarOpen && (
        <CalendarSwitcher
          views={views}
          activeViewId={activeViewId}
          onSelectView={selectView}
          squads={squads}
          tenantId={tenantId}
          context={context}
          onContextChange={handleContextChange}
          onViewsChanged={handleViewsChanged}
        />
      )}

      <div style={{ flex: 1, overflow: "auto", minWidth: 0 }}>
        <SitRepCalendar
          initialItems={displayItems}
          missions={missions}
          users={users}
          currentUserId={currentUserId}
          hasMissions={hasMissions}
          typeColors={typeColors}
        />
      </div>
    </div>
  );
}
