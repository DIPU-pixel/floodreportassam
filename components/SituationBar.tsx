"use client";

import type { DistrictRisk } from "@/lib/types";

/**
 * One-line, plain-language answer to "what is happening right now?".
 * Everything here is derived from live data already on screen — no new claims.
 * Official (FRIMS) flood reports outrank modelled signals when present.
 */
export default function SituationBar({
  risks,
  gaugesAboveDanger,
  officialDistricts,
  officialDate,
  rainingNow,
  onOpenList,
}: {
  risks: DistrictRisk[];
  gaugesAboveDanger: number;
  officialDistricts: number;
  officialDate?: string;
  rainingNow: boolean;
  onOpenList: () => void;
}) {
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
    <button
      onClick={onOpenList}
      className={`pointer-events-auto flex w-full max-w-md items-center gap-2 rounded-xl ${tone.bg} px-3 py-2 text-left shadow-lg backdrop-blur`}
    >
      <span className={`h-2 w-2 shrink-0 animate-pulse rounded-full ${tone.dot}`} />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-xs font-bold text-white">{headline}</span>
        <span className="block truncate text-[10px] text-slate-300">
          {bits.join(" · ")} — tap for details
        </span>
      </span>
    </button>
  );
}
