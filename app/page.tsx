"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import FloodMap from "@/components/FloodMap";
import BottomSheet from "@/components/BottomSheet";
import GaugeSheet from "@/components/GaugeSheet";
import LegendSheet from "@/components/LegendSheet";
import StatusBadge from "@/components/StatusBadge";
import LanguageToggle from "@/components/LanguageToggle";
import BottomTabs, { type TabKey } from "@/components/BottomTabs";
import CoachMark from "@/components/CoachMark";
import TimeSlider from "@/components/TimeSlider";
import AffectedPanel from "@/components/AffectedPanel";
import EmergencyPanel from "@/components/EmergencyPanel";
import dynamic from "next/dynamic";
import MyAreaSearch from "@/components/MyAreaSearch";
import MyAreaPanel from "@/components/MyAreaPanel";
import SituationBar from "@/components/SituationBar";
import { useT } from "@/lib/i18n";

// Three.js rain loads lazily — only when flood view is first opened, so the
// base app stays light on cheap phones / slow 4G.
const RainOverlay = dynamic(() => import("@/components/RainOverlay"), { ssr: false });
import { computeDistrictRisk, FLOOD_PRONENESS } from "@/lib/risk";
import { DEMO_GAUGE_READINGS, gaugeStatus } from "@/lib/gauges";
import { DEMO_RAINFALL } from "@/lib/demoData";
import { forecastHourly, rainColor } from "@/lib/rainForecast";
import { usePolling, combineStatus } from "@/lib/useLiveData";
import { findDistrict, nearestTown } from "@/lib/geo";
import { districtSlug, saveMyPlace, type MyPlace } from "@/lib/myArea";
import type {
  District,
  DistrictRisk,
  FloodApiResponse,
  FrimsDistrict,
  FrimsEntry,
  FrimsReport,
  GaugeMarkerData,
  GaugeReading,
  GaugeStation,
  RainApiResponse,
  RainfallData,
  Town,
} from "@/lib/types";

interface GeoJson {
  type: "FeatureCollection";
  features: { type: "Feature"; properties: District; geometry: unknown }[];
}

type SheetName = "districts" | "emergency" | null;

