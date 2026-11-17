"use server";

// Server Action của "Gói và giá", "Thuê bao" và "Ghi đè" ở mặt điều khiển nền tảng (module `plans` của
// core, bước 35, D-324 – D-327). Core kiểm quyền (`plans.plans.manage`, `plans.subscriptions.manage`,
// chỉ nhân sự khách nền tảng), luật của gói (module, tính năng, hạn mức phải có thật) và vòng đời
// thuê bao; ở đây chỉ đổi ô của form thành thân request và Problem thành lỗi theo ô.
import type { components } from "@autoxide/sdk";
import { refresh } from "next/cache";
import { getTranslations } from "next-intl/server";
import type { DialogState } from "@/components/ui/form-dialog";
import { send } from "@/lib/action";
import { load } from "@/lib/core";
import { type FormState, nextDone, problemState } from "@/lib/form";
import { type Plan, parseLimits, splitList } from "@/lib/plans";

type PlanRequest = components["schemas"]["PlanRequest"];

function text(formData: FormData, name: string): string {
  return String(formData.get(name) ?? "").trim();
}

function values(formData: FormData, names: readonly string[]): Record<string, string> {
  return Object.fromEntries(names.map((name) => [name, text(formData, name)]));
}

async function done<T extends FormState>(state: T, extra: Partial<DialogState> = {}): Promise<T> {
  refresh();
  return { done: nextDone(state), ...extra } as T;
}

// ---------------------------------------------------------------- Gói

const PLAN_FIELDS = [
  "code",
  "name",
  "description",
  "kind",
  "modules",
  "features",
  "limits",
  "trial_days",
  "placement",
];

/** Thân gói từ ô của form, đè lên gói đang có (`PUT` gửi cả gói). */
async function planBody(
  formData: FormData,
  base: Partial<PlanRequest>,
): Promise<{ body: PlanRequest } | { state: DialogState }> {
  const sent = values(formData, PLAN_FIELDS);
  const t = await getTranslations("platform.plans");
  const required = await getTranslations("access.required");
  const fields: Record<string, string> = {};
  if (!sent.name) fields.name = required("field");
  if (formData.has("code") && !sent.code) fields.code = required("field");
  const parsed = parseLimits(formData.get("limits") === null ? "" : (sent.limits ?? ""));
  if (parsed.errors.length > 0)
    fields.limits = t("limitsInvalid", { lines: parsed.errors.join(", ") });
  const trial = sent.trial_days ? Number(sent.trial_days) : 0;
  if (!Number.isInteger(trial) || trial < 0) fields.trial_days = t("trialInvalid");
  if (Object.keys(fields).length > 0) return { state: { fields, values: sent } };
  return {
    body: {
      ...base,
      code: sent.code || base.code || "",
      name: sent.name ?? "",
      description: sent.description ?? "",
      ...(sent.kind ? { kind: sent.kind } : {}),
      modules: splitList(sent.modules ?? ""),
      ...(formData.has("features") ? { features: splitList(sent.features ?? "") } : {}),
      ...(formData.has("limits") ? { limits: parsed.limits } : {}),
      trial_days: trial,
      placement: sent.placement || base.placement || "shared",
    },
  };
}

/** Gói đang có thành thân `PlanRequest` (để `PUT` không xoá trường form không có). */
function asRequest(plan: Plan): PlanRequest {
  return {
    code: plan.code,
    name: plan.name,
    description: plan.description,
    kind: plan.kind,
    modules: plan.modules,
    features: plan.features,
    limits: plan.limits as Record<string, number | null>,
    trial_days: plan.trial_days,
    grace_days: plan.grace_days,
    suspend_days: plan.suspend_days,
    retention_days: plan.retention_days,
    renewal_lead_days: plan.renewal_lead_days,
    placement: plan.placement,
    requires_kyc: plan.requires_kyc,
    sample_data: plan.sample_data,
    is_default: plan.is_default,
    status: plan.status === "active" ? "active" : "draft",
  };
}

