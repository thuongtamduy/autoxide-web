"use server";

// Server Action của mặt điều khiển nền tảng (dữ liệu mẫu, W-006, W-014): gọi hàm mẫu của
// `src/sample/platform*.ts` thay cho API của bước 33, 34, 35, 39 của core, cùng cách trả lỗi
// (Problem → lỗi theo ô) như phần gọi core thật, để khi có API chỉ thay lời gọi. Mỗi action kiểm
// permission dự kiến của nhân sự nền tảng như core sẽ kiểm.
import { getTranslations } from "next-intl/server";
import type { DialogState } from "@/components/ui/form-dialog";
import type { FormState } from "@/lib/form";
import {
  PLANS_MANAGE,
  PROVISION,
  SUBSCRIPTIONS_MANAGE,
  SUPPORT_GRANT,
  TENANTS_MANAGE,
} from "@/lib/permissions";
import { finishSample, type SampleOutcome, sampleGuard } from "@/lib/sample-action";
import { can } from "@/lib/viewer";
import {
  createGrant,
  createProvisioning,
  migratePlacements,
  requestExport,
  retryProvisioning,
  revokeGrant,
  setTenantStatus,
} from "@/sample/platform";
import type { Override } from "@/sample/platform-data";
import {
  addPrice,
  assignPlan,
  cancelSubscription,
  createPlan,
  deactivatePrice,
  markPaid,
  removeOverride,
  restoreOverride,
  setOverride,
  setPlanStatus,
  setReadOnly,
  updatePlan,
} from "@/sample/platform-plans";

function text(formData: FormData, name: string): string {
  return String(formData.get(name) ?? "");
}

function values(formData: FormData, names: readonly string[]): Record<string, string> {
  return Object.fromEntries(names.map((name) => [name, text(formData, name)]));
}

/** Tắt dữ liệu mẫu hoặc thiếu permission thì không ghi gì. */
async function guard(permission: string): Promise<FormState | null> {
  const off = await sampleGuard();
  if (off) return off;
  if (await can(permission)) return null;
  const t = await getTranslations("errors");
  return { error: t("forbidden", { permission }), code: "forbidden" };
}

async function finish<T>(
  state: DialogState,
  outcome: SampleOutcome<T>,
  fields: readonly string[],
  sent: Record<string, string> = {},
  extra?: (data: T) => DialogState,
): Promise<DialogState> {
  const next = await finishSample(state, outcome, fields, sent);
  return outcome.ok && extra ? { ...next, ...extra(outcome.data) } : next;
}

// ---------------------------------------------------------------- Khách hàng

/** Tạm khoá hẳn một khách: mọi route trả 403 `tenant_suspended`. */
export async function suspendTenant(state: DialogState, formData: FormData): Promise<DialogState> {
  const stop = await guard(TENANTS_MANAGE);
  if (stop) return stop;
  const sent = values(formData, ["reason", "acknowledged"]);
  if (sent.acknowledged !== "on") {
    // Gom lỗi một lần: thiếu dấu xác nhận thì vẫn báo luôn lỗi của lý do (nếu có).
    const t = await getTranslations("sample.fields");
    const length = (sent.reason ?? "").trim().length;
    return {
      fields: {
        ...(length < 10 || length > 500 ? { reason: t("length_10_500") } : {}),
        acknowledged: t("acknowledge"),
      },
      values: sent,
    };
  }
  const outcome = await setTenantStatus(
    text(formData, "tenant_id"),
    "suspended",
    sent.reason ?? "",
  );
  return finish(state, outcome, ["reason"], sent);
}

/** Mở lại khách đang tạm khoá. */
export async function reactivateTenant(state: FormState, formData: FormData): Promise<FormState> {
  const stop = await guard(TENANTS_MANAGE);
  if (stop) return stop;
  return finish(state, await setTenantStatus(text(formData, "id"), "active", ""), []);
}

/** Xếp job xuất toàn bộ dữ liệu của khách. */
export async function exportTenant(state: DialogState, formData: FormData): Promise<DialogState> {
  const stop = await guard(TENANTS_MANAGE);
  if (stop) return stop;
  const sent = values(formData, ["reason"]);
  return finish(
    state,
    await requestExport(text(formData, "tenant_id"), sent.reason ?? ""),
    ["reason"],
    sent,
  );
}

/** Đặt / bỏ chỉ đọc (thuê bao). `on` = đặt chỉ đọc. */
export async function readOnlyTenant(state: FormState, formData: FormData): Promise<FormState> {
  const stop = await guard(SUBSCRIPTIONS_MANAGE);
  if (stop) return stop;
  const [tenantId = "", mode = ""] = text(formData, "id").split("|");
  return finish(state, await setReadOnly(tenantId, mode === "on"), []);
}

// ---------------------------------------------------------------- Placement

