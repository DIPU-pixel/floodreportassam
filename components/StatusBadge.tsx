import type { ApiStatus } from "@/lib/types";

const STYLES: Record<ApiStatus, { dot: string; label: string }> = {
  live: { dot: "bg-emerald-400", label: "LIVE" },
  stale: { dot: "bg-amber-400", label: "STALE" },
  demo: { dot: "bg-slate-400", label: "DEMO" },
};

export default function StatusBadge({
  status,
  updatedAt,
}: {
  status: ApiStatus;
  updatedAt: string | null;
}) {
  const s = STYLES[status];
  const time = updatedAt
    ? new Date(updatedAt).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })
    : "—";
  return (
    <div className="pointer-events-auto flex items-center gap-2 rounded-xl bg-slate-900/85 px-3 py-2 text-[11px] shadow-lg backdrop-blur">
      <span className={`h-2 w-2 rounded-full ${s.dot} ${status === "live" ? "animate-pulse" : ""}`} />
      <span className="font-semibold">{s.label}</span>
      <span className="text-slate-400">{status === "stale" ? `stale since ${time}` : time}</span>
    </div>
  );
}
