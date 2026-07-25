/**
 * One-shot data builder for Assam Flood Watch.
 *
 *   node scripts/fetch-data.mjs
 *
 * PART A  Downloads the 33 modern Assam district boundaries (udit-001/
 *         india-maps-data, MIT), simplifies to <300 KB in pure Node
 *         (Douglas–Peucker + coordinate rounding), recomputes centroids,
 *         applies the floodProneness table, and writes
 *         public/data/assam_districts.geojson.
 *
 * PART C  Downloads Assam's named river network from OpenStreetMap via the
 *         Overpass API (with a mirror fallback), simplifies to <500 KB, and
 *         writes public/data/rivers.geojson. Best-effort: if Overpass is
 *         unavailable the existing bundled rivers file is left untouched.
 *
 * No runtime dependencies — safe to run offline-first with `node` >=18.
 */
import { writeFile } from "node:fs/promises";
import path from "node:path";

const ROOT = process.cwd();
const out = (f) => path.join(ROOT, "public", "data", f);

const DISTRICTS_URL =
  "https://raw.githubusercontent.com/udit-001/india-maps-data/main/geojson/states/assam.geojson";
const DISTRICTS_ATTR =
  "District boundaries © udit-001/india-maps-data (MIT); derived from Survey of India / open data";
const OVERPASS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
];
// Assam bbox (south,west,north,east) for Overpass.
const ASSAM_BBOX = [24.1, 89.7, 28.3, 96.1];

// ── geometry helpers ────────────────────────────────────────────────────────
const slug = (s) =>
  s.toLowerCase().trim().replace(/&/g, "and").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const round = (v, dp = 4) => Math.round(v * 10 ** dp) / 10 ** dp;

function perp(p, a, b) {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  if (dx === 0 && dy === 0) return Math.hypot(p[0] - a[0], p[1] - a[1]);
  const t = ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / (dx * dx + dy * dy);
  return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy));
}
function douglasPeucker(pts, eps) {
  if (pts.length < 3) return pts;
  let maxD = 0;
  let idx = 0;
  for (let i = 1; i < pts.length - 1; i++) {
    const d = perp(pts[i], pts[0], pts[pts.length - 1]);
    if (d > maxD) {
      maxD = d;
      idx = i;
    }
  }
  if (maxD > eps) {
    const l = douglasPeucker(pts.slice(0, idx + 1), eps);
    const r = douglasPeucker(pts.slice(idx), eps);
    return l.slice(0, -1).concat(r);
  }
  return [pts[0], pts[pts.length - 1]];
}
const roundRing = (ring) => ring.map((p) => [round(p[0]), round(p[1])]);

function simplifyRing(ring, eps, closed) {
  let r = douglasPeucker(roundRing(ring), eps);
  if (closed) {
    if (r.length && (r[0][0] !== r[r.length - 1][0] || r[0][1] !== r[r.length - 1][1])) r.push(r[0]);
    if (r.length < 4) return null; // collapsed island — drop
  }
  return r;
}
function simplifyPolygon(rings, eps) {
  const outer = simplifyRing(rings[0], eps, true);
  if (!outer) return null;
  const holes = rings.slice(1).map((h) => simplifyRing(h, eps, true)).filter(Boolean);
  return [outer, ...holes];
}
function simplifyDistrictGeom(geom, eps) {
  if (geom.type === "Polygon") {
    const p = simplifyPolygon(geom.coordinates, eps);
    return p ? { type: "Polygon", coordinates: p } : null;
  }
  const polys = geom.coordinates.map((p) => simplifyPolygon(p, eps)).filter(Boolean);
  return polys.length ? { type: "MultiPolygon", coordinates: polys } : null;
}

function ringArea(ring) {
  let a = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    a += ring[j][0] * ring[i][1] - ring[i][0] * ring[j][1];
  }
  return a / 2;
}
function ringCentroid(ring) {
  let x = 0;
  let y = 0;
  let a = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const f = ring[j][0] * ring[i][1] - ring[i][0] * ring[j][1];
    x += (ring[j][0] + ring[i][0]) * f;
    y += (ring[j][1] + ring[i][1]) * f;
    a += f;
  }
  a *= 0.5;
  if (Math.abs(a) < 1e-12) {
    const m = ring.reduce((s, p) => [s[0] + p[0], s[1] + p[1]], [0, 0]);
    return [m[0] / ring.length, m[1] / ring.length];
  }
  return [x / (6 * a), y / (6 * a)];
}
/** Centroid of the largest polygon (handles MultiPolygon islands). */
function centroidOf(geom) {
  const polys = geom.type === "Polygon" ? [geom.coordinates] : geom.coordinates;
  let best = null;
  let bestA = -Infinity;
  for (const rings of polys) {
    const a = Math.abs(ringArea(rings[0]));
    if (a > bestA) {
      bestA = a;
      best = rings[0];
    }
  }
  return ringCentroid(best);
}

// ── floodProneness (0–1) for all 33 districts ───────────────────────────────
const HIGH = [
  "dhemaji", "lakhimpur", "majuli", "barpeta", "morigaon", "nagaon", "cachar",
  "dhubri", "south-salmara-mankachar", "biswanath", "darrang", "goalpara",
];
const LOW = ["karbi-anglong", "west-karbi-anglong", "dima-hasao"];
function proneness(id) {
  if (HIGH.includes(id)) return 0.9;
  if (LOW.includes(id)) return 0.3;
  return 0.55;
}

