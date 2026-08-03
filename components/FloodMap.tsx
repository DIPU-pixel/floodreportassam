"use client";

import { useEffect, useRef, useState } from "react";
import maplibregl from "maplibre-gl";
import { RISK_COLORS } from "@/lib/risk";
import { GAUGE_COLORS } from "@/lib/gauges";
import { prettyRiver } from "@/lib/geo";
import { useT } from "@/lib/i18n";
import type { DistrictRisk, GaugeMarkerData } from "@/lib/types";
import { helpTypeLabel, type HelpPin } from "@/lib/helpTypes";

interface Props {
  geo: GeoJSON.FeatureCollection | { type: string } | null;
  risks: DistrictRisk[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  gauges?: GaugeMarkerData[];
  onSelectGauge?: (id: string) => void;
  /** When set, overrides district fill colours (e.g. rain-forecast view). */
  fillOverride?: Record<string, string> | null;
  /** Change this object to fly the map to a location. */
  flyTo?: { lng: number; lat: number; zoom?: number } | null;
  /** "My area" pin location, or null to remove it. */
  pin?: { lng: number; lat: number } | null;
  /** Modelled flood view: districtId → inundation intensity 0–1, or null to hide. */
  floodByDistrict?: Record<string, number> | null;
  /** River names whose gauges are above danger — these get the red glow. */
  alertRivers?: string[];
  /** Community help requests to plot on the map (approx location). */
  helpPins?: HelpPin[];
  /** Open the full Help board (from a help pin's popup). */
  onHelpTap?: () => void;
}

type MapStyle = "map" | "satellite" | "terrain";

const ASSAM_CENTER: [number, number] = [92.9, 26.2];
const ASSAM_BOUNDS: [[number, number], [number, number]] = [
  [88.5, 23.5],
  [97.5, 28.7],
];

// Base raster tiles (all free, attributed) — satellite/terrain load lazily.
// NOTE: OSM is the single always-present base layer. Dark mode dims it with
// raster paint properties rather than swapping to another tile provider — one
// less way for the map to end up with no basemap at all.
const OSM_TILES = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
const ESRI_IMAGERY =
  "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}";
const ESRI_HILLSHADE =
  "https://server.arcgisonline.com/ArcGIS/rest/services/Elevation/World_Hillshade/MapServer/tile/{z}/{y}/{x}";

// Optional real flood-extent raster (e.g. NRSC Bhuvan XYZ/WMS-as-XYZ during an
// active event). Empty by default → the toggle stays hidden. Typed as string
// so setting it later doesn't require code changes. See README.
const SATELLITE_FLOOD_TILES: string = "";
const SATELLITE_FLOOD_ATTR = "Flood extent: NRSC Bhuvan / ISRO";

const OSM_ATTR =
  "© OpenStreetMap contributors | Districts: udit-001/india-maps-data (MIT) | Rivers: OSM (ODbL)";
const ESRI_ATTR = "Esri, Maxar, Earthstar Geographics";
const ESRI_HS_ATTR = "Esri — World Hillshade";

function escHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
}

// "Moving ants" dash sequence for the animated river flow line.
const DASH_SEQ: number[][] = [
  [0, 4, 3], [0.5, 4, 2.5], [1, 4, 2], [1.5, 4, 1.5], [2, 4, 1], [2.5, 4, 0.5],
  [3, 4, 0], [0, 0.5, 3, 3.5], [0, 1, 3, 3], [0, 1.5, 3, 2.5], [0, 2, 3, 2],
  [0, 2.5, 3, 1.5], [0, 3, 3, 1], [0, 3.5, 3, 0.5],
];

const zoomWidth = (a: number, b: number, c: number) =>
  ["interpolate", ["linear"], ["zoom"], 5, a, 8, b, 11, c] as unknown as number;

