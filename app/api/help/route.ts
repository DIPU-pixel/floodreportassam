import { NextResponse } from "next/server";
import {
  helpConfigured,
  listActivePins,
  createPost,
  uploadPhoto,
  setPhotoPaths,
} from "@/lib/helpBoard";
import { HELP_TYPES, type HelpType, type HelpListResponse } from "@/lib/helpTypes";

export const dynamic = "force-dynamic";

// Best-effort per-IP rate limit (serverless memory — resets on cold start).
const HITS = new Map<string, number[]>();
const WINDOW_MS = 10 * 60 * 1000;
const MAX_POSTS = 4;

function ipOf(req: Request): string {
  return (req.headers.get("x-forwarded-for") ?? "unknown").split(",")[0].trim();
}
function rateLimited(ip: string): boolean {
  const now = Date.now();
  const recent = (HITS.get(ip) ?? []).filter((t) => now - t < WINDOW_MS);
  if (recent.length >= MAX_POSTS) return true;
  recent.push(now);
  HITS.set(ip, recent);
  return false;
}

const MAX_PHOTOS = 3;
const MAX_BYTES = 900 * 1024; // photos are compressed client-side
const OK_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const ASSAM = { latMin: 23.5, latMax: 28.5, lngMin: 88.5, lngMax: 97.5 };

export async function GET(): Promise<NextResponse<HelpListResponse>> {
  if (!helpConfigured()) return NextResponse.json({ configured: false, pins: [] });
  try {
    return NextResponse.json({ configured: true, pins: await listActivePins() });
  } catch {
    return NextResponse.json({ configured: true, pins: [] });
  }
}

export async function POST(req: Request) {
  if (!helpConfigured()) {
    return NextResponse.json({ error: "Help board not configured" }, { status: 503 });
  }
  if (rateLimited(ipOf(req))) {
    return NextResponse.json({ error: "Too many posts — please wait a few minutes." }, { status: 429 });
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }

  const helpType = String(form.get("helpType") ?? "") as HelpType;
  const message = String(form.get("message") ?? "").trim();
  const phone = String(form.get("phone") ?? "").trim();
  const name = String(form.get("name") ?? "").trim();
  const district = String(form.get("district") ?? "").trim();
  const lat = Number(form.get("lat"));
  const lng = Number(form.get("lng"));

  if (!HELP_TYPES.some((t) => t.id === helpType)) {
    return NextResponse.json({ error: "Pick a help type" }, { status: 400 });
  }
  if (message.length < 1 || message.length > 600) {
    return NextResponse.json({ error: "Message must be 1–600 characters" }, { status: 400 });
  }
  if (!/^[+()\-\s0-9]{4,20}$/.test(phone)) {
    return NextResponse.json({ error: "Enter a valid contact number" }, { status: 400 });
  }
  if (
    !Number.isFinite(lat) || !Number.isFinite(lng) ||
    lat < ASSAM.latMin || lat > ASSAM.latMax || lng < ASSAM.lngMin || lng > ASSAM.lngMax
  ) {
    return NextResponse.json({ error: "Location must be within Assam" }, { status: 400 });
  }

  let id: string;
  try {
    id = await createPost({
      helpType,
      message,
      phone,
      posterName: name || undefined,
      district: district || undefined,
      lat,
      lng,
    });
  } catch {
    return NextResponse.json({ error: "Could not save — try again" }, { status: 500 });
  }

  // Attach photos (best-effort; a photo failure never loses the post).
  const files = form.getAll("photos").filter((f): f is File => f instanceof File).slice(0, MAX_PHOTOS);
  const paths: string[] = [];
  for (let i = 0; i < files.length; i++) {
    const f = files[i];
    if (!OK_TYPES.has(f.type) || f.size > MAX_BYTES || f.size === 0) continue;
    try {
      paths.push(await uploadPhoto(id, i, await f.arrayBuffer(), f.type));
    } catch {
      /* skip this photo */
    }
  }
  if (paths.length) {
    try {
      await setPhotoPaths(id, paths);
    } catch {
      /* non-fatal */
    }
  }

  return NextResponse.json({ ok: true, id });
}
