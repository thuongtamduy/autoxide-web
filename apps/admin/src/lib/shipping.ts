// Phần thuần (không gọi mạng) của màn "Vận chuyển" (module `shipping` của core, bước 44): permission
// dự kiến, cân tính phí, ngày giao dự kiến theo lịch (D-201 của core), che số điện thoại, đọc bảng kê
// COD. Dùng được cả ở máy chủ lẫn trình duyệt.

// Permission dự kiến theo đặc tả bước 44 (`Module::permissions`).
export const SHIPPING_READ = "shipping.read";
export const SHIPPING_SETTINGS_MANAGE = "shipping.settings.manage";
export const SHIPPING_CARRIERS_MANAGE = "shipping.carriers.manage";
export const SHIPPING_SHIPMENTS_READ = "shipping.shipments.read";
export const SHIPPING_SHIPMENTS_MANAGE = "shipping.shipments.manage";
export const SHIPPING_COD_MANAGE = "shipping.cod.manage";

const DAY = 86_400_000;
/** Giờ Việt Nam lệch UTC 7 giờ, không đổi giờ theo mùa. */
const VN = 7 * 3_600_000;

/**
 * Cân tính phí: số lớn hơn giữa tổng cân thật và tổng cân quy đổi (D × R × C cm³ / `divisor`, làm
 * tròn lên gram) — đặc tả bước 44, mục "Tính phí". Kích thước nhận bằng mm như cột của core.
 */
export function chargeableWeight(
  parcels: readonly {
    weight_grams: number;
    length_mm: number | null;
    width_mm: number | null;
    height_mm: number | null;
  }[],
  divisor = 6000,
): { actual: number; volumetric: number; chargeable: number } {
  let actual = 0;
  let volumetric = 0;
  for (const p of parcels) {
    actual += p.weight_grams;
    if (p.length_mm && p.width_mm && p.height_mm) {
      // cm³ / divisor ra kg; mm³ = cm³ × 1000 và kg = gram / 1000 bù nhau: gram = mm³ / divisor.
      volumetric += Math.ceil((p.length_mm * p.width_mm * p.height_mm) / divisor);
    }
  }
  return { actual, volumetric, chargeable: Math.max(actual, volumetric) };
}

/** Gram → "1,9 kg" / "320 g" theo ngôn ngữ. */
export function formatWeight(grams: number, locale: string): string {
  if (grams < 1000) return `${new Intl.NumberFormat(locale).format(grams)} g`;
  return `${new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(grams / 1000)} kg`;
}

/** Số điện thoại là dữ liệu cá nhân: danh sách chỉ hiện 3 số cuối. */
export function maskPhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.length < 4) return "•••";
  return `••• ••• ${digits.slice(-3)}`;
}

/** Ngày `YYYY-MM-DD` theo giờ Việt Nam của một thời điểm. */
export function vnDate(at: number): string {
  return new Date(at + VN).toISOString().slice(0, 10);
}

/** Thứ trong tuần (0 = Chủ nhật) của một ngày `YYYY-MM-DD`. */
export function weekday(day: string): number {
  return new Date(`${day}T00:00:00Z`).getUTCDay();
}

function nextDay(day: string): string {
  return new Date(Date.parse(`${day}T00:00:00Z`) + DAY).toISOString().slice(0, 10);
}

/** Lịch giao: giờ chốt (giờ Việt Nam), ngày làm việc trong tuần, ngày nghỉ. */
export interface DeliveryCalendar {
  /** "16:00": đơn đặt sau giờ này được lấy vào ngày làm việc kế tiếp. */
  cutoff: string;
  /** Ngày hãng lấy / giao hàng: 0 = Chủ nhật … 6 = thứ Bảy. */
  workdays: readonly number[];
  /** Khoảng ngày nghỉ (kể cả hai đầu), `YYYY-MM-DD`. */
  holidays: readonly { from: string; to: string }[];
}

export function isWorkday(day: string, calendar: DeliveryCalendar): boolean {
  if (!calendar.workdays.includes(weekday(day))) return false;
  return !calendar.holidays.some((h) => h.from <= day && day <= h.to);
}

/** Ngày làm việc thứ `n` sau `day` (n = 0: chính `day` nếu là ngày làm việc, không thì ngày kế). */
export function addWorkdays(day: string, n: number, calendar: DeliveryCalendar): string {
  let current = day;
  let guard = 0;
  while (!isWorkday(current, calendar) && guard < 60) {
    current = nextDay(current);
    guard += 1;
  }
  let left = n;
  while (left > 0 && guard < 400) {
    current = nextDay(current);
    guard += 1;
    if (isWorkday(current, calendar)) left -= 1;
  }
  return current;
}

/**
 * Ngày giao dự kiến dạng khoảng (`eta_from` / `eta_to`, ngày theo giờ Việt Nam): hãng lấy hàng hôm
 * nay nếu đặt trước giờ chốt và hôm nay là ngày làm việc, không thì ngày làm việc kế tiếp; rồi cộng
 * `minDays` / `maxDays` ngày làm việc. `order_by` là giờ chốt hôm nay nếu còn kịp.
 */
export function etaFor(
  orderedAt: number,
  calendar: DeliveryCalendar,
  minDays: number,
  maxDays: number,
): { pickup_date: string; eta_from: string; eta_to: string; order_by: string | null } {
  const today = vnDate(orderedAt);
  const [hh, mm] = calendar.cutoff.split(":").map(Number);
  const cutoffAt = Date.parse(`${today}T00:00:00Z`) - VN + ((hh ?? 0) * 60 + (mm ?? 0)) * 60_000;
  const inTime = orderedAt < cutoffAt && isWorkday(today, calendar);
  const pickup = inTime ? today : addWorkdays(nextDay(today), 0, calendar);
  return {
    pickup_date: pickup,
    eta_from: addWorkdays(pickup, minDays, calendar),
    eta_to: addWorkdays(pickup, maxDays, calendar),
    order_by: inTime ? new Date(cutoffAt).toISOString() : null,
  };
}

/** Một dòng bảng kê COD theo định dạng chung (cột `tracking_number`, `cod_amount`, `fee`). */
export interface StatementRow {
  tracking_number: string;
  cod: number;
  fee: number;
}

/**
 * Đọc bảng kê COD dán vào (CSV, dòng đầu là tên cột). Dòng sai ghi số dòng (tính cả dòng tiêu đề)
 * để báo. Tiền là số nguyên đồng, bỏ dấu ngăn nghìn.
 */
export function parseStatement(text: string): {
  rows: StatementRow[];
  bad: number[];
  missing: string[];
} {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  const header = (lines[0] ?? "").split(",").map((h) => h.trim().toLowerCase());
  const need = ["tracking_number", "cod_amount", "fee"];
  const missing = need.filter((n) => !header.includes(n));
  if (missing.length > 0) return { rows: [], bad: [], missing };
  const at = (name: string) => header.indexOf(name);
  const rows: StatementRow[] = [];
  const bad: number[] = [];
  lines.slice(1).forEach((line, index) => {
    const cells = line.split(",").map((c) => c.trim());
    const tracking = cells[at("tracking_number")] ?? "";
    const cod = (cells[at("cod_amount")] ?? "").replace(/[.\s_]/g, "");
    const fee = (cells[at("fee")] ?? "").replace(/[.\s_]/g, "");
    if (!tracking || !/^\d{1,12}$/.test(cod) || !/^\d{1,12}$/.test(fee)) {
      bad.push(index + 2);
      return;
    }
    rows.push({ tracking_number: tracking, cod: Number(cod), fee: Number(fee) });
  });
  return { rows, bad, missing };
}
