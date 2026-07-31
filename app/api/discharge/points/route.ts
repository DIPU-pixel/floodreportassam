import { NextResponse } from "next/server";
import type { ModelledDischarge, ModelledPointsResponse } from "@/lib/types";
import { waterTrend } from "@/lib/discharge";

/**
 * Stage 3B — modelled river discharge (GloFAS) at specific points, one per
 * nearby river, via the Open-Meteo Flood API (free, no key). Batches all points
 * in a single request. For each point we return today's discharge, a "vs the
 * last 365 days" percentile, the short-term trend and the 7-day forecast peak.
 *
 * This is MODELLED data — labelled as such in the UI and never given the weight
 * of an official gauge danger level. Cached 15 min; empty on failure (no fakes).
 */
export const dynamic = "force-dynamic";
export const revalidate = 900;

const FORECAST_DAYS = 7;

interface FloodLoc {
  daily?: { time?: string[]; river_discharge?: (number | null)[] };
}

function percentileOf(value: number, sample: number[]): number {
  if (sample.length === 0) return 0;
  const below = sample.reduce((n, v) => (v <= value ? n + 1 : n), 0);
  return below / sample.length;
}

function statusFor(p: number): ModelledDischarge["status"] {
  if (p >= 0.9) return "high";
  if (p >= 0.75) return "elevated";
  return "normal";
}

function analyse(daily: FloodLoc["daily"]): ModelledDischarge | null {
  const all = (daily?.river_discharge ?? []).map((v) => (typeof v === "number" && Number.isFinite(v) ? v : null));
  const nums = all.filter((v): v is number => v != null);
  if (nums.length < 30) return null; // not enough history to be meaningful
  const forecast = nums.slice(-FORECAST_DAYS);
  const history = nums.slice(0, nums.length - FORECAST_DAYS);
  const current = history[history.length - 1] ?? null;
  if (current == null) return null;
  const pct = percentileOf(current, history);
  // Trend: today vs mean of the previous 7 days.
  const tail = history.slice(-8);
  const trend = tail.length >= 2 ? waterTrend(tail, tail.length - 1) : null;
  return {
    currentM3s: Math.round(current),
    forecastPeakM3s: forecast.length ? Math.round(Math.max(...forecast)) : null,
    percentile: pct,
    trend,
    status: statusFor(pct),
  };
}

export async function GET(req: Request): Promise<NextResponse<ModelledPointsResponse>> {
  const fetchedAt = new Date().toISOString();
  const source = "GloFAS (Open-Meteo Flood API)";
  const p = new URL(req.url).searchParams;
  const lats = (p.get("lats") ?? "").split(",").map(Number).filter(Number.isFinite);
  const lngs = (p.get("lngs") ?? "").split(",").map(Number).filter(Number.isFinite);

  if (lats.length === 0 || lats.length !== lngs.length) {
    return NextResponse.json({ ok: false, source, fetchedAt, points: [] });
  }

  const url =
    `https://flood-api.open-meteo.com/v1/flood?latitude=${lats.join(",")}&longitude=${lngs.join(",")}` +
    `&daily=river_discharge&past_days=365&forecast_days=${FORECAST_DAYS}`;

  try {
    const res = await fetch(url, { next: { revalidate: 900 }, signal: AbortSignal.timeout(12000) });
    if (!res.ok) throw new Error(`Flood API HTTP ${res.status}`);
    const json = (await res.json()) as FloodLoc | FloodLoc[];
    const locs = Array.isArray(json) ? json : [json];
    const points = lats.map((_, i) => analyse(locs[i]?.daily));
    return NextResponse.json({ ok: true, source, fetchedAt, points });
  } catch {
    return NextResponse.json({ ok: false, source, fetchedAt, points: lats.map(() => null) });
  }
}
