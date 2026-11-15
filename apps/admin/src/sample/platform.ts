// Hàm mẫu của mặt điều khiển nền tảng (W-014): sổ khách hàng, placement, cấp phát, xuất dữ liệu,
// quyền vào hỗ trợ, sức khoẻ. Mỗi hàm có cùng chữ ký như sẽ gọi API, kèm endpoint thay thế. Kiểu và
// kho nằm ở `platform-data.ts`; gói và thuê bao ở `platform-plans.ts`.
import type { Problem } from "@autoxide/sdk";
import { type SamplePage, samplePage } from "./index";
import { getSupportAccess, recordSupportGrant, revokeSupportGrant } from "./org";
import {
  type BackupRecord,
  BUSINESS_MODELS,
  type BusinessModel,
  DURATION,
  iso,
  type MigrationPlan,
  type ModuleBacklog,
  type MovePlan,
  type OperatorSubscription,
  type OpsAlert,
  PLATFORM_TENANT_ID,
  type Placement,
  type PlacementKind,
  type PlatformGrant,
  PROVISION_STEPS,
  type Provisioning,
  type ProvisionStatus,
  type Ref,
  SAMPLE_STEP_MS,
  SAMPLE_TENANT_ID,
  STAFF,
  type Store,
  SUPPORT_ROLES,
  store,
  type Tenant,
  type TenantExport,
  type TenantStatus,
} from "./platform-data";

export type SampleOutcome<T> = { ok: true; data: T } | { ok: false; problem: Problem };

const { HOUR, DAY } = DURATION;

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

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
/** Tên rút gọn của khách theo bước 33: chữ thường, số, `-`, tối đa 63. */
const SLUG = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;

/** Độ dài của lý do ghi vào audit (10–500 ký tự, như quyền vào hỗ trợ của bước 34). */
function badReason(reason: string): boolean {
  const length = reason.trim().length;
  return length < 10 || length > 500;
}

/** Nhân sự nền tảng đang thao tác (mẫu: trưởng ca). Thay bằng người của phiên đăng nhập. */
const ACTOR: Ref = STAFF.lead;

// ---------------------------------------------------------------- Việc chạy bằng job

/**
 * Cho các job mẫu tiến theo thời gian thật: placement đang migrate xong, khách đang dời xong, lượt
 * cấp phát đi tiếp từng bước, lần xuất dữ liệu xong. Gọi ở đầu mỗi hàm đọc; `now` cho test.
 */
export function syncPlatform(now = Date.now()): void {
  const s = store();
  for (const [id, until] of Object.entries(s.timers.migrate)) {
    if (now < until) continue;
    const placement = s.placements.find((p) => p.id === id);
    if (placement) {
      placement.schema_state = "ready";
      placement.pending_migrations = [];
      placement.schema_checked_at = iso(now);
      placement.updated_at = iso(now);
    }
    delete s.timers.migrate[id];
  }
  for (const [id, move] of Object.entries(s.timers.move)) {
    if (now < move.until) continue;
    const tenant = s.tenants.find((x) => x.id === id);
    if (tenant) {
      tenant.placement_id = move.to;
      tenant.status = "active";
      tenant.updated_at = iso(now);
    }
    delete s.timers.move[id];
  }
  for (const run of s.provisionings) advance(run, now);
  for (const job of s.exports) {
    const age = now - Date.parse(job.created_at);
    if (job.status === "queued" && age >= SAMPLE_STEP_MS) job.status = "running";
    if (job.status === "running" && age >= 3 * SAMPLE_STEP_MS) {
      job.status = "done";
      job.finished_at = iso(now);
      job.size_bytes = 180_000_000 + (job.reason.length % 7) * 90_000_000;
      job.expires_at = iso(now, 7 * DAY);
    }
  }
}

