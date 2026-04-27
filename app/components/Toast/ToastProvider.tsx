"use client";

import { createContext, useCallback, useState, useId } from "react";
import { Toast } from "./Toast";

export interface ToastItem {
  id: string;
  type: "success" | "error" | "warning" | "info";
  title: string;
  sub?: string;
  action?: { label: string; onClick: () => void };
  duration: number;
}

interface ToastOptions {
  sub?: string;
  action?: { label: string; onClick: () => void };
  duration?: number;
}

interface ToastContextValue {
  toast: {
    success: (title: string, opts?: ToastOptions) => void;
    error:   (title: string, opts?: ToastOptions) => void;
    warning: (title: string, opts?: ToastOptions) => void;
    info:    (title: string, opts?: ToastOptions) => void;
  };
}

export const ToastContext = createContext<ToastContextValue | null>(null);

const MAX_TOASTS = 4;
const DEFAULT_DURATION = 4000;

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const baseId = useId();
  let counter = 0;

  const add = useCallback((
    type: ToastItem["type"],
    title: string,
    opts: ToastOptions = {}
  ) => {
    const id = `${baseId}-${Date.now()}-${counter++}`;
    const item: ToastItem = {
      id,
      type,
      title,
      sub: opts.sub,
      action: opts.action,
      duration: opts.duration ?? DEFAULT_DURATION,
    };
    setToasts(prev => {
      const next = [...prev, item];
      return next.length > MAX_TOASTS ? next.slice(next.length - MAX_TOASTS) : next;
    });
  }, [baseId]); // eslint-disable-line react-hooks/exhaustive-deps

  const dismiss = useCallback((id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  const toast = {
    success: (title: string, opts?: ToastOptions) => add("success", title, opts),
    error:   (title: string, opts?: ToastOptions) => add("error",   title, opts),
    warning: (title: string, opts?: ToastOptions) => add("warning", title, opts),
    info:    (title: string, opts?: ToastOptions) => add("info",    title, opts),
  };

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}

      {/* Toast portal — fixed bottom-right */}
      <div
        aria-live="polite"
        aria-atomic="false"
        style={{
          position: "fixed",
          bottom: 24,
          right: 24,
          display: "flex",
          flexDirection: "column",
          gap: 8,
          zIndex: 9999,
          alignItems: "flex-end",
          pointerEvents: "none",
        }}
      >
        {toasts.map(t => (
          <div key={t.id} style={{ pointerEvents: "auto" }}>
            <Toast toast={t} onDismiss={dismiss} />
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
