// Đổi câu của hộp việc (`WorkMessage`: i18n key + tham số) thành chữ theo ngôn ngữ người xem; hàm thuần,
// nhận hàm dịch của next-intl. Tiền và ngày định dạng theo ngôn ngữ lúc hiện (core trả số nguyên đồng
// và ngày lịch, không trả chữ đã định dạng).
import { formatMoney } from "@/lib/format";
import type { WorkMessage } from "./types";

type Translate = (key: string, values?: Record<string, string | number>) => string;

/** Ngày lịch `YYYY-MM-DD` cho người đọc (không đổi múi giờ: đây là ngày, không phải thời điểm). */
export function dayText(day: string, locale: string): string {
  const date = new Date(`${day}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return day;
  return new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeZone: "UTC" }).format(date);
}

export function renderMessage(t: Translate, message: WorkMessage, locale: string): string {
  const values: Record<string, string | number> = {};
  for (const [name, value] of Object.entries(message.params ?? {})) {
    if (typeof value === "object") {
      values[name] =
        "money" in value
          ? formatMoney(value.money.amount, value.money.currency, locale)
          : dayText(value.day, locale);
    } else {
      values[name] = value;
    }
  }
  return t(message.key, values);
}

/**
 * Khoảng cách tới một thời điểm cho người đọc ("2 giờ trước", "sau 3 ngày"), không phụ thuộc múi giờ
 * nên dựng được ngay ở máy chủ.
 */
export function relativeTime(at: number, now: number, locale: string): string {
  const format = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });
  const diff = at - now;
  const minutes = Math.round(diff / 60_000);
  if (Math.abs(minutes) < 60) return format.format(minutes, "minute");
  const hours = Math.round(diff / 3_600_000);
  if (Math.abs(hours) < 48) return format.format(hours, "hour");
  return format.format(Math.round(diff / 86_400_000), "day");
}
