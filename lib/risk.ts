import type { DistrictRisk, RainfallData } from "./types";

/**
 * Tunable weights for the modelled district risk score (0–100).
 * These are heuristics, clearly labelled "modelled estimate" in the UI.
 */
export const RISK_WEIGHTS = {
  /** Weight of observed rain in the last 48h. */
  observedRain: 0.25,
  /** Weight of forecast rain in the next 72h. */
  forecastRain: 0.2,
  /** Weight of the nearest gauge's river-discharge anomaly. */
  dischargeAnomaly: 0.2,
  /** Weight of 7-day ground saturation (rivers already full). */
  saturation: 0.15,
  /** Weight of the district's static flood-proneness. */
  proneness: 0.2,

  // ── Caps: how much rain counts as "everything this component can say".
  // Tuned DOWN from 150/200: Assam's valley districts flood on moderate rain
  // once the ground is saturated and the Brahmaputra is high, so the old caps
  // under-reported real flood situations.
  /** mm of 48h rain considered "extreme" (caps the observed component). */
  observedRainCapMm: 90,
  /** mm of 72h forecast rain considered "extreme". */
  forecastRainCapMm: 120,
  /** mm of 7-day rain at which the ground counts as fully saturated. */
  saturationCapMm: 250,
} as const;

/**
 * Bundled static flood-proneness weights (0–1) per district — how
 * historically flood-prone each district is. Brahmaputra / Barak valley
 * districts (Dhemaji, Lakhimpur, Majuli, Barpeta, Nagaon, Morigaon, Cachar …)
 * are weighted highest; the hill districts lowest. Used in preference to any
 * value carried on the GeoJSON so the weighting lives in one auditable place.
 */
export const FLOOD_PRONENESS: Record<string, number> = {
  // High — Brahmaputra / Barak valley, chronic flooding
  dhemaji: 0.95,
  majuli: 0.95,
  lakhimpur: 0.9,
  barpeta: 0.9,
  goalpara: 0.82,
  morigaon: 0.88,
  nagaon: 0.85,
  cachar: 0.82,
  dhubri: 0.85,
  "south-salmara-mankachar": 0.85,
  biswanath: 0.8,
  darrang: 0.8,
  // Medium
  dibrugarh: 0.7,
  jorhat: 0.65,
  sonitpur: 0.62,
  udalguri: 0.6,
  tinsukia: 0.6,
  sivasagar: 0.6,
  golaghat: 0.6,
  nalbari: 0.6,
  kamrup: 0.6,
  "kamrup-metropolitan": 0.6,
  karimganj: 0.6,
  hailakandi: 0.58,
  bongaigaon: 0.55,
  kokrajhar: 0.55,
  chirang: 0.55,
  baksa: 0.55,
  charaideo: 0.55,
  hojai: 0.55,
  // Low — hills
  "karbi-anglong": 0.3,
  "west-karbi-anglong": 0.3,
  "dima-hasao": 0.28,
};

export function pronenessFor(id: string, fallback = 0.4): number {
  return FLOOD_PRONENESS[id] ?? fallback;
}

export function riskLevel(score: number): DistrictRisk["level"] {
  if (score >= 75) return "severe";
  if (score >= 50) return "high";
  if (score >= 25) return "moderate";
  return "low";
}

/**
 * Pure, unit-testable district risk. Weighted blend of five components:
 * observed 48h rain, forecast 72h rain, the nearest gauge's river-discharge
 * anomaly, 7-day ground saturation, and the district's static flood-proneness.
 * All inputs normalise to 0–1 before weighting; the result is a 0–100 MODELLED
 * ESTIMATE — never an official warning.
 *
 * Calibrate with `node scripts/calibrate.mjs` during flood season.
 */
export function computeDistrictRisk(
  districtId: string,
  name: string,
  floodProneness: number,
  rain: RainfallData | undefined,
  dischargeAnomaly = 0
): DistrictRisk {
  const past48hMm = Math.max(rain?.past48hMm ?? 0, 0);
  const next72hMm = Math.max(rain?.next72hMm ?? 0, 0);
  // Fall back to the 48h figure when no 7-day history is available, so the
  // saturation term degrades gracefully rather than reading as "bone dry".
  const past7dMm = Math.max(rain?.past7dMm ?? past48hMm, 0);

  const observed = Math.min(past48hMm / RISK_WEIGHTS.observedRainCapMm, 1);
  const forecast = Math.min(next72hMm / RISK_WEIGHTS.forecastRainCapMm, 1);
  const saturation = Math.min(past7dMm / RISK_WEIGHTS.saturationCapMm, 1);
  const discharge = Math.min(Math.max(dischargeAnomaly, 0), 1);
  const proneness = Math.min(Math.max(floodProneness, 0), 1);

  const raw =
    observed * RISK_WEIGHTS.observedRain +
    forecast * RISK_WEIGHTS.forecastRain +
    discharge * RISK_WEIGHTS.dischargeAnomaly +
    saturation * RISK_WEIGHTS.saturation +
    proneness * RISK_WEIGHTS.proneness;

  const score = Math.round(Math.min(Math.max(raw, 0), 1) * 100);

  return {
    districtId,
    name,
    score,
    level: riskLevel(score),
    components: {
      past48hMm,
      next72hMm,
      past7dMm,
      floodProneness: proneness,
      dischargeAnomaly: discharge,
    },
  };
}

/** Risk palette shared by map + UI. */
export const RISK_COLORS: Record<DistrictRisk["level"], string> = {
  low: "#22c55e",
  moderate: "#eab308",
  high: "#f97316",
  severe: "#dc2626",
};
