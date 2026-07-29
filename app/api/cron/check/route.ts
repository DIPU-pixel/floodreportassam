import { NextResponse } from "next/server";
import { computeDistrictRisk, pronenessFor } from "@/lib/risk";
import {
  pushConfigured,
  readStore,
  removeSubscription,
  sendTo,
  type PushPayload,
} from "@/lib/push";
import type {
  District,
  FloodApiResponse,
  GaugeStation,
  RainApiResponse,
  RainfallData,
} from "@/lib/types";

/**
 * GET /api/cron/check — the alert engine. Recomputes district risk from the
 * same live feeds the app uses and pushes a notification to every subscriber
 * whose district has turned HIGH or SEVERE. Meant to be hit by a scheduler
 * (Vercel Cron, GitHub Actions, cron-job.org) every ~30–60 min.
 *
 * Protected by CRON_SECRET: pass ?secret=… or `Authorization: Bearer …`.
 * Notifications are modelled heads-ups, always labelled as such — never an
 * official warning.
 */
export const dynamic = "force-dynamic";
export const revalidate = 0;

interface GeoFile {
  features: { properties: District }[];
}

function authorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false; // fail closed — no secret set means no alerts fire
  const url = new URL(req.url);
  if (url.searchParams.get("secret") === secret) return true;
  const auth = req.headers.get("authorization");
  return auth === `Bearer ${secret}`;
}

function baseUrl(req: Request): string {
  if (process.env.NEXT_PUBLIC_SITE_URL) return process.env.NEXT_PUBLIC_SITE_URL.replace(/\/$/, "");
  return new URL(req.url).origin;
}

// Fetch bundled data over HTTP (served from /public) rather than the filesystem
// — serverless hosts (Vercel) don't reliably bundle public/ into the function.
async function fetchJson<T>(url: string): Promise<T | null> {
  try {
    const res = await fetch(url, { cache: "no-store" });
    return res.ok ? ((await res.json()) as T) : null;
  } catch {
    return null;
  }
}

export async function GET(req: Request) {
  if (!authorized(req)) return NextResponse.json({ ok: false, reason: "unauthorized" }, { status: 401 });
  if (!pushConfigured()) return NextResponse.json({ ok: false, reason: "not-configured" }, { status: 503 });

  const origin = baseUrl(req);

  // Live feeds (self-fetch, same data the browser sees) + bundled geometry,
  // all over HTTP from this deployment's own origin.
  const [rainRes, floodRes, geo, gaugeFile] = await Promise.all([
    fetchJson<RainApiResponse>(`${origin}/api/rain`),
    fetchJson<FloodApiResponse>(`${origin}/api/flood`),
    fetchJson<GeoFile>(`${origin}/data/assam_districts.geojson`),
    fetchJson<{ stations: GaugeStation[] }>(`${origin}/data/gauges.json`),
  ]);

  if (!geo) return NextResponse.json({ ok: false, reason: "no-boundaries" }, { status: 500 });

  const rainById = new Map<string, RainfallData>();
  for (const r of rainRes?.rainfall ?? []) rainById.set(r.districtId, r);

  const anomalyByStation = new Map<string, number>();
  for (const d of floodRes?.discharge ?? []) anomalyByStation.set(d.stationId, d.anomaly01);

  const stations = gaugeFile?.stations ?? [];
  const nearestStation = (lat: number, lng: number): string => {
    let best = "";
    let bestD = Infinity;
    for (const s of stations) {
      const dd = (s.lat - lat) ** 2 + (s.lng - lng) ** 2;
      if (dd < bestD) {
        bestD = dd;
        best = s.id;
      }
    }
    return best;
  };

  // Risk level per district id.
  const level = new Map<string, string>();
  const name = new Map<string, string>();
  for (const f of geo.features) {
    const p = f.properties;
    const stationId = nearestStation(p.centroidLat, p.centroidLng);
    const anomaly = stationId ? anomalyByStation.get(stationId) ?? 0 : 0;
    const risk = computeDistrictRisk(
      p.id,
      p.name,
      pronenessFor(p.id, p.floodProneness),
      rainById.get(p.id),
      anomaly
    );
    level.set(p.id, risk.level);
    name.set(p.id, p.name);
  }

  const subs = await readStore();
  let sent = 0;
  let pruned = 0;

  for (const sub of subs) {
    if (!sub.districtId) continue;
    const lvl = level.get(sub.districtId);
    if (lvl !== "high" && lvl !== "severe") continue;

    const dName = sub.districtName ?? name.get(sub.districtId) ?? "your area";
    const payload: PushPayload =
      sub.lang === "as"
        ? {
            title: `⚠ ${dName} — বানৰ বিপদ ${lvl === "severe" ? "গুৰুতৰ" : "অধিক"}`,
            body: "আৰ্হিগত সংকেত। চৰকাৰী সতৰ্কবাণী নহয় — ASDMA/CWC চাওক।",
            url: "/",
            tag: `afw-${sub.districtId}`,
          }
        : {
            title: `⚠ ${dName} — flood risk ${lvl === "severe" ? "SEVERE" : "HIGH"}`,
            body: "Modelled heads-up. Not an official warning — check ASDMA / CWC.",
            url: "/",
            tag: `afw-${sub.districtId}`,
          };

    const result = await sendTo(sub, payload);
    if (result === "sent") sent++;
    else if (result === "gone") {
      await removeSubscription(sub.endpoint);
      pruned++;
    }
  }

  return NextResponse.json(
    { ok: true, subscribers: subs.length, sent, pruned, checkedAt: new Date().toISOString() },
    { headers: { "Cache-Control": "no-store" } }
  );
}
