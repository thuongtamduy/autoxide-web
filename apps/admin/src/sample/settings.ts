// Dữ liệu mẫu của màn Cài đặt chung cho các tab core chưa có API: gói và thuê bao (bước 35), tên
// miền (bước 33), kết nối đối tác (cài đặt theo khách của bước 33; nhà cung cấp của bước 36, 39),
// job (bước 52). Hình dạng theo đặc tả bước ở `docs/steps/` của core; nội dung lấy từ bản thiết kế
// (chuỗi "Bếp Mộc"); email dùng miền `example.com`, mã số thuế và số điện thoại ghi rõ là mẫu.
//
// Lệnh ghi đổi một kho trong bộ nhớ của tiến trình máy chủ; khởi động lại thì về ban đầu.
import type { Problem } from "@autoxide/sdk";
import { type SamplePage, samplePage } from "./index";

export type SampleOutcome<T> = { ok: true; data: T } | { ok: false; problem: Problem };

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

function at(offset: number): string {
  return new Date(Date.now() + offset).toISOString();
}

function invalid(errors: NonNullable<Problem["errors"]>): SampleOutcome<never> {
  return {
    ok: false,
    problem: {
      type: "about:blank",
      title: "Unprocessable Entity",
      status: 422,
      code: "validation_failed",
      detail: "The request has invalid fields.",
      errors,
    },
  };
}

function failed(status: number, code: string, detail: string): SampleOutcome<never> {
  return { ok: false, problem: { type: "about:blank", title: "Error", status, code, detail } };
}

// ---------------------------------------------------------------- Bước 35: gói và thuê bao

export type PriceInterval = "month" | "year";

/** Một mức giá của gói: số nguyên đồng + mã tiền tệ, như mọi số tiền của core. */
export interface Price {
  id: string;
  interval: PriceInterval;
  amount_minor: number;
  amount_currency: string;
}

/** Gói bán được (`GET /api/v1/plans/catalog`). */
export interface CatalogPlan {
  id: string;
  code: string;
  name: string;
  kind: "base" | "addon";
  /** Số module gói mở. */
  modules: number;
  prices: Price[];
}

export type SubscriptionStatus =
  | "trialing"
  | "active"
  | "past_due"
  | "suspended"
  | "canceled"
  | "deleted";

/** Thuê bao của khách (`GET /api/v1/plans/subscription`). */
export interface Subscription {
  id: string;
  /** Dự kiến: API trả kèm tên gói và giá để màn không phải gọi thêm. */
  plan: { id: string; name: string; modules: number };
  price: Price;
  status: SubscriptionStatus;
  current_period_start: string;
  current_period_end: string;
  cancel_at_period_end: boolean;
  /** Hạ gói chờ hết kỳ. */
  scheduled_plan: { id: string; name: string } | null;
  addons: { plan: { id: string; name: string }; quantity: number; price: Price; since: string }[];
  updated_at: string;
}

/** Một hạn mức kèm lượng đã dùng (`GET /api/v1/plans/entitlements`, phần `limits`). */
export interface LimitUsage {
  /** Khoá hạn mức, vd `organizations.units`. */
  key: string;
  unit: "count" | "bytes" | "requests";
  /** `none`: đếm suốt đời; `month`: đặt lại đầu mỗi tháng. */
  period: "none" | "month";
  used: number;
  max: number;
  over_limit: boolean;
}

export type BillingPeriodStatus = "open" | "paid" | "void";

/** Một kỳ thanh toán (`GET /api/v1/plans/billing-periods`). */
export interface BillingPeriod {
  id: string;
  kind: "initial" | "renewal" | "proration" | "metered";
  /** Dự kiến: kèm tên gói. */
  plan: { id: string; name: string };
  period_start: string;
  period_end: string;
  amount_minor: number;
  amount_currency: string;
  status: BillingPeriodStatus;
  due_at: string | null;
  paid_at: string | null;
  invoice_number: string | null;
  created_at: string;
}

