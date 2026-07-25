# Assam Real-Time Flood Map — Next.js + TypeScript Master Prompt (for Claude Code in VS Code)

Next.js is actually the better choice here: API routes let the server fetch and cache Open-Meteo data (faster + kinder to the free API), TypeScript catches data-shape bugs, and Vercel deploy is one command so real people can open it on their phones.

## How to run this in Claude Code (VS Code)

1. Open an empty folder in VS Code, start Claude Code.
2. **First**, paste the SETUP + STAGE 1 block below. Run `npm run dev`, look at it, fix it.
3. Then feed Stage 2, 3, 4 **one at a time** as separate prompts. Don't move on until the current stage works.
4. Between stages, ask Claude Code to run `npm run build && npx tsc --noEmit` and fix any type errors — this keeps the project healthy.

---

## PROMPT 0 — Setup + project rules (paste first, alone)

```
Create a Next.js 14+ (App Router) + TypeScript project for a real-time
flood monitoring dashboard for ASSAM, India. Use:
• MapLibre GL JS (free, no token) with OpenStreetMap raster tiles
• Tailwind CSS for UI
• No component library needed; keep dependencies minimal
• Strict TypeScript ("strict": true)

Also create a CLAUDE.md at the repo root with these project rules, and
follow them in every future change:
1. PURPOSE: public-information flood dashboard for people in Assam.
   Mobile-first (cheap Android over slow 4G), clarity over flair.
2. All external data fetching happens in Next.js Route Handlers under
   /app/api/* — the browser never calls Open-Meteo directly. Server
   responses are cached (revalidate: 900 = 15 min).
3. Every fetch has a typed schema, null-guards, and a fallback: last
   cached data → bundled demo data. The map must NEVER go blank.
4. All derived numbers are labelled "modelled estimate". Never invent
   affected-village or casualty figures.
5. Permanent footer: "Informational only — modelled from public data.
   For official warnings follow ASDMA / CWC / district administration."
6. UI text in English with Assamese alongside key terms
   (বান / flood, বিপদ সীমা / danger level).
7. After every stage: `npm run build` and `npx tsc --noEmit` must pass.

Define shared types in /lib/types.ts now:
District, GaugeStation, RiverDischargeForecast, RainfallData,
DistrictRisk (score 0–100 + components), ApiStatus ("live" | "stale" |
"demo"). Set up the folder structure and a running "hello map" page.
```

## PROMPT 1 — Stage 1: The map

```
STAGE 1 — build the base map. Judge it on look and mobile usability
before anything else.

• Full-screen MapLibre map of Assam, center ~(26.2, 92.9), zoom ~7,
  rendered in a client component; everything else stays server-rendered.
• Bundle Assam DISTRICT BOUNDARIES as GeoJSON in /public/data/
  (open Datameet/Survey-of-India-derived India districts dataset,
  filtered to Assam, simplified to keep the file under ~500 KB; include
  attribution). Add district centroids as properties.
• Fill each district by floodRisk 0–100 (green → yellow → orange → red),
  demo values for now, typed as DistrictRisk.
• Bold blue polylines for the Brahmaputra and Barak (bundled
  OSM-derived GeoJSON).
• Tapping a district opens a mobile bottom sheet with its stats.
• Legend bottom-left, title bar with last-updated time + ApiStatus badge.
```

## PROMPT 2 — Stage 2: River gauges

```
STAGE 2 — river gauge stations.

Bundle /public/data/gauges.json typed as GaugeStation[] with name,
lat/lng, river, dangerLevel (m), highestFloodLevel (m) for major CWC
stations: Guwahati (Pandu), Dibrugarh, Neamatighat (Jorhat), Tezpur,
Goalpara, Dhubri on the Brahmaputra; Badarpur/AP Ghat on the Barak;
Golakganj (Gaurang), NT Road Crossing (Jia Bharali), Numaligarh
(Dhansiri). Mark these values "verify against ffs.india-water.gov.in"
in a comment.

• Map markers: gray = below danger, orange = within 0.5 m of danger,
  red = above danger, pulsing red = above HFL.
• Tapping a marker shows a vertical gauge graphic: current vs danger vs
  HFL, plus a 7-day discharge sparkline (wired in Stage 3; demo now).
```

