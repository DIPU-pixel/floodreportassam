"use client";

import { useEffect, useMemo, useState } from "react";
import type { GeocodeResponse, GeocodeResult, Town } from "@/lib/types";
import type { MyPlace } from "@/lib/myArea";

type GeoStatus = "idle" | "locating" | "denied" | "unsupported";

export default function MyAreaSearch({
  districts,
  towns,
  onResolve,
  onExpandedChange,
}: {
  districts: { id: string; name: string }[];
  towns: Town[];
  onResolve: (lat: number, lng: number, opts: { name?: string; source: MyPlace["source"] }) => void;
  /** Lets the page hide the legend while the search panel is open. */
  onExpandedChange?: (open: boolean) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<GeocodeResult[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [geoStatus, setGeoStatus] = useState<GeoStatus>("idle");
  const [showPicker, setShowPicker] = useState(false);
  const [pickerDistrict, setPickerDistrict] = useState("");

  // districtId → display name, so a town result can say which district it's in.
  const districtName = useMemo(() => {
    const m = new Map<string, string>();
    for (const d of districts) m.set(d.id, d.name);
    return m;
  }, [districts]);

  const setPanel = (open: boolean) => {
    setExpanded(open);
    onExpandedChange?.(open);
  };

  const townsByDistrict = useMemo(() => {
    const m = new Map<string, Town[]>();
    for (const t of towns) {
      const arr = m.get(t.districtId) ?? [];
      arr.push(t);
      m.set(t.districtId, arr);
    }
    return m;
  }, [towns]);

  // Local town matches — instant, shown before the network geocoder responds.
  const localMatches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (q.length < 2) return [];
    return towns.filter((t) => t.name.toLowerCase().includes(q)).slice(0, 8);
  }, [query, towns]);

  // Debounced geocoding (Assam-filtered server-side).
  useEffect(() => {
    if (query.trim().length < 2) {
      setResults([]);
      setLoading(false);
      return;
    }
    const ctrl = new AbortController();
    setLoading(true);
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/geocode?name=${encodeURIComponent(query.trim())}`, {
          signal: ctrl.signal,
        });
        const data = (await res.json()) as GeocodeResponse;
        setResults(data.results ?? []);
      } catch {
        /* aborted or offline */
      } finally {
        setLoading(false);
      }
    }, 300);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [query]);

  const useMyLocation = () => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setGeoStatus("unsupported");
      return;
    }
    setGeoStatus("locating");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setGeoStatus("idle");
        setOpen(false);
        setQuery("");
        onResolve(pos.coords.latitude, pos.coords.longitude, { source: "gps" });
      },
      () => setGeoStatus("denied"),
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }
    );
  };

  // Picking anything collapses the whole panel so the map is fully visible.
  const pickResult = (r: GeocodeResult) => {
    setOpen(false);
    setQuery("");
    setResults([]);
    setPanel(false);
    onResolve(r.lat, r.lng, { name: r.name, source: "search" });
  };

  const pickTown = (t: Town) => {
    setShowPicker(false);
    setOpen(false);
    setQuery("");
    setPanel(false);
    onResolve(t.lat, t.lng, { name: t.name, source: "picker" });
  };

  const pickerTowns = pickerDistrict ? townsByDistrict.get(pickerDistrict) ?? [] : [];

  // Collapsed: two small buttons on the LEFT. The full search only takes over
  // the screen once the user actually asks for it.
  if (!expanded) {
    return (
      <div className="pointer-events-auto flex gap-1.5">
        <button
          onClick={() => setPanel(true)}
          className="flex items-center gap-1.5 rounded-xl bg-slate-900/90 px-3 py-2 text-xs font-semibold text-slate-200 shadow-lg backdrop-blur active:bg-slate-800"
        >
          🔍 <span>Find my area</span>
        </button>
        <button
          onClick={useMyLocation}
          aria-label="Use my location"
          className="rounded-xl bg-sky-600 px-3 py-2 text-sm shadow-lg active:bg-sky-700"
        >
          📍
        </button>
        {geoStatus !== "idle" && (
          <span className="self-center rounded-lg bg-slate-900/85 px-2 py-1 text-[10px] text-slate-300 backdrop-blur">
            {geoStatus === "locating" && "Locating…"}
            {geoStatus === "denied" && "Location off — search instead"}
            {geoStatus === "unsupported" && "GPS unavailable"}
          </span>
        )}
      </div>
    );
  }

  return (
    <div className="pointer-events-auto w-full max-w-sm">
      <div className="rounded-xl bg-slate-900/95 p-1.5 shadow-lg backdrop-blur">
        <div className="flex items-center gap-1.5">
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onFocus={() => setOpen(true)}
            placeholder="Town or place · আপোনাৰ ঠাই"
            className="min-w-0 flex-1 rounded-lg bg-slate-800 px-3 py-2.5 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-sky-500"
            aria-label="Search your area"
          />
          <button
            onClick={useMyLocation}
            aria-label="Use my location"
            className="shrink-0 rounded-lg bg-sky-600 px-3 py-2.5 text-sm font-semibold text-white active:bg-sky-700"
          >
            📍
          </button>
          <button
            onClick={() => {
              setPanel(false);
              setOpen(false);
              setQuery("");
              setShowPicker(false);
            }}
            aria-label="Close search"
            className="shrink-0 rounded-lg bg-slate-800 px-2.5 py-2.5 text-sm text-slate-300"
          >
            ✕
          </button>
        </div>

        {/* GPS status / picker toggle */}
        <div className="mt-1 flex items-center justify-between px-1 text-[10px] text-slate-400">
          <button onClick={() => setShowPicker((v) => !v)} className="underline">
            {showPicker ? "Hide district list" : "Browse by district ↓"}
          </button>
          <span>
            {geoStatus === "locating" && "Locating… allow location access"}
            {geoStatus === "denied" && "Location off — search instead"}
            {geoStatus === "unsupported" && "GPS unavailable — search instead"}
            {geoStatus === "idle" && "GPS used in-browser only"}
          </span>
        </div>

        {/* Search results — local towns first (instant), then geocoder */}
        {open && query.trim().length >= 2 && (
          <ul className="mt-1 max-h-64 divide-y divide-slate-700/60 overflow-y-auto rounded-lg bg-slate-800 shadow-xl">
            {localMatches.map((t) => (
              <li key={`town-${t.name}-${t.districtId}`}>
                <button
                  onClick={() => pickTown(t)}
                  className="flex w-full items-baseline gap-2 px-3 py-2 text-left active:bg-slate-700"
                >
                  <span className="min-w-0 flex-1 truncate text-sm font-medium text-slate-100">
                    {t.name}
                  </span>
                  <span className="shrink-0 text-[10px] text-slate-400">
                    {districtName.get(t.districtId) ?? t.districtId}
                  </span>
                </button>
              </li>
            ))}
            {loading && <li className="px-3 py-2 text-xs text-slate-400">Searching…</li>}
            {!loading && localMatches.length === 0 && results.length === 0 && (
              <li className="px-3 py-2 text-xs text-slate-400">No Assam match — try the district list.</li>
            )}
            {results
              .filter((r) => !localMatches.some((t) => t.name.toLowerCase() === r.name.toLowerCase()))
              .map((r, i) => (
                <li key={`${r.name}-${i}`}>
                  <button
                    onClick={() => pickResult(r)}
                    className="flex w-full items-baseline gap-2 px-3 py-2 text-left active:bg-slate-700"
                  >
                    <span className="min-w-0 flex-1 truncate text-sm font-medium text-slate-100">
                      {r.name}
                    </span>
                    <span className="shrink-0 text-[10px] text-slate-400">
                      {r.admin2 ?? r.admin1 ?? "Assam"}
                    </span>
                  </button>
                </li>
              ))}
          </ul>
        )}

        {/* Two-step picker */}
        {showPicker && (
          <div className="mt-1 rounded-lg bg-slate-800 p-2">
            <select
              value={pickerDistrict}
              onChange={(e) => setPickerDistrict(e.target.value)}
              className="w-full rounded-lg bg-slate-700 px-2 py-2 text-sm text-slate-100 focus:outline-none"
              aria-label="Select district"
            >
              <option value="">Select district · জিলা বাছক</option>
              {districts.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
            {pickerTowns.length > 0 && (
              <div className="mt-2 flex max-h-40 flex-wrap gap-1.5 overflow-y-auto">
                {pickerTowns.map((t) => (
                  <button
                    key={t.name}
                    onClick={() => pickTown(t)}
                    className="rounded-full bg-slate-700 px-3 py-1.5 text-xs active:bg-sky-600"
                  >
                    {t.name}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
