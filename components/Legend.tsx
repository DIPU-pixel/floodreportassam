import { RISK_COLORS } from "@/lib/risk";
import { GAUGE_COLORS } from "@/lib/gauges";

const ITEMS: { label: string; as: string; key: keyof typeof RISK_COLORS }[] = [
  { key: "low", label: "Low", as: "কম" },
  { key: "moderate", label: "Moderate", as: "মধ্যমীয়া" },
  { key: "high", label: "High", as: "অধিক" },
  { key: "severe", label: "Severe", as: "গুৰুতৰ" },
];

const GAUGES: { key: string; label: string; as: string; color: string; pulse?: boolean }[] = [
  { key: "normal", label: "Below danger", as: "স্বাভাৱিক", color: GAUGE_COLORS.normal },
  { key: "warning", label: "Near danger", as: "সতৰ্কতা", color: GAUGE_COLORS.warning },
  { key: "danger", label: "Above danger", as: "বিপদ", color: GAUGE_COLORS.danger },
  { key: "extreme", label: "Above record", as: "সৰ্বোচ্চ", color: GAUGE_COLORS.extreme, pulse: true },
];

export default function Legend() {
  return (
    <div className="absolute bottom-20 left-3 z-10 rounded-xl bg-slate-900/85 p-2.5 text-[11px] shadow-lg backdrop-blur">
      <p className="mb-1.5 font-semibold">Flood risk · বানৰ বিপদ</p>
      {ITEMS.map((i) => (
        <div key={i.key} className="flex items-center gap-2 py-0.5">
          <span className="h-3 w-3 rounded-sm" style={{ backgroundColor: RISK_COLORS[i.key] }} />
          <span>
            {i.label} <span className="text-slate-400">· {i.as}</span>
          </span>
        </div>
      ))}
      <p className="mt-1.5 max-w-[150px] text-[9px] leading-tight text-slate-400">
        Modelled estimate from rainfall + flood history
      </p>

      <div className="mt-2 border-t border-slate-700 pt-1.5">
        <p className="mb-1 font-semibold">Gauge stations · গেজ</p>
        <p className="mb-1 text-[9px] leading-tight text-slate-400">
          ▲ water rising · ▼ falling · ■ steady
        </p>
        {GAUGES.map((g) => (
          <div key={g.key} className="flex items-center gap-2 py-0.5">
            <span
              className={`h-3 w-3 rounded-full border border-white/70${g.pulse ? " animate-pulse" : ""}`}
              style={{ backgroundColor: g.color }}
            />
            <span>
              {g.label} <span className="text-slate-400">· {g.as}</span>
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
