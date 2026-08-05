"use client";

import { createContext, createElement, useContext, useEffect, useState, type ReactNode } from "react";

/**
 * Two-language UI. Assamese (অ) is a first-class mode, not a decoration — the
 * whole chrome switches, and the choice is remembered on the device.
 *
 * Keep this dictionary the single source of UI strings. Every value is present
 * in BOTH languages so a missing translation is a type error, never a blank.
 */
export type Lang = "en" | "as";

type Dict = Record<string, { en: string; as: string }>;

// One flat, typed dictionary. Keys are dotted by area for grep-ability.
export const STRINGS = {
  "app.title": { en: "Assam Flood Watch", as: "অসম বান নিৰীক্ষণ" },
  "app.subtitle.risk": {
    en: "District flood risk — modelled estimate, not an official warning",
    as: "জিলাৰ বানৰ বিপদ — আৰ্হিগত অনুমান, চৰকাৰী সতৰ্কবাণী নহয়",
  },
  "app.subtitle.rain": {
    en: "Rain forecast view — modelled, not an official warning",
    as: "বৰষুণৰ পূৰ্বাভাস — আৰ্হিগত, চৰকাৰী সতৰ্কবাণী নহয়",
  },
  "app.subtitle.help": {
    en: "Community help & SOS — ask for or offer help",
    as: "সমুদায়িক সহায় আৰু SOS — সহায় বিচাৰক বা আগবঢ়াওক",
  },

  "tab.districts": { en: "Districts", as: "জিলা" },
  "tab.rain": { en: "Rain 72h", as: "বৰষুণ" },
  "tab.flood": { en: "Flood", as: "বান" },
  "tab.emergency": { en: "Emergency", as: "জৰুৰী" },
  "tab.help": { en: "Help", as: "সহায়" },
  "tab.needhelp": { en: "Need help", as: "সহায় লাগে" },
  "tab.requests": { en: "Requests", as: "অনুৰোধ" },
  "tab.helpers": { en: "Helpers", as: "সহায়ক" },
  "mode.help": { en: "Help", as: "সহায়" },
  "mode.flood": { en: "Flood map", as: "বান মেপ" },

  "search.placeholder": { en: "Search town or district…", as: "চহৰ বা জিলা বিচাৰক…" },
  "search.myLocation": { en: "Use my location", as: "মোৰ অৱস্থান" },
  "search.label": { en: "Search area", as: "এলেকা বিচাৰক" },

  "status.connecting": { en: "CONNECTING", as: "সংযোগ হৈছে" },
  "status.live": { en: "LIVE", as: "প্ৰত্যক্ষ" },
  "status.stale": { en: "STALE", as: "পুৰণি" },
  "status.demo": { en: "DEMO", as: "নমুনা" },

  "legend.title": { en: "Map key", as: "মানচিত্ৰৰ সংকেত" },
  "legend.risk": { en: "Flood risk", as: "বানৰ বিপদ" },
  "legend.gauges": { en: "Gauges", as: "গেজ" },
  "legend.open": { en: "Map key", as: "সংকেত" },

  "risk.low": { en: "Low", as: "কম" },
  "risk.moderate": { en: "Moderate", as: "মধ্যমীয়া" },
  "risk.high": { en: "High", as: "অধিক" },
  "risk.severe": { en: "Severe", as: "গুৰুতৰ" },

  "gauge.normal": { en: "Below danger", as: "স্বাভাৱিক" },
  "gauge.warning": { en: "Near danger", as: "সতৰ্কতা" },
  "gauge.danger": { en: "Above danger", as: "বিপদ" },
  "gauge.extreme": { en: "Above record", as: "সৰ্বোচ্চ" },

  "layers.title": { en: "Layers", as: "স্তৰ" },
  "layers.map": { en: "Map", as: "মানচিত্ৰ" },
  "layers.satellite": { en: "Satellite", as: "উপগ্ৰহ" },
  "layers.terrain": { en: "Terrain", as: "ভূ-প্ৰকৃতি" },
  "layers.tilt": { en: "3D tilt", as: "ত্ৰিমাত্ৰিক" },
  "layers.floodExtent": { en: "Flood extent", as: "বানৰ বিস্তৃতি" },
  "layers.help": { en: "Help requests", as: "সহায় অনুৰোধ" },

  "streetview.button": { en: "Street View", as: "ৰাস্তাৰ দৃশ্য" },
  "streetview.hint": {
    en: "Opens Google Maps at this spot — Street View where available.",
    as: "গুগল মেপত এই ঠাই খোলে — উপলব্ধ ঠাইত ৰাস্তাৰ দৃশ্য।",
  },

  "share.button": { en: "Share", as: "ভাগ কৰক" },
  "share.whatsapp": { en: "WhatsApp", as: "হোৱাটছএপ" },
  "share.copied": { en: "Copied", as: "নকল হ’ল" },
  "share.shared": { en: "Shared", as: "ভাগ হ’ল" },

  "alerts.title": { en: "Flood alerts", as: "বানৰ সতৰ্কবাণী" },
  "alerts.subscribe": { en: "Get alerts for this area", as: "এই এলেকাৰ সতৰ্কবাণী লওক" },
  "alerts.subscribed": { en: "Alerts on", as: "সতৰ্কবাণী চলি আছে" },
  "alerts.unsupported": {
    en: "Alerts aren't supported on this browser",
    as: "এই ব্ৰাউজাৰত সতৰ্কবাণী সমৰ্থিত নহয়",
  },
  "alerts.blocked": {
    en: "Notifications are blocked — enable them in your browser settings",
    as: "জাননী অৱৰোধিত — ব্ৰাউজাৰ ছেটিংত সক্ৰিয় কৰক",
  },
  "alerts.explain": {
    en: "A modelled heads-up when risk here turns high. Not an official warning.",
    as: "ইয়াৰ বিপদ অধিক হ’লে আৰ্হিগত সংকেত। চৰকাৰী সতৰ্কবাণী নহয়।",
  },

  "coach.title": { en: "Welcome", as: "স্বাগতম" },
  "coach.tapDistrict": {
    en: "Tap any district for its modelled flood risk and towns.",
    as: "যিকোনো জিলাত টিপি তাৰ আৰ্হিগত বানৰ বিপদ আৰু চহৰ চাওক।",
  },
  "coach.useTabs": {
    en: "Use the bottom tabs for the district list, rain, flood view and emergency numbers.",
    as: "তলৰ টেবেৰে জিলা তালিকা, বৰষুণ, বান দৃশ্য আৰু জৰুৰীকালীন নম্বৰ চাওক।",
  },
  "coach.search": {
    en: "Search your town or use your location to see your area.",
    as: "নিজৰ চহৰ বিচাৰক বা অৱস্থান ব্যৱহাৰ কৰি নিজৰ এলেকা চাওক।",
  },
  "coach.gotIt": { en: "Got it", as: "বুজিলোঁ" },

  "common.close": { en: "Close", as: "বন্ধ কৰক" },
} satisfies Dict;

