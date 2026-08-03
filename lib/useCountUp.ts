"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Animate a number from its previous value to `target` with an ease-out curve.
 * Cheap (one rAF loop, transforms nothing) and honest — under
 * prefers-reduced-motion it snaps straight to the value. Returns the raw number;
 * the caller rounds/formats for display.
 */
export function useCountUp(target: number, durationMs = 700): number {
  const [value, setValue] = useState(target);
  const fromRef = useRef(target);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    const from = fromRef.current;
    if (reduce || from === target || !Number.isFinite(target)) {
      setValue(target);
      fromRef.current = target;
      return;
    }
    let raf = 0;
    const start = performance.now();
    const tick = (t: number) => {
      const p = Math.min(1, (t - start) / durationMs);
      const eased = 1 - Math.pow(1 - p, 3);
      setValue(from + (target - from) * eased);
      if (p < 1) raf = requestAnimationFrame(tick);
      else fromRef.current = target;
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, durationMs]);

  return value;
}
