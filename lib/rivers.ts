import type { GaugeReading, GaugeStation, GaugeStatus, ModelledDischarge, WaterTrend } from "./types";
import { gaugeStatus, nearestGaugeOnRiver, riverKey } from "./gauges";

/**
 * Assamese names for the rivers people are most likely to be near. River
 * geometry from OSM has no Assamese labels, so we map the common ones by their
 * cleaned English key and fall back to the English name for the long tail.
 */
const RIVER_AS: Record<string, string> = {
  brahmaputra: "ব্ৰহ্মপুত্ৰ",
  barak: "বৰাক",
  dikhow: "ডিখৌ",
  disang: "ডিচাং",
  desang: "দেচাং",
  dhansiri: "ধনশিৰি",
  moradhansiri: "মৰা ধনশিৰি",
  mitong: "মিটং",
  jhanji: "জাঞ্জী",
  buridihing: "বুঢ়ীদিহিং",
  dihing: "দিহিং",
  kopili: "কপিলী",
  kolong: "কলং",
  jiabharali: "জিয়া ভৰলী",
  subansiri: "সুবনসিৰি",
  manas: "মানাস",
  beki: "বেকী",
  puthimari: "পুঠিমাৰী",
  pagladiya: "পাগলাদিয়া",
  gaurang: "গৌৰাং",
  kushiyara: "কুশিয়াৰা",
  lohit: "লোহিত",
  dibang: "দিবাং",
  sonai: "সোণাই",
  katakhal: "কাটাখাল",
  longai: "লঙাই",
};

export function riverNameAs(name: string): string | undefined {
  return RIVER_AS[riverKey(name)];
}

export type RiverTier = "gauged" | "modelled" | "unmonitored";

export interface RiverRow {
  name: string;
  nameAs?: string;
  km: number;
  tier: RiverTier;
  gauge: {
    name: string;
    km: number;
    levelM: number;
    dangerLevelM: number;
    status: GaugeStatus;
    trend: WaterTrend;
    /** ISO time of a live reading (absent for demo levels). */
    timestamp?: string;
  } | null;
  /** Stage 3B: GloFAS modelled discharge for a gaugeless river. */
  modelled?: ModelledDischarge | null;
}

/**
 * Build the ranked nearby-rivers list. Each river carries ONLY its own
 * same-river gauge (never another river's), so a status can never leak across
 * rivers. Gaugeless rivers are "unmonitored" here; Stage 3B upgrades them to
 * "modelled" with GloFAS discharge.
 */
export function buildRiverRows(
  nearby: { name: string; km: number }[],
  stations: GaugeStation[],
  readings: Map<string, GaugeReading>,
  lat: number,
  lng: number,
  modelledByRiver?: Map<string, ModelledDischarge | null>
): RiverRow[] {
  return nearby.map((r) => {
    const g = nearestGaugeOnRiver(stations, r.name, lat, lng);
    if (!g) {
      // No gauge → modelled (GloFAS) if we have it, else unmonitored.
      const modelled = modelledByRiver?.get(riverKey(r.name)) ?? null;
      return {
        name: r.name,
        nameAs: riverNameAs(r.name),
        km: r.km,
        tier: modelled ? "modelled" : "unmonitored",
        gauge: null,
        modelled,
      };
    }
    const rd = readings.get(g.station.id);
    const levelM = rd?.levelM ?? g.station.dangerLevelM - 2;
    return {
      name: r.name,
      nameAs: riverNameAs(r.name),
      km: r.km,
      tier: "gauged",
      gauge: {
        name: g.station.name,
        km: g.km,
        levelM,
        dangerLevelM: g.station.dangerLevelM,
        status: gaugeStatus(g.station, levelM),
        trend: rd?.trend ?? "steady",
        timestamp: rd?.timestamp,
      },
    };
  });
}

const STATUS_ORDER: Record<GaugeStatus, number> = { normal: 0, warning: 1, danger: 2, extreme: 3 };

/**
 * The overall card risk derives ONLY from same-river gauge statuses — worst
 * wins. Returns the worst row only when it is at/above danger, so the UI can
 * name THAT river; otherwise null (fall back to the modelled district risk).
 */
export function worstRiverRow(rows: RiverRow[]): RiverRow | null {
  let worst: RiverRow | null = null;
  for (const r of rows) {
    if (!r.gauge) continue;
    if (!worst || STATUS_ORDER[r.gauge.status] > STATUS_ORDER[worst.gauge!.status]) worst = r;
  }
  return worst && worst.gauge && STATUS_ORDER[worst.gauge.status] >= STATUS_ORDER.danger ? worst : null;
}
