// Lịch tháng của tab "Lịch giao" (hàm thuần, chạy ở máy chủ lẫn trình duyệt): ngày nào hãng lấy
// hàng, giờ chốt ngày đó, ngày nghỉ, ngày đổi lịch; ví dụ ngày giao dự kiến cho đơn đặt một ngày.
// Ngày luôn là `YYYY-MM-DD` theo giờ Việt Nam; hiển thị bằng `Intl` theo ngôn ngữ giao diện, giờ
// 24h, ngày trước tháng (dd/mm) ở cả hai ngôn ngữ.

import { type DeliveryCalendar, etaFor, isWorkday } from "./shipping";

const DAY = 86_400_000;

/** Một phiên bản lịch: giờ chốt, ngày làm việc, áp từ ngày nào. */
export interface CalendarRule {
  id: string;
  cutoff: string;
  workdays: readonly number[];
  effective_from: string;
}

/** Ngày nghỉ: `org_id` rỗng là cả chuỗi; chưa có ngày (chờ thông báo) thì bỏ qua. */
export interface CalendarHoliday {
  id: string;
  org_id: string | null;
  name: string;
  from: string | null;
  to: string | null;
  status: string;
}

/** "pickup": hãng lấy hàng; "holiday": ngày nghỉ của cả chuỗi; "off": không phải ngày làm việc. */
export type DayKind = "pickup" | "holiday" | "off";

export interface CalendarDay {
  day: string;
  inMonth: boolean;
  isToday: boolean;
  isPast: boolean;
  kind: DayKind;
  /** Giờ chốt của ngày lấy hàng; `null` khi không lấy. */
  cutoff: string | null;
  /** Tên ngày nghỉ của cả chuỗi rơi vào ngày này. */
  holidays: string[];
  /** Ngày nghỉ riêng của một nút (kho, cửa hàng): không đổi lịch cả chuỗi, chỉ ghi chú. */
  local: CalendarHoliday[];
  /** Phiên bản lịch bắt đầu áp từ ngày này. */
  starts: CalendarRule | null;
}

export function addDays(day: string, n: number): string {
  return new Date(Date.parse(`${day}T00:00:00Z`) + n * DAY).toISOString().slice(0, 10);
}

/** Tháng `YYYY-MM` cộng `delta` tháng. */
export function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split("-").map(Number);
  const date = new Date(Date.UTC(y ?? 1970, (m ?? 1) - 1 + delta, 1));
  return date.toISOString().slice(0, 7);
}

export function isMonth(text: string): boolean {
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(text);
}

export function isDay(text: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(text) && !Number.isNaN(Date.parse(`${text}T00:00:00Z`));
}

/** Phiên bản lịch hiệu lực ở ngày `day` (bản có `effective_from` lớn nhất ≤ `day`). */
export function ruleAt<R extends CalendarRule>(rules: readonly R[], day: string): R | null {
  let best: R | null = null;
  for (const r of rules) {
    if (r.effective_from > day) continue;
    if (!best || r.effective_from > best.effective_from) best = r;
  }
  return best;
}

const chainHolidays = (holidays: readonly CalendarHoliday[]) =>
  holidays.filter(
    (h): h is CalendarHoliday & { from: string; to: string } =>
      h.org_id === null && h.status === "confirmed" && h.from !== null && h.to !== null,
  );

/** Lịch của cả chuỗi theo một phiên bản (để tính ngày giao dự kiến). */
export function chainCalendar(
  rule: Pick<CalendarRule, "cutoff" | "workdays">,
  holidays: readonly CalendarHoliday[],
): DeliveryCalendar {
  return {
    cutoff: rule.cutoff,
    workdays: rule.workdays,
    holidays: chainHolidays(holidays).map((h) => ({ from: h.from, to: h.to })),
  };
}

/** Thông tin một ngày trên lịch. */
export function dayInfo(
  day: string,
  rules: readonly CalendarRule[],
  holidays: readonly CalendarHoliday[],
  today: string,
): Omit<CalendarDay, "inMonth"> {
  const rule = ruleAt(rules, day);
  const on = (h: CalendarHoliday) =>
    h.status === "confirmed" && h.from !== null && h.to !== null && h.from <= day && day <= h.to;
  const chain = chainHolidays(holidays)
    .filter(on)
    .map((h) => h.name);
  const local = holidays.filter((h) => h.org_id !== null && on(h));
  const pickup = rule !== null && isWorkday(day, chainCalendar(rule, holidays));
  return {
    day,
    isToday: day === today,
    isPast: day < today,
    kind: chain.length > 0 ? "holiday" : pickup ? "pickup" : "off",
    cutoff: pickup && rule ? rule.cutoff : null,
    holidays: chain,
    local,
    starts: rules.find((r) => r.effective_from === day) ?? null,
  };
}

