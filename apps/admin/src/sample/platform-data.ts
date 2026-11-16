// Dữ liệu mẫu của mặt điều khiển nền tảng (W-014): sổ khách hàng, nơi lưu dữ liệu (placement), lượt
// cấp phát, lần xuất dữ liệu (bước 33, 35), gói, giá, thuê bao, ghi đè, kỳ thanh toán (bước 35),
// quyền vào hỗ trợ (bước 34), sức khoẻ và backup (bước 39). Kiểu theo hình dạng dự kiến trong đặc tả
// bước ở `docs/steps/` của core; trường không có trong đặc tả ghi "dự kiến (mới)".
//
// Một bộ dữ liệu cho cả ứng dụng: khách "Bếp Mộc" là khách mà các màn của không gian khách đang
// hiện. Thuê bao, hạn mức, kỳ thanh toán của Bếp Mộc đọc thẳng từ `src/sample/settings.ts`; quyền vào
// hỗ trợ của Bếp Mộc đọc và ghi vào `src/sample/org.ts`. Gói "Khởi đầu", "Doanh nghiệp", "Thêm 100 GB"
// dùng đúng id và giá của `settings.ts`.
//
// Kho trong bộ nhớ của tiến trình máy chủ; khởi động lại thì về ban đầu. Việc chạy bằng job ở core
// (cấp phát, migrate, xuất dữ liệu) ở đây tiến theo thời gian thật mỗi lần đọc (`sync`).
import { SAMPLE_CHILD_TENANTS } from "./org";
import { SAMPLE_PLAN_IDS } from "./settings";

const SECOND = 1000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** Mỗi bước của job mẫu (cấp phát, migrate, xuất dữ liệu) mất chừng này. */
export const SAMPLE_STEP_MS = 3 * SECOND;

export interface Ref {
  id: string;
  name: string;
}

// ---------------------------------------------------------------- Bước 33: khách, placement

export type TenantStatus = "provisioning" | "active" | "suspended" | "maintenance" | "moving";

/** Mô hình kinh doanh của khách (D-185). Dự kiến (mới): core chưa có trường này. */
export type BusinessModel =
  | "single_store"
  | "multi_store"
  | "content_only"
  | "parent_child"
  | "marketplace";

export const BUSINESS_MODELS: readonly BusinessModel[] = [
  "single_store",
  "multi_store",
  "content_only",
  "parent_child",
  "marketplace",
];

/** Một khách hàng (`GET /api/v1/kernel/tenants`). */
export interface Tenant {
  id: string;
  slug: string;
  name: string;
  status: TenantStatus;
  /** Khách cha (cây khách hàng của bước 38); không có foreign key. */
  parent_id: string | null;
  placement_id: string;
  created_at: string;
  updated_at: string;
  /** Khách nền tảng (khách mặc định, nơi tài khoản của nhà vận hành sống). */
  is_platform: boolean;
  /** Dự kiến (mới). */
  business_model: BusinessModel | null;
  /** Dự kiến (mới): tên miền chính đã xác minh, để nhận ra khách trong danh sách. */
  primary_domain: string | null;
  /** Dự kiến (mới): lý do của lần tạm khoá (ghi vào audit). */
  status_reason: string | null;
}

export type PlacementKind = "shared" | "dedicated";
export type SchemaState = "ready" | "behind" | "migrating";

/** Một nơi lưu dữ liệu (`GET /api/v1/kernel/placements`): không bao giờ có URL kết nối. */
export interface Placement {
  id: string;
  name: string;
  kind: PlacementKind;
  backend: "sqlite" | "postgres";
  schema_state: SchemaState;
  schema_checked_at: string | null;
  created_at: string;
  updated_at: string;
  /** Dự kiến (mới): migration còn chờ, `<module> <tên>`. */
  pending_migrations: string[];
  /** Dự kiến (mới): nơi đặt máy chủ database (vị trí dữ liệu theo luật, bước 33). */
  location: string;
  /** Database điều khiển (`main`): sổ khách, gói, nhân sự nền tảng. */
  control: boolean;
}

export const PROVISION_STEPS = [
  "created",
  "tenant_created",
  "database_ready",
  "migrated",
  "seeded",
  "subscribed",
  "invited",
  "done",
] as const;
export type ProvisionStep = (typeof PROVISION_STEPS)[number];
export type ProvisionStatus = "running" | "failed" | "done";

/** Một lượt cấp phát khách mới (`GET /api/v1/plans/provisionings/{id}`, bước 35 mục 5). */
export interface Provisioning {
  id: string;
  /** Sinh trước khi tạo khách, để chạy lại không tạo khách thứ hai. */
  tenant_id: string;
  signup_id: string | null;
  parent_tenant_id: string | null;
  tenant_name: string;
  /** Dự kiến (mới): bảng `plans_provisioning` của đặc tả chưa có `slug`, mà tạo khách cần. */
  slug: string;
  plan_id: string;
  price_id: string | null;
  placement: PlacementKind;
  /** Dự kiến (mới): placement dùng chung đã chọn (`pool-1`…), `null` = theo gói. */
  placement_name: string | null;
  admin_email: string;
  admin_name: string | null;
  sample_data: boolean;
  step: ProvisionStep;
  status: ProvisionStatus;
  last_error: string | null;
  reference: string;
  created_by: Ref | null;
  created_at: string;
  updated_at: string;
  /** Dự kiến (mới): lịch sử từng bước, mới nhất trước. */
  history: { at: string; step: ProvisionStep; failed?: boolean }[];
}

