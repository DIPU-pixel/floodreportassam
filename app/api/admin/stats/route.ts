import { NextResponse } from "next/server";
import { getVisitStats, visitsConfigured } from "@/lib/visits";
import { adminConfigured, isAdmin } from "@/lib/adminAuth";

export const dynamic = "force-dynamic";

/** Visitor stats for the admin dashboard. Auth required. */
export async function GET(req: Request) {
  if (!adminConfigured()) return NextResponse.json({ error: "admin disabled" }, { status: 503 });
  if (!isAdmin(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!visitsConfigured()) return NextResponse.json({ stats: null });
  try {
    return NextResponse.json({ stats: await getVisitStats() });
  } catch {
    return NextResponse.json({ stats: null });
  }
}
