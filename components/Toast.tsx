"use client";

import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from "react";

/**
 * Tiny toast system that works the same on mobile and desktop:
 *   • mobile  → a pill above the bottom tab bar, centred
 *   • desktop → bottom-right, stacked
 * Auto-dismisses; respects prefers-reduced-motion; announced to screen readers.
 * Use via `const toast = useToast(); toast("Copied", "success")`.
 */

export type ToastTone = "info" | "success" | "warning" | "error";

interface ToastItem {
  id: number;
  message: string;
  tone: ToastTone;
}

type ToastFn = (message: string, tone?: ToastTone) => void;

const ToastCtx = createContext<ToastFn | null>(null);

const TONE: Record<ToastTone, string> = {
  info: "bg-slate-800 text-slate-100 border-slate-600",
  success: "bg-emerald-700 text-white border-emerald-500",
  warning: "bg-amber-600 text-white border-amber-400",
  error: "bg-red-700 text-white border-red-500",
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const nextId = useRef(1);

  const remove = useCallback((id: number) => {
    setItems((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const toast = useCallback<ToastFn>((message, tone = "info") => {
    const id = nextId.current++;
    setItems((prev) => [...prev.slice(-2), { id, message, tone }]); // keep at most 3
    setTimeout(() => remove(id), 2600);
  }, [remove]);

  return (
    <ToastCtx.Provider value={toast}>
      {children}
      <Toaster items={items} onDismiss={remove} />
    </ToastCtx.Provider>
  );
}

function Toaster({ items, onDismiss }: { items: ToastItem[]; onDismiss: (id: number) => void }) {
  return (
    <div
      aria-live="polite"
      aria-atomic="false"
      className="pointer-events-none fixed inset-x-0 bottom-24 z-[70] flex flex-col items-center gap-1.5 px-3 sm:inset-x-auto sm:bottom-6 sm:right-6 sm:items-end"
    >
      {items.map((t) => (
        <button
          key={t.id}
          onClick={() => onDismiss(t.id)}
          className={`pointer-events-auto max-w-[92vw] rounded-full border px-4 py-2 text-xs font-semibold shadow-2xl backdrop-blur animate-toast-in sm:max-w-sm ${TONE[t.tone]}`}
          role="status"
        >
          {t.message}
        </button>
      ))}
    </div>
  );
}

export function useToast(): ToastFn {
  const ctx = useContext(ToastCtx);
  // Fallback no-op keeps components usable outside the provider (e.g. tests).
  return ctx ?? (() => {});
}
