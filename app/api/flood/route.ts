import { NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";
import type {
  FloodApiResponse,
  GaugeStation,
  PointDischarge,
  PointFloodResponse,
  RiverDischargeForecast,
} from "@/lib/types";
import { baselineFor, demoDischarge, dischargeStatus, waterTrend } from "@/lib/discharge";

// Per-request route (see /api/rain) — prevents build-time prerendering that
// would freeze production on DEMO data. Upstream calls stay cached 15 min.
export const dynamic = "force-dynamic";
export const revalidate = 900; // 15 minutes

// 7 observed days + 7 forecast → "today" sits at index 7.
const FLOOD_PARAMS =
  "&daily=river_discharge,river_discharge_max,river_discharge_mean&past_days=7&forecast_days=7";
const TODAY_INDEX = 7;

interface FloodDaily {
  daily?: {
    time?: string[];
    river_discharge?: (number | null)[];
    river_discharge_max?: (number | null)[];
    river_discharge_mean?: (number | null)[];
  };
}

function num(v: number | null | undefined): number {
  return typeof v === "number" && Number.isFinite(v) ? v : 0;
}

/** Extract the 14-day discharge series + forecast peak from one location. */
function parseSeries(d: FloodDaily["daily"]): { series14: number[]; peak: number } {
  const disc = (d?.river_discharge ?? []).map(num);
  const dmax = (d?.river_discharge_max ?? []).map(num);
  const series14 = disc.length ? disc : dmax;
  const forecastMax = dmax.slice(TODAY_INDEX);
  const peak = forecastMax.length ? Math.max(...forecastMax) : Math.max(0, ...series14.slice(TODAY_INDEX));
  return { series14, peak: Math.round(peak) };
}

async function loadStations(): Promise<GaugeStation[]> {
  const file = path.join(process.cwd(), "public", "data", "gauges.json");
  const raw = await fs.readFile(file, "utf8");
  const json = JSON.parse(raw) as { stations?: GaugeStation[] };
  return json.stations ?? [];
}

/**
 * Open-Meteo Flood API supports comma-separated lat/lng lists — ONE request
 * covers every gauge station. Returns 7 daily river_discharge +
 * river_discharge_max values per station.
 */
async function fetchDischarge(stations: GaugeStation[]): Promise<RiverDischargeForecast[]> {
  const lats = stations.map((s) => s.lat).join(",");
  const lngs = stations.map((s) => s.lng).join(",");
  const url = `https://flood-api.open-meteo.com/v1/flood?latitude=${lats}&longitude=${lngs}${FLOOD_PARAMS}`;

  const res = await fetch(url, { next: { revalidate: 900 } });
  if (!res.ok) throw new Error(`Flood API HTTP ${res.status}`);

  const json = (await res.json()) as FloodDaily | FloodDaily[];
  const perLocation = Array.isArray(json) ? json : [json];
  if (perLocation.length !== stations.length) {
    throw new Error("Flood API returned unexpected location count");
  }

  return stations.map((s, i) => {
    const { series14, peak } = parseSeries(perLocation[i]?.daily);
    const baseline = baselineFor(s.id);
    const anomalyRatio = baseline > 0 ? peak / baseline : 0;
    return {
      stationId: s.id,
      series14,
      todayIndex: TODAY_INDEX,
      trend: waterTrend(series14, TODAY_INDEX),
      peakDischarge: peak,
      baseline,
      anomalyRatio,
      anomaly01: Math.max(0, Math.min(anomalyRatio, 1)),
      status: dischargeStatus(anomalyRatio),
    };
  });
}

/** Point discharge for an ad-hoc lat/lng (My Area). No baseline — raw series + trend. */
async function fetchPointDischarge(lat: number, lng: number): Promise<PointDischarge> {
  const url = `https://flood-api.open-meteo.com/v1/flood?latitude=${lat}&longitude=${lng}${FLOOD_PARAMS}`;
  const res = await fetch(url, { next: { revalidate: 900 } });
  if (!res.ok) throw new Error(`Flood API HTTP ${res.status}`);
  const json = (await res.json()) as FloodDaily | FloodDaily[];
  const { series14, peak } = parseSeries((Array.isArray(json) ? json[0] : json)?.daily);
  return {
    series14,
    todayIndex: TODAY_INDEX,
    trend: waterTrend(series14, TODAY_INDEX),
    peakDischarge: peak,
  };
}

export async function GET(
  req: Request
): Promise<NextResponse<FloodApiResponse | PointFloodResponse>> {
  const fetchedAt = new Date().toISOString();
  const params = new URL(req.url).searchParams;
  const lat = Number(params.get("lat"));
  const lng = Number(params.get("lng"));

  // Point mode: /api/flood?lat=&lng= for a single My-Area coordinate.
  if (Number.isFinite(lat) && Number.isFinite(lng) && params.has("lat")) {
    try {
      const discharge = await fetchPointDischarge(lat, lng);
      return NextResponse.json({ status: "live", fetchedAt, discharge });
    } catch (err) {
      console.error("[/api/flood] point fetch failed:", err);
      return NextResponse.json({ status: "demo", fetchedAt, discharge: null });
    }
  }

  let stations: GaugeStation[] = [];
  try {
    stations = await loadStations();
    const discharge = await fetchDischarge(stations);
    return NextResponse.json({ status: "live", fetchedAt, discharge });
  } catch (err) {
    console.error("[/api/flood] live fetch failed, serving demo data:", err);
    return NextResponse.json({ status: "demo", fetchedAt, discharge: demoDischarge(stations) });
  }
}
