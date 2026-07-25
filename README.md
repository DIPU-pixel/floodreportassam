# Assam Flood Watch | অসম বান নিৰীক্ষণ

Flood-risk map for **all 33 districts of Assam**, down to individual towns.
Live rainfall and river discharge from Open-Meteo (no API key) drive the
colours, water trends and "is it raining right now" effects.

**Modelled estimates only — always follow ASDMA / CWC / district
administration for official warnings.** Helplines: 1079 (state) · 1077
(district) · NDRF 9711077372.

## Run

```bash
npm install
npm run dev
```

Open http://localhost:3000

- **LIVE** badge = real Open-Meteo data (refreshes every 15 min)
- **STALE** = network dropped; last good data kept
- **DEMO** = never reached the network; bundled fallback (map never goes blank)

## Checks

```bash
npm run typecheck   # strict TS must pass
npm test            # unit tests for risk + water trend
npm run build
```

## Rebuilding the bundled data

Both scripts write into `public/data/` and only need running when you want
fresher geometry — the app never fetches these at runtime.

```bash
node scripts/fetch-data.mjs    # 33 districts + named river network
node scripts/build-towns.mjs   # towns.json, verified against the polygons
```

`fetch-data.mjs` downloads district boundaries from
[udit-001/india-maps-data](https://github.com/udit-001/india-maps-data) (MIT)
and the river network from the OpenStreetMap **Overpass API** (ODbL), then
simplifies both in pure Node (no mapshaper needed). Overpass requires a
descriptive `User-Agent`; if the main endpoint is busy the script retries
`overpass.kumi.systems`. If both fail, the existing rivers file is left
untouched.

`build-towns.mjs` assigns every town's district by **point-in-polygon** and
prints a warning for any town whose coordinates fall outside all polygons —
fix those coordinates rather than ignoring the warning.

## Features

| Area | What it does |
| --- | --- |
| Map | MapLibre; Map / Satellite (Esri) / Terrain styles, 2D–3D tilt, animated rivers |
| Risk | 0–100 per district: 48 h rain + 72 h forecast + discharge anomaly + flood-proneness |
| Towns | 151 towns; tap a district → town chips → per-town live panel |
| Nearest river/gauge | Hand-rolled nearest-point-on-line + haversine, with distances |
| Water trend | 14-day discharge (7 past + 7 forecast) → rising / steady / falling |
| My Area | Search (towns first, then geocoder) or GPS; coords stay in-browser |
| Flood view | Modelled water tint + Three.js rain, shown only when it's raining now |
| Emergency | One tap to NDRF / state / district helplines and official sites |

## Updating official FRIMS figures (2-minute daily job)

The **only** numbers labelled "OFFICIAL" come from ASDMA's FRIMS daily flood
report. They are never modelled or inferred.

1. Open the daily report at <https://frims.asdma.gov.in>.
2. Copy `scripts/frims-template.json` over `public/data/frims-latest.json`.
3. Set `date` to the report date (`YYYY-MM-DD`) and fill one entry per
   affected district:

   ```json
   { "name": "Barpeta", "affectedVillages": 84, "affectedPopulation": 41230, "reliefCamps": 12 }
   ```

4. Save. Affected districts immediately show an **"OFFICIAL: flood reported"**
   ribbon with the source and date.

Rules the app enforces for you:

- Reports **older than 48 hours are ignored** (shown as nothing, never as
  current). Update the file daily during an event.
- An empty `districts: []` shows nothing — correct when there is no active
  flood. **Never put estimated numbers in this file.**
- `name` is matched to the map by slug; add `"districtId": "..."` to override.

## Optional: satellite flood extent (NRSC Bhuvan)

Real observed inundation is not available from any free no-key API, so the
in-app water layer is explicitly a **modelled estimate**. During a major
event you can overlay ISRO/NRSC Bhuvan flood layers instead:

1. Find the current flood-extent layer on <https://bhuvan.nrsc.gov.in>
   (Disaster Services → Flood) and get its XYZ/WMS tile URL.
2. In `components/FloodMap.tsx`, set:

   ```ts
   const SATELLITE_FLOOD_TILES: string = "https://…/{z}/{x}/{y}.png";
   ```

3. A **🛰 Flood extent** toggle appears next to the style switcher (it stays
   hidden while the constant is empty). Tiles load lazily, only when enabled.

Keep the Bhuvan/ISRO attribution visible, and label that layer as observed
data — distinct from the modelled tint.

## Data & licences

- District boundaries — udit-001/india-maps-data (MIT), simplified.
- Rivers — © OpenStreetMap contributors (ODbL) via Overpass.
- Basemap — OpenStreetMap; satellite — Esri, Maxar, Earthstar Geographics;
  terrain hillshade — Esri.
- Weather & river discharge — Open-Meteo (CC BY 4.0), no key.
- Gauge danger/HFL levels — approximate published CWC values; **verify at
  <https://ffs.india-water.gov.in>** before operational use.
