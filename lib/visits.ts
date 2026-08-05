/**
 * Free, self-hosted visitor counter backed by the same Supabase project. One
 * row per visit; the admin dashboard reads aggregate counts. No third party,
 * no monthly cap. Server-only (service key); the browser only POSTs a beacon.
 */
const URL_BASE = process.env.SUPABASE_URL?.replace(/\/$/, "");
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

export function visitsConfigured(): boolean {
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

/** Record one visit (best-effort). */
export async function recordVisit(path?: string, referrer?: string): Promise<void> {
  await fetch(`${URL_BASE}/rest/v1/visits`, {
    method: "POST",
    headers: headers({ Prefer: "return=minimal" }),
    body: JSON.stringify({
      path: (path ?? "/").slice(0, 300),
      referrer: (referrer ?? "").slice(0, 300) || null,
    }),
  });
}

/** Count rows matching an optional PostgREST filter, via the Content-Range header. */
async function count(filter = ""): Promise<number> {
  const res = await fetch(`${URL_BASE}/rest/v1/visits?select=id${filter}&limit=1`, {
    headers: headers({ Prefer: "count=exact" }),
    cache: "no-store",
  });
  const cr = res.headers.get("content-range") ?? "*/0"; // e.g. "0-0/1234"
  const total = parseInt(cr.split("/")[1] ?? "0", 10);
  return Number.isFinite(total) ? total : 0;
}

export interface VisitStats {
  total: number;
  today: number;
  week: number;
}

export async function getVisitStats(): Promise<VisitStats> {
  const now = new Date();
  const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
  const weekAgo = new Date(now.getTime() - 7 * 86_400_000).toISOString();
  const [total, today, week] = await Promise.all([
    count(),
    count(`&created_at=gte.${startToday}`),
    count(`&created_at=gte.${weekAgo}`),
  ]);
  return { total, today, week };
}
