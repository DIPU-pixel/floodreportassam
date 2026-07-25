/** Shared types for the Assam flood dashboard. */

export type ApiStatus = "live" | "stale" | "demo";

export interface District {
  id: string;
  name: string;
  centroidLat: number;
  centroidLng: number;
  /** Static 0–1 weight: how historically flood-prone the district is. */
  floodProneness: number;
}

export interface RainfallData {
  districtId: string;
  /** Observed rainfall, last 48 hours (mm). */
  past48hMm: number;
  /** Forecast rainfall, next 72 hours (mm). */
  next72hMm: number;
  /** Daily precipitation sums, past 2 days then next 5 days (mm). */
  dailyMm: number[];
  /** Precipitation right now (mm/h) — drives the rain animation. */
  currentMm?: number;
  /** Forecast precipitation per hour (mm/h), next up-to-72h from now. */
  forecastHourlyMm?: number[];
}

export interface DistrictRisk {
  districtId: string;
  name: string;
  /** 0–100 modelled estimate — NOT an official warning. */
  score: number;
  level: "low" | "moderate" | "high" | "severe";
  components: {
    past48hMm: number;
    next72hMm: number;
    floodProneness: number;
    /** Nearest-gauge discharge anomaly, 0–1 (fraction of high baseline). */
    dischargeAnomaly: number;
  };
}

export interface RainApiResponse {
  status: ApiStatus;
  fetchedAt: string; // ISO timestamp
  rainfall: RainfallData[];
}

/** River discharge status relative to the station's high-discharge baseline. */
export type DischargeStatus = "normal" | "elevated" | "high" | "extreme";

/** Is the water level rising, holding, or falling vs the recent past. */
export type WaterTrend = "rising" | "steady" | "falling";

export interface RiverDischargeForecast {
  stationId: string;
  /** 14 daily discharge values (7 past + today + 6 forecast = 14), m³/s. */
  series14: number[];
  /** Index of "today" within series14 (= past_days). */
  todayIndex: number;
  /** Today's discharge vs the past-7-day mean. */
  trend: WaterTrend;
  /** Peak river_discharge_max across the 7-day forecast (m³/s). */
  peakDischarge: number;
  /** Bundled per-station high-discharge baseline (m³/s). */
  baseline: number;
  /** peakDischarge / baseline (1.0 = at the high-water baseline). */
  anomalyRatio: number;
  /** Normalised 0–1 anomaly consumed by the risk blend. */
  anomaly01: number;
  status: DischargeStatus;
}

export interface FloodApiResponse {
  status: ApiStatus;
  fetchedAt: string; // ISO timestamp
  discharge: RiverDischargeForecast[];
}

/**
 * OPTIONAL official figures from ASDMA's FRIMS daily flood report. Bundled at
 * /public/data/frims-latest.json and updated manually — NOT modelled. When
 * absent or empty the UI simply omits these counts.
 */
export interface FrimsDistrict {
  /** District name as printed in the report. */
  name: string;
  /** Optional explicit id; otherwise derived from slug(name). */
  districtId?: string;
  affectedVillages?: number;
  affectedPopulation?: number;
  reliefCamps?: number;
}

export interface FrimsReport {
  /** Report date, YYYY-MM-DD. */
  date: string;
  /** Source, e.g. "ASDMA FRIMS". */
  source: string;
  reportUrl?: string;
  districts: FrimsDistrict[];
}

/**
 * Free encyclopedic context for a place (photo + description), so users can
 * recognise an area they don't know by name. Never used for flood claims.
 */
export interface PlaceInfoResponse {
  found: boolean;
  title?: string;
  description?: string;
  extract?: string;
  pageUrl?: string;
  source?: string;
}

/** Resolved FRIMS entry passed to the district / town panels. */
export interface FrimsEntry {
  source: string;
  date: string;
  fresh: boolean; // report < 48h old
  data: FrimsDistrict;
}

/** Bundled town for the two-step area picker. districtId matches the GeoJSON. */
export interface Town {
  name: string;
  districtId: string;
  lat: number;
  lng: number;
}

/** One Assam-filtered geocoding hit from /api/geocode. */
export interface GeocodeResult {
  name: string;
  lat: number;
  lng: number;
  admin1?: string; // state
  admin2?: string; // district (as named by the geocoder)
}

export interface GeocodeResponse {
  results: GeocodeResult[];
}

/** Point-specific rainfall for an ad-hoc lat/lng (My Area). */
export interface PointRain {
  past48hMm: number;
  next72hMm: number;
  dailyMm: number[];
  currentMm?: number;
  forecastHourlyMm?: number[];
}

export interface PointRainResponse {
  status: ApiStatus;
  fetchedAt: string;
  point: PointRain;
}

/** Point-specific river discharge for an ad-hoc lat/lng (My Area). */
export interface PointDischarge {
  /** 14 daily discharge values (7 past + today + 6 forecast). */
  series14: number[];
  todayIndex: number;
  trend: WaterTrend;
  peakDischarge: number;
}

export interface PointFloodResponse {
  status: ApiStatus;
  fetchedAt: string;
  discharge: PointDischarge | null;
}

export interface GaugeStation {
  id: string;
  name: string;
  /** Assamese station/place name. */
  nameAs?: string;
  river: string;
  lat: number;
  lng: number;
  /** Metres — verify against ffs.india-water.gov.in before public use. */
  dangerLevelM: number;
  highestFloodLevelM: number;
}

/** Water-level status relative to a station's danger / highest-flood level. */
export type GaugeStatus = "normal" | "warning" | "danger" | "extreme";

export interface GaugeReading {
  stationId: string;
  /** Current water level (m). DEMO until Stage 3 wires live CWC data. */
  levelM: number;
  /** Last 7 daily levels (m), oldest → newest, for the sparkline. */
  spark7d: number[];
  trend: "rising" | "steady" | "falling";
}

/** Minimal per-marker payload passed to the map layer. */
export interface GaugeMarkerData {
  id: string;
  lat: number;
  lng: number;
  status: GaugeStatus;
  trend?: WaterTrend;
}
