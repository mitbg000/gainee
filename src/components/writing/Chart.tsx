/** Task 1 visuals: the AI writes ```chart {json}``` blocks, drawn here as simple SVG line, bar or pie charts. */
import Markdown from "@/components/lesson/Markdown";

export type ChartSpec = { type: "line" | "bar" | "pie"; title?: string; unit?: string; labels: string[]; series: { name: string; values: number[] }[] };

const COLORS = ["#2f6fb0", "#d9822b", "#3a9a5b", "#b5465b", "#7a5cc2", "#8a8f98"];

/** Valid spec or null (then the block is shown as text). */
export function parseChart(src: string): ChartSpec | null {
  try {
    const j = JSON.parse(src);
    if (!["line", "bar", "pie"].includes(j?.type) || !Array.isArray(j.labels) || !Array.isArray(j.series) || !j.series.length) return null;
    const labels = j.labels.slice(0, 12).map(String);
    const series = j.series.slice(0, 6).map((s: { name?: unknown; values?: unknown[] }) => ({
      name: String(s?.name ?? ""),
      values: labels.map((_: string, i: number) => Number(s?.values?.[i]) || 0),
    }));
    return { type: j.type, title: j.title ? String(j.title) : undefined, unit: j.unit ? String(j.unit) : undefined, labels, series };
  } catch {
    return null;
  }
}

/** Text and chart blocks in order. */
export function splitCharts(text: string): ({ md: string } | { chart: ChartSpec })[] {
  const parts: ({ md: string } | { chart: ChartSpec })[] = [];
  const re = /```chart\s*\n([\s\S]*?)```/g;
  let last = 0;
  for (let m; (m = re.exec(text)); last = re.lastIndex) {
    if (m.index > last) parts.push({ md: text.slice(last, m.index) });
    const c = parseChart(m[1]);
    parts.push(c ? { chart: c } : { md: m[1] });
  }
  if (last < text.length) parts.push({ md: text.slice(last) });
  return parts.filter((p) => !("md" in p) || p.md.trim());
}

/** Round the axis maximum up to 1, 2, 2.5 or 5 × 10ⁿ. */
export function niceMax(v: number) {
  if (v <= 0) return 1;
  const p = 10 ** Math.floor(Math.log10(v));
  return ([1, 2, 2.5, 5, 10].find((f) => f * p >= v) ?? 10) * p;
}

const fmt = (n: number) => String(+n.toFixed(2));

function Axes({ spec }: { spec: ChartSpec }) {
  const W = 600, H = 330, L = 52, R = 16, T = 30, B = 44;
  const max = niceMax(Math.max(...spec.series.flatMap((s) => s.values)));
  const y = (v: number) => T + (H - T - B) * (1 - v / max);
  const n = spec.labels.length;
  const band = (W - L - R) / n;
  const x = (i: number) => L + band * (i + 0.5);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label={spec.title}>
      {[0, 0.25, 0.5, 0.75, 1].map((f) => (
        <g key={f}>
          <line x1={L} x2={W - R} y1={y(max * f)} y2={y(max * f)} stroke="currentColor" strokeOpacity={f ? 0.12 : 0.4} />
          <text x={L - 6} y={y(max * f) + 4} textAnchor="end" fontSize="11" fill="currentColor" fillOpacity={0.7}>
            {fmt(max * f)}
          </text>
        </g>
      ))}
      {spec.labels.map((l, i) => (
        <text key={i} x={x(i)} y={H - B + 18} textAnchor="middle" fontSize={n > 8 ? 10 : 12} fill="currentColor">
          {l}
        </text>
      ))}
      {spec.type === "line"
        ? spec.series.map((s, k) => (
            <g key={k} stroke={COLORS[k % COLORS.length]} fill={COLORS[k % COLORS.length]}>
              <polyline points={s.values.map((v, i) => `${x(i)},${y(v)}`).join(" ")} fill="none" strokeWidth={2.5} />
              {s.values.map((v, i) => (
                <circle key={i} cx={x(i)} cy={y(v)} r={3.5} />
              ))}
            </g>
          ))
        : spec.series.map((s, k) => {
            const bw = (band * 0.75) / spec.series.length;
            return s.values.map((v, i) => (
              <rect key={`${k}-${i}`} x={x(i) - band * 0.375 + k * bw} y={y(v)} width={bw - 2} height={y(0) - y(v)} rx={2} fill={COLORS[k % COLORS.length]} />
            ));
          })}
      {spec.unit && (
        <text x={4} y={T - 14} fontSize="11" fill="currentColor" fillOpacity={0.7}>
          {spec.unit}
        </text>
      )}
    </svg>
  );
}

function Pie({ name, values, labels }: { name: string; values: number[]; labels: string[] }) {
  const total = values.reduce((a, b) => a + b, 0) || 1;
  let a0 = -Math.PI / 2;
  return (
    <figure className="flex-1 basis-48 text-center">
      <svg viewBox="-110 -110 220 220" className="mx-auto w-full max-w-60" role="img" aria-label={name}>
        {values.map((v, i) => {
          const a1 = a0 + (v / total) * 2 * Math.PI;
          const mid = (a0 + a1) / 2;
          const large = a1 - a0 > Math.PI ? 1 : 0;
          const d = v >= total ? "M0,-100A100,100 0 1 1 -0.01,-100Z" : `M0,0L${100 * Math.cos(a0)},${100 * Math.sin(a0)}A100,100 0 ${large} 1 ${100 * Math.cos(a1)},${100 * Math.sin(a1)}Z`;
          a0 = a1;
          return (
            <g key={i}>
              <path d={d} fill={COLORS[i % COLORS.length]} stroke="var(--color-card, #fff)" strokeWidth={1.5} />
              {v / total > 0.04 && (
                <text x={62 * Math.cos(mid)} y={62 * Math.sin(mid) + 4} textAnchor="middle" fontSize="13" fontWeight="600" fill="#fff">
                  {fmt((v / total) * 100)}%
                </text>
              )}
            </g>
          );
        })}
      </svg>
      {name && <figcaption className="mt-1 text-sm font-semibold">{name}</figcaption>}
      <span className="sr-only">{labels.join(", ")}</span>
    </figure>
  );
}

export function Chart({ spec }: { spec: ChartSpec }) {
  const legend = spec.type === "pie" ? spec.labels : spec.series.map((s) => s.name);
  return (
    <figure className="my-3 rounded-xl border border-line bg-card p-3">
      {spec.title && <figcaption className="mb-2 text-center text-sm font-semibold">{spec.title}</figcaption>}
      {spec.type === "pie" ? (
        <div className="flex flex-wrap justify-center gap-4">
          {spec.series.map((s, k) => (
            <Pie key={k} name={s.name} values={s.values} labels={spec.labels} />
          ))}
        </div>
      ) : (
        <Axes spec={spec} />
      )}
      <ul className="mt-2 flex flex-wrap justify-center gap-x-4 gap-y-1 text-xs">
        {legend.map((l, i) => (
          <li key={i} className="flex items-center gap-1.5">
            <span className="size-3 rounded-sm" style={{ background: COLORS[i % COLORS.length] }} />
            {l}
          </li>
        ))}
      </ul>
    </figure>
  );
}

/** Markdown with ```chart blocks drawn as charts. */
export default function PromptView({ text, className = "" }: { text: string; className?: string }) {
  return (
    <div className={className}>
      {splitCharts(text).map((p, i) => ("chart" in p ? <Chart key={i} spec={p.chart} /> : <Markdown key={i} text={p.md} />))}
    </div>
  );
}