/** Dự kiến (mới): một lần xuất toàn bộ dữ liệu của khách (core mới có CLI `autoxide copy`). */
export interface TenantExport {
  id: string;
  tenant_id: string;
  status: "queued" | "running" | "done" | "failed";
  reason: string;
  requested_by: Ref;
  created_at: string;
  finished_at: string | null;
  size_bytes: number | null;
  /** Tệp xuất bị xoá sau thời điểm này. */
  expires_at: string | null;
}

// ---------------------------------------------------------------- Bước 35: gói, thuê bao

export type PlanKind = "base" | "addon";
export type PlanStatus = "draft" | "active" | "retired";

/** Một giá của gói (`plans_price`): không sửa; đổi giá = thêm giá mới, tắt giá cũ. */
export interface PlanPrice {
  id: string;
  plan_id: string;
  kind: "recurring" | "metered";
  interval: "month" | "year";
  interval_count: number;
  amount_minor: number;
  amount_currency: string;
  limit_key: string | null;
  included: number | null;
  active: boolean;
  created_at: string;
}

/** Một hạn mức của gói; `max_value = null` là không giới hạn. */
export interface PlanLimit {
  key: string;
  max_value: number | null;
}

/** Một gói (`GET /api/v1/plans/plans/{id}`). */
export interface Plan {
  id: string;
  code: string;
  name: string;
  description: string;
  kind: PlanKind;
  status: PlanStatus;
  is_default: boolean;
  trial_days: number;
  grace_days: number;
  suspend_days: number;
  retention_days: number;
  renewal_lead_days: number;
  placement: PlacementKind;
  requires_kyc: boolean;
  sample_data: boolean;
  modules: string[];
  features: string[];
  limits: PlanLimit[];
  prices: PlanPrice[];
  created_at: string;
  updated_at: string;
}

export type SubscriptionStatus =
  | "trialing"
  | "active"
  | "past_due"
  | "suspended"
  | "canceled"
  | "deleted";

/** Thuê bao của một khách, phía nhà vận hành (`GET /api/v1/plans/tenants/{tenant_id}/subscription`). */
export interface OperatorSubscription {
  id: string;
  tenant_id: string;
  plan_id: string;
  price_id: string;
  status: SubscriptionStatus;
  current_period_start: string;
  current_period_end: string;
  trial_ends_at: string | null;
  grace_ends_at: string | null;
  suspended_at: string | null;
  canceled_at: string | null;
  delete_after: string | null;
  cancel_at_period_end: boolean;
  scheduled_plan_id: string | null;
  trial_used: boolean;
  billing_email: string;
  addons: { plan_id: string; quantity: number }[];
  created_at: string;
  updated_at: string;
}

/** Một dòng lịch sử thuê bao (dự kiến (mới): từ event `subscription_status_changed`…). */
export interface SubscriptionEvent {
  tenant_id: string;
  at: string;
  kind: "status" | "plan" | "paid" | "note";
  from: SubscriptionStatus | null;
  to: SubscriptionStatus | null;
  text: string;
}

/** Một kỳ thanh toán của khách, phía nhà vận hành (dự kiến (mới): danh sách theo khách). */
export interface OperatorPeriod {
  id: string;
  tenant_id: string;
  kind: "initial" | "renewal" | "proration" | "metered";
  plan_id: string;
  period_start: string;
  period_end: string;
  amount_minor: number;
  amount_currency: string;
  status: "open" | "paid" | "void";
  due_at: string | null;
  paid_at: string | null;
  provider_reference: string | null;
}

/** Ghi đè quyền dùng cho một khách (`GET /api/v1/plans/tenants/{tenant_id}/overrides`). */
export interface Override {
  id: string;
  tenant_id: string;
  kind: "module" | "feature" | "limit";
  key: string;
  enabled: boolean | null;
  max_value: number | null;
  reason: string;
  expires_at: string | null;
  created_by: Ref;
  created_at: string;
}

/** Mức dùng một hạn mức của khách (`GET /api/v1/plans/tenants/{tenant_id}/usage`). */
export interface TenantUsage {
  key: string;
  unit: "count" | "bytes" | "requests";
  used: number;
  max: number | null;
  over_limit: boolean;
}

// ---------------------------------------------------------------- Bước 34: quyền vào hỗ trợ

/** Một lần cấp quyền vào dữ liệu khách (`GET /api/v1/auth/support-grants?tenant_id=`). */
export interface PlatformGrant {
  id: string;
  tenant_id: string;
  staff: Ref;
  role: Ref;
  basis: "support" | "legal_request";
  reason: string;
  legal_reference: string | null;
  granted_by: Ref;
  starts_at: string;
  expires_at: string;
  revoked_at: string | null;
  created_at: string;
}

// ---------------------------------------------------------------- Bước 39: sức khoẻ, backup

export interface ModuleBacklog {
  module: string;
  jobs_pending: number;
  jobs_oldest_pending_seconds: number;
  jobs_dead: number;
  events_pending: number;
  events_oldest_pending_seconds: number;
}

/** Một bản backup của một database (`GET /api/v1/kernel/ops/backups`). */
export interface BackupRecord {
  id: string;
  database_key: string;
  status: "running" | "succeeded" | "failed";
  storage_prefix: string;
  started_at: string;
  heartbeat_at: string;
  finished_at: string | null;
  size_bytes: number | null;
  rows: number | null;
  files: number | null;
  tables: number | null;
  autoxide_version: string;
  error: string | null;
}

/** Dự kiến (mới): cảnh báo đang bật (luật của `deploy/prometheus/autoxide-alerts.yml`). */
export interface OpsAlert {
  name: string;
  database_key: string;
  severity: "critical" | "warning";
  since: string;
  summary: string;
  action: string;
}

