"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

type Snap = "peek" | "half" | "full";
const FRAC: Record<Snap, number> = { peek: 0.32, half: 0.56, full: 0.85 };

/**
 * Bottom sheet with a drag handle. Two modes:
 *   snap=true  → snaps between peek / half / full heights; scrollable body.
 *   snap=false → hugs its content; drag down past a threshold to dismiss.
 */
export default function DragSheet({
  onClose,
  snap = false,
  initial = "half",
  ariaLabel = "Panel",
  zClass = "z-20",
  children,
}: {
  onClose: () => void;
  snap?: boolean;
  initial?: Snap;
  ariaLabel?: string;
  zClass?: string;
  children: ReactNode;
}) {
  const [heightPx, setHeightPx] = useState<number | null>(null);
  const [translateY, setTranslateY] = useState(0);
  const [dragging, setDragging] = useState(false);
  const startRef = useRef({ y: 0, h: 0 });

  useEffect(() => {
    if (snap && heightPx == null && typeof window !== "undefined") {
      setHeightPx(window.innerHeight * FRAC[initial]);
    }
  }, [snap, initial, heightPx]);

  const onDown = (e: React.PointerEvent) => {
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    startRef.current = { y: e.clientY, h: heightPx ?? 0 };
    setDragging(true);
  };
  const onMove = (e: React.PointerEvent) => {
    if (!dragging) return;
    if (snap) {
      const dh = startRef.current.y - e.clientY;
      setHeightPx(Math.min(window.innerHeight * 0.9, Math.max(60, startRef.current.h + dh)));
    } else {
      setTranslateY(Math.max(0, e.clientY - startRef.current.y));
    }
  };
  const onUp = () => {
    setDragging(false);
    if (snap) {
      const h = heightPx ?? 0;
      const ih = window.innerHeight;
      if (h < ih * FRAC.peek * 0.6) return onClose();
      const targets = [ih * FRAC.peek, ih * FRAC.half, ih * FRAC.full];
      setHeightPx(targets.reduce((a, b) => (Math.abs(b - h) < Math.abs(a - h) ? b : a)));
    } else {
      if (translateY > 90) return onClose();
      setTranslateY(0);
    }
  };

  const style: React.CSSProperties = snap
    ? { height: heightPx ?? undefined, transition: dragging ? "none" : "height 220ms ease" }
    : { transform: `translateY(${translateY}px)`, transition: dragging ? "none" : "transform 220ms ease" };

  return (
    <div className={`pointer-events-auto absolute inset-x-0 bottom-20 mx-auto max-w-md px-3 ${zClass}`}>
      <div
        role="dialog"
        aria-label={ariaLabel}
        className="flex max-h-[85vh] flex-col overflow-hidden rounded-2xl border border-slate-700 bg-slate-900/97 shadow-sheet backdrop-blur"
        style={style}
      >
        <div
          onPointerDown={onDown}
          onPointerMove={onMove}
          onPointerUp={onUp}
          onPointerCancel={onUp}
          className="flex shrink-0 cursor-grab touch-none justify-center py-2 active:cursor-grabbing"
          aria-label="Drag to resize"
        >
          <span className="h-1.5 w-10 rounded-full bg-slate-600" />
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
      </div>
    </div>
  );
}