## PROMPT 3 — Stage 3: Live data via API routes

```
STAGE 3 — live data. All server-side, all free, no keys.

1) /app/api/flood/route.ts — for each gauge station, fetch Open-Meteo
   Flood API:
   https://flood-api.open-meteo.com/v1/flood?latitude={lat}&longitude={lng}&daily=river_discharge,river_discharge_max&forecast_days=7
   Batch requests, revalidate: 900. Return typed
   RiverDischargeForecast[] with per-station discharge anomaly vs a
   bundled per-station high-discharge baseline.
2) /app/api/rain/route.ts — for each district centroid, fetch:
   https://api.open-meteo.com/v1/forecast?latitude={lat}&longitude={lng}&hourly=precipitation&daily=precipitation_sum&forecast_days=5&past_days=2
   Return typed RainfallData[] (48h observed + 72h forecast).
3) /lib/risk.ts — pure, unit-testable function computing DistrictRisk:
   weighted blend of 48h rain, 72h forecast rain, nearest-gauge
   discharge anomaly, and a bundled static flood-proneness weight per
   district (weight Dhemaji, Lakhimpur, Majuli, Barpeta, Nagaon,
   Morigaon, Cachar etc. higher). Export the weights as named constants.
   Add a small test file for it.
4) Client polls the two API routes every 15 min via SWR (or a simple
   hook). Status flow: live → stale (show "stale since HH:MM" badge,
   keep last data) → demo (visible banner) if nothing ever loaded.
   Never a blank map.
```

## PROMPT 4 — Stage 4: People-facing features

```
STAGE 4 — features for people actually using this during a flood.

• "Affected districts" panel sorted by risk, tap-to-fly-to.
• 72h time slider that recolors districts by hourly forecast rain.
• EMERGENCY panel, always one tap away: NDRF 9711077372 (tel: link),
  state helpline 1079, district helpline 1077, links to
  asdma.assam.gov.in and frims.asdma.gov.in (official daily reports).
• Share button: copies a plain-text summary of the selected district.
• /public/data/frims-latest.json (typed, optional): if present, show
  official affected-village/relief-camp counts per district with source
  + date. I will update this file manually from ASDMA's daily report.
• PWA basics: manifest + icon so it can be added to home screen.
```

## PROMPT 5 — Stage 5: "My Area" — exact location check

