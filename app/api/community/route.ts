import { NextResponse } from "next/server";
import { communityConfigured, listPosts, createPost } from "@/lib/community";
import { COMMUNITY_CATEGORIES, type CommunityCategory } from "@/lib/communityTypes";

export const dynamic = "force-dynamic";

const VALID = new Set(COMMUNITY_CATEGORIES.map((c) => c.id));

const HITS = new Map<string, number[]>();
const WINDOW_MS = 5 * 60 * 1000;
const MAX = 8;
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
  if (!communityConfigured()) return NextResponse.json({ configured: false, posts: [] });
  try {
    return NextResponse.json({ configured: true, posts: await listPosts() });
  } catch {
    return NextResponse.json({ configured: true, posts: [] });
  }
}

export async function POST(req: Request) {
  if (!communityConfigured()) return NextResponse.json({ error: "not configured" }, { status: 503 });
  if (rateLimited(ipOf(req))) {
    return NextResponse.json({ error: "Too many posts — please wait." }, { status: 429 });
  }

  let body: {
    parentId?: string | null;
    name?: string;
    category?: string;
    message?: string;
    turnstileToken?: string;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "bad request" }, { status: 400 });
  }

  const category = (body.category ?? "info") as CommunityCategory;
  const message = (body.message ?? "").trim();
  const name = (body.name ?? "").trim().slice(0, 60);
  const parentId = body.parentId || null;

  // Anti-spam only on new threads; replies are covered by the rate limit.
  if (!parentId && !(await verifyTurnstile(body.turnstileToken ?? "", ipOf(req)))) {
    return NextResponse.json({ error: "Anti-spam check failed — please retry." }, { status: 403 });
  }

  if (!VALID.has(category)) return NextResponse.json({ error: "invalid category" }, { status: 400 });
  if (message.length < 1 || message.length > 1000) {
    return NextResponse.json({ error: "Message must be 1–1000 characters" }, { status: 400 });
  }

  try {
    const id = await createPost({ parentId, name, category, message });
    return NextResponse.json({ ok: true, id });
  } catch {
    return NextResponse.json({ error: "Could not post — try again" }, { status: 500 });
  }
}