/** Hồ sơ xuất hoá đơn (`GET/PUT /api/v1/plans/billing-profile`). */
export interface BillingProfile {
  legal_name: string;
  tax_code: string;
  email: string;
  phone: string;
  address_province_code: string;
  address_commune: string;
  address_line: string;
  updated_at: string;
}

export type BillingProfileInput = Omit<BillingProfile, "updated_at">;

// ---------------------------------------------------------------- Bước 33, 36, 39: kết nối đối tác

export type ConnectionId = "mail" | "sms" | "payment" | "einvoice";

/** Một cài đặt theo khách (`GET /api/v1/kernel/settings`): secret không bao giờ trả giá trị. */
export interface TenantSetting {
  /** `<module>.connection.<loại>.<trường>` (D-297 của core), vd `mail.connection.smtp.url`. */
  name: string;
  secret: boolean;
  is_set: boolean;
  /** Giá trị của cài đặt thường; `null` với secret hay khi chưa đặt. */
  value: string | null;
  updated_at: string | null;
}

/**
 * Một kết nối đối tác: nhóm cài đặt của một nhà cung cấp, kèm kết quả lần kiểm tra gần nhất
 * (đề xuất `POST /api/v1/kernel/settings/{name}/test`, `last_used_at`, `last_error`).
 */
export interface Connection {
  id: ConnectionId;
  settings: TenantSetting[];
  last_check: { at: string; ok: boolean; error: string | null } | null;
}

// ---------------------------------------------------------------- Bước 52: job

export type JobStatus = "running" | "retrying" | "dead" | "done";

/** Một job của khách (dự kiến `GET /api/v1/kernel/jobs`, bàn kỹ thuật của bước 52). */
export interface Job {
  id: string;
  /** Loại job, `<module>.<việc>`. */
  kind: string;
  module: string;
  /** Tóm tắt cho người đọc (module khai). */
  title: string;
  requested_by: { id: string; name: string } | null;
  status: JobStatus;
  attempts: number;
  max_attempts: number;
  progress: { done: number; total: number | null; unit: string } | null;
  last_error: string | null;
  started_at: string;
  finished_at: string | null;
}

// ---------------------------------------------------------------- Kho

interface Store {
  catalog: CatalogPlan[];
  subscription: Subscription;
  limits: LimitUsage[];
  periods: BillingPeriod[];
  profile: BillingProfile;
  connections: Connection[];
  jobs: Job[];
}

const id = (n: string) => `01a1e000-0000-7000-8000-0000000c${n}`;

const PLAN_STARTER = id("0001");
const PLAN_BUSINESS = id("0002");
const PLAN_STORAGE = id("0003");
const PRICE = {
  starterMonth: id("1001"),
  starterYear: id("1002"),
  businessMonth: id("1003"),
  businessYear: id("1004"),
  storageYear: id("1005"),
};

const vnd = (pid: string, interval: PriceInterval, amount: number): Price => ({
  id: pid,
  interval,
  amount_minor: amount,
  amount_currency: "VND",
});

function setting(name: string, secret: boolean, value: string | null, days: number | null) {
  return {
    name,
    secret,
    is_set: value !== null,
    value: secret ? null : value,
    updated_at: days === null ? null : at(-days * DAY),
  } satisfies TenantSetting;
}

/** Cài đặt của từng kết nối: tên, có phải secret, có bắt buộc. */
export const CONNECTION_SETTINGS: Record<
  ConnectionId,
  { name: string; secret: boolean; required: boolean }[]
> = {
  mail: [
    { name: "mail.connection.smtp.url", secret: true, required: true },
    { name: "mail.connection.smtp.from", secret: false, required: true },
  ],
  sms: [
    { name: "sms.connection.gateway.provider", secret: false, required: true },
    { name: "sms.connection.gateway.brandname", secret: false, required: true },
    { name: "sms.connection.gateway.api_key", secret: true, required: true },
  ],
  payment: [
    { name: "payments.connection.gateway.provider", secret: false, required: true },
    { name: "payments.connection.gateway.merchant_id", secret: false, required: true },
    { name: "payments.connection.gateway.secret_key", secret: true, required: true },
  ],
  einvoice: [
    { name: "invoices.connection.einvoice.provider", secret: false, required: true },
    { name: "invoices.connection.einvoice.username", secret: false, required: true },
    { name: "invoices.connection.einvoice.certificate", secret: true, required: true },
  ],
};

