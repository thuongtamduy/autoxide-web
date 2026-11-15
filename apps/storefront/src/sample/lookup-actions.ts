"use server";

import { type FieldError, normalizePhone, PHONE } from "./checkout";
import { sampleDataEnabled } from "./index";
import { findOrder } from "./order-store";
import { type BuyerOrder, LOOKUP_ATTEMPTS, maskPhone, SAMPLE_OTP } from "./orders";

// Tra cứu đơn không cần tài khoản (mẫu, W-030): mã đơn + số điện thoại → mã OTP → xem đơn. Thay bằng
// `POST /api/v1/orders/public/orders/lookup {number, phone}` (core gửi OTP qua SMS, bước 37) và
// `POST …/lookup/{id}/confirm {code}` → token xem đơn (D-202), giới hạn số lần thử theo IP và theo đơn.
//
// Không lộ đơn nào có thật: bước một luôn trả "đã gửi mã" khi định dạng đúng; chỉ khi mã OTP đúng và
// mã đơn khớp số điện thoại mới trả đơn. Địa chỉ chỉ tới phường, số điện thoại đã che.

export interface LookupState {
  step: "form" | "otp" | "order";
  masked: string;
  errors: FieldError[];
  /** Số lần thử còn lại (mẫu: đếm trên form; core thật đếm ở máy chủ). */
  attempts: number;
  order: BuyerOrder | null;
}

const ORDER_NUMBER = /^BM-\d{4}-\d{4}$/;

export async function lookupOrder(previous: LookupState, form: FormData): Promise<LookupState> {
  const number = String(form.get("number") ?? "")
    .trim()
    .toUpperCase()
    .slice(0, 20);
  const phone = normalizePhone(String(form.get("phone") ?? "").slice(0, 30));
  if (form.get("step") !== "otp") {
    const errors: FieldError[] = [];
    if (!ORDER_NUMBER.test(number)) errors.push({ field: "number", code: "order_number_invalid" });
    if (!PHONE.test(phone)) errors.push({ field: "phone", code: "phone_invalid" });
    if (errors.length > 0) return { ...previous, step: "form", errors };
    return {
      step: "otp",
      masked: maskPhone(phone),
      errors: [],
      attempts: LOOKUP_ATTEMPTS,
      order: null,
    };
  }
  if (previous.attempts <= 0) {
    return { ...previous, attempts: 0, errors: [{ field: "otp", code: "otp_locked" }] };
  }
  const attempts = previous.attempts - 1;
  const otp = String(form.get("otp") ?? "").replace(/\D/g, "");
  const order =
    sampleDataEnabled() && otp === SAMPLE_OTP ? findOrder(number, phone, new Date()) : null;
  if (!order) {
    return {
      ...previous,
      step: "otp",
      attempts,
      errors: [
        attempts === 0
          ? { field: "otp", code: "otp_locked" }
          : { field: "otp", code: "otp_or_order_invalid", params: { left: attempts } },
      ],
    };
  }
  return {
    step: "order",
    masked: maskPhone(phone),
    errors: [],
    attempts,
    order: hideContact(order),
  };
}

/** Bản đơn cho người chưa đăng nhập: bỏ số nhà, che số điện thoại và email. */
function hideContact(order: BuyerOrder): BuyerOrder {
  return {
    ...order,
    contact: { name: order.contact.name, phone: maskPhone(order.contact.phone), email: "" },
    delivery: order.delivery.kind === "ship" ? { ...order.delivery, street: "" } : order.delivery,
    invoice: order.invoice ? { ...order.invoice, tax_code: "" } : null,
  };
}
