/**
 * Unified photo storage: Cloudflare R2 (preferred, 10 GB free) → Supabase
 * Storage fallback. The help board picks whichever is configured; both can
 * coexist (reads try R2 first, then Supabase). R2 uses the S3-compatible
 * API with minimal AWS Sig V4 signing — no extra npm dependencies.
 *
 * Required env for R2:
 *   R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET_NAME
 * Required env for Supabase (existing):
 *   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 */

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------
const R2_ACCOUNT = process.env.R2_ACCOUNT_ID;
const R2_KEY_ID = process.env.R2_ACCESS_KEY_ID;
const R2_SECRET = process.env.R2_SECRET_ACCESS_KEY;
const R2_BUCKET = process.env.R2_BUCKET_NAME ?? "help-photos";

const SUPA_URL = process.env.SUPABASE_URL?.replace(/\/$/, "");
const SUPA_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const SUPA_BUCKET = "help-photos";

export type StorageBackend = "r2" | "supabase" | "none";

export function activeBackend(): StorageBackend {
  if (R2_ACCOUNT && R2_KEY_ID && R2_SECRET) return "r2";
  if (SUPA_URL && SUPA_KEY) return "supabase";
  return "none";
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export async function uploadPhoto(
  postId: string,
  index: number,
  bytes: ArrayBuffer,
  contentType: string
): Promise<string> {
  const ext = contentType.includes("png")
    ? "png"
    : contentType.includes("webp")
      ? "webp"
      : "jpg";
  const path = `${postId}/${index}.${ext}`;
  const backend = activeBackend();

  if (backend === "r2") {
    await r2Put(path, bytes, contentType);
  } else if (backend === "supabase") {
    await supaPut(path, bytes, contentType);
  } else {
    throw new Error("No photo storage configured");
  }
  return path;
}

export async function signedUrl(path: string): Promise<string | null> {
  const backend = activeBackend();
  if (backend === "r2") return r2SignedUrl(path);
  if (backend === "supabase") return supaSignedUrl(path);
  return null;
}

export async function deletePhoto(path: string): Promise<void> {
  const backend = activeBackend();
  if (backend === "r2") {
    await r2Delete(path);
  } else if (backend === "supabase") {
    await supaDelete(path);
  }
}

// ---------------------------------------------------------------------------
// AWS Sig V4 — minimal implementation for R2 (PUT / GET / DELETE)
// ---------------------------------------------------------------------------
const encoder = new TextEncoder();

async function hmacSha256(key: ArrayBuffer, data: string): Promise<ArrayBuffer> {
  const ck = await crypto.subtle.importKey("raw", key, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return crypto.subtle.sign("HMAC", ck, encoder.encode(data));
}

async function sha256(data: ArrayBuffer | string): Promise<string> {
  const buf = typeof data === "string" ? encoder.encode(data) : data;
  const hash = await crypto.subtle.digest("SHA-256", buf);
  return hex(hash);
}

function hex(buf: ArrayBuffer): string {
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function signingKey(secret: string, date: string, region: string): Promise<ArrayBuffer> {
  let k = await hmacSha256(encoder.encode(`AWS4${secret}`).buffer as ArrayBuffer, date);
  k = await hmacSha256(k, region);
  k = await hmacSha256(k, "s3");
  return hmacSha256(k, "aws4_request");
}

interface SigV4Opts {
  method: string;
  path: string;
  query?: string;
  headers: Record<string, string>;
  body: ArrayBuffer | string;
}

async function signRequest(opts: SigV4Opts): Promise<Record<string, string>> {
  const region = "auto";
  const now = new Date();
  const date = now.toISOString().replace(/[-:]/g, "").slice(0, 8);
  const datetime = now.toISOString().replace(/[-:]/g, "").slice(0, 15) + "Z";

  const payloadHash = await sha256(opts.body);
  const hdrs: Record<string, string> = {
    ...opts.headers,
    host: `${R2_ACCOUNT}.r2.cloudflarestorage.com`,
    "x-amz-date": datetime,
    "x-amz-content-sha256": payloadHash,
  };

  const signedHeaders = Object.keys(hdrs).sort().join(";");
  const canonHeaders = Object.keys(hdrs)
    .sort()
    .map((k) => `${k}:${hdrs[k]}\n`)
    .join("");

  const canonical = [
    opts.method,
    `/${R2_BUCKET}/${opts.path}`,
    opts.query ?? "",
    canonHeaders,
    signedHeaders,
    payloadHash,
  ].join("\n");

  const scope = `${date}/${region}/s3/aws4_request`;
  const stringToSign = ["AWS4-HMAC-SHA256", datetime, scope, await sha256(canonical)].join("\n");
  const key = await signingKey(R2_SECRET!, date, region);
  const sig = hex(await hmacSha256(key, stringToSign));

  hdrs.Authorization = `AWS4-HMAC-SHA256 Credential=${R2_KEY_ID}/${scope}, SignedHeaders=${signedHeaders}, Signature=${sig}`;
  return hdrs;
}

function r2Endpoint(path: string): string {
  return `https://${R2_ACCOUNT}.r2.cloudflarestorage.com/${R2_BUCKET}/${path}`;
}

async function r2Put(path: string, bytes: ArrayBuffer, contentType: string): Promise<void> {
  const hdrs = await signRequest({
    method: "PUT",
    path,
    headers: { "content-type": contentType },
    body: bytes,
  });
  const res = await fetch(r2Endpoint(path), { method: "PUT", headers: hdrs, body: bytes });
  if (!res.ok) throw new Error(`R2 upload ${res.status}: ${await res.text()}`);
}

async function r2SignedUrl(path: string): Promise<string | null> {
  const region = "auto";
  const now = new Date();
  const date = now.toISOString().replace(/[-:]/g, "").slice(0, 8);
  const datetime = now.toISOString().replace(/[-:]/g, "").slice(0, 15) + "Z";
  const expires = "3600";
  const scope = `${date}/${region}/s3/aws4_request`;

  const queryParts = [
    `X-Amz-Algorithm=AWS4-HMAC-SHA256`,
    `X-Amz-Credential=${encodeURIComponent(`${R2_KEY_ID}/${scope}`)}`,
    `X-Amz-Date=${datetime}`,
    `X-Amz-Expires=${expires}`,
    `X-Amz-SignedHeaders=host`,
  ];
  const queryString = queryParts.sort().join("&");

  const host = `${R2_ACCOUNT}.r2.cloudflarestorage.com`;
  const canonical = [
    "GET",
    `/${R2_BUCKET}/${path}`,
    queryString,
    `host:${host}\n`,
    "host",
    "UNSIGNED-PAYLOAD",
  ].join("\n");

  const stringToSign = ["AWS4-HMAC-SHA256", datetime, scope, await sha256(canonical)].join("\n");
  const key = await signingKey(R2_SECRET!, date, region);
  const sig = hex(await hmacSha256(key, stringToSign));

  return `https://${host}/${R2_BUCKET}/${path}?${queryString}&X-Amz-Signature=${sig}`;
}

async function r2Delete(path: string): Promise<void> {
  const hdrs = await signRequest({
    method: "DELETE",
    path,
    headers: {},
    body: "",
  });
  await fetch(r2Endpoint(path), { method: "DELETE", headers: hdrs }).catch(() => {});
}

// ---------------------------------------------------------------------------
// Supabase Storage helpers (extracted from helpBoard.ts)
// ---------------------------------------------------------------------------
function supaHeaders(extra?: Record<string, string>): Record<string, string> {
  return {
    apikey: SUPA_KEY!,
    Authorization: `Bearer ${SUPA_KEY}`,
    "content-type": "application/json",
    ...extra,
  };
}

async function supaPut(path: string, bytes: ArrayBuffer, contentType: string): Promise<void> {
  const res = await fetch(`${SUPA_URL}/storage/v1/object/${SUPA_BUCKET}/${path}`, {
    method: "POST",
    headers: { apikey: SUPA_KEY!, Authorization: `Bearer ${SUPA_KEY}`, "content-type": contentType },
    body: bytes,
  });
  if (!res.ok) throw new Error(`supabase upload ${res.status}`);
}

async function supaSignedUrl(path: string): Promise<string | null> {
  const res = await fetch(`${SUPA_URL}/storage/v1/object/sign/${SUPA_BUCKET}/${path}`, {
    method: "POST",
    headers: supaHeaders(),
    body: JSON.stringify({ expiresIn: 60 * 60 }),
  });
  if (!res.ok) return null;
  const { signedURL } = (await res.json()) as { signedURL: string };
  return `${SUPA_URL}/storage/v1${signedURL}`;
}

async function supaDelete(path: string): Promise<void> {
  await fetch(`${SUPA_URL}/storage/v1/object/${SUPA_BUCKET}/${path}`, {
    method: "DELETE",
    headers: supaHeaders(),
  }).catch(() => {});
}
