"use client";

import DragSheet from "@/components/DragSheet";
import Sparkline from "@/components/Sparkline";
import StreetViewLink from "@/components/StreetViewLink";
import { GAUGE_COLORS, GAUGE_STATUS_LABEL, gaugeStatus } from "@/lib/gauges";
import { DISCHARGE_STATUS_LABEL, TREND_LABEL } from "@/lib/discharge";
import type { GaugeStation, GaugeReading, RiverDischargeForecast } from "@/lib/types";

export default function GaugeSheet({
  station,
  reading,
  discharge,
  onClose,
}: {
  station: GaugeStation | null;
  reading: GaugeReading | null;
  discharge?: RiverDischargeForecast | null;
  onClose: () => void;
}) {
  if (!station || !reading) return null;

  const status = gaugeStatus(station, reading.levelM);
  const color = GAUGE_COLORS[status];
  const label = GAUGE_STATUS_LABEL[status];

  // Vertical scale spanning current / danger / HFL with padding.
  const vals = [reading.levelM, station.dangerLevelM, station.highestFloodLevelM];
  const lo = Math.min(...vals);
  const hi = Math.max(...vals);
  const pad = Math.max((hi - lo) * 0.3, 1);
  const min = lo - pad;
  const max = hi + pad;
  const pct = (v: number) => ((v - min) / (max - min)) * 100;

  const toDanger = reading.levelM - station.dangerLevelM;

  return (
    <DragSheet onClose={onClose} ariaLabel={`${station.name} gauge`}>
      <div className="px-4 pb-4">
        <div className="mb-3 flex items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-bold leading-tight">
              {station.name}
              {station.nameAs ? <span className="ml-1 font-normal text-slate-400">· {station.nameAs}</span> : null}
            </h2>
            <p className="text-xs text-slate-400">{station.river} river · gauge station</p>
            <p className="mt-0.5 text-xs font-semibold" style={{ color }}>
              {label.en} · {label.as}
            </p>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="rounded-full bg-slate-800 px-2.5 py-1 text-sm text-slate-300"
          >
            ✕
          </button>
        </div>

        <div className="flex gap-4">
          {/* Vertical gauge */}
          <div className="relative h-40 w-16 shrink-0">
            <div className="absolute inset-x-[26px] inset-y-0 rounded-full bg-slate-800" />
            {/* water fill */}
            <div
              className="absolute inset-x-[26px] bottom-0 rounded-b-full transition-all duration-500"
              style={{ height: `${Math.max(0, Math.min(100, pct(reading.levelM)))}%`, backgroundColor: color }}
            />
            {/* HFL marker */}
            <Marker atPct={pct(station.highestFloodLevelM)} labelColor="#f87171" dashed text="HFL" />
            {/* danger marker */}
            <Marker atPct={pct(station.dangerLevelM)} labelColor="#fb923c" text="Danger" />
          </div>

          {/* Readouts */}
          <div className="flex-1">
            <div className="mb-2">
              <p className="text-[11px] text-slate-400">Current level (modelled estimate)</p>
              <p className="text-2xl font-bold leading-none" style={{ color }}>
                {reading.levelM.toFixed(2)}<span className="text-sm font-normal text-slate-400"> m</span>
              </p>
              <p className="text-[11px] text-slate-400">
                {TREND_LABEL[reading.trend].arrow} {TREND_LABEL[reading.trend].en} ·{" "}
                {toDanger >= 0
                  ? `${toDanger.toFixed(2)} m above danger`
                  : `${Math.abs(toDanger).toFixed(2)} m below danger`}
              </p>
              <p className="mt-0.5 text-[10px] text-slate-500">
                {reading.observed
                  ? `Source: CWC Flood Forecasting${
                      reading.timestamp
                        ? " · as of " +
                          new Date(reading.timestamp).toLocaleString("en-IN", {
                            day: "numeric",
                            month: "short",
                            hour: "numeric",
                            minute: "2-digit",
                          })
                        : ""
                    }`
                  : "Demo level — live CWC data when reachable"}
              </p>
            </div>
            <dl className="space-y-1 text-[11px]">
              <Row k="Danger level" v={`${station.dangerLevelM.toFixed(2)} m`} dot="#fb923c" />
              <Row k="Highest flood (HFL)" v={`${station.highestFloodLevelM.toFixed(2)} m`} dot="#f87171" />
            </dl>
          </div>
        </div>

        {/* 14-day sparkline (7 past + 7 forecast) — live river discharge + trend */}
        {discharge && discharge.series14.length > 0 ? (
          <div className="mt-3">
            <div className="mb-1 flex items-baseline justify-between">
              <p className="text-[11px] text-slate-400">River discharge · 7 days past + 7 forecast</p>
              <p className="text-[11px] font-semibold" style={{ color: TREND_LABEL[discharge.trend].arrow ? DISCHARGE_STATUS_LABEL[discharge.status].color : undefined }}>
                {TREND_LABEL[discharge.trend].arrow} {TREND_LABEL[discharge.trend].en} · {TREND_LABEL[discharge.trend].as}
              </p>
            </div>
            <Sparkline
              values={discharge.series14}
              color={DISCHARGE_STATUS_LABEL[discharge.status].color}
              markerIndex={discharge.todayIndex}
            />
            <p className="mt-1 text-[10px] text-slate-500">
              Peak {Math.round(discharge.peakDischarge).toLocaleString()} m³/s ·{" "}
              {Math.round(discharge.anomalyRatio * 100)}% of high-water baseline · {DISCHARGE_STATUS_LABEL[discharge.status].en} (modelled)
            </p>
          </div>
        ) : (
          <div className="mt-3">
            <p className="mb-1 text-[11px] text-slate-400">
              7-day level trend <span className="text-slate-500">(demo)</span>
            </p>
            <Sparkline values={reading.spark7d} color={color} />
          </div>
        )}

        <StreetViewLink lat={station.lat} lng={station.lng} />

        <p className="mt-2 text-[10px] leading-snug text-slate-500">
          Levels approximate — verify against ffs.india-water.gov.in (CWC). Not an official warning; follow
          ASDMA / CWC / district administration. Helpline 1077 / 1079.
        </p>
      </div>
    </DragSheet>
  );
}

function Marker({
  atPct,
  labelColor,
  text,
  dashed,
}: {
  atPct: number;
  labelColor: string;
  text: string;
  dashed?: boolean;
}) {
  const clamped = Math.max(0, Math.min(100, atPct));
  return (
    <div className="absolute inset-x-0 flex items-center" style={{ bottom: `calc(${clamped}% - 1px)` }}>
      <div className="h-0 w-full" style={{ borderTop: `2px ${dashed ? "dashed" : "solid"} ${labelColor}` }} />
      <span
        className="absolute right-0 translate-x-full whitespace-nowrap pl-1 text-[9px] font-semibold"
        style={{ color: labelColor }}
      >
        {text}
      </span>
    </div>
  );
}

function Row({ k, v, dot }: { k: string; v: string; dot: string }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <dt className="flex items-center gap-1.5 text-slate-400">
        <span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: dot }} />
        {k}
      </dt>
      <dd className="font-semibold text-slate-200">{v}</dd>
    </div>
  );
}
