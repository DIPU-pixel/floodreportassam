import { NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";
import type {
  District,
  PointRain,
  PointRainResponse,
  RainApiResponse,
  RainfallData,
} from "@/lib/types";
import { DEMO_RAINFALL } from "@/lib/demoData";

export const revalidate = 900; // 15 minutes

interface OpenMeteoLoc {
  current?: { time?: string; precipitation?: number | null };
  hourly?: { time?: string[]; precipitation?: (number | null)[] };
  daily?: { time?: string[]; precipitation_sum?: (number | null)[] };
}

function num(v: number | null | undefined): number {
  return typeof v === "number" && Number.isFinite(v) ? v : 0;
}

interface GeoFeature {
  properties: District & Record<string, unknown>;
}

async function loadDistricts(): Promise<District[]> {
  const file = path.join(process.cwd(), "public", "data", "assam_districts.geojson");
  const raw = await fs.readFile(file, "utf8");
  const geo = JSON.parse(raw) as { features: GeoFeature[] };
  return geo.features.map((f) => ({
    id: f.properties.id,
    name: f.properties.name,
    centroidLat: f.properties.centroidLat,
    centroidLng: f.properties.centroidLng,
    floodProneness: f.properties.floodProneness,
  }));
}

const sum = (a: number[]): number => a.reduce((t, v) => t + v, 0);

const OM_PARAMS =
  "&hourly=precipitation&daily=precipitation_sum&current=precipitation" +
  "&past_days=2&forecast_days=5&timezone=Asia%2FKolkata";

/** Turn one Open-Meteo location object into our 48h/72h/hourly shape. */
function parseLoc(loc: OpenMeteoLoc | undefined): PointRain {
  const dailyMm = (loc?.daily?.precipitation_sum ?? []).map(num);

  // Precise windows from hourly data, anchored at the current hour.
  const times = loc?.hourly?.time ?? [];
  const precip = (loc?.hourly?.precipitation ?? []).map(num);
  const nowKey = loc?.current?.time?.slice(0, 13); // "YYYY-MM-DDTHH"
  const nowIdx = nowKey ? times.findIndex((t) => t.slice(0, 13) >= nowKey) : -1;

  // Precipitation happening right now (mm/h) — drives the rain animation.
  const currentMm = num(loc?.current?.precipitation);

  if (nowIdx >= 0 && precip.length) {
    const next72 = precip.slice(nowIdx, nowIdx + 72);
    return {
      past48hMm: Math.round(sum(precip.slice(Math.max(0, nowIdx - 48), nowIdx))),
      next72hMm: Math.round(sum(next72)),
      dailyMm,
      currentMm,
      // Per-hour forecast for the 72h time slider (rounded to 0.1 mm).
      forecastHourlyMm: next72.map((v) => Math.round(v * 10) / 10),
    };
  }
  // Fallback: daily buckets — [0,1] past 2 days, [2..4] next 3 days.
  return {
    past48hMm: Math.round((dailyMm[0] ?? 0) + (dailyMm[1] ?? 0)),
    next72hMm: Math.round((dailyMm[2] ?? 0) + (dailyMm[3] ?? 0) + (dailyMm[4] ?? 0)),
    dailyMm,
    currentMm,
  };
}

/**
 * Open-Meteo supports comma-separated lat/lng lists — ONE request covers all
 * districts.
 */
async function fetchLiveRain(districts: District[]): Promise<RainfallData[]> {
  const lats = districts.map((d) => d.centroidLat).join(",");
  const lngs = districts.map((d) => d.centroidLng).join(",");
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${lats}&longitude=${lngs}${OM_PARAMS}`;

  const res = await fetch(url, { next: { revalidate: 900 } });
  if (!res.ok) throw new Error(`Open-Meteo HTTP ${res.status}`);

  const json = (await res.json()) as OpenMeteoLoc | OpenMeteoLoc[];
  const perLocation = Array.isArray(json) ? json : [json];
  if (perLocation.length !== districts.length) {
    throw new Error("Open-Meteo returned unexpected location count");
  }

  return districts.map((d, i) => ({ districtId: d.id, ...parseLoc(perLocation[i]) }));
}

/** Point rainfall for an ad-hoc lat/lng (My Area). Coordinates only reach Open-Meteo. */
async function fetchPointRain(lat: number, lng: number): Promise<PointRain> {
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}${OM_PARAMS}`;
  const res = await fetch(url, { next: { revalidate: 900 } });
  if (!res.ok) throw new Error(`Open-Meteo HTTP ${res.status}`);
  const json = (await res.json()) as OpenMeteoLoc | OpenMeteoLoc[];
  return parseLoc(Array.isArray(json) ? json[0] : json);
}

export async function GET(
  req: Request
): Promise<NextResponse<RainApiResponse | PointRainResponse>> {
  const fetchedAt = new Date().toISOString();
  const params = new URL(req.url).searchParams;
  const lat = Number(params.get("lat"));
  const lng = Number(params.get("lng"));

  // Point mode: /api/rain?lat=&lng= for a single My-Area coordinate.
  if (Number.isFinite(lat) && Number.isFinite(lng) && params.has("lat")) {
    try {
      const point = await fetchPointRain(lat, lng);
      return NextResponse.json({ status: "live", fetchedAt, point });
    } catch (err) {
      console.error("[/api/rain] point fetch failed:", err);
      return NextResponse.json({
        status: "demo",
        fetchedAt,
        point: { past48hMm: 0, next72hMm: 0, dailyMm: [] },
      });
    }
  }

  try {
    const districts = await loadDistricts();
    const rainfall = await fetchLiveRain(districts);
    return NextResponse.json({ status: "live", fetchedAt, rainfall });
  } catch (err) {
    console.error("[/api/rain] live fetch failed, serving demo data:", err);
    return NextResponse.json({ status: "demo", fetchedAt, rainfall: DEMO_RAINFALL });
  }
}
