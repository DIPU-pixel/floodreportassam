"use client";

import { useEffect, useRef } from "react";
import maplibregl from "maplibre-gl";
import { mapsUrl } from "@/lib/maps";
import { helpTypeLabel, type HelpDetail, type HelpPin } from "@/lib/helpTypes";

const OSM = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
const ASSAM_CENTER: [number, number] = [92.9, 26.2];

function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
}
function ago(iso: string): string {
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  return `${Math.floor(s / 86400)} d ago`;
}

/**
 * A dedicated mini-map of the help requests. Pins sit at the APPROX (~1 km)
 * location for everyone; tapping "I can help" in the tooltip fetches the
 * detail, moves the pin to the EXACT spot, and shows contact + directions.
 */
export default function HelpMap({
  pins,
  reveal,
}: {
  pins: HelpPin[];
  reveal: (id: string) => Promise<HelpDetail | null>;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const markersRef = useRef<maplibregl.Marker[]>([]);

  useEffect(() => {
    if (!ref.current || mapRef.current) return;
    const map = new maplibregl.Map({
      container: ref.current,
      style: {
        version: 8,
        sources: { osm: { type: "raster", tiles: [OSM], tileSize: 256, attribution: "© OpenStreetMap" } },
        layers: [{ id: "osm", type: "raster", source: "osm" }],
      },
      center: ASSAM_CENTER,
      zoom: 6,
      attributionControl: false,
    });
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
    mapRef.current = map;
    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    markersRef.current.forEach((m) => m.remove());
    markersRef.current = [];
    if (pins.length === 0) return;

    const bounds = new maplibregl.LngLatBounds();
    for (const p of pins) {
      const label = helpTypeLabel(p.helpType);
      const el = document.createElement("div");
      el.textContent = label.icon;
      el.style.cssText = "font-size:24px;cursor:pointer;line-height:1;filter:drop-shadow(0 1px 2px rgba(0,0,0,.6))";

      const popup = new maplibregl.Popup({ offset: 16, maxWidth: "250px" }).setHTML(
        `<div style="font:13px system-ui;color:#0f172a">
           <b>${label.icon} ${esc(label.en)}</b>
           <div style="margin:2px 0">${esc(p.message).slice(0, 150)}</div>
           <div style="color:#475569;font-size:11px">${esc(p.district ?? "Assam")} · ${ago(p.createdAt)}${p.photoCount ? ` · 📷 ${p.photoCount}` : ""}</div>
           <button data-help="${p.id}" style="margin-top:6px;background:#0284c7;color:#fff;border:0;border-radius:8px;padding:6px 10px;font-weight:700;cursor:pointer">🤝 I can help</button>
         </div>`
      );

      const marker = new maplibregl.Marker({ element: el }).setLngLat([p.approxLng, p.approxLat]).setPopup(popup).addTo(map);
      markersRef.current.push(marker);

      popup.on("open", () => {
        const btn = document.querySelector<HTMLButtonElement>(`button[data-help="${p.id}"]`);
        if (!btn) return;
        btn.onclick = async () => {
          btn.textContent = "Loading…";
          const d = await reveal(p.id);
          if (!d) {
            btn.textContent = "Try again";
            return;
          }
          marker.setLngLat([d.lng, d.lat]); // move to EXACT location
          popup.setHTML(
            `<div style="font:13px system-ui;color:#0f172a">
               <b>${label.icon} ${esc(label.en)}</b>
               <div style="margin:2px 0">${esc(p.message).slice(0, 150)}</div>
               <div style="margin-top:6px">
                 <a href="tel:${esc(d.phone)}" style="color:#059669;font-weight:700;text-decoration:none">📞 ${esc(d.phone)}</a>
                 &nbsp;·&nbsp;
                 <a href="${mapsUrl(d.lat, d.lng)}" target="_blank" rel="noopener noreferrer" style="color:#0284c7;font-weight:700;text-decoration:none">🧭 Directions</a>
               </div>
               ${d.photoUrls[0] ? `<img src="${d.photoUrls[0]}" alt="" style="margin-top:6px;width:100%;border-radius:8px"/>` : ""}
             </div>`
          );
        };
      });

      bounds.extend([p.approxLng, p.approxLat]);
    }
    if (!bounds.isEmpty()) map.fitBounds(bounds, { padding: 48, maxZoom: 12, duration: 400 });
  }, [pins, reveal]);

  return (
    <div className="relative">
      <div ref={ref} className="h-60 w-full overflow-hidden rounded-xl bg-slate-800" />
      <p className="mt-1 text-[10px] text-slate-400">
        Pins show approximate area (~1 km). Tap a pin → “I can help” to see the exact spot + contact.
      </p>
    </div>
  );
}
