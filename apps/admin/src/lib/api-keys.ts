// Hàm thuần cho màn API key: ngày hết hạn theo lựa chọn và danh sách permission được cấp cho key
// (core chỉ nhận permission người tạo đang có).
import type { PermissionInfo } from "./permission-groups";

export const EXPIRY_CHOICES = ["30d", "90d", "365d", "never"] as const;
export type ExpiryChoice = (typeof EXPIRY_CHOICES)[number];

const DAYS: Record<Exclude<ExpiryChoice, "never">, number> = { "30d": 30, "90d": 90, "365d": 365 };

/** `expires_at` (RFC 3339) cho lựa chọn; `null` khi không hết hạn hay lựa chọn lạ. */
export function expiresAt(choice: string, now: Date = new Date()): string | null {
  if (!(choice in DAYS)) return null;
  const days = DAYS[choice as keyof typeof DAYS];
  return new Date(now.getTime() + days * 86_400_000).toISOString();
}

/**
 * Permission chọn được cho một key: cả sổ khi người tạo có mọi permission; không thì những
 * permission họ đang có (kèm mô tả từ sổ khi đọc được sổ).
 */
export function grantable(
  catalog: readonly PermissionInfo[] | null,
  me: { all_permissions: boolean; permissions: readonly string[] },
): PermissionInfo[] {
  if (me.all_permissions && catalog) return [...catalog];
  const described = new Map((catalog ?? []).map((p) => [p.name, p.description]));
  return me.permissions.map((name) => ({ name, description: described.get(name) ?? "" }));
}
