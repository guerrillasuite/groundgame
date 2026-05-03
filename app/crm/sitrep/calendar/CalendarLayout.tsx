"use client";

import { useCallback, useState } from "react";
import CalendarSwitcher, { type CalendarTypeData, type SharedViewData } from "./CalendarSwitcher";
import { filterByVisibleCalendars, loadVisibleIds, saveVisibleIds } from "@/lib/sitrep-calendar-filter";
import SitRepCalendar from "./SitRepCalendar";

type SitRepItem = Parameters<typeof SitRepCalendar>[0]["initialItems"][number];

export default function CalendarLayout({
  initialItems,
  missions,
  users,
  currentUserId,
  hasMissions,
  typeColors,
  calendarTypes,
  tenantId,
  sharedViews = [],
}: {
  initialItems:   SitRepItem[];
  missions:       any[];
  users:          { id: string; name: string; email: string }[];
  currentUserId:  string;
  hasMissions:    boolean;
  typeColors:     Record<string, string>;
  calendarTypes:  CalendarTypeData[];
  tenantId:       string;
  sharedViews?:   SharedViewData[];
}) {
  const allIds = [
    ...calendarTypes.map((ct) => ct.id),
    ...sharedViews.map((sv) => sv.view_id),
  ];

  const [visibleTypeIds, setVisibleTypeIds] = useState<Set<string>>(
    () => loadVisibleIds(allIds)
  );
  const [calTypes, setCalTypes]   = useState<CalendarTypeData[]>(calendarTypes);
  const [sidebarOpen, setSidebarOpen] = useState(true);

  function toggleType(typeId: string) {
    setVisibleTypeIds((prev) => {
      const next = new Set(prev);
      next.has(typeId) ? next.delete(typeId) : next.add(typeId);
      saveVisibleIds([...calTypes.map((c) => c.id), ...sharedViews.map((s) => s.view_id)], next);
      return next;
    });
  }

  const refreshCalendarTypes = useCallback(async () => {
    const res = await fetch("/api/user/calendar-types");
    if (res.ok) {
      const data: CalendarTypeData[] = await res.json();
      setCalTypes(data);
      const newIds = data.map((ct) => ct.id);
      setVisibleTypeIds((prev) => {
        const updated = loadVisibleIds([...newIds, ...sharedViews.map((s) => s.view_id)]);
        return updated;
      });
    }
  }, [sharedViews]);

  // CRM shared view items arrive pre-tagged with _source_tenant_id.
  // Convert to the shape filterByVisibleCalendars expects (type_sources).
  const sharedViewsForFilter = sharedViews.map((sv) => ({
    ...sv,
    type_sources: (sv as any).type_sources ?? [],
  }));

  // Cross-tenant items (_source_tenant_id set) show when the matching shared view is visible.
  // Own-tenant items go through isItemInCalendar as normal.
  const anySharedVisible = sharedViews.some((sv) => visibleTypeIds.has(sv.view_id));

  const displayItems = initialItems.filter((item) => {
    if ((item as any)._source_tenant_id) {
      return anySharedVisible;
    }
    return filterByVisibleCalendars([item], calTypes as any, sharedViewsForFilter as any, visibleTypeIds, currentUserId).length > 0;
  });

  return (
    <div style={{ display: "flex", height: "100vh", overflow: "hidden", background: "rgb(10 13 20)" }}>
      {/* Sidebar toggle button */}
      <button
        onClick={() => setSidebarOpen((v) => !v)}
        title={sidebarOpen ? "Hide calendar list" : "Show calendar list"}
        style={{
          position: "absolute", left: sidebarOpen ? 220 : 0, top: "50%", zIndex: 20,
          transform: "translateY(-50%)",
          width: 16, height: 48, background: "rgb(22 28 40)",
          border: "1px solid rgba(255,255,255,.07)", borderLeft: "none",
          borderRadius: "0 6px 6px 0", cursor: "pointer", color: "rgb(100 116 139)",
          fontSize: 10, display: "flex", alignItems: "center", justifyContent: "center",
          transition: "left .15s",
        }}
      >
        {sidebarOpen ? "‹" : "›"}
      </button>

      {/* Calendar switcher sidebar */}
      {sidebarOpen && (
        <CalendarSwitcher
          calendarTypes={calTypes}
          visibleTypeIds={visibleTypeIds}
          onToggleType={toggleType}
          onTypesChanged={refreshCalendarTypes}
          sharedViews={sharedViews}
        />
      )}

      {/* Main calendar */}
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
