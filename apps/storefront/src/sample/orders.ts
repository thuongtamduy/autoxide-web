// Đơn hàng phía người mua (mẫu, W-030): kiểu dữ liệu, đơn mẫu của tài khoản mẫu, mốc giao, hạn đổi trả.
// Dùng ở trang tài khoản, trang tra cứu đơn và trang "đặt hàng thành công".
//
// Thay bằng (bước 45): `GET /api/v1/orders/me/orders` · `GET /me/orders/{id}` (có tài khoản),
// `POST /api/v1/orders/public/orders/lookup` + `…/lookup/{id}/confirm` (tra đơn không cần tài khoản:
// OTP qua SMS → token xem đơn), `POST /me/orders/{id}/returns` (+ `/returns/preview`),
// `POST /me/orders/{id}/cancel`; vận đơn và mốc giao từ bước 44 (`shipping_tracking_events`).
//
// Mã đơn theo dạng của trang quản trị (`BM-<năm 2 số><tháng 2 số>-<4 số>`, `order-refs.ts`). Trang quản
// trị dùng tới BM-2611-0419; đơn của tài khoản mẫu lấy số sau đó (0420–0425) và đơn đặt trên website mẫu
// lấy tiếp từ 0426, nên không trùng đơn của trang quản trị. Ngày tính lùi từ lúc chạy (như trang quản
// trị) để hạn đổi trả, ngày giao luôn có nghĩa. Tên, số điện thoại là mẫu.
import type { ArtName, Tone } from "@/components/icon";
import type { StoreCode } from "./catalog";
import type { PaymentMethod } from "./checkout";
import type { Localized } from "./index";
import { offerBySku } from "./offers";
import { addWorkdays, vnDay } from "./shipping";

export type OrderStatus =
  | "pending_payment"
  | "confirmed"
  | "preparing"
  | "shipping"
  | "ready_for_pickup"
  | "delivered"
  | "completed"
  | "cancelled";

export interface OrderLine {
  sku: string;
  names: Localized;
  option: Localized | null;
  art: ArtName;
  tone: Tone;
  quantity: number;
  /** Đơn giá × số lượng, gồm thuế. */
  amount: number;
  discount: number;
}

export type TimelineKey =
  | "placed"
  | "paid"
  | "confirmed"
  | "preparing"
  | "shipping"
  | "ready"
  | "delivered"
  | "picked_up";

export interface BuyerOrder {
  number: string;
  /** Lần đặt hàng (một lần thanh toán có thể tách thành nhiều đơn theo nơi bán). */
  checkout: string;
  /** `null` = Bếp Mộc bán. */
  seller: string | null;
  placed_at: string;
  status: OrderStatus;
  payment_method: PaymentMethod;
  paid: boolean;
  lines: OrderLine[];
  goods: number;
  discount: number;
  shipping: number;
  points_value: number;
  total: number;
  contact: { name: string; phone: string; email: string };
  delivery:
    | { kind: "ship"; street: string; ward: Localized; province: Localized }
    | { kind: "pickup"; store: StoreCode; pickup_code: string | null };
  eta: [string, string] | null;
  /** Mốc đã qua, theo thứ tự. */
  events: { key: TimelineKey; at: string }[];
  tracking: { carrier: string; number: string } | null;
  delivered_at: string | null;
  invoice: { tax_code: string; company: string } | null;
  /** Nội dung chuyển khoản VietQR (đối tác thu hộ), `null` với cách trả khác. */
  payment_ref: string | null;
  /** Hạn thanh toán (VietQR, thẻ); quá hạn thì đơn tự huỷ. */
  pay_until: string | null;
}

/** Số ngày đổi trả tính từ ngày nhận (`orders_policies.return_window_days`). */
export const RETURN_DAYS = 7;

/** Số điện thoại của tài khoản mẫu (gợi ý ở trang tra cứu và đăng nhập). */
export const SAMPLE_PHONE = "0901234567";
/** Số lần nhập mã OTP sai trước khi phải chờ (trang tra cứu). */
export const LOOKUP_ATTEMPTS = 5;
/** Mã OTP mẫu: core thật gửi qua SMS (bước 37). */
export const SAMPLE_OTP = "246810";

