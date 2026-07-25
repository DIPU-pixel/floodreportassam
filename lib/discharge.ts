import type { DischargeStatus, GaugeStation, RiverDischargeForecast, WaterTrend } from "./types";

/**
 * Rough per-station HIGH-DISCHARGE baselines (m³/s) for the Open-Meteo /
 * GloFAS `river_discharge` model. These are ILLUSTRATIVE order-of-magnitude
 * values used ONLY to normalise the discharge anomaly for the risk blend —
 * they are NOT calibrated gauge ratings and will differ from real observed
 * discharge. Calibrate against the model's own climatology (GloFAS reporting
 * points / return-period stats) before any operational use.
 */
export const DISCHARGE_BASELINE: Record<string, number> = {
  // Brahmaputra main stem (upstream → downstream)
  dibrugarh: 30000,
  neamatighat: 32000,
  tezpur: 34000,
  pandu: 40000,
  goalpara: 42000,
  dhubri: 45000,
  // Barak
  badarpur: 4000,
  // Tributaries
  "nt-road": 3000, // Jia Bharali
  numaligarh: 2000, // Dhansiri
  golakganj: 800, // Gaurang
};

export const DEFAULT_BASELINE = 5000;

export function baselineFor(stationId: string): number {
  return DISCHARGE_BASELINE[stationId] ?? DEFAULT_BASELINE;
}

/** Bucket the peak/baseline ratio into a status band. */
export function dischargeStatus(anomalyRatio: number): DischargeStatus {
  if (anomalyRatio >= 1.15) return "extreme";
  if (anomalyRatio >= 1.0) return "high";
  if (anomalyRatio >= 0.75) return "elevated";
  return "normal";
}

/** Water trend: today's discharge vs the mean of the past 7 days. */
export function waterTrend(series14: number[], todayIndex: number): WaterTrend {
  const past = series14.slice(0, todayIndex).filter((v) => Number.isFinite(v));
  const today = series14[todayIndex] ?? 0;
  if (past.length === 0) return "steady";
  const mean = past.reduce((s, v) => s + v, 0) / past.length;
  if (mean <= 0) return "steady";
  const r = today / mean;
  if (r >= 1.08) return "rising";
  if (r <= 0.92) return "falling";
  return "steady";
}

export const TREND_LABEL: Record<WaterTrend, { arrow: string; en: string; as: string }> = {
  rising: { arrow: "↑", en: "Rising", as: "বাঢ়িছে" },
  steady: { arrow: "→", en: "Steady", as: "স্থিৰ" },
  falling: { arrow: "↓", en: "Falling", as: "কমিছে" },
};

export const DISCHARGE_STATUS_LABEL: Record<
  DischargeStatus,
  { en: string; as: string; color: string }
> = {
  normal: { en: "Normal flow", as: "স্বাভাৱিক", color: "#64748b" },
  elevated: { en: "Elevated flow", as: "বৃদ্ধি পোৱা", color: "#eab308" },
  high: { en: "High flow", as: "অধিক", color: "#f97316" },
  extreme: { en: "Extreme flow", as: "চৰম", color: "#dc2626" },
};

/**
 * DEMO discharge forecasts, used when the live Flood API call fails. Built
 * from the bundled baselines with a per-station factor so the demo exercises
 * every status band; NOT real observations.
 */
export function demoDischarge(stations: GaugeStation[]): RiverDischargeForecast[] {
  const FACTORS: Record<string, number> = {
    dhubri: 1.25,
    goalpara: 1.05,
    neamatighat: 1.02,
    badarpur: 1.1,
    pandu: 0.9,
    "nt-road": 0.85,
    tezpur: 0.8,
    dibrugarh: 0.6,
    golakganj: 0.55,
    numaligarh: 0.5,
  };
  // 14 days: 7 past (rising) + today + 6 forecast (peak then ebb).
  const shape = [0.6, 0.66, 0.72, 0.8, 0.86, 0.92, 0.97, 1.0, 0.98, 0.94, 0.9, 0.86, 0.82, 0.78];
  const todayIndex = 7;

  return stations.map((s) => {
    const baseline = baselineFor(s.id);
    const factor = FACTORS[s.id] ?? 0.7;
    const peak = baseline * factor;
    const series14 = shape.map((k) => Math.round(peak * k));
    const peakDischarge = Math.max(...series14.slice(todayIndex));
    return {
      stationId: s.id,
      series14,
      todayIndex,
      trend: waterTrend(series14, todayIndex),
      peakDischarge,
      baseline,
      anomalyRatio: factor,
      anomaly01: Math.max(0, Math.min(factor, 1)),
      status: dischargeStatus(factor),
    };
  });
}
