// Hàm thuần cho biểu đồ (W-054 đợt biểu đồ): dãy ngày, gom theo ngày, trục số "tròn", phần trăm thay
// đổi, đường SVG và định dạng số theo ngôn ngữ. Không phụ thuộc React, chạy được ở máy chủ và trình duyệt.

const DAY_MS = 86_400_000;

/** Ngày lịch `YYYY-MM-DD` cộng `days` ngày (âm là lùi). */
export function shiftDay(day: string, days: number): string {
  return new Date(Date.parse(`${day}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);
}

/** Mọi ngày từ `from` tới `to` (gồm cả hai đầu); rỗng khi `to` trước `from`. Tối đa 366 ngày. */
export function dayRange(from: string, to: string): string[] {
  const days: string[] = [];
  for (let day = from; day <= to && days.length < 366; day = shiftDay(day, 1)) days.push(day);
  return days;
}

/** Kỳ `days` ngày kết thúc ở `today` và kỳ liền trước cùng độ dài (để so). */
export function periodWithPrevious(
  today: string,
  days: number,
): { current: string[]; previous: string[] } {
  const from = shiftDay(today, -(days - 1));
  return {
    current: dayRange(from, today),
    previous: dayRange(shiftDay(from, -days), shiftDay(from, -1)),
  };
}

/** Kỳ `days` ngày kết thúc ở `today` (mốc chọn nhanh 7/30/90 ngày). */
export function presetRange(today: string, days: number): { from: string; to: string } {
  return { from: shiftDay(today, -(days - 1)), to: today };
}

/** Cộng giá trị theo ngày, đúng thứ tự `days`; ngày không có điểm nào là 0, điểm ngoài kỳ bị bỏ. */
export function sumByDay(
  points: readonly { day: string; value: number }[],
  days: readonly string[],
): number[] {
  const index = new Map(days.map((day, i) => [day, i]));
  const out = days.map(() => 0);
  for (const point of points) {
    const i = index.get(point.day);
    if (i !== undefined) out[i] = (out[i] ?? 0) + point.value;
  }
  return out;
}

/** Như `sumByDay` nhưng tách theo khoá: mỗi khoá trong `keys` một dãy. */
export function sumByDayAndKey(
  points: readonly { day: string; key: string; value: number }[],
  days: readonly string[],
  keys: readonly string[],
): Map<string, number[]> {
  const out = new Map(keys.map((key) => [key, days.map(() => 0)]));
  const index = new Map(days.map((day, i) => [day, i]));
  for (const point of points) {
    const row = out.get(point.key);
    const i = index.get(point.day);
    if (row && i !== undefined) row[i] = (row[i] ?? 0) + point.value;
  }
  return out;
}

/**
 * Phần trăm thay đổi từ `previous` tới `current` (12.5 = tăng 12,5%). `null` khi kỳ trước bằng 0: không
 * chia cho 0 và không bịa "tăng vô hạn".
 */
export function percentChange(current: number, previous: number): number | null {
  if (previous === 0) return null;
  return ((current - previous) / Math.abs(previous)) * 100;
}

/**
 * Vạch trục Y "tròn" từ 0 (0, 1, 2, 2.5, 5 nhân luỹ thừa 10) để vạch trên cùng ≥ `max`. Khoảng
 * `count` khoảng (mặc định 4). Mọi giá trị 0 hay âm cho ra [0, 1].
 */
export function niceTicks(max: number, count = 4): number[] {
  if (!(max > 0)) return [0, 1];
  // Cho phép tới `count + 1` khoảng để vạch trên cùng sát giá trị lớn nhất (4,2 Tr → 5 Tr, không phải 6 Tr).
  const raw = max / (count + 1);
  const power = 10 ** Math.floor(Math.log10(raw));
  const step = ([1, 2, 2.5, 5, 10].find((m) => m * power >= raw) ?? 10) * power;
  const steps = Math.max(1, Math.ceil(max / step - 1e-9));
  const ticks = [...Array(steps + 1).keys()].map((i) => Number((i * step).toPrecision(12)));
  return ticks;
}

/** Vị trí theo % ngang của điểm thứ `i` trong `n` điểm (đường: từ mép trái tới mép phải). */
export function xAt(i: number, n: number): number {
  return n <= 1 ? 50 : (i / (n - 1)) * 100;
}

/** Vị trí theo % dọc (0 ở trên) của giá trị trên trục 0…`top`. */
export function yAt(value: number, top: number): number {
  if (!(top > 0)) return 100;
  return 100 - (Math.max(0, Math.min(value, top)) / top) * 100;
}

/** Đường gấp khúc trong khung 0…100 × 0…100 (viewBox của biểu đồ). */
export function linePath(values: readonly number[], top: number): string {
  return values
    .map((v, i) => `${i === 0 ? "M" : "L"}${round(xAt(i, values.length))},${round(yAt(v, top))}`)
    .join(" ");
}

/** Vùng dưới đường (khép về đáy), cho nền nhạt của chuỗi chính. */
export function areaPath(values: readonly number[], top: number): string {
  if (values.length === 0) return "";
  const n = values.length;
  return `${linePath(values, top)} L${round(xAt(n - 1, n))},100 L${round(xAt(0, n))},100 Z`;
}

function round(n: number): number {
  return Math.round(n * 100) / 100;
}

export type ChartUnit = "money" | "count" | "percent";

/**
 * Số đầy đủ cho bảng và tooltip: tiền theo `formatMoney` (VND "590.000 ₫"), số đếm có ngăn nghìn,
 * phần trăm với `value` là số phần trăm (2.5 → "2,5%").
 */
export function formatValue(value: number, unit: ChartUnit, locale: string, currency = "VND") {
  if (unit === "percent") {
    return new Intl.NumberFormat(locale, { style: "percent", maximumFractionDigits: 1 }).format(
      value / 100,
    );
  }
  if (unit === "money" && currency === "VND") {
    return `${new Intl.NumberFormat(locale, { maximumFractionDigits: 0 }).format(value)} ₫`;
  }
  if (unit === "money") {
    return new Intl.NumberFormat(locale, { style: "currency", currency }).format(value);
  }
  return new Intl.NumberFormat(locale).format(value);
}

/** Số gọn cho vạch trục ("12 Tr", "12M"): một kiểu cho cả trục; dưới 10.000 viết đủ. */
export function formatTick(value: number, unit: ChartUnit, locale: string, top: number): string {
  if (unit === "percent") {
    return new Intl.NumberFormat(locale, { style: "percent", maximumFractionDigits: 1 }).format(
      value / 100,
    );
  }
  if (top < 10_000) return new Intl.NumberFormat(locale).format(value);
  return new Intl.NumberFormat(locale, { notation: "compact", maximumFractionDigits: 1 }).format(
    value,
  );
}

/** Phần trăm thay đổi có dấu ("+12,5%", "−3%"). */
export function formatChange(change: number, locale: string): string {
  const text = new Intl.NumberFormat(locale, {
    style: "percent",
    maximumFractionDigits: 1,
    signDisplay: "exceptZero",
  }).format(change / 100);
  return text.replace("-", "−");
}

/** Một mốc trên trục X: khoá, nhãn ngắn trên trục, nhãn đầy đủ trong tooltip và bảng. */
export interface XPoint {
  key: string;
  short: string;
  long: string;
}

/** Mốc theo ngày lịch (`YYYY-MM-DD`, không theo múi giờ của máy). */
export function dayPoints(days: readonly string[], locale: string): XPoint[] {
  const short = new Intl.DateTimeFormat(locale, {
    day: "numeric",
    month: "numeric",
    timeZone: "UTC",
  });
  const long = new Intl.DateTimeFormat(locale, {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
  return days.map((day) => {
    const at = new Date(`${day}T00:00:00Z`);
    return { key: day, short: short.format(at), long: long.format(at) };
  });
}

/** Mốc theo giờ (ISO UTC), hiện theo giờ `timeZone`. */
export function hourPoints(hours: readonly string[], locale: string, timeZone: string): XPoint[] {
  const short = new Intl.DateTimeFormat(locale, {
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    timeZone,
  });
  const long = new Intl.DateTimeFormat(locale, {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    timeZone,
  });
  return hours.map((iso) => {
    const at = new Date(iso);
    return { key: iso, short: short.format(at), long: long.format(at) };
  });
}

/** Chỉ số các mốc ghi nhãn trên trục X: tối đa `max` mốc, cách đều, luôn có mốc đầu và cuối. */
export function labelIndexes(n: number, max = 6): number[] {
  if (n <= 0) return [];
  if (n <= max) return [...Array(n).keys()];
  const step = Math.ceil((n - 1) / (max - 1));
  const out: number[] = [];
  for (let i = 0; i < n - 1; i += step) out.push(i);
  // Mốc áp chót quá gần mốc cuối thì bỏ để nhãn không đè nhau.
  if (out.length > 1 && n - 1 - (out.at(-1) ?? 0) < step / 2) out.pop();
  out.push(n - 1);
  return out;
}