const HOUR = 3_600_000;
const DAY = 86_400_000;

function line(sku: string, quantity: number, discount = 0): OrderLine {
  const offer = offerBySku(sku);
  return {
    sku,
    names: offer?.names ?? { vi: sku, en: sku },
    option: offer?.option ?? null,
    art: offer?.art ?? "bowl",
    tone: offer?.tone ?? "t1",
    quantity,
    amount: (offer?.price ?? 0) * quantity,
    discount,
  };
}

const LAN_CHI = { name: "Lan Chi", phone: SAMPLE_PHONE, email: "lanchi@example.com" };
const HOME = {
  kind: "ship" as const,
  street: "[Số nhà, đường mẫu]",
  ward: { vi: "Phường Bến Thành", en: "Bến Thành Ward" },
  province: { vi: "TP. Hồ Chí Minh", en: "Ho Chi Minh City" },
};

function totals(lines: OrderLine[], shipping: number) {
  const goods = lines.reduce((sum, l) => sum + l.amount, 0);
  const discount = lines.reduce((sum, l) => sum + l.discount, 0);
  return { goods, discount, shipping, points_value: 0, total: goods - discount + shipping };
}

/** Đơn của tài khoản mẫu "Lan Chi", mới nhất trước. `now` để tính ngày. */
export function sampleBuyerOrders(now: Date): BuyerOrder[] {
  const at = (offset: number) => new Date(now.getTime() + offset).toISOString();
  const today = vnDay(now);
  const l0424 = [line("CG26", 1), line("TG35", 1)];
  const l0425 = [line("GS-DIA26", 2)];
  const l0421 = [line("GS-AMLAM", 1)];
  const l0420 = [line("NI20", 1), line("CG26", 1)];
  const l0388 = [line("HT1L", 1)];
  return [
    {
      number: "BM-2611-0424",
      checkout: "ck-0424",
      seller: null,
      placed_at: at(-2 * HOUR),
      status: "confirmed",
      payment_method: "vietqr",
      paid: true,
      lines: l0424,
      ...totals(l0424, 30_000),
      contact: LAN_CHI,
      delivery: HOME,
      eta: [addWorkdays(today, 1), addWorkdays(today, 2)],
      events: [
        { key: "placed", at: at(-2 * HOUR) },
        { key: "paid", at: at(-2 * HOUR + 4 * 60_000) },
        { key: "confirmed", at: at(-HOUR) },
      ],
      tracking: null,
      delivered_at: null,
      invoice: null,
      payment_ref: "AX7K2M9Q4D",
      pay_until: null,
    },
    {
      number: "BM-2611-0425",
      checkout: "ck-0424",
      seller: "gom-su-bat-trang-xua",
      placed_at: at(-2 * HOUR),
      status: "confirmed",
      payment_method: "vietqr",
      paid: true,
      lines: l0425,
      ...totals(l0425, 30_000),
      contact: LAN_CHI,
      delivery: HOME,
      eta: [addWorkdays(today, 2), addWorkdays(today, 4)],
      events: [
        { key: "placed", at: at(-2 * HOUR) },
        { key: "paid", at: at(-2 * HOUR + 4 * 60_000) },
        { key: "confirmed", at: at(-HOUR / 2) },
      ],
      tracking: null,
      delivered_at: null,
      invoice: null,
      payment_ref: "AX7K2M9Q4D",
      pay_until: null,
    },
    {
      number: "BM-2611-0421",
      checkout: "ck-0421",
      seller: "gom-su-bat-trang-xua",
      placed_at: at(-3 * DAY),
      status: "shipping",
      payment_method: "card",
      paid: true,
      lines: l0421,
      ...totals(l0421, 30_000),
      contact: LAN_CHI,
      delivery: HOME,
      eta: [addWorkdays(today, 0), addWorkdays(today, 1)],
      events: [
        { key: "placed", at: at(-3 * DAY) },
        { key: "paid", at: at(-3 * DAY + 60_000) },
        { key: "confirmed", at: at(-3 * DAY + 2 * HOUR) },
        { key: "preparing", at: at(-2 * DAY) },
        { key: "shipping", at: at(-DAY) },
      ],
      tracking: { carrier: "Vận Tải Ba Miền", number: "VTBM-26110421" },
      delivered_at: null,
      invoice: null,
      payment_ref: null,
      pay_until: null,
    },
    {
      number: "BM-2611-0420",
      checkout: "ck-0420",
      seller: null,
      placed_at: at(-6 * DAY),
      status: "delivered",
      payment_method: "cod",
      paid: true,
      lines: l0420,
      ...totals(l0420, 0),
      contact: LAN_CHI,
      delivery: HOME,
      eta: null,
      events: [
        { key: "placed", at: at(-6 * DAY) },
        { key: "confirmed", at: at(-6 * DAY + HOUR) },
        { key: "preparing", at: at(-6 * DAY + 3 * HOUR) },
        { key: "shipping", at: at(-5 * DAY) },
        { key: "delivered", at: at(-4 * DAY) },
      ],
      tracking: { carrier: "Giao Nhanh Sài Gòn", number: "GNSG-26110420" },
      delivered_at: at(-4 * DAY),
      invoice: { tax_code: "[MÃ SỐ THUẾ]", company: "[Tên công ty mẫu]" },
      payment_ref: null,
      pay_until: null,
    },
    {
      number: "BM-2610-0388",
      checkout: "ck-0388",
      seller: null,
      placed_at: at(-16 * DAY),
      status: "completed",
      payment_method: "cod",
      paid: true,
      lines: l0388,
      ...totals(l0388, 0),
      contact: LAN_CHI,
      delivery: { kind: "pickup", store: "q3", pickup_code: null },
      eta: null,
      events: [
        { key: "placed", at: at(-16 * DAY) },
        { key: "confirmed", at: at(-16 * DAY + 20 * 60_000) },
        { key: "preparing", at: at(-16 * DAY + HOUR) },
        { key: "ready", at: at(-16 * DAY + 2 * HOUR) },
        { key: "picked_up", at: at(-16 * DAY + 5 * HOUR) },
      ],
      tracking: null,
      delivered_at: at(-16 * DAY + 5 * HOUR),
      invoice: null,
      payment_ref: null,
      pay_until: null,
    },
  ];
}