/** Một bước của lượt cấp phát xong thì làm việc của bước đó (tạo khách, gán gói…). */
function advance(run: Provisioning, now: number): void {
  const s = store();
  while (run.status === "running" && now - Date.parse(run.updated_at) >= SAMPLE_STEP_MS) {
    const index = PROVISION_STEPS.indexOf(run.step);
    const next = PROVISION_STEPS[index + 1];
    if (!next) {
      run.status = "done";
      break;
    }
    const at = iso(Date.parse(run.updated_at) + SAMPLE_STEP_MS);
    if (s.timers.failAt[run.id] === next) {
      // Lần chạy đầu dừng ở đây: database riêng cần URL mà chỉ CLI khai được (URL có mật khẩu).
      delete s.timers.failAt[run.id];
      run.status = "failed";
      run.last_error = `plans.provisioning_failed: ${next} — the dedicated placement has no connection URL yet`;
      run.updated_at = at;
      run.history.unshift({ at, step: next, failed: true });
      break;
    }
    run.step = next;
    run.updated_at = at;
    run.history.unshift({ at, step: next });
    applyStep(run, at);
    if (next === "done") run.status = "done";
  }
}

function applyStep(run: Provisioning, at: string): void {
  const s = store();
  const tenant = s.tenants.find((x) => x.id === run.tenant_id);
  if (run.step === "database_ready" && tenant && run.placement === "dedicated") {
    // Database riêng: placement mới mang tên rút gọn của khách.
    const placement: Placement = {
      id: crypto.randomUUID(),
      name: run.slug,
      kind: "dedicated",
      backend: "postgres",
      schema_state: "ready",
      schema_checked_at: at,
      created_at: at,
      updated_at: at,
      pending_migrations: [],
      location: "Việt Nam",
      control: false,
    };
    s.placements.push(placement);
    tenant.placement_id = placement.id;
  }
  if (run.step === "subscribed" && !s.subscriptions.some((x) => x.tenant_id === run.tenant_id)) {
    const plan = s.plans.find((p) => p.id === run.plan_id);
    const price = plan?.prices.find((p) => p.active && p.interval === "month") ?? plan?.prices[0];
    const trial = (plan?.trial_days ?? 0) > 0;
    const end = Date.parse(at) + (trial ? (plan?.trial_days ?? 0) * DAY : 30 * DAY);
    const subscription: OperatorSubscription = {
      id: crypto.randomUUID(),
      tenant_id: run.tenant_id,
      plan_id: run.plan_id,
      price_id: price?.id ?? "",
      status: trial ? "trialing" : "active",
      current_period_start: at,
      current_period_end: iso(end),
      trial_ends_at: trial ? iso(end) : null,
      grace_ends_at: null,
      suspended_at: null,
      canceled_at: null,
      delete_after: null,
      cancel_at_period_end: false,
      scheduled_plan_id: null,
      trial_used: trial,
      billing_email: run.admin_email,
      addons: [],
      created_at: at,
      updated_at: at,
    };
    s.subscriptions.push(subscription);
    s.history.unshift({
      tenant_id: run.tenant_id,
      at,
      kind: "status",
      from: null,
      to: subscription.status,
      text: trial ? "trial_started" : "plan_assigned",
    });
  }
  if (run.step === "done" && tenant) {
    tenant.status = "active";
    tenant.updated_at = at;
  }
}

// ---------------------------------------------------------------- Khách hàng (bước 33)

/** Thay bằng GET /api/v1/kernel/tenants?status=&parent_id= (bước 33) khi core có. */
export async function listTenants(
  query: { status?: TenantStatus; parent_id?: string; limit?: number; cursor?: string } = {},
): Promise<SamplePage<Tenant>> {
  syncPlatform();
  const list = store()
    .tenants.filter((x) => !query.status || x.status === query.status)
    .filter((x) => !query.parent_id || x.parent_id === query.parent_id);
  return samplePage(structuredClone(list), {
    limit: query.limit ?? 200,
    cursor: query.cursor ?? null,
  });
}

/** Thay bằng GET /api/v1/kernel/tenants/{id} (bước 33) khi core có. */
export async function getTenant(id: string): Promise<{ data: Tenant } | null> {
  syncPlatform();
  const tenant = store().tenants.find((x) => x.id === id);
  return tenant ? { data: structuredClone(tenant) } : null;
}

