import "server-only";

import {
  ORDERS_MANAGE,
  ORDERS_POS_SELL,
  ORDERS_POS_SHIFT,
  ORDERS_READ,
  ORDERS_RETURNS_MANAGE,
  ORDERS_REVIEWS_MODERATE,
} from "@/lib/orders";
import { ORG } from "@/sample/catalog";
import { listUnits } from "@/sample/org";

// Phần dùng chung của hai màn "Đơn hàng" và "Cửa hàng" (máy chủ).

/** Endpoint còn thiếu của bước 45, ghi vào nhãn "Dữ liệu mẫu" (W-006). */
export const ENDPOINTS_45 =
  "GET /api/v1/orders, /{id}, POST /{id}/transitions, /{id}/refunds, /{id}/payments/manual, /returns, /returns/{id}/transitions, /pos/shifts, /pos/sales, /reviews, /reviews/{id}/moderation";

/** Permission của từng tab màn Đơn hàng (màn hiện khi xem được một trong số đó). */
export const ORDER_TABS = {
  orders: ORDERS_READ,
  returns: [ORDERS_RETURNS_MANAGE, ORDERS_READ],
  pos: ORDERS_POS_SELL,
  carts: ORDERS_READ,
} as const;

/** Permission của từng tab màn Cửa hàng. */
export const STORE_TABS = {
  pickup: ORDERS_MANAGE,
  shifts: ORDERS_POS_SHIFT,
  returns: ORDERS_RETURNS_MANAGE,
  reviews: ORDERS_REVIEWS_MODERATE,
} as const;

/** Nút bán để lọc: các cửa hàng và sàn (đơn sàn ở nút gốc vì sàn là bước 46). */
export async function sellingNodes(market: string): Promise<{ value: string; label: string }[]> {
  const { data } = await listUnits();
  return [
    ...data.filter((u) => u.unit_type === "store").map((u) => ({ value: u.id, label: u.name })),
    { value: ORG.ROOT, label: market },
  ];
}

/** Cửa hàng (nút `store`). */
export async function storeOptions(): Promise<{ value: string; label: string }[]> {
  const { data } = await listUnits();
  return data.filter((u) => u.unit_type === "store").map((u) => ({ value: u.id, label: u.name }));
}
