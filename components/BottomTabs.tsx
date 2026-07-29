"use client";

import { useT, type StringKey } from "@/lib/i18n";

export type TabKey = "districts" | "rain" | "flood" | "emergency";

const TABS: { key: TabKey; icon: string; label: StringKey }[] = [
  { key: "districts", icon: "☰", label: "tab.districts" },
  { key: "rain", icon: "🌧", label: "tab.rain" },
  { key: "flood", icon: "🌊", label: "tab.flood" },
  { key: "emergency", icon: "⚠", label: "tab.emergency" },
];

/**
 * Single bottom bar of icon tabs. Emergency is permanently tinted red and is
 * never hidden — it must be one tap away at all times.
 */
export default function BottomTabs({
  active,
  onSelect,
}: {
  active: Set<TabKey>;
  onSelect: (key: TabKey) => void;
}) {
  const t = useT();
  return (
    <nav className="pointer-events-auto absolute inset-x-0 bottom-6 z-30 mx-auto max-w-md px-3">
      <div className="flex overflow-hidden rounded-2xl border border-slate-700/80 bg-slate-900/95 shadow-2xl backdrop-blur">
        {TABS.map((tab) => {
          const on = active.has(tab.key);
          const danger = tab.key === "emergency";
          return (
            <button
              key={tab.key}
              onClick={() => onSelect(tab.key)}
              aria-pressed={on}
              className={`flex flex-1 flex-col items-center gap-0.5 py-2 transition-colors ${
                danger
                  ? on
                    ? "bg-red-600 text-white"
                    : "text-red-300 active:bg-red-900/40"
                  : on
                    ? "bg-sky-600 text-white"
                    : "text-slate-300 active:bg-slate-800"
              }`}
            >
              <span className="text-base leading-none">{tab.icon}</span>
              <span className="text-[10px] font-semibold leading-none">{t(tab.label)}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