/**
 * Tạm khoá hẳn / mở lại khách. Thay bằng PATCH /api/v1/kernel/tenants/{id} `{status, reason}`
 * (bước 33; `reason` là đề xuất mới để ghi vào audit) khi core có.
 */
export async function setTenantStatus(
  id: string,
  status: "active" | "suspended",
  reason: string,
): Promise<SampleOutcome<Tenant>> {
  syncPlatform();
  const tenant = store().tenants.find((x) => x.id === id);
  if (!tenant) return failed(404, "tenant_not_found", `No tenant ${id}.`);
  if (tenant.is_platform) {
    return failed(409, "tenant_platform_immutable", "The platform tenant cannot be suspended.");
  }
  if (status === "suspended" && badReason(reason)) {
    return invalid([
      { field: "reason", code: "length_10_500", detail: "must be 10 to 500 characters" },
    ]);
  }
  const allowed =
    status === "suspended" ? tenant.status === "active" : tenant.status === "suspended";
  if (!allowed) {
    return failed(409, "tenant_invalid_transition", `The tenant is ${tenant.status}.`);
  }
  tenant.status = status;
  tenant.status_reason = status === "suspended" ? reason.trim() : null;
  tenant.updated_at = new Date().toISOString();
  return { ok: true, data: structuredClone(tenant) };
}

// ---------------------------------------------------------------- Placement (bước 33)

/** Thay bằng GET /api/v1/kernel/placements (bước 33) khi core có. Không bao giờ có URL. */
export async function listPlacements(): Promise<{ data: Placement[] }> {
  syncPlatform();
  return { data: structuredClone(store().placements) };
}

/** Chạy thật trong vòng chừng này sau lần chạy thử; quá thì phải chạy thử lại. */
export const DRY_RUN_VALID_MS = 30 * DURATION.MINUTE;

function fresh(plan: { at: string } | null | undefined, now: number): boolean {
  return plan !== null && plan !== undefined && now - Date.parse(plan.at) < DRY_RUN_VALID_MS;
}

/** Lần chạy thử còn hiệu lực (để trang hiện kết quả và nút chạy thật). */
export async function getDryRuns(): Promise<{ data: Store["dryRuns"] }> {
  syncPlatform();
  const s = store();
  const now = Date.now();
  const keep = <T extends { at: string }>(map: Record<string, T>) =>
    Object.fromEntries(Object.entries(map).filter(([, plan]) => fresh(plan, now)));
  return {
    data: structuredClone({
      fleet: fresh(s.dryRuns.fleet, now) ? s.dryRuns.fleet : null,
      placements: keep(s.dryRuns.placements),
      moves: keep(s.dryRuns.moves),
    }),
  };
}

/**
 * Chạy thử hoặc chạy thật migration cho một placement hay cả đội. Chạy thật chỉ được sau một lần
 * chạy thử còn hiệu lực. Core mới có CLI (`autoxide migrate up --all`); đề xuất mới:
 * POST /api/v1/kernel/placements/migrations `{placement_id?, dry_run}` xếp job.
 */
