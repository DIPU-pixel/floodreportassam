"use client";

import { useState } from "react";
import { GAUGE_COLORS, GAUGE_STATUS_LABEL } from "@/lib/gauges";
import { TREND_LABEL } from "@/lib/discharge";
import type { RiverRow } from "@/lib/rivers";

const TIER_CHIP: Record<RiverRow["tier"], { en: string; as: string; cls: string }> = {
  gauged: { en: "Gauged", as: "গেজ", cls: "bg-emerald-900/60 text-emerald-300" },
  modelled: { en: "Modelled", as: "মডেল", cls: "bg-sky-900/60 text-sky-300" },
  unmonitored: { en: "No gauge", as: "গেজ নাই", cls: "bg-slate-700 text-slate-300" },
};

/**
 * Ranked list of the rivers near the user, each with its OWN same-river gauge
 * (or an honest "no gauge" tier). Compact on mobile: first 3 rows, the rest
 * behind "show more". A status is shown only for a river's own gauge.
 */
/** Compact "24 Jul, 4:00 PM" from an ISO string. */
function fmtTime(iso?: string): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
}

export default function NearbyRivers({
  rows,
  crossRiverNote,
  sourceLabel,
  initial = 3,
}: {
  rows: RiverRow[];
  /** Shown only when NONE of the nearby rivers has a gauge. */
  crossRiverNote?: string;
  /** e.g. "Source: CWC · live" or the demo note. */
  sourceLabel?: string;
  initial?: number;
}) {
  const [showAll, setShowAll] = useState(false);
  if (rows.length === 0) return null;
  const visible = showAll ? rows : rows.slice(0, initial);
  const anyGauged = rows.some((r) => r.gauge);

  return (
    <div className="mt-3 rounded-xl bg-slate-800/60 p-2.5">
      <p className="mb-1.5 text-[11px] font-semibold text-slate-300">
        Rivers near you · ওচৰৰ নদীবোৰ{" "}
        <span className="font-normal text-slate-500">({rows.length})</span>
      </p>

      <ul className="space-y-1.5">
        {visible.map((r) => {
          const chip = TIER_CHIP[r.tier];
          return (
            <li key={r.name} className="rounded-lg bg-slate-900/50 px-2 py-1.5 text-[12px]">
              <div className="flex items-baseline justify-between gap-2">
                <span className="min-w-0 truncate">
                  <span className="font-semibold">{r.name}</span>
                  {r.nameAs && <span className="text-slate-400"> · {r.nameAs}</span>}
                </span>
                <span className="shrink-0 text-[10px] text-slate-500">~{r.km.toFixed(1)} km</span>
              </div>

              <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
                <span className={`rounded px-1 py-0.5 text-[9px] font-bold uppercase tracking-wide ${chip.cls}`}>
                  {chip.en} · {chip.as}
                </span>
                {r.gauge ? (
                  <>
                    <span
                      className="rounded-full px-1.5 py-0.5 text-[10px] font-semibold text-white"
                      style={{ backgroundColor: GAUGE_COLORS[r.gauge.status] }}
                    >
                      {GAUGE_STATUS_LABEL[r.gauge.status].en} · {GAUGE_STATUS_LABEL[r.gauge.status].as}
                    </span>
                    <span className="text-[10px] text-slate-400">
                      {r.gauge.name} · {r.gauge.levelM.toFixed(2)}/{r.gauge.dangerLevelM.toFixed(2)} m ·{" "}
                      {TREND_LABEL[r.gauge.trend].arrow} {TREND_LABEL[r.gauge.trend].en}
                      {fmtTime(r.gauge.timestamp) && (
                        <span className="text-slate-500"> · as of {fmtTime(r.gauge.timestamp)}</span>
                      )}
                    </span>
                  </>
                ) : r.modelled ? (
                  <span className="text-[10px] text-sky-300/90">
                    modelled {r.modelled.currentM3s?.toLocaleString()} m³/s
                    {r.modelled.trend && (
                      <> · {TREND_LABEL[r.modelled.trend].arrow} {TREND_LABEL[r.modelled.trend].en}</>
                    )}
                    {r.modelled.percentile != null && (
                      <>
                        {" "}·{" "}
                        <span
                          className={
                            r.modelled.status === "high"
                              ? "text-orange-300"
                              : r.modelled.status === "elevated"
                              ? "text-yellow-300"
                              : "text-slate-400"
                          }
                        >
                          {Math.round(r.modelled.percentile * 100)}th pct vs normal
                        </span>
                      </>
                    )}
                  </span>
                ) : (
                  <span className="text-[10px] text-slate-500">
                    no gauge or model · গেজ বা মডেল নাই
                  </span>
                )}
              </div>
            </li>
          );
        })}
      </ul>

      {rows.length > initial && (
        <button
          onClick={() => setShowAll((v) => !v)}
          className="mt-1.5 text-[11px] font-semibold text-sky-400 active:text-sky-300"
        >
          {showAll ? "Show less" : `Show ${rows.length - initial} more · আৰু দেখুৱাওক`}
        </button>
      )}

      {!anyGauged && crossRiverNote && (
        <p className="mt-1.5 border-t border-slate-700/60 pt-1.5 text-[10px] leading-snug text-slate-500">
          {crossRiverNote}
        </p>
      )}

      <p className="mt-1.5 text-[9px] leading-snug text-slate-600">
        {sourceLabel ?? "Gauge levels: CWC (demo)."} A river’s status is never borrowed from another river.
      </p>
    </div>
  );
}
