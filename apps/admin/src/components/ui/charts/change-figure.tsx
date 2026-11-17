import "./charts.css";

/**
 * Số tổng của kỳ và thay đổi so với kỳ trước. Hướng có dấu (+/−) và mũi tên, màu chỉ nhắc thêm (tăng là
 * tốt khi `upIsGood`). `change = null` (kỳ trước bằng 0) thì không có phần trăm, chỉ có `note`.
 */
export function ChangeFigure({
  value,
  change,
  changeText,
  note,
  upIsGood = true,
}: {
  value: string;
  change: number | null;
  /** Phần trăm đã định dạng có dấu ("+12,5%"). */
  changeText: string;
  /** "so với 7 ngày trước đó" hoặc "Kỳ trước chưa có số liệu để so". */
  note: string;
  upIsGood?: boolean;
}) {
  const tone = change === null || change === 0 ? "flat" : change > 0 === upIsGood ? "up" : "down";
  return (
    <div className="chart-figure">
      <b className="chart-figure-value">{value}</b>
      {change !== null ? (
        <span className={`chart-delta ${tone}`} data-change={change.toFixed(1)}>
          <span aria-hidden="true">{change > 0 ? "▲" : change < 0 ? "▼" : "●"}</span>
          {changeText}
        </span>
      ) : null}
      <span className="chart-delta-note">{note}</span>
    </div>
  );
}
