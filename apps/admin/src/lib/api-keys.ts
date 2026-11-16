// Hàm thuần cho màn API key: ngày hết hạn theo lựa chọn.

export const EXPIRY_CHOICES = ["30d", "90d", "365d", "never"] as const;
export type ExpiryChoice = (typeof EXPIRY_CHOICES)[number];

const DAYS: Record<Exclude<ExpiryChoice, "never">, number> = { "30d": 30, "90d": 90, "365d": 365 };

/** `expires_at` (RFC 3339) cho lựa chọn; `null` khi không hết hạn hay lựa chọn lạ. */
export function expiresAt(choice: string, now: Date = new Date()): string | null {
  if (!(choice in DAYS)) return null;
  const days = DAYS[choice as keyof typeof DAYS];
  return new Date(now.getTime() + days * 86_400_000).toISOString();
}
