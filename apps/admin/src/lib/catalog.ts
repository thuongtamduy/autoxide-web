// Phần thuần (không gọi mạng) dùng chung cho phân hệ Sản phẩm: màn "Sản phẩm và giá" và "Tồn kho"
// (module `catalog`, `inventory` của core, bước 41–42). Dùng được cả ở máy chủ lẫn trình duyệt.

// Permission dự kiến theo đặc tả bước 41 và 42 của core (`Module::permissions`). Core chưa có hai
// module này: sổ điều hướng vẫn lọc theo các tên này (admin có mọi permission), để khi có API thật
// thì không phải sửa (W-006).
export const CATALOG_PRODUCTS_READ = "catalog.products.read";
export const CATALOG_PRODUCTS_WRITE = "catalog.products.write";
export const CATALOG_PRODUCTS_PUBLISH = "catalog.products.publish";
export const CATALOG_PRICES_READ = "catalog.prices.read";
export const CATALOG_PRICES_WRITE = "catalog.prices.write";
export const CATALOG_CATEGORIES_MANAGE = "catalog.categories.manage";
export const CATALOG_DOCUMENTS_MANAGE = "catalog.documents.manage";
export const CATALOG_IMPORT = "catalog.import";
export const CATALOG_EXPORT = "catalog.export";
export const INVENTORY_READ = "inventory.read";
export const INVENTORY_ADJUST = "inventory.adjust";
export const INVENTORY_RECEIVE = "inventory.receive";
export const INVENTORY_TRANSFER = "inventory.transfer";
export const INVENTORY_COUNT = "inventory.count";
export const INVENTORY_SETTINGS = "inventory.settings.manage";
export const INVENTORY_PURCHASING_READ = "inventory.purchasing.read";
export const INVENTORY_PURCHASING_MANAGE = "inventory.purchasing.manage";

/** Ngày `YYYY-MM-DD` (ngày hiệu lực, hạn dùng) cho người đọc; không đổi múi giờ (là ngày, không phải giờ). */
export function formatDay(day: string, locale: string): string {
  const date = new Date(`${day}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return day;
  return new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeZone: "UTC" }).format(date);
}

/** Thời điểm UTC → `YYYY-MM-DDTHH:mm` theo giờ Việt Nam, cho ô `datetime-local` của dòng giá. */
export function toVietnamInput(iso: string): string {
  return new Date(Date.parse(iso) + 7 * 3_600_000).toISOString().slice(0, 16);
}

/** Thuế suất "8" → "GTGT 8%" / "VAT 8%". */
export function vatLabel(percent: string | null, prefix: string): string {
  return percent === null ? "—" : `${prefix} ${percent}%`;
}

/** Số có dấu cho sổ biến động: "+30", "−2" (dấu trừ thật, dễ đọc hơn gạch nối). */
export function signed(value: number, locale: string): string {
  const text = new Intl.NumberFormat(locale).format(Math.abs(value));
  return value > 0 ? `+${text}` : value < 0 ? `−${text}` : text;
}

/** Phần trăm dòng thành công của một lần nhập (0–100). */
export function percentOf(part: number, total: number): number {
  return total <= 0 ? 0 : Math.round((part / total) * 100);
}
