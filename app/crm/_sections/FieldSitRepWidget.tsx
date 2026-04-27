import Link from "next/link";
import { getFamilyByKey, SYSTEM_TYPE_FAMILIES } from "@/lib/sitrep-colors";
import { S, card, sectionLabel, makeSb, isOverdue, sitrepEffectiveDate, fmtSitrepDate } from "./_helpers";

export async function FieldSitRepWidget({ tenantId, userId }: { tenantId: string; userId: string }) {
  const sb = makeSb(tenantId);

  const [{ data: itemsRaw }, { data: typesRaw }] = await Promise.all([
    sb.from("sitrep_items")
      .select("id, item_type, title, status, priority, due_date, start_at")
      .eq("tenant_id", tenantId)
      .eq("created_by", userId)
      .in("status", ["open", "in_progress", "confirmed"])
      .neq("visibility", "private")
      .order("due_date", { ascending: true, nullsFirst: false })
      .limit(8),
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

  const items: any[] = itemsRaw ?? [];

  function renderRow(item: any) {
    const overdue = isOverdue(sitrepEffectiveDate(item));
    const accent = shades(item)[2];
    const isConfirmed = item.status === "confirmed";
    const bg = isConfirmed ? shades(item)[1] + "33" : shades(item)[3] + "55";
    const textColor = isConfirmed ? S.text : "#0f172a";
    return (
      <Link key={item.id} href={`/crm/sitrep/${item.id}`} className="db-sitrep-row" style={{
        display: "flex", alignItems: "center", gap: 8,
        padding: "7px 10px", borderRadius: 7, textDecoration: "none",
        color: textColor, background: bg,
        boxShadow: `inset 3px 0 0 0 ${accent}, 0 1px 3px rgba(0,0,0,.08)`,
        "--accent": accent,
      } as React.CSSProperties}>
        <span style={{ flex: 1, fontSize: 13, fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.title}</span>
        <span style={{ fontSize: 11, fontWeight: 700, flexShrink: 0, color: overdue ? "#991b1b" : "#64748b" }}>
          {overdue ? "PAST DUE" : fmtSitrepDate(item)}
        </span>
      </Link>
    );
  }

  return (
    <div style={card}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
        <p style={{ ...sectionLabel, margin: 0 }}>📋 My SitRep</p>
        <Link href="/crm/sitrep" style={{ fontSize: 12, color: "var(--gg-primary, #2563eb)", textDecoration: "none" }}>Full SitRep →</Link>
      </div>
      {items.length === 0
        ? <p style={{ fontSize: 13, color: S.dim, fontStyle: "italic", margin: "4px 0" }}>All clear. Nothing on your board.</p>
        : <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>{items.map(renderRow)}</div>
      }
    </div>
  );
}
