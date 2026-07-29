import { NextResponse } from "next/server";
import { pushConfigured, publicVapidKey } from "@/lib/push";

/** GET /api/push/vapid → the public VAPID key the browser needs to subscribe. */
export const dynamic = "force-dynamic";

export async function GET() {
  if (!pushConfigured()) {
    return NextResponse.json({ configured: false }, { status: 503 });
  }
  return NextResponse.json(
    { configured: true, key: publicVapidKey() },
    { headers: { "Cache-Control": "no-store" } }
  );
}
