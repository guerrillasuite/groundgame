// Shared date utilities for timezone-safe date handling.
// All comparisons use local dates extracted from UTC ISO strings
// so they behave correctly for users in non-UTC timezones.

function pad(n: number) { return String(n).padStart(2, "0"); }

/** Today's date as "YYYY-MM-DD" in the user's LOCAL timezone */
export function todayStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Extract local "YYYY-MM-DD" from any UTC ISO string or date-only string.
 *  Date-only strings (no "T") are treated as local midnight, not UTC midnight,
 *  because JS's new Date("YYYY-MM-DD") returns UTC midnight which shifts the
 *  date backwards by the UTC offset in negative-offset timezones. */
export function localDateStr(iso: string): string {
  const d = new Date(iso.includes("T") ? iso : iso + "T00:00:00");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Convert datetime-local input value (local time) → UTC ISO string for storage */
export function localToUtcIso(local: string): string {
  return new Date(local).toISOString();
}

/** Convert UTC ISO string → datetime-local input value (local time).
 *  Date-only strings are treated as local midnight for the same reason as localDateStr. */
export function utcToDatetimeLocal(iso: string): string {
  const d = new Date(iso.includes("T") ? iso : iso + "T00:00:00");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Add N days to a "YYYY-MM-DD" string, returns new "YYYY-MM-DD" */
export function addDays(ds: string, n: number): string {
  const d = new Date(ds + "T00:00:00");
  d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** True if the ISO string has an explicit non-midnight time component */
export function hasExplicitTime(s: string | null | undefined): boolean {
  if (!s || !s.includes("T")) return false;
  const t = s.split("T")[1] ?? "";
  return !t.startsWith("00:00");
}

/** For tasks: due_date. For events/meetings: start_at ?? due_date */
export function effectiveDate(item: { item_type: string; due_date: string | null; start_at?: string | null }): string | null {
  if (item.item_type === "task") return item.due_date;
  return (item as any).start_at ?? item.due_date;
}

/** Format a local date string relative to today */
export function fmtRelativeDate(ds: string): string {
  const today    = todayStr();
  const tomorrow = addDays(today, 1);
  if (ds === today)    return "Today";
  if (ds === tomorrow) return "Tomorrow";
  const d = new Date(ds + "T00:00:00");
  const opts: Intl.DateTimeFormatOptions = { month: "short", day: "numeric" };
  if (d.getFullYear() !== new Date().getFullYear()) opts.year = "numeric";
  return d.toLocaleDateString("en-US", opts);
}

/** Format a time from a UTC ISO string in the given IANA timezone */
export function fmtTime(iso: string, tz?: string): string {
  return new Date(iso).toLocaleTimeString("en-US", {
    hour: "numeric", minute: "2-digit", hour12: true,
    ...(tz ? { timeZone: tz } : {}),
  });
}

/** Full label for an item's due/start date, with optional time */
export function fmtItemDate(
  item: { item_type: string; due_date: string | null; start_at?: string | null; end_at?: string | null; is_all_day?: boolean | null },
  tz?: string
): string {
  const ed = effectiveDate(item);
  if (!ed) return "";
  const ds = ed.includes("T") ? localDateStr(ed) : ed;
  const label = fmtRelativeDate(ds);

  const showTime =
    item.item_type !== "task" &&
    hasExplicitTime((item as any).start_at) &&
    !item.is_all_day;
  const timeLabel = showTime ? ` · ${fmtTime((item as any).start_at!, tz)}` : "";

  return label + timeLabel;
}
