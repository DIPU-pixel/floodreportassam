/** Community help board — shared types + labels (client + server). */

export type HelpType = "rescue" | "boat" | "medical" | "food" | "water" | "shelter" | "other";

export const HELP_TYPES: { id: HelpType; icon: string; en: string; as: string }[] = [
  { id: "rescue", icon: "🚨", en: "Rescue", as: "উদ্ধাৰ" },
  { id: "boat", icon: "🛶", en: "Boat", as: "নাও" },
  { id: "medical", icon: "🩺", en: "Medical", as: "চিকিৎসা" },
  { id: "food", icon: "🍚", en: "Food", as: "খাদ্য" },
  { id: "water", icon: "💧", en: "Drinking water", as: "খোৱা পানী" },
  { id: "shelter", icon: "🏠", en: "Shelter", as: "আশ্ৰয়" },
  { id: "other", icon: "❓", en: "Other", as: "অন্যান্য" },
];

export function helpTypeLabel(t: HelpType): { icon: string; en: string; as: string } {
  return HELP_TYPES.find((x) => x.id === t) ?? HELP_TYPES[HELP_TYPES.length - 1];
}

/** Public map pin — NO phone, NO precise location, NO photos. */
export interface HelpPin {
  id: string;
  helpType: HelpType;
  message: string;
  posterName?: string | null;
  approxLat: number;
  approxLng: number;
  district?: string | null;
  createdAt: string;
  photoCount: number;
  status: "open" | "resolved" | "hidden";
}

/** Revealed only when a helper taps "I can help". */
export interface HelpDetail extends HelpPin {
  phone: string;
  lat: number;
  lng: number;
  photoUrls: string[];
}

export interface HelpListResponse {
  configured: boolean;
  pins: HelpPin[];
}
