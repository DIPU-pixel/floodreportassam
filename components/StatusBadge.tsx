"use client";

import { useState } from "react";
import type { ApiStatus } from "@/lib/types";
import { useT, type StringKey } from "@/lib/i18n";

const STYLES: Record<ApiStatus, { dot: string; key: StringKey; pulse: boolean }> = {
  connecting: { dot: "bg-sky-400", key: "status.connecting", pulse: true },
  live: { dot: "bg-emerald-400", key: "status.live", pulse: true },
  stale: { dot: "bg-amber-400", key: "status.stale", pulse: false },
  demo: { dot: "bg-slate-400", key: "status.demo", pulse: false },
};

const EXPLAIN: Record<ApiStatus, string> = {
  connecting: "Fetching live data… showing bundled sample data until it arrives.",
  live: "Live data from Open-Meteo, refreshed every 15 minutes.",
  stale: "A refresh failed — showing the last good data received.",
  demo: "Could not reach the data service. Showing bundled sample data only.",
};

/**
 * Tiny freshness pill. Tap for last-updated time + data sources, so the main
 * view stays uncluttered on a phone.
 */
export default function StatusBadge({
  status,
  updatedAt,
}: {
  status: ApiStatus;
  updatedAt: string | null;
}) {
  const [open, setOpen] = useState(false);
  const t = useT();
  const s = STYLES[status];
  const label = t(s.key);
  const time = updatedAt
    ? new Date(updatedAt).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })
    : "—";

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        aria-label={`Data status: ${label}. Tap for details.`}
        className="pointer-events-auto flex items-center gap-1.5 rounded-full bg-slate-900/90 px-2.5 py-1 text-[10px] font-semibold shadow-lg backdrop-blur"
      >
        <span className={`h-1.5 w-1.5 rounded-full ${s.dot} ${s.pulse ? "animate-pulse" : ""}`} />
        <span>{label}</span>
      </button>

      {open && (
        <div className="pointer-events-auto absolute left-0 top-full z-30 mt-1 w-56 max-w-[calc(100vw-1.5rem)] rounded-xl border border-slate-700 bg-slate-900/97 p-2.5 shadow-2xl backdrop-blur">
          <div className="mb-1 flex items-center justify-between gap-2">
            <span className="flex items-center gap-1.5 text-[11px] font-bold">
              <span className={`h-1.5 w-1.5 rounded-full ${s.dot}`} />
              {label}
            </span>
            <button onClick={() => setOpen(false)} aria-label="Close" className="text-xs text-slate-400">
              ✕
            </button>
          </div>
          <p className="text-[10px] leading-snug text-slate-300">{EXPLAIN[status]}</p>
          <p className="mt-1.5 text-[10px] text-slate-400">
            {status === "stale" ? "Last good data: " : "Updated: "}
            <span className="font-semibold text-slate-200">{time}</span>
          </p>
          <p className="mt-1.5 border-t border-slate-800 pt-1.5 text-[9px] leading-snug text-slate-500">
            Sources: rain &amp; river discharge — Open-Meteo · boundaries — india-maps-data (MIT) ·
            rivers — OpenStreetMap · gauges — CWC (approximate)
          </p>
        </div>
      )}
    </div>
  );
}
