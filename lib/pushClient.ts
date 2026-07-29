"use client";

import type { Lang } from "@/lib/i18n";

/** Browser-side push helpers. All no-ops (return "unsupported") off a secure,
 * capable browser, so the UI can degrade gracefully. */

export type PushState = "unsupported" | "denied" | "off" | "on";

export function pushSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(b64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

async function registration(): Promise<ServiceWorkerRegistration> {
  const existing = await navigator.serviceWorker.getRegistration();
  return existing ?? navigator.serviceWorker.register("/sw.js");
}

export async function currentState(): Promise<PushState> {
  if (!pushSupported()) return "unsupported";
  if (Notification.permission === "denied") return "denied";
  try {
    const reg = await navigator.serviceWorker.getRegistration();
    const sub = await reg?.pushManager.getSubscription();
    return sub ? "on" : "off";
  } catch {
    return "off";
  }
}

interface SubscribeArgs {
  districtId?: string;
  districtName?: string;
  lang: Lang;
}

/** Subscribe this device to alerts (for a district, if given). */
export async function subscribe(args: SubscribeArgs): Promise<PushState> {
  if (!pushSupported()) return "unsupported";

  const permission = await Notification.requestPermission();
  if (permission !== "granted") return permission === "denied" ? "denied" : "off";

  const keyRes = await fetch("/api/push/vapid", { cache: "no-store" });
  if (!keyRes.ok) return "off";
  const { key } = (await keyRes.json()) as { key?: string };
  if (!key) return "off";

  const reg = await registration();
  await navigator.serviceWorker.ready;
  const sub = await reg.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(key) as BufferSource,
  });

  const json = sub.toJSON() as { endpoint?: string; keys?: { p256dh?: string; auth?: string } };
  const res = await fetch("/api/push/subscribe", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      endpoint: json.endpoint,
      keys: json.keys,
      districtId: args.districtId,
      districtName: args.districtName,
      lang: args.lang,
    }),
  });
  return res.ok ? "on" : "off";
}

/** Unsubscribe this device. */
export async function unsubscribe(): Promise<PushState> {
  if (!pushSupported()) return "unsupported";
  try {
    const reg = await navigator.serviceWorker.getRegistration();
    const sub = await reg?.pushManager.getSubscription();
    if (sub) {
      const endpoint = sub.endpoint;
      await sub.unsubscribe();
      await fetch("/api/push/subscribe", {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ endpoint }),
      });
    }
    return "off";
  } catch {
    return "off";
  }
}