export type StringKey = keyof typeof STRINGS;

export function translate(key: StringKey, lang: Lang): string {
  return STRINGS[key][lang];
}

const STORAGE_KEY = "afw.lang";

interface LangCtx {
  lang: Lang;
  setLang: (l: Lang) => void;
  toggle: () => void;
  t: (key: StringKey) => string;
}

const Ctx = createContext<LangCtx | null>(null);

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>("en");

  // Restore the remembered choice on mount (client-only, no SSR mismatch since
  // the default "en" renders first, then swaps if a preference exists).
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved === "as" || saved === "en") setLangState(saved);
    } catch {
      /* storage disabled — keep default */
    }
  }, []);

  const setLang = (l: Lang) => {
    setLangState(l);
    try {
      localStorage.setItem(STORAGE_KEY, l);
    } catch {
      /* ignore */
    }
    if (typeof document !== "undefined") document.documentElement.lang = l === "as" ? "as" : "en";
  };

  const value: LangCtx = {
    lang,
    setLang,
    toggle: () => setLang(lang === "en" ? "as" : "en"),
    t: (key) => STRINGS[key][lang],
  };

  return createElement(Ctx.Provider, { value }, children);
}

export function useLang(): LangCtx {
  const ctx = useContext(Ctx);
  if (!ctx) {
    // Safe fallback if a component is used outside the provider (e.g. tests):
    // behave as English, no persistence.
    return {
      lang: "en",
      setLang: () => {},
      toggle: () => {},
      t: (key) => STRINGS[key].en,
    };
  }
  return ctx;
}

/** Convenience: just the translator function. */
export function useT(): (key: StringKey) => string {
  return useLang().t;
}
