import Link from "next/link";
import { getFamilyByKey, SYSTEM_TYPE_FAMILIES } from "@/lib/sitrep-colors";
import { S, makeSb, isOverdue, sitrepEffectiveDate, fmtSitrepDate } from "./_helpers";

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

  if (items.length === 0) {
    return <p style={{ fontSize: 13, color: S.dim, fontStyle: "italic", margin: 0 }}>All clear. Nothing on your board.</p>;
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
      {items.map((item: any) => {
        const overdue = isOverdue(sitrepEffectiveDate(item));
        const sh = shades(item);
        const isConfirmed = item.status === "confirmed";
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
      })}
    </div>
  );
}
