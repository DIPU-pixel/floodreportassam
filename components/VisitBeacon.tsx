"use client";

import { useEffect } from "react";

/**
 * Counts one visit per browser session (sessionStorage guard, so reloads and
 * SPA re-renders don't inflate the number). Fire-and-forget — never blocks or
 * breaks the page. Reads show up in the admin dashboard.
 */
export default function VisitBeacon() {
  useEffect(() => {
    try {
      if (sessionStorage.getItem("afw.counted")) return;
      sessionStorage.setItem("afw.counted", "1");
    } catch {
      /* private mode — just count it */
    }
    fetch("/api/visit", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ path: location.pathname, referrer: document.referrer || "" }),
      keepalive: true,
    }).catch(() => {});
  }, []);
  return null;
}
