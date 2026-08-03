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
      const max = window.innerHeight * 0.9;
      let next = startRef.current.h + dh;
      // Rubber-band: past the max height, movement gets progressively stiffer.
      if (next > max) next = max + (next - max) * 0.2;
      setHeightPx(Math.min(max + 40, Math.max(60, next)));
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

  // Spring-ish settle when not actively dragging.
  const SPRING = "cubic-bezier(0.22, 1, 0.36, 1)";
  const style: React.CSSProperties = snap
    ? { height: heightPx ?? undefined, transition: dragging ? "none" : `height 320ms ${SPRING}` }
    : { transform: `translateY(${translateY}px)`, transition: dragging ? "none" : `transform 320ms ${SPRING}` };

  return (
    <div
      className={`animate-sheet-in pointer-events-auto absolute inset-x-0 mx-auto max-w-md px-3 ${zClass}`}
      // Sit clear of the bottom tab bar AND the phone's home-indicator inset.
      style={{ bottom: "calc(5rem + env(safe-area-inset-bottom, 0px))" }}
    >
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
        {/* overscroll-contain stops scroll chaining to the map; smooth momentum. */}
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain [scrollbar-width:thin] [-webkit-overflow-scrolling:touch]">
          {children}
        </div>
      </div>
    </div>
  );
}