export async function migratePlacements(input: {
  placement_id?: string;
  dry_run: boolean;
  confirm?: string;
}): Promise<SampleOutcome<MigrationPlan>> {
  syncPlatform();
  const s = store();
  const now = Date.now();
  if (input.placement_id && !s.placements.some((p) => p.id === input.placement_id)) {
    return failed(404, "tenant_placement_not_found", "No such placement.");
  }
  if (!input.dry_run && input.confirm !== undefined && input.confirm.trim() !== "migrate") {
    return invalid([{ field: "confirm", code: "confirm_text", detail: "type migrate to confirm" }]);
  }
  const targets = s.placements.filter(
    (p) => p.schema_state === "behind" && (!input.placement_id || p.id === input.placement_id),
  );
  if (targets.length === 0) {
    return failed(409, "kernel_placement_up_to_date", "Every chosen placement is up to date.");
  }
  const ids = new Set(targets.map((p) => p.id));
  const plan: MigrationPlan = {
    at: iso(now),
    placements: targets.map((p) => ({
      id: p.id,
      name: p.name,
      migrations: [...p.pending_migrations],
    })),
    tenants: s.tenants.filter((x) => ids.has(x.placement_id)).length,
  };
  if (input.dry_run) {
    if (input.placement_id) s.dryRuns.placements[input.placement_id] = plan;
    else s.dryRuns.fleet = plan;
    return { ok: true, data: structuredClone(plan) };
  }
  const tried = input.placement_id
    ? fresh(s.dryRuns.placements[input.placement_id], now) || fresh(s.dryRuns.fleet, now)
    : fresh(s.dryRuns.fleet, now);
  if (!tried) {
    return failed(409, "kernel_dry_run_required", "Run a dry run first, then migrate.");
  }
  const until = now + 2 * SAMPLE_STEP_MS;
  for (const placement of targets) {
    placement.schema_state = "migrating";
    placement.updated_at = iso(now);
    s.timers.migrate[placement.id] = until;
    delete s.dryRuns.placements[placement.id];
  }
  if (!input.placement_id) s.dryRuns.fleet = null;
  return { ok: true, data: plan };
}

/**
 * Dời khách `shared` ↔ `dedicated`: chạy thử với đích `to`, rồi chạy thật theo đúng lần chạy thử đó
 * (`to` bỏ trống). Core mới có CLI (`autoxide tenant move <slug> --to`); đề xuất mới:
 * POST /api/v1/kernel/tenants/{id}/move `{to, dry_run}` xếp job.
 */
export async function moveTenant(
  id: string,
  input: { to: string; dry_run: boolean },
): Promise<SampleOutcome<MovePlan>> {
  syncPlatform();
  const s = store();
  const now = Date.now();
  const tenant = s.tenants.find((x) => x.id === id);
  if (!tenant) return failed(404, "tenant_not_found", `No tenant ${id}.`);
  if (tenant.is_platform || tenant.status !== "active") {
    return failed(409, "tenant_invalid_transition", `The tenant is ${tenant.status}.`);
  }
  if (!input.dry_run) {
    const planned = s.dryRuns.moves[id];
    if (!planned || !fresh(planned, now)) {
      return failed(409, "kernel_dry_run_required", "Run a dry run first, then move.");
    }
    let to = planned.to_id;
    if (to === "dedicated") {
      const placement: Placement = {
        id: crypto.randomUUID(),
        name: tenant.slug,
        kind: "dedicated",
        backend: "postgres",
        schema_state: "ready",
        schema_checked_at: iso(now),
        created_at: iso(now),
        updated_at: iso(now),
        pending_migrations: [],
        location: "Việt Nam",
        control: false,
      };
      s.placements.push(placement);
      to = placement.id;
    }
    tenant.status = "moving";
    tenant.updated_at = iso(now);
    s.timers.move[tenant.id] = { until: now + 2 * SAMPLE_STEP_MS, to };
    delete s.dryRuns.moves[id];
    return { ok: true, data: structuredClone(planned) };
  }
  const current = s.placements.find((p) => p.id === tenant.placement_id);
  const target =
    input.to === "dedicated"
      ? null
      : s.placements.find((p) => p.id === input.to && p.kind === "shared");
  if (input.to !== "dedicated" && !target) {
    return invalid([{ field: "to", code: "unknown", detail: "is not a shared placement" }]);
  }
  if ((target && target.id === tenant.placement_id) || (!target && current?.kind === "dedicated")) {
    return invalid([{ field: "to", code: "same_placement", detail: "is the current placement" }]);
  }
  const plan: MovePlan = {
    at: iso(now),
    tenant_id: tenant.id,
    to_id: input.to,
    from: current?.name ?? "—",
    to: target?.name ?? tenant.slug,
    tables: 48,
    rows: 120_000 + tenant.slug.length * 9_000,
    read_only_seconds: 360,
  };
  s.dryRuns.moves[id] = plan;
  return { ok: true, data: structuredClone(plan) };
}

// ---------------------------------------------------------------- Cấp phát (bước 35 mục 5)

