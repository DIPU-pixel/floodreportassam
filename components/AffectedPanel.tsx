"use client";

import DragSheet from "@/components/DragSheet";
import { RISK_COLORS } from "@/lib/risk";
import type { DistrictRisk, FrimsDistrict } from "@/lib/types";

const LEVEL_AS: Record<DistrictRisk["level"], string> = {
  low: "কম",
  moderate: "মধ্যম",
  high: "অধিক",
  severe: "গুৰুতৰ",
};

export default function AffectedPanel({
  risks,
  frimsById,
  onSelect,
  onClose,
}: {
  risks: DistrictRisk[];
  frimsById: Map<string, FrimsDistrict>;
  onSelect: (id: string) => void;
  onClose: () => void;
}) {

  return (
    <DragSheet onClose={onClose} snap initial="peek" ariaLabel="Affected districts">
      <div className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-slate-800 bg-slate-900 px-3 py-2">
        <div>
          <h2 className="text-base font-bold leading-tight">
            Affected districts <span className="font-normal text-slate-400">· ক্ষতিগ্ৰস্ত জিলা</span>
          </h2>
          <p className="text-[11px] text-slate-400">Highest modelled risk first — tap to locate</p>
        </div>
        <button
          onClick={onClose}
          aria-label="Close"
          className="rounded-full bg-slate-800 px-2.5 py-1 text-sm text-slate-300"
        >
          ✕
        </button>
      </div>

      <ul className="divide-y divide-slate-800">
        {risks.map((r, i) => {
          const f = frimsById.get(r.districtId);
          const color = RISK_COLORS[r.level];
          return (
            <li key={r.districtId}>
              <button
                onClick={() => onSelect(r.districtId)}
                className="flex w-full items-center gap-3 px-3 py-2 text-left active:bg-slate-800/60"
              >
                <span className="w-4 shrink-0 text-[11px] tabular-nums text-slate-500">{i + 1}</span>
                <span className="h-8 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: color }} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold">{r.name}</span>
                  <span className="block text-[11px]" style={{ color }}>
                    {r.level.toUpperCase()} · {LEVEL_AS[r.level]}
                    {f?.affectedVillages != null && (
                      <span className="text-slate-400"> · {f.affectedVillages} villages (official)</span>
                    )}
                  </span>
                </span>
                <span className="shrink-0 text-right">
                  <span className="text-base font-bold tabular-nums">{r.score}</span>
                  <span className="text-[10px] text-slate-500">/100</span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>

      <p className="border-t border-slate-800 px-3 py-1.5 text-[10px] leading-snug text-slate-500">
        Modelled estimate from rainfall + river discharge + flood history. Not an official warning.
      </p>
    </DragSheet>
  );
}
