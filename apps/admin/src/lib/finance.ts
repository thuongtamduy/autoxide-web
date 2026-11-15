// Phần thuần (không gọi mạng) của phân hệ Tài chính: màn "Kế toán" (module `tax`, `ledger`,
// `invoices` của core, bước 36). Dùng được cả ở máy chủ lẫn trình duyệt.

// Permission dự kiến theo đặc tả bước 36 của core (`Module::permissions`). Core chưa có ba module
// này: sổ điều hướng và nút trên màn lọc theo các tên này (admin có mọi permission), để khi có API
// thật thì không phải sửa (W-006).
export const TAX_READ = "tax.read";
export const TAX_PROFILES_MANAGE = "tax.profiles_manage";
export const LEDGER_READ = "ledger.read";
export const LEDGER_POST = "ledger.post";
export const LEDGER_REVERSE = "ledger.reverse";
export const LEDGER_PERIODS_CLOSE = "ledger.periods_close";
export const LEDGER_SETTINGS_MANAGE = "ledger.settings_manage";
export const LEDGER_RECONCILE = "ledger.reconcile";
export const INVOICES_READ = "invoices.read";
export const INVOICES_ISSUE = "invoices.issue";
export const INVOICES_CORRECT = "invoices.correct";
export const INVOICES_SERIES_MANAGE = "invoices.series_manage";
export const INVOICES_MANDATES_MANAGE = "invoices.mandates_manage";
export const INVOICES_EXPORT = "invoices.export";

/** Màn "Kế toán" hiện khi xem được ít nhất một tab. */
export const FINANCE_PERMISSIONS = [LEDGER_READ, INVOICES_READ, TAX_READ, INVOICES_EXPORT] as const;

/**
 * Số tiền đồng gõ tay thành số nguyên: bỏ khoảng trắng và dấu ngăn nghìn (`.` `,`), chỉ nhận số
 * nguyên dương. "1.900.000" → 1900000; "12,5" hay "-3" → `null` (đồng không có phần lẻ).
 */
export function parseDong(text: string): number | null {
  const raw = text.trim().replace(/[\s ]/g, "");
  if (!raw) return null;
  // Dấu ngăn nghìn phải đứng trước đúng ba chữ số: "1.900.000", "1,900,000".
  if (!/^\d{1,3}([.,]\d{3})*$|^\d+$/.test(raw)) return null;
  const value = Number(raw.replace(/[.,]/g, ""));
  return Number.isSafeInteger(value) && value > 0 ? value : null;
}

/** Tháng `YYYY-MM` cho người đọc: "11/2026" (vi) / "Nov 2026" (en). */
export function formatMonth(month: string, locale: string): string {
  const date = new Date(`${month}-01T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return month;
  if (locale === "vi") return `${month.slice(5, 7)}/${month.slice(0, 4)}`;
  return new Intl.DateTimeFormat(locale, {
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);
}

/** Thuế suất dạng chữ ("8", "0.5") cho người đọc theo ngôn ngữ: "0,5%" (vi) / "0.5%" (en). */
export function formatPercent(percent: string, locale: string): string {
  const [whole = "0", fraction] = percent.split(".");
  const separator = new Intl.NumberFormat(locale).format(1.5).charAt(1);
  return `${whole}${fraction ? `${separator}${fraction}` : ""}%`;
}

/** Tổng Nợ và tổng Có của các dòng đang gõ, và chênh lệch (Nợ − Có). Dòng gõ sai không tính. */
export function entryTotals(lines: readonly { debit: string; credit: string }[]): {
  debit: number;
  credit: number;
  difference: number;
} {
  let debit = 0;
  let credit = 0;
  for (const line of lines) {
    debit += parseDong(line.debit) ?? 0;
    credit += parseDong(line.credit) ?? 0;
  }
  return { debit, credit, difference: debit - credit };
}
