"use client";

import { useEffect } from "react";
import { FORECAST_HOURS, RAIN_BANDS } from "@/lib/rainForecast";

/** Format "now + h hours" as a short IST day/time label. */
function labelFor(hour: number): string {
  const d = new Date(Date.now() + hour * 3600_000);
  return d.toLocaleString("en-IN", {
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Kolkata",
  });
}

export default function TimeSlider({
  hour,
  playing,
  onHour,
  onTogglePlay,
  onClose,
}: {
  hour: number;
  playing: boolean;
  onHour: (h: number) => void;
  onTogglePlay: () => void;
  onClose: () => void;
}) {
  // Auto-advance while playing; loop back to 0 at the end.
  useEffect(() => {
    if (!playing) return;
    const t = setInterval(() => {
      onHour(hour >= FORECAST_HOURS ? 0 : hour + 1);
    }, 500);
    return () => clearInterval(t);
  }, [playing, hour, onHour]);

  return (
    <div className="pointer-events-auto absolute inset-x-0 bottom-20 z-20 mx-auto max-w-md px-3">
      <div className="rounded-2xl border border-slate-700 bg-slate-900/95 p-3 shadow-2xl backdrop-blur">
        <div className="mb-2 flex items-center justify-between gap-2">
          <div>
            <p className="text-xs font-bold leading-tight">
              Rain forecast · বৰষুণৰ পূৰ্বানুমান
            </p>
            <p className="text-[11px] text-slate-400">
              +{hour}h · {labelFor(hour)}
            </p>
          </div>
          <div className="flex items-center gap-1.5">
            <button
              onClick={onTogglePlay}
              aria-label={playing ? "Pause" : "Play"}
              className="rounded-full bg-slate-800 px-3 py-1 text-sm text-slate-200"
            >
              {playing ? "⏸" : "▶"}
            </button>
            <button
              onClick={onClose}
              aria-label="Close rain forecast"
              className="rounded-full bg-slate-800 px-2.5 py-1 text-sm text-slate-300"
            >
              ✕
            </button>
          </div>
        </div>

        <input
          type="range"
          min={0}
          max={FORECAST_HOURS}
          step={1}
          value={hour}
          onChange={(e) => onHour(Number(e.target.value))}
          aria-label="Forecast hour"
          className="h-2 w-full cursor-pointer appearance-none rounded-full bg-slate-700 accent-sky-500"
        />
        <div className="mt-0.5 flex justify-between text-[9px] text-slate-500">
          <span>now</span>
          <span>+24h</span>
          <span>+48h</span>
          <span>+72h</span>
        </div>

        {/* Intensity scale */}
        <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[9px] text-slate-300">
          <span className="text-slate-500">mm/h:</span>
          {RAIN_BANDS.map((b) => (
            <span key={b.en} className="flex items-center gap-1">
              <span className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: b.color }} />
              {b.en}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
