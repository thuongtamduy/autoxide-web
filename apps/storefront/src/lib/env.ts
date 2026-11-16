// Cấu hình đọc từ biến môi trường, một chỗ duy nhất (README ghi đủ các biến).
//
// Không có `import "server-only"`: proxy cũng có thể dùng file này. Không file nào của trình
// duyệt import nó — biến không có tiền tố `NEXT_PUBLIC_` nên Next.js cũng không đưa xuống.

/** Gốc của core, không có `/api/v1` và không có `/` ở cuối. Cùng biến với trang quản trị. */
export function coreUrl(): string {
  return (process.env.AUTOXIDE_API_URL ?? "http://127.0.0.1:8080").replace(/\/+$/, "");
}

/**
 * Địa chỉ công khai của website (không có `/` ở cuối): gốc của link tuyệt đối trong `canonical`,
 * Open Graph, sitemap và RSS. Mặc định `http://localhost:3000` khi chạy thử.
 */
export function siteUrl(): string {
  return (process.env.AUTOXIDE_STOREFRONT_URL ?? "http://localhost:3000").replace(/\/+$/, "");
}

/**
 * Dữ liệu mẫu cho phần core chưa có API (W-006, W-026): cùng biến với trang quản trị. Mặc định
 * bật khi chạy thử, tắt ở production; `true` / `false` để ép.
 */
export function sampleDataSetting(): boolean {
  const value = process.env.AUTOXIDE_WEB_SAMPLE_DATA;
  if (value === undefined || value === "") {
    return process.env.NODE_ENV !== "production";
  }
  return value === "true" || value === "1";
}

/** Bốn kiểu giao diện của bản thiết kế (bảng `Main` và ba bảng `Style*`). */
export const VARIANTS = ["default", "market", "minimal", "luxe"] as const;
export type Variant = (typeof VARIANTS)[number];

/** Kiểu giao diện của website (`AUTOXIDE_STOREFRONT_THEME`); giá trị lạ thì về `default`. */
export function themeVariant(): Variant {
  const value = process.env.AUTOXIDE_STOREFRONT_THEME ?? "";
  return (VARIANTS as readonly string[]).includes(value) ? (value as Variant) : "default";
}

/** Tên website (`AUTOXIDE_STOREFRONT_NAME`); trống thì `src/lib/site.ts` tự chọn. */
export function siteNameSetting(): string {
  return (process.env.AUTOXIDE_STOREFRONT_NAME ?? "").trim();
}

/**
 * Khách (cửa hàng) mà website này phục vụ khi core chạy nhiều khách (`AUTOXIDE_STOREFRONT_TENANT`: slug
 * hay ID của khách). Trống: website chuyển tên miền người đọc đang mở cho core (`X-Forwarded-Host`), để
 * một bản website phục vụ nhiều cửa hàng theo tên miền. Core chạy một khách thì bỏ qua cả hai.
 */
export function tenantSetting(): string {
  return (process.env.AUTOXIDE_STOREFRONT_TENANT ?? "").trim();
}
