/**
 * District disaster control-room numbers.
 *
 * SAFETY: a wrong emergency number is dangerous, so this map ships EMPTY.
 * Add entries only with numbers VERIFIED against the district administration /
 * ASDMA. Until then every district correctly falls back to the universal
 * short codes (1077 district control room, 1079 state) + NDRF.
 *
 * Keyed by districtId (matching assam_districts.geojson).
 */
export const DISTRICT_HELPLINE: Record<string, string> = {
  // e.g. sivasagar: "03772-222222",  // ← only after verification
};

/** Universal fallbacks, always valid. */
export const STANDARD_HELPLINES = {
  districtControlRoom: "1077",
  stateHelpline: "1079",
  ndrf: "9711077372",
} as const;

export function districtHelpline(districtId: string): string | null {
  return DISTRICT_HELPLINE[districtId] ?? null;
}
