/**
 * Server-side data layer for the community help board (Supabase).
 *
 * All access uses the SERVICE ROLE key and runs only in Route Handlers — the
 * browser never talks to Supabase directly, and Row Level Security stays
 * closed. The feature self-hides when these env vars are absent:
 *   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 */
import type { HelpPin, HelpDetail, HelpType } from "./helpTypes";

const URL_BASE = process.env.SUPABASE_URL?.replace(/\/$/, "");
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const BUCKET = "help-photos";

export function helpConfigured(): boolean {
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

/** Round to ~1 km so public pins never point at an exact house. */
function fuzz(n: number): number {
  return Math.round(n * 100) / 100;
}

interface Row {
  id: string;
  created_at: string;
  help_type: HelpType;
  message: string;
  poster_name: string | null;
  poster_phone: string;
  lat: number;
  lng: number;
  approx_lat: number;
  approx_lng: number;
  district: string | null;
  photo_paths: string[];
  status: HelpPin["status"];
  reports: number;
}

const PIN_COLS = "id,created_at,help_type,message,poster_name,approx_lat,approx_lng,district,photo_paths,status";

function toPin(r: Row): HelpPin {
  return {
    id: r.id,
    helpType: r.help_type,
    message: r.message,
    posterName: r.poster_name,
    approxLat: r.approx_lat,
    approxLng: r.approx_lng,
    district: r.district,
    createdAt: r.created_at,
    photoCount: r.photo_paths?.length ?? 0,
    status: r.status,
  };
}

/** Active (open, unexpired) posts for the public map — no phone, no exact loc. */
export async function listActivePins(): Promise<HelpPin[]> {
  const q =
    `${URL_BASE}/rest/v1/help_posts?select=${encodeURIComponent(PIN_COLS)}` +
    `&status=eq.open&expires_at=gt.${new Date().toISOString()}` +
    `&order=created_at.desc&limit=300`;
  const res = await fetch(q, { headers: headers(), cache: "no-store" });
  if (!res.ok) throw new Error(`supabase list ${res.status}`);
  const rows = (await res.json()) as Row[];
  return rows.map(toPin);
}

export interface CreateInput {
  helpType: HelpType;
  message: string;
  posterName?: string;
  phone: string;
  lat: number;
  lng: number;
  district?: string;
}

/** Insert a post; returns its id. Photos are attached separately. */
export async function createPost(input: CreateInput): Promise<string> {
  const body = {
    help_type: input.helpType,
    message: input.message,
    poster_name: input.posterName || null,
    poster_phone: input.phone,
    lat: input.lat,
    lng: input.lng,
    approx_lat: fuzz(input.lat),
    approx_lng: fuzz(input.lng),
    district: input.district || null,
  };
  const res = await fetch(`${URL_BASE}/rest/v1/help_posts`, {
    method: "POST",
    headers: headers({ Prefer: "return=representation" }),
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`supabase insert ${res.status}: ${await res.text()}`);
  const [row] = (await res.json()) as Row[];
  return row.id;
}

/** Upload one photo (already compressed client-side) to the private bucket. */
export async function uploadPhoto(
  postId: string,
  index: number,
  bytes: ArrayBuffer,
  contentType: string
): Promise<string> {
  const ext = contentType.includes("png") ? "png" : contentType.includes("webp") ? "webp" : "jpg";
  const path = `${postId}/${index}.${ext}`;
  const res = await fetch(`${URL_BASE}/storage/v1/object/${BUCKET}/${path}`, {
    method: "POST",
    headers: { apikey: SERVICE_KEY!, Authorization: `Bearer ${SERVICE_KEY}`, "content-type": contentType },
    body: bytes,
  });
  if (!res.ok) throw new Error(`supabase upload ${res.status}`);
  return path;
}

/** Attach uploaded photo paths to a post. */
export async function setPhotoPaths(postId: string, paths: string[]): Promise<void> {
  await fetch(`${URL_BASE}/rest/v1/help_posts?id=eq.${postId}`, {
    method: "PATCH",
    headers: headers(),
    body: JSON.stringify({ photo_paths: paths }),
  });
}

async function signedUrl(path: string): Promise<string | null> {
  const res = await fetch(`${URL_BASE}/storage/v1/object/sign/${BUCKET}/${path}`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({ expiresIn: 60 * 60 }), // 1 hour
  });
  if (!res.ok) return null;
  const { signedURL } = (await res.json()) as { signedURL: string };
  return `${URL_BASE}/storage/v1${signedURL}`;
}

/** Full detail incl. phone + signed photo URLs — the "I can help" reveal. */
export async function getDetail(id: string): Promise<HelpDetail | null> {
  const q = `${URL_BASE}/rest/v1/help_posts?id=eq.${id}&status=eq.open&select=*&limit=1`;
  const res = await fetch(q, { headers: headers(), cache: "no-store" });
  if (!res.ok) return null;
  const [row] = (await res.json()) as Row[];
  if (!row) return null;

  const photoUrls = (
    await Promise.all((row.photo_paths ?? []).map((p) => signedUrl(p)))
  ).filter((u): u is string => !!u);

  return { ...toPin(row), phone: row.poster_phone, lat: row.lat, lng: row.lng, photoUrls };
}

/** Mark resolved (poster no longer needs help). */
export async function resolvePost(id: string): Promise<void> {
  await fetch(`${URL_BASE}/rest/v1/help_posts?id=eq.${id}`, {
    method: "PATCH",
    headers: headers(),
    body: JSON.stringify({ status: "resolved" }),
  });
}

/** Report a post; auto-hide once it crosses a small threshold. */
export async function reportPost(id: string): Promise<void> {
  const res = await fetch(
    `${URL_BASE}/rest/v1/help_posts?id=eq.${id}&select=reports`,
    { headers: headers(), cache: "no-store" }
  );
  const [row] = ((await res.json()) as { reports: number }[]) ?? [];
  const reports = (row?.reports ?? 0) + 1;
  await fetch(`${URL_BASE}/rest/v1/help_posts?id=eq.${id}`, {
    method: "PATCH",
    headers: headers(),
    body: JSON.stringify(reports >= 3 ? { reports, status: "hidden" } : { reports }),
  });
}

// ---------------------------------------------------------------------------
// Admin — used only by the password-gated /admin dashboard (auth enforced in
// the admin API routes; these functions assume the caller is already authorised).
// ---------------------------------------------------------------------------

export interface AdminHelpItem extends HelpPin {
  phone: string;
  lat: number;
  lng: number;
  reports: number;
  expiresAt: string;
  photoUrls: string[];
}

/** Every post (any status), newest first, with full contact + signed photos. */
export async function listAllForAdmin(limit = 500): Promise<AdminHelpItem[]> {
  const q = `${URL_BASE}/rest/v1/help_posts?select=*&order=created_at.desc&limit=${limit}`;
  const res = await fetch(q, { headers: headers(), cache: "no-store" });
  if (!res.ok) throw new Error(`supabase admin list ${res.status}`);
  const rows = (await res.json()) as (Row & { expires_at: string })[];
  return Promise.all(
    rows.map(async (r) => ({
      ...toPin(r),
      phone: r.poster_phone,
      lat: r.lat,
      lng: r.lng,
      reports: r.reports,
      expiresAt: r.expires_at,
      photoUrls: (await Promise.all((r.photo_paths ?? []).map((p) => signedUrl(p)))).filter(
        (u): u is string => !!u
      ),
    }))
  );
}

/** Admin: set a post's status (open / resolved / hidden). */
export async function setStatus(id: string, status: "open" | "resolved" | "hidden"): Promise<void> {
  await fetch(`${URL_BASE}/rest/v1/help_posts?id=eq.${id}`, {
    method: "PATCH",
    headers: headers(),
    body: JSON.stringify({ status }),
  });
}

/** Admin: permanently delete a post AND its photos from storage. */
export async function deletePost(id: string): Promise<void> {
  // 1) find its photo objects, 2) delete them, 3) delete the row.
  const res = await fetch(`${URL_BASE}/rest/v1/help_posts?id=eq.${id}&select=photo_paths`, {
    headers: headers(),
    cache: "no-store",
  });
  const [row] = ((await res.json()) as { photo_paths: string[] }[]) ?? [];
  for (const path of row?.photo_paths ?? []) {
    await fetch(`${URL_BASE}/storage/v1/object/${BUCKET}/${path}`, {
      method: "DELETE",
      headers: headers(),
    }).catch(() => {});
  }
  await fetch(`${URL_BASE}/rest/v1/help_posts?id=eq.${id}`, { method: "DELETE", headers: headers() });
}
