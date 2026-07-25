import { describe, it, expect } from "vitest";
import { computeDistrictRisk, riskLevel, pronenessFor, RISK_WEIGHTS, FLOOD_PRONENESS } from "./risk";
import { waterTrend } from "./discharge";
import { districtSlug } from "./myArea";
import type { RainfallData } from "./types";

const rain = (past: number, next: number): RainfallData => ({
  districtId: "x",
  past48hMm: past,
  next72hMm: next,
  dailyMm: [],
});

describe("riskLevel", () => {
  it("buckets scores into bands", () => {
    expect(riskLevel(0)).toBe("low");
    expect(riskLevel(24)).toBe("low");
    expect(riskLevel(25)).toBe("moderate");
    expect(riskLevel(49)).toBe("moderate");
    expect(riskLevel(50)).toBe("high");
    expect(riskLevel(74)).toBe("high");
    expect(riskLevel(75)).toBe("severe");
    expect(riskLevel(100)).toBe("severe");
  });
});

describe("RISK_WEIGHTS", () => {
  it("component weights sum to 1", () => {
    const { observedRain, forecastRain, dischargeAnomaly, proneness } = RISK_WEIGHTS;
    expect(observedRain + forecastRain + dischargeAnomaly + proneness).toBeCloseTo(1, 6);
  });
});

describe("computeDistrictRisk", () => {
  it("is zero with no inputs", () => {
    const r = computeDistrictRisk("x", "X", 0, undefined, 0);
    expect(r.score).toBe(0);
    expect(r.level).toBe("low");
  });

  it("reaches 100 when every component maxes out", () => {
    const r = computeDistrictRisk("x", "X", 1, rain(9999, 9999), 1);
    expect(r.score).toBe(100);
    expect(r.level).toBe("severe");
  });

  it("caps rain contributions at the configured mm caps", () => {
    const atCap = computeDistrictRisk("x", "X", 0, rain(RISK_WEIGHTS.observedRainCapMm, 0), 0);
    const overCap = computeDistrictRisk("x", "X", 0, rain(RISK_WEIGHTS.observedRainCapMm * 10, 0), 0);
    expect(atCap.score).toBe(overCap.score);
    expect(atCap.score).toBe(Math.round(RISK_WEIGHTS.observedRain * 100));
  });

  it("isolates each weighted component", () => {
    expect(computeDistrictRisk("x", "X", 1, undefined, 0).score).toBe(
      Math.round(RISK_WEIGHTS.proneness * 100)
    );
    expect(computeDistrictRisk("x", "X", 0, undefined, 1).score).toBe(
      Math.round(RISK_WEIGHTS.dischargeAnomaly * 100)
    );
  });

  it("raises the score as the discharge anomaly grows", () => {
    const lo = computeDistrictRisk("x", "X", 0.3, rain(40, 40), 0);
    const hi = computeDistrictRisk("x", "X", 0.3, rain(40, 40), 1);
    expect(hi.score).toBeGreaterThan(lo.score);
  });

  it("clamps out-of-range inputs", () => {
    const r = computeDistrictRisk("x", "X", 5, rain(-10, -10), 5);
    expect(r.components.floodProneness).toBe(1);
    expect(r.components.dischargeAnomaly).toBe(1);
    expect(r.score).toBeGreaterThanOrEqual(0);
    expect(r.score).toBeLessThanOrEqual(100);
  });
});

describe("pronenessFor", () => {
  it("weights valley districts above hill districts", () => {
    expect(FLOOD_PRONENESS.dhemaji).toBeGreaterThan(FLOOD_PRONENESS["dima-hasao"]);
    expect(pronenessFor("majuli")).toBeGreaterThan(0.9);
  });
  it("falls back for unknown districts", () => {
    expect(pronenessFor("nowhere")).toBe(0.4);
    expect(pronenessFor("nowhere", 0.1)).toBe(0.1);
  });
  it("covers all 33 modern districts, including the new ones", () => {
    for (const id of [
      "majuli", "charaideo", "biswanath", "hojai", "udalguri", "baksa", "chirang",
      "south-salmara-mankachar", "west-karbi-anglong", "kamrup-metropolitan",
    ]) {
      expect(FLOOD_PRONENESS[id], `${id} missing`).toBeGreaterThan(0);
    }
    expect(Object.keys(FLOOD_PRONENESS)).toHaveLength(33);
  });
});

describe("waterTrend", () => {
  const flat = [100, 100, 100, 100, 100, 100, 100];
  it("detects rising water vs the past-7-day mean", () => {
    expect(waterTrend([...flat, 130, 0, 0, 0, 0, 0, 0], 7)).toBe("rising");
  });
  it("detects falling water", () => {
    expect(waterTrend([...flat, 70, 0, 0, 0, 0, 0, 0], 7)).toBe("falling");
  });
  it("treats small changes as steady", () => {
    expect(waterTrend([...flat, 103, 0, 0, 0, 0, 0, 0], 7)).toBe("steady");
  });
  it("is steady with no past data", () => {
    expect(waterTrend([500], 0)).toBe("steady");
  });
});

describe("districtSlug", () => {
  it("matches the ids used by the district GeoJSON", () => {
    expect(districtSlug("South Salmara Mankachar")).toBe("south-salmara-mankachar");
    expect(districtSlug("Kamrup Metropolitan")).toBe("kamrup-metropolitan");
    expect(districtSlug("West Karbi Anglong")).toBe("west-karbi-anglong");
  });
});
