import type { ReactNode } from "react";
import type { XPoint } from "@/lib/chart";
import "./charts.css";

/** Ô màu theo thứ tự cố định của thực thể (biến `--viz-N` ở `globals.css`, đã kiểm mù màu). */
export type ChartColor = 1 | 2 | 3 | 4 | 5 | 6;

export const colorVar = (color: ChartColor | undefined, previous = false) =>
  previous ? "var(--ink-3)" : `var(--viz-${color ?? 1})`;

/** Chú giải: vạch khoá (liền hay đứt) cạnh tên; chữ luôn màu chữ, không mang màu chuỗi. */
export function Legend({
  items,
}: {
  items: readonly { label: string; color: string; dashed?: boolean; bar?: boolean }[];
}) {
  return (
    <ul className="chart-legend">
      {items.map((item) => (
        <li key={item.label}>
          <span
            className={item.bar ? "chart-key bar" : item.dashed ? "chart-key dashed" : "chart-key"}
            style={{ borderColor: item.color, color: item.color }}
          />
          {item.label}
        </li>
      ))}
    </ul>
  );
}

/** Nhãn trục X: cách đều, mốc đầu canh trái, mốc cuối canh phải để không tràn khung. */
export function XAxis({
  x,
  indexes,
  at,
}: {
  x: readonly XPoint[];
  indexes: readonly number[];
  at: (i: number) => number;
}) {
  return (
    <div className="chart-x" aria-hidden="true">
      {indexes.map((i, k) => {
        const left = at(i);
        const edge = left <= 2 ? " start" : left >= 98 ? " end" : "";
        // Khung hẹp (điện thoại) chỉ giữ mốc chẵn, mốc đầu và cuối: nhãn "alt" ẩn bằng CSS.
        const alt = k > 0 && k < indexes.length - 1 && (k % 2 === 1 || k === indexes.length - 2);
        return (
          <span
            key={x[i]?.key ?? i}
            className={`chart-xl${edge}${alt ? " alt" : ""}`}
            style={{ left: `${left}%` }}
          >
            {x[i]?.short}
          </span>
        );
      })}
    </div>
  );
}

/** Nhãn trục Y (vạch tròn) và lưới ngang mảnh: lưới vẽ ở SVG, nhãn là chữ HTML để không méo. */
export function YAxis({ ticks }: { ticks: readonly { y: number; text: string }[] }) {
  return (
    <div className="chart-y" aria-hidden="true">
      <span className="chart-y-sizer">
        {ticks.reduce((a, t) => (t.text.length > a.length ? t.text : a), "")}
      </span>
      {ticks.map((tick) => (
        <span key={tick.y} style={{ top: `${tick.y}%` }}>
          {tick.text}
        </span>
      ))}
    </div>
  );
}

/** Bảng số liệu đầy đủ (bản tương đương của biểu đồ cho trình đọc màn hình, in, chép số). */
export function DataTable({
  summary,
  head,
  columns,
  rows,
}: {
  summary: string;
  head: string;
  columns: readonly string[];
  rows: readonly { key: string; label: string; cells: readonly ReactNode[] }[];
}) {
  return (
    <details className="chart-data">
      <summary>{summary}</summary>
      <div className="chart-data-scroll">
        <table>
          <thead>
            <tr>
              <th scope="col">{head}</th>
              {columns.map((c) => (
                <th key={c} scope="col" className="r">
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.key}>
                <th scope="row">{row.label}</th>
                {row.cells.map((cell, i) => (
                  <td key={columns[i] ?? i} className="r num">
                    {cell}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}
