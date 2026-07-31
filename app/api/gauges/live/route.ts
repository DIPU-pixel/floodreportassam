import { NextResponse } from "next/server";
import type { LiveGaugeResponse, LiveGauge } from "@/lib/types";

/**
 * Stage 3 — LIVE CWC gauge levels from the Central Water Commission's Flood
 * Forecasting service (ffs.india-water.gov.in), joined from its internal API:
 *   • flood-forecast-static           → danger / warning / highest-flood levels
 *   • layer-station-geo               → lat / lon + station name
 *   • new-entry-data-aggregate (HHS)  → latest observed level + timestamp
 *   • station-water-level-above-warning → official status + trend (when above warning)
 *
 * CWC FFS geo-restricts to India, so this MUST run from an India region — the
 * project pins functions to Mumbai (bom1) in vercel.json. If the source is
 * unreachable or a value is missing we say so; we never fabricate a level.
 *
 * Cached 20 min. Not an official warning — CWC/ASDMA remain authoritative.
 */
export const revalidate = 1200;

const FFS = "https://ffs.india-water.gov.in";
const HEADERS = {
  "User-Agent": "AssamFloodWatch/1.0 (+public flood information)",
  Accept: "application/json",
  Referer: "https://ffs.india-water.gov.in/",
};

// Assam bounding box (+ a small margin) — the client does exact district/river
// assignment; this just trims the nationwide list cheaply server-side.
const BBOX = { minLat: 23.8, maxLat: 28.3, minLng: 89.4, maxLng: 96.3 };

interface StaticStation {
  stationCode: string;
  dangerLevel: number | null;
  warningLevel: number | null;
  highestFlowLevel: number | null;
  nearestTown: string | null;
}
interface GeoStation {
  stationCode: string;
  lat: number;
  lon: number;
  name: string | null;
}
interface AggEntry {
  id: { datatypeCode: string; stationCode: string };
  latestDataTime: string | null;
  latestDataValue: number | null;
  datatypeCode: string;
  stationCode: string;
}
interface AboveWarning {
  stationCode: string;
  status: string;
  trend: string | null;
  value: number;
}

async function getJson<T>(url: string): Promise<T | null> {
  try {
    const res = await fetch(url, { headers: HEADERS, cache: "no-store", signal: AbortSignal.timeout(12000) });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

function statusFor(level: number | null, warn: number | null, danger: number | null, hfl: number | null): LiveGauge["status"] {
  if (level == null) return "unknown";
  if (hfl != null && level >= hfl) return "extreme";
  if (danger != null && level >= danger) return "danger";
  if (warn != null && level >= warn) return "warning";
  return "normal";
}

function trendFor(t: string | null | undefined): LiveGauge["trend"] {
  switch ((t ?? "").toUpperCase()) {
    case "RISING":
      return "rising";
    case "FALLING":
      return "falling";
    case "STEADY":
      return "steady";
    default:
      return null;
  }
}

export async function GET() {
  const levelSpec = encodeURIComponent(
    JSON.stringify({ where: { expression: { valueIsRelationField: false, fieldName: "type", operator: "eq", value: "Level" } } })
  );
  const geoSpec = encodeURIComponent(
    JSON.stringify({
      where: {
        expression: {
          valueIsRelationField: false,
          fieldName: "layerStationStationCode.floodForecastStaticStationCode.type",
          operator: "eq",
          value: "Level",
        },
      },
    })
  );
  const aggSpec = encodeURIComponent(
    JSON.stringify({
      where: { expression: { valueIsRelationField: false, fieldName: "id.datatypeCode", operator: "eq", value: "HHS" } },
      and: {
        expression: {
          valueIsRelationField: false,
          fieldName: "stationCode.floodForecastStaticStationCode.type",
          operator: "eq",
          value: "Level",
        },
      },
    })
  );

  const [master, geo, agg, above] = await Promise.all([
    getJson<StaticStation[]>(`${FFS}/iam/api/flood-forecast-static/specification/?specification=${levelSpec}`),
    getJson<GeoStation[]>(`${FFS}/iam/api/layer-station-geo/specification/?specification=${geoSpec}`),
    getJson<AggEntry[]>(`${FFS}/iam/api/new-entry-data-aggregate/specification/?specification=${aggSpec}`),
    getJson<AboveWarning[]>(`${FFS}/ffm/api/station-water-level-above-warning/`),
  ]);

  const fetchedAt = new Date().toISOString();
  const region = process.env.VERCEL_REGION ?? "local";
  const source = "CWC Flood Forecasting (ffs.india-water.gov.in)";

  if (!master || !geo) {
    const body: LiveGaugeResponse = { ok: false, reachable: false, source, fetchedAt, region, stations: [] };
    return NextResponse.json(body);
  }

  const staticByCode = new Map(master.map((s) => [s.stationCode, s]));
  const liveByCode = new Map((above ?? []).map((a) => [a.stationCode, a]));
  // Latest HHS (water-level) reading per station.
  const levelByCode = new Map<string, { value: number | null; time: string | null }>();
  for (const e of agg ?? []) {
    if (e.datatypeCode !== "HHS") continue;
    levelByCode.set(e.stationCode, { value: e.latestDataValue, time: e.latestDataTime });
  }

  const stations: LiveGauge[] = [];
  for (const gs of geo) {
    if (typeof gs.lat !== "number" || typeof gs.lon !== "number") continue;
    if (gs.lat < BBOX.minLat || gs.lat > BBOX.maxLat || gs.lon < BBOX.minLng || gs.lon > BBOX.maxLng) continue;
    const st = staticByCode.get(gs.stationCode);
    const lvl = levelByCode.get(gs.stationCode);
    const live = liveByCode.get(gs.stationCode);
    const levelM = lvl?.value ?? live?.value ?? null;
    const dangerLevelM = st?.dangerLevel ?? null;
    const warningLevelM = st?.warningLevel ?? null;
    const highestFloodLevelM = st?.highestFlowLevel ?? null;
    stations.push({
      stationCode: gs.stationCode,
      name: gs.name || st?.nearestTown || gs.stationCode,
      lat: gs.lat,
      lng: gs.lon,
      warningLevelM,
      dangerLevelM,
      highestFloodLevelM,
      levelM,
      status: statusFor(levelM, warningLevelM, dangerLevelM, highestFloodLevelM),
      trend: trendFor(live?.trend),
      timestamp: lvl?.time ?? null,
    });
  }

  const body: LiveGaugeResponse = { ok: true, reachable: true, source, fetchedAt, region, stations };
  return NextResponse.json(body);
}