```
STAGE 5 — let anyone in Assam check THEIR exact place (e.g. district
Sivasagar → town Nazira), not just district colors.

1) LOCATION SEARCH BAR (top of screen, big and thumb-friendly):
   • Free geocoding via Open-Meteo Geocoding API (no key):
     https://geocoding-api.open-meteo.com/v1/search?name={query}&count=8&language=en&countryCode=IN
     proxied through /app/api/geocode/route.ts, results filtered to
     admin1 = Assam. Typing "Nazira" should find Nazira, Sivasagar.
   • Also a two-step picker for people who prefer tapping: District
     dropdown → town list (bundle /public/data/towns.json — typed
     Town[] with name, district, lat/lng for all major towns per
     district: district HQs, sub-divisional towns, and well-known
     flood-prone towns like Nazira, Simaluguri, Amguri, Sonari in
     Sivasagar; do this for every district).
2) "USE MY LOCATION" button:
   • navigator.geolocation with clear permission prompt text. On grant,
     reverse-match the coordinates to district (point-in-polygon
     against the bundled district GeoJSON — do this client-side, never
     send coordinates to any third-party service) and to the nearest
     bundled town.
   • On deny/failure, fall back to the search bar — no nagging.
3) MY AREA PANEL (opens after either method):
   • Place name + district, e.g. "Nazira, Sivasagar".
   • Point-specific data fetched live for those exact coordinates:
     rain last 48h + next 72h (Open-Meteo forecast API) and river
     discharge forecast (Open-Meteo Flood API) — both via the existing
     API routes, extended to accept ?lat=&lng= for ad-hoc points.
   • Nearest river gauge with distance ("Disangmukh/Neamatighat gauge,
     ~X km away") and its current status vs danger level.
   • The district's risk score + FRIMS official figures if the
     frims-latest.json has them.
   • Plain-language one-line summary, bilingual, e.g.
     "Moderate risk: heavy rain expected in next 48h. মধ্যমীয়া বিপদ।"
     — always followed by the "modelled estimate / follow ASDMA" note.
   • Emergency numbers for that district (bundle district-wise 1077
     control-room numbers where known; else show state 1079 + NDRF).
4) Fly the map to the location with a pin, and remember the last
   checked place in localStorage so it reopens instantly next visit.
5) Privacy: GPS coordinates are used in-browser and for the two
   Open-Meteo calls only; never logged or stored server-side.
```

## PROMPT 6 — Stage 6: Realistic map + UI polish (do this LAST)

```
STAGE 6 — make the map feel real and the UI feel professional, without
hurting performance on cheap phones.

1) MAP STYLE SWITCHER (bottom-right, three options):
   • "Map" — current OSM street style (default, lightest).
   • "Satellite" — Esri World Imagery raster tiles (free with visible
     attribution: "Esri, Maxar, Earthstar Geographics"):
     https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}
     On satellite, render district fills as colored OUTLINES + soft
     30%-opacity fill so the real ground stays visible — during floods
     people can visually relate imagery to their area.
   • "Terrain" — OSM base + Esri hillshade overlay so the Brahmaputra
     valley and hills read naturally.
2) 3D FEEL: enable MapLibre pitch (tilt to ~50°) with a 2D/3D toggle;
   smooth flyTo animations (easing, ~2s) when jumping to a district or
   My Area result; subtle sky gradient when pitched.
3) RIVERS THAT LOOK LIKE RIVERS: width scales with zoom, slightly
   animated flow dash on the Brahmaputra/Barak, glow when the nearest
   gauge is above danger.
4) UI POLISH PASS:
   • Consistent design tokens: one accent color, risk palette
     (green #22c55e / yellow #eab308 / orange #f97316 / red #dc2626),
     rounded cards, soft shadows, Inter or system font.
   • Bottom sheet with drag handle and snap points (peek / half / full).
   • Skeleton loaders instead of spinners; micro-transitions on risk
     color changes (animate fill, 500ms).
   • Dark mode following system preference (map style swaps to a dark
     OSM style variant).
5) PERFORMANCE GUARDRAILS: satellite/terrain tiles load lazily only
   when selected; keep total JS under control (no new heavy deps);
   test everything at network throttling "Slow 4G" in devtools —
   interactions must stay smooth.
```

---

## After each stage

- Ask Claude Code: "run the dev server, then npm run build and npx tsc --noEmit, fix all errors."
- Paste browser-console errors back verbatim — 1–2 rounds usually fixes them.
- If district GeoJSON looks wrong: "regenerate from the Datameet India districts dataset, Assam only, simplified."
- **Before sharing with anyone:** verify every baked danger level and HFL against ffs.india-water.gov.in, and test on a real phone over mobile data.

## Deploy

`npx vercel` — API routes and their 15-min cache work out of the box on the free tier. Share the URL; the manual FRIMS JSON can be updated with a quick commit each day during flood season.

## Golden rules

1. Mobile-first, honest always.
2. Stale data with a badge beats a blank map.
3. ASDMA/CWC links for real decisions — your dashboard informs, officials warn.