export async function createPlanAction(
  state: DialogState,
  formData: FormData,
): Promise<DialogState> {
  const built = await planBody(formData, {});
  if ("state" in built) return built.state;
  const result = await send((client) => client.POST("/api/v1/plans/plans", { body: built.body }));
  if (!result.ok) {
    return {
      ...problemState(result.problem, PLAN_FIELDS, { "plans.plan_code_taken": "code" }),
      values: values(formData, PLAN_FIELDS),
    };
  }
  return done(state, { go: `/platform/plans/${result.data.data.id}` });
}

async function loadPlan(id: string): Promise<Plan> {
  return (await load((c) => c.GET("/api/v1/plans/plans/{id}", { params: { path: { id } } }))).data;
}

export async function updatePlanAction(
  state: DialogState,
  formData: FormData,
): Promise<DialogState> {
  const id = text(formData, "plan_id");
  const built = await planBody(formData, asRequest(await loadPlan(id)));
  if ("state" in built) return built.state;
  const result = await send((client) =>
    client.PUT("/api/v1/plans/plans/{id}", { params: { path: { id } }, body: built.body }),
  );
  if (!result.ok) {
    return {
      ...problemState(result.problem, PLAN_FIELDS),
      values: values(formData, PLAN_FIELDS),
    };
  }
  return done(state);
}

/** Bắt đầu bán (`id` = id gói): gửi lại cả gói với `status: active`. */
export async function startSelling(state: FormState, formData: FormData): Promise<FormState> {
  const id = text(formData, "id");
  const body = { ...asRequest(await loadPlan(id)), status: "active" };
  const result = await send((client) =>
    client.PUT("/api/v1/plans/plans/{id}", { params: { path: { id } }, body }),
  );
  if (!result.ok) return problemState(result.problem, []);
  return done(state);
}

/** Đặt làm gói mặc định (khách chưa có thuê bao dùng gói này). */
export async function makeDefault(state: FormState, formData: FormData): Promise<FormState> {
  const id = text(formData, "id");
  const body = { ...asRequest(await loadPlan(id)), is_default: true };
  const result = await send((client) =>
    client.PUT("/api/v1/plans/plans/{id}", { params: { path: { id } }, body }),
  );
  if (!result.ok) return problemState(result.problem, []);
  return done(state);
}

/** Ngừng bán (`id` = id gói); khách đang dùng giữ gói tới khi đổi. */
export async function retirePlan(state: FormState, formData: FormData): Promise<FormState> {
  const result = await send((client) =>
    client.POST("/api/v1/plans/plans/{id}/retire", {
      params: { path: { id: text(formData, "id") } },
    }),
  );
  if (!result.ok) return problemState(result.problem, []);
  return done(state);
}

/** Thêm giá định kỳ (số tiền theo đơn vị nhỏ nhất của tiền tệ: đồng với VND). */
export async function addPriceAction(state: DialogState, formData: FormData): Promise<DialogState> {
  const sent = values(formData, ["interval", "amount", "currency"]);
  const amount = (sent.amount ?? "").replace(/[\s.,_]/g, "");
  if (!/^\d{1,19}$/.test(amount)) {
    const t = await getTranslations("platform.plans");
    return { fields: { amount: t("amountInvalid") }, values: sent };
  }
  const result = await send((client) =>
    client.POST("/api/v1/plans/plans/{id}/prices", {
      params: { path: { id: text(formData, "plan_id") } },
      body: {
        kind: "recurring",
        interval: sent.interval === "year" ? "year" : "month",
        amount: { amount, currency: sent.currency || "VND" },
      },
    }),
  );
  if (!result.ok) {
    return { ...problemState(result.problem, ["interval", "amount"]), values: sent };
  }
  return done(state);
}

export async function deactivatePriceAction(
  state: FormState,
  formData: FormData,
): Promise<FormState> {
  const result = await send((client) =>
    client.POST("/api/v1/plans/prices/{id}/deactivate", {
      params: { path: { id: text(formData, "id") } },
    }),
  );
  if (!result.ok) return problemState(result.problem, []);
  return done(state);
}

// ---------------------------------------------------------------- Ghi đè cho từng khách

const OVERRIDE_FIELDS = ["tenant_id", "kind", "key", "value", "expires_on", "reason"];

/**
 * Ô "giá trị" của ghi đè: module / tính năng nhận bật / tắt (`on`, `off`, `bật`, `tắt`, `true`,
 * `false`); hạn mức nhận số hay `∞` (không giới hạn). Sai thì `undefined`.
 */