/** Thay bằng GET /api/v1/plans/provisionings?status= (bước 35; danh sách là đề xuất mới) khi core có. */
export async function listProvisionings(
  query: { status?: ProvisionStatus; limit?: number; cursor?: string } = {},
): Promise<SamplePage<Provisioning>> {
  syncPlatform();
  const list = store()
    .provisionings.filter((p) => !query.status || p.status === query.status)
    .sort((a, b) => b.created_at.localeCompare(a.created_at));
  return samplePage(structuredClone(list), {
    limit: query.limit ?? 50,
    cursor: query.cursor ?? null,
  });
}

export interface NewProvisioning {
  tenant_name: string;
  slug: string;
  business_model: string;
  plan_id: string;
  /** `plan` = theo gói; tên placement dùng chung; `dedicated` = database riêng mới. */
  placement: string;
  admin_email: string;
  sample_data: boolean;
  parent_tenant_id: string;
}

/**
 * Xếp một lượt cấp phát: tạo khách (ID sinh trước), nơi lưu, migrate, dữ liệu mẫu, thuê bao, mời
 * quản trị — mỗi bước chạy bằng job. Thay bằng POST /api/v1/plans/provisionings (bước 35) khi core có.
 */
export async function createProvisioning(
  input: NewProvisioning,
): Promise<SampleOutcome<Provisioning>> {
  syncPlatform();
  const s = store();
  const errors: NonNullable<Problem["errors"]> = [];
  const name = input.tenant_name.trim();
  const slug = input.slug.trim();
  const email = input.admin_email.trim();
  if (!name) errors.push({ field: "tenant_name", code: "required", detail: "is required" });
  if (!slug) errors.push({ field: "slug", code: "required", detail: "is required" });
  else if (!SLUG.test(slug))
    errors.push({ field: "slug", code: "slug", detail: "is not a valid slug" });
  else if (s.tenants.some((x) => x.slug === slug)) {
    errors.push({ field: "slug", code: "taken", detail: "is already used" });
  }
  if (!BUSINESS_MODELS.includes(input.business_model as BusinessModel)) {
    errors.push({ field: "business_model", code: "unknown", detail: "is not a model" });
  }
  const plan = s.plans.find((p) => p.id === input.plan_id);
  if (plan?.kind !== "base" || plan.status !== "active") {
    errors.push({ field: "plan_id", code: "unknown", detail: "is not a plan on sale" });
  }
  const shared = s.placements.find(
    (p) => p.kind === "shared" && !p.control && p.name === input.placement,
  );
  if (!shared && input.placement !== "plan" && input.placement !== "dedicated") {
    errors.push({ field: "placement", code: "unknown", detail: "is not a placement" });
  }
  if (!email) errors.push({ field: "admin_email", code: "required", detail: "is required" });
  else if (!EMAIL.test(email))
    errors.push({ field: "admin_email", code: "email", detail: "is not an email" });
  const parent = input.parent_tenant_id
    ? s.tenants.find((x) => x.id === input.parent_tenant_id && !x.is_platform)
    : undefined;
  if (input.parent_tenant_id && !parent) {
    errors.push({ field: "parent_tenant_id", code: "unknown", detail: "is not a tenant" });
  }
  if (errors.length > 0 || !plan) return invalid(errors);
  const kind: PlacementKind =
    input.placement === "dedicated" ||
    (input.placement === "plan" && plan.placement === "dedicated")
      ? "dedicated"
      : "shared";
  const pool = shared ?? s.placements.find((p) => p.name === "pool-2");
  const now = new Date().toISOString();
  const tenantId = crypto.randomUUID();
  const run: Provisioning = {
    id: crypto.randomUUID(),
    tenant_id: tenantId,
    signup_id: null,
    parent_tenant_id: parent?.id ?? null,
    tenant_name: name,
    slug,
    plan_id: plan.id,
    price_id: null,
    placement: kind,
    placement_name: kind === "shared" ? (pool?.name ?? null) : null,
    admin_email: email,
    admin_name: null,
    sample_data: input.sample_data,
    step: "created",
    status: "running",
    last_error: null,
    reference: `plans:provision:${tenantId}`,
    created_by: ACTOR,
    created_at: now,
    updated_at: now,
    history: [{ at: now, step: "created" }],
  };
  // Khách có ngay (trạng thái `provisioning`), như `kernel_tenants` ghi ở bước đầu.
  s.tenants.push({
    id: tenantId,
    slug,
    name,
    status: "provisioning",
    parent_id: parent?.id ?? null,
    placement_id: kind === "shared" && pool ? pool.id : "",
    created_at: now,
    updated_at: now,
    is_platform: false,
    business_model: input.business_model as BusinessModel,
    primary_domain: null,
    status_reason: null,
  });
  if (kind === "dedicated") s.timers.failAt[run.id] = "database_ready";
  s.provisionings.unshift(run);
  return { ok: true, data: structuredClone(run) };
}

