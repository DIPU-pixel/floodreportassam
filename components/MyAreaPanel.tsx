"use client";

import { useEffect, useMemo, useState } from "react";
import DragSheet from "@/components/DragSheet";
import AlertsButton from "@/components/AlertsButton";
import StreetViewLink from "@/components/StreetViewLink";
import NearbyRivers from "@/components/NearbyRivers";
import Sparkline from "@/components/Sparkline";
import { RISK_COLORS } from "@/lib/risk";
import { GAUGE_STATUS_LABEL, nearestGaugeOnRiver } from "@/lib/gauges";
import { baselineFor, dischargeStatus, DISCHARGE_STATUS_LABEL, TREND_LABEL } from "@/lib/discharge";
import { buildRiverRows, worstRiverRow } from "@/lib/rivers";
import { areaSummary, type MyPlace } from "@/lib/myArea";
import { districtHelpline, STANDARD_HELPLINES } from "@/lib/helplines";
import { haversineKm, nearbyRivers, nearestRiver } from "@/lib/geo";
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
  gaugeMeta,
  onClose,
}: {
  place: MyPlace;
  risk: DistrictRisk | null;
  frims: FrimsEntry | null;
  stations: GaugeStation[];
  readings: Map<string, GaugeReading>;
  rivers: GeoJSON.FeatureCollection | null;
  gaugeMeta?: { source: string; fetchedAt: string; reachable: boolean } | null;
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

  // Raw nearest gauge — used ONLY to tell the user where the closest gauge is
  // when none exists on their own river. Its status is NEVER shown as theirs.
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

  const river = useMemo(() => nearestRiver(place.lat, place.lng, rivers), [place.lat, place.lng, rivers]);

  // Stage 2: ALL rivers within 10 km (widen to 25 km if none), ranked nearest
  // first. Each carries only its own same-river gauge.
  const nearby = useMemo(() => {
    if (!rivers) return [];
    const within10 = nearbyRivers(place.lat, place.lng, rivers, 10);
    return within10.length > 0 ? within10 : nearbyRivers(place.lat, place.lng, rivers, 25);
  }, [rivers, place.lat, place.lng]);

  const riverRows = useMemo(
    () => buildRiverRows(nearby, stations, readings, place.lat, place.lng),
    [nearby, stations, readings, place.lat, place.lng]
  );

  // Overall card risk from same-river gauges only — worst wins, names the river.
  const worstRow = useMemo(() => worstRiverRow(riverRows), [riverRows]);

  // The gauge whose status may actually be attributed here: same river only.
  const onRiverGauge = useMemo(
    () => (river ? nearestGaugeOnRiver(stations, river.name, place.lat, place.lng) : null),
    [river, stations, place.lat, place.lng]
  );

  // Prefer live point rain; fall back to the district-level figures.
  const past48 = rain && rainLive ? rain.past48hMm : risk?.components.past48hMm ?? 0;
  const next72 = rain && rainLive ? rain.next72hMm : risk?.components.next72hMm ?? 0;

  // Discharge anomaly is only meaningful against a same-river gauge's baseline.
  const anomaly =
    flood && onRiverGauge ? flood.peakDischarge / baselineFor(onRiverGauge.station.id) : null;
  const dStatus = anomaly != null ? dischargeStatus(anomaly) : null;

  const summary = risk ? areaSummary(risk.level, past48, next72) : null;
  const specificHelpline = districtHelpline(place.districtId);

  return (
    <DragSheet onClose={onClose} snap initial="peek" ariaLabel={`My area — ${place.name}`}>
      {/* Header */}
      <div className="sticky top-0 z-10 flex items-start justify-between gap-3 border-b border-slate-800 bg-slate-900 p-3">
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
          {/* Look at this exact spot in Google Maps / Street View. */}
          <StreetViewLink lat={place.lat} lng={place.lng} />

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

          {/* Worst same-river gauge above danger → the card's headline risk,
              naming THAT river specifically (never a cross-river badge). */}
          {worstRow && worstRow.gauge && (
            <div className="mt-3 rounded-xl border-l-4 border-red-500 bg-red-950/40 p-2.5">
              <p className="text-sm font-bold text-red-200">
                ⚠ {worstRow.name}
                {worstRow.nameAs && <span className="font-normal"> · {worstRow.nameAs}</span>}{" "}
                — {GAUGE_STATUS_LABEL[worstRow.gauge.status].en}
              </p>
              <p className="text-[11px] text-red-300/90">
                {worstRow.gauge.name}: {worstRow.gauge.levelM.toFixed(2)} m / danger{" "}
                {worstRow.gauge.dangerLevelM.toFixed(2)} m · {GAUGE_STATUS_LABEL[worstRow.gauge.status].as}
              </p>
            </div>
          )}

          {/* Stage 2: ranked nearby rivers, each with its OWN same-river gauge. */}
          <NearbyRivers
            rows={riverRows}
            sourceLabel={
              gaugeMeta?.reachable
                ? "Source: CWC Flood Forecasting · live."
                : "Gauge levels: demo (CWC live source unreachable)."
            }
            crossRiverNote={
              nearest
                ? `No gauge on any river near you. Nearest gauge: ${nearest.station.name} on ${nearest.station.river}, ~${nearest.km.toFixed(
                    0
                  )} km — a different river, so its level does not apply to you. · ওচৰৰ কোনো নদীত গেজ নাই।`
                : undefined
            }
          />

          {/* Modelled river discharge (GloFAS via Open-Meteo). Always labelled
              modelled; the "% of baseline" band only appears when a same-river
              gauge exists to calibrate it — otherwise trend only, no danger band. */}
          {flood && flood.series14.length > 0 && (
            <div className="mt-3 rounded-xl bg-slate-800/60 p-2.5">
              <div className="mb-1 flex items-baseline justify-between gap-2">
                <p className="flex items-center gap-1.5 text-[11px] text-slate-400">
                  <span className="rounded bg-sky-900/60 px-1 py-0.5 text-[9px] font-bold uppercase tracking-wide text-sky-300">
                    Modelled · মডেল
                  </span>
                  River flow · 7d past + 7d fcst.
                </p>
                <p
                  className="text-[11px] font-semibold"
                  style={{ color: dStatus ? DISCHARGE_STATUS_LABEL[dStatus].color : "#38bdf8" }}
                >
                  {TREND_LABEL[flood.trend].arrow} {TREND_LABEL[flood.trend].en} · {TREND_LABEL[flood.trend].as}
                </p>
              </div>
              <Sparkline
                values={flood.series14}
                color={dStatus ? DISCHARGE_STATUS_LABEL[dStatus].color : "#38bdf8"}
                markerIndex={flood.todayIndex}
              />
              <p className="mt-1 text-[10px] text-slate-500">
                Peak {Math.round(flood.peakDischarge).toLocaleString()} m³/s ·{" "}
                {onRiverGauge && dStatus ? (
                  <>
                    {Math.round((anomaly ?? 0) * 100)}% of {onRiverGauge.station.name} high baseline ·{" "}
                    {DISCHARGE_STATUS_LABEL[dStatus].en} (modelled)
                  </>
                ) : (
                  <>modelled flow (GloFAS) — no gauge on {river?.name ?? "this river"} to set a danger level</>
                )}
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