function overrideValue(
  kind: string,
  raw: string,
): { enabled: boolean } | { max_value: number | null } | undefined {
  const value = raw.trim().toLowerCase();
  if (kind === "limit") {
    if (value === "" || value === "∞" || value === "unlimited" || value === "không giới hạn") {
      return { max_value: null };
    }
    return /^\d{1,18}$/.test(value) ? { max_value: Number(value) } : undefined;
  }
  if (["on", "true", "bật", "1"].includes(value)) return { enabled: true };
  if (["off", "false", "tắt", "0"].includes(value)) return { enabled: false };
  return undefined;
}

/** Đặt ghi đè (thay ghi đè cùng loại và khoá). Hoàn tác = bỏ đúng ghi đè vừa đặt. */
export async function setOverrideAction(
  state: DialogState,
  formData: FormData,
): Promise<DialogState> {
  const sent = values(formData, OVERRIDE_FIELDS);
  const t = await getTranslations("platform.overrides");
  const required = await getTranslations("access.required");
  const kind = sent.kind === "module" || sent.kind === "feature" ? sent.kind : "limit";
  const parsed = overrideValue(kind, sent.value ?? "");
  const fields: Record<string, string> = {};
  if (!sent.tenant_id) fields.tenant_id = required("field");
  if (!sent.key) fields.key = required("field");
  if (!parsed) fields.value = t("valueInvalid");
  if (!sent.reason) fields.reason = required("reason");
  if (Object.keys(fields).length > 0 || !parsed) return { fields, values: sent };
  const result = await send((client) =>
    client.POST("/api/v1/plans/tenants/{tenant_id}/overrides", {
      params: { path: { tenant_id: sent.tenant_id ?? "" } },
      body: {
        kind,
        key: sent.key ?? "",
        reason: sent.reason ?? "",
        ...parsed,
        ...(sent.expires_on ? { expires_at: `${sent.expires_on}T23:59:59Z` } : {}),
      },
    }),
  );
  if (!result.ok) {
    return { ...problemState(result.problem, OVERRIDE_FIELDS), values: sent };
  }
  return done(state, { undo: { id: `${sent.tenant_id}|${result.data.data.id}` } });
}

/** Bỏ ghi đè (`id` = `<tenant_id>|<override_id>`); trả ghi đè vừa bỏ để Hoàn tác đặt lại. */
export async function removeOverrideAction(
  state: DialogState,
  formData: FormData,
): Promise<DialogState> {
  const [tenantId = "", id = ""] = text(formData, "id").split("|");
  const current = await send((client) =>
    client.GET("/api/v1/plans/tenants/{tenant_id}/overrides", {
      params: { path: { tenant_id: tenantId } },
    }),
  );
  const entry = current.ok ? current.data.data.find((o) => o.id === id) : undefined;
  const result = await send((client) =>
    client.DELETE("/api/v1/plans/tenants/{tenant_id}/overrides/{id}", {
      params: { path: { tenant_id: tenantId, id } },
    }),
  );
  if (!result.ok) return problemState(result.problem, []);
  return done(
    state,
    entry ? { undo: { entry: JSON.stringify({ ...entry, tenant_id: tenantId }) } } : {},
  );
}

/** Hoàn tác "bỏ ghi đè": đặt lại đúng ghi đè vừa bỏ. */
export async function restoreOverrideAction(
  state: DialogState,
  formData: FormData,
): Promise<DialogState> {
  let entry: components["schemas"]["OverrideResponse"] & { tenant_id: string };
  try {
    entry = JSON.parse(text(formData, "entry"));
  } catch {
    return { error: "invalid", code: "validation_failed" };
  }
  const result = await send((client) =>
    client.POST("/api/v1/plans/tenants/{tenant_id}/overrides", {
      params: { path: { tenant_id: entry.tenant_id } },
      body: {
        kind: entry.kind,
        key: entry.key,
        reason: entry.reason,
        ...(entry.kind === "limit"
          ? { max_value: entry.max_value ?? null }
          : { enabled: entry.enabled ?? false }),
        ...(entry.expires_at ? { expires_at: entry.expires_at } : {}),
      },
    }),
  );
  if (!result.ok) return problemState(result.problem, []);
  return done(state);
}

