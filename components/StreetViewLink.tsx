"use client";

import { useT } from "@/lib/i18n";
import { streetViewUrl } from "@/lib/maps";

/**
 * Opens Google Maps Street View at a point in a new tab (Maps app on phones).
 * Free, no API key. Coverage is patchy in rural Assam, so this is an outbound
 * link — Google shows the map where there's no panorama, instead of a blank
 * embedded viewer. `compact` renders just the pill (for tight headers).
 */
export default function StreetViewLink({
  lat,
  lng,
  compact = false,
}: {
  lat: number;
  lng: number;
  compact?: boolean;
}) {
  const t = useT();
  return (
    <div className={compact ? "" : "mt-2"}>
      <a
        href={streetViewUrl(lat, lng)}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-1.5 rounded-xl bg-slate-800 px-3 py-2 text-xs font-bold text-slate-100 transition-transform active:scale-95 active:bg-slate-700"
      >
        <span aria-hidden>🧍‍♂️</span>
        {t("streetview.button")}
        <span aria-hidden className="text-[10px] text-slate-400">↗</span>
      </a>
      {!compact && <p className="mt-1 text-[10px] leading-snug text-slate-500">{t("streetview.hint")}</p>}
    </div>
  );
}
