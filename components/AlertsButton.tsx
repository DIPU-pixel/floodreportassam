"use client";

import { useEffect, useState } from "react";
import { useLang } from "@/lib/i18n";
import { useToast } from "@/components/Toast";
import { currentState, subscribe, unsubscribe, type PushState } from "@/lib/pushClient";

/**
 * "Get alerts for this area" toggle. Renders nothing unless the server has
 * VAPID configured AND the browser supports push — the feature is optional and
 * must never leave a dead button on screen. Alerts are modelled heads-ups,
 * labelled as such.
 */
export default function AlertsButton({
  districtId,
  districtName,
}: {
  districtId: string;
  districtName: string;
}) {
  const { lang, t } = useLang();
  const toast = useToast();
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [state, setState] = useState<PushState>("off");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    fetch("/api/push/vapid", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : { configured: false }))
      .then((j: { configured?: boolean }) => alive && setConfigured(Boolean(j.configured)))
      .catch(() => alive && setConfigured(false));
    currentState().then((s) => alive && setState(s));
    return () => {
      alive = false;
    };
  }, []);

  // Feature off (no server keys) or unknown yet → render nothing.
  if (configured === null || configured === false) return null;
  if (state === "unsupported") {
    return <p className="mt-2 text-[11px] text-slate-500">{t("alerts.unsupported")}</p>;
  }

  const on = state === "on";

  const onClick = async () => {
    setBusy(true);
    const next = on
      ? await unsubscribe()
      : await subscribe({ districtId, districtName, lang });
    setState(next);
    setBusy(false);
    if (next === "on") toast(`${t("alerts.subscribed")} — ${districtName}`, "success");
    else if (on && next === "off") toast("Alerts off", "info");
    else if (next === "denied") toast(t("alerts.blocked"), "warning");
    else if (next === "off" && !on) toast("Couldn’t enable alerts", "error");
  };

  if (state === "denied") {
    return <p className="mt-2 text-[11px] text-amber-400">{t("alerts.blocked")}</p>;
  }

  return (
    <div className="mt-2">
      <button
        onClick={onClick}
        disabled={busy}
        aria-pressed={on}
        className={`flex w-full items-center justify-center gap-1.5 rounded-xl px-3 py-2 text-xs font-bold disabled:opacity-60 ${
          on ? "bg-emerald-600 text-white" : "bg-slate-800 text-slate-100"
        }`}
      >
        <span aria-hidden>{on ? "🔔" : "🔕"}</span>
        {on ? t("alerts.subscribed") : t("alerts.subscribe")}
      </button>
      <p className="mt-1 text-[10px] leading-snug text-slate-500">{t("alerts.explain")}</p>
    </div>
  );
}
