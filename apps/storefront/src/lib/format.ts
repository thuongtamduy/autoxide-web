// Định dạng số, tiền, ngày cho website. Hàm thuần, dùng được ở cả máy chủ và trình duyệt.
//
// Luật của thiết kế (mục 8 của `ui-design.md`): số tiền không bao giờ bị bẻ dòng — giữa số và
// "₫" là khoảng trắng không ngắt (NBSP), và ô hiện giá đặt `white-space: nowrap` (lớp `.price`).

/** Khoảng trắng không ngắt. */
export const NBSP = " ";

/** Tiền như JSON của core (D-180): số nguyên đơn vị nhỏ nhất (chuỗi hay số) + mã tiền tệ. */
export interface Money {
  amount: string | number;
  currency: string;
}

/** Nhóm ba chữ số: `.` cho tiếng Việt, `,` cho tiếng Anh. */
export function groupDigits(value: number, locale: string): string {
  const sign = value < 0 ? "-" : "";
  const digits = String(Math.abs(Math.trunc(value)));
  return sign + digits.replace(/\B(?=(\d{3})+(?!\d))/g, locale === "vi" ? "." : ",");
}

/**
 * "690.000 ₫" (vi) / "690,000 ₫" (en) với NBSP trước "₫". Tiền tệ khác VND (có phần lẻ) thì theo
 * `Intl`, khoảng trắng trong kết quả cũng đổi thành NBSP.
 */
export function formatMoney(money: Money, locale: string): string {
  const amount = Number(money.amount);
  if (money.currency === "VND") {
    return `${groupDigits(amount, locale)}${NBSP}₫`;
  }
  const format = new Intl.NumberFormat(locale === "vi" ? "vi-VN" : "en-US", {
    style: "currency",
    currency: money.currency,
  });
  const digits = format.resolvedOptions().maximumFractionDigits ?? 2;
  return format.format(amount / 10 ** digits).replace(/\s/g, NBSP);
}

/** Tiền VND từ số nguyên (dữ liệu mẫu). */
export function vnd(amount: number, locale: string): string {
  return formatMoney({ amount, currency: "VND" }, locale);
}

/** Điểm đánh giá một chữ số thập phân: "4,8" (vi) / "4.8" (en). */
export function formatRating(value: number, locale: string): string {
  const text = value.toFixed(1);
  return locale === "vi" ? text.replace(".", ",") : text;
}

/** Ngày theo giờ Việt Nam: "08/11/2026" (vi) / "8 Nov 2026" (en). */
export function formatDate(iso: string, locale: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  if (locale === "vi") {
    const parts = new Intl.DateTimeFormat("en-GB", {
      timeZone: "Asia/Ho_Chi_Minh",
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    }).format(date);
    return parts;
  }
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Ho_Chi_Minh",
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(date);
}

/** Số và đơn vị không tách dòng: "26 cm" → "26 cm" với NBSP ("35 / cm" không rơi lẻ). */
export function keepUnits(text: string): string {
  return text.replace(/(\d) (cm|mm|ml|lít|l|g|kg|món|người)\b/g, `$1${NBSP}$2`);
}

/** Hai chữ cái đầu của tên để làm hình đại diện ("Thu Hà" → "TH"). */
export function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "?";
  const first = words[0]?.[0] ?? "";
  const last = words.length > 1 ? (words.at(-1)?.[0] ?? "") : "";
  return (first + last).toUpperCase();
}

/** Số từ 0 tới `size - 1` cố định theo một chuỗi (chọn màu, hình minh hoạ theo id). */
export function pick(seed: string, size: number): number {
  let hash = 0;
  for (const char of seed) {
    hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  }
  return size > 0 ? hash % size : 0;
}
