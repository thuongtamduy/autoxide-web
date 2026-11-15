// Hàm mẫu của mặt điều khiển nền tảng cho gói, giá, ghi đè, thuê bao, kỳ thanh toán, mức dùng
// (bước 35 của core, W-014). Khách mẫu Bếp Mộc dùng thẳng thuê bao, kỳ thanh toán và hạn mức của
// `settings.ts` (màn Cài đặt › Gói và thuê bao của khách), nên hai phía thấy cùng một thuê bao.
import type { Problem } from "@autoxide/sdk";
import type { SampleOutcome } from "./platform";
import {
  DURATION,
  FEATURE_KEYS,
  iso,
  LIMIT_KEYS,
  MODULE_REQUIRES,
  type OperatorPeriod,
  type OperatorSubscription,
  type Override,
  type Plan,
  type PlanKind,
  type PlanPrice,
  type PlanStatus,
  type Ref,
  SAMPLE_TENANT_ID,
  STAFF,
  type SubscriptionEvent,
  type SubscriptionStatus,
  store,
  type TenantUsage,
} from "./platform-data";
import {
  operatorMarkPaid,
  operatorSetSubscription,
  listLimits as tenantLimits,
  listBillingPeriods as tenantPeriods,
  getSubscription as tenantSubscription,
} from "./settings";

const { DAY } = DURATION;
const ACTOR: Ref = STAFF.lead;

function invalid(
  errors: NonNullable<Problem["errors"]>,
  code = "validation_failed",
  detail = "The request has invalid fields.",
): SampleOutcome<never> {
  return {
    ok: false,
    problem: {
      type: "about:blank",
      title: "Unprocessable Entity",
      status: 422,
      code,
      detail,
      errors,
    },
  };
}

function failed(status: number, code: string, detail: string): SampleOutcome<never> {
  return { ok: false, problem: { type: "about:blank", title: "Error", status, code, detail } };
}

const PLAN_CODE = /^[a-z][a-z0-9_-]{0,63}$/;
const WHOLE = /^\d+$/;
const DAY_TEXT = /^\d{4}-\d{2}-\d{2}$/;

function badReason(reason: string): boolean {
  const length = reason.trim().length;
  return length < 10 || length > 500;
}

/** Danh sách module viết cách nhau bằng dấu phẩy hay khoảng trắng. */
export function parseModules(text: string): string[] {
  return [
    ...new Set(
      text
        .split(/[\s,]+/)
        .map((m) => m.trim())
        .filter(Boolean),
    ),
  ];
}

/** Module trong danh sách cần module khác mà danh sách thiếu (`plans.module_dependency_missing`). */
export function missingDependency(
  modules: readonly string[],
): { module: string; requires: string } | null {
  for (const module of modules) {
    for (const requires of MODULE_REQUIRES[module] ?? []) {
      if (!modules.includes(requires)) return { module, requires };
    }
  }
  return null;
}

// ---------------------------------------------------------------- Gói và giá

/** Gói kèm số khách đang dùng (dự kiến (mới): trường `subscriber_count`). */
export interface PlanRow extends Plan {
  subscriber_count: number;
}

/** Thay bằng GET /api/v1/plans/plans?status=&kind= (bước 35) khi core có. */
export async function listPlans(
  query: { status?: PlanStatus; kind?: PlanKind } = {},
): Promise<{ data: PlanRow[] }> {
  const subs = await listSubscriptions();
  const list = store()
    .plans.filter((p) => !query.status || p.status === query.status)
    .filter((p) => !query.kind || p.kind === query.kind)
    .map((p) => ({
      ...structuredClone(p),
      subscriber_count: subs.data.filter(
        (x) =>
          x.status !== "canceled" &&
          (x.plan_id === p.id || x.addons.some((a) => a.plan_id === p.id)),
      ).length,
    }));
  return { data: list };
}

/** Thay bằng GET /api/v1/plans/plans/{id} (bước 35) khi core có. */
export async function getPlan(id: string): Promise<{ data: PlanRow } | null> {
  const { data } = await listPlans();
  const plan = data.find((p) => p.id === id);
  return plan ? { data: plan } : null;
}

export interface PlanInput {
  code: string;
  name: string;
  description: string;
  kind: string;
  modules: string;
  trial_days: string;
  placement: string;
}

