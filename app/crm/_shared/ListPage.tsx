"use client";
import { useMemo, useState } from "react";

type Row = Record<string, any>;
type Column = { key: string; label: string; width?: number };

function SortArrow({ dir }: { dir: "asc" | "desc" }) {
  // simple chevron; flip for desc
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
}: {
  title: string;
  columns: Column[];
  rows: Row[];
}) {
  const [sortKey, setSortKey] = useState(columns[0]?.key);
  const [asc, setAsc] = useState(true);

  // at the top of ListPage (already importing useMemo)
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

    // Put null/undefined at the bottom
    if (av == null && bv != null) return 1 * (asc ? 1 : -1);
    if (av != null && bv == null) return -1 * (asc ? 1 : -1);

    // Number vs number: numeric compare
    if (typeof av === "number" && typeof bv === "number") {
      const cmp = av - bv;
      return asc ? cmp : -cmp;
    }

    // Everything else: natural, case-insensitive compare
    const cmp = collator.compare(String(av), String(bv));
    return asc ? cmp : -cmp;
  });

  return copy;
}, [rows, sortKey, asc, collator]);


  return (
    <section style={{ padding: 16 }}>
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
                const ariaSort = isSorted ? (asc ? "ascending" : "descending") : "none";
                return (
                  <th
                    key={c.key}
                    scope="col"
                    aria-sort={ariaSort as React.AriaAttributes["aria-sort"]}
                    style={{ textAlign: "left", padding: 0, width: c.width }}
                  >
                    <button
                      onClick={() => {
                        setAsc(c.key === sortKey ? !asc : true);
                        setSortKey(c.key);
                      }}
                      style={{
                        // button that looks like plain text
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
            {sorted.map((r) => (
              <tr key={r.id} style={{ borderTop: "1px solid rgba(255,255,255,.06)" }}>
                {columns.map((c) => (
                  <td key={c.key} style={{ padding: "10px 12px", fontSize: 14 }}>
                    {String(r[c.key] ?? "")}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}