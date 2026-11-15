// Định dạng số cho người đọc: tiền (số nguyên đơn vị nhỏ nhất + mã tiền tệ, như mọi số tiền của
// core), dung lượng, số đếm. Hàm thuần, chạy được ở cả máy chủ và trình duyệt.

/** `118800000, "VND"` → "118.800.000 ₫" (vi) / "₫118,800,000" (en). */
export function formatMoney(minor: number, currency: string, locale: string): string {
  const format = new Intl.NumberFormat(locale, { style: "currency", currency });
  const digits = format.resolvedOptions().maximumFractionDigits ?? 0;
  return format.format(minor / 10 ** digits);
}

/** Số đếm có dấu ngăn nghìn theo ngôn ngữ. */
export function formatCount(value: number, locale: string): string {
  return new Intl.NumberFormat(locale).format(value);
}

/** Dung lượng theo đơn vị nghìn (GB = 10⁹ byte, như nhà cung cấp lưu trữ tính), một chữ số lẻ. */
export function formatBytes(bytes: number, locale: string): string {
  const units = ["B", "KB", "MB", "GB", "TB"];
  let value = bytes;
  let unit = 0;
  while (value >= 1000 && unit < units.length - 1) {
    value /= 1000;
    unit += 1;
  }
  const text = new Intl.NumberFormat(locale, { maximumFractionDigits: unit === 0 ? 0 : 1 }).format(
    value,
  );
  return `${text} ${units[unit]}`;
}