/** Các mốc của một đơn: mốc đã qua có giờ, mốc chưa tới để trống. */
export function timeline(order: BuyerOrder): { key: TimelineKey; at: string | null }[] {
  const pickup = order.delivery.kind === "pickup";
  const keys: TimelineKey[] = [
    "placed",
    ...(order.payment_method === "cod" ? [] : (["paid"] as const)),
    "confirmed",
    "preparing",
    pickup ? "ready" : "shipping",
    pickup ? "picked_up" : "delivered",
  ];
  return keys.map((key) => ({ key, at: order.events.find((e) => e.key === key)?.at ?? null }));
}

/** Hạn đổi trả: còn bao nhiêu ngày (0 = hết hạn), tới ngày nào; `null` khi chưa nhận hàng. */
export function returnWindow(
  order: BuyerOrder,
  now: Date,
): { days_left: number; until: string } | null {
  if (!order.delivered_at || order.status === "cancelled") return null;
  const until = new Date(Date.parse(order.delivered_at) + RETURN_DAYS * DAY);
  const left = Math.max(0, Math.ceil((until.getTime() - now.getTime()) / DAY));
  return { days_left: left, until: until.toISOString() };
}

/** Người mua tự huỷ được khi đơn chưa giao cho vận chuyển (`buyer_cancel_until`). */
export function cancellable(order: BuyerOrder): boolean {
  return ["pending_payment", "confirmed"].includes(order.status);
}

/** Che số điện thoại: "090•••4567". */
export function maskPhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.length < 7) return "•••";
  return `${digits.slice(0, 3)}•••${digits.slice(-4)}`;
}
