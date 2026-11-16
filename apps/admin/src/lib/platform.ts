// Hàm thuần của mặt điều khiển nền tảng (W-014, W-027): ghép sổ khách và placement THẬT của core
// với phần còn là dữ liệu mẫu, lọc sổ khách hàng, xếp cây khách cha – con, đếm ngày còn lại. Không
// đọc dữ liệu; trang ghép dữ liệu (mẫu hay API thật) rồi gọi các hàm này.
import type { components } from "@autoxide/sdk";
import { hrefWith, oneOf, type SearchParams } from "@/lib/engage";
import {
  type OperatorSubscription,
  PLATFORM_TENANT_ID,
  type Placement,
  type Plan,
  type Tenant,
  type TenantStatus,
  type TenantUsage,
} from "@/sample/platform-data";
import { usageRatio } from "@/sample/platform-plans";

type CoreTenant = components["schemas"]["Tenant"];
type CorePlacement = components["schemas"]["Placement"];

/** Bản ghi đến từ core (`core`) hay chỉ có trong dữ liệu mẫu (`sample`, phần core chưa có). */
export type Source = "core" | "sample";
/**
 * `read_only`: cờ chỉ đọc của nhà vận hành (D-296 của core; khách mẫu luôn `false`). `placement`:
 * placement của khách lấy từ `expand=placement` của sổ khách (khách mẫu: placement mẫu cùng id);
 * `null` khi core không trả kèm (vd đọc một khách lẻ).
 */
export type PlatformTenant = Tenant & {
  source: Source;
  read_only: boolean;
  placement: PlatformPlacement | null;
};
export type PlacementStorage = components["schemas"]["PlacementStorage"];
/**
 * `storage`: nơi lưu file riêng của placement (D-293 của core, chỉ phần không bí mật); `null` khi
 * khách trên placement này lưu file ở nơi lưu chung của nền tảng. Placement mẫu không có.
 */
export type PlatformPlacement = Placement & { source: Source; storage?: PlacementStorage | null };

/** Placement đặt cố định của core cho database điều khiển (D-253 của core). */
export const MAIN_PLACEMENT_ID = "00000000-0000-7000-8000-000000000002";

/**
 * Placement của core theo hình dạng giao diện dùng. Trường core chưa có (`location`,
 * `pending_migrations`, lần kiểm cuối) lấy từ bản mẫu cùng id khi bật dữ liệu mẫu, không thì trống.
 */
export function fromCorePlacement(core: CorePlacement, sample?: Placement): PlatformPlacement {
  return {
    id: core.id,
    name: core.name,
    kind: core.kind === "dedicated" ? "dedicated" : "shared",
    backend: core.backend === "postgres" ? "postgres" : "sqlite",
    schema_state:
      core.schema_state === "behind" || core.schema_state === "migrating"
        ? core.schema_state
        : "ready",
    schema_checked_at: sample?.schema_checked_at ?? null,
    created_at: core.created_at,
    updated_at: sample?.updated_at ?? core.created_at,
    pending_migrations: sample?.pending_migrations ?? [],
    location: sample?.location ?? "",
    control: core.id === MAIN_PLACEMENT_ID,
    storage: core.storage ?? null,
    source: "core",
  };
}

/**
 * Khách của core theo hình dạng giao diện dùng. Placement lấy từ `expanded.placement` khi sổ khách
 * gọi kèm `expand=placement`; không có thì tra theo tên trong danh sách placement của core. Trường
 * core chưa có (`business_model`, `primary_domain`, lý do tạm khoá) lấy từ bản mẫu cùng id khi bật
 * dữ liệu mẫu, không thì `null`.
 */