// ---------------------------------------------------------------- Chạy thử (dry-run)

/** Kết quả chạy thử của migration: placement nào chạy migration nào. Không đổi dữ liệu. */
export interface MigrationPlan {
  at: string;
  placements: { id: string; name: string; migrations: string[] }[];
  /** Số khách sẽ nhận 503 trong lúc chạy thật. */
  tenants: number;
}

// ---------------------------------------------------------------- Kho

/** Nhân sự nền tảng mẫu (cùng id với `org.ts`, nơi khách thấy họ trong sổ quyền vào). */
export const STAFF = {
  vy: { id: "01a1e000-0000-7000-8000-000000000f05", name: "Hà Vy (Autoxide)" },
  huy: { id: "01a1e000-0000-7000-8000-000000000f06", name: "Quang Huy (Autoxide)" },
  legal: { id: "legal", name: "Đội pháp chế (Autoxide)" },
  lead: { id: "ops", name: "Trưởng ca vận hành" },
} as const satisfies Record<string, Ref>;

/** Role của khách vận hành dùng khi vào hỗ trợ (như `support-read-only` của `org.ts`). */
export const SUPPORT_ROLES: readonly Ref[] = [
  { id: "01a1e000-0000-7000-8000-000000090007", name: "support-read-only" },
  { id: "01a1e000-0000-7000-8000-000000090008", name: "support-operator" },
];

const tid = (n: string) => `01a1e000-0000-7000-8000-0000000710${n}`;
const pid = (n: string) => `01a1e000-0000-7000-8000-0000000720${n}`;

/** Khách nền tảng (khách mặc định của bước 33, id cố định). */
export const PLATFORM_TENANT_ID = "00000000-0000-7000-8000-000000000001";
/** Khách mẫu mà không gian khách đang hiện (Bếp Mộc). */
export const SAMPLE_TENANT_ID = tid("01");

export const TENANT_IDS = {
  bepMoc: SAMPLE_TENANT_ID,
  bepMocDaNang: (SAMPLE_CHILD_TENANTS[0] as Ref).id,
  traSen: tid("03"),
  soTayBep: tid("04"),
  nhaSachGio: tid("05"),
  nsgHue: tid("06"),
  nsgDaLat: tid("07"),
  nsgCanTho: tid("08"),
  laXanh: tid("09"),
  mocHung: tid("10"),
  anhMay: tid("11"),
  hatDieu: tid("12"),
  mocMien: tid("13"),
  doiThong: tid("14"),
} as const;

export const PLACEMENT_IDS = {
  main: "00000000-0000-7000-8000-000000000002",
  pool1: pid("01"),
  pool2: pid("02"),
  bepmoc: pid("03"),
  nhasachgio: pid("04"),
  nsgHue: pid("05"),
  mochung: pid("06"),
} as const;

const planId = (n: string) => `01a1e000-0000-7000-8000-0000000c00${n}`;
const priceId = (n: string) => `01a1e000-0000-7000-8000-0000000c10${n}`;

export const PLAN_IDS = {
  content: planId("11"),
  starter: SAMPLE_PLAN_IDS.starter,
  pro: planId("12"),
  business: SAMPLE_PLAN_IDS.business,
  vip: planId("13"),
  storage: SAMPLE_PLAN_IDS.storage,
  channels: planId("14"),
  starter2025: planId("15"),
} as const;

/**
 * Module có thể bật theo gói, kèm module nó cần (sổ module ghi ai `require` ai). Dự kiến: lấy từ
 * `GET /api/v1/kernel/modules` (trường `requires` của bước 35).
 */
export const MODULE_REQUIRES: Readonly<Record<string, readonly string[]>> = {
  content: [],
  media: [],
  comments: [],
  forms: [],
  newsletter: [],
  ai: [],
  notifications: [],
  catalog: [],
  inventory: ["catalog"],
  promotions: ["catalog"],
  shipping: [],
  orders: ["catalog"],
  customers: [],
  marketplace: ["catalog", "orders"],
  channels: ["catalog", "orders"],
  affiliate: ["orders"],
};

/** Khoá hạn mức đã khai ở bước 35 (danh mục của máy chủ). */
export const LIMIT_KEYS = [
  "organizations.units",
  "auth.members",
  "files.storage_bytes",
  "kernel.api_requests",
  "catalog.products",
] as const;

/** Tính năng đã khai ở bước 35. */
export const FEATURE_KEYS = ["auth.api_keys", "content.ai_suggestions"] as const;

export interface Store {
  tenants: Tenant[];
  placements: Placement[];
  provisionings: Provisioning[];
  exports: TenantExport[];
  plans: Plan[];
  subscriptions: OperatorSubscription[];
  history: SubscriptionEvent[];
  periods: OperatorPeriod[];
  overrides: Override[];
  usage: Record<string, TenantUsage[]>;
  grants: PlatformGrant[];
  /** Khách bật / tắt `auth.support_access` (Bếp Mộc đọc thật từ `org.ts`). */
  supportAccess: Record<string, boolean>;
  backups: BackupRecord[];
  backlog: Record<string, ModuleBacklog[]>;
  alerts: OpsAlert[];
  /** Lần chạy thử gần nhất: chạy thật chỉ được sau khi đã chạy thử (đề xuất của bước 33). */
  dryRuns: {
    fleet: MigrationPlan | null;
    placements: Record<string, MigrationPlan>;
  };
  /** Hẹn giờ của việc chạy bằng job: placement đang migrate. */
  timers: {
    migrate: Record<string, number>;
    /** Lượt cấp phát sẽ dừng lỗi ở bước này (lần chạy đầu), để thấy được "Thử lại". */
    failAt: Record<string, ProvisionStep>;
  };
}

