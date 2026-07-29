"use client";

import { useEffect, useState } from "react";
import { useT } from "@/lib/i18n";

const SEEN_KEY = "afw.coach.v1";

/**
 * First-run overlay: three one-line tips, shown once per device. Deliberately
 * tiny and dismissable — it must never stand between a worried person and the
 * map. Renders nothing until we've confirmed it hasn't been seen (no flash).
 */
export default function CoachMark() {
  const t = useT();
  const [show, setShow] = useState(false);

  useEffect(() => {
    try {
      if (!localStorage.getItem(SEEN_KEY)) setShow(true);
    } catch {
      /* storage disabled — skip the coach mark entirely */
    }
  }, []);

  const dismiss = () => {
    setShow(false);
    try {
      localStorage.setItem(SEEN_KEY, "1");
    } catch {
      /* ignore */
    }
  };

  if (!show) return null;

  return (
    <div className="pointer-events-auto absolute inset-0 z-40 flex items-center justify-center bg-slate-950/70 px-6 backdrop-blur-sm">
      <div className="w-full max-w-xs rounded-2xl border border-slate-700 bg-slate-900 p-4 shadow-2xl">
        <h2 className="mb-2 text-base font-bold">{t("coach.title")}</h2>
        <ul className="space-y-2 text-[13px] leading-snug text-slate-200">
          <li className="flex gap-2">
            <span aria-hidden>👆</span>
            <span>{t("coach.tapDistrict")}</span>
          </li>
          <li className="flex gap-2">
            <span aria-hidden>🔎</span>
            <span>{t("coach.search")}</span>
          </li>
          <li className="flex gap-2">
            <span aria-hidden>☰</span>
            <span>{t("coach.useTabs")}</span>
          </li>
        </ul>
        <button
          onClick={dismiss}
          className="mt-4 w-full rounded-xl bg-sky-600 py-2 text-sm font-bold text-white active:bg-sky-700"
        >
          {t("coach.gotIt")}
        </button>
      </div>
    </div>
  );
}