export default function Home() {
  const t = useT();
  const [geo, setGeo] = useState<GeoJson | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [gaugeStations, setGaugeStations] = useState<GaugeStation[]>([]);
  const [selectedGaugeId, setSelectedGaugeId] = useState<string | null>(null);
  const [frims, setFrims] = useState<FrimsReport | null>(null);
  const [towns, setTowns] = useState<Town[]>([]);
  const [rivers, setRivers] = useState<GeoJSON.FeatureCollection | null>(null);
  const [myPlace, setMyPlace] = useState<MyPlace | null>(null);

  // Stage-4 UI state.
  const [activeSheet, setActiveSheet] = useState<SheetName>(null);
  const [rainMode, setRainMode] = useState(false);
  const [rainHour, setRainHour] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [floodView, setFloodView] = useState(false);
  const [legendOpen, setLegendOpen] = useState(false);
  const [flyTo, setFlyTo] = useState<{ lng: number; lat: number; zoom?: number } | null>(null);

  // Load district boundaries once.
  useEffect(() => {
    fetch("/data/assam_districts.geojson")
      .then((r) => r.json() as Promise<GeoJson>)
      .then(setGeo)
      .catch((e) => console.error("boundary load failed", e));
  }, []);

  // Load the river network once (for nearest-river in the town panel).
  useEffect(() => {
    fetch("/data/rivers.geojson")
      .then((r) => (r.ok ? r.json() : fetch("/data/assam_rivers.geojson").then((r2) => r2.json())))
      .then((fc) => setRivers(fc as GeoJSON.FeatureCollection))
      .catch(() => {});
  }, []);

  // Load gauge stations once.
  useEffect(() => {
    fetch("/data/gauges.json")
      .then((r) => r.json() as Promise<{ stations: GaugeStation[] }>)
      .then((d) => setGaugeStations(d.stations ?? []))
      .catch((e) => console.error("gauge load failed", e));
  }, []);

  // Load OPTIONAL official FRIMS figures — only keep a report that actually
  // has dated district entries (the bundled file is an empty template).
  useEffect(() => {
    fetch("/data/frims-latest.json")
      .then((r) => (r.ok ? (r.json() as Promise<FrimsReport>) : null))
      .then((d) => {
        if (d && d.date && Array.isArray(d.districts) && d.districts.length > 0) setFrims(d);
      })
      .catch(() => {});
  }, []);

  // Load bundled towns once. The last checked place is saved to storage but
  // NOT auto-opened — each visit starts clean; My Area opens only on user action.
  useEffect(() => {
    fetch("/data/towns.json")
      .then((r) => r.json() as Promise<Town[]>)
      .then((t) => setTowns(t ?? []))
      .catch((e) => console.error("towns load failed", e));
  }, []);

  // Poll the two live feeds every 15 min (keeps last data on failure).
  const rainPoll = usePolling<RainApiResponse>("/api/rain");
  const floodPoll = usePolling<FloodApiResponse>("/api/flood");

  const status = combineStatus(rainPoll.status, floodPoll.status);
  const updatedAt = rainPoll.fetchedAt ?? floodPoll.fetchedAt;

  // Never blank: fall back to bundled demo data until a response arrives.
  const rain = rainPoll.data?.rainfall ?? DEMO_RAINFALL;
  const discharge = useMemo(() => floodPoll.data?.discharge ?? [], [floodPoll.data]);

  const rainById = useMemo(
    () => new Map<string, RainfallData>(rain.map((r) => [r.districtId, r])),
    [rain]
  );

  const centroidById = useMemo(() => {
    const m = new Map<string, { lng: number; lat: number }>();
    if (geo) for (const f of geo.features) {
      m.set(f.properties.id, { lng: f.properties.centroidLng, lat: f.properties.centroidLat });
    }
    return m;
  }, [geo]);

  const districtList = useMemo(
    () =>
      (geo?.features ?? [])
        .map((f) => ({ id: f.properties.id, name: f.properties.name }))
        .sort((a, b) => a.name.localeCompare(b.name)),
    [geo]
  );

  // Nearest gauge → discharge anomaly (0–1) for the risk blend.
  const anomalyByStation = useMemo(() => {
    const m = new Map<string, number>();
    for (const d of discharge) m.set(d.stationId, d.anomaly01);
    return m;
  }, [discharge]);

  const nearestStationId = useMemo(() => {
    const m = new Map<string, string>();
    if (!geo || gaugeStations.length === 0) return m;
    for (const f of geo.features) {
      const { centroidLat: la, centroidLng: lo } = f.properties;
      let best = "";
      let bestD = Infinity;
      for (const s of gaugeStations) {
        const dd = (s.lat - la) ** 2 + (s.lng - lo) ** 2;
        if (dd < bestD) {
          bestD = dd;
          best = s.id;
        }
      }
      m.set(f.properties.id, best);
    }
    return m;
  }, [geo, gaugeStations]);

  // Water-LEVEL readings stay demo (no free live level feed); the gauge sheet's
  // 7-day sparkline and anomaly use live discharge.
  const readingById = useMemo(
    () => new Map<string, GaugeReading>(DEMO_GAUGE_READINGS.map((r) => [r.stationId, r])),
    []
  );

  const gaugeMarkers: GaugeMarkerData[] = useMemo(
    () =>
      gaugeStations.map((s) => {
        const level = readingById.get(s.id)?.levelM ?? s.dangerLevelM - 2;
        const trend = discharge.find((d) => d.stationId === s.id)?.trend;
        return { id: s.id, lat: s.lat, lng: s.lng, status: gaugeStatus(s, level), trend };
      }),
    [gaugeStations, readingById, discharge]
  );

  const selectedGauge = useMemo(
    () => gaugeStations.find((s) => s.id === selectedGaugeId) ?? null,
    [gaugeStations, selectedGaugeId]
  );

  const risks: DistrictRisk[] = useMemo(() => {
    if (!geo) return [];
    return geo.features
      .map((f) => {
        const id = f.properties.id;
        const stationId = nearestStationId.get(id);
        const anomaly = stationId ? anomalyByStation.get(stationId) ?? 0 : 0;
        const proneness = FLOOD_PRONENESS[id] ?? f.properties.floodProneness;
        return computeDistrictRisk(id, f.properties.name, proneness, rainById.get(id), anomaly);
      })
      .sort((a, b) => b.score - a.score);
  }, [geo, rainById, nearestStationId, anomalyByStation]);

  // Rain-forecast fill: recolour every district by its forecast rain (mm/h) at
  // the selected hour. Null → map uses risk colours.
  const fillOverride = useMemo(() => {
    if (!rainMode) return null;
    const m: Record<string, string> = {};
    for (const r of rain) {
      const hourly = forecastHourly(r);
      const idx = Math.min(rainHour, hourly.length - 1);
      m[r.districtId] = rainColor(hourly[idx] ?? 0);
    }
    return m;
  }, [rainMode, rainHour, rain]);

  // Modelled flood view: which districts show floodwater, and how intense.
  // ESTIMATE from the risk score — never observed water extent.
  const floodByDistrict = useMemo(() => {
    if (!floodView) return null;
    const m: Record<string, number> = {};
    for (const r of risks) {
      if (r.score >= 35) m[r.districtId] = Math.min(1, (r.score - 25) / 65);
    }
    return m;
  }, [floodView, risks]);

  // Rain animation intensity from precipitation happening RIGHT NOW (mm/h).
  // 0 when it isn't raining anywhere → the overlay stays off, so the effect
  // only ever appears when there is actual live rain.
  const rainIntensity = useMemo(() => {
    let mx = 0;
    for (const r of rain) mx = Math.max(mx, r.currentMm ?? 0);
    if (mx < 0.1) return 0; // dry
    // 0.1 mm/h drizzle → faint; 12 mm/h+ downpour → full.
    return Math.min(1, 0.2 + mx / 12);
  }, [rain]);

  const isRainingNow = rainIntensity > 0;

  // Gauges currently at/above danger — each traces to a named station + its own
  // river; this is the ONLY source for any "above danger" claim in the UI.
  const aboveDangerGauges = useMemo(
    () =>
      gaugeMarkers
        .filter((g) => g.status === "danger" || g.status === "extreme")
        .map((g) => {
          const s = gaugeStations.find((st) => st.id === g.id);
          if (!s) return null;
          const levelM = readingById.get(s.id)?.levelM ?? s.dangerLevelM;
          return { name: s.name, river: s.river, levelM, dangerLevelM: s.dangerLevelM };
        })
        .filter((g): g is NonNullable<typeof g> => g !== null),
    [gaugeMarkers, gaugeStations, readingById]
  );

  // Rivers to highlight red: those whose gauge is at/above danger level.
  const alertRivers = useMemo(
    () => Array.from(new Set(aboveDangerGauges.map((g) => g.river))),
    [aboveDangerGauges]
  );

  const selectedDischarge = useMemo(
    () => discharge.find((d) => d.stationId === selectedGaugeId) ?? null,
    [discharge, selectedGaugeId]
  );

  const selected = useMemo(
    () => risks.find((r) => r.districtId === selectedId) ?? null,
    [risks, selectedId]
  );

  // Resolve FRIMS by districtId (from explicit id or slugified name), and gate
  // on freshness — a report older than 48h is treated as stale (shown as none).
  const frimsFresh = useMemo(() => {
    if (!frims?.date) return false;
    const t = Date.parse(frims.date);
    return Number.isFinite(t) && Date.now() - t < 48 * 3600 * 1000;
  }, [frims]);

  const frimsById = useMemo(() => {
    const m = new Map<string, FrimsDistrict>();
    if (frims && frimsFresh) {
      for (const d of frims.districts) m.set(d.districtId ?? districtSlug(d.name), d);
    }
    return m;
  }, [frims, frimsFresh]);

  const frimsEntry = useCallback(
    (districtId: string): FrimsEntry | null => {
      const data = frimsById.get(districtId);
      return data && frims ? { source: frims.source, date: frims.date, fresh: true, data } : null;
    },
    [frimsById, frims]
  );

  const selectedFrims = useMemo(
    () => (selectedId ? frimsEntry(selectedId) : null),
    [selectedId, frimsEntry]
  );

  const myRisk = useMemo(
    () => (myPlace ? risks.find((r) => r.districtId === myPlace.districtId) ?? null : null),
    [risks, myPlace]
  );

  const myFrims = useMemo(
    () => (myPlace ? frimsEntry(myPlace.districtId) : null),
    [myPlace, frimsEntry]
  );

  const townsForSelected = useMemo(
    () =>
      selectedId
        ? towns.filter((t) => t.districtId === selectedId).sort((a, b) => a.name.localeCompare(b.name))
        : [],
    [towns, selectedId]
  );

  // --- Exclusive selection/panel handlers -------------------------------
  // One sheet at a time: every opener clears the others (incl. the legend).
  const selectDistrict = useCallback((id: string | null) => {
    setSelectedId(id);
    setSelectedGaugeId(null);
    if (id) {
      setActiveSheet(null);
      setMyPlace(null);
      setLegendOpen(false);
    }
  }, []);

  const selectGauge = useCallback((id: string) => {
    setSelectedGaugeId(id);
    setSelectedId(null);
    setActiveSheet(null);
    setMyPlace(null);
    setLegendOpen(false);
  }, []);

  const openSheet = useCallback((name: Exclude<SheetName, null>) => {
    setActiveSheet((prev) => (prev === name ? null : name));
    setSelectedId(null);
    setSelectedGaugeId(null);
    setMyPlace(null);
    setLegendOpen(false);
  }, []);

  const toggleLegend = useCallback(() => {
    setLegendOpen((v) => {
      const next = !v;
      if (next) {
        setActiveSheet(null);
        setSelectedId(null);
        setSelectedGaugeId(null);
        setMyPlace(null);
      }
      return next;
    });
  }, []);

  const toggleRain = useCallback(() => {
    setRainMode((v) => {
      const next = !v;
      if (next) {
        setActiveSheet(null);
        setSelectedId(null);
        setSelectedGaugeId(null);
        setMyPlace(null);
        setFloodView(false);
        setLegendOpen(false);
      } else {
        setPlaying(false);
      }
      return next;
    });
  }, []);

  const toggleFlood = useCallback(() => {
    setFloodView((v) => {
      const next = !v;
      if (next) {
        setRainMode(false);
        setLegendOpen(false);
      }
      return next;
    });
  }, []);

  // Single bottom tab bar → the four primary actions.
  const onTab = useCallback(
    (key: TabKey) => {
      if (key === "districts") openSheet("districts");
      else if (key === "emergency") openSheet("emergency");
      else if (key === "rain") toggleRain();
      else if (key === "flood") toggleFlood();
    },
    [openSheet, toggleRain, toggleFlood]
  );

  const activeTabs = useMemo(() => {
    const s = new Set<TabKey>();
    if (activeSheet === "districts") s.add("districts");
    if (activeSheet === "emergency") s.add("emergency");
    if (rainMode) s.add("rain");
    if (floodView) s.add("flood");
    return s;
  }, [activeSheet, rainMode, floodView]);

  const selectFromPanel = useCallback(
    (id: string) => {
      const c = centroidById.get(id);
      if (c) setFlyTo({ lng: c.lng, lat: c.lat, zoom: 8.5 });
      selectDistrict(id);
    },
    [centroidById, selectDistrict]
  );

  // Resolve any lat/lng to a district (client-side point-in-polygon) + name,
  // then open My Area. Coordinates never leave the browser here.
  const resolveAndPick = useCallback(
    (lat: number, lng: number, opts: { name?: string; source: MyPlace["source"] }) => {
      if (!geo) return;
      const hit = findDistrict(lng, lat, geo.features as unknown as GeoJSON.Feature[]);
      let districtId = hit?.id ?? "";
      let districtName = hit?.name ?? "";
      if (!hit) {
        // Point just outside the polygons — snap to the nearest district.
        let bestD = Infinity;
        for (const f of geo.features) {
          const dd = (f.properties.centroidLat - lat) ** 2 + (f.properties.centroidLng - lng) ** 2;
          if (dd < bestD) {
            bestD = dd;
            districtId = f.properties.id;
            districtName = f.properties.name;
          }
        }
      }
      const name = opts.name ?? nearestTown(lat, lng, towns)?.town.name ?? "My location";
      const place: MyPlace = { name, districtId, districtName, lat, lng, source: opts.source };
      setMyPlace(place);
      saveMyPlace(place);
      setFlyTo({ lng, lat, zoom: 10 });
      setSelectedId(null);
      setSelectedGaugeId(null);
      setActiveSheet(null);
      setRainMode(false);
      setPlaying(false);
      setLegendOpen(false);
    },
    [geo, towns]
  );

  const pickTown = useCallback(
    (t: Town) => resolveAndPick(t.lat, t.lng, { name: t.name, source: "picker" }),
    [resolveAndPick]
  );

  const closeMyArea = useCallback(() => setMyPlace(null), []);

  const anySheetOpen =
    !!selectedId || !!selectedGauge || activeSheet !== null || !!myPlace || legendOpen;
  const showSlider = rainMode && !anySheetOpen;

  return (
    <main className="relative h-full w-full overflow-hidden">
      <FloodMap
        geo={geo}
        risks={risks}
        onSelect={selectDistrict}
        selectedId={selectedId}
        gauges={gaugeMarkers}
        onSelectGauge={selectGauge}
        fillOverride={fillOverride}
        flyTo={flyTo}
        pin={myPlace ? { lng: myPlace.lng, lat: myPlace.lat } : null}
        floodByDistrict={floodByDistrict}
        alertRivers={alertRivers}
      />

      {/* Atmospheric rain (Three.js) — only when it is ACTUALLY raining now,
          and only in flood view (which is also when Three.js downloads). */}
      {floodView && isRainingNow && <RainOverlay active intensity={rainIntensity} />}

      {/* Modelled-extent honesty badge */}
      {floodView && (
        <div className="pointer-events-none absolute inset-x-0 top-28 z-10 flex justify-center px-3">
          <span className="rounded-full bg-blue-950/85 px-3 py-1 text-[11px] font-semibold text-blue-100 shadow-lg backdrop-blur">
            🌊 Modelled flood extent — estimate, not observed water
            {isRainingNow ? " · 🌧 raining now (live)" : " · no rain right now"}
          </span>
        </div>
      )}

      {/* Title bar + area search */}
      {/* Left column only — the top-right stays clear for the map's zoom controls. */}
      <header className="pointer-events-none absolute left-0 top-0 z-10 flex max-w-[min(28rem,calc(100%-5rem))] flex-col gap-2 p-3">
        <div className="pointer-events-auto flex flex-wrap items-center gap-2">
          <div className="rounded-xl bg-slate-900/85 px-3 py-2 shadow-lg backdrop-blur">
            <h1 className="text-sm font-bold leading-tight">{t("app.title")}</h1>
            <p className="text-[11px] text-slate-400">
              {rainMode ? t("app.subtitle.rain") : t("app.subtitle.risk")}
            </p>
          </div>
          <StatusBadge status={status} updatedAt={updatedAt} />
          <LanguageToggle />
          <button
            onClick={toggleLegend}
            aria-pressed={legendOpen}
            aria-label={t("legend.title")}
            className="pointer-events-auto flex items-center gap-1 rounded-full bg-slate-900/90 px-2.5 py-1 text-[10px] font-semibold text-slate-200 shadow-lg backdrop-blur"
          >
            <span aria-hidden>ⓘ</span>
            <span>{t("legend.open")}</span>
          </button>
        </div>
        {/* Plain-language "what's happening" line — the first thing to read. */}
        <SituationBar
          risks={risks}
          gaugesAboveDanger={aboveDangerGauges.length}
          aboveDangerGauges={aboveDangerGauges}
          officialDistricts={frimsById.size}
          officialDate={frims?.date}
          rainingNow={isRainingNow}
          onOpenList={() => openSheet("districts")}
        />

        {/* Left-aligned, collapsed by default — expands only when tapped. */}
        <MyAreaSearch districts={districtList} towns={towns} onResolve={resolveAndPick} />
      </header>

      {/* Map key — opened from the ⓘ button, one combined sheet. */}
      {legendOpen && <LegendSheet onClose={() => setLegendOpen(false)} />}

      {/* Bottom cards (mutually exclusive) */}
      <BottomSheet
        risk={selected}
        frims={selectedFrims}
        towns={townsForSelected}
        center={selectedId ? centroidById.get(selectedId) ?? null : null}
        onTown={pickTown}
        onClose={() => setSelectedId(null)}
      />

      <GaugeSheet
        station={selectedGauge}
        reading={selectedGauge ? readingById.get(selectedGauge.id) ?? null : null}
        discharge={selectedDischarge}
        onClose={() => setSelectedGaugeId(null)}
      />

      {activeSheet === "districts" && (
        <AffectedPanel
          risks={risks}
          frimsById={frimsById}
          onSelect={selectFromPanel}
          onClose={() => setActiveSheet(null)}
        />
      )}

      {activeSheet === "emergency" && <EmergencyPanel onClose={() => setActiveSheet(null)} />}

      {myPlace && (
        <MyAreaPanel
          place={myPlace}
          risk={myRisk}
          frims={myFrims}
          stations={gaugeStations}
          readings={readingById}
          rivers={rivers}
          onClose={closeMyArea}
        />
      )}

      {showSlider && (
        <TimeSlider
          hour={rainHour}
          playing={playing}
          onHour={setRainHour}
          onTogglePlay={() => setPlaying((p) => !p)}
          onClose={toggleRain}
        />
      )}

      {/* Single icon tab bar — Emergency always one tap away. */}
      <BottomTabs active={activeTabs} onSelect={onTab} />

      {/* First-run coach mark (once per device). */}
      <CoachMark />

      {/* Permanent disclaimer footer */}
      <footer className="absolute inset-x-0 bottom-0 z-10 bg-slate-950/90 px-3 py-1.5 text-center text-[10px] leading-snug text-slate-400">
        Informational only — modelled from public data (Open-Meteo).{" "}
        For official warnings follow{" "}
        <a className="underline" href="https://asdma.assam.gov.in" target="_blank" rel="noreferrer">ASDMA</a>{" "}
        /{" "}
        <a className="underline" href="https://ffs.india-water.gov.in" target="_blank" rel="noreferrer">CWC</a>{" "}
        / district administration. Helplines: 1079 (state) · 1077 (district) · NDRF 9711077372
      </footer>
    </main>
  );
}