function seed(): Store {
  const starter: CatalogPlan = {
    id: PLAN_STARTER,
    code: "starter",
    name: "Khởi đầu",
    kind: "base",
    modules: 6,
    prices: [vnd(PRICE.starterMonth, "month", 990_000), vnd(PRICE.starterYear, "year", 9_900_000)],
  };
  const business: CatalogPlan = {
    id: PLAN_BUSINESS,
    code: "business",
    name: "Doanh nghiệp",
    kind: "base",
    modules: 12,
    prices: [
      vnd(PRICE.businessMonth, "month", 11_880_000),
      vnd(PRICE.businessYear, "year", 118_800_000),
    ],
  };
  const storage: CatalogPlan = {
    id: PLAN_STORAGE,
    code: "storage-100gb",
    name: "Thêm 100 GB lưu trữ",
    kind: "addon",
    modules: 0,
    prices: [vnd(PRICE.storageYear, "year", 6_000_000)],
  };
  const start = at(-287 * DAY);
  const end = at(78 * DAY);
  const ref = (plan: CatalogPlan) => ({ id: plan.id, name: plan.name });
  return {
    catalog: [starter, business, storage],
    subscription: {
      id: id("2001"),
      plan: { id: business.id, name: business.name, modules: business.modules },
      price: business.prices[1] as Price,
      status: "active",
      current_period_start: start,
      current_period_end: end,
      cancel_at_period_end: false,
      scheduled_plan: null,
      addons: [
        { plan: ref(storage), quantity: 1, price: storage.prices[0] as Price, since: at(-5 * DAY) },
      ],
      updated_at: at(-5 * DAY),
    },
    limits: [
      { key: "organizations.units", unit: "count", period: "none", used: 14, max: 50 },
      { key: "auth.members", unit: "count", period: "none", used: 23, max: 50 },
      {
        key: "files.storage_bytes",
        unit: "bytes",
        period: "none",
        used: 38_200_000_000,
        max: 200_000_000_000,
      },
      {
        key: "kernel.api_requests",
        unit: "requests",
        period: "month",
        used: 412_300,
        max: 2_000_000,
      },
    ].map((limit) => ({ ...limit, over_limit: limit.used > limit.max }) as LimitUsage),
    periods: [
      {
        id: id("3003"),
        kind: "proration",
        plan: ref(storage),
        period_start: at(-5 * DAY),
        period_end: end,
        amount_minor: 1_364_383,
        amount_currency: "VND",
        status: "open",
        due_at: at(5 * DAY),
        paid_at: null,
        invoice_number: null,
        created_at: at(-5 * DAY),
      },
      {
        id: id("3002"),
        kind: "proration",
        plan: ref(storage),
        period_start: at(-5 * DAY),
        period_end: end,
        amount_minor: 1_150_684,
        amount_currency: "VND",
        status: "void",
        due_at: null,
        paid_at: null,
        invoice_number: null,
        created_at: at(-6 * DAY),
      },
      {
        id: id("3001"),
        kind: "renewal",
        plan: ref(business),
        period_start: start,
        period_end: end,
        amount_minor: 118_800_000,
        amount_currency: "VND",
        status: "paid",
        due_at: at(-290 * DAY),
        paid_at: at(-291 * DAY),
        invoice_number: "[SỐ HOÁ ĐƠN MẪU]",
        created_at: at(-294 * DAY),
      },
    ],
    profile: {
      legal_name: "Công ty TNHH Bếp Mộc (mẫu)",
      tax_code: "[MÃ SỐ THUẾ MẪU]",
      email: "ketoan@example.com",
      phone: "[SỐ ĐIỆN THOẠI MẪU]",
      address_province_code: "79",
      address_commune: "Phường Xuân Hoà",
      address_line: "[Số nhà, đường mẫu]",
      updated_at: at(-40 * DAY),
    },
    connections: [
      {
        id: "mail",
        settings: [
          setting("mail.connection.smtp.url", true, "set", 13),
          setting("mail.connection.smtp.from", false, "Bếp Mộc <no-reply@example.com>", 13),
        ],
        last_check: { at: at(-2 * HOUR), ok: true, error: null },
      },
      {
        id: "sms",
        settings: [
          setting("sms.connection.gateway.provider", false, null, null),
          setting("sms.connection.gateway.brandname", false, null, null),
          setting("sms.connection.gateway.api_key", true, null, null),
        ],
        last_check: null,
      },
      {
        id: "payment",
        settings: [
          setting("payments.connection.gateway.provider", false, "Đối tác thu hộ (mẫu)", 250),
          setting("payments.connection.gateway.merchant_id", false, "[MÃ NGƯỜI BÁN MẪU]", 250),
          setting("payments.connection.gateway.secret_key", true, "set", 250),
        ],
        last_check: { at: at(-HOUR), ok: true, error: null },
      },
      {
        id: "einvoice",
        settings: [
          setting(
            "invoices.connection.einvoice.provider",
            false,
            "Nhà cung cấp hoá đơn (mẫu)",
            300,
          ),
          setting("invoices.connection.einvoice.username", false, "[TÀI KHOẢN MẪU]", 300),
          setting("invoices.connection.einvoice.certificate", true, "set", 300),
        ],
        last_check: {
          at: at(-3 * HOUR),
          ok: false,
          error: "The signing certificate has expired.",
        },
      },
    ],
    jobs: [
      job("05", "orders.export_csv", "Xuất CSV đơn tháng 10", "Lan Phạm", "running", 1, {
        done: 2480,
        total: 4000,
        unit: "rows",
      }),
      {
        ...job("04", "invoices.send", "Gửi hoá đơn BM-2611-0388", null, "retrying", 3, null),
        last_error: "Provider answered 503 Service Unavailable.",
        started_at: at(-80 * MINUTE),
      },
      {
        ...job("03", "media.make_variants", "Tạo ảnh WebP cho 120 ảnh", "Minh Anh", "dead", 8, {
          done: 89,
          total: 120,
          unit: "images",
        }),
        last_error: "Image decoder ran out of memory on photo 90.",
        started_at: at(-14 * HOUR),
      },
      {
        ...job("02", "orders.print_slips", "In phiếu giao 38 đơn", "Ngô Mai", "done", 1, {
          done: 38,
          total: 38,
          unit: "slips",
        }),
        started_at: at(-5 * HOUR),
        finished_at: at(-5 * HOUR + 2 * MINUTE),
      },
      {
        ...job("01", "forms.export", "Xuất bài gửi biểu mẫu Liên hệ", "Minh Anh", "done", 1, {
          done: 1204,
          total: null,
          unit: "rows",
        }),
        started_at: at(-DAY - 3 * HOUR),
        finished_at: at(-DAY - 3 * HOUR + MINUTE),
      },
    ],
  };
}

