"use client";

import { useId, useMemo, useRef, useState } from "react";

export type TrendPoint = { date: string; value: number };
export type TrendSeries = { name: string; color: "series-1" | "series-2"; points: TrendPoint[] };

type Props = {
  title: string;
  unit?: string;
  series: TrendSeries[];
  /** 目標值或參考上限等水平線 */
  reference?: { value: number; label: string };
  height?: number;
  digits?: number;
};

const WIDTH = 640;
const PAD = { top: 16, right: 56, bottom: 28, left: 44 };
const DAY = 86_400_000;

const toTime = (date: string) => new Date(date.length === 10 ? `${date}T12:00:00Z` : date).getTime();

/** 乾淨的刻度：1、2、5 × 10^n */
function niceTicks(min: number, max: number, count = 4) {
  if (min === max) {
    min -= 1;
    max += 1;
  }
  const raw = (max - min) / count;
  const magnitude = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 5, 10].map((m) => m * magnitude).find((s) => s >= raw) ?? raw;
  const start = Math.floor(min / step) * step;
  const end = Math.ceil(max / step) * step;
  const ticks: number[] = [];
  for (let t = start; t <= end + step / 2; t += step) ticks.push(Math.round(t * 1e6) / 1e6);
  return ticks;
}

function shortDate(date: string) {
  const [, m, d] = date.slice(0, 10).split("-").map(Number);
  return `${m}/${d}`;
}

/**
 * 單一 y 軸的趨勢折線圖：2px 線、端點標示、hover / 鍵盤十字線提示、表格檢視。
 * 兩條以上的序列才顯示圖例。
 */
