import { describe, it, expect } from "vitest";
import { computeDistrictRisk, riskLevel, pronenessFor, RISK_WEIGHTS, FLOOD_PRONENESS } from "./risk";
import { waterTrend } from "./discharge";
import { districtSlug } from "./myArea";
import type { RainfallData } from "./types";

/** Omitting past7d leaves the field absent, as older cached payloads would. */
const rain = (past: number, next: number, past7d?: number): RainfallData =>
  ({
    districtId: "x",
    past48hMm: past,
    next72hMm: next,
    ...(past7d === undefined ? {} : { past7dMm: past7d }),
    dailyMm: [],
  }) as RainfallData;

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
  it("all five component weights sum to 1", () => {
    const { observedRain, forecastRain, dischargeAnomaly, saturation, proneness } = RISK_WEIGHTS;
    expect(observedRain + forecastRain + dischargeAnomaly + saturation + proneness).toBeCloseTo(1, 6);
  });

  it("uses the calibrated (lowered) rain caps", () => {
    // Assam floods on moderate rain over saturated ground — high caps
    // under-reported real events, so these must stay low.
    expect(RISK_WEIGHTS.observedRainCapMm).toBe(90);
    expect(RISK_WEIGHTS.forecastRainCapMm).toBe(120);
    expect(RISK_WEIGHTS.saturationCapMm).toBe(250);
  });
});

describe("computeDistrictRisk", () => {
  it("is zero with no inputs", () => {
    const r = computeDistrictRisk("x", "X", 0, undefined, 0);
    expect(r.score).toBe(0);
    expect(r.level).toBe("low");
  });

  it("reaches 100 when every component maxes out", () => {
    const r = computeDistrictRisk("x", "X", 1, rain(9999, 9999, 9999), 1);
    expect(r.score).toBe(100);
    expect(r.level).toBe("severe");
  });

  it("caps rain contributions at the configured mm caps", () => {
    // past7d pinned to 0 so only the observed-rain component varies.
    const atCap = computeDistrictRisk("x", "X", 0, rain(RISK_WEIGHTS.observedRainCapMm, 0, 0), 0);
    const overCap = computeDistrictRisk("x", "X", 0, rain(RISK_WEIGHTS.observedRainCapMm * 10, 0, 0), 0);
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
    // Saturation alone, with no 48h/72h rain.
    expect(
      computeDistrictRisk("x", "X", 0, rain(0, 0, RISK_WEIGHTS.saturationCapMm), 0).score
    ).toBe(Math.round(RISK_WEIGHTS.saturation * 100));
  });

  it("raises the score as the discharge anomaly grows", () => {
    const lo = computeDistrictRisk("x", "X", 0.3, rain(40, 40), 0);
    const hi = computeDistrictRisk("x", "X", 0.3, rain(40, 40), 1);
    expect(hi.score).toBeGreaterThan(lo.score);
  });

  it("scores wet ground higher than dry ground for the same rain", () => {
    const dry = computeDistrictRisk("x", "X", 0.5, rain(40, 40, 20), 0.3);
    const soaked = computeDistrictRisk("x", "X", 0.5, rain(40, 40, 300), 0.3);
    expect(soaked.score).toBeGreaterThan(dry.score);
  });

  it("falls back to the 48h figure when no 7-day history exists", () => {
    // past7dMm omitted → must not read as bone dry.
    const r = computeDistrictRisk("x", "X", 0, rain(60, 0), 0);
    expect(r.components.past7dMm).toBe(60);
  });

  it("lowered caps make a real monsoon day score higher than before", () => {
    // 80mm/48h + 100mm/72h on a prone, saturated district must reach high/severe.
    const r = computeDistrictRisk("barpeta", "Barpeta", 0.9, rain(80, 100, 260), 0.8);
    expect(r.score).toBeGreaterThanOrEqual(75);
    expect(r.level).toBe("severe");
  });

  it("clamps out-of-range inputs", () => {
    const r = computeDistrictRisk("x", "X", 5, rain(-10, -10, -10), 5);
    expect(r.components.floodProneness).toBe(1);
    expect(r.components.dischargeAnomaly).toBe(1);
    expect(r.components.past7dMm).toBeGreaterThanOrEqual(0);
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
