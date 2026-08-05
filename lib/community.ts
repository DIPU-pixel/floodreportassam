/**
 * Server-side data layer for the community discussion (Supabase). All access
 * via the service key in Route Handlers; RLS stays closed. Posts are
 * community-submitted and unverified — the UI labels them so and offers
 * report/admin moderation.
 */
import type { CommunityCategory, CommunityPost, AdminCommunityPost } from "./communityTypes";

const URL_BASE = process.env.SUPABASE_URL?.replace(/\/$/, "");
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

export function communityConfigured(): boolean {
  return Boolean(URL_BASE && SERVICE_KEY);
}

function headers(extra?: Record<string, string>): Record<string, string> {
  return {
    apikey: SERVICE_KEY!,
    Authorization: `Bearer ${SERVICE_KEY}`,
    "content-type": "application/json",
    ...extra,
  };
}

interface Row {
  id: string;
  created_at: string;
  parent_id: string | null;
  name: string | null;
  category: CommunityCategory;
  message: string;
  status: "approved" | "hidden";
  reports: number;
}

function toPost(r: Row): CommunityPost {
  return {
    id: r.id,
    createdAt: r.created_at,
    parentId: r.parent_id,
    name: r.name,
    category: r.category,
    message: r.message,
  };
}

const PUBLIC_COLS = "id,created_at,parent_id,name,category,message";

/** All approved posts (threads + replies), oldest first — the client threads them. */
export async function listPosts(): Promise<CommunityPost[]> {
  const q =
    `${URL_BASE}/rest/v1/community_posts?select=${encodeURIComponent(PUBLIC_COLS)}` +
    `&status=eq.approved&order=created_at.asc&limit=500`;
  const res = await fetch(q, { headers: headers(), cache: "no-store" });
  if (!res.ok) throw new Error(`supabase community ${res.status}`);
  return ((await res.json()) as Row[]).map(toPost);
}

export interface CreatePostInput {
  parentId?: string | null;
  name?: string;
  category: CommunityCategory;
  message: string;
}

export async function createPost(input: CreatePostInput): Promise<string> {
  const res = await fetch(`${URL_BASE}/rest/v1/community_posts`, {
    method: "POST",
    headers: headers({ Prefer: "return=representation" }),
    body: JSON.stringify({
      parent_id: input.parentId || null,
      name: input.name || null,
      category: input.category,
      message: input.message,
    }),
  });
  if (!res.ok) throw new Error(`supabase community insert ${res.status}: ${await res.text()}`);
  const [row] = (await res.json()) as Row[];
  return row.id;
}

export async function reportPost(id: string): Promise<void> {
  const res = await fetch(`${URL_BASE}/rest/v1/community_posts?id=eq.${id}&select=reports`, {
    headers: headers(),
    cache: "no-store",
  });
  const [row] = ((await res.json()) as { reports: number }[]) ?? [];
  const reports = (row?.reports ?? 0) + 1;
  await fetch(`${URL_BASE}/rest/v1/community_posts?id=eq.${id}`, {
    method: "PATCH",
    headers: headers(),
    body: JSON.stringify(reports >= 3 ? { reports, status: "hidden" } : { reports }),
  });
}

// ── Admin ──────────────────────────────────────────────────────────────────

export async function listAllPosts(): Promise<AdminCommunityPost[]> {
  const q = `${URL_BASE}/rest/v1/community_posts?select=*&order=created_at.desc&limit=500`;
  const res = await fetch(q, { headers: headers(), cache: "no-store" });
  if (!res.ok) throw new Error(`supabase admin community ${res.status}`);
  return ((await res.json()) as Row[]).map((r) => ({ ...toPost(r), status: r.status, reports: r.reports }));
}

export async function setStatus(id: string, status: "approved" | "hidden"): Promise<void> {
  await fetch(`${URL_BASE}/rest/v1/community_posts?id=eq.${id}`, {
    method: "PATCH",
    headers: headers(),
    body: JSON.stringify({ status }),
  });
}

/** Delete a post; its replies cascade (FK on delete cascade). */
export async function deletePost(id: string): Promise<void> {
  await fetch(`${URL_BASE}/rest/v1/community_posts?id=eq.${id}`, { method: "DELETE", headers: headers() });
}
