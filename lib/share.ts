import type { DistrictRisk, FrimsDistrict } from "./types";

const LEVEL_TEXT: Record<DistrictRisk["level"], string> = {
  low: "LOW",
  moderate: "MODERATE",
  high: "HIGH",
  severe: "SEVERE",
};

/**
 * Plain-text, copy/share-friendly summary of a district's modelled flood risk.
 * Clearly labelled as a modelled estimate, never an official warning.
 */
export function districtSummaryText(
  risk: DistrictRisk,
  frims?: { source: string; date: string; data: FrimsDistrict } | null
): string {
  const lines: string[] = [];
  lines.push(`Assam Flood Watch — ${risk.name}`);
  lines.push(`Flood risk: ${LEVEL_TEXT[risk.level]} (${risk.score}/100, modelled estimate)`);
  lines.push(`Rain: ${risk.components.past48hMm} mm last 48h · ${risk.components.next72hMm} mm next 72h`);
  lines.push(
    `Modelled river discharge (nearest gauge): ${Math.round(
      risk.components.dischargeAnomaly * 100
    )}% of high baseline`
  );

  if (frims?.data) {
    const d = frims.data;
    const parts: string[] = [];
    if (d.affectedVillages != null) parts.push(`${d.affectedVillages} villages`);
    if (d.affectedPopulation != null) parts.push(`${d.affectedPopulation.toLocaleString("en-IN")} people`);
    if (d.reliefCamps != null) parts.push(`${d.reliefCamps} relief camps`);
    if (parts.length) {
      lines.push(`Official (${frims.source}, ${frims.date}): ${parts.join(", ")}`);
    }
  }

  lines.push("");
  lines.push("Informational only — not an official warning.");
  lines.push("Official: ASDMA asdma.assam.gov.in · FRIMS frims.asdma.gov.in");
  lines.push("Helplines: 1079 (state) · 1077 (district) · NDRF 9711077372");
  return lines.join("\n");
}

/**
 * Open WhatsApp with the summary pre-filled. Works on phone (app) and desktop
 * (web) via wa.me. Kept separate from the generic share so people can send a
 * flood update straight to a family/village group in one tap.
 */
export function whatsappShareUrl(text: string): string {
  return `https://wa.me/?text=${encodeURIComponent(text)}`;
}

export function openWhatsApp(text: string): void {
  if (typeof window !== "undefined") {
    window.open(whatsappShareUrl(text), "_blank", "noopener,noreferrer");
  }
}

/**
 * Share via the Web Share API when available (mobile), otherwise copy to the
 * clipboard. Resolves to how it was delivered so the UI can give feedback.
 */
export async function shareOrCopy(text: string, title: string): Promise<"shared" | "copied" | "failed"> {
  try {
    if (typeof navigator !== "undefined" && navigator.share) {
      await navigator.share({ title, text });
      return "shared";
    }
  } catch (e) {
    // User cancelled the share sheet, or it failed — fall through to copy.
    if ((e as Error)?.name === "AbortError") return "failed";
  }
  try {
    await navigator.clipboard.writeText(text);
    return "copied";
  } catch {
    return "failed";
  }
}
