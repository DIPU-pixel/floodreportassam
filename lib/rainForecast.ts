import type { RainfallData } from "./types";

/** Number of hours the 72h forecast slider scrubs through. */
export const FORECAST_HOURS = 72;

/**
 * Rainfall-intensity colour bands (mm per hour) for the 72h forecast view.
 * Roughly aligned to common rain-intensity descriptors; tuned so a monsoon
 * scrub reads clearly on the map.
 */
export interface RainBand {
  /** Upper bound of this band (mm/h); Infinity for the top band. */
  max: number;
  color: string;
  en: string;
  as: string;
}

export const RAIN_BANDS: RainBand[] = [
  { max: 0.1, color: "#1e293b", en: "Dry", as: "শুকান" },
  { max: 2.5, color: "#38bdf8", en: "Light", as: "পাতল" },
  { max: 7.5, color: "#22c55e", en: "Moderate", as: "মধ্যম" },
  { max: 15, color: "#eab308", en: "Heavy", as: "গধুৰ" },
  { max: 30, color: "#f97316", en: "Very heavy", as: "অতি গধুৰ" },
  { max: Infinity, color: "#dc2626", en: "Extreme", as: "চৰম" },
];

export function rainBand(mmPerHour: number): RainBand {
  return RAIN_BANDS.find((b) => mmPerHour < b.max) ?? RAIN_BANDS[RAIN_BANDS.length - 1];
}

export function rainColor(mmPerHour: number): string {
  return rainBand(mmPerHour).color;
}

/**
 * Forecast precipitation per hour (mm/h) for the next FORECAST_HOURS. Uses the
 * live hourly array when present; otherwise synthesises a plausible profile
 * from next72hMm (front-loaded across the window, with a mild afternoon
 * diurnal bump) so the demo slider still animates. Always length FORECAST_HOURS.
 */
export function forecastHourly(rain: RainfallData | undefined): number[] {
  if (rain?.forecastHourlyMm && rain.forecastHourlyMm.length > 0) {
    const out = rain.forecastHourlyMm.slice(0, FORECAST_HOURS);
    while (out.length < FORECAST_HOURS) out.push(0);
    return out;
  }

  const total = rain?.next72hMm ?? 0;
  if (total <= 0) return new Array(FORECAST_HOURS).fill(0);

  // Weight each hour: decay over the 3 days + a daytime bump (~15:00 IST peak).
  const weights: number[] = [];
  let sumW = 0;
  for (let h = 0; h < FORECAST_HOURS; h++) {
    const decay = 1 - (h / FORECAST_HOURS) * 0.6; // more rain sooner
    const hourOfDay = (new Date().getHours() + h) % 24;
    const diurnal = 1 + 0.6 * Math.sin(((hourOfDay - 9) / 24) * 2 * Math.PI);
    const w = Math.max(0, decay * diurnal);
    weights.push(w);
    sumW += w;
  }
  return weights.map((w) => (sumW > 0 ? (w / sumW) * total : 0));
}
