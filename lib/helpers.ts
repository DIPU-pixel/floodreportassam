/**
 * Volunteers & NGOs directory — people/NGOs who OFFER help list themselves so
 * those in need can contact them. Phone numbers are volunteered PUBLICLY here
 * (unlike the SOS board, where the poster's number is gated). Server-only via
 * the service key; the browser talks only to our routes.
 */
import type { HelpType } from "./helpTypes";

const URL_BASE = process.env.SUPABASE_URL?.replace(/\/$/, "");
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

export function helpersConfigured(): boolean {
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

export type HelperKind = "ngo" | "individual";

export interface Helper {
  id: string;
  createdAt: string;
  kind: HelperKind;
  name: string;
  phone: string;
  causes: HelpType[];
  area: string | null;
  description: string | null;
}

export interface AdminHelper extends Helper {
  status: "approved" | "hidden";
  reports: number;
}

interface Row {
  id: string;
  created_at: string;
  kind: HelperKind;
  name: string;
  phone: string;
  causes: HelpType[];
  area: string | null;
  description: string | null;
  status: "approved" | "hidden";
  reports: number;
}

function toHelper(r: Row): Helper {
  return {
    id: r.id,
    createdAt: r.created_at,
    kind: r.kind,
    name: r.name,
    phone: r.phone,
    causes: r.causes ?? [],
    area: r.area,
    description: r.description,
  };
}

const PUBLIC_COLS = "id,created_at,kind,name,phone,causes,area,description";

/** Public list — approved helpers, NGOs first, then newest. */
export async function listHelpers(): Promise<Helper[]> {
  const q =
    `${URL_BASE}/rest/v1/helpers?select=${encodeURIComponent(PUBLIC_COLS)}` +
    `&status=eq.approved&order=kind.asc,created_at.desc&limit=300`;
  const res = await fetch(q, { headers: headers(), cache: "no-store" });
  if (!res.ok) throw new Error(`supabase helpers list ${res.status}`);
  return ((await res.json()) as Row[]).map(toHelper);
}

export interface CreateHelperInput {
  kind: HelperKind;
  name: string;
  phone: string;
  causes: HelpType[];
  area?: string;
  description?: string;
}

export async function createHelper(input: CreateHelperInput): Promise<string> {
  const res = await fetch(`${URL_BASE}/rest/v1/helpers`, {
    method: "POST",
    headers: headers({ Prefer: "return=representation" }),
    body: JSON.stringify({
      kind: input.kind,
      name: input.name,
      phone: input.phone,
      causes: input.causes,
      area: input.area || null,
      description: input.description || null,
    }),
  });
  if (!res.ok) throw new Error(`supabase helper insert ${res.status}: ${await res.text()}`);
  const [row] = (await res.json()) as Row[];
  return row.id;
}

/** Report a helper; auto-hide past a small threshold. */
export async function reportHelper(id: string): Promise<void> {
  const res = await fetch(`${URL_BASE}/rest/v1/helpers?id=eq.${id}&select=reports`, {
    headers: headers(),
    cache: "no-store",
  });
  const [row] = ((await res.json()) as { reports: number }[]) ?? [];
  const reports = (row?.reports ?? 0) + 1;
  await fetch(`${URL_BASE}/rest/v1/helpers?id=eq.${id}`, {
    method: "PATCH",
    headers: headers(),
    body: JSON.stringify(reports >= 3 ? { reports, status: "hidden" } : { reports }),
  });
}

// ── Admin ──────────────────────────────────────────────────────────────────

export async function listAllHelpers(): Promise<AdminHelper[]> {
  const q = `${URL_BASE}/rest/v1/helpers?select=*&order=created_at.desc&limit=500`;
  const res = await fetch(q, { headers: headers(), cache: "no-store" });
  if (!res.ok) throw new Error(`supabase admin helpers ${res.status}`);
  return ((await res.json()) as Row[]).map((r) => ({
    ...toHelper(r),
    status: r.status,
    reports: r.reports,
  }));
}

/** Admin: edit any fields (contact number, causes, status, …). */
export async function updateHelper(
  id: string,
  patch: Partial<Pick<Row, "kind" | "name" | "phone" | "causes" | "area" | "description" | "status">>
): Promise<void> {
  await fetch(`${URL_BASE}/rest/v1/helpers?id=eq.${id}`, {
    method: "PATCH",
    headers: headers(),
    body: JSON.stringify(patch),
  });
}

export async function deleteHelper(id: string): Promise<void> {
  await fetch(`${URL_BASE}/rest/v1/helpers?id=eq.${id}`, { method: "DELETE", headers: headers() });
}