/**
 * Chạy lại lượt cấp phát từ bước lỗi (mọi bước idempotent, ID khách đã sinh trước). Thay bằng
 * POST /api/v1/plans/provisionings/{id}/retry (bước 35) khi core có.
 */
export async function retryProvisioning(id: string): Promise<SampleOutcome<Provisioning>> {
  syncPlatform();
  const run = store().provisionings.find((p) => p.id === id);
  if (!run) return failed(404, "plans.provisioning_not_found", `No provisioning ${id}.`);
  if (run.status !== "failed") {
    return failed(
      409,
      "plans.provisioning_not_failed",
      "Only a stopped provisioning can be retried.",
    );
  }
  run.status = "running";
  run.last_error = null;
  run.updated_at = new Date().toISOString();
  return { ok: true, data: structuredClone(run) };
}

// ---------------------------------------------------------------- Xuất dữ liệu (mới)

/** Đề xuất mới: GET /api/v1/kernel/tenants/{id}/exports. Mới nhất trước. */
export async function listExports(tenantId: string): Promise<{ data: TenantExport[] }> {
  syncPlatform();
  const list = store()
    .exports.filter((x) => x.tenant_id === tenantId)
    .sort((a, b) => b.created_at.localeCompare(a.created_at));
  return { data: structuredClone(list) };
}

/**
 * Xếp job xuất toàn bộ dữ liệu của khách (mọi bảng `tenant_id = X` và tệp có tiền tố khách). Core
 * mới có CLI `autoxide copy`; đề xuất mới: POST /api/v1/kernel/tenants/{id}/exports `{reason}`.
 */
export async function requestExport(
  tenantId: string,
  reason: string,
): Promise<SampleOutcome<TenantExport>> {
  syncPlatform();
  const s = store();
  const tenant = s.tenants.find((x) => x.id === tenantId);
  if (!tenant || tenant.is_platform)
    return failed(404, "tenant_not_found", `No tenant ${tenantId}.`);
  if (badReason(reason)) {
    return invalid([
      { field: "reason", code: "length_10_500", detail: "must be 10 to 500 characters" },
    ]);
  }
  if (
    s.exports.some(
      (x) => x.tenant_id === tenantId && (x.status === "queued" || x.status === "running"),
    )
  ) {
    return failed(409, "tenant_export_running", "An export of this tenant is already running.");
  }
  const job: TenantExport = {
    id: crypto.randomUUID(),
    tenant_id: tenantId,
    status: "queued",
    reason: reason.trim(),
    requested_by: ACTOR,
    created_at: new Date().toISOString(),
    finished_at: null,
    size_bytes: null,
    expires_at: null,
  };
  s.exports.unshift(job);
  return { ok: true, data: structuredClone(job) };
}

// ---------------------------------------------------------------- Quyền vào hỗ trợ (bước 34)

export type GrantStatus = "active" | "expired" | "revoked";

export function platformGrantStatus(
  grant: Pick<PlatformGrant, "revoked_at" | "expires_at">,
  now = Date.now(),
): GrantStatus {
  if (grant.revoked_at) return "revoked";
  return Date.parse(grant.expires_at) <= now ? "expired" : "active";
}

