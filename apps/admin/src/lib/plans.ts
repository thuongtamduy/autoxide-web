import type { components } from "@autoxide/sdk";

// Gói, thuê bao, hạn mức (module `plans` của core, bước 35, D-323 – D-327): kiểu và hàm thuần để
// test. Phần gọi core ở các trang và `plans-server.ts`.

type Schemas = components["schemas"];
export type Plan = Schemas["PlanResponse"];
export type Price = Schemas["PriceResponse"];
export type Subscription = Schemas["PlanSubscription"];
export type BillingPeriod = Schemas["BillingPeriodResponse"];
export type LimitUse = Schemas["LimitUse"];
export type Entitlements = Schemas["EntitlementsResponse"];
export type Override = Schemas["OverrideResponse"];

/** Tính năng theo gói mà giao diện khoá nút khi gói chưa có (core khai ở `GET /kernel/modules`). */
export const API_KEYS_FEATURE = "auth.api_keys";
export const AI_SUGGESTIONS_FEATURE = "content.ai_suggestions";

/** Phần trăm đã dùng của một hạn mức (0–100, làm tròn); không giới hạn hay giới hạn 0: 0 / 100. */
export function usagePercent(limit: { used: number; max?: number | null | undefined }): number {
  if (limit.max === null || limit.max === undefined) return 0;
  if (limit.max <= 0) return limit.used > 0 ? 100 : 0;
  return Math.min(100, Math.round((limit.used / limit.max) * 100));
}

/** Hạn mức gần chạm nhất (có giới hạn), để hiện ở thẻ tóm tắt; không có thì `null`. */
export function tightest(limits: readonly LimitUse[]): LimitUse | null {
  const bounded = limits.filter((l) => l.max !== null && l.max !== undefined);
  if (bounded.length === 0) return null;
  return [...bounded].sort((a, b) => usagePercent(b) - usagePercent(a))[0] ?? null;
}

/** Hạn mức đo bằng byte (dung lượng tệp): tên khoá kết thúc bằng `bytes`. */
export function isBytes(key: string): boolean {
  return /bytes$/.test(key);
}

/** Lựa chọn "gói · giá" cho ô đổi gói: mỗi giá định kỳ đang bán của gói chính một dòng. */
export function priceChoices(
  plans: readonly Plan[],
): { value: string; plan: Plan; price: Price }[] {
  return plans
    .filter((plan) => plan.kind === "base" && plan.status === "active")
    .flatMap((plan) =>
      plan.prices
        .filter((price) => price.active && price.kind === "recurring")
        .map((price) => ({ value: `${plan.id}|${price.id}`, plan, price })),
    );
}

/** Tách giá trị của ô đổi gói (`<plan_id>|<price_id>`); sai dạng thì `null`. */
export function parseChoice(value: string): { plan_id: string; price_id: string } | null {
  const [plan, price] = value.split("|");
  const uuid = /^[0-9a-f-]{36}$/i;
  return plan && price && uuid.test(plan) && uuid.test(price)
    ? { plan_id: plan, price_id: price }
    : null;
}

/** Trạng thái thuê bao còn cho dùng đầy đủ (dùng thử, đang dùng, quá hạn trong thời gian ân hạn). */
export function isLive(status: string): boolean {
  return status === "trialing" || status === "active" || status === "past_due";
}

/** Danh sách cách bằng dấu phẩy / xuống dòng → mảng không trùng, bỏ ô trống. */
export function splitList(text: string): string[] {
  return [
    ...new Set(
      text
        .split(/[,\n]/)
        .map((part) => part.trim())
        .filter(Boolean),
    ),
  ];
}

/**
 * Ô hạn mức (mỗi dòng `khoá = số`, `khoá = không giới hạn` hay `khoá =` để trống) → object hạn mức
 * của core (`null` = không giới hạn). Dòng sai trả trong `errors` (số dòng tính từ 1).
 */
export function parseLimits(text: string): {
  limits: Record<string, number | null>;
  errors: number[];
} {
  const limits: Record<string, number | null> = {};
  const errors: number[] = [];
  text.split("\n").forEach((raw, index) => {
    const line = raw.trim();
    if (!line) return;
    const match = /^([a-z][a-z0-9_.-]*)\s*=\s*(.*)$/i.exec(line);
    if (!match?.[1]) {
      errors.push(index + 1);
      return;
    }
    const value = (match[2] ?? "").trim().toLowerCase();
    if (value === "" || value === "∞" || value === "unlimited" || value === "không giới hạn") {
      limits[match[1]] = null;
    } else if (/^\d{1,18}$/.test(value)) {
      limits[match[1]] = Number(value);
    } else {
      errors.push(index + 1);
    }
  });
  return { limits, errors };
}

/** Object hạn mức → chữ cho ô sửa (một dòng một khoá, `∞` = không giới hạn). */
export function limitsText(limits: Record<string, number | null | undefined>): string {
  return Object.entries(limits)
    .map(([key, max]) => `${key} = ${max === null || max === undefined ? "∞" : max}`)
    .join("\n");
}