function at(now: number, offset: number): string {
  return new Date(now + offset).toISOString();
}

function seed(now: number): Store {
  const t = (offset: number) => at(now, offset);
  const tenant = (
    id: string,
    slug: string,
    name: string,
    placement: string,
    model: BusinessModel | null,
    domain: string | null,
    created: number,
    extra: Partial<Tenant> = {},
  ): Tenant => ({
    id,
    slug,
    name,
    status: "active",
    parent_id: null,
    placement_id: placement,
    created_at: t(-created * DAY),
    updated_at: t(-Math.min(created, 12) * DAY),
    is_platform: false,
    business_model: model,
    primary_domain: domain,
    status_reason: null,
    ...extra,
  });
  const P = PLACEMENT_IDS;
  const I = TENANT_IDS;
  const tenants: Tenant[] = [
    tenant(PLATFORM_TENANT_ID, "default", "Autoxide (nền tảng)", P.main, null, null, 420, {
      is_platform: true,
    }),
    tenant(I.bepMoc, "bep-moc", "Bếp Mộc", P.bepmoc, "marketplace", "bepmoc.example", 287),
    tenant(
      I.bepMocDaNang,
      "bep-moc-da-nang",
      "Bếp Mộc Đà Nẵng",
      P.pool1,
      "single_store",
      null,
      120,
      {
        parent_id: I.bepMoc,
      },
    ),
    tenant(I.traSen, "tra-sen", "Trà Sen", P.pool1, "multi_store", "trasen.example", 210),
    tenant(
      I.soTayBep,
      "so-tay-bep",
      "Sổ Tay Bếp",
      P.pool1,
      "content_only",
      "sotaybep.example",
      160,
    ),
    tenant(
      I.nhaSachGio,
      "nha-sach-gio",
      "Nhà Sách Gió",
      P.nhasachgio,
      "parent_child",
      "nhasachgio.example",
      330,
    ),
    tenant(I.nsgHue, "nha-sach-gio-hue", "Nhà Sách Gió Huế", P.nsgHue, "single_store", null, 200, {
      parent_id: I.nhaSachGio,
    }),
    tenant(
      I.nsgDaLat,
      "nha-sach-gio-da-lat",
      "Nhà Sách Gió Đà Lạt",
      P.pool2,
      "single_store",
      null,
      90,
      {
        parent_id: I.nhaSachGio,
      },
    ),
    tenant(
      I.nsgCanTho,
      "nha-sach-gio-can-tho",
      "Nhà Sách Gió Cần Thơ",
      P.pool2,
      "single_store",
      null,
      40,
      {
        parent_id: I.nhaSachGio,
      },
    ),
    tenant(
      I.laXanh,
      "nong-san-la-xanh",
      "Nông Sản Lá Xanh",
      P.pool2,
      "single_store",
      "laxanh.example",
      5,
    ),
    tenant(
      I.mocHung,
      "xuong-moc-hung",
      "Xưởng Mộc Hưng",
      P.mochung,
      "single_store",
      "mochung.example",
      400,
    ),
    tenant(
      I.anhMay,
      "studio-anh-may",
      "Studio Ảnh Mây",
      P.pool2,
      "content_only",
      "anhmay.example",
      230,
    ),
    tenant(
      I.hatDieu,
      "hat-dieu-binh-phuoc",
      "Hạt Điều Bình Phước",
      P.pool2,
      "single_store",
      null,
      2,
    ),
    tenant(
      I.mocMien,
      "tiem-banh-moc-mien",
      "Tiệm Bánh Mộc Miên",
      P.pool1,
      "single_store",
      null,
      0,
      {
        status: "provisioning",
        created_at: t(-2 * MINUTE),
        updated_at: t(-2 * MINUTE),
      },
    ),
    // Database riêng chưa sẵn sàng (cấp phát dừng ở bước chuẩn bị database): chưa có placement.
    tenant(I.doiThong, "ca-phe-doi-thong", "Cà Phê Đồi Thông", "", "multi_store", null, 2, {
      status: "provisioning",
    }),
  ];
  const placement = (
    id: string,
    name: string,
    kind: PlacementKind,
    backend: "sqlite" | "postgres",
    pending: string[],
    extra: Partial<Placement> = {},
  ): Placement => ({
    id,
    name,
    kind,
    backend,
    schema_state: pending.length > 0 ? "behind" : "ready",
    schema_checked_at: t(-2 * MINUTE),
    created_at: t(-300 * DAY),
    updated_at: t(-2 * MINUTE),
    pending_migrations: pending,
    location: "Việt Nam",
    control: false,
    ...extra,
  });
  const placements: Placement[] = [
    placement(P.main, "main", "shared", "postgres", [], {
      control: true,
      created_at: t(-420 * DAY),
    }),
    placement(P.pool1, "pool-1", "shared", "postgres", []),
    placement(P.pool2, "pool-2", "shared", "postgres", ["catalog m0007"]),
    placement(P.bepmoc, "bepmoc", "dedicated", "postgres", []),
    placement(P.nhasachgio, "nhasachgio", "dedicated", "postgres", [
      "catalog m0007",
      "orders m0012",
    ]),
    placement(P.nsgHue, "nsg-hue", "dedicated", "postgres", ["catalog m0007", "orders m0012"]),
    placement(P.mochung, "mochung", "dedicated", "sqlite", []),
  ];

  const price = (
    n: string,
    plan: string,
    interval: "month" | "year",
    amount: number,
    active = true,
  ): PlanPrice => ({
    id: n.length > 4 ? n : priceId(n),
    plan_id: plan,
    kind: "recurring",
    interval,
    interval_count: 1,
    amount_minor: amount,
    amount_currency: "VND",
    limit_key: null,
    included: null,
    active,
    created_at: t(-300 * DAY),
  });
  const S = SAMPLE_PLAN_IDS.prices;
  const plan = (
    id: string,
    code: string,
    name: string,
    description: string,
    modules: string[],
    prices: PlanPrice[],
    extra: Partial<Plan> = {},
  ): Plan => ({
    id,
    code,
    name,
    description,
    kind: "base",
    status: "active",
    is_default: false,
    trial_days: 14,
    grace_days: 7,
    suspend_days: 30,
    retention_days: 90,
    renewal_lead_days: 7,
    placement: "shared",
    requires_kyc: false,
    sample_data: true,
    modules,
    features: [],
    limits: [],
    prices,
    created_at: t(-300 * DAY),
    updated_at: t(-30 * DAY),
    ...extra,
  });
  const CONTENT = ["content", "media", "comments", "forms", "newsletter", "ai"];
  const STARTER = ["content", "media", "forms", "catalog", "inventory", "orders"];
  const PRO = [...STARTER, "comments", "promotions", "shipping", "ai"];
  const BUSINESS = [...PRO, "customers", "marketplace"];
  const VIP = [...BUSINESS, "channels", "affiliate"];
  const plans: Plan[] = [
    plan(
      PLAN_IDS.content,
      "noi-dung",
      "Nội dung",
      "Website nội dung: bài viết, media, bình luận, biểu mẫu, bản tin, AI.",
      CONTENT,
      [
        price("01", PLAN_IDS.content, "month", 290_000),
        price("02", PLAN_IDS.content, "year", 2_900_000),
      ],
      {
        limits: [
          { key: "auth.members", max_value: 10 },
          { key: "files.storage_bytes", max_value: 20_000_000_000 },
        ],
      },
    ),
    plan(
      PLAN_IDS.starter,
      "starter",
      "Khởi đầu",
      "Bán hàng một cửa hàng: sản phẩm, kho, đơn hàng, nội dung cơ bản.",
      STARTER,
      [
        price(S.starterMonth, PLAN_IDS.starter, "month", 990_000),
        price(S.starterYear, PLAN_IDS.starter, "year", 9_900_000),
      ],
      {
        is_default: true,
        limits: [
          { key: "organizations.units", max_value: 1 },
          { key: "catalog.products", max_value: 2000 },
          { key: "auth.members", max_value: 10 },
        ],
      },
    ),
    plan(
      PLAN_IDS.pro,
      "pro",
      "Pro",
      "Thêm khuyến mại, vận chuyển, AI và nhiều cửa hàng.",
      PRO,
      [
        price("03", PLAN_IDS.pro, "month", 1_290_000),
        price("04", PLAN_IDS.pro, "year", 12_900_000),
      ],
      {
        features: ["auth.api_keys", "content.ai_suggestions"],
        limits: [
          { key: "organizations.units", max_value: 10 },
          { key: "catalog.products", max_value: 10_000 },
        ],
      },
    ),
    plan(
      PLAN_IDS.business,
      "business",
      "Doanh nghiệp",
      "Mọi module bán hàng, kể cả sàn; database riêng; cần định danh (KYC) để mở sàn.",
      BUSINESS,
      [
        price(S.businessMonth, PLAN_IDS.business, "month", 11_880_000),
        price(S.businessYear, PLAN_IDS.business, "year", 118_800_000),
      ],
      {
        trial_days: 0,
        placement: "dedicated",
        requires_kyc: true,
        features: ["auth.api_keys", "content.ai_suggestions"],
        limits: [
          { key: "organizations.units", max_value: 50 },
          { key: "auth.members", max_value: 50 },
          { key: "files.storage_bytes", max_value: 200_000_000_000 },
          { key: "kernel.api_requests", max_value: 2_000_000 },
        ],
      },
    ),
    plan(
      PLAN_IDS.vip,
      "vip",
      "VIP",
      "Thêm bán đa kênh, tiếp thị liên kết, hạn mức riêng; chọn được nơi lưu.",
      VIP,
      [price("05", PLAN_IDS.vip, "year", 238_800_000)],
      {
        trial_days: 0,
        placement: "dedicated",
        requires_kyc: true,
        features: ["auth.api_keys", "content.ai_suggestions"],
        limits: [{ key: "organizations.units", max_value: null }],
      },
    ),
    plan(
      PLAN_IDS.storage,
      "storage-100gb",
      "Thêm 100 GB lưu trữ",
      "Cộng 100 GB vào files.storage_bytes cho mỗi đơn vị mua.",
      [],
      [price(S.storageYear, PLAN_IDS.storage, "year", 6_000_000)],
      {
        kind: "addon",
        trial_days: 0,
        limits: [{ key: "files.storage_bytes", max_value: 100_000_000_000 }],
      },
    ),
    plan(
      PLAN_IDS.channels,
      "da-kenh",
      "Đa kênh",
      "Bán trên sàn ngoài và mạng xã hội; cần orders và catalog trong gói chính.",
      ["channels"],
      [price("06", PLAN_IDS.channels, "month", 1_500_000)],
      { kind: "addon", status: "draft", trial_days: 0 },
    ),
    plan(
      PLAN_IDS.starter2025,
      "starter-2025",
      "Khởi đầu (2025)",
      "Gói cũ, đã thay bằng Khởi đầu.",
      STARTER,
      [price("07", PLAN_IDS.starter2025, "month", 390_000, false)],
      { status: "retired", updated_at: t(-250 * DAY) },
    ),
  ];

  const sub = (
    tenantId: string,
    plan: string,
    price: string,
    status: SubscriptionStatus,
    start: number,
    end: number,
    extra: Partial<OperatorSubscription> = {},
  ): OperatorSubscription => ({
    id: `01a1e000-0000-7000-8000-0000000750${tenantId.slice(-2)}`,
    tenant_id: tenantId,
    plan_id: plan,
    price_id: price,
    status,
    current_period_start: t(start),
    current_period_end: t(end),
    trial_ends_at: null,
    grace_ends_at: null,
    suspended_at: null,
    canceled_at: null,
    delete_after: null,
    cancel_at_period_end: false,
    scheduled_plan_id: null,
    trial_used: true,
    billing_email: "ketoan@example.com",
    addons: [],
    created_at: t(start),
    updated_at: t(-5 * DAY),
    ...extra,
  });
  const month = 30 * DAY;
  const subscriptions: OperatorSubscription[] = [
    sub(I.bepMocDaNang, PLAN_IDS.starter, S.starterMonth, "active", -10 * DAY, 20 * DAY),
    sub(I.traSen, PLAN_IDS.starter, S.starterMonth, "active", -14 * DAY, 16 * DAY),
    sub(I.soTayBep, PLAN_IDS.content, priceId("02"), "active", -100 * DAY, 265 * DAY),
    sub(I.nhaSachGio, PLAN_IDS.vip, priceId("05"), "active", -60 * DAY, 305 * DAY),
    sub(I.nsgHue, PLAN_IDS.pro, priceId("03"), "active", -12 * DAY, 18 * DAY),
    sub(I.nsgDaLat, PLAN_IDS.pro, priceId("03"), "active", -12 * DAY, 18 * DAY),
    sub(I.nsgCanTho, PLAN_IDS.starter, S.starterMonth, "trialing", -5 * DAY, 9 * DAY, {
      trial_ends_at: t(9 * DAY),
    }),
    sub(I.laXanh, PLAN_IDS.pro, priceId("03"), "trialing", -5 * DAY, 9 * DAY, {
      trial_ends_at: t(9 * DAY),
    }),
    sub(I.mocHung, PLAN_IDS.starter, S.starterMonth, "past_due", -month - 3 * DAY, -3 * DAY, {
      grace_ends_at: t(4 * DAY),
    }),
    sub(
      I.anhMay,
      PLAN_IDS.content,
      priceId("01"),
      "suspended",
      -2 * month - 18 * DAY,
      -month - 18 * DAY,
      {
        grace_ends_at: t(-month - 11 * DAY),
        suspended_at: t(-11 * DAY),
      },
    ),
    sub(I.hatDieu, PLAN_IDS.content, priceId("01"), "trialing", -2 * DAY, 12 * DAY, {
      trial_ends_at: t(12 * DAY),
    }),
  ];
  const ev = (
    tenantId: string,
    offset: number,
    kind: SubscriptionEvent["kind"],
    text: string,
    from: SubscriptionStatus | null = null,
    to: SubscriptionStatus | null = null,
  ): SubscriptionEvent => ({ tenant_id: tenantId, at: t(offset), kind, from, to, text });
  const history: SubscriptionEvent[] = [
    ev(I.mocHung, -3 * DAY, "status", "period_ended_unpaid", "active", "past_due"),
    ev(I.mocHung, -10 * DAY, "note", "renewal_reminder"),
    ev(I.anhMay, -11 * DAY, "status", "grace_ended", "past_due", "suspended"),
    ev(I.anhMay, -18 * DAY, "status", "period_ended_unpaid", "active", "past_due"),
    ev(I.bepMoc, -5 * DAY, "plan", "addon_added"),
    ev(I.laXanh, -5 * DAY, "status", "trial_started", null, "trialing"),
  ];
  const period = (
    n: string,
    tenantId: string,
    plan: string,
    amount: number,
    start: number,
    end: number,
    due: number,
  ): OperatorPeriod => ({
    id: `01a1e000-0000-7000-8000-0000000751${n}`,
    tenant_id: tenantId,
    kind: "renewal",
    plan_id: plan,
    period_start: t(start),
    period_end: t(end),
    amount_minor: amount,
    amount_currency: "VND",
    status: "open",
    due_at: t(due),
    paid_at: null,
    provider_reference: null,
  });
  const periods: OperatorPeriod[] = [
    period("01", I.mocHung, PLAN_IDS.starter, 990_000, -3 * DAY, 27 * DAY, -3 * DAY),
    period(
      "02",
      I.anhMay,
      PLAN_IDS.content,
      290_000,
      -month - 18 * DAY,
      -18 * DAY,
      -month - 18 * DAY,
    ),
  ];
  const override = (
    n: string,
    tenantId: string,
    kind: Override["kind"],
    key: string,
    value: { enabled?: boolean; max?: number },
    reason: string,
    expires: number | null,
  ): Override => ({
    id: `01a1e000-0000-7000-8000-0000000740${n}`,
    tenant_id: tenantId,
    kind,
    key,
    enabled: value.enabled ?? null,
    max_value: value.max ?? null,
    reason,
    expires_at: expires === null ? null : t(expires),
    created_by: STAFF.lead,
    created_at: t(-20 * DAY),
  });
  const overrides: Override[] = [
    override(
      "01",
      I.laXanh,
      "feature",
      "content.ai_suggestions",
      { enabled: true },
      "Thử AI trong lúc dùng thử",
      15 * DAY,
    ),
    override(
      "02",
      I.traSen,
      "limit",
      "catalog.products",
      { max: 2500 },
      "Mùa Tết, chờ nâng gói",
      46 * DAY,
    ),
    override(
      "03",
      I.anhMay,
      "limit",
      "files.storage_bytes",
      { max: 25_000_000_000 },
      "Bù lỗi đếm dung lượng tháng 9",
      null,
    ),
  ];
  const usage = (
    key: TenantUsage["key"],
    unit: TenantUsage["unit"],
    used: number,
    max: number | null,
  ): TenantUsage => ({
    key,
    unit,
    used,
    max,
    over_limit: max !== null && used > max,
  });
  const usages: Record<string, TenantUsage[]> = {
    [I.bepMocDaNang]: [
      usage("organizations.units", "count", 1, 1),
      usage("catalog.products", "count", 240, 2000),
    ],
    [I.traSen]: [
      usage("catalog.products", "count", 1804, 2500),
      usage("auth.members", "count", 4, 10),
    ],
    [I.soTayBep]: [
      usage("auth.members", "count", 6, 10),
      usage("files.storage_bytes", "bytes", 4_100_000_000, 20_000_000_000),
    ],
    [I.nhaSachGio]: [
      usage("organizations.units", "count", 12, null),
      usage("auth.members", "count", 64, null),
    ],
    [I.nsgHue]: [
      usage("organizations.units", "count", 3, 10),
      usage("catalog.products", "count", 4100, 10_000),
    ],
    [I.nsgDaLat]: [
      usage("organizations.units", "count", 2, 10),
      usage("catalog.products", "count", 3900, 10_000),
    ],
    [I.nsgCanTho]: [usage("catalog.products", "count", 120, 2000)],
    [I.laXanh]: [
      usage("catalog.products", "count", 312, 10_000),
      usage("organizations.units", "count", 1, 10),
    ],
    [I.mocHung]: [
      usage("catalog.products", "count", 420, 2000),
      usage("auth.members", "count", 3, 10),
    ],
    [I.anhMay]: [
      usage("files.storage_bytes", "bytes", 19_000_000_000, 25_000_000_000),
      usage("auth.members", "count", 2, 10),
    ],
    [I.hatDieu]: [usage("auth.members", "count", 1, 10)],
  };
  const grant = (
    n: string,
    tenantId: string,
    staff: Ref,
    basis: PlatformGrant["basis"],
    reason: string,
    start: number,
    hours: number,
    legal: string | null = null,
  ): PlatformGrant => ({
    id: `01a1e000-0000-7000-8000-0000000760${n}`,
    tenant_id: tenantId,
    staff,
    role: SUPPORT_ROLES[0] as Ref,
    basis,
    reason,
    legal_reference: legal,
    granted_by: STAFF.lead,
    starts_at: t(start),
    expires_at: t(start + hours * HOUR),
    revoked_at: null,
    created_at: t(start),
  });
  const grants: PlatformGrant[] = [
    grant(
      "02",
      I.traSen,
      STAFF.huy,
      "support",
      "Nhập CSV sản phẩm lỗi, phiếu hỗ trợ #1042",
      -DAY,
      1,
    ),
    grant(
      "01",
      I.anhMay,
      STAFF.vy,
      "support",
      "Khách hỏi vì sao chỉ đọc sau khi đã chuyển khoản",
      -9 * DAY,
      4,
    ),
  ];
  const provisioning = (
    n: string,
    tenantId: string,
    name: string,
    slug: string,
    plan: string,
    placementKind: PlacementKind,
    placementName: string | null,
    email: string,
    step: ProvisionStep,
    status: ProvisionStatus,
    offset: number,
    extra: Partial<Provisioning> = {},
  ): Provisioning => {
    const index = PROVISION_STEPS.indexOf(step);
    return {
      id: `01a1e000-0000-7000-8000-0000000730${n}`,
      tenant_id: tenantId,
      signup_id: null,
      parent_tenant_id: null,
      tenant_name: name,
      slug,
      plan_id: plan,
      price_id: null,
      placement: placementKind,
      placement_name: placementName,
      admin_email: email,
      admin_name: null,
      sample_data: true,
      step,
      status,
      last_error: null,
      reference: `plans:provision:${tenantId}`,
      created_by: STAFF.lead,
      created_at: t(offset - index * MINUTE),
      updated_at: t(offset),
      history: PROVISION_STEPS.slice(0, index + 1)
        .map((s, i) => ({ at: t(offset - (index - i) * MINUTE), step: s }))
        .reverse(),
      ...extra,
    };
  };
  const provisionings: Provisioning[] = [
    provisioning(
      "03",
      I.mocMien,
      "Tiệm Bánh Mộc Miên",
      "tiem-banh-moc-mien",
      PLAN_IDS.starter,
      "shared",
      "pool-1",
      "mien@example.com",
      "migrated",
      "running",
      0,
    ),
    provisioning(
      "02",
      I.doiThong,
      "Cà Phê Đồi Thông",
      "ca-phe-doi-thong",
      PLAN_IDS.pro,
      "dedicated",
      null,
      "chu@example.com",
      "tenant_created",
      "failed",
      -2 * DAY,
      {
        last_error:
          "plans.provisioning_failed: database_ready — the dedicated placement has no connection URL yet",
      },
    ),
    provisioning(
      "01",
      I.hatDieu,
      "Hạt Điều Bình Phước",
      "hat-dieu-binh-phuoc",
      PLAN_IDS.content,
      "shared",
      "pool-2",
      "hatdieu@example.com",
      "done",
      "done",
      -2 * DAY,
      {
        signup_id: "01a1e000-0000-7000-8000-000000073101",
        created_by: null,
      },
    ),
  ];
  const failedStep = provisionings[1];
  if (failedStep)
    failedStep.history.unshift({ at: t(-2 * DAY), step: "database_ready", failed: true });
  const backup = (
    n: string,
    database: string,
    status: BackupRecord["status"],
    offset: number,
    size: number | null,
    error: string | null = null,
  ): BackupRecord => ({
    id: `01a1e000-0000-7000-8000-0000000770${n}`,
    database_key: database,
    status,
    storage_prefix: `kernel/backups/${database}/01a1e000-0000-7000-8000-0000000770${n}/`,
    started_at: t(offset),
    heartbeat_at: t(offset + 4 * MINUTE),
    finished_at: status === "running" ? null : t(offset + 6 * MINUTE),
    size_bytes: size,
    rows: size === null ? null : Math.round(size / 900),
    files: 0,
    tables: size === null ? null : 104,
    autoxide_version: "0.14.0",
    error,
  });
  const backups: BackupRecord[] = [
    backup(
      "07",
      "nhasachgio",
      "failed",
      -7 * HOUR,
      null,
      "kernel.backup_sink_full: the backup storage is full",
    ),
    backup("06", "mochung", "succeeded", -7 * HOUR - 20 * MINUTE, 380_000_000),
    backup("05", "nsg-hue", "succeeded", -7 * HOUR - 30 * MINUTE, 920_000_000),
    backup("04", "bepmoc", "succeeded", -7 * HOUR - 40 * MINUTE, 6_400_000_000),
    backup("03", "pool-2", "succeeded", -7 * HOUR - 50 * MINUTE, 3_200_000_000),
    backup("02", "pool-1", "succeeded", -7 * HOUR - 55 * MINUTE, 4_100_000_000),
    backup("01", "main", "succeeded", -7 * HOUR - 58 * MINUTE, 1_800_000_000),
    backup("00", "nhasachgio", "succeeded", -2 * DAY, 2_600_000_000),
  ];
  const mod = (
    module: string,
    jobs: number,
    oldest: number,
    dead: number,
    events: number,
    eventsOldest: number,
  ): ModuleBacklog => ({
    module,
    jobs_pending: jobs,
    jobs_oldest_pending_seconds: oldest,
    jobs_dead: dead,
    events_pending: events,
    events_oldest_pending_seconds: eventsOldest,
  });
  const backlog: Record<string, ModuleBacklog[]> = {
    main: [mod("plans", 7, 40, 0, 2, 5), mod("auth", 3, 12, 0, 0, 0)],
    "pool-1": [mod("orders", 388, 210, 2, 31, 38), mod("media", 21, 30, 0, 0, 0)],
    "pool-2": [mod("media", 612, 240, 11, 4, 9), mod("newsletter", 54, 60, 0, 6, 12)],
    bepmoc: [mod("invoices", 41, 90, 3, 0, 0), mod("orders", 12, 20, 0, 3, 4)],
    nhasachgio: [mod("catalog", 9, 15, 1, 1, 2)],
    "nsg-hue": [mod("catalog", 4, 10, 0, 0, 0)],
    mochung: [mod("orders", 2, 5, 0, 0, 0)],
  };
  const alerts: OpsAlert[] = [
    {
      name: "AutoxideDeadLetterGrowing",
      database_key: "pool-2",
      severity: "critical",
      since: t(-58 * MINUTE),
      summary: "Job media.webp failed 9 times in the last hour.",
      action: "autoxide jobs failed → fix the cause → autoxide jobs retry",
    },
    {
      name: "AutoxideBackupTooOld",
      database_key: "nhasachgio",
      severity: "warning",
      since: t(-7 * HOUR),
      summary: "The last good backup is 2 days old; last night's run failed: storage full.",
      action: "Read kernel_backups.error, free the backup storage, run autoxide backup by hand",
    },
  ];
  return {
    tenants,
    placements,
    provisionings,
    exports: [
      {
        id: "01a1e000-0000-7000-8000-000000078001",
        tenant_id: I.mocHung,
        status: "done",
        reason: "Khách xin bản sao trước khi hết ân hạn",
        requested_by: STAFF.vy,
        created_at: t(-2 * DAY),
        finished_at: t(-2 * DAY + 6 * MINUTE),
        size_bytes: 410_000_000,
        expires_at: t(5 * DAY),
      },
    ],
    plans,
    subscriptions,
    history,
    periods,
    overrides,
    usage: usages,
    grants,
    supportAccess: { [I.soTayBep]: false },
    backups,
    backlog,
    alerts,
    dryRuns: { fleet: null, placements: {} },
    timers: { migrate: {}, failAt: {} },
  };
}

// Kho giữ trên `globalThis`: Next.js có thể nạp lại module khi chạy thử, kho vẫn còn. Số phiên bản
// trong khoá đổi khi dữ liệu ban đầu đổi, để máy chủ dev đang chạy không giữ kho cũ.
const KEY = Symbol.for("autoxide.sample.platform.2");
type Holder = { [KEY]?: Store };

export function store(): Store {
  const holder = globalThis as Holder;
  holder[KEY] ??= seed(Date.now());
  return holder[KEY];
}

/** Về dữ liệu ban đầu (test); `now` cố định để test không phụ thuộc đồng hồ. */
export function resetSamplePlatform(now = Date.now()): void {
  (globalThis as Holder)[KEY] = seed(now);
}

export function iso(now: number, offset = 0): string {
  return new Date(now + offset).toISOString();
}

export const DURATION = { SECOND, MINUTE, HOUR, DAY } as const;
