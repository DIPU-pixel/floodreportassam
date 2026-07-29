"use client";

import { RISK_COLORS } from "@/lib/risk";
import { GAUGE_COLORS } from "@/lib/gauges";
import { useT, type StringKey } from "@/lib/i18n";
import type { DistrictRisk } from "@/lib/types";

const RISK_ITEMS: { key: DistrictRisk["level"]; label: StringKey }[] = [
  { key: "low", label: "risk.low" },
  { key: "moderate", label: "risk.moderate" },
  { key: "high", label: "risk.high" },
  { key: "severe", label: "risk.severe" },
];

const GAUGE_ITEMS: { key: keyof typeof GAUGE_COLORS; label: StringKey; pulse?: boolean }[] = [
  { key: "normal", label: "gauge.normal" },
  { key: "warning", label: "gauge.warning" },
  { key: "danger", label: "gauge.danger" },
  { key: "extreme", label: "gauge.extreme", pulse: true },
];

/**
 * ONE combined legend, opened from the ⓘ button. Replaces the two always-on
 * legend cards that used to cover a third of a phone screen.
 */
export default function LegendSheet({ onClose }: { onClose: () => void }) {
  const t = useT();
  return (
    <div className="pointer-events-auto absolute inset-x-0 bottom-24 z-30 mx-auto max-w-md px-3">
      <div className="rounded-2xl border border-slate-700 bg-slate-900/97 p-3 shadow-2xl backdrop-blur">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-sm font-bold">{t("legend.title")}</h2>
          <button
            onClick={onClose}
            aria-label={t("common.close")}
            className="rounded-full bg-slate-800 px-2.5 py-1 text-sm text-slate-300"
          >
            ✕
          </button>
        </div>

        <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-[11px]">
          <div>
            <p className="mb-1 font-semibold text-slate-300">{t("legend.risk")}</p>
            {RISK_ITEMS.map((i) => (
              <div key={i.key} className="flex items-center gap-2 py-0.5">
                <span className="h-3 w-3 shrink-0 rounded-sm" style={{ backgroundColor: RISK_COLORS[i.key] }} />
                <span className="truncate">{t(i.label)}</span>
              </div>
            ))}
          </div>

          <div>
            <p className="mb-1 font-semibold text-slate-300">{t("legend.gauges")}</p>
            {GAUGE_ITEMS.map((i) => (
              <div key={i.key} className="flex items-center gap-2 py-0.5">
                <span
                  className={`h-3 w-3 shrink-0 rounded-full border border-white/70${i.pulse ? " animate-pulse" : ""}`}
                  style={{ backgroundColor: GAUGE_COLORS[i.key] }}
                />
                <span className="truncate">{t(i.label)}</span>
              </div>
            ))}
          </div>
        </div>

        <p className="mt-2 border-t border-slate-800 pt-1.5 text-[10px] leading-snug text-slate-400">
          ▲ water rising · ▼ falling · ■ steady · blue lines are rivers (tap for the name).
        </p>
        <p className="mt-1 text-[10px] leading-snug text-slate-500">
          Risk is a modelled estimate from rainfall, 7-day saturation, river discharge and flood
          history — not an official warning.
        </p>
      </div>
    </div>
  );
}
