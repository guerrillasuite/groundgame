"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Copy } from "lucide-react";

export default function SurveyDuplicateButton({ surveyId }: { surveyId: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function handleDuplicate() {
    setLoading(true);
    try {
      const res = await fetch(`/api/survey/${surveyId}/duplicate`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      router.push(`/crm/survey/${data.survey_id}/edit`);
    } catch (err) {
      alert("Failed to duplicate survey.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <button
      onClick={handleDuplicate}
      disabled={loading}
      style={{
        padding: "10px 16px",
        background: "rgba(0,0,0,0.05)",
        color: "inherit",
        borderRadius: 8,
        fontWeight: 600,
        textDecoration: "none",
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        border: "none",
        cursor: loading ? "not-allowed" : "pointer",
        fontSize: 14,
        opacity: loading ? 0.6 : 1,
      }}
    >
      <Copy size={14} />
      {loading ? "Duplicating…" : "Duplicate"}
    </button>
  );
}
