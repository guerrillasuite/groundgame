"use client";

import { useEffect, useRef, useState, ReactNode } from "react";
import { createPortal } from "react-dom";

interface BottomSheetProps {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  /** Height as CSS value — default "55vh", use "90vh" for drawers */
  maxHeight?: string;
  /** If true, sheet cannot be dragged above its initial height */
  lockHeight?: boolean;
}

export default function BottomSheet({
  open,
  onClose,
  children,
  maxHeight = "55vh",
  lockHeight = false,
}: BottomSheetProps) {
  const sheetRef = useRef<HTMLDivElement>(null);
  const startY = useRef(0);
  const startH = useRef(0);
  const [height, setHeight] = useState<number | null>(null);
  const [visible, setVisible] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => { setMounted(true); }, []);

  useEffect(() => {
    if (open) {
      setVisible(true);
    } else {
      // Animate out then unmount
      const t = setTimeout(() => setVisible(false), 320);
      return () => clearTimeout(t);
    }
  }, [open]);

  // Drag handle logic
  function onPointerDown(e: React.PointerEvent) {
    const el = sheetRef.current;
    if (!el) return;
    startY.current = e.clientY;
    startH.current = el.offsetHeight;
    el.style.transition = "none";

    const onMove = (ev: PointerEvent) => {
      const dy = ev.clientY - startY.current;
      const newH = Math.max(60, startH.current - dy);
      const maxPx = window.innerHeight * (lockHeight ? 0.55 : 0.85);
      setHeight(Math.min(newH, maxPx));
    };

    const onUp = (ev: PointerEvent) => {
      document.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerup", onUp);
      if (el) el.style.transition = "";

      const dy = ev.clientY - startY.current;
      const pct = dy / startH.current;
      if (pct > 0.3) {
        setHeight(null);
        onClose();
      }
    };

    document.addEventListener("pointermove", onMove);
    document.addEventListener("pointerup", onUp);
  }

  if (!mounted) return null;

  const isOpen = open && visible;

  return createPortal(
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position: "fixed",
          inset: 0,
          background: "rgba(0,0,0,.6)",
          backdropFilter: "blur(4px)",
          zIndex: 200,
          opacity: isOpen ? 1 : 0,
          transition: "opacity 320ms cubic-bezier(0.32, 0.72, 0, 1)",
          pointerEvents: isOpen ? "auto" : "none",
        }}
      />

      {/* Sheet */}
      <div
        ref={sheetRef}
        style={{
          position: "fixed",
          bottom: 0,
          left: 0,
          right: 0,
          height: height ?? maxHeight,
          background: "rgb(20 25 38)",
          borderRadius: "20px 20px 0 0",
          borderTop: "1px solid rgba(255,255,255,.10)",
          boxShadow: "0 -16px 80px rgba(0,0,0,.85), 0 -1px 0 rgba(255,255,255,.08)",
          zIndex: 201,
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          transform: isOpen ? "translateY(0)" : "translateY(100%)",
          transition: "transform 320ms cubic-bezier(0.32, 0.72, 0, 1)",
          paddingBottom: "env(safe-area-inset-bottom)",
        }}
      >
        {/* Drag handle */}
        <div
          onPointerDown={onPointerDown}
          style={{
            flexShrink: 0,
            width: "100%",
            height: 20,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            cursor: "grab",
            touchAction: "none",
          }}
        >
          <div style={{
            width: 36,
            height: 4,
            borderRadius: 2,
            background: "rgba(255,255,255,.22)",
          }} />
        </div>

        {/* Content */}
        <div style={{ flex: 1, overflowY: "auto", WebkitOverflowScrolling: "touch" as any }}>
          {children}
        </div>
      </div>
    </>,
    document.body
  );
}