function job(
  n: string,
  kind: string,
  title: string,
  by: string | null,
  status: JobStatus,
  attempts: number,
  progress: Job["progress"],
): Job {
  return {
    id: id(`60${n}`),
    kind,
    module: kind.slice(0, kind.indexOf(".")),
    title,
    requested_by: by ? { id: id(`70${n}`), name: by } : null,
    status,
    attempts,
    max_attempts: 8,
    progress,
    last_error: null,
    started_at: at(-30 * MINUTE),
    finished_at: null,
  };
}

// Kho giữ trên `globalThis`: Next.js có thể nạp lại module khi chạy thử, kho vẫn còn.
const KEY = Symbol.for("autoxide.sample.settings");
type Holder = { [KEY]?: Store };

function store(): Store {
  const holder = globalThis as Holder;
  holder[KEY] ??= seed();
  return holder[KEY];
}

/** Về dữ liệu ban đầu (test). */
export function resetSampleSettings(): void {
  (globalThis as Holder)[KEY] = seed();
}

// ---------------------------------------------------------------- Hàm: gói và thuê bao

/** Thay bằng GET /api/v1/plans/subscription (bước 35) khi core có. */
export async function getSubscription(): Promise<{ data: Subscription }> {
  return { data: structuredClone(store().subscription) };
}