/** Chạy thử migration của một placement (`id`), hay cả đội khi `id` trống: không đổi dữ liệu. */
export async function dryRunMigrations(state: FormState, formData: FormData): Promise<FormState> {
  const stop = await guard(TENANTS_MANAGE);
  if (stop) return stop;
  const id = text(formData, "id");
  return finish(
    state,
    await migratePlacements({ ...(id ? { placement_id: id } : {}), dry_run: true }),
    [],
  );
}

/** Migrate thật một placement (sau khi chạy thử và xác nhận). */
export async function migratePlacement(state: FormState, formData: FormData): Promise<FormState> {
  const stop = await guard(TENANTS_MANAGE);
  if (stop) return stop;
  return finish(
    state,
    await migratePlacements({ placement_id: text(formData, "id"), dry_run: false }),
    [],
  );
}

/** Migrate thật cả đội theo lần chạy thử, khi gõ "migrate". */
export async function migrateFleet(state: DialogState, formData: FormData): Promise<DialogState> {
  const stop = await guard(TENANTS_MANAGE);
  if (stop) return stop;
  const sent = values(formData, ["confirm"]);
  const outcome = await migratePlacements({ dry_run: false, confirm: sent.confirm ?? "" });
  return finish(state, outcome, ["confirm"], sent);
}

// ---------------------------------------------------------------- Cấp phát

export async function provisionTenant(
  state: DialogState,
  formData: FormData,
): Promise<DialogState> {
  const stop = await guard(PROVISION);
  if (stop) return stop;
  const fields = [
    "tenant_name",
    "slug",
    "business_model",
    "plan_id",
    "placement",
    "admin_email",
    "parent_tenant_id",
  ];
  const sent = values(formData, [...fields, "sample_data"]);
  const outcome = await createProvisioning({
    tenant_name: sent.tenant_name ?? "",
    slug: sent.slug ?? "",
    business_model: sent.business_model ?? "",
    plan_id: sent.plan_id ?? "",
    placement: sent.placement ?? "",
    admin_email: sent.admin_email ?? "",
    sample_data: sent.sample_data === "on",
    parent_tenant_id: sent.parent_tenant_id ?? "",
  });
  return finish(state, outcome, fields, sent, () => ({ go: "/platform/provisioning" }));
}

export async function retryProvisioningAction(
  state: FormState,
  formData: FormData,
): Promise<FormState> {
  const stop = await guard(PROVISION);
  if (stop) return stop;
  return finish(state, await retryProvisioning(text(formData, "id")), []);
}

// ---------------------------------------------------------------- Gói và giá

const PLAN_FIELDS = ["code", "name", "description", "kind", "modules", "trial_days", "placement"];

export async function createPlanAction(
  state: DialogState,
  formData: FormData,
): Promise<DialogState> {
  const stop = await guard(PLANS_MANAGE);
  if (stop) return stop;
  const sent = values(formData, PLAN_FIELDS);
  const outcome = await createPlan({
    code: sent.code ?? "",
    name: sent.name ?? "",
    description: sent.description ?? "",
    kind: sent.kind ?? "",
    modules: sent.modules ?? "",
    trial_days: sent.trial_days ?? "",
    placement: sent.placement ?? "",
  });
  return finish(state, outcome, PLAN_FIELDS, sent, (plan) => ({
    go: `/platform/plans/${plan.id}`,
  }));
}

export async function updatePlanAction(
  state: DialogState,
  formData: FormData,
): Promise<DialogState> {
  const stop = await guard(PLANS_MANAGE);
  if (stop) return stop;
  const sent = values(formData, PLAN_FIELDS);
  const outcome = await updatePlan(text(formData, "plan_id"), {
    code: "",
    name: sent.name ?? "",
    description: sent.description ?? "",
    kind: "",
    modules: sent.modules ?? "",
    trial_days: sent.trial_days ?? "",
    placement: sent.placement ?? "",
  });
  return finish(state, outcome, PLAN_FIELDS, sent);
}

/** Bắt đầu bán (`id` = id gói). */
export async function startSelling(state: FormState, formData: FormData): Promise<FormState> {
  const stop = await guard(PLANS_MANAGE);
  if (stop) return stop;
  return finish(state, await setPlanStatus(text(formData, "id"), "active"), []);
}

/** Ngừng bán (`id` = id gói); khách đang dùng giữ gói tới khi đổi. */
export async function retirePlan(state: FormState, formData: FormData): Promise<FormState> {
  const stop = await guard(PLANS_MANAGE);
  if (stop) return stop;
  return finish(state, await setPlanStatus(text(formData, "id"), "retired"), []);
}

export async function addPriceAction(state: DialogState, formData: FormData): Promise<DialogState> {
  const stop = await guard(PLANS_MANAGE);
  if (stop) return stop;
  const sent = values(formData, ["interval", "amount"]);
  const outcome = await addPrice(text(formData, "plan_id"), {
    interval: sent.interval ?? "",
    amount: sent.amount ?? "",
  });
  return finish(state, outcome, ["interval", "amount"], sent);
}

export async function deactivatePriceAction(
  state: FormState,
  formData: FormData,
): Promise<FormState> {
  const stop = await guard(PLANS_MANAGE);
  if (stop) return stop;
  return finish(state, await deactivatePrice(text(formData, "id")), []);
}

