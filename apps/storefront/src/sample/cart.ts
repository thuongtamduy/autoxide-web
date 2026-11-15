// Giỏ hàng mẫu (W-026): giữ trong cookie `sf_cart` của trình duyệt ("CG26:1,TG35:2") — không có
// gì bí mật, chỉ là SKU và số lượng. Thay bằng giỏ hàng của core (`/api/v1/orders/public/carts`,
// bước 45) khi có: lúc đó cookie chỉ giữ id của giỏ.
import { isSellableSku } from "./offers";

export const CART_COOKIE = "sf_cart";
/** Giữ giỏ 30 ngày. */
export const CART_MAX_AGE = 30 * 86_400;
const MAX_LINES = 50;
const MAX_QUANTITY = 99;

export interface CartLine {
  sku: string;
  quantity: number;
}

/**
 * Đọc cookie; dòng hỏng, SKU lạ (hay của người bán đang tạm khoá), số lượng ngoài 1–99 bị bỏ, SKU
 * lặp thì cộng dồn. SKU có thể là hàng Bếp Mộc hay hàng người bán trên sàn (`offers.ts`).
 */
export function parseCart(value: string | undefined): CartLine[] {
  const lines: CartLine[] = [];
  for (const part of (value ?? "").split(",")) {
    const [sku = "", count = ""] = part.split(":");
    const quantity = Number(count);
    if (!isSellableSku(sku) || !Number.isInteger(quantity) || quantity < 1) continue;
    const found = lines.find((line) => line.sku === sku);
    if (found) found.quantity = Math.min(MAX_QUANTITY, found.quantity + quantity);
    else if (lines.length < MAX_LINES)
      lines.push({ sku, quantity: Math.min(MAX_QUANTITY, quantity) });
  }
  return lines;
}

export function serializeCart(lines: readonly CartLine[]): string {
  return lines.map((line) => `${line.sku}:${line.quantity}`).join(",");
}

/** Thêm `quantity` của một SKU (SKU lạ thì giỏ giữ nguyên). */
export function addLine(lines: readonly CartLine[], sku: string, quantity = 1): CartLine[] {
  return parseCart(serializeCart([...lines, { sku, quantity }]));
}

/** Đặt số lượng (0 = bỏ dòng). */
export function setLine(lines: readonly CartLine[], sku: string, quantity: number): CartLine[] {
  const rest = lines.filter((line) => line.sku !== sku);
  return quantity > 0 ? parseCart(serializeCart([...rest, { sku, quantity }])) : rest;
}

/** Số món trong giỏ (cộng số lượng). */
export function cartCount(lines: readonly CartLine[]): number {
  return lines.reduce((sum, line) => sum + line.quantity, 0);
}
