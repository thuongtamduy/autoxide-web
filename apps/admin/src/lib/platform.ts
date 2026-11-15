// Hàm thuần của mặt điều khiển nền tảng (W-014): lọc sổ khách hàng, xếp cây khách cha – con, đếm
// ngày còn lại. Không đọc dữ liệu; trang ghép dữ liệu (mẫu hay API thật) rồi gọi các hàm này.
import type {
  OperatorSubscription,
  Placement,
  Plan,
  Tenant,
  TenantUsage,
} from "@/sample/platform-data";
import { usageRatio } from "@/sample/platform-plans";

export const TENANT_FILTERS = ["all", "dedicated", "shared", "migration", "attention"] as const;
export type TenantFilter = (typeof TENANT_FILTERS)[number];

/** Một dòng của sổ khách hàng: khách kèm nơi lưu, thuê bao, gói, hạn mức gần chạm nhất. */
export interface TenantRow {
  tenant: Tenant;
  placement: Placement | null;
  subscription: OperatorSubscription | null;
  plan: Plan | null;
  nearest: TenantUsage | null;
  children: number;
}

/** Khách cần nhân sự vận hành để ý: quá hạn, chỉ đọc, tạm khoá, cấp phát dở, sắp chạm hạn mức. */
export function needsAttention(row: TenantRow): boolean {
  const status = row.subscription?.status;
  return (
    status === "past_due" ||
    status === "suspended" ||
    row.tenant.status === "suspended" ||
    row.tenant.status === "provisioning" ||
    (row.nearest !== null && usageRatio(row.nearest) >= 85)
  );
}

export function matchesFilter(row: TenantRow, filter: TenantFilter): boolean {
  switch (filter) {
    case "all":
      return true;
    case "dedicated":
      return row.placement?.kind === "dedicated";
    case "shared":
      return row.placement?.kind === "shared";
    case "migration":
      return row.placement !== null && row.placement.schema_state !== "ready";
    case "attention":
      return needsAttention(row);
  }
}

/**
 * Xếp khách theo cây: khách gốc theo tên, mỗi khách con đứng ngay sau khách cha (cây khách hàng
 * của bước 38). Khách có cha không nằm trong danh sách thì đứng như khách gốc.
 */
export function orderTree<T extends { id: string; name: string; parent_id: string | null }>(
  list: readonly T[],
): { item: T; depth: number }[] {
  const ids = new Set(list.map((x) => x.id));
  const byName = (a: T, b: T) => a.name.localeCompare(b.name, "vi");
  const children = (parent: string) => list.filter((x) => x.parent_id === parent).sort(byName);
  const out: { item: T; depth: number }[] = [];
  const walk = (item: T, depth: number) => {
    out.push({ item, depth });
    for (const child of children(item.id)) walk(child, depth + 1);
  };
  for (const root of list.filter((x) => !x.parent_id || !ids.has(x.parent_id)).sort(byName)) {
    walk(root, 0);
  }
  return out;
}

/** Số ngày (làm tròn lên) từ `now` tới `until`; đã qua thì số âm (làm tròn xuống). */
export function daysUntil(until: string, now = Date.now()): number {
  const days = (Date.parse(until) - now) / 86_400_000;
  return days >= 0 ? Math.ceil(days) : Math.floor(days);
}

/** Tuổi gần đúng theo đơn vị lớn nhất (≥ 1 ngày → ngày, ≥ 1 giờ → giờ…), làm tròn xuống. */
export function roughAge(seconds: number): {
  unit: "seconds" | "minutes" | "hours" | "days";
  count: number;
} {
  const units = [
    ["days", 86_400],
    ["hours", 3_600],
    ["minutes", 60],
  ] as const;
  for (const [unit, size] of units) {
    if (seconds >= size) return { unit, count: Math.floor(seconds / size) };
  }
  return { unit: "seconds", count: Math.max(0, Math.floor(seconds)) };
}