export function fromCoreTenant(
  core: CoreTenant,
  placements: readonly Pick<CorePlacement, "id" | "name">[],
  sample?: Tenant,
  samplePlacements: readonly Placement[] = [],
): PlatformTenant {
  const expanded = core.expanded?.placement ?? null;
  const placementId = expanded?.id ?? placements.find((p) => p.name === core.placement)?.id ?? "";
  return {
    id: core.id,
    slug: core.slug,
    name: core.name,
    status: core.status as TenantStatus,
    parent_id: core.parent_id ?? null,
    placement_id: placementId,
    created_at: core.created_at,
    updated_at: core.updated_at,
    is_platform: core.id === PLATFORM_TENANT_ID,
    business_model: sample?.business_model ?? null,
    primary_domain: sample?.primary_domain ?? null,
    status_reason: sample?.status_reason ?? null,
    read_only: core.read_only ?? false,
    placement: expanded
      ? fromCorePlacement(
          expanded,
          samplePlacements.find((p) => p.id === expanded.id),
        )
      : null,
    source: "core",
  };
}

/**
 * Sổ khách: mọi khách của core, rồi (khi bật dữ liệu mẫu) những khách chỉ có trong dữ liệu mẫu —
 * vd khách vừa "cấp phát" bằng luồng mẫu của bước 35, mà core chưa có API.
 */
export function mergeTenants(
  core: readonly CoreTenant[],
  placements: readonly Pick<CorePlacement, "id" | "name">[],
  sample: readonly Tenant[] | null,
  samplePlacements: readonly Placement[] | null = null,
): PlatformTenant[] {
  const known = new Set(core.map((x) => x.id));
  const byId = new Map((sample ?? []).map((x) => [x.id, x]));
  const own = samplePlacements ?? [];
  return [
    ...core.map((x) => fromCoreTenant(x, placements, byId.get(x.id), own)),
    ...(sample ?? [])
      .filter((x) => !known.has(x.id))
      .map((x) => {
        const placement = own.find((p) => p.id === x.placement_id);
        return {
          ...x,
          read_only: false,
          placement: placement ? { ...placement, source: "sample" as const } : null,
          source: "sample" as const,
        };
      }),
  ];
}

/** Placement: mọi placement của core, rồi placement chỉ có trong dữ liệu mẫu (khi bật). */
export function mergePlacements(
  core: readonly CorePlacement[],
  sample: readonly Placement[] | null,
): PlatformPlacement[] {
  const known = new Set(core.map((x) => x.id));
  const byId = new Map((sample ?? []).map((x) => [x.id, x]));
  return [
    ...core.map((x) => fromCorePlacement(x, byId.get(x.id))),
    ...(sample ?? [])
      .filter((x) => !known.has(x.id))
      .map((x) => ({ ...x, source: "sample" as const })),
  ];
}

/** Một dòng của sổ khách hàng: khách kèm nơi lưu, thuê bao, gói, hạn mức gần chạm nhất. */
export interface TenantRow {
  tenant: PlatformTenant;
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
    row.tenant.read_only ||
    row.tenant.status === "suspended" ||
    row.tenant.status === "provisioning" ||
    (row.nearest !== null && usageRatio(row.nearest) >= 85)
  );
}

export const PLACEMENT_KINDS = ["shared", "dedicated"] as const;
export const SCHEMA_STATES = ["ready", "behind", "migrating"] as const;

/**
 * Bộ lọc của sổ khách trên địa chỉ trang (`/platform?placement_kind=dedicated&read_only=true`).
 * Ba bộ lọc đầu là tham số của `GET /kernel/tenants` (D-296 của core): core lọc cả sổ, không chỉ
 * trang đang xem. `attention` ghép cả dữ liệu mẫu của bước 35 (thuê bao, hạn mức) nên lọc ở đây.
 * Lọc theo thuê bao (`subscription_status`, `near_limit`) chưa có: core luôn trả rỗng tới bước 35.
 */
export interface TenantQuery {
  read_only?: boolean;
  placement_kind?: (typeof PLACEMENT_KINDS)[number];
  schema_state?: (typeof SCHEMA_STATES)[number];
  attention?: boolean;
}

/** Đọc bộ lọc từ địa chỉ; giá trị lạ thì bỏ qua (không gửi core thứ nó sẽ từ chối). */
export function parseTenantQuery(params: SearchParams): TenantQuery {
  const query: TenantQuery = {};
  const readOnly = oneOf(params, "read_only", ["true", "false"] as const);
  if (readOnly) query.read_only = readOnly === "true";
  const kind = oneOf(params, "placement_kind", PLACEMENT_KINDS);
  if (kind) query.placement_kind = kind;
  const state = oneOf(params, "schema_state", SCHEMA_STATES);
  if (state) query.schema_state = state;
  if (oneOf(params, "attention", ["true"] as const)) query.attention = true;
  return query;
}

