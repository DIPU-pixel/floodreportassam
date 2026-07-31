import { NextResponse } from "next/server";

/**
 * Stage 3 PROBE — live CWC Flood Forecasting (FFS) gauge data.
 *
 * Source: https://ffs.india-water.gov.in (Central Water Commission, via its
 * internal REST API discovered from the dashboard's own XHR calls):
 *   • /iam/api/flood-forecast-static  → station master: danger / warning /
 *     highest-flood levels, nearest town, CWC meteorological subdivision.
 *   • /ffm/api/station-water-level-above-warning → LIVE current level, status
 *     (WARNING/DANGER), and trend for every station currently above warning.
 *
 * This route exists to answer ONE question before we build the full feature:
 * is CWC FFS reachable from Vercel's datacenter IP? Government sites often
 * block them. It fails gracefully with an honest flag rather than faking data.
 *
 * Cached 15 min. Not an official warning — CWC/ASDMA remain authoritative.
 */
export const revalidate = 900;

const FFS = "https://ffs.india-water.gov.in";
const HEADERS = {
  "User-Agent": "AssamFloodWatch/1.0 (+public flood information; contact via app)",
  Accept: "application/json",
  Referer: "https://ffs.india-water.gov.in/",
};

interface StaticStation {
  stationCode: string;
  dangerLevel: number | null;
  warningLevel: number | null;
  highestFlowLevel: number | null;
  nearestTown: string | null;
  meteorologicalSubDivision: string | null;
}
interface AboveWarning {
  stationCode: string;
  status: string;
  trend: string | null;
  value: number;
}

const diagnostics: Record<string, string> = {};

async function getJson<T>(label: string, url: string): Promise<T | null> {
  try {
    const res = await fetch(url, { headers: HEADERS, cache: "no-store", signal: AbortSignal.timeout(12000) });
    diagnostics[label] = `http ${res.status}`;
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch (e) {
    // Distinguish block/timeout/DNS on the next deployed test.
    diagnostics[label] = `${(e as Error)?.name ?? "error"}: ${(e as Error)?.message ?? ""}`.slice(0, 120);
    return null;
  }
}

// CWC groups Assam stations under these subdivisions / circles.
const ASSAM_RE = /assam|dibrugarh|silchar|barak|jorhat|tezpur|goalpara|dhubri|guwahati|nagaon|lakhimpur/i;

export async function GET() {
  const spec = encodeURIComponent(
    JSON.stringify({
      where: { expression: { valueIsRelationField: false, fieldName: "type", operator: "eq", value: "Level" } },
    })
  );
  const [above, master] = await Promise.all([
    getJson<AboveWarning[]>("aboveWarning", `${FFS}/ffm/api/station-water-level-above-warning/`),
    getJson<StaticStation[]>("master", `${FFS}/iam/api/flood-forecast-static/specification/?specification=${spec}`),
  ]);
  const region = process.env.VERCEL_REGION ?? "local";

  const fetchedAt = new Date().toISOString();
  const source = "CWC Flood Forecasting (ffs.india-water.gov.in)";

  if (!above || !master) {
    return NextResponse.json({
      ok: false,
      reachable: false,
      source,
      fetchedAt,
      region,
      diagnostics,
      message:
        "CWC FFS did not respond from the server — it may block datacenter (Vercel) IPs or be geo-restricted. No data shown rather than fabricated.",
    });
  }

  const liveByCode = new Map(above.map((a) => [a.stationCode, a]));
  const stations = master
    .filter((s) => ASSAM_RE.test(`${s.meteorologicalSubDivision ?? ""} ${s.nearestTown ?? ""}`))
    .map((s) => {
      const live = liveByCode.get(s.stationCode) ?? null;
      return {
        stationCode: s.stationCode,
        nearestTown: s.nearestTown || null,
        subdivision: s.meteorologicalSubDivision || null,
        dangerLevel: s.dangerLevel,
        warningLevel: s.warningLevel,
        highestFlowLevel: s.highestFlowLevel,
        live: live ? { status: live.status, trend: live.trend, levelM: live.value } : null,
      };
    });

  return NextResponse.json({
    ok: true,
    reachable: true,
    source,
    fetchedAt,
    region,
    nationwideAboveWarning: above.length,
    assamStationCount: stations.length,
    assamAboveWarning: stations.filter((s) => s.live).length,
    stations,
  });
}
