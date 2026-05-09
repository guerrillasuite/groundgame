"use client";

import { useMemo, useState, useEffect } from "react";
import { filterItems } from "@/lib/sitrep-calendar-filter";
import { useSitRepFilter } from "../SitRepFilterContext";
import SitRepCalendar from "./SitRepCalendar";

type SitRepItem = Parameters<typeof SitRepCalendar>[0]["initialItems"][number];

export default function CalendarLayout({
  initialItems,
  missions,
  users,
  currentUserId,
  hasMissions,
  typeColors,
}: {
  initialItems:  SitRepItem[];
  missions:      any[];
  users:         { id: string; name: string; email: string }[];
  currentUserId: string;
  hasMissions:   boolean;
  typeColors:    Record<string, string>;
}) {
  const { context } = useSitRepFilter();
  const [overlayItems, setOverlayItems] = useState<SitRepItem[]>([]);

  // Fetch overlay items for toggled-on contacts
  useEffect(() => {
    const ids = context.favoriteIds ?? [];
    if (ids.length === 0) { setOverlayItems([]); return; }

    // Build a name map from the users array for labeling overlays
    const nameMap = new Map(users.map((u) => [u.id, u.name || u.email]));

    fetch(`/api/crm/sitrep/favorites/items?userIds=${ids.join(",")}`)
      .then((r) => r.ok ? r.json() : [])
      .then((data: any[]) => {
        setOverlayItems(
          (Array.isArray(data) ? data : []).map((item) => ({
            ...item,
            _is_overlay: true,
            _overlay_user_name: nameMap.get(item.created_by) ?? item.created_by,
            sitrep_assignments: item.sitrep_assignments ?? [],
          }))
        );
      })
      .catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(context.favoriteIds)]);

  const displayItems = useMemo(
    () => [
      ...filterItems(initialItems as any[], currentUserId, context),
      ...overlayItems,
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [initialItems, currentUserId, JSON.stringify(context), overlayItems]
  );

  return (
    <SitRepCalendar
      initialItems={displayItems}
      missions={missions}
      users={users}
      currentUserId={currentUserId}
      hasMissions={hasMissions}
      typeColors={typeColors}
    />
  );
}
