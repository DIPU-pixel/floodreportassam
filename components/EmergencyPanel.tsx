"use client";

const CALLS: { label: string; as: string; number: string; sub: string }[] = [
  { label: "NDRF", as: "এন.ডি.আৰ.এফ", number: "9711077372", sub: "National Disaster Response Force" },
  { label: "State helpline", as: "ৰাজ্যিক", number: "1079", sub: "Assam State Emergency" },
  { label: "District helpline", as: "জিলা", number: "1077", sub: "District control room" },
];

const LINKS: { label: string; as: string; href: string; sub: string }[] = [
  { label: "ASDMA", as: "অসম", href: "https://asdma.assam.gov.in", sub: "State Disaster Management" },
  { label: "FRIMS daily report", as: "দৈনিক প্ৰতিবেদন", href: "https://frims.asdma.gov.in", sub: "Official flood figures" },
];

export default function EmergencyPanel({ onClose }: { onClose: () => void }) {
  return (
    <div className="pointer-events-auto absolute inset-x-0 bottom-20 z-30 mx-auto max-w-md px-3">
      <div className="rounded-2xl border border-red-800/70 bg-slate-900/97 p-3 shadow-2xl backdrop-blur">
        <div className="mb-2 flex items-center justify-between gap-3">
          <h2 className="text-base font-bold leading-tight text-red-300">
            Emergency <span className="font-normal text-slate-400">· জৰুৰীকালীন</span>
          </h2>
          <button
            onClick={onClose}
            aria-label="Close"
            className="rounded-full bg-slate-800 px-2.5 py-1 text-sm text-slate-300"
          >
            ✕
          </button>
        </div>

        <div className="space-y-2">
          {CALLS.map((c) => (
            <a
              key={c.number}
              href={`tel:${c.number}`}
              className="flex items-center justify-between gap-3 rounded-xl bg-red-600 px-4 py-3 active:bg-red-700"
            >
              <span className="min-w-0">
                <span className="block text-sm font-bold leading-tight text-white">
                  {c.label} <span className="font-normal text-red-100">· {c.as}</span>
                </span>
                <span className="block truncate text-[11px] text-red-100">{c.sub}</span>
              </span>
              <span className="shrink-0 text-lg font-bold tabular-nums text-white">📞 {c.number}</span>
            </a>
          ))}
        </div>

        <div className="mt-3 grid grid-cols-2 gap-2">
          {LINKS.map((l) => (
            <a
              key={l.href}
              href={l.href}
              target="_blank"
              rel="noreferrer"
              className="rounded-xl bg-slate-800 px-3 py-2 active:bg-slate-700"
            >
              <span className="block text-sm font-semibold leading-tight">
                {l.label} <span className="font-normal text-slate-400">· {l.as}</span>
              </span>
              <span className="block text-[10px] text-slate-400">{l.sub} ↗</span>
            </a>
          ))}
        </div>

        <p className="mt-2 text-[10px] leading-snug text-slate-500">
          For official warnings and rescue, always follow ASDMA / CWC / district administration.
        </p>
      </div>
    </div>
  );
}
