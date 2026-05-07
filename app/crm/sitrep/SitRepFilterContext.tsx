"use client";

import { createContext, useContext } from "react";
import { defaultContext, type CalendarContext, type SitRepView } from "@/lib/sitrep-calendar-filter";

export type SitRepFilterCtx = {
  context:         CalendarContext;
  onContextChange: (ctx: CalendarContext) => void;
  views:           SitRepView[];
  activeViewId:    string | null;
  onSelectView:    (id: string) => void;
  onViewsChanged:  () => Promise<void>;
};

export const SitRepFilterContext = createContext<SitRepFilterCtx | null>(null);

export function useSitRepFilter(): SitRepFilterCtx {
  const ctx = useContext(SitRepFilterContext);
  if (ctx) return ctx;
  // Fallback when used outside SitRepShell (e.g. embedded components)
  return {
    context:         defaultContext([], []),
    onContextChange: () => {},
    views:           [],
    activeViewId:    null,
    onSelectView:    () => {},
    onViewsChanged:  async () => {},
  };
}
