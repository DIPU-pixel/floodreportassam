import { NextResponse } from "next/server";
import { helpConfigured, cleanupStalePhotos } from "@/lib/helpBoard";

/**
 * GET /api/cron/cleanup — delete photos from resolved/expired/hidden posts
 * to free storage (R2 or Supabase). Run alongside the alert cron, e.g. every
 * 6–12 hours. Protected by the same CRON_SECRET.
 */
export const dynamic = "force-dynamic";
export const revalidate = 0;

function authorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const url = new URL(req.url);
  if (url.searchParams.get("secret") === secret) return true;
  const auth = req.headers.get("authorization");
  return auth === `Bearer ${secret}`;
}

export async function GET(req: Request) {
  if (!authorized(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (!helpConfigured()) {
    return NextResponse.json({ skipped: true, reason: "help board not configured" });
  }
  try {
    const cleaned = await cleanupStalePhotos();
    return NextResponse.json({ ok: true, cleaned });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
