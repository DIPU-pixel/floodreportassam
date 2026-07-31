import type { Town } from "./types";

/** Great-circle distance in km. */
export function haversineKm(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const R = 6371;
  const dLat = ((bLat - aLat) * Math.PI) / 180;
  const dLng = ((bLng - aLng) * Math.PI) / 180;
  const la1 = (aLat * Math.PI) / 180;
  const la2 = (bLat * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Ray-casting (even-odd) test of [lng,lat] against one ring of [lng,lat] pairs. */
function pointInRing(lng: number, lat: number, ring: number[][]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0];
    const yi = ring[i][1];
    const xj = ring[j][0];
    const yj = ring[j][1];
    const intersect =
      yi > lat !== yj > lat && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

/**
 * Even-odd across all rings of a Polygon (so holes subtract), then OR across a
 * MultiPolygon's parts.
 */
function pointInGeometry(lng: number, lat: number, geom: GeoJSON.Geometry): boolean {
  if (geom.type === "Polygon") {
    let inside = false;
    for (const ring of geom.coordinates) if (pointInRing(lng, lat, ring)) inside = !inside;
    return inside;
  }
  if (geom.type === "MultiPolygon") {
    for (const poly of geom.coordinates) {
      let inside = false;
      for (const ring of poly) if (pointInRing(lng, lat, ring)) inside = !inside;
      if (inside) return true;
    }
    return false;
  }
  return false;
}

export interface DistrictHit {
  id: string;
  name: string;
}

/**
 * Client-side reverse-geocode: which bundled district polygon contains the
 * point. Runs entirely in-browser — coordinates never leave the device.
 */
export function findDistrict(
  lng: number,
  lat: number,
  features: GeoJSON.Feature[]
): DistrictHit | null {
  for (const f of features) {
    if (f.geometry && pointInGeometry(lng, lat, f.geometry)) {
      const p = f.properties as { id?: string; name?: string } | null;
      if (p?.id) return { id: p.id, name: p.name ?? p.id };
    }
  }
  return null;
}

/** Distance (km) from point P to segment A–B, via local equirectangular projection. */
function distToSegmentKm(
  pLat: number,
  pLng: number,
  aLng: number,
  aLat: number,
  bLng: number,
  bLat: number
): number {
  const k = Math.cos((pLat * Math.PI) / 180) * 111.32;
  const kLat = 110.57;
  const px = pLng * k;
  const py = pLat * kLat;
  const ax = aLng * k;
  const ay = aLat * kLat;
  const bx = bLng * k;
  const by = bLat * kLat;
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy;
  let t = len2 ? ((px - ax) * dx + (py - ay) * dy) / len2 : 0;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

/**
 * Nearest named river to a point (hand-rolled nearest-point-on-line over the
 * bundled river network). Returns the river name and distance in km.
 */
/** OSM river tags are raw ("DIKHOW NODI") — clean them up for display. */
export function prettyRiver(name: string): string {
  return (
    name
      .replace(/\b(nodi|nadi|noi|river|suti|jan)\b/gi, "")
      .trim()
      .replace(/\s+/g, " ")
      .split(" ")
      .map((w) => (w.length > 2 ? w[0].toUpperCase() + w.slice(1).toLowerCase() : w.toUpperCase()))
      .join(" ") || name
  );
}

export function nearestRiver(
  lat: number,
  lng: number,
  fc: GeoJSON.FeatureCollection | null
): { name: string; km: number } | null {
  if (!fc?.features) return null;
  let best: string | null = null;
  let bestKm = Infinity;
  for (const f of fc.features) {
    const name = (f.properties as { name?: string } | null)?.name;
    if (!name || !f.geometry) continue;
    const lines =
      f.geometry.type === "LineString"
        ? [f.geometry.coordinates]
        : f.geometry.type === "MultiLineString"
        ? f.geometry.coordinates
        : [];
    for (const line of lines) {
      for (let i = 1; i < line.length; i++) {
        const d = distToSegmentKm(lat, lng, line[i - 1][0], line[i - 1][1], line[i][0], line[i][1]);
        if (d < bestKm) {
          bestKm = d;
          best = name;
        }
      }
    }
  }
  return best ? { name: prettyRiver(best), km: bestKm } : null;
}

/**
 * ALL named rivers within `maxKm` of a point, nearest first (one entry per
 * river name, at its closest approach). Stage 2 uses this instead of a single
 * nearest river so each nearby river can carry its OWN same-river gauge status.
 */
export function nearbyRivers(
  lat: number,
  lng: number,
  fc: GeoJSON.FeatureCollection | null,
  maxKm: number
): { name: string; km: number }[] {
  if (!fc?.features) return [];
  const best = new Map<string, number>(); // prettified name → min distance (km)
  for (const f of fc.features) {
    const raw = (f.properties as { name?: string } | null)?.name;
    if (!raw || !f.geometry) continue;
    const lines =
      f.geometry.type === "LineString"
        ? [f.geometry.coordinates]
        : f.geometry.type === "MultiLineString"
        ? f.geometry.coordinates
        : [];
    let localBest = Infinity;
    for (const line of lines) {
      for (let i = 1; i < line.length; i++) {
        const d = distToSegmentKm(lat, lng, line[i - 1][0], line[i - 1][1], line[i][0], line[i][1]);
        if (d < localBest) localBest = d;
      }
    }
    if (localBest <= maxKm) {
      const name = prettyRiver(raw);
      const cur = best.get(name);
      if (cur === undefined || localBest < cur) best.set(name, localBest);
    }
  }
  return Array.from(best.entries())
    .map(([name, km]) => ({ name, km }))
    .sort((a, b) => a.km - b.km);
}

export function nearestTown(lat: number, lng: number, towns: Town[]): { town: Town; km: number } | null {
  let best: Town | null = null;
  let bestKm = Infinity;
  for (const t of towns) {
    const km = haversineKm(lat, lng, t.lat, t.lng);
    if (km < bestKm) {
      bestKm = km;
      best = t;
    }
  }
  return best ? { town: best, km: bestKm } : null;
}
