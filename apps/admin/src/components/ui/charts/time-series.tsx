import type { CSSProperties } from "react";
import {
  areaPath,
  type ChartUnit,
  formatTick,
  formatValue,
  labelIndexes,
  linePath,
  niceTicks,
  type XPoint,
  xAt,
  yAt,
} from "@/lib/chart";
import { ChartHover } from "./hover";
import { type ChartColor, colorVar, DataTable, Legend, XAxis, YAxis } from "./parts";

export interface ChartSeries {
  id: string;
  label: string;
  /** Một giá trị cho mỗi mốc của `x`, cùng thứ tự. */
  values: readonly number[];
  /** Ô màu theo thực thể (không theo hạng), để lọc bớt chuỗi không đổi màu chuỗi còn lại. */
  color?: ChartColor;
  /** Kỳ trước để so: nét đứt, màu chữ nhạt. */
  previous?: boolean;
}

export interface ChartText {
  /** Nút mở bảng số liệu ("Xem số liệu"). */
  data: string;
  /** Tiêu đề cột mốc của bảng ("Ngày", "Giờ"). */
  x: string;
  /** Nhãn của lớp bàn phím ("Dùng phím mũi tên để xem từng ngày"). */
  hint: string;
}

/**
 * Biểu đồ đường theo thời gian (1–3 chuỗi, kỳ trước nét đứt, vạch ngưỡng tuỳ chọn). Vẽ bằng SVG ở máy
 * chủ (không cần JavaScript): khung 0…100 co theo bề rộng (`preserveAspectRatio="none"`, nét không
 * giãn), chữ trục là HTML nên không méo. Rê chuột / phím mũi tên hiện tooltip; bảng "Xem số liệu" có
 * mọi số.
 */
export function TimeSeriesChart({
  label,
  summary,
  x,
  series,
  unit,
  locale,
  currency,
  threshold,
  area = false,
  from = 0,
  text,
  height = 200,
}: {
  /** Tên biểu đồ, cũng là đầu nhãn cho trình đọc màn hình. */
  label: string;
  /** Câu tóm tắt nối sau `label` trong nhãn (vd tổng và % thay đổi). */
  summary?: string;
  x: readonly XPoint[];
  series: readonly ChartSeries[];
  unit: ChartUnit;
  locale: string;
  currency?: string;
  /** Vạch ngưỡng (vd "Mục tiêu dưới 2%"): nét đứt màu cảnh báo, có nhãn chữ. */
  threshold?: { value: number; label: string };
  /** Nền nhạt dưới chuỗi đầu tiên (không phải kỳ trước). */
  area?: boolean;
  /** Gốc trục Y (mặc định 0). */
  from?: number;
  text: ChartText;
  height?: number;
}) {
  const n = x.length;
  const max = Math.max(from, threshold?.value ?? from, ...series.flatMap((s) => s.values));
  const spans = niceTicks(max - from);
  const top = spans.at(-1) ?? 1;
  const y = (v: number) => yAt(v - from, top);
  const ticks = spans.map((s) => ({
    y: y(s + from),
    text: formatTick(s + from, unit, locale, top + from),
  }));
  const fmt = (v: number) => formatValue(v, unit, locale, currency);
  const main = series.find((s) => !s.previous);
  const shifted = (values: readonly number[]) => values.map((v) => v - from);
  // Chú giải: các chuỗi khi có từ hai chuỗi (một chuỗi thì tiêu đề đã nói), cộng vạch ngưỡng nếu có.
  const legend = [
    ...(series.length >= 2 ? series : []).map((s) => ({
      label: s.label,
      color: colorVar(s.color, s.previous),
      dashed: Boolean(s.previous),
    })),
    ...(threshold ? [{ label: threshold.label, color: "var(--bad)", dashed: true }] : []),
  ];
  const lastY = main ? y(main.values.at(-1) ?? 0) : null;

  return (
    <figure className="chart" style={{ "--chart-h": `${height}px` } as CSSProperties}>
      {legend.length > 0 ? <Legend items={legend} /> : null}
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
              {area && main ? (
                <path
                  className="chart-area"
                  d={areaPath(shifted(main.values), top)}
                  style={{ fill: colorVar(main.color) }}
                />
              ) : null}
              {threshold ? (
                <line
                  className="chart-threshold"
                  x1="0"
                  x2="100"
                  y1={y(threshold.value)}
                  y2={y(threshold.value)}
                />
              ) : null}
              {/* Kỳ trước vẽ trước để chuỗi chính nằm trên. */}
              {[...series]
                .sort((a, b) => Number(Boolean(b.previous)) - Number(Boolean(a.previous)))
                .map((s) => (
                  <path
                    key={s.id}
                    className={s.previous ? "chart-line previous" : "chart-line"}
                    d={linePath(shifted(s.values), top)}
                    style={{ stroke: colorVar(s.color, s.previous) }}
                    data-points={s.values.length}
                  />
                ))}
            </svg>
            {main && lastY !== null && n > 0 ? (
              <span
                className="chart-dot end"
                style={{ left: "100%", top: `${lastY}%`, background: colorVar(main.color) }}
              />
            ) : null}
          </div>
          <ChartHover
            positions={x.map((_, i) => xAt(i, n))}
            heads={x.map((p) => p.long)}
            mode="line"
            hint={text.hint}
            series={series.map((s) => ({
              label: s.label,
              color: colorVar(s.color, s.previous),
              dashed: Boolean(s.previous),
              texts: s.values.map(fmt),
              ys: s.values.map(y),
            }))}
          />
        </div>
        <XAxis x={x} indexes={labelIndexes(n)} at={(i) => xAt(i, n)} />
      </div>
      <DataTable
        summary={text.data}
        head={text.x}
        columns={series.map((s) => s.label)}
        rows={x.map((p, i) => ({
          key: p.key,
          label: p.long,
          cells: series.map((s) => fmt(s.values[i] ?? 0)),
        }))}
      />
    </figure>
  );
}
