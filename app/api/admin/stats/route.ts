import { NextResponse } from "next/server";
import { getDashboard, visitsConfigured } from "@/lib/visits";
import { adminConfigured, isAdmin } from "@/lib/adminAuth";

export const dynamic = "force-dynamic";

/** Full visitor analytics for the admin dashboard. Auth required. */
export async function GET(req: Request) {
  if (!adminConfigured()) return NextResponse.json({ error: "admin disabled" }, { status: 503 });
  if (!isAdmin(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!visitsConfigured()) return NextResponse.json({ dashboard: null });
  try {
    return NextResponse.json({ dashboard: await getDashboard() });
  } catch {
    return NextResponse.json({ dashboard: null });
  }
}
