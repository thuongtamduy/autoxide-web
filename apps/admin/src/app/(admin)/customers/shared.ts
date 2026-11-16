import "server-only";

import {
  AUTH_CUSTOMERS_READ,
  CUSTOMERS_ENGAGEMENT_MANAGE,
  CUSTOMERS_LOYALTY_MANAGE,
  CUSTOMERS_READ,
  CUSTOMERS_SEGMENTS_MANAGE,
  ORDERS_RISK_MANAGE,
} from "@/lib/customers";
import { ORDERS_READ } from "@/lib/orders";
import { listUnits } from "@/sample/org";

// Phần dùng chung của màn "Khách hàng" (máy chủ).

/** Endpoint còn thiếu của bước 47, ghi vào nhãn "Dữ liệu mẫu" (W-006). */
export const ENDPOINTS_47 =
  "GET/POST /api/v1/customers, GET/PUT /{id}, /{id}/notes, /{id}/orders, /{id}/points, /{id}/points/adjustments, /groups, /groups/{id}/preview, /loyalty/rules, /loyalty/tiers, /reminder-rules, /referral-rules";
/** Tài khoản người mua (bước 34) và rủi ro COD (bước 45) dùng trên màn này. */
export const ENDPOINTS_34 =
  "GET /api/v1/auth/customers, POST /{id}/lock, /{id}/unlock, GET/PUT /auth/settings";
export const ENDPOINTS_45_RISK =
  "GET/POST /api/v1/orders/risk/rules, /risk/lookup, /risk/blocks, /risk/blocks/{id}/lift";

/** Permission của từng tab (màn hiện khi xem được một trong số đó). */
export const CUSTOMER_TABS = {
  profiles: CUSTOMERS_READ,
  accounts: AUTH_CUSTOMERS_READ,
  segments: [CUSTOMERS_SEGMENTS_MANAGE, CUSTOMERS_READ],
  loyalty: [CUSTOMERS_LOYALTY_MANAGE, CUSTOMERS_READ],
  carts: [CUSTOMERS_ENGAGEMENT_MANAGE, ORDERS_READ],
  referrals: [CUSTOMERS_ENGAGEMENT_MANAGE, CUSTOMERS_READ],
  cod: ORDERS_RISK_MANAGE,
} as const;

/** Cửa hàng (nút `store`) để đăng ký khách tại quầy. */
export async function storeOptions(): Promise<{ value: string; label: string }[]> {
  const { data } = await listUnits();
  return data.filter((u) => u.unit_type === "store").map((u) => ({ value: u.id, label: u.name }));
}

/** Nút áp quy tắc nhóm: miền và cửa hàng. */
export async function regionOptions(): Promise<{ value: string; label: string }[]> {
  const { data } = await listUnits();
  return data
    .filter((u) => u.unit_type === "region" || u.unit_type === "store")
    .map((u) => ({ value: u.id, label: u.name }));
}