/** Lưới tháng `YYYY-MM`: các tuần, mỗi tuần 7 ngày từ thứ Hai (thói quen ở Việt Nam). */
export function monthGrid(
  month: string,
  rules: readonly CalendarRule[],
  holidays: readonly CalendarHoliday[],
  today: string,
): CalendarDay[][] {
  const first = `${month}-01`;
  const lead = (new Date(`${first}T00:00:00Z`).getUTCDay() + 6) % 7;
  const start = addDays(first, -lead);
  const weeks: CalendarDay[][] = [];
  let day = start;
  do {
    const week: CalendarDay[] = [];
    for (let i = 0; i < 7; i += 1) {
      week.push({ ...dayInfo(day, rules, holidays, today), inMonth: day.startsWith(month) });
      day = addDays(day, 1);
    }
    weeks.push(week);
  } while (day.startsWith(month));
  return weeks;
}

/** Thời điểm (ms) của giờ `HH:mm` giờ Việt Nam trong ngày `day`, lệch thêm `minutes` phút. */
function vnAt(day: string, time: string, minutes = 0): number {
  return Date.parse(`${day}T${time}:00+07:00`) + minutes * 60_000;
}

/**
 * Ví dụ ngày giao cho đơn đặt trong ngày `day` (giao `minDays`–`maxDays` ngày làm việc): `before`
 * là đơn đặt trước giờ chốt (rỗng khi hãng không lấy ngày đó), `after` là đơn đặt sau giờ chốt
 * (hay bất kỳ lúc nào trong ngày không lấy hàng).
 */
export function dayPlan(
  day: string,
  rules: readonly CalendarRule[],
  holidays: readonly CalendarHoliday[],
  minDays = 1,
  maxDays = 2,
): {
  cutoff: string | null;
  before: ReturnType<typeof etaFor> | null;
  after: ReturnType<typeof etaFor> | null;
} {
  const rule = ruleAt(rules, day);
  if (!rule) return { cutoff: null, before: null, after: null };
  const calendar = chainCalendar(rule, holidays);
  const pickup = isWorkday(day, calendar);
  return {
    cutoff: rule.cutoff,
    before: pickup ? etaFor(vnAt(day, rule.cutoff, -1), calendar, minDays, maxDays) : null,
    after: etaFor(vnAt(day, rule.cutoff, pickup ? 1 : 0), calendar, minDays, maxDays),
  };
}

// ---------------------------------------------------------------- Định dạng

const utc = (day: string) => new Date(`${day}T00:00:00Z`);

/** "19/11" — ngày trước tháng, chữ số theo ngôn ngữ (Intl). */
export function dayMonth(day: string, locale: string): string {
  const parts = new Intl.DateTimeFormat(locale, {
    day: "2-digit",
    month: "2-digit",
    timeZone: "UTC",
  }).formatToParts(utc(day));
  const part = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return `${part("day")}/${part("month")}`;
}

/** "19/11/2026" (cột ngày của bảng). */
export function fullDay(day: string, locale: string): string {
  const year = new Intl.DateTimeFormat(locale, { year: "numeric", timeZone: "UTC" }).format(
    utc(day),
  );
  return `${dayMonth(day, locale)}/${year}`;
}

/** "Thu 19/11" / "Th 5 19/11". */
export function shortDay(day: string, locale: string): string {
  const weekday = new Intl.DateTimeFormat(locale, { weekday: "short", timeZone: "UTC" }).format(
    utc(day),
  );
  return `${weekday} ${dayMonth(day, locale)}`;
}

/** "Thursday 19/11/2026" / "Thứ Năm 19/11/2026". */
export function longDay(day: string, locale: string): string {
  const weekday = new Intl.DateTimeFormat(locale, { weekday: "long", timeZone: "UTC" }).format(
    utc(day),
  );
  const cap = weekday.charAt(0).toLocaleUpperCase(locale) + weekday.slice(1);
  return `${cap} ${fullDay(day, locale)}`;
}

/** "November 2026" / "Tháng 11 năm 2026". */
export function monthTitle(month: string, locale: string): string {
  const text = new Intl.DateTimeFormat(locale, {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(utc(`${month}-01`));
  return text.charAt(0).toLocaleUpperCase(locale) + text.slice(1);
}

/** Tên ngắn bảy ngày trong tuần, từ thứ Hai. */
export function weekdayNames(locale: string, style: "short" | "narrow" = "short"): string[] {
  // 2024-01-01 là thứ Hai.
  return Array.from({ length: 7 }, (_, i) =>
    new Intl.DateTimeFormat(locale, { weekday: style, timeZone: "UTC" }).format(
      utc(addDays("2024-01-01", i)),
    ),
  );
}

/** Giờ "HH:mm" 24h (giờ chốt lưu sẵn dạng này; chuẩn hoá "9:05" → "09:05"). */
export function clock(time: string): string {
  const [h, m] = time.split(":");
  return `${(h ?? "0").padStart(2, "0")}:${(m ?? "0").padStart(2, "0")}`;
}

/** Các giờ chốt chọn được: 30 phút một nấc, 08:00 – 22:00, cộng giờ đang dùng nếu lệch nấc. */
export function cutoffChoices(current: string): string[] {
  const out: string[] = [];
  for (let m = 8 * 60; m <= 22 * 60; m += 30) {
    out.push(`${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`);
  }
  const now = clock(current);
  if (!out.includes(now)) out.push(now);
  return out.sort();
}