// ---------------------------------------------------------------- Ghi đè

const OVERRIDE_FIELDS = ["tenant_id", "kind", "key", "value", "expires_on", "reason"];

export async function setOverrideAction(
  state: DialogState,
  formData: FormData,
): Promise<DialogState> {
  const stop = await guard(SUBSCRIPTIONS_MANAGE);
  if (stop) return stop;
  const sent = values(formData, OVERRIDE_FIELDS);
  const outcome = await setOverride({
    tenant_id: sent.tenant_id ?? "",
    kind: sent.kind ?? "",
    key: sent.key ?? "",
    value: sent.value ?? "",
    expires_on: sent.expires_on ?? "",
    reason: sent.reason ?? "",
  });
  // Bật / tắt một module (ghi đè `module`) đảo được: Hoàn tác bỏ đúng ghi đè vừa đặt.
  return finish(state, outcome, OVERRIDE_FIELDS, sent, (entry) => ({ undo: { id: entry.id } }));
}

/** Bỏ ghi đè; trả lại ghi đè vừa bỏ để Hoàn tác đặt lại đúng nó. */
export async function removeOverrideAction(
  state: DialogState,
  formData: FormData,
): Promise<DialogState> {
  const stop = await guard(SUBSCRIPTIONS_MANAGE);
  if (stop) return stop;
  const outcome = await removeOverride(text(formData, "id"));
  return finish(state, outcome, [], {}, (entry: Override) => ({
    undo: { entry: JSON.stringify(entry) },
  }));
}

/** Hoàn tác "bỏ ghi đè". */
export async function restoreOverrideAction(
  state: DialogState,
  formData: FormData,
): Promise<DialogState> {
  const stop = await guard(SUBSCRIPTIONS_MANAGE);
  if (stop) return stop;
  let entry: Override;
  try {
    entry = JSON.parse(text(formData, "entry")) as Override;
  } catch {
    return { error: "invalid", code: "invalid" };
  }
  return finish(state, await restoreOverride(entry), []);
}

/** Hoàn tác "đặt ghi đè" (bật / tắt module): bỏ ghi đè vừa đặt. */
export async function undoOverrideAction(
  state: DialogState,
  formData: FormData,
): Promise<DialogState> {
  const stop = await guard(SUBSCRIPTIONS_MANAGE);
  if (stop) return stop;
  return finish(state, await removeOverride(text(formData, "id")), []);
}

// ---------------------------------------------------------------- Thuê bao

export async function markPaidAction(state: DialogState, formData: FormData): Promise<DialogState> {
  const stop = await guard(SUBSCRIPTIONS_MANAGE);
  if (stop) return stop;
  const sent = values(formData, ["provider_reference", "paid_at"]);
  const outcome = await markPaid(text(formData, "period_id"), {
    provider_reference: sent.provider_reference ?? "",
    paid_at: sent.paid_at ?? "",
  });
  return finish(state, outcome, ["provider_reference", "paid_at"], sent);
}

export async function assignPlanAction(
  state: DialogState,
  formData: FormData,
): Promise<DialogState> {
  const stop = await guard(SUBSCRIPTIONS_MANAGE);
  if (stop) return stop;
  const sent = values(formData, ["price_id", "confirm"]);
  const outcome = await assignPlan(text(formData, "tenant_id"), {
    price_id: sent.price_id ?? "",
    confirm: sent.confirm ?? "",
    tenant_name: text(formData, "tenant_name"),
  });
  return finish(state, outcome, ["price_id", "confirm"], sent);
}

export async function cancelSubscriptionAction(
  state: FormState,
  formData: FormData,
): Promise<FormState> {
  const stop = await guard(SUBSCRIPTIONS_MANAGE);
  if (stop) return stop;
  return finish(state, await cancelSubscription(text(formData, "id")), []);
}

// ---------------------------------------------------------------- Quyền vào hỗ trợ

const GRANT_FIELDS = [
  "tenant_id",
  "staff_user_id",
  "role_id",
  "basis",
  "hours",
  "legal_reference",
  "reason",
];

export async function grantAccess(state: DialogState, formData: FormData): Promise<DialogState> {
  const stop = await guard(SUPPORT_GRANT);
  if (stop) return stop;
  const sent = values(formData, GRANT_FIELDS);
  const outcome = await createGrant({
    tenant_id: sent.tenant_id ?? "",
    staff_user_id: sent.staff_user_id ?? "",
    role_id: sent.role_id ?? "",
    basis: sent.basis ?? "",
    reason: sent.reason ?? "",
    legal_reference: sent.legal_reference ?? "",
    hours: sent.hours ?? "",
  });
  return finish(state, outcome, GRANT_FIELDS, sent);
}

export async function revokeAccess(state: FormState, formData: FormData): Promise<FormState> {
  const stop = await guard(SUPPORT_GRANT);
  if (stop) return stop;
  return finish(state, await revokeGrant(text(formData, "id")), []);
}
