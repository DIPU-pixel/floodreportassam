/**
 * External-map deep links. No API key, no page weight — we hand the exact
 * lat/lng to Google Maps, which opens the Maps app on a phone or the web on
 * desktop. Street View coverage in rural Assam is patchy, so `streetViewUrl`
 * requests panorama mode but Google gracefully shows the map when there is no
 * imagery at that point — better than an embedded panel that would be blank.
 */

/** Google Maps in Street View (panorama) mode at a point. */
export function streetViewUrl(lat: number, lng: number): string {
  return `https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=${lat},${lng}`;
}

/** Plain Google Maps view centred on a point (fallback / "open in maps"). */
export function mapsUrl(lat: number, lng: number): string {
  return `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;
}
