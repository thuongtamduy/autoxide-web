// Cho core biết request của website thuộc khách (cửa hàng) nào, khi core chạy nhiều khách (bước 33 của
// core, D-284, D-291). Core xác định khách theo thứ tự: credential (website không có), header
// `Autoxide-Tenant: <slug | id>`, rồi tên miền (`Host`, hay `X-Forwarded-Host` khi request đến từ một proxy
// core tin — `AUTOXIDE_HTTP_TRUSTED_PROXIES`). Website gọi core từ máy chủ của nó nên phải tự chuyển một
// trong hai. Hàm thuần ở đây để test; phần đọc request ở `core.ts`.

/** Tên máy hợp lệ (chữ thường, số, `-`, `.`, cổng); giá trị lạ thì không dùng. */
const HOST = /^[a-z0-9.-]+(:\d{1,5})?$/;

/** Header gửi kèm mọi lời gọi tới core. */
export function tenantHeaders(setting: string, visitorHost: string | null): Record<string, string> {
  if (setting) return { "Autoxide-Tenant": setting.slice(0, 200) };
  const host = visitorHost?.trim().toLowerCase();
  // Chỉ chuyển tên máy hợp lệ (chữ, số, `-`, `.`, cổng); giá trị lạ thì không gửi gì.
  if (host && HOST.test(host)) return { "X-Forwarded-Host": host };
  return {};
}

/**
 * Gốc công khai của website (không có `/` ở cuối) cho link tuyệt đối: `canonical`, Open Graph,
 * sitemap, RSS, JSON-LD.
 * - `AUTOXIDE_STOREFRONT_URL` đặt thì luôn dùng nó: một website, một tên miền.
 * - Không đặt: tên miền khách đang mở, để một bản website phục vụ nhiều cửa hàng theo tên miền mà link
 *   của cửa hàng nào trỏ về đúng tên miền đó. Giao thức theo `X-Forwarded-Proto` của proxy phía trước;
 *   không có thì `https` khi chạy thật, `http` khi chạy thử.
 * - Tên miền không đúng dạng hay không có: `http://localhost:3000` (chạy thử).
 */
export function publicOrigin(
  setting: string,
  visitorHost: string | null,
  forwardedProto: string | null,
  production: boolean,
): string {
  if (setting) return setting.replace(/\/+$/, "");
  const host = visitorHost?.trim().toLowerCase();
  if (!host || !HOST.test(host)) return "http://localhost:3000";
  const proto = forwardedProto?.split(",")[0]?.trim().toLowerCase();
  const scheme = proto === "http" || proto === "https" ? proto : production ? "https" : "http";
  return `${scheme}://${host}`;
}
