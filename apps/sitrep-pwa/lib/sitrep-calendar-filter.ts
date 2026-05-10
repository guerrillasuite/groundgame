/**
 * Unified SitRep calendar filter — PWA copy.
 * Canonical source: lib/sitrep-calendar-filter.ts (root)
 * Keep these two files in sync. Do not diverge.
 */

export type ViewFilters = {
  item_types:     string[];
  statuses:       string[];
  show_completed: boolean;
};

export type CalendarContext = {
  orgIds:      string[];
  squadIds:    string[];
  personalOn:  boolean;
  favoriteIds: string[];
  filters:     ViewFilters;
};

export type ItemLike = {
  tenant_id?:          string | null;
  squad_id?:           string | null;
  visibility?:         string | null;
  created_by?:         string | null;
  item_type?:          string | null;
  status?:             string | null;
  sitrep_assignments?: { user_id: string; role: string }[];
};

export type SquadData = {
  id:         string;
  name:       string;
  color:      string;
  is_default: boolean;
  sort_order: number;
  role:       "owner" | "collaborator" | "viewer";
};

export type FavoriteData = {
  id:               string;
  favorite_user_id: string;
  detail_level:     "busy" | "basic" | "full";
  sort_order:       number;
  name?:            string;
};

export type SitRepView = {
  id:           string;
  name:         string;
  toggle_state: {
    org_ids:      string[];
    squad_ids:    string[];
    personal:     boolean;
    favorite_ids: string[];
    filters:      ViewFilters;
  };
  is_default:  boolean;
  sort_order:  number;
};

const TERMINAL_STATUSES = ["done", "cancelled"];

export function isAssigned(item: ItemLike, userId: string): boolean {
  return (
    item.created_by === userId ||
    (item.sitrep_assignments ?? []).some((a) => a.user_id === userId)
  );
}

function effectiveVisibility(item: ItemLike): string {
  return item.visibility ?? "team";
}

function passesFilters(item: ItemLike, filters: ViewFilters): boolean {
  if (filters.item_types.length > 0 && item.item_type) {
    if (!filters.item_types.includes(item.item_type)) return false;
  }
  if (filters.statuses.length > 0 && item.status) {
    if (!filters.statuses.includes(item.status)) return false;
  }
  if (filters.show_completed === false && item.status) {
    if (TERMINAL_STATUSES.includes(item.status)) return false;
  }
  return true;
}

export function isItemVisible(item: ItemLike, userId: string, context: CalendarContext): boolean {
  const vis = effectiveVisibility(item);

  if (!passesFilters(item, context.filters)) return false;

  if (vis === "private") {
    if (!context.personalOn) return false;
    return item.created_by === userId;
  }

  if (!item.tenant_id && !item.squad_id) {
    return context.personalOn;
  }

  if (item.squad_id) {
    if (!context.squadIds.includes(item.squad_id)) return false;
    if (vis === "assignee_only") return isAssigned(item, userId);
    return true;
  }

  if (item.tenant_id) {
    if (!context.orgIds.includes(item.tenant_id)) return false;
    if (vis === "assignee_only") return isAssigned(item, userId);
    return true;
  }

  return false;
}

export function filterItems<T extends ItemLike>(
  items: T[],
  userId: string,
  context: CalendarContext,
): T[] {
  return items.filter((item) => isItemVisible(item, userId, context));
}

export function contextFromView(view: SitRepView): CalendarContext {
  const ts = view.toggle_state;
  return {
    orgIds:      ts.org_ids      ?? [],
    squadIds:    ts.squad_ids    ?? [],
    personalOn:  ts.personal     ?? false,
    favoriteIds: ts.favorite_ids ?? [],
    filters: {
      item_types:     ts.filters?.item_types     ?? [],
      statuses:       ts.filters?.statuses        ?? [],
      show_completed: ts.filters?.show_completed  ?? true,
    },
  };
}

export function defaultContext(orgIds: string[], squadIds: string[]): CalendarContext {
  return {
    orgIds,
    squadIds,
    personalOn: true,
    favoriteIds: [],
    filters: { item_types: [], statuses: [], show_completed: true },
  };
}

const LS_ACTIVE_VIEW_KEY = "sitrep_active_view_id";

export function loadActiveViewId(): string | null {
  try {
    return typeof window !== "undefined" ? localStorage.getItem(LS_ACTIVE_VIEW_KEY) : null;
  } catch { return null; }
}

export function saveActiveViewId(id: string): void {
  try {
    if (typeof window !== "undefined") localStorage.setItem(LS_ACTIVE_VIEW_KEY, id);
  } catch { /* ignore */ }
}
