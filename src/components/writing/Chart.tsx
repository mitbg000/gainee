/** Task 1 visuals: the AI writes ```chart {json}``` blocks, drawn here as SVG line/bar/pie charts, process flows and maps. */
import Markdown from "@/components/lesson/Markdown";

/** values may be null (a series with fewer points than the labels); max fixes the y-axis top (e.g. 100 % or band 9). */
export type ChartSpec = { type: "line" | "bar" | "pie"; title?: string; unit?: string; max?: number; labels: string[]; series: { name: string; values: (number | null)[] }[] };
export type ProcessSpec = { type: "process"; title?: string; cycle: boolean; steps: { label: string; note?: string }[] };
export const MAP_KINDS = ["building", "road", "park", "water", "farm", "other"] as const;
type MapItem = { label: string; kind: (typeof MAP_KINDS)[number]; x: number; y: number; w: number; h: number };
export type MapSpec = { type: "map"; title?: string; maps: { name: string; items: MapItem[] }[] };
export type Visual = ChartSpec | ProcessSpec | MapSpec;

const COLORS = ["#2f6fb0", "#d9822b", "#3a9a5b", "#b5465b", "#7a5cc2", "#8a8f98"];

/** Valid spec or null (then the block is shown as text). */
export function parseChart(src: string): Visual | null {
  try {
    const j = JSON.parse(src);
    const title = j?.title ? String(j.title) : undefined;
    if (j?.type === "process" && Array.isArray(j.steps) && j.steps.length >= 2)
      return {
        type: "process",
        title,
        cycle: !!j.cycle,
        steps: j.steps.slice(0, 14).map((x: { label?: unknown; note?: unknown } | string) =>
          typeof x === "string" ? { label: x } : { label: String(x?.label ?? ""), note: x?.note ? String(x.note) : undefined },
        ),
      };
    if (j?.type === "map" && Array.isArray(j.maps) && j.maps.length) {
      const num = (v: unknown, lo: number, hi: number) => Math.min(hi, Math.max(lo, Number(v) || 0));
      return {
        type: "map",
        title,
        maps: j.maps.slice(0, 3).map((m: { name?: unknown; items?: unknown[] }) => ({
          name: String(m?.name ?? ""),
          items: (Array.isArray(m?.items) ? m.items : []).slice(0, 30).map((it) => {
            const o = (it ?? {}) as Record<string, unknown>;
            const x = num(o.x, 0, 98), y = num(o.y, 0, 98);
            return {
              label: String(o.label ?? ""),
              kind: (MAP_KINDS as readonly string[]).includes(String(o.kind)) ? (o.kind as MapItem["kind"]) : "other",
              x, y, w: num(o.w, 2, 100 - x), h: num(o.h, 2, 100 - y),
            };
          }),
        })),
      };
    }
    if (!["line", "bar", "pie"].includes(j?.type) || !Array.isArray(j.labels) || !Array.isArray(j.series) || !j.series.length) return null;
    const labels = j.labels.slice(0, 12).map(String);
    const series = j.series.slice(0, 6).map((s: { name?: unknown; values?: unknown[] }) => ({
      name: String(s?.name ?? ""),
      values: labels.map((_: string, i: number) => Number(s?.values?.[i]) || 0),
    }));
    return { type: j.type, title, unit: j.unit ? String(j.unit) : undefined, labels, series };
  } catch {
    return null;
  }
}

