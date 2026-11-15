// Phần dùng chung (không đọc dữ liệu) của màn Khách hàng: permission dự kiến của đặc tả 47
// (`docs/steps/47-customers.md` của core), của tài khoản người mua (bước 34) và rủi ro COD (bước 45);
// che dữ liệu cá nhân; chuẩn hoá số điện thoại. Hàm thuần, chạy được ở cả máy chủ và trình duyệt (có test).

export const CUSTOMERS_READ = "customers.read";
export const CUSTOMERS_MANAGE = "customers.manage";
export const CUSTOMERS_SEGMENTS_MANAGE = "customers.segments.manage";
export const CUSTOMERS_LOYALTY_MANAGE = "customers.loyalty.manage";
export const CUSTOMERS_LOYALTY_ADJUST = "customers.loyalty.adjust";
export const CUSTOMERS_ENGAGEMENT_MANAGE = "customers.engagement.manage";
/** Tài khoản người mua của bước 34 (module `auth`), tên theo bản thiết kế. */
export const AUTH_CUSTOMERS_READ = "auth.customers.read";
export const AUTH_CUSTOMERS_MANAGE = "auth.customers.manage";
/** Rủi ro COD của bước 45 (dự kiến, theo bản thiết kế). */
export const ORDERS_RISK_MANAGE = "orders.risk.manage";

/**
 * Số điện thoại Việt Nam chuẩn hoá về dạng `0xxxxxxxxx` (10 số); `null` khi không hợp lệ. Core băm
 * số chuẩn hoá E.164 bằng HMAC theo khách (đặc tả 47) — giao diện chỉ kiểm hình dạng.
 */
export function normalizePhone(text: string): string | null {
  const digits = text.replace(/[\s.\-()]/g, "");
  const local = digits.startsWith("+84")
    ? `0${digits.slice(3)}`
    : digits.startsWith("84") && digits.length === 11
      ? `0${digits.slice(2)}`
      : digits;
  return /^0[35789]\d{8}$/.test(local) ? local : null;
}

/** Che số điện thoại: giữ hai số đầu và ba số cuối (`09•• ••• 412`). */
export function maskPhone(phone: string | null): string {
  if (!phone) return "—";
  return `${phone.slice(0, 2)}•• ••• ${phone.slice(-3)}`;
}

/** Che email: giữ ký tự đầu và tên miền (`h•••@example.com`). */
export function maskEmail(email: string | null): string {
  if (!email) return "—";
  const at = email.indexOf("@");
  if (at < 1) return "•••";
  return `${email[0]}•••${email.slice(at)}`;
}

/** Che ngày sinh `YYYY-MM-DD`: chỉ hiện tháng và năm (`••/03/1988`). */
export function maskBirthday(day: string | null): string {
  if (!day) return "—";
  const [y, m] = day.split("-");
  return `••/${m}/${y}`;
}

/** Nhãn gõ cách nhau bằng dấu phẩy: bỏ trống, bỏ trùng (không phân biệt hoa thường), tối đa 10 nhãn. */
export function parseTags(text: string): string[] {
  const out: string[] = [];
  for (const raw of text.split(",")) {
    const tag = raw.trim().replace(/\s+/g, " ");
    if (tag && !out.some((x) => x.toLowerCase() === tag.toLowerCase())) out.push(tag);
  }
  return out;
}

/** Các mốc nhắc giỏ (phút sau khi bỏ giỏ), vd "60, 1440": tăng dần, mỗi mốc 15 phút – 7 ngày. */
export function parseDelays(text: string): number[] | null {
  const parts = text
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);
  if (parts.length === 0 || parts.length > 3) return null;
  const out: number[] = [];
  for (const part of parts) {
    if (!/^\d{1,5}$/.test(part)) return null;
    const n = Number(part);
    if (n < 15 || n > 7 * 24 * 60 || (out.length > 0 && n <= (out.at(-1) ?? 0))) return null;
    out.push(n);
  }
  return out;
}
