/**
 * Calibrate the modelled risk against reality.
 *
 *   node scripts/calibrate.mjs
 *
 * Reads public/data/frims-latest.json (the OFFICIAL ASDMA list of districts
 * actually reporting flooding), fetches TODAY's live rain + discharge, runs the
 * same risk maths the app uses, and prints a comparison table + hit rate.
 *
 * Run this during flood season. If FRIMS-affected districts are NOT showing
 * high/severe, the weights/caps in lib/risk.ts are wrong — nudge them and
 * re-run. This is the only honest way to know the model means anything.
 *
 * Exit code is always 0 — this is a reporting tool, not a test.
 */
import { readFile } from "node:fs/promises";
import path from "node:path";

const ROOT = process.cwd();
const p = (...f) => path.join(ROOT, ...f);

// ── Mirror of lib/risk.ts (kept in sync manually; printed below so drift shows)
const W = {
  observedRain: 0.25,
  forecastRain: 0.2,
  dischargeAnomaly: 0.2,
  saturation: 0.15,
  proneness: 0.2,
  observedRainCapMm: 90,
  forecastRainCapMm: 120,
  saturationCapMm: 250,
};
const level = (s) => (s >= 75 ? "severe" : s >= 50 ? "high" : s >= 25 ? "moderate" : "low");
const slug = (s) =>
  s.toLowerCase().trim().replace(/&/g, "and").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

const sum = (a) => a.reduce((t, v) => t + v, 0);
const num = (v) => (typeof v === "number" && Number.isFinite(v) ? v : 0);

async function main() {
  const districts = JSON.parse(await readFile(p("public", "data", "assam_districts.geojson"), "utf8"))
    .features.map((f) => f.properties);

  let frims = null;
  try {
    frims = JSON.parse(await readFile(p("public", "data", "frims-latest.json"), "utf8"));
  } catch {
    /* optional */
  }
  const affected = new Set(
    (frims?.districts ?? []).map((d) => d.districtId ?? slug(d.name))
  );

  console.log(`\nWeights: observed ${W.observedRain} · forecast ${W.forecastRain} · discharge ` +
    `${W.dischargeAnomaly} · saturation ${W.saturation} · proneness ${W.proneness}`);
  console.log(`Caps: 48h ${W.observedRainCapMm}mm · 72h ${W.forecastRainCapMm}mm · 7d ${W.saturationCapMm}mm`);

  if (affected.size === 0) {
    console.log(
      "\n⚠  No FRIMS data in public/data/frims-latest.json (or it's the empty template)."
    );
    console.log("   Fill it from frims.asdma.gov.in, then re-run to get a hit rate.");
    console.log("   Showing modelled levels only.\n");
  } else {
    console.log(`\nFRIMS (${frims.date}): ${affected.size} districts reported flood-affected.\n`);
  }

  // ── Live rain for every district centroid (one batched call)
  const lats = districts.map((d) => d.centroidLat).join(",");
  const lngs = districts.map((d) => d.centroidLng).join(",");
  const rainUrl =
    `https://api.open-meteo.com/v1/forecast?latitude=${lats}&longitude=${lngs}` +
    `&hourly=precipitation&daily=precipitation_sum&current=precipitation` +
    `&past_days=7&forecast_days=5&timezone=Asia%2FKolkata`;

  let rainByIdx = [];
  try {
    const res = await fetch(rainUrl);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    rainByIdx = (Array.isArray(json) ? json : [json]).map((loc) => {
      const times = loc?.hourly?.time ?? [];
      const precip = (loc?.hourly?.precipitation ?? []).map(num);
      const nowKey = loc?.current?.time?.slice(0, 13);
      const i = nowKey ? times.findIndex((t) => t.slice(0, 13) >= nowKey) : -1;
      if (i < 0 || !precip.length) return { past48hMm: 0, next72hMm: 0, past7dMm: 0 };
      return {
        past48hMm: Math.round(sum(precip.slice(Math.max(0, i - 48), i))),
        next72hMm: Math.round(sum(precip.slice(i, i + 72))),
        past7dMm: Math.round(sum(precip.slice(Math.max(0, i - 168), i))),
      };
    });
  } catch (e) {
    console.error("Live rain fetch failed:", e.message, "— cannot calibrate.");
    return;
  }

  // ── Score every district (discharge omitted: it needs per-gauge baselines;
  //    this tool focuses on the rain/saturation terms we actually tune here).
  const rows = districts.map((d, i) => {
    const r = rainByIdx[i] ?? { past48hMm: 0, next72hMm: 0, past7dMm: 0 };
    const score = Math.round(
      100 *
        Math.min(
          1,
          Math.min(r.past48hMm / W.observedRainCapMm, 1) * W.observedRain +
            Math.min(r.next72hMm / W.forecastRainCapMm, 1) * W.forecastRain +
            Math.min(r.past7dMm / W.saturationCapMm, 1) * W.saturation +
            Math.min(Math.max(d.floodProneness, 0), 1) * W.proneness
        )
    );
    return { id: d.id, name: d.name, ...r, score, level: level(score), flooded: affected.has(d.id) };
  });
  rows.sort((a, b) => b.score - a.score);

  const pad = (s, n) => String(s).padEnd(n);
  const lpad = (s, n) => String(s).padStart(n);
  console.log(
    pad("District", 24) + lpad("48h", 5) + lpad("72h", 6) + lpad("7d", 6) +
      lpad("score", 7) + "  " + pad("level", 9) + "FRIMS"
  );
  console.log("-".repeat(70));
  for (const r of rows) {
    console.log(
      pad(r.name, 24) + lpad(r.past48hMm, 5) + lpad(r.next72hMm, 6) + lpad(r.past7dMm, 6) +
        lpad(r.score, 7) + "  " + pad(r.level, 9) + (r.flooded ? "AFFECTED" : "")
    );
  }

  if (affected.size > 0) {
    const flooded = rows.filter((r) => r.flooded);
    const caught = flooded.filter((r) => r.score >= 50); // high or severe
    const falsePos = rows.filter((r) => !r.flooded && r.score >= 50);
    const hit = flooded.length ? Math.round((caught.length / flooded.length) * 100) : 0;

    console.log("\n" + "=".repeat(70));
    console.log(`HIT RATE: ${caught.length}/${flooded.length} (${hit}%) of FRIMS-affected districts scored high/severe.`);
    console.log(`FALSE POSITIVES: ${falsePos.length} districts scored high/severe with no FRIMS report.`);
    const missed = flooded.filter((r) => r.score < 50).map((r) => `${r.name} (${r.score})`);
    if (missed.length) console.log(`MISSED: ${missed.join(", ")}`);
    console.log(
      "\nIf the hit rate is low, raise the saturation/proneness weights or lower the\n" +
        "caps in lib/risk.ts. If false positives are high, do the opposite. Re-run after each change."
    );
  }
  console.log("");
}

main().catch((e) => {
  console.error("FAILED:", e);
});
