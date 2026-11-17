// Khách (tenant) của trang quản trị khi core chạy nhiều khách (bước 33 của core). Core xác định khách
// theo thứ tự: credential, header `Autoxide-Tenant: <slug | id>`, rồi tên miền (`Host`, hay
// `X-Forwarded-Host` khi request đến từ proxy core tin — `AUTOXIDE_HTTP_TRUSTED_PROXIES`).
//
// Sau khi đăng nhập, token đã mang khách nên mọi lời gọi có token không gửi gì thêm. Chỉ lời gọi khi
// chưa đăng nhập (đăng nhập, bước mã, quên mật khẩu, cấu hình công khai) cần biết khách:
// 1. `AUTOXIDE_ADMIN_TENANT` — trang quản trị dành riêng cho một khách;
// 2. cookie `ax_tenant` — khách người dùng gõ ở ô "Không gian làm việc" lúc đăng nhập;
// 3. tên miền đang mở — trang quản trị chạy trên tên miền riêng đã xác minh của khách.
// Không gửi refresh token kèm header khách: core đọc khách từ chính refresh token, header của khách
// khác làm token mất hiệu lực.
//
// Hàm thuần ở đây để test; phần đọc env, cookie, request ở `core.ts`.

/** Cookie giữ khách đã chọn lúc đăng nhập. Không phải secret (chỉ là slug hay id). */
export const TENANT_COOKIE = "ax_tenant";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const SLUG = /^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/;

/**
 * Chuẩn hoá giá trị người dùng gõ vào ô khách: bỏ khoảng trắng, chữ thường. Trả `""` khi để trống,
 * `null` khi sai dạng (không phải slug hay UUID) — core vẫn là bên quyết khách có tồn tại không.
 */
export function normalizeWorkspace(value: string): string | null {
  const text = value.trim().toLowerCase();
  if (text === "") return "";
  return UUID.test(text) || SLUG.test(text) ? text : null;
}

/** Header gửi kèm lời gọi core khi chưa đăng nhập. */
export function tenantHeaders(
  setting: string,
  chosen: string | undefined,
  visitorHost: string | null,
): Record<string, string> {
  const tenant = setting || normalizeWorkspace(chosen ?? "");
  if (tenant) return { "Autoxide-Tenant": tenant.slice(0, 200) };
  const host = visitorHost?.trim().toLowerCase();
  // Chỉ chuyển tên máy hợp lệ (chữ, số, `-`, `.`, cổng); giá trị lạ thì không gửi gì.
  if (host && /^[a-z0-9.-]+(:\d{1,5})?$/.test(host)) return { "X-Forwarded-Host": host };
  return {};
}

/** Core trả mã này khi cần biết khách mà không xác định được: form đăng nhập hỏi thêm. */
export function asksForWorkspace(code: string | undefined): boolean {
  return code === "tenant_required" || code === "tenant_not_found";
}

/**
 * Cookie giữ khách đang vào làm việc qua uỷ quyền hay quyền vào hỗ trợ (`GET /auth/me/tenants`): ID
 * của khách đó. Không có = làm việc ở khách của chính mình. Không phải secret.
 */
export const WORK_COOKIE = "ax_work";

/** Giá trị cookie dùng được: đúng dạng UUID; còn lại coi như không vào khách nào. */
export function enteredTenant(value: string | undefined): string | null {
  const text = value?.trim().toLowerCase() ?? "";
  return UUID.test(text) ? text : null;
}

/**
 * Lời gọi `method path` có gửi `Autoxide-Tenant` của khách đang vào không. Phần tài khoản của chính
 * mình (`/auth/me…`: hồ sơ, mật khẩu, MFA, passkey, phiên) ở khách của mình, nên không gửi — trừ
 * `GET /auth/me`: ở khách đang vào core trả quyền của người dùng ở đó (D-339). Mọi lời gọi khác làm
 * việc ở khách đang vào.
 */
export function sendsEntered(path: string, method = "GET"): boolean {
  if (path === "/api/v1/auth/me") return method === "GET";
  return !/^\/api\/v1\/auth\/me(\/|$)/.test(path);
}
