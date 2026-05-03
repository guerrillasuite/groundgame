"use client";

import { useRef, useState, ReactNode } from "react";

interface SwipeableRowProps {
  children: ReactNode;
  onComplete: () => void;
  onReschedule: () => void;
  borderRadius?: number;
}

const TRIGGER_THRESHOLD = 80;
const START_THRESHOLD = 10;

export default function SwipeableRow({ children, onComplete, onReschedule, borderRadius = 0 }: SwipeableRowProps) {
  const [offset, setOffset] = useState(0);
  const startX = useRef(0);
  const startY = useRef(0);
  const tracking = useRef(false);
  const direction = useRef<"left" | "right" | null>(null);

  function onTouchStart(e: React.TouchEvent) {
    startX.current = e.touches[0].clientX;
    startY.current = e.touches[0].clientY;
    tracking.current = true;
    direction.current = null;
  }

  function onTouchMove(e: React.TouchEvent) {
    if (!tracking.current) return;
    const dx = e.touches[0].clientX - startX.current;
    const dy = e.touches[0].clientY - startY.current;

    if (direction.current === null) {
      if (Math.abs(dx) < START_THRESHOLD && Math.abs(dy) < START_THRESHOLD) return;
      if (Math.abs(dy) > Math.abs(dx)) {
        tracking.current = false;
        return;
      }
      direction.current = dx > 0 ? "right" : "left";
    }

    // Prevent scroll when swiping
    e.preventDefault();
    setOffset(dx);
  }

  function onTouchEnd() {
    tracking.current = false;
    if (offset > TRIGGER_THRESHOLD) {
      onComplete();
    } else if (offset < -TRIGGER_THRESHOLD) {
      onReschedule();
    }
    setOffset(0);
    direction.current = null;
  }

  const showRight = offset > START_THRESHOLD;
  const showLeft = offset < -START_THRESHOLD;
  const rightTriggered = offset >= TRIGGER_THRESHOLD;
  const leftTriggered = offset <= -TRIGGER_THRESHOLD;

  return (
    <div
      style={{ position: "relative", overflow: "hidden", borderRadius }}
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
    >
      {/* Right swipe reveal (complete) */}
      {showRight && (
        <div style={{
          position: "absolute", inset: 0,
          background: rightTriggered ? "#16a34a" : "rgba(22,163,74,.7)",
          display: "flex", alignItems: "center", paddingLeft: 20,
          transition: "background .1s",
        }}>
          <span style={{ fontSize: 22 }}>✓</span>
        </div>
      )}

      {/* Left swipe reveal (reschedule) */}
      {showLeft && (
        <div style={{
          position: "absolute", inset: 0,
          background: leftTriggered ? "#d97706" : "rgba(217,119,6,.7)",
          display: "flex", alignItems: "center", justifyContent: "flex-end", paddingRight: 20,
          transition: "background .1s",
        }}>
          <span style={{ fontSize: 22 }}>🗓</span>
        </div>
      )}

      {/* Row content */}
      <div style={{
        transform: `translateX(${offset}px)`,
        transition: offset === 0 ? "transform 300ms cubic-bezier(0.32, 0.72, 0, 1)" : "none",
        position: "relative",
        zIndex: 1,
      }}>
        {children}
      </div>
    </div>
  );
}