function checkPlan(input: PlanInput, current: Plan | null): SampleOutcome<never> | null {
  const s = store();
  const errors: NonNullable<Problem["errors"]> = [];
  if (!current) {
    const code = input.code.trim();
    if (!code) errors.push({ field: "code", code: "required", detail: "is required" });
    else if (!PLAN_CODE.test(code))
      errors.push({ field: "code", code: "plan_code", detail: "is not a plan code" });
    else if (s.plans.some((p) => p.code === code))
      errors.push({ field: "code", code: "taken", detail: "is used" });
    if (input.kind !== "base" && input.kind !== "addon") {
      errors.push({ field: "kind", code: "unknown", detail: "is not a kind" });
    }
  }
  if (!input.name.trim()) errors.push({ field: "name", code: "required", detail: "is required" });
  const modules = parseModules(input.modules);
  const kind = current?.kind ?? input.kind;
  if (kind === "base" && modules.length === 0) {
    errors.push({ field: "modules", code: "required", detail: "is required" });
  } else if (modules.some((m) => !(m in MODULE_REQUIRES))) {
    errors.push({ field: "modules", code: "unknown_module", detail: "has an unknown module" });
  }
  if (!WHOLE.test(input.trial_days.trim()) || Number(input.trial_days) > 90) {
    errors.push({ field: "trial_days", code: "range_0_90", detail: "must be 0 to 90" });
  }
  if (input.placement !== "shared" && input.placement !== "dedicated") {
    errors.push({ field: "placement", code: "unknown", detail: "is not a placement kind" });
  }
  if (errors.length > 0) return invalid(errors);
  // Gói thêm chỉ cộng vào gói chính: phụ thuộc kiểm khi gán, không kiểm ở đây.
  const missing = kind === "base" ? missingDependency(modules) : null;
  if (missing) {
    return invalid(
      [
        {
          field: "modules",
          code: "module_dependency",
          detail: `${missing.module} needs ${missing.requires}`,
        },
      ],
      "plans.module_dependency_missing",
      `Module ${missing.module} needs module ${missing.requires} in the same plan.`,
    );
  }
  return null;
}

/** Thay bằng POST /api/v1/plans/plans (bước 35) khi core có. Gói mới là bản nháp. */
export async function createPlan(input: PlanInput): Promise<SampleOutcome<Plan>> {
  const bad = checkPlan(input, null);
  if (bad) return bad;
  const now = new Date().toISOString();
  const plan: Plan = {
    id: crypto.randomUUID(),
    code: input.code.trim(),
    name: input.name.trim(),
    description: input.description.trim(),
    kind: input.kind as PlanKind,
    status: "draft",
    is_default: false,
    trial_days: Number(input.trial_days),
    grace_days: 7,
    suspend_days: 30,
    retention_days: 90,
    renewal_lead_days: 7,
    placement: input.placement as Plan["placement"],
    requires_kyc: false,
    sample_data: true,
    modules: parseModules(input.modules),
    features: [],
    limits: [],
    prices: [],
    created_at: now,
    updated_at: now,
  };
  store().plans.push(plan);
  return { ok: true, data: structuredClone(plan) };
}

/** Thay bằng PUT /api/v1/plans/plans/{id} (bước 35, `If-Match`) khi core có. */
export async function updatePlan(id: string, input: PlanInput): Promise<SampleOutcome<Plan>> {
  const plan = store().plans.find((p) => p.id === id);
  if (!plan) return failed(404, "plans.plan_not_found", `No plan ${id}.`);
  if (plan.status === "retired")
    return failed(409, "plans.plan_not_active", "The plan is retired.");
  const bad = checkPlan(input, plan);
  if (bad) return bad;
  plan.name = input.name.trim();
  plan.description = input.description.trim();
  plan.modules = parseModules(input.modules);
  plan.trial_days = Number(input.trial_days);
  plan.placement = input.placement as Plan["placement"];
  plan.updated_at = new Date().toISOString();
  return { ok: true, data: structuredClone(plan) };
}

/**
 * Bắt đầu bán (bản nháp → đang bán) hoặc ngừng bán. Ngừng bán thay bằng POST
 * /api/v1/plans/plans/{id}/retire; bắt đầu bán bằng PUT …/{id} `{status: active}` (bước 35).
 */
