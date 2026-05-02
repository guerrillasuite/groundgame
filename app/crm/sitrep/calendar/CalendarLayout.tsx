"use client";

import { useCallback, useState } from "react";
import CalendarSwitcher, { type CalendarTypeData, type SharedViewData } from "./CalendarSwitcher";
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
  // By default all calendar types AND shared views are visible
  const [visibleTypeIds, setVisibleTypeIds] = useState<Set<string>>(
    () => new Set([
      ...calendarTypes.map((ct) => ct.id),
      ...sharedViews.map((sv) => sv.view_id),
    ])
  );
  const [calTypes, setCalTypes]  = useState<CalendarTypeData[]>(calendarTypes);
  const [sidebarOpen, setSidebarOpen] = useState(true);

  function toggleType(typeId: string) {
    setVisibleTypeIds((prev) => {
      const next = new Set(prev);
      next.has(typeId) ? next.delete(typeId) : next.add(typeId);
      return next;
    });
  }

  const refreshCalendarTypes = useCallback(async () => {
    const res = await fetch("/api/user/calendar-types");
    if (res.ok) {
      const data = await res.json();
      setCalTypes(data);
      // Re-apply visibility: keep existing visible, add any new ones
      setVisibleTypeIds((prev) => {
        const next = new Set(prev);
        data.forEach((ct: CalendarTypeData) => { if (!prev.has(ct.id)) next.add(ct.id); });
        return next;
      });
    }
  }, []);

  // Filter items based on visible calendar types.
  // Work calendars show tenant items; personal show personal (owner_user_id, no tenant_id).
  const visibleItems = initialItems.filter(() => {
    // If any Work calendar type is visible, show all tenant items
    const hasVisibleWork = calTypes
      .filter((ct) => visibleTypeIds.has(ct.id))
      .some((ct) => ct.sources.some((s) => s.type === "tenant" && s.tenant_id === tenantId));

    return hasVisibleWork;
  });

  // Show items when any work calendar OR any shared view is visible
  const workVisible = calTypes
    .filter((ct) => visibleTypeIds.has(ct.id))
    .some((ct) => ct.sources.some((s) => s.type === "tenant"));

  const sharedViewVisible = sharedViews.some((sv) => visibleTypeIds.has(sv.view_id));

  const displayItems = (workVisible || sharedViewVisible) ? initialItems : [];

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
