import "server-only";

import { cookies } from "next/headers";
import { BUYER_COOKIE, type Buyer, parseBuyer } from "./account";
import { sampleDataEnabled } from "./index";
import { placedOrder } from "./order-store";
import { type BuyerOrder, sampleBuyerOrders } from "./orders";

// Trạng thái mẫu của người mua trên trình duyệt này (W-030), chỉ máy chủ đọc. Mọi cookie `httpOnly`,
// chỉ giữ mã ngắn (không có gì bí mật, không có mật khẩu):
// - `sf_code`: mã giảm đang nhập ở giỏ (thay bằng `PUT /carts/{id}/codes`, bước 45);
// - `sf_orders`: mã các đơn đặt trên trình duyệt này (thay bằng token xem đơn của core, D-202);
// - `sf_buyer`: tài khoản mẫu đang "đăng nhập" (thay bằng phiên đăng nhập người mua, bước 47);
// - `sf_acct`: yêu cầu đổi trả, huỷ đơn mẫu đã gửi (thay bằng trạng thái đơn của core).

export const CODE_COOKIE = "sf_code";
export const ORDERS_COOKIE = "sf_orders";
export const ACCOUNT_COOKIE = "sf_acct";
const ORDER_NUMBER = /^BM-\d{4}-\d{4}$/;

export async function readCode(): Promise<string | null> {
  if (!sampleDataEnabled()) return null;
  const value = (await cookies()).get(CODE_COOKIE)?.value ?? "";
  return /^[A-Z0-9]{3,20}$/.test(value) ? value : null;
}

export async function readBuyer(): Promise<Buyer | null> {
  if (!sampleDataEnabled()) return null;
  return parseBuyer((await cookies()).get(BUYER_COOKIE)?.value, new Date());
}

/** Mã đơn trong cookie `sf_orders` (đơn đặt trên trình duyệt này), mới nhất trước. */
export function parseNumbers(value: string | undefined): string[] {
  return (value ?? "")
    .split(",")
    .filter((n) => ORDER_NUMBER.test(n))
    .slice(0, 20);
}

export async function readPlacedNumbers(): Promise<string[]> {
  return parseNumbers((await cookies()).get(ORDERS_COOKIE)?.value);
}

/** Yêu cầu đổi trả / huỷ đơn mẫu đã gửi trên trình duyệt này. */
export interface AccountState {
  returns: string[];
  cancelled: string[];
}

export function parseAccountState(value: string | undefined): AccountState {
  const [returns = "", cancelled = ""] = (value ?? "").split("|");
  return { returns: parseNumbers(returns), cancelled: parseNumbers(cancelled) };
}

export function serializeAccountState(state: AccountState): string {
  return `${state.returns.join(",")}|${state.cancelled.join(",")}`;
}

export async function readAccountState(): Promise<AccountState> {
  return parseAccountState((await cookies()).get(ACCOUNT_COOKIE)?.value);
}

/**
 * Đơn của người mua đang đăng nhập: đơn vừa đặt trên trình duyệt này (cùng số điện thoại), rồi đơn mẫu
 * của tài khoản mẫu; đơn đã huỷ trong phiên mẫu hiện là đã huỷ.
 */
export async function buyerOrders(buyer: Buyer): Promise<BuyerOrder[]> {
  const now = new Date();
  const state = await readAccountState();
  const placed = (await readPlacedNumbers())
    .map(placedOrder)
    .filter((o): o is BuyerOrder => o !== null && o.contact.phone === buyer.phone);
  const sample = buyer.kind === "sample" ? sampleBuyerOrders(now) : [];
  return [...placed, ...sample].map((order) =>
    state.cancelled.includes(order.number) ? { ...order, status: "cancelled" as const } : order,
  );
}
