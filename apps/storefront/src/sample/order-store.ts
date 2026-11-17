import "server-only";

import { randomBytes } from "node:crypto";
import { provinceByCode, wardByCode } from "./address";
import { isStoreCode } from "./catalog";
import type { CheckoutForm, Quote } from "./checkout";
import { type BuyerOrder, sampleBuyerOrders } from "./orders";
import { vnDay } from "./shipping";

// Kho đơn đặt trên website mẫu (W-030): bộ nhớ của tiến trình máy chủ Next.js, như kho mẫu của trang
// quản trị — khởi động lại thì mất. Thay bằng `POST /api/v1/orders/checkout` của core (bước 45): core
// giữ đơn, giữ hàng, gọi đối tác thanh toán và trả `{orders[], payment_actions[]}`.
//
// Đặt hàng an toàn khi gửi lại (agent và người hay bấm hai lần): mỗi lần mở trang đặt hàng có một
// `Idempotency-Key`; cùng khoá thì trả đúng kết quả cũ, không tạo đơn thứ hai — như header bắt buộc
// của `POST /checkout`.

const MAX_ORDERS = 500;
const FIRST_NUMBER = 426;

interface Store {
  next: number;
  orders: Map<string, BuyerOrder>;
  byKey: Map<string, string[]>;
}

// `globalThis` giữ kho qua các lần nạp lại module khi chạy `next dev`.
const holder = globalThis as unknown as { __sfOrders?: Store };
function store(): Store {
  holder.__sfOrders ??= { next: FIRST_NUMBER, orders: new Map(), byKey: new Map() };
  return holder.__sfOrders;
}

/** Nội dung chuyển khoản: 10 ký tự chữ hoa và số (không có 0/O, 1/I để khỏi gõ nhầm). */
function paymentRef(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  return [...randomBytes(10)].map((byte) => alphabet[byte % alphabet.length]).join("");
}

export interface PlaceInput {
  key: string;
  form: CheckoutForm;
  quote: Quote;
  now: Date;
}

/** Tạo một đơn cho mỗi nơi bán của báo giá; cùng `key` thì trả mã đơn cũ. */
export function placeOrders(input: PlaceInput): { numbers: string[]; replayed: boolean } {
  const s = store();
  const previous = s.byKey.get(input.key);
  if (previous) return { numbers: previous, replayed: true };
  const { form, quote, now } = input;
  const placedAt = now.toISOString();
  const prefix = `BM-${vnDay(now).slice(2, 4)}${vnDay(now).slice(5, 7)}`;
  const checkout = `ck-${randomBytes(6).toString("hex")}`;
  const online = form.payment !== "cod";
  const ref = form.payment === "vietqr" ? paymentRef() : null;
  const province = provinceByCode(form.province);
  const ward = wardByCode(form.province, form.ward);
  const numbers: string[] = [];
  // Điểm chỉ trừ vào đơn Bếp Mộc (`LOYALTY`): đơn của người bán giữ nguyên tổng.
  for (const group of quote.groups) {
    const number = `${prefix}-${String(s.next).padStart(4, "0")}`;
    s.next += 1;
    const points = group.seller === null ? quote.points_value : 0;
    const pickup = group.seller === null && form.delivery === "pickup";
    const order: BuyerOrder = {
      number,
      checkout,
      seller: group.seller,
      placed_at: placedAt,
      status: online ? "pending_payment" : "confirmed",
      payment_method: form.payment || "cod",
      paid: false,
      lines: group.lines.map((l) => ({
        sku: l.sku,
        names: l.offer.names,
        option: l.offer.option,
        art: l.offer.art,
        tone: l.offer.tone,
        quantity: l.quantity,
        amount: l.amount,
        discount: l.discount,
      })),
      goods: group.goods,
      discount: group.discount,
      shipping: group.shipping ?? 0,
      points_value: points,
      total: group.total - points,
      contact: {
        name: form.name.trim(),
        phone: form.phone.replace(/\D/g, ""),
        email: form.email.trim(),
      },
      delivery: pickup
        ? {
            kind: "pickup",
            store: isStoreCode(form.pickup_store) ? form.pickup_store : "q3",
            pickup_code: null,
          }
        : {
            kind: "ship",
            street: form.street.trim(),
            ward: form.ward_name
              ? { vi: form.ward_name, en: form.ward_name }
              : (ward?.name ?? { vi: "", en: "" }),
            province: form.province_name
              ? { vi: form.province_name, en: form.province_name }
              : (province?.name ?? { vi: "", en: "" }),
          },
      eta: group.eta,
      events: [{ key: "placed", at: placedAt }],
      tracking: null,
      delivered_at: null,
      invoice: form.invoice
        ? { tax_code: form.tax_code.trim(), company: form.company.trim() }
        : null,
      payment_ref: ref,
      pay_until: online ? new Date(now.getTime() + 15 * 60_000).toISOString() : null,
    };
    if (!online) order.events.push({ key: "confirmed", at: placedAt });
    s.orders.set(number, order);
    numbers.push(number);
  }
  s.byKey.set(input.key, numbers);
  // Giữ kho nhỏ: bỏ đơn cũ nhất.
  while (s.orders.size > MAX_ORDERS) {
    const oldest = s.orders.keys().next().value;
    if (oldest === undefined) break;
    s.orders.delete(oldest);
  }
  return { numbers, replayed: false };
}

/** Mã đơn đã tạo cho một `Idempotency-Key`; `null` khi khoá chưa dùng. */
export function ordersForKey(key: string): string[] | null {
  return store().byKey.get(key) ?? null;
}

/** Đơn đã đặt trên website mẫu theo mã. */
export function placedOrder(number: string): BuyerOrder | null {
  return store().orders.get(number) ?? null;
}

/**
 * Mẫu: người mua báo đã trả (VietQR) hay đối tác báo đã thanh toán (thẻ) — core thật nhận tin này từ
 * webhook của đối tác (bước 36/45), không bao giờ từ người mua.
 */
export function markPaid(number: string, now: Date): BuyerOrder | null {
  const order = store().orders.get(number);
  if (order?.status !== "pending_payment") return order ?? null;
  const at = now.toISOString();
  order.paid = true;
  order.status = "confirmed";
  order.events.push({ key: "paid", at }, { key: "confirmed", at });
  // Mọi đơn cùng lần thanh toán đổi cùng lúc.
  for (const other of store().orders.values()) {
    if (other.checkout === order.checkout && other.status === "pending_payment") {
      other.paid = true;
      other.status = "confirmed";
      other.events.push({ key: "paid", at }, { key: "confirmed", at });
    }
  }
  return order;
}

/** Tìm đơn cho trang tra cứu: đơn mẫu của tài khoản mẫu và đơn đặt trên website, khớp cả số điện thoại. */
export function findOrder(number: string, phone: string, now: Date): BuyerOrder | null {
  const key = number.trim().toUpperCase();
  const digits = phone.replace(/\D/g, "");
  const order = placedOrder(key) ?? sampleBuyerOrders(now).find((o) => o.number === key) ?? null;
  return order && order.contact.phone === digits ? order : null;
}
