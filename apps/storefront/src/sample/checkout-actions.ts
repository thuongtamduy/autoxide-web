"use server";

import { refresh } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";
import { routes } from "@/lib/routes";
import { CODE_COOKIE, ORDERS_COOKIE, parseNumbers, readBuyer, readCode } from "./buyer-server";
import { CART_COOKIE, CART_MAX_AGE, parseCart, serializeCart, setLine } from "./cart";
import {
  buildQuote,
  type CodeStatus,
  checkCode,
  type FieldError,
  readCheckoutForm,
  validateCheckout,
} from "./checkout";
import { sampleDataEnabled } from "./index";
import { markPaid, ordersForKey, placeOrders } from "./order-store";
import { readStore } from "./server";

// Server Action của giỏ và trang đặt hàng (mẫu, W-030). Mỗi hàm thay cho một lệnh ghi của core
// (bước 45): đổi số lượng `PUT /carts/{id}/lines/{variant_id}`, mã giảm `PUT /carts/{id}/codes`,
// đặt hàng `POST /checkout` (có `Idempotency-Key`). Form chạy được cả khi trình duyệt tắt JavaScript.

const COOKIE = { path: "/", sameSite: "lax", httpOnly: true } as const;

function localeOf(form: FormData): (typeof routing.locales)[number] {
  const value = String(form.get("locale") ?? "");
  return value === "en" ? "en" : routing.defaultLocale;
}

/** Đặt số lượng một dòng (0 = bỏ dòng). */
export async function setQuantity(form: FormData): Promise<void> {
  if (!sampleDataEnabled()) return;
  const sku = String(form.get("sku") ?? "").slice(0, 40);
  const quantity = Math.max(0, Math.min(99, Math.trunc(Number(form.get("quantity") ?? 0)) || 0));
  const store = await cookies();
  const lines = setLine(parseCart(store.get(CART_COOKIE)?.value), sku, quantity);
  store.set(CART_COOKIE, serializeCart(lines), { ...COOKIE, maxAge: CART_MAX_AGE });
}

export interface CodeState {
  status: "idle" | "error" | "ok";
  /** Mã lý do (`CodeStatus`) để giao diện dịch câu. */
  reason: CodeStatus | "empty" | null;
  code: string;
}

/** Áp mã giảm cho giỏ: chỉ giữ mã áp được; mã lạ hay không hợp giỏ trả lý do. */
export async function applyCode(_: CodeState, form: FormData): Promise<CodeState> {
  const code = String(form.get("code") ?? "")
    .trim()
    .toUpperCase()
    .slice(0, 20);
  if (!code) return { status: "error", reason: "empty", code };
  if (!sampleDataEnabled()) return { status: "error", reason: "unknown", code };
  const store = await cookies();
  const status = checkCode(code, parseCart(store.get(CART_COOKIE)?.value));
  if (status !== "applied") return { status: "error", reason: status, code };
  store.set(CODE_COOKIE, code, { ...COOKIE, maxAge: CART_MAX_AGE });
  return { status: "ok", reason: "applied", code };
}

export async function removeCode(): Promise<void> {
  (await cookies()).delete(CODE_COOKIE);
}

export interface PlaceState {
  status: "idle" | "error";
  errors: FieldError[];
}

/**
 * Đặt hàng: kiểm lại toàn bộ form với báo giá tính trên máy chủ (giá trên trình duyệt không được
 * tin), gom mọi lỗi một lần; hợp lệ thì tạo đơn theo `idempotency_key`, xoá giỏ, rồi chuyển tới trang
 * "đặt hàng thành công". Bấm hai lần (hay gửi lại vì mạng chập chờn) vẫn chỉ có một lần đặt.
 */
export async function placeOrder(_: PlaceState, form: FormData): Promise<PlaceState> {
  const locale = localeOf(form);
  if (!sampleDataEnabled())
    return { status: "error", errors: [{ field: "lines", code: "cart_empty" }] };
  const key = String(form.get("idempotency_key") ?? "");
  if (!/^[0-9a-f-]{16,64}$/i.test(key)) {
    return { status: "error", errors: [{ field: "lines", code: "retry" }] };
  }
  // Cùng khoá đã đặt xong (bấm hai lần, gửi lại): trả lại kết quả cũ, không đặt thêm.
  const previous = ordersForKey(key);
  if (previous) redirect({ href: routes.orderPlaced(previous), locale });
  const jar = await cookies();
  const lines = parseCart(jar.get(CART_COOKIE)?.value);
  const values = readCheckoutForm(form);
  const buyer = await readBuyer();
  const now = new Date();
  const placedBefore = parseNumbers(jar.get(ORDERS_COOKIE)?.value);
  const quote = buildQuote({
    lines,
    code: await readCode(),
    store: await readStore(),
    delivery: values.delivery,
    province: values.province || null,
    points: values.points,
    balance: buyer?.points ?? null,
    now,
  });
  const errors = validateCheckout(values, quote, buyer?.points ?? null);
  if (errors.length > 0) return { status: "error", errors };
  const { numbers } = placeOrders({ key, form: values, quote, now });
  jar.delete(CART_COOKIE);
  jar.delete(CODE_COOKIE);
  jar.set(
    ORDERS_COOKIE,
    [...numbers, ...placedBefore.filter((n) => !numbers.includes(n))].slice(0, 20).join(","),
    {
      ...COOKIE,
      maxAge: 30 * 86_400,
    },
  );
  return redirect({ href: routes.orderPlaced(numbers), locale });
}

/**
 * Mẫu: "Tôi đã chuyển" ở màn VietQR / "đối tác đã báo thanh toán" ở màn thẻ. Chỉ đơn đặt trên trình
 * duyệt này. Core thật xác nhận theo tin của đối tác thanh toán, không theo nút của người mua.
 */
export async function confirmPayment(form: FormData): Promise<void> {
  const number = String(form.get("number") ?? "");
  const mine = parseNumbers((await cookies()).get(ORDERS_COOKIE)?.value);
  if (!mine.includes(number)) return;
  markPaid(number, new Date());
  // Đơn nằm ở kho trong bộ nhớ, không ở cookie: báo trình duyệt dựng lại trang để thấy trạng thái mới.
  refresh();
}