/** Text and chart blocks in order. */
export function splitCharts(text: string): ({ md: string } | { chart: Visual })[] {
  const parts: ({ md: string } | { chart: Visual })[] = [];
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

/**
 * Smooth SVG path through the points (monotone cubic, Fritsch–Carlson): soft curves that never swing
 * above or below the real values, so 100 % stays 100 % and a flat stretch stays flat.
 */
export function smoothPath(p: [number, number][]): string {
  if (p.length < 3) return p.map(([px, py], i) => `${i ? "L" : "M"}${px},${py}`).join("");
  const n = p.length;
  const d = p.slice(1).map(([px, py], i) => (py - p[i][1]) / (px - p[i][0])); // slope of each segment
  const m = p.map((_, i) => (i === 0 ? d[0] : i === n - 1 ? d[n - 2] : d[i - 1] * d[i] <= 0 ? 0 : (d[i - 1] + d[i]) / 2));
  for (let i = 0; i < n - 1; i++) {
    if (d[i] === 0) {
      m[i] = m[i + 1] = 0;
      continue;
    }
    const a = m[i] / d[i], b = m[i + 1] / d[i], h = a * a + b * b;
    if (h > 9) {
      const t = 3 / Math.sqrt(h);
      m[i] = t * a * d[i];
      m[i + 1] = t * b * d[i];
    }
  }
  let path = `M${p[0][0]},${p[0][1]}`;
  for (let i = 0; i < n - 1; i++) {
    const dx = (p[i + 1][0] - p[i][0]) / 3;
    path += `C${p[i][0] + dx},${p[i][1] + m[i] * dx} ${p[i + 1][0] - dx},${p[i + 1][1] - m[i + 1] * dx} ${p[i + 1][0]},${p[i + 1][1]}`;
  }
  return path;
}

function Axes({ spec }: { spec: ChartSpec }) {
  const W = 600, H = 330, L = 52, R = 16, T = 30, B = 44;
  const max = spec.max ?? niceMax(Math.max(...spec.series.flatMap((s) => s.values.map((v) => v ?? 0))));
  const y = (v: number) => T + (H - T - B) * (1 - v / max);
  // whole-number grid lines where quarters would give 2.25, 6.75… (e.g. band 0–9)
  const step = Number.isInteger(max / 4) ? max / 4 : max <= 10 ? 1 : max / 5;
  const ticks = Array.from({ length: Math.round(max / step) + 1 }, (_, i) => i * step);
  const n = spec.labels.length;
  const band = (W - L - R) / n;
  const x = (i: number) => L + band * (i + 0.5);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label={spec.title}>
      {ticks.map((v) => (
        <g key={v}>
          <line x1={L} x2={W - R} y1={y(v)} y2={y(v)} stroke="currentColor" strokeOpacity={v ? 0.12 : 0.4} />
          <text x={L - 6} y={y(v) + 4} textAnchor="end" fontSize="11" fill="currentColor" fillOpacity={0.7}>
            {fmt(v)}
          </text>
        </g>
      ))}
      {spec.labels.map((l, i) => (i % Math.ceil(n / 12) ? null : (
        <text key={i} x={x(i)} y={H - B + 18} textAnchor="middle" fontSize={n > 8 ? 10 : 12} fill="currentColor">
          {l}
        </text>
      )))}
      {spec.type === "line"
        ? spec.series.map((s, k) => (
            <g key={k} stroke={COLORS[k % COLORS.length]} fill={COLORS[k % COLORS.length]}>
              <path d={smoothPath(s.values.flatMap((v, i) => (v == null ? [] : [[x(i), y(v)] as [number, number]])))} fill="none" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />
              {s.values.map((v, i) =>
                v == null ? null : (
                  <circle key={i} cx={x(i)} cy={y(v)} r={3.5}>
                    <title>{`${s.name ? `${s.name} · ` : ""}${spec.labels[i]}: ${fmt(v)}${spec.unit === "%" ? "%" : ""}`}</title>
                  </circle>
                ),
              )}
            </g>
          ))
        : spec.series.map((s, k) => {
            const bw = (band * 0.75) / spec.series.length;
            return s.values.map((v, i) => v == null ? null : (
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

function Pie({ name, values: raw, labels }: { name: string; values: (number | null)[]; labels: string[] }) {
  const values = raw.map((v) => v ?? 0);
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

const Arrow = () => (
  <svg viewBox="0 0 24 24" className="size-5 shrink-0 text-accent2" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M5 12h14M13 6l6 6-6 6" />
  </svg>
);

/** Stages in order (a manufacturing process, a life cycle, how a device works); a cycle loops back to step 1. */
function Process({ spec }: { spec: ProcessSpec }) {
  return (
    <figure className="my-3 rounded-xl border border-line bg-card p-3">
      {spec.title && <figcaption className="mb-3 text-center text-sm font-semibold">{spec.title}</figcaption>}
      <ol className="flex flex-wrap items-stretch justify-center gap-y-3">
        {spec.steps.map((st, i) => (
          <li key={i} className="flex items-center">
            <div className="flex w-36 flex-col items-center rounded-xl border-2 border-accent2/40 bg-paper px-2 py-2 text-center">
              <span className="mb-1 flex size-6 items-center justify-center rounded-full bg-accent2 text-xs font-bold text-white">{i + 1}</span>
              <b className="text-sm leading-snug">{st.label}</b>
              {st.note && <span className="mt-0.5 text-xs leading-snug text-muted">{st.note}</span>}
            </div>
            {(i < spec.steps.length - 1 || spec.cycle) && <span className="px-1"><Arrow /></span>}
          </li>
        ))}
        {spec.cycle && (
          <li className="flex items-center text-sm font-semibold text-accent2">
            <svg viewBox="0 0 24 24" className="mr-1 size-5" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M3 12a9 9 0 1 0 3-6.7L3 8M3 3v5h5" />
            </svg>
            1
          </li>
        )}
      </ol>
    </figure>
  );
}

const MAP_FILL: Record<MapItem["kind"], string> = { building: "#c9a27a", road: "#a3a8ae", park: "#86bf84", water: "#82b6dc", farm: "#e2d17e", other: "#c7c2d6" };

/** One to three plans of the same place (e.g. before and after development) on a 100×100 grid. */
function Maps({ spec }: { spec: MapSpec }) {
  return (
    <figure className="my-3 rounded-xl border border-line bg-card p-3">
      {spec.title && <figcaption className="mb-2 text-center text-sm font-semibold">{spec.title}</figcaption>}
      <div className="flex flex-wrap justify-center gap-4">
        {spec.maps.map((m, k) => (
          <figure key={k} className="min-w-56 flex-1 basis-56 text-center">
            <svg viewBox="-2 -2 104 104" className="w-full rounded-lg" role="img" aria-label={m.name}>
              <rect x={-2} y={-2} width={104} height={104} fill="#f4f1e8" />
              {m.items.map((it, i) => (
                <rect key={i} x={it.x} y={it.y} width={it.w} height={it.h} rx={it.kind === "building" ? 0.8 : 0.3} fill={MAP_FILL[it.kind]} stroke="#00000033" strokeWidth={0.3} />
              ))}
              {m.items.map((it, i) =>
                it.label ? (
                  <text key={i} x={it.x + it.w / 2} y={it.y + it.h / 2 + 1.3} textAnchor="middle" fontSize={3.6} fontWeight={600} fill="#222">
                    {it.label}
                  </text>
                ) : null,
              )}
              <g transform="translate(94 8)" fill="#222">
                <path d="M0 -5 L2.5 2 L0 0.6 L-2.5 2 Z" />
                <text y={6.5} textAnchor="middle" fontSize={3.6} fontWeight={700}>N</text>
              </g>
            </svg>
            <figcaption className="mt-1 text-sm font-semibold">{m.name}</figcaption>
          </figure>
        ))}
      </div>
    </figure>
  );
}

export function Chart({ spec }: { spec: Visual }) {
  if (spec.type === "process") return <Process spec={spec} />;
  if (spec.type === "map") return <Maps spec={spec} />;
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
