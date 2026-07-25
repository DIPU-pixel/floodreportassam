/**
 * Inline SVG sparkline. `markerIndex` (e.g. "today") draws a dashed divider +
 * hollow dot so a past/forecast split reads clearly.
 */
export default function Sparkline({
  values,
  color,
  markerIndex,
}: {
  values: number[];
  color: string;
  markerIndex?: number;
}) {
  if (values.length < 2) return null;
  const w = 220;
  const h = 40;
  const pad = 3;
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  const span = hi - lo || 1;
  const xy = values.map((v, i) => {
    const x = pad + (i / (values.length - 1)) * (w - pad * 2);
    const y = pad + (1 - (v - lo) / span) * (h - pad * 2);
    return [x, y] as const;
  });
  return (
    <svg width="100%" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" className="h-10 w-full">
      {markerIndex != null && markerIndex > 0 && markerIndex < values.length && (
        <line
          x1={xy[markerIndex][0]}
          y1={0}
          x2={xy[markerIndex][0]}
          y2={h}
          stroke="#475569"
          strokeWidth={1}
          strokeDasharray="2 2"
        />
      )}
      <polyline
        points={xy.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(" ")}
        fill="none"
        stroke={color}
        strokeWidth={2}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      {markerIndex != null && xy[markerIndex] && (
        <circle cx={xy[markerIndex][0]} cy={xy[markerIndex][1]} r={2.8} fill="#fff" stroke={color} strokeWidth={1.5} />
      )}
      <circle cx={xy[xy.length - 1][0]} cy={xy[xy.length - 1][1]} r={2.6} fill={color} />
    </svg>
  );
}
