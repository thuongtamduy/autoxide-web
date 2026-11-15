// Định dạng số cho người đọc: tiền (số nguyên đơn vị nhỏ nhất + mã tiền tệ, như mọi số tiền của
// core), dung lượng, số đếm. Hàm thuần, chạy được ở cả máy chủ và trình duyệt.

/**
 * Tiền cho người đọc. `minor` là số nguyên đơn vị nhỏ nhất (core trả `amount` là chuỗi, D-180 của
 * core, nên nhận cả chuỗi). Đồng Việt Nam luôn viết số trước, khoảng trắng không ngắt (U+00A0) rồi
 * "₫", ở mọi ngôn ngữ, để giá không bị ngắt dòng giữa số và ký hiệu:
 * `590000, "VND"` → "590.000 ₫" (vi) / "590,000 ₫" (en). Tiền khác theo thói quen của ngôn ngữ.
 */
export function formatMoney(minor: number | string, currency: string, locale: string): string {
  const value = typeof minor === "string" ? Number(minor) : minor;
  if (currency === "VND") {
    return `${new Intl.NumberFormat(locale, { maximumFractionDigits: 0 }).format(value)}\u00a0₫`;
  }
  const format = new Intl.NumberFormat(locale, { style: "currency", currency });
  const digits = format.resolvedOptions().maximumFractionDigits ?? 0;
  return format.format(value / 10 ** digits);
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
