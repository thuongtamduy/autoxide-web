// Hàm thuần của quầy bán: không gọi máy chủ, test được bằng Vitest.
import { fold } from "@/lib/fold";

export interface PosLineItem {
  sku: string;
  name: string;
  barcode: string | null;
  price: number;
  vat: number;
  available: number;
}

/** Giỏ ở quầy: SKU → số lượng. */
export type PosCart = Record<string, number>;

/** Số tiền khách hay đưa: đủ tiền, rồi làm tròn lên các mệnh giá chẵn; tối đa 4 nút, không trùng. */
export function cashSuggestions(total: number): number[] {
  if (total <= 0) return [];
  const out = [total];
  for (const step of [10_000, 50_000, 100_000, 200_000, 500_000]) {
    const v = Math.ceil(total / step) * step;
    if (!out.includes(v)) out.push(v);
    if (out.length === 4) break;
  }
  return out;
}

/** Chữ khách đưa → số đồng ("1.000.000", "1,000,000 ₫"); trống hay sai trả `null`. */
export function parseCash(text: string): number | null {
  const clean = text.replace(/[\s.,₫đ]/g, "");
  if (!/^\d{1,12}$/.test(clean)) return null;
  return Number(clean);
}

/**
 * Máy quét mã vạch gõ cả mã rồi Enter: tìm đúng một hàng có mã vạch hoặc SKU trùng khít (không phân
 * biệt hoa thường). Không thấy thì `null` (ô tìm giữ chữ để lọc như thường).
 */
export function findByScan<T extends Pick<PosLineItem, "sku" | "barcode">>(
  items: readonly T[],
  text: string,
): T | null {
  const code = text.trim().toLowerCase();
  if (!code) return null;
  return (
    items.find((i) => i.barcode?.toLowerCase() === code) ??
    items.find((i) => i.sku.toLowerCase() === code) ??
    null
  );
}

/** Lọc theo chữ gõ (không dấu) trên tên, SKU, mã vạch. */
export function matchItem(item: Pick<PosLineItem, "sku" | "name" | "barcode">, q: string): boolean {
  const needle = fold(q);
  if (!needle) return true;
  return (
    fold(item.name).includes(needle) ||
    item.sku.toLowerCase().includes(needle) ||
    (item.barcode ?? "").includes(needle)
  );
}

/** Đặt số lượng một dòng, kẹp trong [0, tồn]; 0 thì bỏ dòng khỏi giỏ. */
export function setQuantity(cart: PosCart, sku: string, n: number, available: number): PosCart {
  const next = { ...cart };
  const q = Math.max(0, Math.min(Math.floor(n), available));
  if (q === 0) delete next[sku];
  else next[sku] = q;
  return next;
}

export interface PosTotals {
  count: number;
  subtotal: number;
  /** Phần GTGT nằm trong giá (giá đã gồm thuế), tính trước giảm giá. */
  vat: number;
}

export function cartTotals(cart: PosCart, items: readonly PosLineItem[]): PosTotals {
  let count = 0;
  let subtotal = 0;
  let vat = 0;
  for (const [sku, n] of Object.entries(cart)) {
    const item = items.find((i) => i.sku === sku);
    if (!item || n <= 0) continue;
    count += n;
    subtotal += item.price * n;
    vat += Math.round((item.price * n * item.vat) / (100 + item.vat));
  }
  return { count, subtotal, vat };
}

/** Bỏ dòng không còn bán ở cửa hàng, kẹp số lượng theo tồn (khi đổi cửa hàng hay mở lại đơn giữ). */
export function fitCart(cart: PosCart, items: readonly PosLineItem[]): PosCart {
  let out: PosCart = {};
  for (const [sku, n] of Object.entries(cart)) {
    const item = items.find((i) => i.sku === sku);
    if (item) out = setQuantity(out, sku, n, item.available);
  }
  return out;
}

/** Đơn đang giữ ở quầy (để phục vụ khách khác), lưu trong trình duyệt của máy quầy. */
export interface HeldCart {
  id: string;
  store: string;
  cart: PosCart;
  codes: string[];
  customer: { id: string; name: string } | null;
  /** ISO 8601. */
  at: string;
}

export const HELD_KEY = "ax.pos.held";

/** Đọc danh sách đơn giữ đã lưu; dữ liệu hỏng thì bỏ qua từng mục, không làm hỏng quầy. */
export function readHeld(raw: string | null): HeldCart[] {
  if (!raw) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  const out: HeldCart[] = [];
  for (const h of parsed) {
    if (!h || typeof h !== "object") continue;
    const x = h as Record<string, unknown>;
    if (typeof x.id !== "string" || typeof x.store !== "string" || typeof x.at !== "string")
      continue;
    if (!x.cart || typeof x.cart !== "object") continue;
    const cart: PosCart = {};
    for (const [sku, n] of Object.entries(x.cart as Record<string, unknown>)) {
      if (typeof n === "number" && Number.isInteger(n) && n > 0) cart[sku] = n;
    }
    if (Object.keys(cart).length === 0) continue;
    const codes = Array.isArray(x.codes) ? x.codes.filter((c) => typeof c === "string") : [];
    const c = x.customer as Record<string, unknown> | null | undefined;
    const customer =
      c && typeof c.id === "string" && typeof c.name === "string"
        ? { id: c.id, name: c.name }
        : null;
    out.push({ id: x.id, store: x.store, cart, codes, customer, at: x.at });
  }
  return out;
}
