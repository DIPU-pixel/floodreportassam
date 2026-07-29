import { NextResponse } from "next/server";
import {
  pushConfigured,
  removeSubscription,
  saveSubscription,
  type PushSubscriptionRecord,
} from "@/lib/push";

/**
 * POST   /api/push/subscribe  → save/refresh a device's alert subscription
 * DELETE /api/push/subscribe  → remove it (unsubscribe)
 *
 * Body (POST): { endpoint, keys:{p256dh,auth}, districtId?, districtName?, lang? }
 * Body (DELETE): { endpoint }
 */
export const dynamic = "force-dynamic";

interface SubscribeBody {
  endpoint?: string;
  keys?: { p256dh?: string; auth?: string };
  districtId?: string;
  districtName?: string;
  lang?: "en" | "as";
}

export async function POST(req: Request) {
  if (!pushConfigured()) return NextResponse.json({ ok: false, reason: "not-configured" }, { status: 503 });

  let body: SubscribeBody;
  try {
    body = (await req.json()) as SubscribeBody;
  } catch {
    return NextResponse.json({ ok: false, reason: "bad-json" }, { status: 400 });
  }

  if (!body.endpoint || !body.keys?.p256dh || !body.keys?.auth) {
    return NextResponse.json({ ok: false, reason: "missing-fields" }, { status: 400 });
  }

  const rec: PushSubscriptionRecord = {
    endpoint: body.endpoint,
    keys: { p256dh: body.keys.p256dh, auth: body.keys.auth },
    districtId: body.districtId,
    districtName: body.districtName,
    lang: body.lang === "as" ? "as" : "en",
    createdAt: new Date().toISOString(),
  };

  try {
    await saveSubscription(rec);
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: false, reason: "store-error" }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  let body: { endpoint?: string };
  try {
    body = (await req.json()) as { endpoint?: string };
  } catch {
    return NextResponse.json({ ok: false, reason: "bad-json" }, { status: 400 });
  }
  if (!body.endpoint) return NextResponse.json({ ok: false, reason: "missing-endpoint" }, { status: 400 });
  try {
    await removeSubscription(body.endpoint);
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: false, reason: "store-error" }, { status: 500 });
  }
}