export async function setPlanStatus(
  id: string,
  status: "active" | "retired",
): Promise<SampleOutcome<Plan>> {
  const plan = store().plans.find((p) => p.id === id);
  if (!plan) return failed(404, "plans.plan_not_found", `No plan ${id}.`);
  const from: PlanStatus = status === "active" ? "draft" : "active";
  if (plan.status !== from) {
    return failed(409, "plans.plan_invalid_transition", `The plan is ${plan.status}.`);
  }
  if (status === "active" && !plan.prices.some((p) => p.active)) {
    return failed(409, "plans.plan_without_price", "Add a price before selling the plan.");
  }
  plan.status = status;
  if (status === "retired") plan.is_default = false;
  plan.updated_at = new Date().toISOString();
  return { ok: true, data: structuredClone(plan) };
}

/** Thay bằng POST /api/v1/plans/plans/{id}/prices (bước 35) khi core có. Giá đã có không sửa. */
export async function addPrice(
  planId: string,
  input: { interval: string; amount: string },
): Promise<SampleOutcome<PlanPrice>> {
  const plan = store().plans.find((p) => p.id === planId);
  if (!plan) return failed(404, "plans.plan_not_found", `No plan ${planId}.`);
  if (plan.status === "retired")
    return failed(409, "plans.plan_not_active", "The plan is retired.");
  const errors: NonNullable<Problem["errors"]> = [];
  if (input.interval !== "month" && input.interval !== "year") {
    errors.push({ field: "interval", code: "unknown", detail: "is not an interval" });
  }
  const amount = input.amount.replace(/[.\s]/g, "");
  if (!WHOLE.test(amount) || Number(amount) <= 0) {
    errors.push({ field: "amount", code: "money_vnd", detail: "must be a whole number of dong" });
  }
  if (errors.length > 0) return invalid(errors);
  const price: PlanPrice = {
    id: crypto.randomUUID(),
    plan_id: plan.id,
    kind: "recurring",
    interval: input.interval as PlanPrice["interval"],
    interval_count: 1,
    amount_minor: Number(amount),
    amount_currency: "VND",
    limit_key: null,
    included: null,
    active: true,
    created_at: new Date().toISOString(),
  };
  plan.prices.push(price);
  plan.updated_at = price.created_at;
  return { ok: true, data: structuredClone(price) };
}

/** Thay bằng POST /api/v1/plans/prices/{id}/deactivate (bước 35) khi core có. */
export async function deactivatePrice(priceId: string): Promise<SampleOutcome<PlanPrice>> {
  const plan = store().plans.find((p) => p.prices.some((x) => x.id === priceId));
  const price = plan?.prices.find((x) => x.id === priceId);
  if (!plan || !price) return failed(404, "plans.price_not_found", `No price ${priceId}.`);
  if (!price.active) return failed(409, "plans.price_not_active", "The price is already off.");
  if (plan.status === "active" && plan.prices.filter((x) => x.active).length === 1) {
    return failed(409, "plans.price_last_active", "A plan on sale needs one active price.");
  }
  price.active = false;
  return { ok: true, data: structuredClone(price) };
}

// ---------------------------------------------------------------- Thuê bao

/** Thuê bao của Bếp Mộc đọc từ phía khách (`settings.ts`), đổi về hình dạng phía nhà vận hành. */
async function sampleTenantSubscription(): Promise<OperatorSubscription> {
  const { data } = await tenantSubscription();
  return {
    id: data.id,
    tenant_id: SAMPLE_TENANT_ID,
    plan_id: data.plan.id,
    price_id: data.price.id,
    status: data.status,
    current_period_start: data.current_period_start,
    current_period_end: data.current_period_end,
    trial_ends_at: null,
    grace_ends_at: null,
    suspended_at: data.status === "suspended" ? data.updated_at : null,
    canceled_at: data.status === "canceled" ? data.updated_at : null,
    delete_after: null,
    cancel_at_period_end: data.cancel_at_period_end,
    scheduled_plan_id: data.scheduled_plan?.id ?? null,
    trial_used: true,
    billing_email: "ketoan@example.com",
    addons: data.addons.map((a) => ({ plan_id: a.plan.id, quantity: a.quantity })),
    created_at: data.current_period_start,
    updated_at: data.updated_at,
  };
}

