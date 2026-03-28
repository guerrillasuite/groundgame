"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import StopModal from "@/app/components/StopModal";

export default function LogCallInListButton({ walklistId }: { walklistId: string }) {
  const [open, setOpen] = useState(false);
  const router = useRouter();

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        style={{
          display: "block",
          width: "100%",
          padding: "12px",
          background: "none",
          border: "1px solid var(--gg-border, #22283a)",
          borderRadius: 10,
          color: "var(--gg-primary, #2563eb)",
          fontSize: 15,
          fontWeight: 600,
          cursor: "pointer",
          textAlign: "center" as const,
        }}
      >
        + Log Call (not on list)
      </button>

      {open && (
        <StopModal
          channel="call"
          mode={{ type: "walklist", walklist_id: walklistId }}
          onSaved={(opts) => {
            setOpen(false);
            if (opts?.idx !== undefined) {
              router.push(`/dials/${walklistId}/${opts.idx}`);
            }
          }}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}
