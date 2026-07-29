import type { RainfallData } from "./types";
import { FLOOD_PRONENESS } from "./risk";

/**
 * Bundled DEMO rainfall (mm), used only when the live Open-Meteo fetch has
 * never succeeded. Generated deterministically from each district's
 * flood-proneness (heavier over historically flood-prone districts) so the
 * demo map looks realistic across all 33 districts and never goes blank.
 * Clearly badged "DEMO" in the UI.
 */
function hash(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) & 0xffff;
  return (h % 100) / 100; // 0–1, stable per id
}

function demoFor(id: string, prone: number): RainfallData {
  const jitter = hash(id); // stable pseudo-variation
  const past48hMm = Math.round(prone * 90 + jitter * 25);
  const next72hMm = Math.round(prone * 110 + jitter * 30);
  // 7-day saturation: roughly 2.4× the 48h figure for a wet monsoon week.
  const past7dMm = Math.round(past48hMm * (2.1 + jitter * 0.7));
  // 12 daily buckets: 7 past days + today + 4 forecast days.
  const shape = [0.5, 0.6, 0.7, 0.8, 0.9, 1.0, 1.0, 0.9, 0.8, 0.6, 0.45, 0.3];
  const dailyMm = shape.map((k) =>
    Math.round((past7dMm / 7) * k * (0.85 + jitter * 0.4))
  );
  return { districtId: id, past48hMm, next72hMm, past7dMm, dailyMm };
}

export const DEMO_RAINFALL: RainfallData[] = Object.entries(FLOOD_PRONENESS)
  .map(([id, prone]) => demoFor(id, prone))
  .sort((a, b) => b.past48hMm - a.past48hMm);