/** Thay bằng GET /api/v1/plans/subscriptions?status=&plan_id= (bước 35) khi core có. */
export async function listSubscriptions(
  query: { status?: SubscriptionStatus; plan_id?: string } = {},
): Promise<{ data: OperatorSubscription[] }> {
  const list = [await sampleTenantSubscription(), ...structuredClone(store().subscriptions)]
    .filter((x) => !query.status || x.status === query.status)
    .filter((x) => !query.plan_id || x.plan_id === query.plan_id);
  return { data: list };
}

/** Thay bằng GET /api/v1/plans/tenants/{tenant_id}/subscription (bước 35) khi core có. */
export async function getTenantSubscription(
  tenantId: string,
): Promise<OperatorSubscription | null> {
  if (tenantId === SAMPLE_TENANT_ID) return sampleTenantSubscription();
  const found = store().subscriptions.find((x) => x.tenant_id === tenantId);
  return found ? structuredClone(found) : null;
}

/** Dự kiến (mới): lịch sử thuê bao của một khách, mới nhất trước. */
export async function listHistory(tenantId: string): Promise<{ data: SubscriptionEvent[] }> {
  const list = store()
    .history.filter((x) => x.tenant_id === tenantId)
    .sort((a, b) => b.at.localeCompare(a.at));
  return { data: structuredClone(list) };
}

function note(event: Omit<SubscriptionEvent, "at">): void {
  store().history.unshift({ ...event, at: new Date().toISOString() });
}

/** Đổi trạng thái thuê bao, ghi lịch sử; Bếp Mộc đổi ở kho phía khách. */
async function saveStatus(
  current: OperatorSubscription,
  to: SubscriptionStatus,
  text: string,
): Promise<OperatorSubscription> {
  const now = new Date().toISOString();
  note({ tenant_id: current.tenant_id, kind: "status", from: current.status, to, text });
  if (current.tenant_id === SAMPLE_TENANT_ID) {
    await operatorSetSubscription({ status: to });
    return sampleTenantSubscription();
  }
  const sub = store().subscriptions.find((x) => x.tenant_id === current.tenant_id);
  if (!sub) return current;
  sub.status = to;
  sub.updated_at = now;
  if (to === "suspended") sub.suspended_at = now;
  if (to === "active") {
    sub.grace_ends_at = null;
    sub.suspended_at = null;
  }
  if (to === "canceled") {
    const plan = store().plans.find((p) => p.id === sub.plan_id);
    sub.canceled_at = now;
    sub.delete_after = iso(Date.now(), (plan?.retention_days ?? 90) * DAY);
  }
  return structuredClone(sub);
}

/**
 * Đặt thuê bao chỉ đọc (khách vẫn đăng nhập, xem, xuất; mọi lệnh ghi bị chặn) hoặc bỏ chỉ đọc. Đặc
 * tả bước 35 chỉ để job chuyển sang chỉ đọc khi hết ân hạn; đề xuất mới:
 * POST /api/v1/plans/tenants/{tenant_id}/subscription/suspend và …/resume.
 */
export async function setReadOnly(
  tenantId: string,
  on: boolean,
): Promise<SampleOutcome<OperatorSubscription>> {
  const sub = await getTenantSubscription(tenantId);
  if (!sub) return failed(404, "plans.subscription_not_found", "This tenant has no subscription.");
  const allowed = on
    ? ["trialing", "active", "past_due"].includes(sub.status)
    : sub.status === "suspended";
  if (!allowed)
    return failed(409, "plans.invalid_transition", `The subscription is ${sub.status}.`);
  return {
    ok: true,
    data: await saveStatus(
      sub,
      on ? "suspended" : "active",
      on ? "operator_read_only" : "operator_resumed",
    ),
  };
}

/** Huỷ ngay. Thay bằng POST /api/v1/plans/tenants/{tenant_id}/subscription/cancel (bước 35). */
export async function cancelSubscription(
  tenantId: string,
): Promise<SampleOutcome<OperatorSubscription>> {
  const sub = await getTenantSubscription(tenantId);
  if (!sub) return failed(404, "plans.subscription_not_found", "This tenant has no subscription.");
  if (sub.status === "canceled" || sub.status === "deleted") {
    return failed(409, "plans.invalid_transition", `The subscription is ${sub.status}.`);
  }
  return { ok: true, data: await saveStatus(sub, "canceled", "operator_canceled") };
}

