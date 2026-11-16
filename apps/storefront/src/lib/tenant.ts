// Cho core biết request của website thuộc khách (cửa hàng) nào, khi core chạy nhiều khách (bước 33 của
// core, D-284, D-291). Core xác định khách theo thứ tự: credential (website không có), header
// `Autoxide-Tenant: <slug | id>`, rồi tên miền (`Host`, hay `X-Forwarded-Host` khi request đến từ một proxy
// core tin — `AUTOXIDE_HTTP_TRUSTED_PROXIES`). Website gọi core từ máy chủ của nó nên phải tự chuyển một
// trong hai. Hàm thuần ở đây để test; phần đọc request ở `core.ts`.

/** Header gửi kèm mọi lời gọi tới core. */
export function tenantHeaders(setting: string, visitorHost: string | null): Record<string, string> {
  if (setting) return { "Autoxide-Tenant": setting.slice(0, 200) };
  const host = visitorHost?.trim().toLowerCase();
  // Chỉ chuyển tên máy hợp lệ (chữ, số, `-`, `.`, cổng); giá trị lạ thì không gửi gì.
  if (host && /^[a-z0-9.-]+(:\d{1,5})?$/.test(host)) return { "X-Forwarded-Host": host };
  return {};
}
