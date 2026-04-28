import { getFamilyByKey, SYSTEM_TYPE_FAMILIES } from "@/lib/sitrep-colors";
import SitRepWidgetCalendar from "@/app/crm/components/SitRepWidgetCalendar";
import { S, makeSb, isOverdue, sitrepEffectiveDate, fmtSitrepDate, groupItems } from "./_helpers";
import Link from "next/link";

export async function SitRepWidget({ tenantId, settings }: { tenantId: string; settings: any }) {
  const sb = makeSb(tenantId);

  const wCfg = {
    show_types:            (settings?.sitrep_widget?.show_types            ?? [])        as string[],
    sort_by:               (settings?.sitrep_widget?.sort_by               ?? "due_date") as string,
    sort_dir:              (settings?.sitrep_widget?.sort_dir              ?? "asc")      as string,
    group_by:              (settings?.sitrep_widget?.group_by              ?? "none")     as string,
    max_items:             (settings?.sitrep_widget?.max_items             ?? 10)         as number,
    widget_view:           (settings?.sitrep_widget?.widget_view           ?? "list")     as string,
    calendar_default_view: (settings?.sitrep_widget?.calendar_default_view ?? "week")    as string,
  };
  const wIsCalendar = wCfg.widget_view === "calendar";
  const wDbSort = wIsCalendar || wCfg.sort_by === "priority" ? "created_at" : wCfg.sort_by;
  const wAsc    = wIsCalendar ? false : wCfg.sort_dir === "asc";
  const wLimit  = wIsCalendar ? 100 : wCfg.max_items;

  let q: any = sb.from("sitrep_items")
    .select("id, item_type, title, status, priority, due_date, start_at")
    .eq("tenant_id", tenantId)
    .in("status", ["open", "in_progress", "confirmed"])
    .neq("visibility", "private");
  if (wCfg.show_types.length > 0) q = q.in("item_type", wCfg.show_types);
  q = q.order(wDbSort, { ascending: wAsc, nullsFirst: false }).limit(wLimit);

  const [{ data: itemsRaw }, { data: typesRaw }] = await Promise.all([
    q,
    sb.from("sitrep_item_types").select("slug, color").eq("tenant_id", tenantId),
  ]);

  const familyMap: Record<string, string[]> = {};
  for (const t of (typesRaw ?? []) as any[]) {
    const fam = getFamilyByKey(t.color) ?? getFamilyByKey(SYSTEM_TYPE_FAMILIES[t.slug] ?? "blue")!;
    familyMap[t.slug] = fam.shades as unknown as string[];
  }

  function shades(item: any): string[] {
    return familyMap[item.item_type]
      ?? (getFamilyByKey(SYSTEM_TYPE_FAMILIES[item.item_type] ?? "blue")!.shades as unknown as string[]);
  }

  const typeAccents: Record<string, string> = {};
  for (const slug of [...Object.keys(familyMap), "task", "event", "meeting"]) {
    typeAccents[slug] = shades({ item_type: slug })[2];
  }

  let items: any[] = [...(itemsRaw ?? [])];
  if (wCfg.sort_by === "priority") {
    const PRIO: Record<string, number> = { high: 0, medium: 1, low: 2 };
    items.sort((a, b) => {
      const pa = PRIO[a.priority] ?? 3; const pb = PRIO[b.priority] ?? 3;
      return wCfg.sort_dir === "asc" ? pa - pb : pb - pa;
    });
  }
  const groups = groupItems(items, wCfg.group_by);

  function renderRow(item: any) {
    const overdue = isOverdue(sitrepEffectiveDate(item));
    const sh = shades(item);
    const isConfirmed = item.status === "confirmed";
    // Match sitrep screen: active = light pastel bg + dark text; confirmed = dark bg + light text
    const bg      = isConfirmed ? sh[1] : sh[3];
    const accent  = isConfirmed ? sh[0] : sh[2];
    const textCol = isConfirmed ? S.text : "#0f172a";
    return (
      <Link key={item.id} href={`/crm/sitrep/${item.id}`} className="db-sitrep-row" style={{
        display: "flex", alignItems: "center", gap: 8,
        padding: "7px 10px", borderRadius: 7, textDecoration: "none",
        color: textCol, background: bg,
        boxShadow: `inset 3px 0 0 0 ${accent}, 0 1px 3px rgba(0,0,0,.12)`,
        "--accent": accent,
      } as React.CSSProperties}>
        <span style={{ flex: 1, fontSize: 13, fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.title}</span>
        <span style={{ fontSize: 11, fontWeight: 700, flexShrink: 0, color: overdue ? "#ef4444" : isConfirmed ? "rgba(255,255,255,.55)" : "#475569" }}>
          {overdue ? "PAST DUE" : fmtSitrepDate(item)}
        </span>
      </Link>
    );
  }

  if (wIsCalendar) {
    return <SitRepWidgetCalendar items={items} typeAccents={typeAccents} defaultView={wCfg.calendar_default_view as any} />;
  }

  if (items.length === 0) {
    return <p style={{ fontSize: 13, color: S.dim, fontStyle: "italic", margin: 0 }}>All clear. Nothing on the board.</p>;
  }

  if (groups) {
    return (
      <>{groups.map(({ label, items: grp }) => (
        <div key={label} style={{ marginBottom: 8 }}>
          <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: S.dim, marginBottom: 4, paddingLeft: 2 }}>{label}</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>{grp.map(renderRow)}</div>
        </div>
      ))}</>
    );
  }

  return <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>{items.map(renderRow)}</div>;
}
