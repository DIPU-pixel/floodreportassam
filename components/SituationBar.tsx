"use client";

import { useState } from "react";
import type { DistrictRisk } from "@/lib/types";

export interface AboveDangerGauge {
  name: string;
  river: string;
  levelM: number;
  dangerLevelM: number;
}

/**
 * One-line, plain-language answer to "what is happening right now?".
 * Everything here is derived from live data already on screen — no new claims.
 * Official (FRIMS) flood reports outrank modelled signals when present.
 * Tapping expands to show WHICH gauges/rivers are above danger — every
 * "above danger" claim must be traceable to a named same-river gauge.
 */
export default function SituationBar({
  risks,
  gaugesAboveDanger,
  aboveDangerGauges = [],
  officialDistricts,
  officialDate,
  rainingNow,
  onOpenList,
}: {
  risks: DistrictRisk[];
  gaugesAboveDanger: number;
  aboveDangerGauges?: AboveDangerGauge[];
  officialDistricts: number;
  officialDate?: string;
  rainingNow: boolean;
  onOpenList: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const severe = risks.filter((r) => r.level === "severe").length;
  const high = risks.filter((r) => r.level === "high").length;
  const top = risks[0];

  // Tone: red for official reports / severe, amber for high, slate otherwise.
  const tone =
    officialDistricts > 0 || severe > 0
      ? { bg: "bg-red-900/90", dot: "bg-red-400" }
      : high > 0 || gaugesAboveDanger > 0
      ? { bg: "bg-amber-900/90", dot: "bg-amber-400" }
      : { bg: "bg-slate-900/90", dot: "bg-emerald-400" };

  let headline: string;
  if (officialDistricts > 0) {
    headline = `OFFICIAL: flood reported in ${officialDistricts} district${officialDistricts > 1 ? "s" : ""}${officialDate ? ` (${officialDate})` : ""}`;
  } else if (severe > 0) {
    headline = `${severe} district${severe > 1 ? "s" : ""} at severe modelled risk`;
  } else if (high > 0) {
    headline = `${high} district${high > 1 ? "s" : ""} at high modelled risk`;
  } else if (gaugesAboveDanger > 0) {
    headline = `${gaugesAboveDanger} river gauge${gaugesAboveDanger > 1 ? "s" : ""} above danger level`;
  } else {
    headline = "No district at high modelled risk right now";
  }

  const bits: string[] = [];
  if (gaugesAboveDanger > 0 && officialDistricts === 0 && (severe > 0 || high > 0)) {
    bits.push(`${gaugesAboveDanger} gauge${gaugesAboveDanger > 1 ? "s" : ""} above danger`);
  }
  if (top) bits.push(`highest: ${top.name} ${top.score}/100`);
  bits.push(rainingNow ? "raining now" : "no rain right now");

  return (
    <div className={`pointer-events-auto w-full max-w-md rounded-xl ${tone.bg} shadow-lg backdrop-blur`}>
      <button
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
        className="flex w-full items-center gap-2 px-3 py-2 text-left"
      >
        <span className={`h-2 w-2 shrink-0 animate-pulse rounded-full ${tone.dot}`} />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-xs font-bold text-white">{headline}</span>
          <span className="block truncate text-[10px] text-slate-300">
            {bits.join(" · ")} — tap for details
          </span>
        </span>
        <span className="shrink-0 text-[10px] text-slate-300">{expanded ? "▲" : "▼"}</span>
      </button>

      {expanded && (
        <div className="border-t border-white/10 px-3 py-2">
          {aboveDangerGauges.length > 0 ? (
            <>
              <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-slate-300">
                Gauges above danger · বিপদ সীমাৰ ওপৰত
              </p>
              <ul className="space-y-0.5">
                {aboveDangerGauges.map((g) => (
                  <li key={g.name} className="flex items-baseline justify-between gap-2 text-[11px]">
                    <span className="min-w-0 truncate">
                      <span className="font-semibold text-white">{g.name}</span>
                      <span className="text-slate-300"> · {g.river}</span>
                    </span>
                    <span className="shrink-0 font-mono text-red-300">
                      {g.levelM.toFixed(2)} / {g.dangerLevelM.toFixed(2)} m
                    </span>
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <p className="text-[11px] text-slate-300">
              No river gauge above danger right now · এতিয়া কোনো গেজ বিপদ সীমাৰ ওপৰত নাই।
            </p>
          )}
          <button
            onClick={onOpenList}
            className="mt-2 rounded-lg bg-white/10 px-2.5 py-1 text-[11px] font-semibold text-white active:bg-white/20"
          >
            See all districts · সকলো জিলা →
          </button>
        </div>
      )}
    </div>
  );
}