// ── PART A ──────────────────────────────────────────────────────────────────
async function buildDistricts() {
  console.log("• Districts: downloading …");
  const res = await fetch(DISTRICTS_URL);
  if (!res.ok) throw new Error(`districts HTTP ${res.status}`);
  const raw = await res.json();

  const nameOf = (p) => p.district || p.NAME_2 || p.name || p.DISTRICT || "Unknown";
  const build = (eps) => ({
    type: "FeatureCollection",
    attribution: DISTRICTS_ATTR,
    features: raw.features
      .map((f) => {
        const name = nameOf(f.properties);
        const id = slug(name);
        const geometry = simplifyDistrictGeom(f.geometry, eps);
        if (!geometry) return null;
        const [lng, lat] = centroidOf(f.geometry);
        return {
          type: "Feature",
          properties: {
            id,
            name,
            centroidLat: round(lat, 4),
            centroidLng: round(lng, 4),
            floodProneness: proneness(id),
          },
          geometry,
        };
      })
      .filter(Boolean),
  });

  // Increase simplification until under the 300 KB budget.
  let fc = null;
  for (const eps of [0.0015, 0.0025, 0.004, 0.006, 0.009, 0.013]) {
    fc = build(eps);
    const kb = Buffer.byteLength(JSON.stringify(fc)) / 1024;
    console.log(`   eps=${eps} → ${fc.features.length} districts, ${kb.toFixed(0)} KB`);
    if (kb < 300) break;
  }
  await writeFile(out("assam_districts.geojson"), JSON.stringify(fc));
  console.log(`  ✓ wrote assam_districts.geojson (${fc.features.length} districts)`);
  console.log("   " + fc.features.map((f) => f.properties.name).sort().join(", "));
}

// ── PART C ──────────────────────────────────────────────────────────────────
async function buildRivers() {
  const [s, w, n, e] = ASSAM_BBOX;
  const query = `[out:json][timeout:180];(way[waterway=river][name](${s},${w},${n},${e}););out geom;`;
  let data = null;
  for (const url of OVERPASS) {
    try {
      console.log(`• Rivers: querying Overpass ${url} …`);
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Accept: "application/json",
          "User-Agent": "AssamFloodWatch/1.0 (open-data map build; contact: maintainer)",
        },
        body: "data=" + encodeURIComponent(query),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      data = await res.json();
      break;
    } catch (err) {
      console.warn(`   ! ${url} failed: ${err.message}`);
    }
  }
  if (!data) {
    console.warn("  ✗ Overpass unavailable — leaving existing rivers file untouched.");
    return;
  }

  // Major rivers we always keep, even if short in the OSM extract.
  const KEEP = [
    "brahmaputra", "barak", "subansiri", "bharali", "kameng", "manas", "beki",
    "puthimari", "pagladiya", "dhansiri", "kopili", "kulsi", "krishnai", "jinjiram",
    "dihing", "disang", "dikhow", "gaurang", "sankosh", "katakhal", "longai",
  ];
  const isMajor = (name) => KEEP.some((k) => name.toLowerCase().includes(k));
  const lineLen = (l) => {
    let d = 0;
    for (let i = 1; i < l.length; i++) d += Math.hypot(l[i][0] - l[i - 1][0], l[i][1] - l[i - 1][1]);
    return d;
  };

  const build = (eps, minLenDeg) => {
    const byName = new Map();
    for (const el of data.elements ?? []) {
      if (el.type !== "way" || !el.geometry || !el.tags?.name) continue;
      const simp = douglasPeucker(el.geometry.map((g) => [round(g.lon), round(g.lat)]), eps);
      if (simp.length < 2) continue;
      const arr = byName.get(el.tags.name) ?? [];
      arr.push(simp);
      byName.set(el.tags.name, arr);
    }
    const features = [];
    for (const [name, lines] of byName) {
      const total = lines.reduce((s, l) => s + lineLen(l), 0);
      if (!isMajor(name) && total < minLenDeg) continue;
      features.push({
        type: "Feature",
        properties: { name, major: isMajor(name) },
        geometry: lines.length === 1
          ? { type: "LineString", coordinates: lines[0] }
          : { type: "MultiLineString", coordinates: lines },
      });
    }
    return {
      type: "FeatureCollection",
      attribution: "River network © OpenStreetMap contributors (ODbL) via Overpass API",
      features,
    };
  };

  let fc = null;
  for (const [eps, minLen] of [[0.0015, 0.03], [0.002, 0.05], [0.003, 0.08], [0.004, 0.12]]) {
    fc = build(eps, minLen);
    const kb = Buffer.byteLength(JSON.stringify(fc)) / 1024;
    console.log(`   eps=${eps} minLen=${minLen}° → ${fc.features.length} rivers, ${kb.toFixed(0)} KB`);
    if (kb < 500) break;
  }
  await writeFile(out("rivers.geojson"), JSON.stringify(fc));
  console.log(`  ✓ wrote rivers.geojson (${fc.features.length} named rivers)`);
}

async function main() {
  await buildDistricts();
  await buildRivers().catch((e) => console.warn("  rivers step skipped:", e.message));
  console.log("Done.");
}
main().catch((e) => {
  console.error("FAILED:", e);
  process.exit(1);
});