/** Thời hạn tối đa của một lần cấp (`AUTOXIDE_AUTH_SUPPORT_ACCESS_MAX_HOURS`). */
export const SUPPORT_MAX_HOURS = 8;

/** Khách có bật `auth.support_access` không (Bếp Mộc đọc thật từ cài đặt của khách trong `org.ts`). */
export async function supportEnabled(tenantId: string): Promise<boolean> {
  if (tenantId === SAMPLE_TENANT_ID) return (await getSupportAccess()).data.enabled;
  return store().supportAccess[tenantId] ?? true;
}

/**
 * Thay bằng GET /api/v1/auth/support-grants?tenant_id= (bước 34) khi core có. Lần cấp vào Bếp Mộc
 * nằm ở sổ của khách (`org.ts`), nên khách thấy đúng những gì nhân sự nền tảng thấy.
 */
export async function listGrants(
  query: { tenant_id?: string; status?: GrantStatus } = {},
): Promise<{ data: PlatformGrant[] }> {
  const own = (await getSupportAccess()).data.grants.map(
    (g): PlatformGrant => ({
      id: g.id,
      tenant_id: SAMPLE_TENANT_ID,
      staff: g.staff,
      role: g.role,
      basis: g.basis,
      reason: g.reason,
      legal_reference: g.legal_reference,
      granted_by: g.granted_by,
      starts_at: g.starts_at,
      expires_at: g.expires_at,
      revoked_at: g.revoked_at,
      created_at: g.starts_at,
    }),
  );
  const list = [...own, ...structuredClone(store().grants)]
    .filter((g) => !query.tenant_id || g.tenant_id === query.tenant_id)
    .filter((g) => !query.status || platformGrantStatus(g) === query.status)
    .sort((a, b) => b.starts_at.localeCompare(a.starts_at));
  return { data: list };
}

export interface NewGrant {
  tenant_id: string;
  staff_user_id: string;
  role_id: string;
  basis: string;
  reason: string;
  legal_reference: string;
  hours: string;
}

/**
 * Cấp quyền vào dữ liệu khách có hạn, có lý do; khách thấy trong sổ quyền vào và nhật ký audit.
 * Thay bằng POST /api/v1/auth/support-grants (bước 34) khi core có.
 */
export async function createGrant(input: NewGrant): Promise<SampleOutcome<PlatformGrant>> {
  const s = store();
  const errors: NonNullable<Problem["errors"]> = [];
  const tenant = s.tenants.find((x) => x.id === input.tenant_id && !x.is_platform);
  if (!tenant) errors.push({ field: "tenant_id", code: "unknown", detail: "is not a tenant" });
  const staff = Object.values(STAFF).find((x) => x.id === input.staff_user_id);
  if (!staff)
    errors.push({ field: "staff_user_id", code: "unknown", detail: "is not platform staff" });
  const role = SUPPORT_ROLES.find((x) => x.id === input.role_id);
  if (!role) errors.push({ field: "role_id", code: "unknown", detail: "is not a role" });
  const basis =
    input.basis === "legal_request"
      ? "legal_request"
      : input.basis === "support"
        ? "support"
        : null;
  if (!basis) errors.push({ field: "basis", code: "unknown", detail: "is not a basis" });
  if (badReason(input.reason)) {
    errors.push({ field: "reason", code: "length_10_500", detail: "must be 10 to 500 characters" });
  }
  if (basis === "legal_request" && !input.legal_reference.trim()) {
    errors.push({
      field: "legal_reference",
      code: "required",
      detail: "is required for a legal request",
    });
  }
  const hours = Number(input.hours);
  if (!Number.isInteger(hours) || hours < 1 || hours > SUPPORT_MAX_HOURS) {
    errors.push({ field: "hours", code: "hours_max", detail: `must be 1 to ${SUPPORT_MAX_HOURS}` });
  }
  if (errors.length > 0 || !tenant || !staff || !role || !basis) return invalid(errors);
  if (basis === "support" && !(await supportEnabled(tenant.id))) {
    return failed(
      403,
      "auth.support_access_disabled",
      "The tenant turned support access off; only a legal request can be granted.",
    );
  }
  const now = Date.now();
  const grant: PlatformGrant = {
    id: crypto.randomUUID(),
    tenant_id: tenant.id,
    staff,
    role,
    basis,
    reason: input.reason.trim(),
    legal_reference: basis === "legal_request" ? input.legal_reference.trim() : null,
    granted_by: ACTOR,
    starts_at: iso(now),
    expires_at: iso(now, hours * HOUR),
    revoked_at: null,
    created_at: iso(now),
  };
  if (tenant.id === SAMPLE_TENANT_ID) {
    const { tenant_id: _tenant, created_at: _created, ...rest } = grant;
    await recordSupportGrant(rest);
  } else {
    s.grants.unshift(grant);
  }
  return { ok: true, data: grant };
}

