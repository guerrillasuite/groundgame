"use client";

import { useState } from "react";
import StopModal from "@/app/components/StopModal";

export default function RecordStopButton() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        style={{
          background: "var(--gg-primary, #2563eb)",
          color: "#fff",
          border: "none",
          borderRadius: 8,
          padding: "8px 16px",
          fontSize: 14,
          fontWeight: 600,
          cursor: "pointer",
        }}
      >
        + Record Stop
      </button>

      {open && (
        <StopModal
          channel="doors"
          mode={{ type: "standalone" }}
          onSaved={() => setOpen(false)}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}
