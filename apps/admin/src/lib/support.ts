import type { components } from "@autoxide/sdk";

// Quyền vào dữ liệu khách của nhân sự nền tảng (`/auth/support-grants`, bước 34 của core): kiểu và
// hàm thuần để test.

export type SupportGrant = components["schemas"]["SupportGrantResponse"];
export const GRANT_STATES = ["active", "expired", "revoked"] as const;
export type GrantState = (typeof GRANT_STATES)[number];

/** Lần cấp đang có hiệu lực, đã hết hạn hay đã bị thu hồi (bởi nền tảng hay chính khách). */
export function grantState(
  grant: Pick<SupportGrant, "revoked_at" | "expires_at">,
  now = Date.now(),
): GrantState {
  if (grant.revoked_at) return "revoked";
  return Date.parse(grant.expires_at) <= now ? "expired" : "active";
}

/** Số giờ còn lại tới hạn của một lần cấp, làm tròn lên (còn 10 phút là "còn 1 giờ"); đã hết thì 0. */
export function hoursLeft(expiresAt: string, now = Date.now()): number {
  return Math.max(0, Math.ceil((Date.parse(expiresAt) - now) / 3_600_000));
}
