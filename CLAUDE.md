# Assam Flood Watch — project rules for Claude Code

1. PURPOSE: public-information flood dashboard for people in Assam.
   Mobile-first (cheap Android over slow 4G), clarity over flair.
2. All external data fetching happens in Next.js Route Handlers under
   /app/api/* — the browser never calls Open-Meteo directly. Server
   responses are cached (revalidate: 900 = 15 min).
3. Every fetch has a typed schema, null-guards, and a fallback chain:
   live → last cached (stale badge) → bundled demo data. The map must
   NEVER go blank.
4. All derived numbers are labelled "modelled estimate". Never invent
   affected-village or casualty figures.
5. Permanent footer: "Informational only — modelled from public data.
   For official warnings follow ASDMA / CWC / district administration."
6. UI text in English with Assamese alongside key terms
   (বান / flood, বিপদ সীমা / danger level).
7. After every stage: `npm run build` and `npx tsc --noEmit` must pass.

## Current state (Stages 0–6 done + 33-district / towns / rivers upgrade)

### Data (all bundled, rebuilt by scripts — never fetched at runtime)
- `public/data/assam_districts.geojson` — **33 modern districts** (incl.
  Majuli, Charaideo, Biswanath, Hojai, Udalguri, Baksa, Chirang, South
  Salmara-Mankachar, West Karbi Anglong, Kamrup Metropolitan). Source:
  udit-001/india-maps-data (MIT). ~68 KB, simplified in pure Node, with
  recomputed centroids + `floodProneness` per district.
- `public/data/rivers.geojson` — **586 named rivers** from OSM Overpass
  (ODbL), ~377 KB. `properties.major` marks the trunk rivers used for
  labels / flow animation / danger glow.
- `public/data/towns.json` — **151 towns across all 33 districts**;
  each `districtId` assigned by point-in-polygon against the boundaries.
- `public/data/gauges.json` — CWC stations (danger/HFL values flagged
  "verify against ffs.india-water.gov.in").
- `public/data/frims-latest.json` — OPTIONAL official ASDMA FRIMS figures,
  updated manually. Only shown when `date` is < 48 h old.

### Scripts
- `node scripts/fetch-data.mjs` — rebuild districts + rivers (Overpass
  needs a User-Agent; falls back to the kumi.systems mirror).
- `node scripts/build-towns.mjs` — rebuild towns.json and report any town
  whose coordinates fall outside its district polygon.

### Live APIs (server-side only, cached 900 s, demo fallback)
- `/api/rain` — ONE batched Open-Meteo call for all district centroids
  (hourly precipitation → precise 48 h observed / 72 h forecast, plus
  `currentMm` = rain right now). Also `?lat=&lng=` for a single point.
- `/api/flood` — Open-Meteo Flood API, `past_days=7&forecast_days=7` →
  14-day discharge series (`todayIndex = 7`) + water **trend**
  (rising/steady/falling vs the past-7-day mean). Also `?lat=&lng=`.
- `/api/geocode` — Open-Meteo geocoder proxy, filtered to `admin1=Assam`.

### Risk
`lib/risk.ts` — 4 named-constant weights summing to 1: observed rain
0.30, forecast rain 0.25, nearest-gauge discharge anomaly 0.20, static
proneness 0.25. Unit-tested in `lib/risk.test.ts` (16 tests).

### UI
Title bar + LIVE/STALE/DEMO badge; area search (towns local-first, then
geocoder) + "use my location" (client-side point-in-polygon, coords never
logged); district sheet with **Towns chips** → town panel showing point
rain, **nearest river + nearest gauge with distances**, water trend +
14-day sparkline, district risk, FRIMS ribbon, district helplines;
Affected-districts list; 72 h rain slider; Emergency panel; drag sheets
with snap points; map style switcher (Map / Satellite / Terrain), 2D/3D
tilt, **Flood view** (modelled water tint + Three.js rain that appears
ONLY when live `currentMm > 0`); optional satellite flood-extent toggle
(hidden until `SATELLITE_FLOOD_TILES` is set in FloodMap.tsx).

### Honesty invariants (do not regress)
- Flood water tint = **modelled estimate**, badged as such; never claimed
  as observed inundation.
- FRIMS numbers are the ONLY figures labelled "OFFICIAL", and only when
  the report is < 48 h old.
- District control-room numbers in `lib/helplines.ts` ship EMPTY on
  purpose — add only verified numbers; 1077/1079/NDRF always shown.
- Gauge danger/HFL levels and discharge baselines are approximate and
  commented as needing verification/calibration.
