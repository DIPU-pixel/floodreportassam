"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import DragSheet from "@/components/DragSheet";
import HelpMap from "@/components/HelpMap";
import HelpersDirectory from "@/components/HelpersDirectory";
import Lightbox from "@/components/Lightbox";
import { useToast } from "@/components/Toast";
import { compressImage } from "@/lib/imageCompress";
import { mapsUrl } from "@/lib/maps";
import { HELP_TYPES, helpTypeLabel, type HelpDetail, type HelpPin, type HelpType } from "@/lib/helpTypes";

const REFRESH_MS = 30_000;
const TURNSTILE_SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;

function timeAgo(iso: string): string {
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  return `${Math.floor(s / 86400)} d ago`;
}

function waLink(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  const intl = digits.length === 10 ? `91${digits}` : digits;
  return `https://wa.me/${intl}`;
}

/**
 * Community help board. Public list shows type + approx area + time only;
 * phone, photos and exact location are fetched ONLY when a helper taps
 * "I can help" (gated). A permanent banner keeps it clearly unofficial.
 */
export default function HelpBoard({
  districts,
  onClose,
}: {
  districts: { id: string; name: string }[];
  onClose: () => void;
}) {
  const toast = useToast();
  const [mode, setMode] = useState<"browse" | "post" | "helpers">("browse");
  const [pins, setPins] = useState<HelpPin[]>([]);
  const [loading, setLoading] = useState(true);
  const [revealed, setRevealed] = useState<Record<string, HelpDetail>>({});
  const [lightbox, setLightbox] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await fetch("/api/help", { cache: "no-store" });
      const d = (await r.json()) as { pins: HelpPin[] };
      setPins(d.pins ?? []);
    } catch {
      /* keep last list */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, REFRESH_MS);
    return () => clearInterval(t);
  }, [load]);

  const reveal = useCallback(
    async (id: string): Promise<HelpDetail | null> => {
      try {
        const r = await fetch(`/api/help/${id}`, { cache: "no-store" });
        if (!r.ok) throw new Error();
        const d = (await r.json()) as { detail: HelpDetail };
        setRevealed((prev) => ({ ...prev, [id]: d.detail }));
        return d.detail;
      } catch {
        toast("Could not load contact — try again", "error");
        return null;
      }
    },
    [toast]
  );

  const act = async (id: string, action: "resolve" | "report") => {
    try {
      await fetch(`/api/help/${id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action }),
      });
      toast(action === "resolve" ? "Marked resolved" : "Reported — thank you", "success");
      load();
    } catch {
      toast("Action failed", "error");
    }
  };

  return (
    <>
    <Lightbox url={lightbox} onClose={() => setLightbox(null)} />
    <DragSheet onClose={onClose} snap initial="half" ariaLabel="Community help">
      {/* Header */}
      <div className="sticky top-0 z-10 border-b border-slate-800 bg-slate-900 p-3">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-lg font-bold leading-tight">🆘 Community help · সহায়</h2>
          <button onClick={onClose} aria-label="Close" className="shrink-0 rounded-full bg-slate-800 px-2.5 py-1 text-sm text-slate-300">
            ✕
          </button>
        </div>
        {/* Permanent, non-negotiable: this is NOT an official rescue channel. */}
        <p className="mt-2 rounded-lg bg-red-950/60 p-2 text-[11px] leading-snug text-red-200">
          <b>Community help, NOT official rescue.</b> For rescue call{" "}
          <a href="tel:1079" className="underline">1079</a> / <a href="tel:1077" className="underline">1077</a> /{" "}
          <a href="tel:9711077372" className="underline">NDRF</a>. · সৰকাৰী উদ্ধাৰৰ বাবে ১০৭৯ / ১০৭৭ ত ফোন কৰক।
        </p>
        {/* Requests / Ask / Helpers toggle */}
        <div className="mt-2 flex gap-1.5">
          {(["browse", "post", "helpers"] as const).map((m) => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className={`flex-1 rounded-lg px-2 py-1.5 text-[11px] font-semibold ${
                mode === m ? "bg-sky-600 text-white" : "bg-slate-800 text-slate-300"
              }`}
            >
              {m === "browse" ? "🆘 Requests" : m === "post" ? "Ask help" : "🤝 Helpers"}
            </button>
          ))}
        </div>
      </div>

      {mode === "helpers" ? (
        <HelpersDirectory districts={districts} />
      ) : (
      <div className="p-3">
        {mode === "post" ? (
          <PostForm
            districts={districts}
            onPosted={() => {
              setMode("browse");
              load();
            }}
          />
        ) : loading ? (
          <div className="space-y-2">
            {[0, 1, 2].map((i) => (
              <div key={i} className="skeleton h-20" />
            ))}
          </div>
        ) : pins.length === 0 ? (
          <p className="py-8 text-center text-sm text-slate-400">
            No open requests right now. · এতিয়া কোনো অনুৰোধ নাই।
          </p>
        ) : (
          <>
            {/* Dedicated help map — pins with tooltips; exact spot on reveal. */}
            <div className="mb-3">
              <HelpMap pins={pins} reveal={reveal} />
            </div>
            <ul className="space-y-2">
            {pins.map((p) => {
              const label = helpTypeLabel(p.helpType);
              const d = revealed[p.id];
              return (
                <li key={p.id} className="rounded-xl bg-slate-800/70 p-2.5">
                  <div className="flex items-start justify-between gap-2">
                    <span className="text-sm font-semibold">
                      {label.icon} {label.en} · {label.as}
                    </span>
                    <span className="shrink-0 text-[10px] text-slate-500">{timeAgo(p.createdAt)}</span>
                  </div>
                  <p className="mt-1 whitespace-pre-wrap break-words text-[13px] text-slate-200">{p.message}</p>
                  <p className="mt-1 text-[11px] text-slate-400">
                    📍 {p.district ?? "Assam"} · ~{p.approxLat.toFixed(2)}, {p.approxLng.toFixed(2)}
                    {p.photoCount > 0 && ` · 📷 ${p.photoCount}`}
                    {p.posterName && ` · ${p.posterName}`}
                  </p>

                  {d ? (
                    <div className="mt-2 rounded-lg bg-slate-900/70 p-2">
                      <div className="flex flex-wrap gap-1.5">
                        <a href={`tel:${d.phone}`} className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white">
                          📞 {d.phone}
                        </a>
                        <a href={waLink(d.phone)} target="_blank" rel="noopener noreferrer" className="rounded-lg bg-green-700 px-3 py-1.5 text-xs font-bold text-white">
                          WhatsApp
                        </a>
                        <a href={mapsUrl(d.lat, d.lng)} target="_blank" rel="noopener noreferrer" className="rounded-lg bg-slate-700 px-3 py-1.5 text-xs font-bold text-white">
                          🧭 Directions
                        </a>
                      </div>
                      {d.photoUrls.length > 0 && (
                        <div className="mt-2 flex gap-2 overflow-x-auto">
                          {d.photoUrls.map((u, i) => (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              key={i}
                              src={u}
                              alt="Tap to view full photo"
                              onClick={() => setLightbox(u)}
                              className="h-24 w-24 shrink-0 cursor-pointer rounded-lg object-cover active:opacity-80"
                            />
                          ))}
                        </div>
                      )}
                      <div className="mt-2 flex gap-3 text-[11px]">
                        <button onClick={() => act(p.id, "resolve")} className="font-semibold text-sky-400">✓ Mark resolved</button>
                        <button onClick={() => act(p.id, "report")} className="font-semibold text-slate-400">⚑ Report</button>
                      </div>
                    </div>
                  ) : (
                    <button
                      onClick={() => reveal(p.id)}
                      className="mt-2 w-full rounded-lg bg-sky-600 px-3 py-2 text-xs font-bold text-white active:bg-sky-700"
                    >
                      🤝 I can help — show contact · সহায় কৰিব পাৰোঁ
                    </button>
                  )}
                </li>
              );
            })}
            </ul>
          </>
        )}

        <p className="mt-3 text-[10px] leading-snug text-slate-400">
          Posts auto-expire after 48 h. Contact is shown only when you tap “I can help”. Please do not misuse others’ details.
        </p>
      </div>
      )}
    </DragSheet>
    </>
  );
}

function PostForm({
  districts,
  onPosted,
}: {
  districts: { id: string; name: string }[];
  onPosted: () => void;
}) {
  const toast = useToast();
  const [helpType, setHelpType] = useState<HelpType>("rescue");
  const [message, setMessage] = useState("");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [district, setDistrict] = useState("");
  const [loc, setLoc] = useState<{ lat: number; lng: number } | null>(null);
  const [latStr, setLatStr] = useState("");
  const [lngStr, setLngStr] = useState("");
  const [geoBusy, setGeoBusy] = useState(false);
  const [photos, setPhotos] = useState<Blob[]>([]);
  const [previews, setPreviews] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const cfRef = useRef<HTMLDivElement>(null);

  // Load the Cloudflare Turnstile script once — only when a site key is set.
  useEffect(() => {
    if (!TURNSTILE_SITE_KEY || document.querySelector("script[data-turnstile]")) return;
    const s = document.createElement("script");
    s.src = "https://challenges.cloudflare.com/turnstile/v0/api.js";
    s.async = true;
    s.defer = true;
    s.setAttribute("data-turnstile", "1");
    document.head.appendChild(s);
  }, []);

  const useGps = () => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      toast("GPS unavailable — cannot post without location", "warning");
      return;
    }
    setGeoBusy(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLoc({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setLatStr(pos.coords.latitude.toFixed(5));
        setLngStr(pos.coords.longitude.toFixed(5));
        setGeoBusy(false);
      },
      () => {
        setGeoBusy(false);
        toast("Location off — allow location to post", "warning");
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  const onFiles = async (files: FileList | null) => {
    if (!files) return;
    const picked = Array.from(files).slice(0, 3 - photos.length);
    for (const f of picked) {
      try {
        const blob = await compressImage(f);
        setPhotos((p) => [...p, blob]);
        setPreviews((p) => [...p, URL.createObjectURL(blob)]);
      } catch {
        toast("Could not process a photo", "error");
      }
    }
  };

  const submit = async () => {
    if (message.trim().length < 1) return toast("Write what help you need", "warning");
    if (!/^[+()\-\s0-9]{4,20}$/.test(phone.trim())) return toast("Enter a valid contact number", "warning");
    if (!loc) return toast("Tap “Use my location” first", "warning");

    const cfToken =
      cfRef.current?.querySelector<HTMLInputElement>('[name="cf-turnstile-response"]')?.value ?? "";
    if (TURNSTILE_SITE_KEY && !cfToken) return toast("Please complete the anti-spam check", "warning");

    setSubmitting(true);
    const fd = new FormData();
    fd.set("helpType", helpType);
    fd.set("message", message.trim());
    fd.set("name", name.trim());
    fd.set("phone", phone.trim());
    fd.set("district", district);
    fd.set("lat", String(loc.lat));
    fd.set("lng", String(loc.lng));
    fd.set("turnstileToken", cfToken);
    photos.forEach((b, i) => fd.append("photos", new File([b], `photo-${i}.jpg`, { type: "image/jpeg" })));

    try {
      const r = await fetch("/api/help", { method: "POST", body: fd });
      const d = (await r.json()) as { ok?: boolean; error?: string };
      if (!r.ok || !d.ok) throw new Error(d.error);
      toast("Posted — helpers near you can now see it", "success");
      onPosted();
    } catch (e) {
      toast((e as Error)?.message || "Could not post — try again", "error");
      // Turnstile tokens are single-use — reset so the user can retry.
      (window as unknown as { turnstile?: { reset: () => void } }).turnstile?.reset();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-3">
      <div>
        <p className="mb-1 text-[11px] font-semibold text-slate-300">What do you need? · কি লাগে?</p>
        <div className="flex flex-wrap gap-1.5">
          {HELP_TYPES.map((t) => (
            <button
              key={t.id}
              onClick={() => setHelpType(t.id)}
              className={`rounded-full px-3 py-1.5 text-xs font-semibold ${
                helpType === t.id ? "bg-sky-600 text-white" : "bg-slate-800 text-slate-300"
              }`}
            >
              {t.icon} {t.en}
            </button>
          ))}
        </div>
      </div>

      <textarea
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        maxLength={600}
        rows={3}
        placeholder="Describe your situation — how many people, what you need. Do NOT put your phone here. · আপোনাৰ অৱস্থা লিখক।"
        className="w-full rounded-lg bg-slate-800 p-2.5 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-sky-500"
      />

      <div className="grid grid-cols-2 gap-2">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Your name (optional)"
          className="rounded-lg bg-slate-800 p-2.5 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-sky-500"
        />
        <input
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          inputMode="tel"
          placeholder="Contact number *"
          className="rounded-lg bg-slate-800 p-2.5 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-sky-500"
        />
      </div>

      <select
        value={district}
        onChange={(e) => setDistrict(e.target.value)}
        className="w-full rounded-lg bg-slate-800 p-2.5 text-sm text-slate-100 focus:outline-none"
        aria-label="District"
      >
        <option value="">District (optional) · জিলা</option>
        {districts.map((d) => (
          <option key={d.id} value={d.name}>{d.name}</option>
        ))}
      </select>

      <div>
        <button
          onClick={useGps}
          className={`w-full rounded-lg px-3 py-2.5 text-sm font-bold ${loc ? "bg-emerald-700 text-white" : "bg-sky-600 text-white"}`}
        >
          {geoBusy ? "Locating…" : loc ? `📍 Location set (${loc.lat.toFixed(4)}, ${loc.lng.toFixed(4)}) — tap to update` : "📍 Use my GPS location *"}
        </button>
        {/* Or type coordinates directly (lat, lng). */}
        <div className="mt-2 flex items-center gap-2">
          <input
            inputMode="decimal"
            value={latStr}
            onChange={(e) => setLatStr(e.target.value)}
            placeholder="Latitude"
            className="w-full rounded-lg bg-slate-800 p-2 text-sm text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-sky-500"
          />
          <input
            inputMode="decimal"
            value={lngStr}
            onChange={(e) => setLngStr(e.target.value)}
            placeholder="Longitude"
            className="w-full rounded-lg bg-slate-800 p-2 text-sm text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-sky-500"
          />
          <button
            onClick={() => {
              const la = Number(latStr), ln = Number(lngStr);
              if (Number.isFinite(la) && Number.isFinite(ln) && la >= 23.5 && la <= 28.5 && ln >= 88.5 && ln <= 97.5) {
                setLoc({ lat: la, lng: ln });
                toast("Coordinates set", "success");
              } else {
                toast("Enter valid Assam lat/lng", "warning");
              }
            }}
            className="shrink-0 rounded-lg bg-slate-700 px-3 py-2 text-xs font-bold text-slate-100"
          >
            Set
          </button>
        </div>
        <p className="mt-1 text-[10px] text-slate-400">Use GPS, or type latitude &amp; longitude if you know them.</p>
      </div>

      <div>
        <div className="flex flex-wrap gap-2">
          {previews.map((u, i) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img key={i} src={u} alt="" className="h-16 w-16 rounded-lg object-cover" />
          ))}
          {photos.length < 3 && (
            <button
              onClick={() => fileRef.current?.click()}
              className="h-16 w-16 rounded-lg border border-dashed border-slate-600 text-2xl text-slate-500"
              aria-label="Add photo"
            >
              +
            </button>
          )}
        </div>
        <input ref={fileRef} type="file" accept="image/*" multiple hidden onChange={(e) => onFiles(e.target.files)} />
        <p className="mt-1 text-[10px] text-slate-500">Up to 3 photos. Compressed on your phone; location tags removed.</p>
      </div>

      {/* Cloudflare Turnstile anti-spam widget — only when a site key is set. */}
      {TURNSTILE_SITE_KEY && (
        <div ref={cfRef} className="cf-turnstile" data-sitekey={TURNSTILE_SITE_KEY} data-theme="dark" />
      )}

      <button
        onClick={submit}
        disabled={submitting}
        className="w-full rounded-xl bg-red-600 px-3 py-3 text-sm font-bold text-white disabled:opacity-60 active:bg-red-700"
      >
        {submitting ? "Posting…" : "🆘 Post request · অনুৰোধ প্ৰেৰণ কৰক"}
      </button>
      <p className="text-[10px] leading-snug text-slate-500">
        Your number is shown to a helper only when they tap “I can help”. Your exact spot is never shown publicly — pins are rounded to ~1 km.
      </p>
    </div>
  );
}
