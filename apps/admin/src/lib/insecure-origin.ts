// Trang quản trị bản chạy thật đặt cookie phiên với cờ `Secure` (`AUTOXIDE_WEB_SECURE_COOKIES`, mặc
// định bật ở production). Mở trang qua `http://` (trừ localhost, trình duyệt coi là an toàn) thì trình
// duyệt bỏ cookie đó: đăng nhập "thành công" rồi bị đá về trang đăng nhập mà không báo gì (W-060).
// Hàm thuần để test; component `InsecureOriginWarning` gọi nó với `window.location`.

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]", "::1"]);

/** Cookie phiên `Secure` sẽ bị trình duyệt bỏ ở địa chỉ này. */
export function secureCookiesDropped(
  secure: boolean,
  location: { protocol: string; hostname: string },
): boolean {
  if (!secure || location.protocol !== "http:") return false;
  const host = location.hostname.toLowerCase();
  return !(LOCAL_HOSTS.has(host) || host.endsWith(".localhost"));
}
