import "server-only";

// Số liệu tóm tắt của trang Tổng quan (bước 51 P4 của core, `SummaryMetric`; W-020). Mỗi phân hệ khai
// số của mình; ô chỉ hiện khi người xem có permission đọc của số đó. Số của phân hệ có API thật đọc
// core (bài chờ duyệt, bình luận chờ duyệt, bài nộp mới); còn lại đọc dữ liệu mẫu và ghi rõ trên ô.
// Khi core có `GET /api/v1/kernel/summary` thì thay file này bằng lời gọi đó.
import { INVENTORY_READ } from "@/lib/catalog";
import { COMMENTS_MODERATE, COMMENTS_READ, FORMS_READ } from "@/lib/engage";
import { ORDERS_READ, PENDING_STATUSES } from "@/lib/orders";
import { CONTENT_READ } from "@/lib/permissions";
import { inventoryStats } from "@/sample/inventory";
import { ordersState } from "@/sample/orders";
import { SOURCE_TIMEOUT_MS, visibleSources, withTimeout } from "./registry";
import { revenueToday } from "./revenue";
import { readNewSubmissions, readPendingComments, readReviewEntries } from "./sources";
import type { MetricView, SummaryMetric, WorkContext } from "./types";

const SUMMARY = "GET /api/v1/kernel/summary";

export const METRICS: readonly SummaryMetric[] = [
  {
    id: "orders.revenue_today",
    group: "sales",
    permission: [ORDERS_READ],
    sample: { step: "45", endpoint: `${SUMMARY} (orders.revenue_today)` },
    href: "/sales/orders",
    value: async (ctx) => {
      const { orders } = await ordersState();
      const { total } = revenueToday(orders, ctx.now);
      return {
        value: { kind: "money", value: { amount: String(total), currency: "VND" } },
        note: { key: "metrics.revenueNote" },
      };
    },
  },
  {
    id: "orders.pending",
    group: "sales",
    permission: [ORDERS_READ],
    sample: { step: "45", endpoint: `${SUMMARY} (orders.pending)` },
    href: `/sales/orders?status=${PENDING_STATUSES.join("%2C")}`,
    value: async () => {
      const { orders } = await ordersState();
      return {
        value: {
          kind: "count",
          value: orders.filter((o) => PENDING_STATUSES.includes(o.status)).length,
        },
        note: { key: "metrics.pendingNote" },
      };
    },
  },
  {
    id: "inventory.low_stock",
    group: "catalog",
    permission: [INVENTORY_READ],
    sample: { step: "42", endpoint: `${SUMMARY} (inventory.low_stock)` },
    href: "/catalog/inventory?status=low",
    value: async () => {
      const { data } = await inventoryStats();
      return {
        value: { kind: "count", value: data.low },
        note: { key: "metrics.lowNote", params: { out: data.out } },
      };
    },
  },
  {
    id: "content.in_review",
    group: "content",
    permission: [CONTENT_READ],
    module: "content",
    href: "/content?status=review",
    value: async () => {
      const waiting = await readReviewEntries();
      return {
        value: { kind: "count", value: waiting.length },
        note: waiting[0]
          ? { key: "metrics.reviewNote", params: { title: waiting[0].title } }
          : { key: "metrics.reviewNone" },
      };
    },
  },
  {
    id: "comments.pending",
    group: "mkt",
    permission: [COMMENTS_READ, COMMENTS_MODERATE],
    module: "comments",
    href: "/marketing/comments",
    value: async () => {
      const page = await readPendingComments();
      return {
        value: { kind: "count", value: page.data.length },
        note: { key: page.pagination.next_cursor ? "metrics.atLeast" : "metrics.commentsNote" },
      };
    },
  },
  {
    id: "forms.new",
    group: "mkt",
    permission: [FORMS_READ],
    module: "forms",
    href: "/marketing/forms",
    value: async () => {
      const perForm = await readNewSubmissions();
      const total = perForm.reduce((sum, { count }) => sum + count, 0);
      return {
        value: { kind: "count", value: total },
        note: {
          key: "metrics.formsNote",
          params: { forms: perForm.filter((x) => x.count > 0).length },
        },
      };
    },
  },
];

/**
 * Đọc các số người xem dùng được (cùng luật permission, module, dữ liệu mẫu như nguồn việc), mỗi số
 * có hạn thời gian; số lỗi hay chậm thì bỏ và ghi vào `incomplete`.
 */
export async function readMetrics(
  ctx: WorkContext,
  metrics: readonly SummaryMetric[] = METRICS,
): Promise<{ data: MetricView[]; incomplete: string[] }> {
  const shown = visibleSources(metrics, ctx);
  const results = await Promise.allSettled(
    shown.map((metric) => withTimeout(metric.value(ctx), SOURCE_TIMEOUT_MS)),
  );
  const data: MetricView[] = [];
  const incomplete: string[] = [];
  results.forEach((result, index) => {
    const metric = shown[index];
    if (!metric) return;
    if (result.status === "rejected") {
      incomplete.push(metric.id);
      return;
    }
    data.push({
      id: metric.id,
      group: metric.group,
      href: metric.href,
      value: result.value.value,
      note: result.value.note,
      sample: metric.sample ?? null,
      module: metric.module ?? null,
    });
  });
  return { data, incomplete };
}
