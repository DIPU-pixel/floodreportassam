"use client";

import { useEffect, useMemo, useState } from "react";
import DragSheet from "@/components/DragSheet";
import AlertsButton from "@/components/AlertsButton";
import StreetViewLink from "@/components/StreetViewLink";
import Sparkline from "@/components/Sparkline";
import { RISK_COLORS } from "@/lib/risk";
import { GAUGE_COLORS, GAUGE_STATUS_LABEL, gaugeStatus, nearestGaugeOnRiver } from "@/lib/gauges";
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

  // The gauge whose status may actually be attributed here: same river only.
  const onRiverGauge = useMemo(
    () => (river ? nearestGaugeOnRiver(stations, river.name, place.lat, place.lng) : null),
    [river, stations, place.lat, place.lng]
  );

  // Prefer live point rain; fall back to the district-level figures.
  const past48 = rain && rainLive ? rain.past48hMm : risk?.components.past48hMm ?? 0;
  const next72 = rain && rainLive ? rain.next72hMm : risk?.components.next72hMm ?? 0;

  // Gauge status ONLY for a same-river gauge (else null → neutral message).
  const gLevel = onRiverGauge
    ? readings.get(onRiverGauge.station.id)?.levelM ?? onRiverGauge.station.dangerLevelM - 2
    : 0;
  const gStatus = onRiverGauge ? gaugeStatus(onRiverGauge.station, gLevel) : null;

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

          {/* Nearest river + gauge — a gauge status is shown ONLY when the gauge
              is on the SAME river; otherwise a neutral no-gauge note so we never
              borrow a cross-river "above danger" badge. */}
          <div className="mt-3 rounded-xl bg-slate-800/60 p-2.5 text-[12px]">
            {river && (
              <p>
                <span className="text-slate-400">Nearest river · ওচৰৰ নদী:</span>{" "}
                <span className="font-semibold">{river.name}</span>, ~{river.km.toFixed(1)} km
              </p>
            )}

            {onRiverGauge && gStatus ? (
              <div className="mt-1.5">
                <p className="flex flex-wrap items-center gap-1.5">
                  <span className="rounded bg-emerald-900/60 px-1 py-0.5 text-[9px] font-bold uppercase tracking-wide text-emerald-300">
                    Gauged · গেজ
                  </span>
                  <span className="text-slate-400">on {river?.name}:</span>{" "}
                  <span className="font-semibold">{onRiverGauge.station.name}</span>, ~
                  {onRiverGauge.km.toFixed(0)} km
                  <span
                    className="rounded-full px-1.5 py-0.5 text-[10px] font-semibold text-white"
                    style={{ backgroundColor: GAUGE_COLORS[gStatus] }}
                  >
                    {GAUGE_STATUS_LABEL[gStatus].en} · {GAUGE_STATUS_LABEL[gStatus].as}
                  </span>
                </p>
                <p className="mt-0.5 text-[11px] text-slate-400">
                  {gLevel.toFixed(2)} m / danger {onRiverGauge.station.dangerLevelM.toFixed(2)} m
                  <span className="text-slate-500"> · Source: CWC (demo level — live in Stage 3)</span>
                </p>
              </div>
            ) : (
              river && (
                <p className="mt-1.5 rounded-lg bg-slate-800 p-2 text-[11px] leading-snug text-slate-300">
                  <span className="font-semibold text-slate-200">No gauge on {river.name} near you.</span>{" "}
                  <span className="text-slate-400">{river.name} নদীৰ ওচৰত কোনো গেজ নাই।</span>
                  {nearest && (
                    <>
                      {" "}Nearest gauge:{" "}
                      <span className="font-semibold text-slate-200">{nearest.station.name}</span> on{" "}
                      <span className="font-semibold">{nearest.station.river}</span>, ~{nearest.km.toFixed(0)} km —{" "}
                      <span className="text-slate-400">a different river, so its level does not apply to you.</span>
                    </>
                  )}
                </p>
              )
            )}
          </div>

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
