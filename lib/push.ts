import { promises as fs } from "fs";
import path from "path";
import webpush from "web-push";

/**
 * Server-side web-push plumbing.
 *
 * VAPID keys come from env (generate once with `node scripts/gen-vapid.mjs`):
 *   VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT (mailto:you@example.org)
 *
 * Subscriptions are persisted to ONE of two backends, chosen at runtime:
 *   • Upstash Redis (durable, serverless-safe) when UPSTASH_REDIS_REST_URL +
 *     UPSTASH_REDIS_REST_TOKEN are set — use this on Vercel/any serverless host.
 *   • A local JSON file otherwise — convenient for `npm run dev`, but NO GOOD
 *     on serverless (read-only / ephemeral filesystem).
 * Records are keyed by push endpoint in a single Redis hash, or an array in the
 * file. The rest of the code (send, prune) is backend-agnostic.
 */

export interface PushSubscriptionRecord {
  endpoint: string;
  keys: { p256dh: string; auth: string };
  /** District this device wants alerts for (matches the GeoJSON id). */
  districtId?: string;
  districtName?: string;
  lang?: "en" | "as";
  createdAt: string;
}

const STORE_PATH =
  process.env.PUSH_STORE_PATH || path.join(process.cwd(), ".data", "push-subscriptions.json");

// --- Upstash Redis (REST) backend ------------------------------------------
const UPSTASH_URL = process.env.UPSTASH_REDIS_REST_URL;
const UPSTASH_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;
const REDIS_HASH = "afw:subs";

function upstashConfigured(): boolean {
  return Boolean(UPSTASH_URL && UPSTASH_TOKEN);
}

async function upstash<T = unknown>(command: string[]): Promise<T> {
  const res = await fetch(UPSTASH_URL!, {
    method: "POST",
    headers: { Authorization: `Bearer ${UPSTASH_TOKEN}`, "content-type": "application/json" },
    body: JSON.stringify(command),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`upstash ${res.status}`);
  const json = (await res.json()) as { result: T };
  return json.result;
}

let vapidReady = false;

/** True only when all VAPID env vars are present. Routes 503 without it. */
export function pushConfigured(): boolean {
  return Boolean(
    process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY && process.env.VAPID_SUBJECT
  );
}

export function publicVapidKey(): string {
  return process.env.VAPID_PUBLIC_KEY ?? "";
}

function ensureVapid(): void {
  if (vapidReady || !pushConfigured()) return;
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT!,
    process.env.VAPID_PUBLIC_KEY!,
    process.env.VAPID_PRIVATE_KEY!
  );
  vapidReady = true;
}

async function readFileStore(): Promise<PushSubscriptionRecord[]> {
  try {
    const raw = await fs.readFile(STORE_PATH, "utf8");
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? (parsed as PushSubscriptionRecord[]) : [];
  } catch {
    return [];
  }
}

async function writeFileStore(records: PushSubscriptionRecord[]): Promise<void> {
  await fs.mkdir(path.dirname(STORE_PATH), { recursive: true });
  await fs.writeFile(STORE_PATH, JSON.stringify(records, null, 2), "utf8");
}

export async function readStore(): Promise<PushSubscriptionRecord[]> {
  if (upstashConfigured()) {
    // HGETALL → [field1, value1, field2, value2, …]; values are at odd indices.
    const flat = (await upstash<string[] | null>(["HGETALL", REDIS_HASH])) ?? [];
    const out: PushSubscriptionRecord[] = [];
    for (let i = 1; i < flat.length; i += 2) {
      try {
        out.push(JSON.parse(flat[i]) as PushSubscriptionRecord);
      } catch {
        /* skip a corrupt entry rather than failing the whole read */
      }
    }
    return out;
  }
  return readFileStore();
}

/** Insert or update by endpoint (a device re-subscribing for a new area). */
export async function saveSubscription(rec: PushSubscriptionRecord): Promise<void> {
  if (upstashConfigured()) {
    await upstash(["HSET", REDIS_HASH, rec.endpoint, JSON.stringify(rec)]);
    return;
  }
  const all = await readFileStore();
  const next = all.filter((s) => s.endpoint !== rec.endpoint);
  next.push(rec);
  await writeFileStore(next);
}

export async function removeSubscription(endpoint: string): Promise<void> {
  if (upstashConfigured()) {
    await upstash(["HDEL", REDIS_HASH, endpoint]);
    return;
  }
  const all = await readFileStore();
  await writeFileStore(all.filter((s) => s.endpoint !== endpoint));
}

export interface PushPayload {
  title: string;
  body: string;
  url?: string;
  tag?: string;
}

/**
 * Send to one subscription. Returns "gone" when the push service reports the
 * subscription is expired (404/410) so the caller can prune it.
 */
export async function sendTo(
  rec: PushSubscriptionRecord,
  payload: PushPayload
): Promise<"sent" | "gone" | "error"> {
  ensureVapid();
  try {
    await webpush.sendNotification(
      { endpoint: rec.endpoint, keys: rec.keys },
      JSON.stringify(payload)
    );
    return "sent";
  } catch (e) {
    const code = (e as { statusCode?: number }).statusCode;
    if (code === 404 || code === 410) return "gone";
    return "error";
  }
}
