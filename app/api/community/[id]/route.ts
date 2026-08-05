import { NextResponse } from "next/server";
import { communityConfigured, reportPost } from "@/lib/community";

export const dynamic = "force-dynamic";

/** Public report of a bad post: { action: "report" }. */
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  if (!communityConfigured()) return NextResponse.json({ error: "not configured" }, { status: 503 });
  let action = "";
  try {
    action = String(((await req.json()) as { action?: string }).action ?? "");
  } catch {
    return NextResponse.json({ error: "bad request" }, { status: 400 });
  }
  if (action !== "report") return NextResponse.json({ error: "unknown action" }, { status: 400 });
  try {
    await reportPost(params.id);
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "failed" }, { status: 500 });
  }
}
