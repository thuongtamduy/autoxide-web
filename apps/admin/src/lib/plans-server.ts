import "server-only";

import { ApiError } from "@autoxide/sdk";
import { cache } from "react";
import { isNotFound, load } from "./core";
import type { Entitlements, LimitUse, Plan, Subscription } from "./plans";

// Đọc dữ liệu của module `plans` cho mặt điều khiển nền tảng (nhân sự khách nền tảng).

/** Số trang tối đa khi đọc hết một danh sách (mỗi trang 200). */
const MAX_PAGES = 10;

/** Mọi gói (`GET /plans/plans`, cần `plans.plans.read`), cũ trước. */
export async function loadAllPlans(): Promise<Plan[]> {
  const all: Plan[] = [];
  let cursor: string | undefined;
  for (let page = 0; page < MAX_PAGES; page++) {
    const answer = await load((client) =>
      client.GET("/api/v1/plans/plans", {
        params: { query: { limit: 200, order: "asc", ...(cursor ? { cursor } : {}) } },
      }),
    );
    all.push(...answer.data);
    cursor = answer.pagination.next_cursor ?? undefined;
    if (!cursor) break;
  }
  return all;
}

/** Mọi thuê bao (`GET /plans/subscriptions`, cần `plans.subscriptions.read`), lọc tuỳ chọn. */
export async function loadAllSubscriptions(
  query: { status?: string; plan_id?: string } = {},
): Promise<Subscription[]> {
  const all: Subscription[] = [];
  let cursor: string | undefined;
  for (let page = 0; page < MAX_PAGES; page++) {
    const answer = await load((client) =>
      client.GET("/api/v1/plans/subscriptions", {
        params: { query: { ...query, limit: 200, ...(cursor ? { cursor } : {}) } },
      }),
    );
    all.push(...answer.data);
    cursor = answer.pagination.next_cursor ?? undefined;
    if (!cursor) break;
  }
  return all;
}

/** Số khách đang ở mỗi gói (thuê bao chưa bị xoá). */
export function subscriberCounts(subscriptions: readonly Subscription[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const sub of subscriptions) {
    if (sub.status === "deleted") continue;
    counts.set(sub.plan_id, (counts.get(sub.plan_id) ?? 0) + 1);
  }
  return counts;
}

/** Thuê bao của khách đang đăng nhập; `null` khi khách chưa có (core trả 404). */
export async function loadOwnSubscription(): Promise<Subscription | null> {
  try {
    return (await load((c) => c.GET("/api/v1/plans/subscription"))).data;
  } catch (error) {
    if (isNotFound(error)) return null;
    throw error;
  }
}

/**
 * Những gì gói cho khách đang đăng nhập dùng (`GET /plans/entitlements`), đọc một lần cho mỗi
 * request. `null` khi bản cài không có module `plans` hay core từ chối: khi đó không ẩn hay khoá gì,
 * core vẫn tự từ chối (`feature_not_enabled`) nếu cần.
 */
export const loadEntitlements = cache(async (): Promise<Entitlements | null> => {
  try {
    return (await load((c) => c.GET("/api/v1/plans/entitlements"))).data;
  } catch (error) {
    if (error instanceof ApiError && (error.status === 403 || error.status === 404)) return null;
    throw error;
  }
});

/** Gói của khách chưa có tính năng `key` (vd `auth.api_keys`): nút dùng nó cần gói cao hơn. */
export async function lacksFeature(key: string): Promise<boolean> {
  const entitlements = await loadEntitlements();
  return (
    entitlements !== null && !entitlements.unrestricted && !entitlements.features.includes(key)
  );
}

/**
 * Gói và thuê bao của mọi khách cho sổ khách hàng; `null` khi người xem thiếu
 * `plans.subscriptions.read` / `plans.plans.read` hay bản cài không có module `plans`.
 */
export async function loadTenantPlans(): Promise<{
  plans: Plan[];
  subscriptions: Subscription[];
} | null> {
  try {
    const [plans, subscriptions] = await Promise.all([loadAllPlans(), loadAllSubscriptions()]);
    return { plans, subscriptions };
  } catch (error) {
    if (error instanceof ApiError && (error.status === 403 || error.status === 404)) return null;
    throw error;
  }
}

/**
 * Mức dùng hạn mức của từng khách trong `ids` (`GET /plans/tenants/{id}/usage`, một lời gọi mỗi
 * khách — sổ khách chỉ gọi cho các khách core báo là gần chạm hạn mức).
 */
export async function loadUsageOf(ids: readonly string[]): Promise<Map<string, LimitUse[]>> {
  const entries = await Promise.all(
    ids.map(async (id) => {
      const answer = await load((c) =>
        c.GET("/api/v1/plans/tenants/{tenant_id}/usage", { params: { path: { tenant_id: id } } }),
      );
      return [id, answer.data] as const;
    }),
  );
  return new Map(entries);
}

/**
 * Tên các module khách đang được dùng: module đã cài (`GET /kernel/modules`) mà gói bật
 * (`modules` của `GET /plans/entitlements`, gồm cả module luôn bật). Không có gói giới hạn thì là mọi
 * module đã cài; `null` khi không đọc được sổ module. Thanh bên, Tổng quan và hộp việc dùng để không
 * mời người dùng vào phần core sẽ từ chối `module_not_enabled`.
 */
export async function enabledModuleNames(
  installed: readonly { name: string; always_enabled?: boolean }[] | null,
): Promise<string[] | null> {
  if (!installed) return null;
  const entitlements = await loadEntitlements();
  if (!entitlements || entitlements.unrestricted) return installed.map((m) => m.name);
  const on = new Set(entitlements.modules);
  return installed.filter((m) => m.always_enabled === true || on.has(m.name)).map((m) => m.name);
}
