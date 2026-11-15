"use server";

import { cookies } from "next/headers";
import { redirect } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";
import { routes } from "@/lib/routes";
import { BUYER_COOKIE, SAMPLE_BUYER, serializeBuyer } from "./account";
import {
  ACCOUNT_COOKIE,
  buyerOrders,
  readAccountState,
  readBuyer,
  serializeAccountState,
} from "./buyer-server";
import { type FieldError, normalizePhone, PHONE } from "./checkout";
import { sampleDataEnabled } from "./index";
import { cancellable, maskPhone, returnWindow, SAMPLE_OTP } from "./orders";

// Server Action của trang tài khoản (mẫu, W-030). Đăng nhập người mua là bước sau của core: ở đây chỉ
// có luồng mẫu "số điện thoại → mã OTP" (mã mẫu 246810, core thật gửi qua SMS — bước 37/47), không
// có mật khẩu nào được nhận hay lưu. Đổi trả, huỷ đơn chỉ ghi vào cookie `sf_acct` của trình duyệt
// này. Thay bằng: phiên đăng nhập người mua (bước 47), `POST /api/v1/orders/me/orders/{id}/returns`,
// `POST /me/orders/{id}/cancel` (bước 45).

const COOKIE = { path: "/", sameSite: "lax", httpOnly: true, maxAge: 30 * 86_400 } as const;

function localeOf(form: FormData): (typeof routing.locales)[number] {
  return String(form.get("locale") ?? "") === "en" ? "en" : routing.defaultLocale;
}

export interface SignInState {
  step: "phone" | "otp";
  mode: "sign_in" | "sign_up";
  /** Số đã che, hiện ở bước nhập mã. */
  masked: string;
  errors: FieldError[];
}

/**
 * Hai bước: gửi số điện thoại (đăng ký thì kèm tên và đồng ý điều khoản) → nhập mã. Đăng nhập vào tài
 * khoản mẫu Lan Chi; đăng ký tạo tài khoản mới chưa có đơn nào. Trình duyệt không thấy gì ngoài cookie.
 */
export async function signIn(previous: SignInState, form: FormData): Promise<SignInState> {
  const mode = form.get("mode") === "sign_up" ? "sign_up" : "sign_in";
  const phone = normalizePhone(String(form.get("phone") ?? "").slice(0, 30));
  const name = String(form.get("name") ?? "")
    .trim()
    .slice(0, 60);
  if (!sampleDataEnabled())
    return { ...previous, errors: [{ field: "phone", code: "unavailable" }] };
  if (form.get("step") !== "otp") {
    const errors: FieldError[] = [];
    if (mode === "sign_up" && !name) errors.push({ field: "name", code: "name_required" });
    if (!PHONE.test(phone)) errors.push({ field: "phone", code: "phone_invalid" });
    if (mode === "sign_up" && form.get("terms") !== "on")
      errors.push({ field: "terms", code: "terms_required" });
    if (errors.length > 0) return { step: "phone", mode, masked: "", errors };
    return { step: "otp", mode, masked: maskPhone(phone), errors: [] };
  }
  const otp = String(form.get("otp") ?? "").replace(/\D/g, "");
  if (otp !== SAMPLE_OTP) {
    return {
      step: "otp",
      mode,
      masked: maskPhone(phone),
      errors: [{ field: "otp", code: "otp_invalid" }],
    };
  }
  const value =
    mode === "sign_up"
      ? serializeBuyer({ kind: "new", name, phone })
      : serializeBuyer(SAMPLE_BUYER);
  (await cookies()).set(BUYER_COOKIE, value, COOKIE);
  return redirect({ href: routes.account(), locale: localeOf(form) });
}

export async function signOut(form: FormData): Promise<void> {
  const jar = await cookies();
  jar.delete(BUYER_COOKIE);
  jar.delete(ACCOUNT_COOKIE);
  return redirect({ href: routes.account(), locale: localeOf(form) });
}

export interface ReturnState {
  status: "idle" | "ok" | "error";
  errors: FieldError[];
}

const RETURN_REASONS = ["damaged", "wrong_item", "not_as_described", "changed_mind"] as const;
const RETURN_METHODS = ["pickup", "store"] as const;

/** Yêu cầu đổi trả trong hạn: chọn món, lý do, cách gửi trả; gom mọi lỗi một lần. */
export async function requestReturn(_: ReturnState, form: FormData): Promise<ReturnState> {
  const buyer = await readBuyer();
  const number = String(form.get("number") ?? "");
  const order = buyer ? (await buyerOrders(buyer)).find((o) => o.number === number) : undefined;
  if (!order) return { status: "error", errors: [{ field: "number", code: "order_not_found" }] };
  const errors: FieldError[] = [];
  const span = returnWindow(order, new Date());
  if (!span || span.days_left === 0) errors.push({ field: "number", code: "return_window_closed" });
  const skus = form.getAll("sku").map(String);
  if (!skus.some((sku) => order.lines.some((l) => l.sku === sku)))
    errors.push({ field: "sku", code: "return_items_required" });
  const reason = String(form.get("reason") ?? "");
  if (!(RETURN_REASONS as readonly string[]).includes(reason))
    errors.push({ field: "reason", code: "return_reason_required" });
  const note = String(form.get("note") ?? "").trim();
  if (reason !== "changed_mind" && note.length < 10)
    errors.push({ field: "note", code: "return_note_short", params: { min: 10 } });
  if (!(RETURN_METHODS as readonly string[]).includes(String(form.get("method") ?? "")))
    errors.push({ field: "method", code: "return_method_required" });
  if (errors.length > 0) return { status: "error", errors };
  const state = await readAccountState();
  if (!state.returns.includes(number)) state.returns.unshift(number);
  (await cookies()).set(ACCOUNT_COOKIE, serializeAccountState(state), COOKIE);
  return { status: "ok", errors: [] };
}

/** Huỷ đơn chưa giao cho vận chuyển (mẫu). */
export async function cancelOrder(form: FormData): Promise<void> {
  const buyer = await readBuyer();
  const number = String(form.get("number") ?? "");
  const order = buyer ? (await buyerOrders(buyer)).find((o) => o.number === number) : undefined;
  if (!order || !cancellable(order)) return;
  const state = await readAccountState();
  if (!state.cancelled.includes(number)) state.cancelled.unshift(number);
  (await cookies()).set(ACCOUNT_COOKIE, serializeAccountState(state), COOKIE);
}
