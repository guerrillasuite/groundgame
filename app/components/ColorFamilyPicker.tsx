"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import { COLOR_FAMILIES, COLOR_PALETTE, type ColorFamily } from "@/lib/sitrep-colors";

// ── Split circle: light half (active) + dark half (done) ─────────────────────
export function SplitCircle({
  family,
  size = 28,
  selected,
  onClick,
}: {
  family: ColorFamily;
  size?: number;
  selected?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      title={family.name}
      onClick={onClick}
      style={{
        width: size,
        height: size,
        borderRadius: "50%",
        background: `linear-gradient(135deg, ${family.shades[3]} 50%, ${family.shades[1]} 50%)`,
        border: selected ? "3px solid rgba(255,255,255,.88)" : "2px solid rgba(0,0,0,.25)",
        cursor: onClick ? "pointer" : "default",
        flexShrink: 0,
        outline: selected ? `2px solid ${family.shades[2]}` : "none",
        outlineOffset: 1,
        transition: "border .12s, outline .12s, transform .12s",
        transform: selected ? "scale(1.18)" : "scale(1)",
      }}
    />
  );
}

// ── Floating popout color picker ──────────────────────────────────────────────
export function ColorFamilyPicker({
  value,
  onChange,
  size = 28,
}: {
  value: string;
  onChange: (key: string) => void;
  size?: number;
}) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0 });
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoutRef = useRef<HTMLDivElement>(null);

  const selectedFamily = COLOR_FAMILIES.find((f) => f.key === value) ?? COLOR_FAMILIES[0];

  const openPicker = useCallback(() => {
    const rect = triggerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const popW = 268;
    let left = rect.left;
    if (left + popW > window.innerWidth - 8) left = window.innerWidth - popW - 8;
    // flip above trigger if not enough room below
    const popH = 180;
    const top =
      rect.bottom + 6 + popH > window.innerHeight
        ? rect.top - popH - 6
        : rect.bottom + 6;
    setPos({ top, left });
    setOpen(true);
  }, []);

  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (
        popoutRef.current?.contains(e.target as Node) ||
        triggerRef.current?.contains(e.target as Node)
      )
        return;
      setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  const popout = open
    ? createPortal(
        <div
          ref={popoutRef}
          style={{
            position: "fixed",
            top: pos.top,
            left: pos.left,
            zIndex: 9999,
            width: 268,
            background: "rgb(18 24 38)",
            border: "1px solid rgb(50 62 80)",
            borderRadius: 14,
            padding: "14px 16px 12px",
            boxShadow:
              "0 0 0 1px rgba(255,255,255,.05) inset, 0 12px 40px rgba(0,0,0,.65), 0 4px 12px rgba(0,0,0,.4)",
            backdropFilter: "blur(10px)",
          }}
        >
          {/* Label */}
          <div
            style={{
              fontSize: 10,
              fontWeight: 800,
              letterSpacing: "0.1em",
              color: "rgb(100 120 148)",
              textTransform: "uppercase",
              marginBottom: 10,
            }}
          >
            Color Family
          </div>

          {/* 12 circles */}
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {COLOR_FAMILIES.map((fam) => (
              <SplitCircle
                key={fam.key}
                family={fam}
                size={size}
                selected={value === fam.key}
                onClick={() => {
                  onChange(fam.key);
                  setOpen(false);
                }}
              />
            ))}
          </div>

          {/* Legend + selected name */}
          <div
            style={{
              marginTop: 10,
              paddingTop: 9,
              borderTop: "1px solid rgb(38 48 64)",
              fontSize: 11,
              color: "rgb(100 116 139)",
              display: "flex",
              alignItems: "center",
              gap: 12,
            }}
          >
            <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
              <span
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: "50%",
                  background: "#dbeafe",
                  display: "inline-block",
                  border: "1px solid rgba(0,0,0,.15)",
                }}
              />
              Active
            </span>
            <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
              <span
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: "50%",
                  background: "#1d4ed8",
                  display: "inline-block",
                  border: "1px solid rgba(0,0,0,.15)",
                }}
              />
              Done
            </span>
            <span style={{ marginLeft: "auto", color: "rgb(160 174 192)", fontWeight: 600 }}>
              {selectedFamily.name}
            </span>
          </div>
        </div>,
        document.body
      )
    : null;

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        title={`Color: ${selectedFamily.name} — click to change`}
        onClick={() => (open ? setOpen(false) : openPicker())}
        style={{
          background: "none",
          border: "none",
          padding: 2,
          cursor: "pointer",
          display: "inline-flex",
          alignItems: "center",
          flexShrink: 0,
          borderRadius: "50%",
          outline: open ? `2px solid ${selectedFamily.shades[2]}` : "none",
          outlineOffset: 1,
          transition: "outline .12s",
        }}
      >
        <SplitCircle family={selectedFamily} size={size} selected={open} />
      </button>
      {popout}
    </>
  );
}

