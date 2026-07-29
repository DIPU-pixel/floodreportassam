"use client";

import { useEffect, useMemo, useState } from "react";
import DragSheet from "@/components/DragSheet";
import AlertsButton from "@/components/AlertsButton";
import Sparkline from "@/components/Sparkline";
import { RISK_COLORS } from "@/lib/risk";
import { GAUGE_COLORS, GAUGE_STATUS_LABEL, gaugeStatus } from "@/lib/gauges";
import { baselineFor, dischargeStatus, DISCHARGE_STATUS_LABEL, TREND_LABEL } from "@/lib/discharge";
import { areaSummary, type MyPlace } from "@/lib/myArea";
import { districtHelpline, STANDARD_HELPLINES } from "@/lib/helplines";
import { haversineKm, nearestRiver } from "@/lib/geo";
import type {
  DistrictRisk,
  FrimsEntry,
  GaugeReading,
  GaugeStation,
  PlaceInfoResponse,
  PointDischarge,
  PointFloodResponse,
  PointRain,
  PointRainResponse,
} from "@/lib/types";

export default function MyAreaPanel({
  place,
  risk,
  frims,
  stations,
  readings,
  rivers,
  onClose,
}: {
  place: MyPlace;
  risk: DistrictRisk | null;
  frims: FrimsEntry | null;
  stations: GaugeStation[];
  readings: Map<string, GaugeReading>;
  rivers: GeoJSON.FeatureCollection | null;
  onClose: () => void;
}) {
  const [rain, setRain] = useState<PointRain | null>(null);
  const [rainLive, setRainLive] = useState(false);
  const [flood, setFlood] = useState<PointDischarge | null>(null);
  const [loading, setLoading] = useState(true);
  const [placeInfo, setPlaceInfo] = useState<PlaceInfoResponse | null>(null);

  // Point data — coordinates reach only Open-Meteo (via our routes), nothing else.
  useEffect(() => {
    const ctrl = new AbortController();
    setLoading(true);
    setRain(null);
    setFlood(null);
    Promise.all([
      fetch(`/api/rain?lat=${place.lat}&lng=${place.lng}`, { signal: ctrl.signal }).then(
        (r) => r.json() as Promise<PointRainResponse>
      ),
      fetch(`/api/flood?lat=${place.lat}&lng=${place.lng}`, { signal: ctrl.signal }).then(
        (r) => r.json() as Promise<PointFloodResponse>
      ),
    ])
      .then(([rr, fr]) => {
        setRain(rr.point);
        setRainLive(rr.status === "live");
        setFlood(fr.discharge);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
    return () => ctrl.abort();
  }, [place.lat, place.lng]);

  // Area context (real photo + description) — purely to help people recognise
  // the place; never a source of flood claims.
  useEffect(() => {
    const ctrl = new AbortController();
    setPlaceInfo(null);
    fetch(
      `/api/place?name=${encodeURIComponent(place.name)}&district=${encodeURIComponent(place.districtName)}`,
      { signal: ctrl.signal }
    )
      .then((r) => r.json() as Promise<PlaceInfoResponse>)
      .then((d) => d.found && setPlaceInfo(d))
      .catch(() => {});
    return () => ctrl.abort();
  }, [place.name, place.districtName]);

  const nearest = useMemo(() => {
    let best: GaugeStation | null = null;
    let bestKm = Infinity;
    for (const s of stations) {
      const km = haversineKm(place.lat, place.lng, s.lat, s.lng);
      if (km < bestKm) {
        bestKm = km;
        best = s;
      }
    }
    return best ? { station: best, km: bestKm } : null;
  }, [stations, place.lat, place.lng]);

  // Prefer live point rain; fall back to the district-level figures.
  const past48 = rain && rainLive ? rain.past48hMm : risk?.components.past48hMm ?? 0;
  const next72 = rain && rainLive ? rain.next72hMm : risk?.components.next72hMm ?? 0;

  const gLevel = nearest
    ? readings.get(nearest.station.id)?.levelM ?? nearest.station.dangerLevelM - 2
    : 0;
  const gStatus = nearest ? gaugeStatus(nearest.station, gLevel) : null;

  const anomaly = flood && nearest ? flood.peakDischarge / baselineFor(nearest.station.id) : null;
  const dStatus = anomaly != null ? dischargeStatus(anomaly) : null;

  const river = useMemo(() => nearestRiver(place.lat, place.lng, rivers), [place.lat, place.lng, rivers]);

  const summary = risk ? areaSummary(risk.level, past48, next72) : null;
  const specificHelpline = districtHelpline(place.districtId);

  return (
    <DragSheet onClose={onClose} snap initial="peek" ariaLabel={`My area — ${place.name}`}>
      {/* Header */}
      <div className="sticky top-0 z-10 flex items-start justify-between gap-3 border-b border-slate-800 bg-slate-900/97 p-3">
          <div className="min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-sky-400">My area</p>
            <h2 className="truncate text-lg font-bold leading-tight">
              {place.name}
              <span className="font-normal text-slate-400">, {place.districtName}</span>
            </h2>
            <p className="text-[11px] text-slate-500">
              {place.lat.toFixed(3)}, {place.lng.toFixed(3)} ·{" "}
              {place.source === "gps" ? "your location" : place.source === "search" ? "searched" : "picked"}
              {!loading && !rainLive && " · demo data"}
            </p>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="shrink-0 rounded-full bg-slate-800 px-2.5 py-1 text-sm text-slate-300"
          >
            ✕
          </button>
      </div>

      <div className="p-3">
          {/* Plain-language summary */}
          {summary && (
            <div
              className="mb-3 rounded-xl p-2.5"
              style={{ backgroundColor: `${RISK_COLORS[risk!.level]}22`, borderLeft: `3px solid ${RISK_COLORS[risk!.level]}` }}
            >
              <p className="text-sm font-semibold leading-snug">
                {summary.en} <span className="text-slate-300">{summary.as}</span>
              </p>
              <p className="mt-1 text-[10px] leading-snug text-slate-400">
                Modelled estimate — not an official warning. Follow ASDMA / CWC / district administration.
              </p>
            </div>
          )}

          {/* About this area — text only (no photos), so people can recognise a
              place they don't know by name. Context, never flood data. */}
          {placeInfo && (
            <div className="mb-3 rounded-xl bg-slate-800/60 p-2">
              {placeInfo.description && (
                <p className="text-[11px] font-semibold capitalize text-sky-300">
                  {placeInfo.description}
                </p>
              )}
              <p className="line-clamp-3 text-[11px] leading-snug text-slate-300">{placeInfo.extract}</p>
              {placeInfo.pageUrl && (
                <a
                  href={placeInfo.pageUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="text-[10px] text-slate-500 underline"
                >
                  {placeInfo.source} ↗
                </a>
              )}
            </div>
          )}

          {/* Rain + risk grid — skeletons while the point fetch is in flight */}
          {loading ? (
            <div className="grid grid-cols-3 gap-2">
              {[0, 1, 2].map((i) => (
                <div key={i} className="skeleton h-[52px]" />
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="rounded-xl bg-slate-800/80 p-2">
                <p className="text-base font-bold">{past48} mm</p>
                <p className="text-[10px] text-slate-400">Rain 48h (obs.)</p>
              </div>
              <div className="rounded-xl bg-slate-800/80 p-2">
                <p className="text-base font-bold">{next72} mm</p>
                <p className="text-[10px] text-slate-400">Rain 72h (fcst.)</p>
              </div>
              <div className="rounded-xl bg-slate-800/80 p-2">
                <p className="text-base font-bold" style={{ color: risk ? RISK_COLORS[risk.level] : undefined }}>
                  {risk?.score ?? "—"}
                </p>
                <p className="text-[10px] text-slate-400">District risk /100</p>
              </div>
            </div>
          )}

          {/* Nearest river + nearest gauge */}
          <div className="mt-3 rounded-xl bg-slate-800/60 p-2.5 text-[12px]">
            {river && (
              <p>
                <span className="text-slate-400">Nearest river:</span>{" "}
                <span className="font-semibold">{river.name}</span>, ~{river.km.toFixed(1)} km
              </p>
            )}
            {nearest && (
              <p className="mt-0.5 flex items-center gap-1.5">
                <span className="text-slate-400">Nearest gauge:</span>{" "}
                <span className="font-semibold">{nearest.station.name}</span> ({nearest.station.river}), ~
                {nearest.km.toFixed(0)} km
                {gStatus && (
                  <span
                    className="rounded-full px-1.5 py-0.5 text-[10px] font-semibold text-white"
                    style={{ backgroundColor: GAUGE_COLORS[gStatus] }}
                  >
                    {GAUGE_STATUS_LABEL[gStatus].en}
                  </span>
                )}
              </p>
            )}
          </div>

          {/* Water trend — 14-day discharge (7 past + 7 forecast) */}
          {flood && flood.series14.length > 0 && dStatus && (
            <div className="mt-3 rounded-xl bg-slate-800/60 p-2.5">
              <div className="mb-1 flex items-baseline justify-between">
                <p className="text-[11px] text-slate-400">Water trend · discharge 7d past + 7d fcst.</p>
                <p className="text-[11px] font-semibold" style={{ color: DISCHARGE_STATUS_LABEL[dStatus].color }}>
                  {TREND_LABEL[flood.trend].arrow} {TREND_LABEL[flood.trend].en} · {TREND_LABEL[flood.trend].as}
                </p>
              </div>
              <Sparkline
                values={flood.series14}
                color={DISCHARGE_STATUS_LABEL[dStatus].color}
                markerIndex={flood.todayIndex}
              />
              <p className="mt-1 text-[10px] text-slate-500">
                Peak {Math.round(flood.peakDischarge).toLocaleString()} m³/s ·{" "}
                {Math.round((anomaly ?? 0) * 100)}% of nearest-gauge high baseline (modelled)
              </p>
            </div>
          )}

          {/* Official FRIMS figures */}
          {frims?.data && (
            <div className="mt-3 overflow-hidden rounded-xl border border-red-800/60 bg-red-950/30">
              <div className="bg-red-700 px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-white">
                ⚠ OFFICIAL: flood reported · {frims.source} · {frims.date}
              </div>
              <div className="flex flex-wrap gap-x-4 gap-y-1 p-2 text-[11px] text-slate-200">
                {frims.data.affectedVillages != null && <span><b>{frims.data.affectedVillages}</b> villages</span>}
                {frims.data.affectedPopulation != null && (
                  <span><b>{frims.data.affectedPopulation.toLocaleString("en-IN")}</b> people</span>
                )}
                {frims.data.reliefCamps != null && <span><b>{frims.data.reliefCamps}</b> relief camps</span>}
              </div>
            </div>
          )}

          {/* Emergency numbers for this district */}
          <div className="mt-3">
            <p className="mb-1 text-[11px] font-semibold text-slate-300">Emergency · জৰুৰীকালীন</p>
            <div className="flex flex-wrap gap-1.5">
              {specificHelpline && (
                <a href={`tel:${specificHelpline}`} className="rounded-lg bg-red-600 px-3 py-1.5 text-xs font-bold text-white">
                  📞 {place.districtName} control room {specificHelpline}
                </a>
              )}
              <a href={`tel:${STANDARD_HELPLINES.districtControlRoom}`} className="rounded-lg bg-red-600 px-3 py-1.5 text-xs font-bold text-white">
                📞 District {STANDARD_HELPLINES.districtControlRoom}
              </a>
              <a href={`tel:${STANDARD_HELPLINES.stateHelpline}`} className="rounded-lg bg-red-600 px-3 py-1.5 text-xs font-bold text-white">
                📞 State {STANDARD_HELPLINES.stateHelpline}
              </a>
              <a href={`tel:${STANDARD_HELPLINES.ndrf}`} className="rounded-lg bg-red-600 px-3 py-1.5 text-xs font-bold text-white">
                📞 NDRF {STANDARD_HELPLINES.ndrf}
              </a>
            </div>
          </div>

          {place.districtId && (
            <AlertsButton districtId={place.districtId} districtName={place.districtName} />
          )}

          <p className="mt-3 text-[10px] leading-snug text-slate-500">
            Privacy: your location is used in your browser and sent only to the weather service for this
            spot — never logged or stored on our servers.
          </p>
      </div>
    </DragSheet>
  );
}
