import { NextResponse } from "next/server";
import { helpConfigured, getDetail, resolvePost, reportPost } from "@/lib/helpBoard";

export const dynamic = "force-dynamic";

/** Reveal full contact + photos — the "I can help" action. Soft-gated: a
 *  deliberate, separate request rather than data shipped to every viewer. */
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  if (!helpConfigured()) return NextResponse.json({ error: "not configured" }, { status: 503 });
  const detail = await getDetail(params.id);
  if (!detail) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json({ detail });
}

/** { action: "resolve" | "report" } */
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  if (!helpConfigured()) return NextResponse.json({ error: "not configured" }, { status: 503 });
  let action = "";
  try {
    action = String(((await req.json()) as { action?: string }).action ?? "");
  } catch {
    return NextResponse.json({ error: "bad request" }, { status: 400 });
  }
  try {
    if (action === "resolve") await resolvePost(params.id);
    else if (action === "report") await reportPost(params.id);
    else return NextResponse.json({ error: "unknown action" }, { status: 400 });
  } catch {
    return NextResponse.json({ error: "failed" }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
