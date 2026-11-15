import "server-only";

import {
  MARKETPLACE_DISPUTES_RESOLVE,
  MARKETPLACE_FEES_MANAGE,
  MARKETPLACE_FINANCE_READ,
  MARKETPLACE_LISTINGS_REVIEW,
  MARKETPLACE_SELLERS_READ,
} from "@/lib/market";
import { listCategories } from "@/sample/catalog";

// Phần dùng chung của các tab màn "Vận hành sàn" (máy chủ).

/** Tab của màn: [id, đường dẫn, permission đọc] theo thứ tự của bản thiết kế. */
export const MARKET_TABS = [
  ["sellers", "/market", MARKETPLACE_SELLERS_READ],
  ["listings", "/market/listings", MARKETPLACE_LISTINGS_REVIEW],
  ["fees", "/market/fees", MARKETPLACE_FEES_MANAGE],
  ["payouts", "/market/payouts", MARKETPLACE_FINANCE_READ],
  ["disputes", "/market/disputes", MARKETPLACE_DISPUTES_RESOLVE],
] as const;

/** Danh mục của `catalog` để chọn ngành hàng (đường dẫn tên "Bát đĩa › Gốm sứ"). */
export async function categoryOptions(locale: string) {
  const { data } = await listCategories(locale);
  return data.map((c) => ({ value: c.id, label: c.path }));
}

/** Đọc một tham số địa chỉ dạng chuỗi. */
export function param(params: Record<string, string | string[] | undefined>, name: string): string {
  const value = params[name];
  return typeof value === "string" ? value : "";
}
