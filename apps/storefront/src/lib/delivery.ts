// Ước tính ngày giao trên trang sản phẩm (W-029): ngày cụ thể kèm giờ chốt đơn (ui-design mục 5,
// Baymard: 41% website không hiện ngày giao). Hàm thuần, tính theo giờ Việt Nam từ "bây giờ" truyền
// vào. Phí và số ngày theo tỉnh là dữ liệu mẫu (`sample/shipping.ts`), thay bằng báo giá vận chuyển
// của core (bước 44) khi có.
import { pad2, vietnamMidnight } from "./countdown";

const DAY = 86_400_000;
const HOUR = 3_600_000;
/** Giờ chốt đơn trong ngày (giờ Việt Nam): đặt trước giờ này thì tính từ hôm nay. */
export const CUTOFF_HOUR = 16;

export interface DeliveryWindow {
  /** Ngày sớm nhất và muộn nhất, mili giây UTC của 00:00 giờ Việt Nam ngày đó. */
  from: number;
  to: number;
  /** Phút còn lại tới giờ chốt hôm nay; `null` khi đã qua giờ chốt. */
  cutoffIn: number | null;
}

/** Cửa sổ giao hàng: `days` = [ít nhất, nhiều nhất] ngày làm việc tính từ ngày gửi. */
export function deliveryWindow(now: number, days: readonly [number, number]): DeliveryWindow {
  const today = vietnamMidnight(now);
  const cutoff = today + CUTOFF_HOUR * HOUR;
  const shipDay = now < cutoff ? today : today + DAY;
  return {
    from: shipDay + days[0] * DAY,
    to: shipDay + days[1] * DAY,
    cutoffIn: now < cutoff ? Math.ceil((cutoff - now) / 60_000) : null,
  };
}

/** Thứ trong tuần (0 = Chủ nhật) và "14/11" của một ngày (00:00 giờ Việt Nam). */
export function vietnamDay(at: number): { weekday: number; dayMonth: string } {
  const date = new Date(at + 7 * HOUR);
  return {
    weekday: date.getUTCDay(),
    dayMonth: `${pad2(date.getUTCDate())}/${pad2(date.getUTCMonth() + 1)}`,
  };
}

/** Phí giao sau khi xét mức miễn phí (`threshold`), và số tiền còn thiếu để được miễn phí. */
export function shippingFee(
  subtotal: number,
  fee: number,
  threshold: number,
): { fee: number; missing: number; progress: number } {
  const free = subtotal >= threshold;
  return {
    fee: free ? 0 : fee,
    missing: free ? 0 : threshold - subtotal,
    progress: Math.min(100, Math.round((subtotal / threshold) * 100)),
  };
}
