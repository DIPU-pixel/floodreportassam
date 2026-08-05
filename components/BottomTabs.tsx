"use client";

import { useT, type StringKey } from "@/lib/i18n";

export type TabKey =
  | "districts"
  | "rain"
  | "flood"
  | "emergency"
  | "post"
  | "requests"
  | "helpers";

const FLOOD_TABS: { key: TabKey; icon: string; label: StringKey }[] = [
  { key: "districts", icon: "☰", label: "tab.districts" },
  { key: "rain", icon: "🌧", label: "tab.rain" },
  { key: "flood", icon: "🌊", label: "tab.flood" },
  { key: "emergency", icon: "⚠", label: "tab.emergency" },
];

const HELP_TABS: { key: TabKey; icon: string; label: StringKey }[] = [
  { key: "post", icon: "🆘", label: "tab.needhelp" },
  { key: "requests", icon: "📋", label: "tab.requests" },
  { key: "helpers", icon: "🤝", label: "tab.helpers" },
  { key: "emergency", icon: "⚠", label: "tab.emergency" },
];

/**
 * Single bottom bar of icon tabs — the set depends on the app mode (Help vs
 * Flood map). Emergency is permanently tinted red and present in both modes.
 */
export default function BottomTabs({
  mode,
  active,
  onSelect,
}: {
  mode: "help" | "flood";
  active: Set<TabKey>;
  onSelect: (key: TabKey) => void;
}) {
  const t = useT();
  const tabs = mode === "help" ? HELP_TABS : FLOOD_TABS;
  return (
    <nav className="pointer-events-auto absolute inset-x-0 bottom-6 z-30 mx-auto max-w-md px-3">
      <div className="flex overflow-hidden rounded-2xl border border-slate-700/80 bg-slate-900/95 shadow-2xl backdrop-blur">
        {tabs.map((tab) => {
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
