import "server-only";

import { load } from "./core";
import type { Plan, Subscription } from "./plans";

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
