import { describe, it, expect } from "vitest";
import gaugesFile from "../public/data/gauges.json";
import { DEMO_GAUGE_READINGS } from "./gauges";
import { buildRiverRows, worstRiverRow, riverNameAs } from "./rivers";
import type { GaugeStation, GaugeReading } from "./types";

const stations = gaugesFile.stations as GaugeStation[];
const readings = new Map<string, GaugeReading>(DEMO_GAUGE_READINGS.map((r) => [r.stationId, r]));

// Neamatighat's location — the same-river Brahmaputra gauge is the match here.
const NEAMATI = { lat: 26.83, lng: 94.2 };
// Nazira — Dikhow only, no gauge.
const NAZIRA = { lat: 26.92, lng: 94.74 };

describe("Stage 2 — nearby-river rows", () => {
  it("resolves Assamese names for known rivers, undefined otherwise", () => {
    expect(riverNameAs("DIKHOW NODI")).toBeDefined();
    expect(riverNameAs("Brahmaputra")).toBe("ব্ৰহ্মপুত্ৰ");
    expect(riverNameAs("Some Unknown Stream")).toBeUndefined();
  });

  it("Dikhow row is unmonitored (no gauge); Brahmaputra row is gauged", () => {
    const rows = buildRiverRows(
      [{ name: "Dikhow", km: 0.2 }, { name: "Brahmaputra", km: 8 }],
      stations,
      readings,
      NEAMATI.lat,
      NEAMATI.lng
    );
    const dikhow = rows.find((r) => r.name === "Dikhow")!;
    const brah = rows.find((r) => r.name === "Brahmaputra")!;
    expect(dikhow.tier).toBe("unmonitored");
    expect(dikhow.gauge).toBeNull();
    expect(brah.tier).toBe("gauged");
    expect(brah.gauge?.status).toBe("danger"); // demo Neamatighat 85.40 m > DL 85.04 m
  });

  it("worst-river = the above-danger river, named (worst wins)", () => {
    const rows = buildRiverRows(
      [{ name: "Dikhow", km: 0.2 }, { name: "Brahmaputra", km: 8 }],
      stations,
      readings,
      NEAMATI.lat,
      NEAMATI.lng
    );
    expect(worstRiverRow(rows)?.name).toBe("Brahmaputra");
  });

  it("no worst-river for a Dikhow-only location (nothing to borrow)", () => {
    const rows = buildRiverRows([{ name: "Dikhow", km: 0.2 }], stations, readings, NAZIRA.lat, NAZIRA.lng);
    expect(worstRiverRow(rows)).toBeNull();
  });
});
