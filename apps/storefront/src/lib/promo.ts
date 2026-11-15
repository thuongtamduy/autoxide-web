// Phép tính khuyến mại để HIỆN (W-029). Website không tính giá phải trả: core tính
// (`promotions`, bước 43). Ở đây chỉ đổi số core trả thành chữ cho người mua.

/** Phần trăm giảm làm tròn xuống ("−40%"): không bao giờ ghi cao hơn mức giảm thật. */
export function discountPercent(reference: number, price: number): number {
  if (reference <= 0 || price >= reference) return 0;
  return Math.floor(((reference - price) * 100) / reference);
}

/** Giá sau giảm theo basis point (1000 = 10%), làm tròn tới đồng như `applyBp` của trang quản trị. */
export function priceAfterBp(price: number, bp: number): number {
  return price - Math.round((price * bp) / 10_000);
}

/** Phần còn lại của suất có hạn, cho thanh tiến độ (0–100). Suất là số thật (Luật 19/2023). */
export function remainingPercent(left: number, total: number): number {
  if (total <= 0) return 0;
  return Math.max(0, Math.min(100, Math.round((left / total) * 100)));
}