/** Hoàn tác "đặt ghi đè": bỏ ghi đè vừa đặt (`id` = `<tenant_id>|<override_id>`). */
export async function undoOverrideAction(
  state: DialogState,
  formData: FormData,
): Promise<DialogState> {
  const [tenantId = "", id = ""] = text(formData, "id").split("|");
  const result = await send((client) =>
    client.DELETE("/api/v1/plans/tenants/{tenant_id}/overrides/{id}", {
      params: { path: { tenant_id: tenantId, id } },
    }),
  );
  if (!result.ok) return problemState(result.problem, []);
  return done(state);
}

// ---------------------------------------------------------------- Thuê bao của một khách

/**
 * Gán gói cho khách (`PUT /plans/tenants/{id}/subscription`): gõ lại tên khách để xác nhận (đổi gói
 * của khách có hệ quả ngay). Lần đầu tạo thuê bao (có dùng thử nếu khách chưa dùng thử bao giờ).
 */
export async function assignPlanAction(
  state: DialogState,
  formData: FormData,
): Promise<DialogState> {
  const sent = values(formData, ["choice", "confirm"]);
  const t = await getTranslations("platform.subs");
  const name = text(formData, "tenant_name");
  const [planId = "", priceId = ""] = (sent.choice ?? "").split("|");
  const fields: Record<string, string> = {};
  if (!planId) fields.choice = t("assignPrice");
  if ((sent.confirm ?? "") !== name) fields.confirm = t("assignConfirmWrong", { tenant: name });
  if (Object.keys(fields).length > 0) return { fields, values: sent };
  const result = await send((client) =>
    client.PUT("/api/v1/plans/tenants/{tenant_id}/subscription", {
      params: { path: { tenant_id: text(formData, "tenant_id") } },
      body: { plan_id: planId, ...(priceId ? { price_id: priceId } : {}) },
    }),
  );
  if (!result.ok) return { ...problemState(result.problem, ["choice"]), values: sent };
  return done(state);
}

/** Huỷ ngay thuê bao của khách: khách thành chỉ đọc, dữ liệu giữ tới hạn rồi xoá. */
export async function cancelSubscriptionAction(
  state: FormState,
  formData: FormData,
): Promise<FormState> {
  const result = await send((client) =>
    client.POST("/api/v1/plans/tenants/{tenant_id}/subscription/cancel", {
      params: { path: { tenant_id: text(formData, "id") } },
    }),
  );
  if (!result.ok) return problemState(result.problem, []);
  return done(state);
}

/** Khoá hẳn khách (không chỉ đọc): mọi lời gọi bị từ chối, có lý do (ghi nhật ký). */
export async function suspendTenantAction(
  state: DialogState,
  formData: FormData,
): Promise<DialogState> {
  const sent = values(formData, ["reason"]);
  if (!sent.reason) {
    const required = await getTranslations("access.required");
    return { fields: { reason: required("reason") }, values: sent };
  }
  const result = await send((client) =>
    client.POST("/api/v1/plans/tenants/{tenant_id}/subscription/suspend", {
      params: { path: { tenant_id: text(formData, "tenant_id") } },
      body: { reason: sent.reason ?? "" },
    }),
  );
  if (!result.ok) return { ...problemState(result.problem, ["reason"]), values: sent };
  return done(state);
}

/**
 * Ghi nhận một kỳ đã thu ngoài hệ thống (vd chuyển khoản kiểm bằng tay, D-335): mã giao dịch của ngân
 * hàng bắt buộc. Thuê bao quá hạn hay bị khoá dùng lại được.
 */
export async function markPaidAction(state: DialogState, formData: FormData): Promise<DialogState> {
  const typed = values(formData, ["provider_reference"]);
  if (!typed.provider_reference) {
    const t = await getTranslations("access.required");
    return { fields: { provider_reference: t("field") }, values: typed };
  }
  const result = await send((client) =>
    client.POST("/api/v1/plans/billing-periods/{id}/mark-paid", {
      params: { path: { id: text(formData, "period_id") } },
      body: { provider_reference: typed.provider_reference ?? "" },
    }),
  );
  if (!result.ok) return { ...problemState(result.problem, ["provider_reference"]), values: typed };
  return done(state);
}
