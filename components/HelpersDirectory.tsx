"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useToast } from "@/components/Toast";
import { HELP_TYPES, helpTypeLabel, type HelpType } from "@/lib/helpTypes";
import type { Helper, HelperKind } from "@/lib/helpers";

const TURNSTILE_SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;

function waLink(phone: string): string {
  const d = phone.replace(/\D/g, "");
  return `https://wa.me/${d.length === 10 ? `91${d}` : d}`;
}

/**
 * Directory of people & NGOs who OFFER help. Anyone can add themselves; their
 * number is shown publicly (that's the point). Community-submitted, so a
 * "verify before relying" note + report/admin-moderation guard it.
 */
export default function HelpersDirectory({ districts }: { districts: { id: string; name: string }[] }) {
  const toast = useToast();
  const [mode, setMode] = useState<"browse" | "add">("browse");
  const [helpers, setHelpers] = useState<Helper[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const r = await fetch("/api/helpers", { cache: "no-store" });
      const d = (await r.json()) as { helpers: Helper[] };
      setHelpers(d.helpers ?? []);
    } catch {
      /* keep last */
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  const report = async (id: string) => {
    await fetch(`/api/helpers/${id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "report" }),
    }).catch(() => {});
    toast("Reported — thank you", "success");
    load();
  };

  return (
    <div className="p-3">
      <div className="mb-2 flex gap-1.5">
        {(["browse", "add"] as const).map((m) => (
          <button
            key={m}
            onClick={() => setMode(m)}
            className={`flex-1 rounded-lg px-3 py-1.5 text-xs font-semibold ${
              mode === m ? "bg-sky-600 text-white" : "bg-slate-800 text-slate-300"
            }`}
          >
            {m === "browse" ? "Browse helpers · চাওক" : "Add me · মোক যোগ কৰক"}
          </button>
        ))}
      </div>

      {mode === "add" ? (
        <AddHelperForm districts={districts} onAdded={() => { setMode("browse"); load(); }} />
      ) : loading ? (
        <div className="space-y-2">
          {[0, 1, 2].map((i) => (
            <div key={i} className="skeleton h-20" />
          ))}
        </div>
      ) : helpers.length === 0 ? (
        <p className="py-8 text-center text-sm text-slate-400">
          No volunteers listed yet. Be the first — tap “Add me”. · এতিয়ালৈকে কোনো নাই।
        </p>
      ) : (
        <ul className="space-y-2">
          {helpers.map((h) => (
            <li key={h.id} className="rounded-xl bg-slate-800/70 p-2.5">
              <div className="flex items-start justify-between gap-2">
                <span className="min-w-0">
                  <span className="text-sm font-bold">{h.name}</span>{" "}
                  <span
                    className={`rounded px-1.5 py-0.5 text-[9px] font-bold uppercase ${
                      h.kind === "ngo" ? "bg-violet-700 text-white" : "bg-sky-800 text-sky-200"
                    }`}
                  >
                    {h.kind === "ngo" ? "NGO" : "Volunteer"}
                  </span>
                </span>
              </div>

              {h.causes.length > 0 && (
                <div className="mt-1 flex flex-wrap gap-1">
                  {h.causes.map((c) => {
                    const l = helpTypeLabel(c);
                    return (
                      <span key={c} className="rounded-full bg-slate-900/70 px-1.5 py-0.5 text-[10px] text-slate-300">
                        {l.icon} {l.en}
                      </span>
                    );
                  })}
                </div>
              )}

              {(h.area || h.description) && (
                <p className="mt-1 text-[11px] text-slate-400">
                  {h.area && <span>📍 {h.area}</span>}
                  {h.area && h.description && " · "}
                  {h.description}
                </p>
              )}

              <div className="mt-2 flex flex-wrap items-center gap-1.5">
                <a href={`tel:${h.phone}`} className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white">
                  📞 {h.phone}
                </a>
                <a href={waLink(h.phone)} target="_blank" rel="noopener noreferrer" className="rounded-lg bg-green-700 px-3 py-1.5 text-xs font-bold text-white">
                  WhatsApp
                </a>
                <button onClick={() => report(h.id)} className="ml-auto text-[11px] font-semibold text-slate-400">
                  ⚑ Report
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <p className="mt-3 text-[10px] leading-snug text-slate-400">
        Community-submitted volunteers &amp; NGOs — please verify before relying. For official rescue call
        1079 / 1077 / NDRF 9711077372.
      </p>
    </div>
  );
}

function AddHelperForm({
  districts,
  onAdded,
}: {
  districts: { id: string; name: string }[];
  onAdded: () => void;
}) {
  const toast = useToast();
  const [kind, setKind] = useState<HelperKind>("individual");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [causes, setCauses] = useState<HelpType[]>([]);
  const [area, setArea] = useState("");
  const [description, setDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const cfRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!TURNSTILE_SITE_KEY || document.querySelector("script[data-turnstile]")) return;
    const s = document.createElement("script");
    s.src = "https://challenges.cloudflare.com/turnstile/v0/api.js";
    s.async = true;
    s.defer = true;
    s.setAttribute("data-turnstile", "1");
    document.head.appendChild(s);
  }, []);

  const toggleCause = (c: HelpType) =>
    setCauses((prev) => (prev.includes(c) ? prev.filter((x) => x !== c) : [...prev, c]));

  const submit = async () => {
    if (name.trim().length < 1) return toast("Enter your name / NGO name", "warning");
    if (!/^[+()\-\s0-9]{4,20}$/.test(phone.trim())) return toast("Enter a valid contact number", "warning");
    if (causes.length === 0) return toast("Pick what you can help with", "warning");
    const token = cfRef.current?.querySelector<HTMLInputElement>('[name="cf-turnstile-response"]')?.value ?? "";
    if (TURNSTILE_SITE_KEY && !token) return toast("Please complete the anti-spam check", "warning");

    setSubmitting(true);
    try {
      const r = await fetch("/api/helpers", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ kind, name: name.trim(), phone: phone.trim(), causes, area, description, turnstileToken: token }),
      });
      const d = (await r.json()) as { ok?: boolean; error?: string };
      if (!r.ok || !d.ok) throw new Error(d.error);
      toast("Thank you — you're listed as a helper 🙏", "success");
      onAdded();
    } catch (e) {
      toast((e as Error)?.message || "Could not submit — try again", "error");
      (window as unknown as { turnstile?: { reset: () => void } }).turnstile?.reset();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex gap-1.5">
        {(["individual", "ngo"] as const).map((k) => (
          <button
            key={k}
            onClick={() => setKind(k)}
            className={`flex-1 rounded-lg px-3 py-1.5 text-xs font-bold ${
              kind === k ? "bg-sky-600 text-white" : "bg-slate-800 text-slate-300"
            }`}
          >
            {k === "individual" ? "🙋 Individual" : "🏢 NGO / Group"}
          </button>
        ))}
      </div>

      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder={kind === "ngo" ? "NGO / group name" : "Your name"}
        className="w-full rounded-lg bg-slate-800 p-2.5 text-sm text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-sky-500"
      />
      <input
        value={phone}
        onChange={(e) => setPhone(e.target.value)}
        inputMode="tel"
        placeholder="Contact number (shown publicly)"
        className="w-full rounded-lg bg-slate-800 p-2.5 text-sm text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-sky-500"
      />

      <div>
        <p className="mb-1 text-[11px] font-semibold text-slate-300">What can you help with? · কি সহায় কৰিব পাৰে?</p>
        <div className="flex flex-wrap gap-1.5">
          {HELP_TYPES.map((t) => (
            <button
              key={t.id}
              onClick={() => toggleCause(t.id)}
              className={`rounded-full px-3 py-1.5 text-xs font-semibold ${
                causes.includes(t.id) ? "bg-emerald-600 text-white" : "bg-slate-800 text-slate-300"
              }`}
            >
              {t.icon} {t.en}
            </button>
          ))}
        </div>
      </div>

      <select
        value={area}
        onChange={(e) => setArea(e.target.value)}
        className="w-full rounded-lg bg-slate-800 p-2.5 text-sm text-slate-100 focus:outline-none"
        aria-label="Area"
      >
        <option value="">Area you can cover (optional) · এলেকা</option>
        {districts.map((d) => (
          <option key={d.id} value={d.name}>{d.name}</option>
        ))}
      </select>

      <textarea
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        maxLength={400}
        rows={2}
        placeholder="Anything else (optional) — e.g. have a boat, medical training…"
        className="w-full rounded-lg bg-slate-800 p-2.5 text-sm text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-sky-500"
      />

      {TURNSTILE_SITE_KEY && (
        <div ref={cfRef} className="cf-turnstile" data-sitekey={TURNSTILE_SITE_KEY} data-theme="dark" />
      )}

      <button
        onClick={submit}
        disabled={submitting}
        className="w-full rounded-xl bg-emerald-600 px-3 py-3 text-sm font-bold text-white disabled:opacity-60 active:bg-emerald-700"
      >
        {submitting ? "Submitting…" : "🤝 List me as a helper"}
      </button>
      <p className="text-[10px] leading-snug text-slate-400">
        Your number will be visible to anyone browsing helpers so people in need can call you. Don’t submit
        someone else’s number.
      </p>
    </div>
  );
}
