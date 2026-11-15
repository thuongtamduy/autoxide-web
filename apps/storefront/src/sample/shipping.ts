// Phí giao và ngày giao dự kiến (mẫu, W-030). Hàm thuần, chạy được cả trên trình duyệt (ô tổng tiền
// tính lại ngay khi đổi tỉnh).
//
// Thay bằng (bước 44): báo giá vận chuyển nằm trong báo giá của giỏ `GET /api/v1/orders/carts/{id}`
// (bước 45 gọi `ShippingQuotes` của bước 44: `ShippingOption { amount, eta, free_shipping_applied }`)
// sau `PUT /carts/{id}/delivery`; trang sản phẩm dùng `GET /api/v1/shipping/public/estimate`.
//
// Nguồn: `apps/admin/src/sample/shipping.ts` — phương thức `standard` (bảng phí theo vùng và cân,
// miễn phí từ 1.000.000 ₫; CN Cầu Giấy ghi đè vùng Hà Nội 35.000 ₫), nhận tại cửa hàng (chuẩn bị 2 giờ),
// lịch giao: chốt đơn 16:00, hãng lấy hàng thứ Hai – thứ Bảy, giao 1–3 ngày.
import type { StoreCode } from "./catalog";

/** Vùng giao của Trụ sở: tỉnh ghi riêng thắng vùng "cả nước". */
const ZONES: readonly { id: string; provinces: readonly string[] | null }[] = [
  { id: "hcm", provinces: ["79"] },
  { id: "hanoi", provinces: ["01"] },
  { id: "south", provinces: ["75", "92"] },
  { id: "nation", provinces: null },
];

interface Rate {
  zone: string;
  min: number;
  max: number | null;
  amount: number;
  step: readonly [number, number] | null;
}

function table(hanoi: number): Rate[] {
  return [
    { zone: "hcm", min: 0, max: 2000, amount: 30_000, step: null },
    { zone: "hcm", min: 2000, max: null, amount: 30_000, step: [500, 5_000] },
    { zone: "hanoi", min: 0, max: 2000, amount: hanoi, step: null },
    { zone: "hanoi", min: 2000, max: null, amount: hanoi, step: [500, 5_000] },
    { zone: "south", min: 0, max: 2000, amount: 35_000, step: null },
    { zone: "south", min: 2000, max: null, amount: 35_000, step: [500, 5_000] },
    { zone: "nation", min: 0, max: 2000, amount: 45_000, step: null },
    { zone: "nation", min: 2000, max: 20_000, amount: 60_000, step: [500, 8_000] },
  ];
}

const HQ_RATES = table(40_000);
const CAU_GIAY_RATES = table(35_000);

/** Ngưỡng miễn phí giao của Bếp Mộc (tiền hàng sau giảm). */
export const FREE_SHIPPING_OVER = 1_000_000;
/** Trên ngưỡng cân này phương thức tiêu chuẩn không nhận (bảng "cả nước" dừng ở 20 kg). */
export const MAX_PARCEL_GRAMS = 20_000;

export function zoneOf(province: string): string {
  return (
    ZONES.find((zone) => zone.provinces?.includes(province))?.id ??
    ZONES.find((zone) => zone.provinces === null)?.id ??
    "nation"
  );
}

/**
 * Phí giao tiêu chuẩn của Bếp Mộc cho một kiện `grams` tới `province`, bán từ cửa hàng `store`
 * (bậc chứa cân, cộng bước vượt — như `rateFor` của trang quản trị). `null` khi không có bậc (quá cân).
 */
export function standardFee(province: string, grams: number, store: StoreCode): number | null {
  const rates = store === "cg" ? CAU_GIAY_RATES : HQ_RATES;
  const zone = zoneOf(province);
  const rate = rates.find(
    (r) => r.zone === zone && r.min <= grams && (r.max === null || grams < r.max),
  );
  if (!rate) return null;
  const over = grams - rate.min;
  const steps = rate.step && over > 0 ? Math.ceil(over / rate.step[0]) : 0;
  return rate.amount + steps * (rate.step?.[1] ?? 0);
}

// ---------------------------------------------------------------- Ngày giao

const VN_OFFSET_MS = 7 * 3_600_000;
const DAY_MS = 86_400_000;
const CUTOFF_HOUR = 16;

/** Ngày theo giờ Việt Nam, `YYYY-MM-DD`. */
export function vnDay(now: Date): string {
  return new Date(now.getTime() + VN_OFFSET_MS).toISOString().slice(0, 10);
}

function addDays(day: string, n: number): string {
  return new Date(Date.parse(`${day}T00:00:00Z`) + n * DAY_MS).toISOString().slice(0, 10);
}

function isWorkday(day: string): boolean {
  return new Date(`${day}T00:00:00Z`).getUTCDay() !== 0;
}

/** `n` ngày làm việc (thứ Hai – thứ Bảy) sau `day`. */
export function addWorkdays(day: string, n: number): string {
  let current = day;
  let left = n;
  while (left > 0) {
    current = addDays(current, 1);
    if (isWorkday(current)) left -= 1;
  }
  return current;
}

/** Khoảng ngày giao dự kiến `[từ, tới]` (`YYYY-MM-DD`), đặt lúc `now`: qua giờ chốt thì tính từ hôm sau. */
export function deliveryWindow(now: Date, days: readonly [number, number]): [string, string] {
  const hour = new Date(now.getTime() + VN_OFFSET_MS).getUTCHours();
  const start = hour >= CUTOFF_HOUR ? addDays(vnDay(now), 1) : vnDay(now);
  return [addWorkdays(start, days[0]), addWorkdays(start, days[1])];
}

/** Số ngày giao của phương thức tiêu chuẩn (bản ghi `estimated_min_days`, `estimated_max_days`). */
export const STANDARD_DAYS: readonly [number, number] = [1, 3];
/** Giờ chuẩn bị hàng khi nhận tại cửa hàng (`shipping_pickup_points.prep_hours`). */
export const PICKUP_PREP_HOURS = 2;
/** Số ngày cửa hàng giữ hàng chờ nhận. */
export const PICKUP_HOLD_DAYS = 3;
