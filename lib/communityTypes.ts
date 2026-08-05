/** Community discussion — shared types + category labels (client + server). */

export type CommunityCategory = "info" | "question" | "offer" | "update";

export const COMMUNITY_CATEGORIES: {
  id: CommunityCategory;
  icon: string;
  en: string;
  as: string;
}[] = [
  { id: "info", icon: "ℹ️", en: "Info", as: "তথ্য" },
  { id: "question", icon: "❓", en: "Question", as: "প্ৰশ্ন" },
  { id: "offer", icon: "🤝", en: "Offer help", as: "সহায়" },
  { id: "update", icon: "📢", en: "Ground update", as: "খবৰ" },
];

export function categoryLabel(c: CommunityCategory) {
  return COMMUNITY_CATEGORIES.find((x) => x.id === c) ?? COMMUNITY_CATEGORIES[0];
}

export interface CommunityPost {
  id: string;
  createdAt: string;
  parentId: string | null;
  name: string | null;
  category: CommunityCategory;
  message: string;
}

export interface AdminCommunityPost extends CommunityPost {
  status: "approved" | "hidden";
  reports: number;
}
