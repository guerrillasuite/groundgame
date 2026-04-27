"use client";

import { useEffect, useRef, useState } from "react";
import type { ToastItem } from "./ToastProvider";

const TYPE_STYLES: Record<ToastItem["type"], { border: string; icon: string; bar: string }> = {
  success: { border: "#22c55e", icon: "✓", bar: "#22c55e" },
  error:   { border: "#ef4444", icon: "✕", bar: "#ef4444" },
  warning: { border: "#f59e0b", icon: "⚠", bar: "#f59e0b" },
  info:    { border: "var(--gg-primary, #2563eb)", icon: "ℹ", bar: "var(--gg-primary, #2563eb)" },
};

interface ToastProps {
  toast: ToastItem;
  onDismiss: (id: string) => void;
}

export function Toast({ toast, onDismiss }: ToastProps) {
  const [isPaused, setIsPaused] = useState(false);
  const [exiting, setExiting] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const startTimeRef = useRef(Date.now());
  const elapsedRef = useRef(0);

  const styles = TYPE_STYLES[toast.type];

  function dismiss() {
    if (timerRef.current) clearTimeout(timerRef.current);
    setExiting(true);
    setTimeout(() => onDismiss(toast.id), 180);
  }

  function startTimer(remaining: number) {
    startTimeRef.current = Date.now();
    timerRef.current = setTimeout(dismiss, remaining);
  }

  function pauseTimer() {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
      elapsedRef.current += Date.now() - startTimeRef.current;
    }
  }

  function resumeTimer() {
    const remaining = Math.max(0, toast.duration - elapsedRef.current);
    if (remaining > 0) startTimer(remaining);
  }

  useEffect(() => {
    if (toast.duration <= 0) return;
    startTimer(toast.duration);
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleMouseEnter() {
    setIsPaused(true);
    pauseTimer();
  }

  function handleMouseLeave() {
    setIsPaused(false);
    resumeTimer();
  }

  return (
    <>
      <style>{`
        @keyframes gs-toast-in {
          from { transform: translateX(110%) translateY(8px); opacity: 0; }
          to   { transform: translateX(0) translateY(0); opacity: 1; }
        }
        @keyframes gs-toast-out {
          from { transform: translateX(0); opacity: 1; }
          to   { transform: translateX(110%); opacity: 0; }
        }
        @keyframes gs-toast-progress {
          from { width: 100%; }
          to   { width: 0%; }
        }
        .gs-toast-enter { animation: gs-toast-in 220ms cubic-bezier(0.34,1.56,0.64,1) forwards; }
        .gs-toast-exit  { animation: gs-toast-out 180ms ease-in forwards; }
      `}</style>

      <div
        className={exiting ? "gs-toast-exit" : "gs-toast-enter"}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        style={{
          position: "relative",
          minWidth: 280,
          maxWidth: 380,
          background: "rgba(28,36,48,0.95)",
          backdropFilter: "blur(20px)",
          WebkitBackdropFilter: "blur(20px)",
          border: "1px solid rgba(255,255,255,0.07)",
          borderRadius: 10,
          overflow: "hidden",
          boxShadow: `0 8px 32px rgba(0,0,0,0.4), inset 3px 0 0 0 ${styles.border}`,
        }}
      >
        {/* Main row */}
        <div style={{
          display: "flex",
          alignItems: "flex-start",
          gap: 10,
          padding: "12px 14px 10px",
        }}>
          {/* Type icon */}
          <span style={{
            fontSize: 13,
            fontWeight: 700,
            color: styles.border,
            marginTop: 1,
            flexShrink: 0,
            width: 18,
            textAlign: "center",
          }}>
            {styles.icon}
          </span>

          {/* Text */}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{
              fontSize: 13,
              fontWeight: 600,
              color: "var(--gg-text, rgb(238 242 246))",
              lineHeight: 1.3,
            }}>
              {toast.title}
            </div>
            {toast.sub && (
              <div style={{
                fontSize: 12,
                color: "var(--gg-dim, rgb(134 150 168))",
                marginTop: 2,
                lineHeight: 1.4,
              }}>
                {toast.sub}
              </div>
            )}
            {toast.action && (
              <button
                onClick={toast.action.onClick}
                style={{
                  marginTop: 6,
                  background: "none",
                  border: "1px solid rgba(255,255,255,0.12)",
                  borderRadius: 5,
                  padding: "3px 8px",
                  fontSize: 11,
                  fontWeight: 500,
                  color: "var(--gg-text, rgb(238 242 246))",
                  cursor: "pointer",
                }}
              >
                {toast.action.label}
              </button>
            )}
          </div>

          {/* Dismiss X */}
          <button
            onClick={dismiss}
            aria-label="Dismiss"
            style={{
              background: "none",
              border: "none",
              color: "var(--gg-dim, rgb(134 150 168))",
              cursor: "pointer",
              padding: "0 0 0 4px",
              fontSize: 14,
              lineHeight: 1,
              flexShrink: 0,
              marginTop: 1,
            }}
          >
            ×
          </button>
        </div>

        {/* Progress bar */}
        {toast.duration > 0 && (
          <div style={{
            height: 2,
            background: "rgba(255,255,255,0.06)",
            position: "relative",
          }}>
            <div style={{
              position: "absolute",
              top: 0,
              left: 0,
              height: "100%",
              background: styles.bar,
              animation: `gs-toast-progress ${toast.duration}ms linear forwards`,
              animationPlayState: isPaused ? "paused" : "running",
            }} />
          </div>
        )}
      </div>
    </>
  );
}
