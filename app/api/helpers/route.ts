import { NextResponse } from "next/server";
import { helpersConfigured, listHelpers, createHelper } from "@/lib/helpers";
import { HELP_TYPES, type HelpType } from "@/lib/helpTypes";

export const dynamic = "force-dynamic";

const VALID_CAUSES = new Set(HELP_TYPES.map((t) => t.id));

// Best-effort per-IP rate limit (serverless memory — resets on cold start).
const HITS = new Map<string, number[]>();
const WINDOW_MS = 10 * 60 * 1000;
const MAX = 3;
function ipOf(req: Request): string {
  return (req.headers.get("x-forwarded-for") ?? "unknown").split(",")[0].trim();
}
function rateLimited(ip: string): boolean {
  const now = Date.now();
  const recent = (HITS.get(ip) ?? []).filter((t) => now - t < WINDOW_MS);
  if (recent.length >= MAX) return true;
  recent.push(now);
  HITS.set(ip, recent);
  return false;
}

// Cloudflare Turnstile (env-gated — skipped when not configured).
const TURNSTILE_SECRET = process.env.TURNSTILE_SECRET;
async function verifyTurnstile(token: string, ip: string): Promise<boolean> {
  if (!TURNSTILE_SECRET) return true;
  if (!token) return false;
  try {
    const res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ secret: TURNSTILE_SECRET, response: token, remoteip: ip }),
    });
    return ((await res.json()) as { success?: boolean }).success === true;
  } catch {
    return false;
  }
}

export async function GET() {
  if (!helpersConfigured()) return NextResponse.json({ configured: false, helpers: [] });
  try {
    return NextResponse.json({ configured: true, helpers: await listHelpers() });
  } catch {
    return NextResponse.json({ configured: true, helpers: [] });
  }
}

export async function POST(req: Request) {
  if (!helpersConfigured()) return NextResponse.json({ error: "not configured" }, { status: 503 });
  if (rateLimited(ipOf(req))) {
    return NextResponse.json({ error: "Too many submissions — please wait." }, { status: 429 });
  }

  let body: {
    kind?: string;
    name?: string;
    phone?: string;
    causes?: string[];
    area?: string;
    description?: string;
    turnstileToken?: string;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "bad request" }, { status: 400 });
  }

  if (!(await verifyTurnstile(body.turnstileToken ?? "", ipOf(req)))) {
    return NextResponse.json({ error: "Anti-spam check failed — please retry." }, { status: 403 });
  }

  const kind = body.kind === "ngo" ? "ngo" : body.kind === "individual" ? "individual" : null;
  const name = (body.name ?? "").trim();
  const phone = (body.phone ?? "").trim();
  const causes = (Array.isArray(body.causes) ? body.causes : []).filter((c) =>
    VALID_CAUSES.has(c as HelpType)
  ) as HelpType[];
  const area = (body.area ?? "").trim().slice(0, 80);
  const description = (body.description ?? "").trim().slice(0, 400);

  if (!kind) return NextResponse.json({ error: "Pick NGO or Individual" }, { status: 400 });
  if (name.length < 1 || name.length > 100) {
    return NextResponse.json({ error: "Enter a name" }, { status: 400 });
  }
  if (!/^[+()\-\s0-9]{4,20}$/.test(phone)) {
    return NextResponse.json({ error: "Enter a valid contact number" }, { status: 400 });
  }
  if (causes.length === 0) {
    return NextResponse.json({ error: "Pick at least one thing you can help with" }, { status: 400 });
  }

  try {
    const id = await createHelper({ kind, name, phone, causes, area, description });
    return NextResponse.json({ ok: true, id });
  } catch {
    return NextResponse.json({ error: "Could not save — try again" }, { status: 500 });
  }
}
