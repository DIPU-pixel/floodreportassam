import { NextResponse } from "next/server";

/**
 * Production health probe: is this deployment actually reaching Open-Meteo, or
 * is it serving bundled DEMO data?
 *
 *   GET /api/health → { rainStatus, floodStatus, lastLiveAt, ... }
 *
 * Deliberately uncached and single-point (one coordinate per upstream) so it
 * stays cheap and always reflects the CURRENT state, not a cached one.
 */
export const dynamic = "force-dynamic";
export const revalidate = 0;

const PROBE = { lat: 26.19, lng: 91.7 }; // Guwahati (Pandu)

interface HealthResponse {
  ok: boolean;
  rainStatus: "live" | "down";
  floodStatus: "live" | "down";
  /** ISO time of this successful check, or null if both upstreams failed. */
  lastLiveAt: string | null;
  checkedAt: string;
  rainLatencyMs?: number;
  floodLatencyMs?: number;
  notes?: string[];
}

async function probe(url: string): Promise<{ ok: boolean; ms: number; note?: string }> {
  const t0 = Date.now();
  try {
    const res = await fetch(url, { cache: "no-store" });
    const ms = Date.now() - t0;
    if (!res.ok) return { ok: false, ms, note: `HTTP ${res.status}` };
    const j = (await res.json()) as { daily?: unknown; current?: unknown };
    if (!j.daily && !j.current) return { ok: false, ms, note: "unexpected payload" };
    return { ok: true, ms };
  } catch (e) {
    return { ok: false, ms: Date.now() - t0, note: (e as Error).message };
  }
}

export async function GET(): Promise<NextResponse<HealthResponse>> {
  const checkedAt = new Date().toISOString();

  const [rain, flood] = await Promise.all([
    probe(
      `https://api.open-meteo.com/v1/forecast?latitude=${PROBE.lat}&longitude=${PROBE.lng}` +
        `&current=precipitation&timezone=Asia%2FKolkata`
    ),
    probe(
      `https://flood-api.open-meteo.com/v1/flood?latitude=${PROBE.lat}&longitude=${PROBE.lng}` +
        `&daily=river_discharge&forecast_days=1`
    ),
  ]);

  const notes = [rain.note && `rain: ${rain.note}`, flood.note && `flood: ${flood.note}`].filter(
    Boolean
  ) as string[];

  return NextResponse.json(
    {
      ok: rain.ok && flood.ok,
      rainStatus: rain.ok ? "live" : "down",
      floodStatus: flood.ok ? "live" : "down",
      lastLiveAt: rain.ok || flood.ok ? checkedAt : null,
      checkedAt,
      rainLatencyMs: rain.ms,
      floodLatencyMs: flood.ms,
      ...(notes.length ? { notes } : {}),
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}