/**
 * Gán gói khác. Thay bằng PUT /api/v1/plans/tenants/{tenant_id}/subscription `{plan_id, price_id}`
 * (bước 35) khi core có. `confirm` là tên khách gõ lại (chỉ ở giao diện).
 */
export async function assignPlan(
  tenantId: string,
  input: { price_id: string; confirm: string; tenant_name: string },
): Promise<SampleOutcome<OperatorSubscription>> {
  const sub = await getTenantSubscription(tenantId);
  if (!sub) return failed(404, "plans.subscription_not_found", "This tenant has no subscription.");
  const plan = store().plans.find(
    (p) =>
      p.kind === "base" &&
      p.status === "active" &&
      p.prices.some((x) => x.id === input.price_id && x.active),
  );
  const price = plan?.prices.find((x) => x.id === input.price_id);
  const errors: NonNullable<Problem["errors"]> = [];
  if (!plan || !price)
    errors.push({ field: "price_id", code: "unknown", detail: "is not a price on sale" });
  if (input.confirm.trim() !== input.tenant_name) {
    errors.push({
      field: "confirm",
      code: "confirm_text",
      detail: "does not match the tenant name",
    });
  }
  if (errors.length > 0 || !plan || !price) return invalid(errors);
  if (price.id === sub.price_id)
    return failed(409, "plans.same_plan", "This is already the plan and price.");
  const status: SubscriptionStatus =
    plan.trial_days > 0 && !sub.trial_used
      ? "trialing"
      : sub.status === "canceled"
        ? "active"
        : sub.status;
  note({ tenant_id: tenantId, kind: "plan", from: null, to: null, text: "plan_assigned" });
  if (tenantId === SAMPLE_TENANT_ID) {
    await operatorSetSubscription({
      plan: { id: plan.id, name: plan.name, modules: plan.modules.length },
      price: {
        id: price.id,
        interval: price.interval,
        amount_minor: price.amount_minor,
        amount_currency: price.amount_currency,
      },
      status,
    });
    return { ok: true, data: await sampleTenantSubscription() };
  }
  const own = store().subscriptions.find((x) => x.tenant_id === tenantId);
  if (!own) return failed(404, "plans.subscription_not_found", "This tenant has no subscription.");
  own.plan_id = plan.id;
  own.price_id = price.id;
  own.status = status;
  own.scheduled_plan_id = null;
  own.updated_at = new Date().toISOString();
  return { ok: true, data: structuredClone(own) };
}

// ---------------------------------------------------------------- Kỳ thanh toán

/** Dự kiến (mới): GET /api/v1/plans/tenants/{tenant_id}/billing-periods?status=. */
export async function listPeriods(
  query: { tenant_id?: string; status?: OperatorPeriod["status"] } = {},
): Promise<{ data: OperatorPeriod[] }> {
  const own = (await tenantPeriods({ limit: 200 })).data.map(
    (p): OperatorPeriod => ({
      id: p.id,
      tenant_id: SAMPLE_TENANT_ID,
      kind: p.kind,
      plan_id: p.plan.id,
      period_start: p.period_start,
      period_end: p.period_end,
      amount_minor: p.amount_minor,
      amount_currency: p.amount_currency,
      status: p.status,
      due_at: p.due_at,
      paid_at: p.paid_at,
      provider_reference: null,
    }),
  );
  const list = [...own, ...structuredClone(store().periods)]
    .filter((p) => !query.tenant_id || p.tenant_id === query.tenant_id)
    .filter((p) => !query.status || p.status === query.status);
  return { data: list };
}

/**
 * Đánh dấu đã thu (chuyển khoản đối soát tay): kỳ thành đã trả, thuê bao quá hạn / chỉ đọc về đang
 * dùng. Thay bằng POST /api/v1/plans/billing-periods/{id}/mark-paid (bước 35) khi core có.
 */
