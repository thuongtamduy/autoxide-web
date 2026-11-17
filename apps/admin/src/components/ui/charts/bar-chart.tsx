import type { CSSProperties } from "react";
import {
  type ChartUnit,
  formatTick,
  formatValue,
  labelIndexes,
  niceTicks,
  type XPoint,
  yAt,
} from "@/lib/chart";
import { ChartHover } from "./hover";
import { type ChartColor, colorVar, DataTable, XAxis, YAxis } from "./parts";
import type { ChartText } from "./time-series";

/**
 * Biểu đồ cột một chuỗi theo mốc (ngày, giờ). Cột mảnh (tối đa 24px), đầu bo 4px, mọc từ một đường
 * đáy, cách nhau 2px. Cột là khối HTML để góc bo không méo khi co giãn; lưới vẽ bằng SVG. Không cần
 * JavaScript để vẽ; rê chuột / phím mũi tên hiện tooltip, bảng "Xem số liệu" có mọi số.
 */
export function BarChart({
  label,
  summary,
  x,
  values,
  seriesLabel,
  unit,
  locale,
  currency,
  color = 1,
  text,
  height = 160,
}: {
  label: string;
  summary?: string;
  x: readonly XPoint[];
  values: readonly number[];
  /** Tên chuỗi trong tooltip và cột bảng. */
  seriesLabel: string;
  unit: ChartUnit;
  locale: string;
  currency?: string;
  color?: ChartColor;
  text: ChartText;
  height?: number;
}) {
  const n = x.length;
  const max = Math.max(0, ...values);
  const spans = niceTicks(max);
  const top = spans.at(-1) ?? 1;
  const ticks = spans.map((s) => ({ y: yAt(s, top), text: formatTick(s, unit, locale, top) }));
  const fmt = (v: number) => formatValue(v, unit, locale, currency);
  const center = (i: number) => ((i + 0.5) / Math.max(n, 1)) * 100;
  return (
    <figure className="chart" style={{ "--chart-h": `${height}px` } as CSSProperties}>
      <div className="chart-grid">
        <YAxis ticks={ticks} />
        <div className="chart-plot">
          <div
            className="chart-canvas"
            role="img"
            aria-label={summary ? `${label}. ${summary}` : label}
          >
            <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
              {ticks.map((t) => (
                <line key={t.y} className="chart-gridline" x1="0" x2="100" y1={t.y} y2={t.y} />
              ))}
            </svg>
            <div className="chart-bars">
              {values.map((v, i) => (
                <span key={x[i]?.key ?? i} className="chart-slot">
                  {v > 0 ? (
                    <span
                      className="chart-bar"
                      style={{ height: `${100 - yAt(v, top)}%`, background: colorVar(color) }}
                    />
                  ) : null}
                </span>
              ))}
            </div>
          </div>
          <ChartHover
            positions={x.map((_, i) => center(i))}
            heads={x.map((p) => p.long)}
            mode="band"
            hint={text.hint}
            series={[
              {
                label: seriesLabel,
                color: colorVar(color),
                dashed: false,
                texts: values.map(fmt),
                ys: null,
              },
            ]}
          />
        </div>
        <XAxis x={x} indexes={labelIndexes(n)} at={center} />
      </div>
      <DataTable
        summary={text.data}
        head={text.x}
        columns={[seriesLabel]}
        rows={x.map((p, i) => ({ key: p.key, label: p.long, cells: [fmt(values[i] ?? 0)] }))}
      />
    </figure>
  );
}