/** Thay bằng GET /api/v1/plans/entitlements (bước 35, phần `limits`) khi core có. */
export async function listLimits(): Promise<{ data: LimitUsage[] }> {
  return { data: structuredClone(store().limits) };
}

/** Thay bằng GET /api/v1/plans/catalog (bước 35) khi core có. */
export async function listCatalog(): Promise<{ data: CatalogPlan[] }> {
  return { data: structuredClone(store().catalog) };
}

/** Thay bằng GET /api/v1/plans/billing-periods?status= (bước 35) khi core có. Mới nhất trước. */
export async function listBillingPeriods(
  query: { status?: BillingPeriodStatus; limit?: number; cursor?: string } = {},
): Promise<SamplePage<BillingPeriod>> {
  const list = store().periods.filter((p) => !query.status || p.status === query.status);
  return samplePage(structuredClone(list), query);
}

/**
 * Thay bằng POST /api/v1/plans/subscription/change (bước 35) khi core có. Nâng gói có hiệu lực
 * ngay (và lập kỳ bù); hạ gói chờ hết kỳ.
 */
export async function changePlan(priceId: string): Promise<SampleOutcome<Subscription>> {
  const s = store();
  const plan = s.catalog.find((p) => p.kind === "base" && p.prices.some((x) => x.id === priceId));
  const price = plan?.prices.find((x) => x.id === priceId);
  if (!plan || !price) {
    return invalid([{ field: "price_id", code: "unknown", detail: "is not a price on sale" }]);
  }
  if (price.id === s.subscription.price.id) {
    return failed(409, "plans.same_plan", "This is already your plan and price.");
  }
  const current = s.catalog.find((p) => p.id === s.subscription.plan.id);
  const upgrade = (current?.modules ?? 0) <= plan.modules;
  if (upgrade) {
    s.subscription.plan = { id: plan.id, name: plan.name, modules: plan.modules };
    s.subscription.price = { ...price };
    s.subscription.scheduled_plan = null;
  } else {
    s.subscription.scheduled_plan = { id: plan.id, name: plan.name };
  }
  s.subscription.updated_at = new Date().toISOString();
  return { ok: true, data: structuredClone(s.subscription) };
}

/** Thay bằng POST /api/v1/plans/subscription/cancel `{at_period_end: true}` (bước 35) khi core có. */
export async function cancelRenewal(): Promise<SampleOutcome<Subscription>> {
  const s = store();
  if (s.subscription.cancel_at_period_end) {
    return failed(409, "plans.already_canceled", "Renewal is already canceled.");
  }
  s.subscription.cancel_at_period_end = true;
  s.subscription.updated_at = new Date().toISOString();
  return { ok: true, data: structuredClone(s.subscription) };
}

/** Thay bằng POST /api/v1/plans/subscription/resume (bước 35) khi core có. */
export async function resumeRenewal(): Promise<SampleOutcome<Subscription>> {
  const s = store();
  s.subscription.cancel_at_period_end = false;
  s.subscription.updated_at = new Date().toISOString();
  return { ok: true, data: structuredClone(s.subscription) };
}

