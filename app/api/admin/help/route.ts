import { NextResponse } from "next/server";
import { helpConfigured, listAllForAdmin } from "@/lib/helpBoard";
import { adminConfigured, isAdmin } from "@/lib/adminAuth";

export const dynamic = "force-dynamic";

/** All help posts (any status) for the admin dashboard. Auth required. */
export async function GET(req: Request) {
  if (!adminConfigured()) {
    return NextResponse.json({ error: "Admin not configured (set ADMIN_SECRET)" }, { status: 503 });
  }
  if (!isAdmin(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (!helpConfigured()) return NextResponse.json({ items: [] });
  try {
    return NextResponse.json({ items: await listAllForAdmin() });
  } catch {
    return NextResponse.json({ error: "failed to load" }, { status: 500 });
  }
}
