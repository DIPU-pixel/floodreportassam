import { NextResponse } from "next/server";
import { updateHelper, deleteHelper } from "@/lib/helpers";
import { HELP_TYPES, type HelpType } from "@/lib/helpTypes";
import { adminConfigured, isAdmin } from "@/lib/adminAuth";

export const dynamic = "force-dynamic";

const VALID_CAUSES = new Set(HELP_TYPES.map((t) => t.id));

function guard(req: Request): NextResponse | null {
  if (!adminConfigured()) return NextResponse.json({ error: "admin disabled" }, { status: 503 });
  if (!isAdmin(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  return null;
}

/** Admin edit: any of kind/name/phone/causes/area/description/status. */
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const blocked = guard(req);
  if (blocked) return blocked;

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "bad request" }, { status: 400 });
  }

  const patch: Record<string, unknown> = {};
  if (body.kind === "ngo" || body.kind === "individual") patch.kind = body.kind;
  if (typeof body.name === "string" && body.name.trim()) patch.name = body.name.trim().slice(0, 100);
  if (typeof body.phone === "string" && /^[+()\-\s0-9]{4,20}$/.test(body.phone.trim())) {
    patch.phone = body.phone.trim();
  }
  if (Array.isArray(body.causes)) {
    patch.causes = (body.causes as string[]).filter((c) => VALID_CAUSES.has(c as HelpType));
  }
  if (typeof body.area === "string") patch.area = body.area.trim().slice(0, 80) || null;
  if (typeof body.description === "string") patch.description = body.description.trim().slice(0, 400) || null;
  if (body.status === "approved" || body.status === "hidden") patch.status = body.status;

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: "nothing to update" }, { status: 400 });
  }
  try {
    await updateHelper(params.id, patch);
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "failed" }, { status: 500 });
  }
}

export async function DELETE(req: Request, { params }: { params: { id: string } }) {
  const blocked = guard(req);
  if (blocked) return blocked;
  try {
    await deleteHelper(params.id);
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "failed" }, { status: 500 });
  }
}