/** Thay bằng GET /api/v1/plans/billing-profile (bước 35) khi core có. */
export async function getBillingProfile(): Promise<{ data: BillingProfile }> {
  return { data: { ...store().profile } };
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
/** Mã số thuế: 10 chữ số, hoặc 10 chữ số + "-" + 3 chữ số (chi nhánh); giữ được chữ "mẫu". */
const TAX_CODE = /^(\d{10}(-\d{3})?|\[.*\])$/;

/** Thay bằng PUT /api/v1/plans/billing-profile (bước 35) khi core có. Gom mọi lỗi một lần. */
export async function updateBillingProfile(
  input: BillingProfileInput,
): Promise<SampleOutcome<BillingProfile>> {
  const errors: NonNullable<Problem["errors"]> = [];
  if (!input.legal_name.trim()) {
    errors.push({ field: "legal_name", code: "required", detail: "must not be empty" });
  }
  if (!TAX_CODE.test(input.tax_code.trim())) {
    errors.push({ field: "tax_code", code: "tax_code", detail: "must be 10 or 13 digits" });
  }
  if (!EMAIL.test(input.email.trim())) {
    errors.push({ field: "email", code: "email", detail: "must be an email address" });
  }
  if (errors.length > 0) return invalid(errors);
  const s = store();
  s.profile = { ...input, updated_at: new Date().toISOString() };
  return { ok: true, data: { ...s.profile } };
}

// ---------------------------------------------------------------- Hàm: kết nối đối tác

/** Thay bằng GET /api/v1/kernel/settings (bước 33) khi core có, nhóm theo nhà cung cấp. */
export async function listConnections(): Promise<{ data: Connection[] }> {
  return { data: structuredClone(store().connections) };
}

/**
 * Thay bằng PUT /api/v1/kernel/settings/{name} cho từng cài đặt (bước 33) khi core có. Ô secret để
 * trống thì giữ giá trị cũ (nếu đã đặt); ô bắt buộc còn trống thì báo, gom mọi lỗi một lần.
 */
export async function saveConnection(
  connectionId: ConnectionId,
  values: Readonly<Record<string, string>>,
): Promise<SampleOutcome<Connection>> {
  const connection = store().connections.find((c) => c.id === connectionId);
  if (!connection) {
    return failed(404, "kernel.setting_not_found", "This connection does not exist.");
  }
  const errors: NonNullable<Problem["errors"]> = [];
  for (const spec of CONNECTION_SETTINGS[connectionId]) {
    const current = connection.settings.find((x) => x.name === spec.name);
    const value = (values[spec.name] ?? "").trim();
    const keeps = spec.secret && value === "" && current?.is_set === true;
    if (spec.required && value === "" && !keeps) {
      errors.push({ field: spec.name, code: "required", detail: "must not be empty" });
    }
  }
  if (errors.length > 0) return invalid(errors);
  const now = new Date().toISOString();
  for (const item of connection.settings) {
    const value = (values[item.name] ?? "").trim();
    if (item.secret && value === "") continue;
    item.is_set = value !== "";
    item.value = item.secret || value === "" ? null : value;
    item.updated_at = now;
  }
  // Giá trị mới: kết quả kiểm tra cũ không còn đúng.
  connection.last_check = null;
  return { ok: true, data: structuredClone(connection) };
}

/**
 * Thay bằng POST /api/v1/kernel/settings/{name}/test (đề xuất cho bước 33, chưa có trong lộ trình)
 * khi core có. Bản mẫu: đủ cài đặt bắt buộc thì đạt, trừ hoá đơn điện tử chưa đổi chứng thư.
 */
export async function testConnection(
  connectionId: ConnectionId,
): Promise<SampleOutcome<Connection>> {
  const connection = store().connections.find((c) => c.id === connectionId);
  if (!connection) {
    return failed(404, "kernel.setting_not_found", "This connection does not exist.");
  }
  const missing = CONNECTION_SETTINGS[connectionId].filter(
    (spec) => spec.required && !connection.settings.find((x) => x.name === spec.name)?.is_set,
  );
  const stale =
    connectionId === "einvoice" &&
    connection.last_check?.ok === false &&
    connection.last_check.error !== null;
  const error =
    missing.length > 0
      ? `Missing settings: ${missing.map((m) => m.name).join(", ")}.`
      : stale
        ? (connection.last_check?.error ?? null)
        : null;
  connection.last_check = { at: new Date().toISOString(), ok: error === null, error };
  return { ok: true, data: structuredClone(connection) };
}

// ---------------------------------------------------------------- Hàm: job

/** Thay bằng GET /api/v1/kernel/jobs?status= (bước 52) khi core có. Mới nhất trước. */
export async function listJobs(
  query: { status?: JobStatus; limit?: number; cursor?: string } = {},
): Promise<SamplePage<Job>> {
  const list = store()
    .jobs.filter((j) => !query.status || j.status === query.status)
    .sort((a, b) => b.started_at.localeCompare(a.started_at));
  return samplePage(structuredClone(list), query);
}

/**
 * Thay bằng POST /api/v1/kernel/jobs/{id}/retry (bước 52, chạy lại job trong dead-letter queue có
 * audit) khi core có. Chỉ job `dead` chạy lại được; số lần thử đếm lại từ đầu.
 */
export async function retryJob(jobId: string): Promise<SampleOutcome<Job>> {
  const found = store().jobs.find((j) => j.id === jobId);
  if (!found) return failed(404, "kernel.job_not_found", "This job does not exist.");
  if (found.status !== "dead") {
    return failed(
      409,
      "kernel.job_not_dead",
      "Only a job in the dead-letter queue can be retried.",
    );
  }
  found.status = "running";
  found.attempts = 1;
  found.last_error = null;
  found.started_at = new Date().toISOString();
  found.finished_at = null;
  return { ok: true, data: { ...found } };
}

/** Tỉ lệ đã dùng của hạn mức, 0–100, làm tròn xuống. */
export function usagePercent(limit: Pick<LimitUsage, "used" | "max">): number {
  if (limit.max <= 0) return 0;
  return Math.min(100, Math.floor((limit.used / limit.max) * 100));
}

// ---------------------------------------------------------------- Phía nhân sự nền tảng (W-014)

/**
 * Id của gói và giá mẫu: mặt điều khiển nền tảng (`src/sample/platform-plans.ts`) dùng chung bộ
 * gói này, để gói khách thấy ở Cài đặt và gói nhà vận hành bán là một.
 */
export const SAMPLE_PLAN_IDS = {
  starter: PLAN_STARTER,
  business: PLAN_BUSINESS,
  storage: PLAN_STORAGE,
  prices: PRICE,
} as const;

/**
 * Nhân sự nền tảng đổi thuê bao của khách mẫu (Bếp Mộc) từ mặt điều khiển: trạng thái, gói, giá.
 * Thay bằng PUT /api/v1/plans/tenants/{tenant_id}/subscription (bước 35) khi core có.
 */
export async function operatorSetSubscription(change: {
  status?: SubscriptionStatus;
  plan?: { id: string; name: string; modules: number };
  price?: Price;
}): Promise<Subscription> {
  const s = store();
  if (change.status) s.subscription.status = change.status;
  if (change.plan) {
    s.subscription.plan = { ...change.plan };
    s.subscription.scheduled_plan = null;
  }
  if (change.price) s.subscription.price = { ...change.price };
  s.subscription.updated_at = new Date().toISOString();
  return structuredClone(s.subscription);
}

/**
 * Nhân sự nền tảng ghi đã thu một kỳ của khách mẫu (chuyển khoản đối soát tay). Thay bằng
 * POST /api/v1/plans/billing-periods/{id}/mark-paid (bước 35) khi core có.
 */
export async function operatorMarkPaid(
  periodId: string,
  paidAt: string,
): Promise<SampleOutcome<BillingPeriod>> {
  const period = store().periods.find((p) => p.id === periodId);
  if (!period)
    return failed(404, "plans.billing_period_not_found", `No billing period ${periodId}.`);
  if (period.status !== "open") {
    return failed(409, "plans.billing_period_not_payable", "This period is already paid or void.");
  }
  period.status = "paid";
  period.paid_at = paidAt;
  return { ok: true, data: { ...period } };
}
