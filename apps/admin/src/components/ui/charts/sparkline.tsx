import { xAt } from "@/lib/chart";
import "./charts.css";

/** Vị trí dọc theo % trong khung min…max của chính dãy (dãy phẳng nằm giữa). */
export function sparkY(values: readonly number[]): number[] {
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  // Chừa 8% trên dưới để nét 2px không bị cắt ở mép.
  return values.map((v) => (hi === lo ? 50 : 92 - ((v - lo) / (hi - lo)) * 84));
}

/**
 * Đường nhỏ trong ô số liệu: xu hướng, không trục. Nét màu nhạt, chấm cuối màu nhấn (giá trị hiện tại).
 * `label` là câu đầy đủ cho trình đọc màn hình (vd "14 ngày qua: từ 1,2 Tr ₫ tới 3,4 Tr ₫").
 */
export function Sparkline({ values, label }: { values: readonly number[]; label: string }) {
  if (values.length < 2) return null;
  const ys = sparkY(values);
  const d = ys
    .map((y, i) => `${i === 0 ? "M" : "L"}${xAt(i, ys.length).toFixed(2)},${y.toFixed(2)}`)
    .join(" ");
  return (
    <span className="spark" role="img" aria-label={label}>
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
        <path className="chart-line spark-line" d={d} data-points={values.length} />
      </svg>
      <span className="spark-dot" style={{ top: `${ys.at(-1) ?? 50}%` }} />
    </span>
  );
}
