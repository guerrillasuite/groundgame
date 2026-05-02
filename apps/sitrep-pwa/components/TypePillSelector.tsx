"use client";

import { getFamilyByKey } from "@/lib/sitrep-colors";

export type ItemType = {
  id: string;
  name: string;
  slug: string;
  color: string;
};

interface TypePillSelectorProps {
  types: ItemType[];
  value: string;
  onChange: (slug: string) => void;
}

export default function TypePillSelector({ types, value, onChange }: TypePillSelectorProps) {
  return (
    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
      {types.map((t) => {
        const family = getFamilyByKey(t.color);
        const accent = family?.shades[2] ?? "#3b82f6";
        const active = value === t.slug;
        return (
          <button
            key={t.slug}
            onClick={() => onChange(t.slug)}
            style={{
              padding: "5px 13px",
              borderRadius: 20,
              fontSize: 12,
              fontWeight: 600,
              cursor: "pointer",
              border: active
                ? `1px solid ${accent}88`
                : "1px solid rgba(255,255,255,.1)",
              background: active
                ? `${accent}22`
                : "rgba(255,255,255,.04)",
              color: active ? accent : "rgb(100 116 139)",
              transition: "all .15s",
            }}
          >
            {t.name}
          </button>
        );
      })}
    </div>
  );
}
