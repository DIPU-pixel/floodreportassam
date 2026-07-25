import type { GaugeReading, GaugeStatus, GaugeStation } from "./types";

/**
 * Gauge status = current water level relative to the station's thresholds.
 *   normal   below danger level, > 0.5 m clear
 *   warning  within 0.5 m of danger level
 *   danger   at/above danger level
 *   extreme  at/above the highest-ever flood level (HFL)
 *
 * NOTE: dangerLevelM / highestFloodLevelM are approximate published CWC
 * values — VERIFY against https://ffs.india-water.gov.in before public use.
 */
export function gaugeStatus(s: GaugeStation, levelM: number): GaugeStatus {
  if (levelM >= s.highestFloodLevelM) return "extreme";
  if (levelM >= s.dangerLevelM) return "danger";
  if (levelM >= s.dangerLevelM - 0.5) return "warning";
  return "normal";
}

/** Marker/graphic palette for gauge status. */
export const GAUGE_COLORS: Record<GaugeStatus, string> = {
  normal: "#64748b", // slate
  warning: "#f97316", // orange
  danger: "#dc2626", // red
  extreme: "#dc2626", // red (marker pulses)
};

export const GAUGE_STATUS_LABEL: Record<GaugeStatus, { en: string; as: string }> = {
  normal: { en: "Below danger", as: "বিপদ সীমাৰ তলত" },
  warning: { en: "Near danger", as: "বিপদ সীমাৰ ওচৰত" },
  danger: { en: "Above danger", as: "বিপদ সীমাৰ ওপৰত" },
  extreme: { en: "Above record flood", as: "সৰ্বোচ্চ বানৰ ওপৰত" },
};

/**
 * DEMO gauge readings (metres), used until Stage 3 wires live discharge/level
 * data. Levels are chosen to exercise every status colour so the map reads
 * realistically during monsoon; they are NOT real observations.
 * spark7d is oldest → newest.
 */
export const DEMO_GAUGE_READINGS: GaugeReading[] = [
  { stationId: "pandu", levelM: 49.35, trend: "rising", spark7d: [47.9, 48.2, 48.5, 48.8, 49.0, 49.2, 49.35] },
  { stationId: "dibrugarh", levelM: 104.10, trend: "steady", spark7d: [103.7, 103.8, 104.0, 104.1, 104.2, 104.1, 104.1] },
  { stationId: "neamatighat", levelM: 85.40, trend: "rising", spark7d: [84.1, 84.4, 84.7, 85.0, 85.2, 85.3, 85.4] },
  { stationId: "tezpur", levelM: 64.90, trend: "rising", spark7d: [63.9, 64.1, 64.3, 64.5, 64.7, 64.8, 64.9] },
  { stationId: "goalpara", levelM: 36.40, trend: "rising", spark7d: [35.2, 35.5, 35.8, 36.0, 36.2, 36.3, 36.4] },
  { stationId: "dhubri", levelM: 30.55, trend: "rising", spark7d: [29.4, 29.7, 30.0, 30.2, 30.35, 30.45, 30.55] },
  { stationId: "badarpur", levelM: 16.75, trend: "rising", spark7d: [15.7, 15.9, 16.2, 16.4, 16.55, 16.65, 16.75] },
  { stationId: "golakganj", levelM: 32.10, trend: "steady", spark7d: [31.8, 31.9, 32.0, 32.1, 32.15, 32.1, 32.1] },
  { stationId: "nt-road", levelM: 74.20, trend: "rising", spark7d: [73.3, 73.5, 73.7, 73.9, 74.0, 74.1, 74.2] },
  { stationId: "numaligarh", levelM: 77.20, trend: "falling", spark7d: [77.9, 77.8, 77.6, 77.5, 77.4, 77.3, 77.2] },
];
