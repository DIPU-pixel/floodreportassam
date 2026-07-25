import { NextResponse } from "next/server";
import type { GeocodeResponse, GeocodeResult } from "@/lib/types";

export const revalidate = 86400; // place coordinates are stable — cache a day

interface OMGeoResult {
  name: string;
  latitude: number;
  longitude: number;
  admin1?: string;
  admin2?: string;
  country_code?: string;
}

/**
 * Proxy for Open-Meteo's free geocoder (no key). We filter to Assam so a search
 * for "Nazira" returns the Assam town, not a namesake elsewhere.
 */
export async function GET(req: Request): Promise<NextResponse<GeocodeResponse>> {
  const name = new URL(req.url).searchParams.get("name")?.trim() ?? "";
  if (name.length < 2) return NextResponse.json({ results: [] });

  try {
    const url =
      `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(name)}` +
      `&count=8&language=en&countryCode=IN`;
    const res = await fetch(url, { next: { revalidate } });
    if (!res.ok) throw new Error(`Geocoder HTTP ${res.status}`);

    const json = (await res.json()) as { results?: OMGeoResult[] };
    const results: GeocodeResult[] = (json.results ?? [])
      .filter((r) => (r.admin1 ?? "").toLowerCase() === "assam")
      .map((r) => ({
        name: r.name,
        lat: r.latitude,
        lng: r.longitude,
        admin1: r.admin1,
        admin2: r.admin2,
      }));

    return NextResponse.json({ results });
  } catch (err) {
    console.error("[/api/geocode] failed:", err);
    return NextResponse.json({ results: [] });
  }
}
