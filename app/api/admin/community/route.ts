import { NextResponse } from "next/server";
import { communityConfigured, listAllPosts } from "@/lib/community";
import { adminConfigured, isAdmin } from "@/lib/adminAuth";

export const dynamic = "force-dynamic";

/** All community posts (any status) for the admin dashboard. Auth required. */
export async function GET(req: Request) {
  if (!adminConfigured()) return NextResponse.json({ error: "admin disabled" }, { status: 503 });
  if (!isAdmin(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!communityConfigured()) return NextResponse.json({ items: [] });
  try {
    return NextResponse.json({ items: await listAllPosts() });
  } catch {
    return NextResponse.json({ error: "failed" }, { status: 500 });
  }
}
