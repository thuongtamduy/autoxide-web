/** Ô "đã dùng / suất đã bán": chữ và thanh mức (vàng khi từ 85%). Không cần JavaScript. */
export function Meter({ label, percent }: { label: string; percent: number }) {
  return (
    <span className={percent >= 85 ? "pm-meter hi" : "pm-meter"}>
      <span>{label}</span>
      <progress className="bar" max={100} value={percent} aria-label={label} />
    </span>
  );
}
