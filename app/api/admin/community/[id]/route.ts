import { NextResponse } from "next/server";
import { setStatus, deletePost } from "@/lib/community";
import { adminConfigured, isAdmin } from "@/lib/adminAuth";

export const dynamic = "force-dynamic";

function guard(req: Request): NextResponse | null {
  if (!adminConfigured()) return NextResponse.json({ error: "admin disabled" }, { status: 503 });
  if (!isAdmin(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  return null;
}

/** { status: "approved" | "hidden" } */
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const blocked = guard(req);
  if (blocked) return blocked;
  let status = "";
  try {
    status = String(((await req.json()) as { status?: string }).status ?? "");
  } catch {
    return NextResponse.json({ error: "bad request" }, { status: 400 });
  }
  if (status !== "approved" && status !== "hidden") {
    return NextResponse.json({ error: "invalid status" }, { status: 400 });
  }
  try {
    await setStatus(params.id, status);
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "failed" }, { status: 500 });
  }
}

export async function DELETE(req: Request, { params }: { params: { id: string } }) {
  const blocked = guard(req);
  if (blocked) return blocked;
  try {
    await deletePost(params.id);
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "failed" }, { status: 500 });
  }
}
