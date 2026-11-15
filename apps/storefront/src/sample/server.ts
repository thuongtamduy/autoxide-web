import "server-only";

import { cookies } from "next/headers";
import { CART_COOKIE, type CartLine, parseCart } from "./cart";
import type { StoreCode } from "./catalog";
import { sampleDataEnabled } from "./index";
import { parseStore, STORE_COOKIE } from "./store";

// Đọc trạng thái mẫu của người xem từ cookie (chỉ máy chủ). Tắt dữ liệu mẫu thì giỏ rỗng.

export async function readCart(): Promise<CartLine[]> {
  if (!sampleDataEnabled()) return [];
  return parseCart((await cookies()).get(CART_COOKIE)?.value);
}

export async function readStore(): Promise<StoreCode> {
  return parseStore((await cookies()).get(STORE_COOKIE)?.value);
}
