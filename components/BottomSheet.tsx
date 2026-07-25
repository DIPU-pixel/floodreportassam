"use client";

import { useState } from "react";
import DragSheet from "@/components/DragSheet";
import { RISK_COLORS } from "@/lib/risk";
import { districtSummaryText, shareOrCopy } from "@/lib/share";
import type { DistrictRisk, FrimsEntry, Town } from "@/lib/types";

const LEVEL_AS: Record<DistrictRisk["level"], string> = {
  low: "কম বিপদ",
  moderate: "মধ্যমীয়া বিপদ",
  high: "অধিক বিপদ",
  severe: "গুৰুতৰ বিপদ",
};

export default function BottomSheet({
  risk,
  frims,
  towns,
  onTown,
  onClose,
}: {
  risk: DistrictRisk | null;
  frims?: FrimsEntry | null;
  towns?: Town[];
  onTown?: (t: Town) => void;
  onClose: () => void;
}) {
  const [shareMsg, setShareMsg] = useState<string | null>(null);
  if (!risk) return null;
  const color = RISK_COLORS[risk.level];

  const onShare = async () => {
    const result = await shareOrCopy(districtSummaryText(risk, frims), `Assam Flood Watch — ${risk.name}`);
    setShareMsg(result === "shared" ? "Shared" : result === "copied" ? "Copied to clipboard" : "Copy failed");
    setTimeout(() => setShareMsg(null), 2000);
  };

  return (
    <DragSheet onClose={onClose} ariaLabel={`${risk.name} flood risk`}>
      <div className="px-4 pb-4">
        <div className="mb-2 flex items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-bold leading-tight">{risk.name}</h2>
            <p className="text-xs font-semibold" style={{ color }}>
              {risk.level.toUpperCase()} risk · {LEVEL_AS[risk.level]}
            </p>
          </div>
          <div className="flex items-center gap-1.5">
            <button
              onClick={onShare}
              aria-label="Share district summary"
              className="rounded-full bg-slate-800 px-3 py-1 text-xs font-semibold text-slate-200 active:bg-slate-700"
            >
              {shareMsg ?? "Share"}
            </button>
            <button
              onClick={onClose}
              aria-label="Close"
              className="rounded-full bg-slate-800 px-2.5 py-1 text-sm text-slate-300"
            >
              ✕
            </button>
          </div>
        </div>

        {/* Score bar */}
        <div className="mb-3">
          <div className="mb-1 flex justify-between text-[11px] text-slate-400">
            <span>Flood risk score (modelled estimate)</span>
            <span className="font-semibold text-slate-200">{risk.score}/100</span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-slate-800">
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{ width: `${risk.score}%`, backgroundColor: color }}
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2 text-center">
          <div className="rounded-xl bg-slate-800/80 p-2">
            <p className="text-lg font-bold">{risk.components.past48hMm} mm</p>
            <p className="text-[10px] text-slate-400">Rain — last 48h (observed)</p>
          </div>
          <div className="rounded-xl bg-slate-800/80 p-2">
            <p className="text-lg font-bold">{risk.components.next72hMm} mm</p>
            <p className="text-[10px] text-slate-400">Rain — next 72h (forecast)</p>
          </div>
        </div>

        {/* Nearest-gauge river discharge contribution */}
        <div className="mt-2">
          <div className="mb-1 flex justify-between text-[11px] text-slate-400">
            <span>Nearest river discharge vs high baseline</span>
            <span className="font-semibold text-slate-200">
              {Math.round(risk.components.dischargeAnomaly * 100)}%
            </span>
          </div>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-800">
            <div
              className="h-full rounded-full bg-sky-500 transition-all duration-500"
              style={{ width: `${Math.round(risk.components.dischargeAnomaly * 100)}%` }}
            />
          </div>
        </div>

        {/* Towns — tap to open a place-specific panel */}
        {towns && towns.length > 0 && (
          <div className="mt-3">
            <p className="mb-1.5 text-[11px] font-semibold text-slate-300">Towns · নগৰ</p>
            <div className="flex flex-wrap gap-1.5">
              {towns.map((t) => (
                <button
                  key={t.name}
                  onClick={() => onTown?.(t)}
                  className="rounded-full bg-slate-800 px-3 py-1.5 text-xs text-slate-200 active:bg-sky-600"
                >
                  {t.name}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* OFFICIAL figures (ASDMA FRIMS) — shown only when a fresh report exists. */}
        {frims?.data && (
          <div className="mt-3 overflow-hidden rounded-xl border border-red-800/60 bg-red-950/30">
            <div className="bg-red-700 px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-white">
              ⚠ OFFICIAL: flood reported · {frims.source} · {frims.date}
            </div>
            <div className="flex flex-wrap gap-x-4 gap-y-1 p-2 text-[11px] text-slate-200">
              {frims.data.affectedVillages != null && (
                <span><b>{frims.data.affectedVillages}</b> villages affected</span>
              )}
              {frims.data.affectedPopulation != null && (
                <span><b>{frims.data.affectedPopulation.toLocaleString("en-IN")}</b> people affected</span>
              )}
              {frims.data.reliefCamps != null && (
                <span><b>{frims.data.reliefCamps}</b> relief camps</span>
              )}
            </div>
          </div>
        )}

        <p className="mt-3 text-[10px] leading-snug text-slate-500">
          Estimate from rainfall + flood history. Not an official warning — follow ASDMA / district
          administration. Helpline 1077 / 1079.
        </p>
      </div>
    </DragSheet>
  );
}
