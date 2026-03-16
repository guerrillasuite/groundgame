"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";

export default function DeleteListButton({ id, name }: { id: string; name: string }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleDelete(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (!confirming) { setConfirming(true); return; }
    setLoading(true);
    try {
      await fetch(`/api/crm/lists/${id}`, { method: "DELETE" });
      router.refresh();
    } finally {
      setLoading(false);
      setConfirming(false);
    }
  }

  function handleBlur() {
    setTimeout(() => setConfirming(false), 200);
  }

  return (
    <button
      onClick={handleDelete}
      onBlur={handleBlur}
      title={confirming ? `Click again to delete "${name}"` : "Delete list"}
      style={{
        padding: "5px 10px",
        border: "1px solid var(--gg-border, #e5e7eb)",
        borderRadius: 6,
        background: confirming ? "#fef2f2" : "var(--gg-bg, #fff)",
        color: confirming ? "#dc2626" : "var(--gg-text-dim, #9ca3af)",
        cursor: loading ? "wait" : "pointer",
        fontSize: 12,
        fontWeight: confirming ? 700 : 400,
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
        whiteSpace: "nowrap",
        flexShrink: 0,
      }}
    >
      <Trash2 size={13} />
      {confirming ? "Confirm?" : loading ? "…" : "Delete"}
    </button>
  );
}
