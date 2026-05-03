/**
 * Shared calendar visibility filter logic for SitRep PWA.
 * Rule table:
 *   work/family  – source tenant match + visibility in {team, assignee_only*}  (* if user assigned)
 *   personal     – any tenant, visibility=private, created_by=userId
 *   custom       – source tenant match + same as work + apply default view filter_config
 *   shared view  – source tenant match (view owner's), visibility in {team, assignee_only*}
 */

export type CalendarSource = { type: string; tenant_id?: string };

export type CalendarViewConfig = {
  id:         string;
  name:       string;
  color:      string | null;
  is_default: boolean;
  sort_order: number;
  filter_config?: {
    assignee_filter?: "me" | "all" | string[];
    item_type_slugs?: string[];
    stage_slugs?:     string[];
    show_terminal?:   boolean;
  };
};

export type CalendarTypeData = {
  id:         string;
  name:       string;
  color:      string;
  cal_type:   "work" | "family" | "personal" | "custom";
  sources:    CalendarSource[];
  sort_order: number;
  user_calendar_views: CalendarViewConfig[];
};

export type SharedViewData = {
  share_id:      string;
  role:          "viewer" | "editor";
  view_id:       string;
  view_name:     string;
  view_color:    string | null;
  type_id:       string;
  type_name:     string;
  type_color:    string;
  type_sources:  CalendarSource[];
  owner_user_id: string;
  owner_name:    string;
};

type ItemLike = {
  tenant_id?:          string;
  visibility?:         string;
  created_by?:         string;
  status?:             string | null;
  item_type?:          string;
  sitrep_assignments?: { user_id: string; role: string }[];
};

function isAssigned(item: ItemLike, userId: string): boolean {
  return (
    item.created_by === userId ||
    (item.sitrep_assignments ?? []).some((a) => a.user_id === userId)
  );
}

function matchesFilterConfig(item: ItemLike, calType: CalendarTypeData, userId: string): boolean {
  const defaultView =
    (calType.user_calendar_views ?? []).find((v) => v.is_default) ??
    (calType.user_calendar_views ?? [])[0];
  if (!defaultView?.filter_config) return true;
  const fc = defaultView.filter_config;

  if (fc.item_type_slugs?.length && item.item_type) {
    if (!fc.item_type_slugs.includes(item.item_type)) return false;
  }
  if (fc.stage_slugs?.length && item.status) {
    if (!fc.stage_slugs.includes(item.status)) return false;
  }
  if (fc.show_terminal === false) {
    if (item.status === "done" || item.status === "cancelled") return false;
  }
  if (fc.assignee_filter === "me") {
    if (!isAssigned(item, userId)) return false;
  } else if (Array.isArray(fc.assignee_filter) && fc.assignee_filter.length > 0) {
    const allowed = new Set(fc.assignee_filter);
    const hasMatch = (item.sitrep_assignments ?? []).some((a) => allowed.has(a.user_id));
    if (!hasMatch) return false;
  }
  return true;
}

export function isItemInCalendar(item: ItemLike, calType: CalendarTypeData, userId: string): boolean {
  const sources = calType.sources ?? [];

  if (calType.cal_type === "personal") {
    return item.visibility === "private" && item.created_by === userId;
  }

  // work / family / custom: item must come from a source tenant.
  // Empty sources = unconfigured calendar; treat as "any tenant" so items don't vanish.
  const inSource = sources.length === 0 || sources.some(
    (s) => s.type === "tenant" && s.tenant_id === item.tenant_id
  );
  if (!inSource) return false;

  // Private items never appear in work/custom calendars
  if (item.visibility === "private") return false;

  // Team items are visible to everyone — never filter by assignee
  if (item.visibility === "team") return true;

  if (item.visibility === "assignee_only" || !item.visibility) {
    if (!isAssigned(item, userId)) return false;
    return calType.cal_type === "custom" ? matchesFilterConfig(item, calType, userId) : true;
  }

  return false;
}

export function isItemInSharedView(item: ItemLike, sv: SharedViewData, userId: string): boolean {
  const inSource = (sv.type_sources ?? []).some(
    (s) => s.type === "tenant" && s.tenant_id === item.tenant_id
  );
  if (!inSource) return false;
  if (item.visibility === "private") return false;
  if (item.visibility === "team") return true;
  if (item.visibility === "assignee_only" || !item.visibility) {
    return isAssigned(item, userId);
  }
  return false;
}

export function filterByVisibleCalendars<T extends ItemLike>(
  items: T[],
  calTypes: CalendarTypeData[],
  sharedViews: SharedViewData[],
  visibleTypeIds: Set<string>,
  userId: string,
): T[] {
  if (calTypes.length === 0 && sharedViews.length === 0) return items;

  return items.filter((item) => {
    for (const ct of calTypes) {
      if (visibleTypeIds.has(ct.id) && isItemInCalendar(item, ct, userId)) return true;
    }
    for (const sv of sharedViews) {
      if (visibleTypeIds.has(sv.view_id) && isItemInSharedView(item, sv, userId)) return true;
    }
    return false;
  });
}

// ── localStorage persistence ───────────────────────────────────────────────────
// Store the set of HIDDEN type/view IDs. New IDs not in hiddenSet default to visible.

const LS_KEY = "sitrep_cal_hidden";

export function loadVisibleIds(allIds: string[]): Set<string> {
  try {
    const raw = typeof window !== "undefined" ? localStorage.getItem(LS_KEY) : null;
    if (!raw) return new Set(allIds);
    const hidden: string[] = JSON.parse(raw);
    const hiddenSet = new Set(hidden);
    return new Set(allIds.filter((id) => !hiddenSet.has(id)));
  } catch {
    return new Set(allIds);
  }
}

export function saveVisibleIds(allIds: string[], visibleIds: Set<string>): void {
  try {
    if (typeof window !== "undefined") {
      const hidden = allIds.filter((id) => !visibleIds.has(id));
      localStorage.setItem(LS_KEY, JSON.stringify(hidden));
    }
  } catch { /* ignore */ }
}