export default function FloodMap({
  geo,
  risks,
  selectedId,
  onSelect,
  gauges,
  onSelectGauge,
  fillOverride,
  flyTo,
  pin,
  floodByDistrict,
  alertRivers,
  helpPins,
  onHelpTap,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const loadedRef = useRef(false);
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;
  const onSelectGaugeRef = useRef(onSelectGauge);
  onSelectGaugeRef.current = onSelectGauge;
  const gaugeMarkersRef = useRef<maplibregl.Marker[]>([]);
  const helpMarkersRef = useRef<maplibregl.Marker[]>([]);
  const onHelpTapRef = useRef(onHelpTap);
  onHelpTapRef.current = onHelpTap;
  const pinMarkerRef = useRef<maplibregl.Marker | null>(null);
  const dashRafRef = useRef<number | null>(null);
  const riverClickRef = useRef(0);
  const [rivers, setRivers] = useState<GeoJSON.FeatureCollection | null>(null);

  const [mapStyle, setMapStyle] = useState<MapStyle>("map");
  const [pitched, setPitched] = useState(false);
  const [isDark, setIsDark] = useState(false);
  const [satFlood, setSatFlood] = useState(false);
  const [showHelp, setShowHelp] = useState(true);
  const [layersOpen, setLayersOpen] = useState(false);
  const t = useT();

  const floodOn = !!floodByDistrict && Object.keys(floodByDistrict).length > 0;
  const wantPitch = pitched || floodOn;

  // Follow system colour scheme for the map base.
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    setIsDark(mq.matches);
    const h = (e: MediaQueryListEvent) => setIsDark(e.matches);
    mq.addEventListener("change", h);
    return () => mq.removeEventListener("change", h);
  }, []);

  // Load the river network once (full OSM set; falls back to the old bundle).
  // Precompute a cleaned `label` so map labels read "Dikhow", not "DIKHOW NODI".
  useEffect(() => {
    fetch("/data/rivers.geojson")
      .then((r) => (r.ok ? r.json() : fetch("/data/assam_rivers.geojson").then((r2) => r2.json())))
      .then((fc: GeoJSON.FeatureCollection) => {
        for (const f of fc.features ?? []) {
          const p = (f.properties ?? {}) as { name?: string; label?: string };
          if (p.name) p.label = prettyRiver(p.name);
          f.properties = p;
        }
        setRivers(fc);
      })
      .catch((e) => console.error("river load failed", e));
  }, []);

  // Init map once.
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: {
        version: 8,
        sources: {
          osm: { type: "raster", tiles: [OSM_TILES], tileSize: 256, attribution: OSM_ATTR },
        },
        layers: [
          // Land/sea colour behind the tiles so a slow tile load never shows a void.
          { id: "bg", type: "background", paint: { "background-color": "#dfe6ea" } },
          { id: "osm", type: "raster", source: "osm" },
        ],
      },
      center: ASSAM_CENTER,
      zoom: 6.4,
      minZoom: 5.5,
      maxPitch: 60,
      maxBounds: ASSAM_BOUNDS,
      attributionControl: { compact: true },
    });
    map.addControl(new maplibregl.NavigationControl({ showCompass: true }), "top-right");
    map.on("load", () => {
      loadedRef.current = true;
      map.resize();
    });
    mapRef.current = map;
    return () => {
      map.remove();
      mapRef.current = null;
      loadedRef.current = false;
    };
  }, []);

  // Base style: swap OSM / dark-OSM / satellite / terrain. Tiles lazy-load
  // (source added only the first time a style is selected).
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const apply = () => {
      const before = map.getLayer("district-fill") ? "district-fill" : undefined;
      const ensure = (
        id: string,
        tiles: string,
        attribution: string,
        paint?: maplibregl.RasterLayerSpecification["paint"]
      ) => {
        if (!map.getSource(id)) map.addSource(id, { type: "raster", tiles: [tiles], tileSize: 256, attribution });
        if (!map.getLayer(id)) {
          map.addLayer({ id, type: "raster", source: id, layout: { visibility: "none" }, paint }, before);
        }
      };

      if (mapStyle === "satellite") ensure("sat", ESRI_IMAGERY, ESRI_ATTR);
      if (mapStyle === "terrain") ensure("hillshade", ESRI_HILLSHADE, ESRI_HS_ATTR, { "raster-opacity": 0.55 });

      const vis = (id: string, on: boolean) => {
        if (map.getLayer(id)) map.setLayoutProperty(id, "visibility", on ? "visible" : "none");
      };
      // OSM streets stay on for Map + Terrain (so places/roads are always legible).
      vis("osm", mapStyle === "map" || mapStyle === "terrain");
      vis("sat", mapStyle === "satellite");
      vis("hillshade", mapStyle === "terrain");

      // Dark mode: dim/desaturate the street tiles instead of swapping provider.
      if (map.getLayer("osm")) {
        map.setPaintProperty("osm", "raster-brightness-max", isDark ? 0.55 : 1);
        map.setPaintProperty("osm", "raster-saturation", isDark ? -0.35 : 0);
        map.setPaintProperty("osm", "raster-contrast", isDark ? 0.1 : 0);
      }
      if (map.getLayer("bg")) {
        map.setPaintProperty("bg", "background-color", isDark ? "#0b1220" : "#dfe6ea");
      }
    };

    if (loadedRef.current) apply();
    else map.once("load", apply);
  }, [mapStyle, isDark]);

  // Add / update district layer whenever data or theme changes.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !geo) return;

    const colorById: Record<string, string> = {};
    if (fillOverride) Object.assign(colorById, fillOverride);
    else for (const r of risks) colorById[r.districtId] = RISK_COLORS[r.level];

    const featureColor: unknown = Object.keys(colorById).length
      ? ["match", ["get", "id"], ...Object.entries(colorById).flat(), "#64748b"]
      : "#64748b";

    const isSat = mapStyle === "satellite";
    const lightText = isSat || isDark;

    const apply = () => {
      const src = map.getSource("districts") as maplibregl.GeoJSONSource | undefined;
      if (src) {
        src.setData(geo as GeoJSON.FeatureCollection);
      } else {
        map.addSource("districts", { type: "geojson", data: geo as GeoJSON.FeatureCollection });
        map.addLayer({
          id: "district-fill",
          type: "fill",
          source: "districts",
          paint: { "fill-opacity": 0.45 },
        });
        map.addLayer({
          id: "district-line",
          type: "line",
          source: "districts",
          paint: { "line-color": "#0f172a", "line-width": 1 },
        });
        map.addLayer({
          id: "district-label",
          type: "symbol",
          source: "districts",
          layout: { "text-field": ["get", "name"], "text-size": 11 },
          paint: { "text-color": "#0f172a", "text-halo-color": "#ffffff", "text-halo-width": 1.2 },
        });
        // Micro-transition: animate risk-colour changes over 500ms.
        const setTrans = map.setPaintProperty.bind(map) as (l: string, n: string, v: unknown) => void;
        setTrans("district-fill", "fill-color-transition", { duration: 500 });
        setTrans("district-fill", "fill-opacity-transition", { duration: 500 });
        setTrans("district-line", "line-color-transition", { duration: 500 });
        map.on("click", "district-fill", (e) => {
          // A river popup just opened for this same tap — don't also open the sheet.
          if (Date.now() - riverClickRef.current < 350) return;
          const f = e.features?.[0];
          const id = (f?.properties as { id?: string } | undefined)?.id ?? null;
          onSelectRef.current(id);
        });
        map.on("mouseenter", "district-fill", () => (map.getCanvas().style.cursor = "pointer"));
        map.on("mouseleave", "district-fill", () => (map.getCanvas().style.cursor = ""));
      }

      if (map.getLayer("district-fill")) {
        map.setPaintProperty("district-fill", "fill-color", featureColor);
        // Fade the risk tint as you zoom IN: strong when scanning the whole
        // state, nearly clear when you're looking for your own village/road.
        map.setPaintProperty("district-fill", "fill-opacity", [
          "interpolate",
          ["linear"],
          ["zoom"],
          6, isSat ? 0.3 : 0.36,
          9, isSat ? 0.18 : 0.2,
          11, isSat ? 0.08 : 0.1,
        ] as unknown as number);
      }
      if (map.getLayer("district-line")) {
        map.setPaintProperty("district-line", "line-color", isSat ? (featureColor as string) : "#0f172a");
        map.setPaintProperty(
          "district-line",
          "line-width",
          selectedId
            ? (["case", ["==", ["get", "id"], selectedId], isSat ? 4 : 3, isSat ? 2 : 1] as unknown as number)
            : isSat
            ? 2
            : 1
        );
      }
      if (map.getLayer("district-label")) {
        map.setPaintProperty("district-label", "text-color", lightText ? "#f8fafc" : "#0f172a");
        map.setPaintProperty("district-label", "text-halo-color", lightText ? "#0f172a" : "#ffffff");
      }
    };

    if (loadedRef.current) apply();
    else map.once("load", apply);
  }, [geo, risks, selectedId, fillOverride, mapStyle, isDark]);

  // Smooth, eased flyTo (~2s) when jumping to a district or My Area result.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !flyTo) return;
    const go = () =>
      map.flyTo({
        center: [flyTo.lng, flyTo.lat],
        zoom: flyTo.zoom ?? 8.5,
        pitch: wantPitch ? 50 : 0,
        duration: 2000,
        curve: 1.42,
        essential: true,
      });
    if (loadedRef.current) go();
    else map.once("load", go);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flyTo]);

  // 3D tilt + subtle sky when pitched (or in flood view).
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const apply = () => {
      map.easeTo({ pitch: wantPitch ? 50 : 0, duration: 800 });
      const m = map as unknown as { setSky?: (s?: unknown) => void };
      if (typeof m.setSky === "function") {
        try {
          m.setSky(
            wantPitch
              ? {
                  "sky-color": "#7cb9e8",
                  "sky-horizon-blend": 0.6,
                  "horizon-color": "#e0f2fe",
                  "horizon-fog-blend": 0.6,
                  "fog-color": "#cbd5e1",
                  "fog-ground-blend": 0.4,
                }
              : undefined
          );
        } catch {
          /* older maplibre without setSky */
        }
      }
    };
    if (loadedRef.current) apply();
    else map.once("load", apply);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wantPitch]);

  // Modelled floodwater over affected districts (geo-registered, stays on the
  // real ground). Whole-district tint — an ESTIMATE, not observed water lines.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !geo) return;

    const apply = () => {
      const fc = geo as GeoJSON.FeatureCollection;
      const feats = (fc.features ?? [])
        .map((f) => {
          const id = (f.properties as { id?: string } | null)?.id ?? "";
          const intensity = floodByDistrict?.[id] ?? 0;
          return intensity > 0
            ? { ...f, properties: { ...(f.properties as object), intensity } }
            : null;
        })
        .filter(Boolean) as GeoJSON.Feature[];
      const water: GeoJSON.FeatureCollection = { type: "FeatureCollection", features: feats };

      const src = map.getSource("flood-water") as maplibregl.GeoJSONSource | undefined;
      if (src) {
        src.setData(water);
      } else {
        map.addSource("flood-water", { type: "geojson", data: water });
        const before = map.getLayer("district-line") ? "district-line" : undefined;
        map.addLayer(
          {
            id: "flood-water-fill",
            type: "fill",
            source: "flood-water",
            paint: {
              "fill-color": [
                "interpolate",
                ["linear"],
                ["get", "intensity"],
                0.2, "#38bdf8",
                0.6, "#2563eb",
                1, "#1d4ed8",
              ],
              "fill-opacity": 0.45,
            },
          },
          before
        );
      }
      if (map.getLayer("flood-water-fill")) {
        map.setLayoutProperty("flood-water-fill", "visibility", floodOn ? "visible" : "none");
      }
    };

    if (loadedRef.current) apply();
    else map.once("load", apply);
  }, [geo, floodByDistrict, floodOn]);

  // Optional OFFICIAL satellite flood-extent raster (lazy; only if configured).
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !SATELLITE_FLOOD_TILES) return;
    const apply = () => {
      if (!map.getSource("sat-flood")) {
        map.addSource("sat-flood", {
          type: "raster",
          tiles: [SATELLITE_FLOOD_TILES],
          tileSize: 256,
          attribution: SATELLITE_FLOOD_ATTR,
        });
        map.addLayer({
          id: "sat-flood",
          type: "raster",
          source: "sat-flood",
          layout: { visibility: "none" },
          paint: { "raster-opacity": 0.7 },
        });
      }
      if (map.getLayer("sat-flood")) {
        map.setLayoutProperty("sat-flood", "visibility", satFlood ? "visible" : "none");
      }
    };
    if (loadedRef.current) apply();
    else map.once("load", apply);
  }, [satFlood]);

  // Shimmer the floodwater (breathing opacity) while flood view is on.
  useEffect(() => {
    if (!floodOn) return;
    let raf: number | null = null;
    let last = 0;
    const step = (ts: number) => {
      const map = mapRef.current;
      if (map && map.getLayer("flood-water-fill") && ts - last > 60) {
        last = ts;
        map.setPaintProperty("flood-water-fill", "fill-opacity", 0.42 + 0.13 * Math.sin(ts / 700));
      }
      raf = requestAnimationFrame(step);
    };
    const start = () => {
      if (raf == null) raf = requestAnimationFrame(step);
    };
    const stop = () => {
      if (raf != null) cancelAnimationFrame(raf);
      raf = null;
    };
    const onVis = () => (document.hidden ? stop() : start());
    document.addEventListener("visibilitychange", onVis);
    if (!document.hidden) start();
    return () => {
      document.removeEventListener("visibilitychange", onVis);
      stop();
    };
  }, [floodOn]);

  // Rivers: zoom-scaled width, animated flow dashes, danger glow.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !rivers) return;

    const apply = () => {
      if (!map.getSource("rivers")) {
        map.addSource("rivers", { type: "geojson", data: rivers });
        // Red danger glow — only rivers whose nearest gauge is above danger.
        map.addLayer({
          id: "river-glow",
          type: "line",
          source: "rivers",
          filter: ["==", ["get", "name"], "___none___"],
          layout: { "line-cap": "round", "line-join": "round", visibility: "none" },
          paint: { "line-color": "#ef4444", "line-width": zoomWidth(6, 16, 30), "line-blur": 4, "line-opacity": 0.55 },
        });
        // Minor tributaries: hidden when zoomed out (they swamped the map), thin
        // and dim when shown.
        map.addLayer({
          id: "river-minor",
          type: "line",
          source: "rivers",
          minzoom: 8.5,
          filter: ["!=", ["get", "major"], true],
          layout: { "line-cap": "round", "line-join": "round" },
          paint: { "line-color": "#3b82f6", "line-width": zoomWidth(0.6, 1, 2), "line-opacity": 0.55 },
        });
        map.addLayer({
          id: "river-casing",
          type: "line",
          source: "rivers",
          filter: ["==", ["get", "major"], true],
          layout: { "line-cap": "round", "line-join": "round" },
          paint: { "line-color": "#e0f2fe", "line-width": zoomWidth(3, 6, 11), "line-opacity": 0.6 },
        });
        map.addLayer({
          id: "river-line",
          type: "line",
          source: "rivers",
          filter: ["==", ["get", "major"], true],
          layout: { "line-cap": "round", "line-join": "round" },
          paint: { "line-color": "#1d4ed8", "line-width": zoomWidth(1.4, 2.6, 5) },
        });
        // Lighter animated "flow" dashes on top (major rivers only).
        map.addLayer({
          id: "river-flow",
          type: "line",
          source: "rivers",
          filter: ["==", ["get", "major"], true],
          layout: { "line-cap": "butt", "line-join": "round" },
          paint: { "line-color": "#bfdbfe", "line-width": zoomWidth(0.8, 1.5, 3), "line-dasharray": [0, 4, 3] },
        });
        map.addLayer({
          id: "river-label",
          type: "symbol",
          source: "rivers",
          minzoom: 7.5,
          filter: ["==", ["get", "major"], true],
          layout: {
            "text-field": ["coalesce", ["get", "label"], ["get", "name"]],
            "text-size": 11,
            "symbol-placement": "line",
            "symbol-spacing": 400,
          },
          paint: { "text-color": "#1e3a8a", "text-halo-color": "#ffffff", "text-halo-width": 1.4 },
        });

        // Tapping a blue line explains what it is (previously a mystery).
        const onRiverClick = (e: maplibregl.MapLayerMouseEvent) => {
          const f = e.features?.[0];
          const raw = (f?.properties as { name?: string } | undefined)?.name;
          if (!raw) return;
          riverClickRef.current = Date.now(); // suppress the district sheet
          new maplibregl.Popup({ offset: 10, closeButton: true, maxWidth: "240px" })
            .setLngLat(e.lngLat)
            .setHTML(
              `<div style="font:600 13px/1.3 system-ui;color:#0f172a">${prettyRiver(raw)}</div>` +
                `<div style="font:400 11px/1.4 system-ui;color:#475569;margin-top:2px">` +
                `River · নদী<br/>Tap a gauge marker (circle) for water level vs danger level.</div>`
            )
            .addTo(map);
        };
        for (const id of ["river-line", "river-minor"]) {
          map.on("click", id, onRiverClick);
          map.on("mouseenter", id, () => (map.getCanvas().style.cursor = "pointer"));
          map.on("mouseleave", id, () => (map.getCanvas().style.cursor = ""));
        }
      }
      if (map.getLayer("district-label")) {
        for (const id of ["river-glow", "river-casing", "river-line", "river-flow", "river-label"]) {
          if (map.getLayer(id)) map.moveLayer(id, "district-label");
        }
      }
    };

    if (loadedRef.current) apply();
    else map.once("load", apply);
  }, [rivers, geo]);

  // Glow ONLY the rivers whose gauges are above danger (was: every major river,
  // which made the whole map look like an emergency).
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const apply = () => {
      if (!map.getLayer("river-glow")) return;
      const on = alertRivers && alertRivers.length > 0;
      if (on) {
        // Match any river whose name contains an alerting river's name.
        map.setFilter("river-glow", [
          "any",
          ...alertRivers.map((r) => ["in", r.toLowerCase(), ["downcase", ["get", "name"]]]),
        ] as unknown as maplibregl.FilterSpecification);
      }
      map.setLayoutProperty("river-glow", "visibility", on ? "visible" : "none");
    };
    if (loadedRef.current) apply();
    else map.once("load", apply);
  }, [alertRivers, rivers]);

  // Animate the flow dashes (throttled ~12fps, paused when tab hidden).
  useEffect(() => {
    let last = 0;
    const step = (ts: number) => {
      const map = mapRef.current;
      if (map && map.getLayer("river-flow") && ts - last > 80) {
        last = ts;
        const seq = DASH_SEQ[Math.floor(ts / 80) % DASH_SEQ.length];
        map.setPaintProperty("river-flow", "line-dasharray", seq);
      }
      dashRafRef.current = requestAnimationFrame(step);
    };
    const start = () => {
      if (dashRafRef.current == null) dashRafRef.current = requestAnimationFrame(step);
    };
    const stop = () => {
      if (dashRafRef.current != null) {
        cancelAnimationFrame(dashRafRef.current);
        dashRafRef.current = null;
      }
    };
    const onVis = () => (document.hidden ? stop() : start());
    document.addEventListener("visibilitychange", onVis);
    if (!document.hidden) start();
    return () => {
      document.removeEventListener("visibilitychange", onVis);
      stop();
    };
  }, [rivers]);

  // Gauge station markers (HTML markers so we can pulse the extreme ones).
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !gauges) return;

    const apply = () => {
      for (const m of gaugeMarkersRef.current) m.remove();
      gaugeMarkersRef.current = [];
      for (const g of gauges) {
        const el = document.createElement("button");
        el.className = "gauge-marker";
        const statusText =
          g.status === "extreme"
            ? "above record flood"
            : g.status === "danger"
            ? "above danger level"
            : g.status === "warning"
            ? "near danger level"
            : "below danger level";
        // Native tooltip so hovering explains the marker without a tap.
        el.title = `River gauge — ${statusText}${g.trend ? ` · water ${g.trend}` : ""}. Tap for levels.`;
        el.setAttribute("aria-label", el.title);
        el.style.setProperty("--gcolor", GAUGE_COLORS[g.status]);
        if (g.trend) el.textContent = g.trend === "rising" ? "▲" : g.trend === "falling" ? "▼" : "■";
        if (g.status === "extreme") el.classList.add("gauge-pulse");
        el.addEventListener("click", (ev) => {
          ev.stopPropagation();
          onSelectGaugeRef.current?.(g.id);
        });
        const marker = new maplibregl.Marker({ element: el }).setLngLat([g.lng, g.lat]).addTo(map);
        gaugeMarkersRef.current.push(marker);
      }
    };

    if (loadedRef.current) apply();
    else map.once("load", apply);

    return () => {
      for (const m of gaugeMarkersRef.current) m.remove();
      gaugeMarkersRef.current = [];
    };
  }, [gauges]);

  // "My area" pin — a single marker moved/created/removed as `pin` changes.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const apply = () => {
      if (!pin) {
        pinMarkerRef.current?.remove();
        pinMarkerRef.current = null;
        return;
      }
      if (pinMarkerRef.current) {
        pinMarkerRef.current.setLngLat([pin.lng, pin.lat]);
      } else {
        const el = document.createElement("div");
        el.className = "my-pin";
        pinMarkerRef.current = new maplibregl.Marker({ element: el, anchor: "bottom" })
          .setLngLat([pin.lng, pin.lat])
          .addTo(map);
      }
    };
    if (loadedRef.current) apply();
    else map.once("load", apply);
  }, [pin]);

  // Community help requests — 🆘 markers at approx location, toggled from Layers.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const apply = () => {
      for (const m of helpMarkersRef.current) m.remove();
      helpMarkersRef.current = [];
      if (!showHelp || !helpPins || helpPins.length === 0) return;
      for (const p of helpPins) {
        const label = helpTypeLabel(p.helpType);
        const el = document.createElement("div");
        el.textContent = "🆘";
        el.title = `${label.en} needed — ${p.district ?? "Assam"}. Tap for details.`;
        el.style.cssText =
          "font-size:20px;cursor:pointer;line-height:1;filter:drop-shadow(0 1px 2px rgba(0,0,0,.7))";
        // Tapping a help pin must NOT also open the district sheet beneath it.
        el.addEventListener("click", (ev) => {
          ev.stopPropagation();
          riverClickRef.current = Date.now(); // reuse the district-sheet suppression guard
        });
        const popup = new maplibregl.Popup({ offset: 14, maxWidth: "240px" }).setHTML(
          `<div style="font:13px system-ui;color:#0f172a">
             <b>${label.icon} ${escHtml(label.en)} needed</b>
             <div style="margin:2px 0">${escHtml(p.message).slice(0, 140)}</div>
             <div style="color:#475569;font-size:11px">${escHtml(p.district ?? "Assam")}${p.photoCount ? ` · 📷 ${p.photoCount}` : ""}</div>
             <button data-hopen="${p.id}" style="margin-top:6px;background:#0284c7;color:#fff;border:0;border-radius:8px;padding:6px 10px;font-weight:700;cursor:pointer">Open Help board →</button>
           </div>`
        );
        popup.on("open", () => {
          const btn = document.querySelector<HTMLButtonElement>(`button[data-hopen="${p.id}"]`);
          if (btn) btn.onclick = () => { popup.remove(); onHelpTapRef.current?.(); };
        });
        const marker = new maplibregl.Marker({ element: el })
          .setLngLat([p.approxLng, p.approxLat])
          .setPopup(popup)
          .addTo(map);
        helpMarkersRef.current.push(marker);
      }
    };
    if (loadedRef.current) apply();
    else map.once("load", apply);
    return () => {
      for (const m of helpMarkersRef.current) m.remove();
      helpMarkersRef.current = [];
    };
  }, [helpPins, showHelp]);

  const STYLE_KEYS = { map: "layers.map", satellite: "layers.satellite", terrain: "layers.terrain" } as const;

  return (
    <>
      <div ref={containerRef} className="absolute inset-0" />

      {/* One "Layers" button → popover with base style, 3D tilt and (if set up)
          the flood-extent overlay. Collapses what used to be a column of always-
          visible buttons cluttering a phone screen. */}
      <div className="absolute bottom-24 right-3 z-20 flex flex-col items-end gap-2">
        {layersOpen && (
          <div className="w-40 rounded-xl border border-slate-700 bg-slate-900/95 p-2 shadow-2xl backdrop-blur">
            <p className="mb-1 px-1 text-[10px] font-bold uppercase tracking-wide text-slate-400">
              {t("layers.title")}
            </p>
            <div className="flex flex-col gap-1">
              {(["map", "satellite", "terrain"] as const).map((s) => (
                <button
                  key={s}
                  onClick={() => setMapStyle(s)}
                  aria-pressed={mapStyle === s}
                  className={`rounded-lg px-2.5 py-1.5 text-left text-[12px] font-semibold ${
                    mapStyle === s ? "bg-sky-600 text-white" : "bg-slate-800/80 text-slate-200"
                  }`}
                >
                  {t(STYLE_KEYS[s])}
                </button>
              ))}
            </div>
            <button
              onClick={() => setPitched((p) => !p)}
              aria-pressed={pitched}
              className={`mt-1.5 flex w-full items-center justify-between rounded-lg px-2.5 py-1.5 text-[12px] font-semibold ${
                pitched ? "bg-sky-600 text-white" : "bg-slate-800/80 text-slate-200"
              }`}
            >
              <span>{t("layers.tilt")}</span>
              <span className="text-[10px]">{pitched ? "3D" : "2D"}</span>
            </button>
            {/* Community help requests as 🆘 pins on the main map. */}
            <button
              onClick={() => setShowHelp((v) => !v)}
              aria-pressed={showHelp}
              className={`mt-1.5 flex w-full items-center justify-between rounded-lg px-2.5 py-1.5 text-[12px] font-semibold ${
                showHelp ? "bg-red-600 text-white" : "bg-slate-800/80 text-slate-200"
              }`}
            >
              <span>🆘 {t("layers.help")}</span>
              <span className="text-[10px]">{showHelp ? "ON" : "OFF"}</span>
            </button>
            {/* Only when a real flood-extent tile source is configured. */}
            {SATELLITE_FLOOD_TILES !== "" && (
              <button
                onClick={() => setSatFlood((v) => !v)}
                aria-pressed={satFlood}
                className={`mt-1.5 w-full rounded-lg px-2.5 py-1.5 text-left text-[12px] font-semibold ${
                  satFlood ? "bg-blue-600 text-white" : "bg-slate-800/80 text-slate-200"
                }`}
              >
                🛰 {t("layers.floodExtent")}
              </button>
            )}
          </div>
        )}
        <button
          onClick={() => setLayersOpen((v) => !v)}
          aria-expanded={layersOpen}
          aria-label={t("layers.title")}
          className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[12px] font-semibold shadow-lg backdrop-blur ${
            layersOpen ? "bg-sky-600 text-white" : "bg-slate-900/90 text-slate-200"
          }`}
        >
          <span aria-hidden>⧉</span>
          <span>{t("layers.title")}</span>
        </button>
      </div>
    </>
  );
}
