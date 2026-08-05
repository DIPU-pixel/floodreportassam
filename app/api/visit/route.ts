import { NextResponse } from "next/server";
import { recordVisit, visitsConfigured } from "@/lib/visits";

export const dynamic = "force-dynamic";

/** Public beacon — the browser POSTs one per session. Fire-and-forget. */
export async function POST(req: Request) {
  if (!visitsConfigured()) return NextResponse.json({ ok: false });
  let path = "/";
  let referrer = "";
  try {
    const body = (await req.json()) as { path?: string; referrer?: string };
    path = body.path ?? "/";
    referrer = body.referrer ?? "";
  } catch {
    /* empty body is fine */
  }
  try {
    await recordVisit(path, referrer);
  } catch {
    /* never let analytics break a page load */
  }
  return NextResponse.json({ ok: true });
}
