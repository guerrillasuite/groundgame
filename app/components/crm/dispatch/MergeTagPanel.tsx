"use client";

const TAGS = [
  { label: "First Name",       value: "{First_Name}" },
  { label: "Last Name",        value: "{Last_Name}" },
  { label: "Full Name",        value: "{Full_Name}" },
  { label: "Email Address",    value: "{Email}" },
  { label: "City",             value: "{City}" },
  { label: "State",            value: "{State}" },
  { label: "Person ID",        value: "{Person_ID}" },
  { label: "Unsubscribe Link", value: "{Unsubscribe_Link}" },
  { label: "Trackable Link",   value: "{Trackable_Link_URL}" },
];

export default function MergeTagPanel({ onInsert }: { onInsert: (tag: string) => void }) {
  return (
    <div
      style={{
        background: "var(--gg-card, rgb(16 19 27))",
        border: "1px solid var(--gg-border, rgb(34 40 55))",
        borderRadius: 10,
        padding: 16,
        minWidth: 180,
      }}
    >
      <p
        style={{
          margin: "0 0 10px",
          fontSize: 11,
          fontWeight: 700,
          textTransform: "uppercase",
          letterSpacing: "0.05em",
          color: "rgb(var(--text-300))",
        }}
      >
        Merge Tags
      </p>
      <div style={{ display: "grid", gap: 5 }}>
        {TAGS.map((tag) => (
          <button
            key={tag.value}
            type="button"
            className="gg-btn-tag"
            onClick={() => onInsert(tag.value)}
            title={`Insert ${tag.value}`}
          >
            <span style={{ fontSize: 12, fontWeight: 600, lineHeight: 1.3 }}>
              {tag.label}
            </span>
            <code
              style={{
                fontSize: 10,
                background: "rgba(37,99,235,0.15)",
                color: "rgb(var(--primary-500))",
                padding: "1px 5px",
                borderRadius: 4,
                alignSelf: "flex-start",
                wordBreak: "break-all",
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
          color: "rgb(var(--text-300))",
          lineHeight: 1.5,
        }}
      >
        Click to copy tag to clipboard. Paste it anywhere in your template.
      </p>
    </div>
  );
}
