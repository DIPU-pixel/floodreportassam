import { describe, it, expect } from "vitest";
import gaugesFile from "../public/data/gauges.json";
import { haversineKm } from "./geo";
import { nearestGaugeOnRiver, sameRiver, riverKey } from "./gauges";
import type { GaugeStation } from "./types";

const stations = gaugesFile.stations as GaugeStation[];

// Nazira, Sivasagar — on the Dikhow. The geographically nearest gauge is
// Neamatighat on the Brahmaputra (~50+ km away). This is the exact bug the
// Stage-1 fix must prevent from surfacing a cross-river danger badge.
const NAZIRA = { lat: 26.92, lng: 94.74, river: "Dikhow" };

describe("river name matching", () => {
  it("normalises OSM-style names to a gauge's clean river field", () => {
    expect(riverKey("DIKHOW NODI")).toBe("dikhow");
    expect(riverKey("BRAHMAPUTRA NODI")).toBe(riverKey("Brahmaputra"));
  });

  it("matches only the same river; never across rivers", () => {
    expect(sameRiver("BRAHMAPUTRA NODI", "Brahmaputra")).toBe(true);
    expect(sameRiver("Jia Bharali", "JIA BHARALI")).toBe(true);
    expect(sameRiver("DIKHOW NODI", "Brahmaputra")).toBe(false);
    expect(sameRiver("Dikhow", undefined)).toBe(false);
  });
});

describe("gauge attribution (Stage 1 acceptance)", () => {
  it("the raw-nearest gauge to Nazira IS the cross-river Neamatighat (bug setup)", () => {
    const nearest = [...stations].sort(
      (a, b) =>
        haversineKm(NAZIRA.lat, NAZIRA.lng, a.lat, a.lng) -
        haversineKm(NAZIRA.lat, NAZIRA.lng, b.lat, b.lng)
    )[0];
    expect(nearest.id).toBe("neamatighat");
    expect(nearest.river).toBe("Brahmaputra"); // a DIFFERENT river from the Dikhow
  });

  it("returns NO gauge for a Dikhow location (never borrows Neamatighat)", () => {
    const onRiver = nearestGaugeOnRiver(stations, NAZIRA.river, NAZIRA.lat, NAZIRA.lng);
    expect(onRiver).toBeNull();
  });

  it("returns a same-river gauge for a Brahmaputra location", () => {
    const onRiver = nearestGaugeOnRiver(stations, "Brahmaputra", 26.83, 94.2);
    expect(onRiver).not.toBeNull();
    expect(onRiver!.station.river).toBe("Brahmaputra");
  });
});
