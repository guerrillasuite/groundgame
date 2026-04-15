"use client";

const TAGS = [
  { label: "First Name",       value: "{First_Name}" },
  { label: "Last Name",        value: "{Last_Name}" },
  { label: "Full Name",        value: "{Full_Name}" },
  { label: "Email Address",    value: "{Email}" },
  { label: "City",             value: "{City}" },
  { label: "State",            value: "{State}" },
  { label: "Unsubscribe Link", value: "{Unsubscribe_Link}" },
  { label: "Trackable Link",   value: "{Trackable_Link_URL}" },
];

export default function MergeTagPanel({ onInsert }: { onInsert: (tag: string) => void }) {
  return (
    <div
      style={{
        background: "var(--gg-card, white)",
        border: "1px solid var(--gg-border, #e5e7eb)",
        borderRadius: 10,
        padding: 16,
        minWidth: 200,
      }}
    >
      <p
        style={{
          margin: "0 0 10px",
          fontSize: 11,
          fontWeight: 700,
          textTransform: "uppercase",
          letterSpacing: "0.05em",
          color: "var(--gg-text-dim, #6b7280)",
        }}
      >
        Merge Tags
      </p>
      <div style={{ display: "grid", gap: 6 }}>
        {TAGS.map((tag) => (
          <button
            key={tag.value}
            type="button"
            onClick={() => onInsert(tag.value)}
            title={`Insert ${tag.value}`}
            style={{
              padding: "7px 10px",
              borderRadius: 6,
              border: "1px solid var(--gg-border, #e5e7eb)",
              background: "transparent",
              fontSize: 12,
              fontWeight: 500,
              cursor: "pointer",
              textAlign: "left",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              gap: 8,
            }}
          >
            <span>{tag.label}</span>
            <code
              style={{
                fontSize: 10,
                background: "rgba(37,99,235,0.08)",
                color: "var(--gg-primary, #2563eb)",
                padding: "2px 6px",
                borderRadius: 4,
                flexShrink: 0,
              }}
            >
              {tag.value}
            </code>
          </button>
        ))}
      </div>
      <p
        style={{
          margin: "12px 0 0",
          fontSize: 11,
          color: "var(--gg-text-dim, #6b7280)",
          lineHeight: 1.5,
        }}
      >
        Click to copy tag to clipboard. Paste it anywhere in your template.
      </p>
    </div>
  );
}
