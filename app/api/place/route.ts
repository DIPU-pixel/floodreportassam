import { NextResponse } from "next/server";
import type { PlaceInfoResponse } from "@/lib/types";

export const revalidate = 604800; // 7 days — encyclopedia text/photos rarely change

interface WikiSummary {
  type?: string;
  title?: string;
  extract?: string;
  description?: string;
  content_urls?: { desktop?: { page?: string } };
}

const UA = "AssamFloodWatch/1.0 (public-information flood map; Wikipedia REST)";

async function summary(title: string): Promise<WikiSummary | null> {
  try {
    const res = await fetch(
      `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`,
      { headers: { "User-Agent": UA, Accept: "application/json" }, next: { revalidate } }
    );
    if (!res.ok) return null;
    const json = (await res.json()) as WikiSummary;
    // Disambiguation / missing pages carry no usable extract.
    if (!json.extract || json.type?.includes("disambiguation")) return null;
    return json;
  } catch {
    return null;
  }
}

/**
 * Area context for a place: a real photo + a plain description, so someone who
 * doesn't recognise a district name can still tell what/where it is.
 *
 * Source: Wikipedia REST (free, no key). Text CC BY-SA, images per their own
 * Wikimedia licences — the UI shows the attribution and links back.
 * Tries "<name>" first (best hit rate for Assam towns), then "<name>, Assam",
 * then the district, and finally reports nothing rather than guessing.
 */
export async function GET(req: Request): Promise<NextResponse<PlaceInfoResponse>> {
  const p = new URL(req.url).searchParams;
  const name = p.get("name")?.trim() ?? "";
  const district = p.get("district")?.trim() ?? "";
  if (!name && !district) return NextResponse.json({ found: false });

  const candidates = [name, name && `${name}, Assam`, district, district && `${district} district`]
    .filter(Boolean)
    .slice(0, 4) as string[];

  for (const c of candidates) {
    const s = await summary(c);
    if (!s) continue;
    // Text only — no photos are surfaced in the UI, so none are returned.
    return NextResponse.json({
      found: true,
      title: s.title ?? c,
      description: s.description,
      extract: s.extract,
      pageUrl: s.content_urls?.desktop?.page,
      source: "Wikipedia (CC BY-SA)",
    });
  }
  return NextResponse.json({ found: false });
}