/** Thu hồi một lần cấp còn hạn. Thay bằng DELETE /api/v1/auth/support-grants/{id} (bước 34). */
export async function revokeGrant(id: string): Promise<SampleOutcome<undefined>> {
  const grant = store().grants.find((g) => g.id === id);
  if (!grant) return revokeSupportGrant(id);
  if (platformGrantStatus(grant) !== "active") {
    return failed(409, "auth.support_grant_not_active", "The grant is no longer active.");
  }
  grant.revoked_at = new Date().toISOString();
  return { ok: true, data: undefined };
}

// ---------------------------------------------------------------- Sức khoẻ (bước 39)

export interface DatabaseOps {
  database_key: string;
  backlog: ModuleBacklog[];
  pool: { in_use: number; idle: number; max: number };
  last_backup: BackupRecord | null;
}

/** `GET /api/v1/kernel/ops/backlog` → `Data<OpsStatus>`. */
export interface OpsStatus {
  databases: DatabaseOps[];
  top_tenants: { database_key: string; tenant_id: string; jobs_pending: number }[];
}

/** Thay bằng GET /api/v1/kernel/ops/backlog (bước 39) khi core có. */
export async function getOpsStatus(): Promise<{ data: OpsStatus }> {
  const s = store();
  const databases = Object.entries(s.backlog).map(
    ([key, backlog], index): DatabaseOps => ({
      database_key: key,
      backlog: structuredClone(backlog),
      pool: { in_use: 2 + (index % 3), idle: 4 - (index % 3), max: key === "main" ? 10 : 6 },
      last_backup:
        structuredClone(
          s.backups
            .filter((b) => b.database_key === key)
            .sort((a, b) => b.started_at.localeCompare(a.started_at))[0],
        ) ?? null,
    }),
  );
  const top = [
    {
      database_key: "pool-2",
      tenant_id: "01a1e000-0000-7000-8000-000000071011",
      jobs_pending: 402,
    },
    {
      database_key: "pool-1",
      tenant_id: "01a1e000-0000-7000-8000-000000071003",
      jobs_pending: 211,
    },
    { database_key: "bepmoc", tenant_id: SAMPLE_TENANT_ID, jobs_pending: 41 },
  ];
  return { data: { databases, top_tenants: top } };
}

/** Thay bằng GET /api/v1/kernel/ops/backups?status= (bước 39) khi core có. Mới nhất trước. */
export async function listBackups(
  query: { status?: BackupRecord["status"]; limit?: number; cursor?: string } = {},
): Promise<SamplePage<BackupRecord>> {
  const list = store()
    .backups.filter((b) => !query.status || b.status === query.status)
    .sort((a, b) => b.started_at.localeCompare(a.started_at));
  return samplePage(structuredClone(list), {
    limit: query.limit ?? 50,
    cursor: query.cursor ?? null,
  });
}

/** Đề xuất mới: GET /api/v1/kernel/ops/alerts (cảnh báo đang bật, kèm câu "làm gì"). */
export async function listAlerts(): Promise<{ data: OpsAlert[] }> {
  return { data: structuredClone(store().alerts) };
}

/** Khách nền tảng không phải khách bán hàng: không gán gói, không tạm khoá, không xuất. */
export function isPlatformTenant(id: string): boolean {
  return id === PLATFORM_TENANT_ID;
}