export async function markPaid(
  periodId: string,
  input: { provider_reference: string; paid_at: string },
): Promise<SampleOutcome<OperatorPeriod>> {
  const errors: NonNullable<Problem["errors"]> = [];
  if (!input.provider_reference.trim()) {
    errors.push({ field: "provider_reference", code: "required", detail: "is required" });
  }
  const today = new Date().toISOString().slice(0, 10);
  if (!DAY_TEXT.test(input.paid_at))
    errors.push({ field: "paid_at", code: "required", detail: "is required" });
  else if (input.paid_at > today)
    errors.push({ field: "paid_at", code: "future_date", detail: "is in the future" });
  if (errors.length > 0) return invalid(errors);
  const paidAt = `${input.paid_at}T00:00:00.000Z`;
  const period = (await listPeriods()).data.find((p) => p.id === periodId);
  if (!period)
    return failed(404, "plans.billing_period_not_found", `No billing period ${periodId}.`);
  if (period.status !== "open") {
    return failed(409, "plans.billing_period_not_payable", "This period is already paid or void.");
  }
  if (period.tenant_id === SAMPLE_TENANT_ID) {
    const done = await operatorMarkPaid(periodId, paidAt);
    if (!done.ok) return done;
  } else {
    const own = store().periods.find((p) => p.id === periodId);
    if (own) {
      own.status = "paid";
      own.paid_at = paidAt;
      own.provider_reference = input.provider_reference.trim();
    }
  }
  const sub = await getTenantSubscription(period.tenant_id);
  note({ tenant_id: period.tenant_id, kind: "paid", from: null, to: null, text: "period_paid" });
  if (sub && (sub.status === "past_due" || sub.status === "suspended")) {
    await saveStatus(sub, "active", "payment_received");
  }
  return {
    ok: true,
    data: {
      ...period,
      status: "paid",
      paid_at: paidAt,
      provider_reference: input.provider_reference.trim(),
    },
  };
}

// ---------------------------------------------------------------- Ghi đè và mức dùng

/** Thay bằng GET /api/v1/plans/tenants/{tenant_id}/overrides (bước 35; mọi khách là đề xuất mới). */
export async function listOverrides(tenantId?: string): Promise<{ data: Override[] }> {
  const list = store()
    .overrides.filter((o) => !tenantId || o.tenant_id === tenantId)
    .sort((a, b) => b.created_at.localeCompare(a.created_at));
  return { data: structuredClone(list) };
}

export interface OverrideInput {
  tenant_id: string;
  kind: string;
  key: string;
  value: string;
  expires_on: string;
  reason: string;
}

/**
 * Thêm (hay thay) một ghi đè quyền dùng cho khách: thay hẳn giá trị của gói. Thay bằng POST
 * /api/v1/plans/tenants/{tenant_id}/overrides (bước 35) khi core có.
 */
export async function setOverride(input: OverrideInput): Promise<SampleOutcome<Override>> {
  const s = store();
  const errors: NonNullable<Problem["errors"]> = [];
  const tenant = s.tenants.find((x) => x.id === input.tenant_id && !x.is_platform);
  if (!tenant) errors.push({ field: "tenant_id", code: "unknown", detail: "is not a tenant" });
  const kind = (["module", "feature", "limit"] as const).find((k) => k === input.kind);
  if (!kind) errors.push({ field: "kind", code: "unknown", detail: "is not a kind" });
  const key = input.key.trim();
  const known =
    kind === "module"
      ? key in MODULE_REQUIRES
      : kind === "feature"
        ? (FEATURE_KEYS as readonly string[]).includes(key)
        : (LIMIT_KEYS as readonly string[]).includes(key);
  if (!key) errors.push({ field: "key", code: "required", detail: "is required" });
  else if (kind && !known)
    errors.push({ field: "key", code: "unknown_key", detail: "is not in the catalog" });
  const value = input.value.trim();
  if (kind === "limit" && !WHOLE.test(value.replace(/[.\s]/g, ""))) {
    errors.push({ field: "value", code: "whole_number", detail: "must be a whole number" });
  }
  if (kind !== "limit" && value !== "on" && value !== "off") {
    errors.push({ field: "value", code: "on_off", detail: "must be on or off" });
  }
  const today = new Date().toISOString().slice(0, 10);
  if (input.expires_on && (!DAY_TEXT.test(input.expires_on) || input.expires_on < today)) {
    errors.push({ field: "expires_on", code: "past_date", detail: "must be today or later" });
  }
  if (badReason(input.reason)) {
    errors.push({ field: "reason", code: "length_10_500", detail: "must be 10 to 500 characters" });
  }
  if (errors.length > 0 || !tenant || !kind) return invalid(errors);
  const entry: Override = {
    id: crypto.randomUUID(),
    tenant_id: tenant.id,
    kind,
    key,
    enabled: kind === "limit" ? null : value === "on",
    max_value: kind === "limit" ? Number(value.replace(/[.\s]/g, "")) : null,
    reason: input.reason.trim(),
    expires_at: input.expires_on ? `${input.expires_on}T23:59:59.000Z` : null,
    created_by: ACTOR,
    created_at: new Date().toISOString(),
  };
  // Unique (tenant_id, kind, key): ghi đè mới thay ghi đè cũ của cùng khoá.
  s.overrides = s.overrides.filter(
    (o) => !(o.tenant_id === tenant.id && o.kind === kind && o.key === key),
  );
  s.overrides.unshift(entry);
  return { ok: true, data: structuredClone(entry) };
}

