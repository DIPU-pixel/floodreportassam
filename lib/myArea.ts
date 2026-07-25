import type { DistrictRisk } from "./types";

export interface MyPlace {
  name: string;
  districtId: string;
  districtName: string;
  lat: number;
  lng: number;
  source: "search" | "gps" | "picker";
}

const KEY = "assam-my-area";

/** Slug a district name to the id convention used across the app / GeoJSON. */
export function districtSlug(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

/** Remember the last checked place so it reopens next visit. */
export function loadMyPlace(): MyPlace | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return null;
    const p = JSON.parse(raw) as MyPlace;
    if (typeof p?.lat === "number" && typeof p?.lng === "number" && p?.name) return p;
  } catch {
    /* ignore corrupt storage */
  }
  return null;
}

export function saveMyPlace(p: MyPlace | null): void {
  if (typeof window === "undefined") return;
  try {
    if (p) window.localStorage.setItem(KEY, JSON.stringify(p));
    else window.localStorage.removeItem(KEY);
  } catch {
    /* storage may be unavailable (private mode) — non-fatal */
  }
}

const LEVEL_AS: Record<DistrictRisk["level"], string> = {
  low: "কম বিপদ",
  moderate: "মধ্যমীয়া বিপদ",
  high: "অধিক বিপদ",
  severe: "গুৰুতৰ বিপদ",
};

const LEVEL_EN: Record<DistrictRisk["level"], string> = {
  low: "Low risk",
  moderate: "Moderate risk",
  high: "High risk",
  severe: "Severe risk",
};

/**
 * Plain-language, bilingual one-liner for a place. Purely descriptive of the
 * modelled inputs — the "modelled estimate / follow ASDMA" note is appended by
 * the UI, never dropped.
 */
export function areaSummary(
  level: DistrictRisk["level"],
  past48hMm: number,
  next72hMm: number
): { en: string; as: string } {
  let rain: string;
  if (next72hMm >= 100) rain = "very heavy rain expected in the next 72h";
  else if (next72hMm >= 50) rain = "heavy rain expected in the next 72h";
  else if (next72hMm >= 20) rain = "moderate rain expected in the next 72h";
  else if (past48hMm >= 50) rain = "heavy rain has already fallen — watch river levels";
  else rain = "little rain expected in the next 72h";

  return {
    en: `${LEVEL_EN[level]}: ${rain}.`,
    as: `${LEVEL_AS[level]}।`,
  };
}