/** Phần của bộ lọc gửi cho core (`GET /kernel/tenants`); rỗng khi không lọc gì ở core. */
export function coreTenantFilter(
  query: TenantQuery,
): Pick<TenantQuery, "read_only" | "placement_kind" | "schema_state"> {
  return {
    ...(query.read_only !== undefined ? { read_only: query.read_only } : {}),
    ...(query.placement_kind ? { placement_kind: query.placement_kind } : {}),
    ...(query.schema_state ? { schema_state: query.schema_state } : {}),
  };
}

/** Địa chỉ của sổ khách với bộ lọc này; không lọc gì thì `/platform`. */
export function tenantQueryHref(query: TenantQuery): string {
  return hrefWith("/platform", {
    read_only: query.read_only === undefined ? undefined : String(query.read_only),
    placement_kind: query.placement_kind,
    schema_state: query.schema_state,
    attention: query.attention ? "true" : undefined,
  });
}

/** Hai bộ lọc như nhau (để đánh dấu chip đang chọn). */
export function sameQuery(a: TenantQuery, b: TenantQuery): boolean {
  return tenantQueryHref(a) === tenantQueryHref(b);
}

/** Lối tắt trên sổ khách: mỗi chip là một bộ lọc dựng sẵn. */
export const TENANT_VIEWS = [
  { key: "all", query: {} },
  { key: "dedicated", query: { placement_kind: "dedicated" } },
  { key: "shared", query: { placement_kind: "shared" } },
  { key: "migration", query: { schema_state: "behind" } },
  { key: "readOnly", query: { read_only: true } },
  { key: "attention", query: { attention: true } },
] as const satisfies readonly { key: string; query: TenantQuery }[];

/**
 * Dòng có khớp bộ lọc không. Khách của core đã được core lọc theo ba bộ lọc đầu; hàm này lọc khách
 * chỉ có trong dữ liệu mẫu theo cùng luật, đếm số trên chip, và lọc "cần để ý".
 */
export function matchesQuery(row: TenantRow, query: TenantQuery): boolean {
  if (query.read_only !== undefined && row.tenant.read_only !== query.read_only) return false;
  if (query.placement_kind && row.placement?.kind !== query.placement_kind) return false;
  if (query.schema_state && row.placement?.schema_state !== query.schema_state) return false;
  if (query.attention && !needsAttention(row)) return false;
  return true;
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

/** Trạng thái của một lượt dời khách (`TenantMove.state`, D-292 của core), theo thứ tự chạy. */
export const MOVE_STATES = ["copying", "copied", "switched", "done"] as const;

/** Lượt dời đã dừng hẳn (xong hay đã huỷ): thôi theo dõi. */
export function moveFinished(state: string): boolean {
  return state === "done" || state === "aborted";
}

/**
 * Các bước của lượt dời cho thanh tiến độ: bước đã qua, bước đang ở, bước chưa tới. Lượt đã huỷ
 * (`aborted`) không có bước nào "đang ở".
 */
export function moveSteps(
  state: string,
): { state: (typeof MOVE_STATES)[number]; phase: "done" | "current" | "todo" }[] {
  const at = MOVE_STATES.indexOf(state as (typeof MOVE_STATES)[number]);
  return MOVE_STATES.map((step, index) => ({
    state: step,
    phase: state === "done" || (at >= 0 && index < at) ? "done" : index === at ? "current" : "todo",
  }));
}

/**
 * Đích dời được: mọi placement của core trừ placement khách đang ở. Placement mẫu không có thật ở
 * core nên không chọn được.
 */
export function moveTargets<T extends { name: string; source: Source }>(
  placements: readonly T[],
  current: string,
): T[] {
  return placements.filter((p) => p.source === "core" && p.name !== current);
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