/** Thay bằng DELETE /api/v1/plans/tenants/{tenant_id}/overrides/{id} (bước 35) khi core có. */
export async function removeOverride(id: string): Promise<SampleOutcome<Override>> {
  const s = store();
  const found = s.overrides.find((o) => o.id === id);
  if (!found) return failed(404, "plans.override_not_found", `No override ${id}.`);
  s.overrides = s.overrides.filter((o) => o.id !== id);
  return { ok: true, data: structuredClone(found) };
}

/** Hoàn tác "bỏ ghi đè": đặt lại đúng ghi đè vừa bỏ (cùng id). */
export async function restoreOverride(entry: Override): Promise<SampleOutcome<Override>> {
  const s = store();
  s.overrides = s.overrides.filter(
    (o) => !(o.tenant_id === entry.tenant_id && o.kind === entry.kind && o.key === entry.key),
  );
  s.overrides.unshift(structuredClone(entry));
  return { ok: true, data: entry };
}

/** Thay bằng GET /api/v1/plans/tenants/{tenant_id}/usage (bước 35) khi core có. */
export async function getUsage(tenantId: string): Promise<{ data: TenantUsage[] }> {
  if (tenantId === SAMPLE_TENANT_ID) {
    const { data } = await tenantLimits();
    return {
      data: data.map((l) => ({
        key: l.key,
        unit: l.unit,
        used: l.used,
        max: l.max,
        over_limit: l.over_limit,
      })),
    };
  }
  return { data: structuredClone(store().usage[tenantId] ?? []) };
}

/** Phần trăm đã dùng (0–100); không giới hạn thì 0. */
export function usageRatio(usage: Pick<TenantUsage, "used" | "max">): number {
  if (usage.max === null || usage.max <= 0) return 0;
  return Math.min(100, Math.floor((usage.used / usage.max) * 100));
}

/** Hạn mức gần chạm nhất của khách (cột "Hạn mức gần nhất"). */
export function nearestLimit(list: readonly TenantUsage[]): TenantUsage | null {
  return (
    [...list].filter((u) => u.max !== null).sort((a, b) => usageRatio(b) - usageRatio(a))[0] ?? null
  );
}

/** Một module của khách: có trong gói không, đang bật không, bật / tắt nhờ ghi đè nào. */
export interface ModuleAccess {
  module: string;
  in_plan: boolean;
  enabled: boolean;
  override: Override | null;
}

/**
 * Module đang bật cho khách = module của gói chính + gói thêm, rồi áp ghi đè `module`. Dự kiến lấy
 * từ GET /api/v1/plans/tenants/{tenant_id}/entitlements (mới: bước 35 chỉ có `/entitlements` của
 * khách hiện tại).
 */
export async function moduleAccess(tenantId: string): Promise<{ data: ModuleAccess[] }> {
  const sub = await getTenantSubscription(tenantId);
  const s = store();
  const planIds = sub ? [sub.plan_id, ...sub.addons.map((a) => a.plan_id)] : [];
  const inPlan = new Set(s.plans.filter((p) => planIds.includes(p.id)).flatMap((p) => p.modules));
  const overrides = s.overrides.filter((o) => o.tenant_id === tenantId && o.kind === "module");
  const data = Object.keys(MODULE_REQUIRES).map((module): ModuleAccess => {
    const override = overrides.find((o) => o.key === module) ?? null;
    return {
      module,
      in_plan: inPlan.has(module),
      enabled: override ? override.enabled === true : inPlan.has(module),
      override: override ? structuredClone(override) : null,
    };
  });
  return { data };
}
