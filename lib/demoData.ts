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
  const past48hMm = Math.round(prone * 120 + jitter * 30);
  const next72hMm = Math.round(prone * 150 + jitter * 40);
  // Spread across 7 days: 2 past + 5 forecast, front-loaded.
  const daily = [0.55, 0.5, 0.48, 0.42, 0.34, 0.22, 0.16].map((k) =>
    Math.round((past48hMm + next72hMm) * 0.14 * k * (0.85 + jitter * 0.4))
  );
  return { districtId: id, past48hMm, next72hMm, dailyMm: daily };
}

export const DEMO_RAINFALL: RainfallData[] = Object.entries(FLOOD_PRONENESS)
  .map(([id, prone]) => demoFor(id, prone))
  .sort((a, b) => b.past48hMm - a.past48hMm);
