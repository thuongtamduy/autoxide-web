"use server";

import { cookies } from "next/headers";
import { addLine, CART_COOKIE, CART_MAX_AGE, cartCount, parseCart, serializeCart } from "./cart";
import { isStoreCode } from "./catalog";
import { sampleDataEnabled } from "./index";
import { STORE_COOKIE } from "./store";

// Server Action của phần mẫu: ghi cookie giỏ hàng và cửa hàng đã chọn. Next.js tự dựng lại trang
// sau khi action đổi cookie, nên số trên biểu tượng giỏ và tình trạng hàng cập nhật ngay.

/** Thêm SKU vào giỏ mẫu; trả số món trong giỏ sau khi thêm (`null` khi tắt dữ liệu mẫu). */
export async function addToCart(skus: string[], quantity = 1): Promise<number | null> {
  if (!sampleDataEnabled()) return null;
  const store = await cookies();
  let lines = parseCart(store.get(CART_COOKIE)?.value);
  for (const sku of skus.slice(0, 20)) {
    lines = addLine(lines, String(sku), Math.max(1, Math.min(99, Math.trunc(quantity))));
  }
  store.set(CART_COOKIE, serializeCart(lines), {
    path: "/",
    maxAge: CART_MAX_AGE,
    sameSite: "lax",
    httpOnly: true,
  });
  return cartCount(lines);
}

/** Chọn cửa hàng mẫu (mã lạ thì bỏ qua). */
export async function chooseStore(code: string): Promise<void> {
  if (!isStoreCode(code)) return;
  (await cookies()).set(STORE_COOKIE, code, {
    path: "/",
    maxAge: 365 * 86_400,
    sameSite: "lax",
    httpOnly: true,
  });
}