export function TrendChart({ title, unit, series, reference, height = 200, digits = 1 }: Props) {
  const id = useId();
  const svgRef = useRef<SVGSVGElement>(null);
  const [active, setActive] = useState<number | null>(null);
  const format = (v: number) => v.toLocaleString("zh-TW", { maximumFractionDigits: digits });

  const model = useMemo(() => {
    const all = series.flatMap((s) => s.points);
    if (all.length === 0) return null;
    const dates = [...new Set(all.map((p) => p.date.slice(0, 10)))].sort();
    const times = all.map((p) => toTime(p.date));
    let xMin = Math.min(...times);
    let xMax = Math.max(...times);
    if (xMin === xMax) {
      xMin -= DAY;
      xMax += DAY;
    }
    const values = [...all.map((p) => p.value), ...(reference ? [reference.value] : [])];
    const ticks = niceTicks(Math.min(...values), Math.max(...values));
    const yMin = ticks[0];
    const yMax = ticks[ticks.length - 1];
    const plotW = WIDTH - PAD.left - PAD.right;
    const plotH = height - PAD.top - PAD.bottom;
    const x = (t: number) => PAD.left + ((t - xMin) / (xMax - xMin)) * plotW;
    const y = (v: number) => PAD.top + (1 - (v - yMin) / (yMax - yMin)) * plotH;
    return { dates, ticks, x, y, plotH };
  }, [series, reference, height]);

  if (!model) return <p className="text-sm text-muted">還沒有資料。</p>;
  const { dates, ticks, x, y } = model;

  const valuesAt = (date: string) =>
    series.map((s) => ({ series: s, point: s.points.find((p) => p.date.slice(0, 10) === date) }));

  const nearestDate = (clientX: number) => {
    const svg = svgRef.current;
    if (!svg) return null;
    const rect = svg.getBoundingClientRect();
    const px = ((clientX - rect.left) / rect.width) * WIDTH;
    let best = 0;
    dates.forEach((d, i) => {
      if (Math.abs(x(toTime(d)) - px) < Math.abs(x(toTime(dates[best])) - px)) best = i;
    });
    return best;
  };

  const activeDate = active !== null ? dates[active] : null;
  const activeX = activeDate ? x(toTime(activeDate)) : 0;

  return (
    <figure className="space-y-2">
      <figcaption className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="text-sm font-medium">
          {title}
          {unit && <span className="ml-1 text-xs font-normal text-muted">（{unit}）</span>}
        </span>
        {series.length > 1 && (
          <span className="flex gap-3 text-xs text-muted">
            {series.map((s) => (
              <span key={s.name} className="flex items-center gap-1">
                <span className="inline-block h-0.5 w-3 rounded" style={{ background: `var(--${s.color})` }} />
                {s.name}
              </span>
            ))}
          </span>
        )}
      </figcaption>

      <div className="relative">
        <svg
          ref={svgRef}
          viewBox={`0 0 ${WIDTH} ${height}`}
          className="w-full touch-pan-y outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
          role="img"
          aria-label={`${title}趨勢圖，${dates[0]} 至 ${dates[dates.length - 1]}`}
          tabIndex={0}
          onPointerMove={(e) => setActive(nearestDate(e.clientX))}
          onPointerLeave={() => setActive(null)}
          onFocus={() => setActive(dates.length - 1)}
          onBlur={() => setActive(null)}
          onKeyDown={(e) => {
            if (e.key === "ArrowLeft") setActive((a) => Math.max(0, (a ?? dates.length) - 1));
            if (e.key === "ArrowRight") setActive((a) => Math.min(dates.length - 1, (a ?? -1) + 1));
          }}
        >
          {ticks.map((t) => (
            <g key={t}>
              <line x1={PAD.left} x2={WIDTH - PAD.right} y1={y(t)} y2={y(t)} stroke="var(--grid)" strokeWidth={1} />
              <text x={PAD.left - 8} y={y(t)} textAnchor="end" dominantBaseline="middle" className="fill-muted text-[11px] tabular-nums">
                {format(t)}
              </text>
            </g>
          ))}

          {reference && (
            <g>
              <line
                x1={PAD.left}
                x2={WIDTH - PAD.right}
                y1={y(reference.value)}
                y2={y(reference.value)}
                stroke="var(--muted)"
                strokeWidth={1}
              />
              <text x={WIDTH - PAD.right + 4} y={y(reference.value)} dominantBaseline="middle" className="fill-muted text-[10px]">
                {reference.label}
              </text>
            </g>
          )}

          {[dates[0], dates[dates.length - 1]].map((d, i) =>
            i === 1 && dates.length === 1 ? null : (
              <text
                key={`${d}-${i}`}
                x={x(toTime(d))}
                y={height - 8}
                textAnchor={i === 0 ? "start" : "end"}
                className="fill-muted text-[11px]"
              >
                {shortDate(d)}
              </text>
            ),
          )}

          {series.map((s) => {
            const points = [...s.points].sort((a, b) => toTime(a.date) - toTime(b.date));
            if (points.length === 0) return null;
            const last = points[points.length - 1];
            const path = points.map((p, i) => `${i ? "L" : "M"}${x(toTime(p.date)).toFixed(1)},${y(p.value).toFixed(1)}`).join("");
            return (
              <g key={s.name}>
                <path d={path} fill="none" stroke={`var(--${s.color})`} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
                {points.length <= 14 &&
                  points.map((p) => (
                    <circle key={p.date} cx={x(toTime(p.date))} cy={y(p.value)} r={3} fill={`var(--${s.color})`} />
                  ))}
                <circle
                  cx={x(toTime(last.date))}
                  cy={y(last.value)}
                  r={4}
                  fill={`var(--${s.color})`}
                  stroke="var(--surface)"
                  strokeWidth={2}
                />
                <text
                  x={x(toTime(last.date)) + 8}
                  y={y(last.value)}
                  dominantBaseline="middle"
                  className="fill-foreground text-[11px] font-medium tabular-nums"
                >
                  {format(last.value)}
                </text>
              </g>
            );
          })}

          {activeDate && (
            <line x1={activeX} x2={activeX} y1={PAD.top} y2={height - PAD.bottom} stroke="var(--muted)" strokeWidth={1} />
          )}
        </svg>

        {activeDate && (
          <div
            role="status"
            className="pointer-events-none absolute top-0 rounded-lg border border-border bg-surface px-3 py-2 text-xs shadow-sm"
            style={{
              left: `${(activeX / WIDTH) * 100}%`,
              transform: activeX > WIDTH / 2 ? "translateX(calc(-100% - 8px))" : "translateX(8px)",
            }}
          >
            <p className="text-muted">{activeDate}</p>
            {valuesAt(activeDate).map(({ series: s, point }) => (
              <p key={s.name} className="flex items-center gap-2">
                <span className="inline-block h-0.5 w-3 rounded" style={{ background: `var(--${s.color})` }} />
                <span className="font-semibold tabular-nums">{point ? format(point.value) : "—"}</span>
                {series.length > 1 && <span className="text-muted">{s.name}</span>}
              </p>
            ))}
          </div>
        )}
      </div>

      <details className="text-xs">
        <summary className="cursor-pointer text-muted">表格檢視</summary>
        <table className="mt-2 w-full text-left tabular-nums" aria-describedby={id}>
          <thead>
            <tr className="text-muted">
              <th className="py-1 font-normal">日期</th>
              {series.map((s) => (
                <th key={s.name} className="py-1 font-normal">
                  {s.name}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {[...dates].reverse().map((d) => (
              <tr key={d} className="border-t border-border">
                <td className="py-1">{d}</td>
                {valuesAt(d).map(({ series: s, point }) => (
                  <td key={s.name} className="py-1">
                    {point ? format(point.value) : "—"}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        <span id={id} className="sr-only">
          {title}的每日數值
        </span>
      </details>
    </figure>
  );
}
