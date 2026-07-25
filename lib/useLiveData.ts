"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ApiStatus } from "./types";

/** Default client refresh cadence — matches the server revalidate (15 min). */
export const REFRESH_MS = 15 * 60 * 1000;

interface Envelope {
  status: ApiStatus;
  fetchedAt: string;
}

export interface PollState<T> {
  data: T | null;
  status: ApiStatus;
  fetchedAt: string | null;
}

/**
 * Poll a JSON API route on an interval (a tiny SWR-style hook, no dependency).
 * Status flow, never blanking the UI:
 *   • server "live"  → live
 *   • server "demo"  → demo (server's own live fetch failed)
 *   • fetch throws   → keep last good data, flip to "stale" (once we've ever
 *                      seen live); otherwise stay demo.
 */
export function usePolling<T extends Envelope>(
  url: string,
  intervalMs = REFRESH_MS
): PollState<T> {
  const [state, setState] = useState<PollState<T>>({
    data: null,
    status: "demo",
    fetchedAt: null,
  });
  const hadLive = useRef(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as T;
      if (data.status === "live") hadLive.current = true;
      setState({ data, status: data.status, fetchedAt: data.fetchedAt });
    } catch (e) {
      console.error(`poll ${url} failed`, e);
      setState((prev) => (hadLive.current ? { ...prev, status: "stale" } : prev));
    }
  }, [url]);

  useEffect(() => {
    void load();
    const t = setInterval(() => void load(), intervalMs);
    return () => clearInterval(t);
  }, [load, intervalMs]);

  return state;
}

/**
 * Combine per-feed statuses for the header badge without ever understating
 * available data: all live → live; any stale → stale; any live (mixed with
 * demo) → live; otherwise demo.
 */
export function combineStatus(...statuses: ApiStatus[]): ApiStatus {
  if (statuses.length === 0) return "demo";
  if (statuses.every((s) => s === "live")) return "live";
  if (statuses.some((s) => s === "stale")) return "stale";
  if (statuses.some((s) => s === "live")) return "live";
  return "demo";
}
