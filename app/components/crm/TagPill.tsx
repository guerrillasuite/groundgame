"use client";

interface TagPillProps {
  name: string;
  onRemove?: () => void;
  disabled?: boolean;
}

export function TagPill({ name, onRemove, disabled }: TagPillProps) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "4px",
        padding: "2px 8px",
        borderRadius: "9999px",
        fontSize: "0.75rem",
        fontWeight: 500,
        background: "color-mix(in srgb, var(--gg-primary, #2563eb) 18%, transparent)",
        color: "var(--gg-primary, #2563eb)",
        border: "1px solid color-mix(in srgb, var(--gg-primary, #2563eb) 30%, transparent)",
        whiteSpace: "nowrap",
      }}
    >
      {name}
      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          disabled={disabled}
          aria-label={`Remove tag ${name}`}
          style={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            width: "14px",
            height: "14px",
            borderRadius: "50%",
            border: "none",
            background: "transparent",
            cursor: disabled ? "not-allowed" : "pointer",
            color: "inherit",
            padding: 0,
            lineHeight: 1,
            opacity: disabled ? 0.5 : 1,
          }}
        >
          ×
        </button>
      )}
    </span>
  );
}
