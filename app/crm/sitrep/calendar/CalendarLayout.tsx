"use client";

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
  const displayItems = filterItems(initialItems as any[], currentUserId, context);

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
