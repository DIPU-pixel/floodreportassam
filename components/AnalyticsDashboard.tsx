import type { Dashboard } from "@/lib/visits";

/** Last-30-day series with zero-filled gaps (the SQL only returns non-zero days). */
function fill30(daily: { day: string; count: number }[]): { day: string; count: number }[] {
  const map = new Map(daily.map((d) => [d.day, d.count]));
  const out: { day: string; count: number }[] = [];
  const now = new Date();
  for (let i = 29; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    out.push({ day: key, count: map.get(key) ?? 0 });
  }
  return out;
}

function Tile({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900 p-3 text-center">
      <p className="text-2xl font-bold" style={{ color }}>{value.toLocaleString("en-IN")}</p>
      <p className="text-[11px] text-slate-400">{label}</p>
    </div>
  );
}

/** Single-series daily bar chart in plain SVG — recessive grid, rounded bars. */
function DailyChart({ data }: { data: { day: string; count: number }[] }) {
  const W = 720, H = 200, padL = 30, padB = 22, padT = 10, padR = 6;
  const plotW = W - padL - padR;
  const plotH = H - padT - padB;
  const max = Math.max(1, ...data.map((d) => d.count));
  const n = data.length;
  const bw = plotW / n;
  const y = (v: number) => padT + plotH - (v / max) * plotH;
  const ticks = [0, Math.round(max / 2), max].filter((v, i, a) => a.indexOf(v) === i);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Daily visits, last 30 days">
      {ticks.map((t) => (
        <g key={t}>
          <line x1={padL} x2={W - padR} y1={y(t)} y2={y(t)} stroke="#334155" strokeWidth={1} opacity={0.5} />
          <text x={padL - 4} y={y(t) + 3} textAnchor="end" fontSize={9} fill="#94a3b8">{t}</text>
        </g>
      ))}
      {data.map((d, i) => {
        const h = (d.count / max) * plotH;
        return (
          <rect
            key={d.day}
            x={padL + i * bw + 1}
            y={padT + plotH - h}
            width={Math.max(1, bw - 2)}
            height={h}
            rx={2}
            fill="#38bdf8"
          >
            <title>{`${d.day}: ${d.count} visit${d.count === 1 ? "" : "s"}`}</title>
          </rect>
        );
      })}
      {[0, 14, 29].map((i) => {
        const d = data[i];
        if (!d) return null;
        const [, m, day] = d.day.split("-");
        return (
          <text key={i} x={padL + i * bw + bw / 2} y={H - 6} textAnchor="middle" fontSize={9} fill="#94a3b8">
            {day}/{m}
          </text>
        );
      })}
    </svg>
  );
}

function RankBars({
  title,
  rows,
  color,
  fmt = (s) => s,
}: {
  title: string;
  rows: { key: string; count: number }[];
  color: string;
  fmt?: (s: string) => string;
}) {
  const max = Math.max(1, ...rows.map((r) => r.count));
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900 p-3">
      <p className="mb-2 text-xs font-semibold text-slate-300">{title}</p>
      {rows.length === 0 ? (
        <p className="text-[11px] text-slate-500">No data yet.</p>
      ) : (
        <ul className="space-y-1.5">
          {rows.map((r) => (
            <li key={r.key} className="text-[11px]">
              <div className="mb-0.5 flex items-center justify-between gap-2">
                <span className="min-w-0 truncate text-slate-300">{fmt(r.key)}</span>
                <span className="shrink-0 font-semibold text-slate-200">{r.count.toLocaleString("en-IN")}</span>
              </div>
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-800">
                <div className="h-full rounded-full" style={{ width: `${(r.count / max) * 100}%`, backgroundColor: color }} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default function AnalyticsDashboard({ dash }: { dash: Dashboard }) {
  const daily = fill30(dash.daily);
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Tile label="Total visits" value={dash.total} color="#38bdf8" />
        <Tile label="Today" value={dash.today} color="#34d399" />
        <Tile label="Last 7 days" value={dash.week} color="#fbbf24" />
        <Tile label="Last 30 days" value={dash.month} color="#a78bfa" />
      </div>

      <div className="rounded-xl border border-slate-800 bg-slate-900 p-3">
        <p className="mb-2 text-xs font-semibold text-slate-300">Visits · last 30 days</p>
        <DailyChart data={daily} />
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <RankBars
          title="Top sources (referrers)"
          rows={dash.referrers.map((r) => ({ key: r.referrer, count: r.count }))}
          color="#34d399"
        />
        <RankBars
          title="Top pages"
          rows={dash.paths.map((p) => ({ key: p.path, count: p.count }))}
          color="#fbbf24"
        />
      </div>
    </div>
  );
}