// ── Solid-color swatch picker (24 individual colors) ─────────────────────────
// Use this when you need a single hex color (e.g. dispositions).
// Shows 12 lights on top row + 12 darks on bottom row; pairs align vertically.
export function ColorSwatchPicker({
  value,
  onChange,
  size = 22,
}: {
  value: string;
  onChange: (hex: string) => void;
  size?: number;
}) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0 });
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoutRef = useRef<HTMLDivElement>(null);

  const selected = COLOR_PALETTE.find((c) => c.hex.toLowerCase() === value?.toLowerCase());

  const openPicker = useCallback(() => {
    const rect = triggerRef.current?.getBoundingClientRect();
    if (!rect) return;
    // 12 × (size + 5) - 5 + 32 padding
    const popW = 12 * (size + 5) - 5 + 32;
    let left = rect.left;
    if (left + popW > window.innerWidth - 8) left = window.innerWidth - popW - 8;
    const popH = size * 2 + 5 + 80;
    const top =
      rect.bottom + 6 + popH > window.innerHeight
        ? rect.top - popH - 6
        : rect.bottom + 6;
    setPos({ top, left });
    setOpen(true);
  }, [size]);

  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (
        popoutRef.current?.contains(e.target as Node) ||
        triggerRef.current?.contains(e.target as Node)
      )
        return;
      setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  const lights = COLOR_PALETTE.filter((c) => c.role === "light");
  const darks  = COLOR_PALETTE.filter((c) => c.role === "dark");

  function Swatch({ c }: { c: (typeof COLOR_PALETTE)[number] }) {
    const isSelected = value?.toLowerCase() === c.hex.toLowerCase();
    return (
      <button
        type="button"
        title={c.name}
        onClick={() => { onChange(c.hex); setOpen(false); }}
        style={{
          width: size,
          height: size,
          borderRadius: "50%",
          background: c.hex,
          border: isSelected ? "3px solid rgba(255,255,255,.9)" : "2px solid rgba(0,0,0,.22)",
          cursor: "pointer",
          flexShrink: 0,
          outline: isSelected ? `2px solid ${c.pairHex}` : "none",
          outlineOffset: 1,
          transform: isSelected ? "scale(1.2)" : "scale(1)",
          transition: "transform .1s, border .1s",
        }}
      />
    );
  }

  const popout = open
    ? createPortal(
        <div
          ref={popoutRef}
          style={{
            position: "fixed",
            top: pos.top,
            left: pos.left,
            zIndex: 9999,
            width: 12 * (size + 5) - 5 + 32,
            background: "rgb(18 24 38)",
            border: "1px solid rgb(50 62 80)",
            borderRadius: 14,
            padding: "14px 16px 12px",
            boxShadow:
              "0 0 0 1px rgba(255,255,255,.05) inset, 0 12px 40px rgba(0,0,0,.65), 0 4px 12px rgba(0,0,0,.4)",
            backdropFilter: "blur(10px)",
          }}
        >
          <div
            style={{
              fontSize: 10,
              fontWeight: 800,
              letterSpacing: "0.1em",
              color: "rgb(100 120 148)",
              textTransform: "uppercase",
              marginBottom: 10,
            }}
          >
            Color
          </div>

          <div style={{ display: "flex", gap: 5, marginBottom: 5 }}>
            {lights.map((c) => <Swatch key={c.hex} c={c} />)}
          </div>
          <div style={{ display: "flex", gap: 5 }}>
            {darks.map((c) => <Swatch key={c.hex} c={c} />)}
          </div>

          <div
            style={{
              marginTop: 10,
              paddingTop: 9,
              borderTop: "1px solid rgb(38 48 64)",
              fontSize: 11,
              color: "rgb(100 116 139)",
              display: "flex",
              alignItems: "center",
              gap: 10,
            }}
          >
            <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
              <span
                style={{
                  width: 8, height: 8, borderRadius: "50%",
                  background: "rgb(160 174 192)", display: "inline-block",
                }}
              />
              top row = light · bottom row = dark
            </span>
            {selected && (
              <span style={{ marginLeft: "auto", color: "rgb(160 174 192)", fontWeight: 600 }}>
                {selected.name}
              </span>
            )}
          </div>
        </div>,
        document.body
      )
    : null;

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        title={`Color: ${selected?.name ?? value} — click to change`}
        onClick={() => (open ? setOpen(false) : openPicker())}
        style={{
          background: "none",
          border: "none",
          padding: 2,
          cursor: "pointer",
          display: "inline-flex",
          alignItems: "center",
          flexShrink: 0,
          borderRadius: "50%",
          outline: open ? "2px solid rgba(255,255,255,.25)" : "none",
          outlineOffset: 1,
          transition: "outline .12s",
        }}
      >
        <div
          style={{
            width: size,
            height: size,
            borderRadius: "50%",
            background: value || "rgb(100 116 139)",
            border: "2px solid rgba(255,255,255,.2)",
            flexShrink: 0,
          }}
        />
      </button>
      {popout}
    </>
  );
}
