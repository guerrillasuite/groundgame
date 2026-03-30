"use client";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

type Row = Record<string, any>;
type Column = { key: string; label: string; width?: number };

const PER_PAGE_OPTIONS = [25, 50, 100, 250, 500];

function SortArrow({ dir }: { dir: "asc" | "desc" }) {
  const rotate = dir === "asc" ? 180 : 0;
  return (
    <svg
      aria-hidden="true"
      width="10"
      height="10"
      viewBox="0 0 24 24"
      style={{ marginLeft: 6, transform: `rotate(${rotate}deg)` }}
    >
      <path
        d="M7 10l5 5 5-5"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export default function ListPage({
  title,
  columns,
  rows,
  rowHrefPrefix,
  rowColorKey,
}: {
  title: string;
  columns: Column[];
  rows: Row[];
  rowHrefPrefix?: string;
  rowColorKey?: string;
}) {
  const router = useRouter();
  const [sortKey, setSortKey] = useState(columns[0]?.key);
  const [asc, setAsc] = useState(true);
  const [page, setPage] = useState(0);
  const [perPage, setPerPage] = useState(100);

  const collator = useMemo(
    () => new Intl.Collator(undefined, { numeric: true, sensitivity: "base" }),
    []
  );

  const sorted = useMemo(() => {
    const copy = [...rows];
    copy.sort((a, b) => {
      const key = sortKey ?? "";
      const av = a[key] ?? "";
      const bv = b[key] ?? "";
      if (av == null && bv != null) return 1 * (asc ? 1 : -1);
      if (av != null && bv == null) return -1 * (asc ? 1 : -1);
      if (typeof av === "number" && typeof bv === "number") {
        const cmp = av - bv;
        return asc ? cmp : -cmp;
      }
      const cmp = collator.compare(String(av), String(bv));
      return asc ? cmp : -cmp;
    });
    return copy;
  }, [rows, sortKey, asc, collator]);

  const totalPages = Math.max(1, Math.ceil(sorted.length / perPage));
  const safePage = Math.min(page, totalPages - 1);
  const pageRows = sorted.slice(safePage * perPage, (safePage + 1) * perPage);

  const start = sorted.length === 0 ? 0 : safePage * perPage + 1;
  const end = Math.min((safePage + 1) * perPage, sorted.length);

  function handleSort(key: string) {
    setAsc(key === sortKey ? !asc : true);
    setSortKey(key);
    setPage(0);
  }

  const btnStyle = (disabled: boolean): React.CSSProperties => ({
    padding: "4px 10px",
    borderRadius: 6,
    border: "1px solid var(--gg-border, #e5e7eb)",
    background: "var(--gg-card, white)",
    color: disabled ? "var(--gg-text-dim, #9ca3af)" : "inherit",
    cursor: disabled ? "default" : "pointer",
    fontSize: 13,
  });

  return (
    <section style={{ padding: 16 }}>
      {rowHrefPrefix && <style>{`tr.list-row:hover td { background: var(--gg-bg, #f9fafb); }`}</style>}
      <h1 style={{ fontSize: 20, fontWeight: 700, marginBottom: 12 }}>{title}</h1>

      <div
        style={{
          overflow: "auto",
          borderRadius: "var(--radius)",
          border: "1px solid rgba(255,255,255,.08)",
        }}
      >
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              {columns.map((c) => {
                const isSorted = sortKey === c.key;
                return (
                  <th
                    key={c.key}
                    scope="col"
                    aria-sort={(isSorted ? (asc ? "ascending" : "descending") : "none") as React.AriaAttributes["aria-sort"]}
                    style={{ textAlign: "left", padding: 0, width: c.width }}
                  >
                    <button
                      onClick={() => handleSort(c.key)}
                      style={{
                        all: "unset",
                        cursor: "pointer",
                        display: "inline-flex",
                        alignItems: "center",
                        padding: "10px 12px",
                      }}
                    >
                      <span>{c.label}</span>
                      {isSorted ? <SortArrow dir={asc ? "asc" : "desc"} /> : null}
                    </button>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {pageRows.map((r, rowIdx) => {
              const color = rowColorKey ? r[rowColorKey] : undefined;
              return (
                <tr
                  key={r.id}
                  className={rowHrefPrefix ? "list-row" : undefined}
                  onClick={rowHrefPrefix ? () => router.push(rowHrefPrefix + r.id) : undefined}
                  style={{
                    borderTop: "1px solid rgba(255,255,255,.06)",
                    cursor: rowHrefPrefix ? "pointer" : undefined,
                    backgroundColor: color ? `${color}1f` : undefined,
                  }}
                >
                  {columns.map((c, colIdx) => (
                    <td
                      key={c.key}
                      style={{
                        padding: "10px 12px",
                        fontSize: 14,
                        borderLeft: colIdx === 0 && color ? `3px solid ${color}` : undefined,
                      }}
                    >
                      {String(r[c.key] ?? "")}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 12, gap: 12, flexWrap: "wrap" }}>
        <span style={{ fontSize: 13, opacity: 0.6 }}>
          {sorted.length === 0 ? "0 results" : `${start.toLocaleString()}–${end.toLocaleString()} of ${sorted.length.toLocaleString()}`}
        </span>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <select
            value={perPage}
            onChange={(e) => { setPerPage(Number(e.target.value)); setPage(0); }}
            style={{ padding: "4px 8px", borderRadius: 6, border: "1px solid var(--gg-border, #e5e7eb)", fontSize: 13, background: "var(--gg-card, white)" }}
          >
            {PER_PAGE_OPTIONS.map((n) => (
              <option key={n} value={n}>{n} / page</option>
            ))}
          </select>
          <button style={btnStyle(safePage === 0)} disabled={safePage === 0} onClick={() => setPage(0)}>«</button>
          <button style={btnStyle(safePage === 0)} disabled={safePage === 0} onClick={() => setPage(safePage - 1)}>‹</button>
          <button style={btnStyle(safePage >= totalPages - 1)} disabled={safePage >= totalPages - 1} onClick={() => setPage(safePage + 1)}>›</button>
          <button style={btnStyle(safePage >= totalPages - 1)} disabled={safePage >= totalPages - 1} onClick={() => setPage(totalPages - 1)}>»</button>
        </div>
      </div>
    </section>
  );
}
