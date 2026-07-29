"use client";

import { useLang } from "@/lib/i18n";

/**
 * EN / অ switch. Tiny by design — it sits next to the status pill and remembers
 * the choice on the device (see LanguageProvider).
 */
export default function LanguageToggle() {
  const { lang, setLang } = useLang();
  return (
    <div
      role="group"
      aria-label="Language / ভাষা"
      className="pointer-events-auto flex overflow-hidden rounded-full bg-slate-900/90 text-[10px] font-bold shadow-lg backdrop-blur"
    >
      <button
        onClick={() => setLang("en")}
        aria-pressed={lang === "en"}
        className={`px-2 py-1 ${lang === "en" ? "bg-sky-600 text-white" : "text-slate-300"}`}
      >
        EN
      </button>
      <button
        onClick={() => setLang("as")}
        aria-pressed={lang === "as"}
        className={`px-2 py-1 ${lang === "as" ? "bg-sky-600 text-white" : "text-slate-300"}`}
      >
        অ
      </button>
    </div>
  );
}
