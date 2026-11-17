"use server";

// Server Action của màn "Khách hàng": gọi hàm mẫu của `src/sample/customers.ts` (module `customers` của
// core chưa có, bước 47; W-006, W-019). Lỗi dịch theo `customers.codes.*` / `customers.fields.*`.
import type { Problem } from "@autoxide/sdk";
import { refresh } from "next/cache";
import { getTranslations } from "next-intl/server";
import { commerceGuard, finishCommerce, translateCommerce, typed } from "@/lib/commerce-action";
import {
  CUSTOMERS_ENGAGEMENT_MANAGE,
  CUSTOMERS_LOYALTY_ADJUST,
  CUSTOMERS_LOYALTY_MANAGE,
  CUSTOMERS_MANAGE,
  CUSTOMERS_READ,
  CUSTOMERS_SEGMENTS_MANAGE,
  ORDERS_RISK_MANAGE,
} from "@/lib/customers";
import type { ChangeState } from "@/lib/engage";
import { type FormState, problemState } from "@/lib/form";
import { type BulkInput, type BulkResult, bulkBlocked, cleanIds, eachId } from "@/lib/table";
import { can } from "@/lib/viewer";
import {
  addCodRule,
  addLoyaltyRule,
  addNote,
  addReferralRule,
  addReminderRule,
  adjustPoints,
  blockPhone,
  type CodLookup,
  createProfile,
  deleteGroup,
  getProfile,
  lookupBuyer,
  previewRule,
  profileNames,
  readRule,
  saveGroup,
  setBlockLifted,
  setGroupMember,
  setTags,
} from "@/sample/customers";

async function guard(permission: string | readonly string[]): Promise<FormState | null> {
  const off = await commerceGuard();
  if (off) return off;
  if (await can(permission)) return null;
  const t = await getTranslations("errors");
  const name = typeof permission === "string" ? permission : permission.join(", ");
  return { error: t("forbidden", { permission: name }), code: "forbidden" };
}

const idOf = (formData: FormData) => String(formData.get("id") ?? "");

// ---- Hồ sơ

const ADD_FIELDS = ["phone", "name", "org_id"] as const;

export async function addCustomerAction(state: FormState, formData: FormData): Promise<FormState> {
  const blocked = await guard(CUSTOMERS_MANAGE);
  if (blocked) return blocked;
  const values = typed(formData, ADD_FIELDS);
  const outcome = await createProfile({
    phone: values.phone ?? "",
    name: values.name ?? "",
    org_id: values.org_id ?? "",
  });
  return finishCommerce("customers", state, outcome, ADD_FIELDS, values);
}

export async function noteAction(state: FormState, formData: FormData): Promise<FormState> {
  const blocked = await guard(CUSTOMERS_MANAGE);
  if (blocked) return blocked;
  const values = typed(formData, ["body"]);
  return finishCommerce(
    "customers",
    state,
    await addNote(idOf(formData), values.body ?? ""),
    ["body"],
    values,
  );
}

export async function tagsAction(state: FormState, formData: FormData): Promise<FormState> {
  const blocked = await guard(CUSTOMERS_MANAGE);
  if (blocked) return blocked;
  const values = typed(formData, ["tags"]);
  return finishCommerce(
    "customers",
    state,
    await setTags(idOf(formData), values.tags ?? ""),
    ["tags"],
    values,
  );
}

const POINT_FIELDS = ["points", "reference", "reason"] as const;

/** Điều chỉnh điểm: ghi sổ điểm chỉ thêm và bút toán nghĩa vụ; cùng mã tham chiếu không cộng hai lần. */
export async function adjustPointsAction(state: FormState, formData: FormData): Promise<FormState> {
  const blocked = await guard(CUSTOMERS_LOYALTY_ADJUST);
  if (blocked) return blocked;
  const values = typed(formData, POINT_FIELDS);
  const outcome = await adjustPoints(idOf(formData), {
    points: values.points ?? "",
    reference: values.reference ?? "",
    reason: values.reason ?? "",
  });
  return finishCommerce("customers", state, outcome, POINT_FIELDS, values);
}


// ---- Hàng loạt (bảng Hồ sơ khách). Hàm mẫu (bước 47) chỉ có lệnh
// từng cái: lặp từng id, gom lỗi.

/** Câu lỗi đã dịch của một kết quả hàm mẫu (hoặc `null` khi xong). */
async function failure(outcome: { ok: true } | { ok: false; problem: Problem }) {
  return outcome.ok ? null : (await translateCommerce(outcome.problem, "customers")).detail;
}

/** Thêm các hồ sơ đã chọn vào một nhóm thủ công (`value` = id nhóm). */
export async function bulkAddToGroupAction(input: BulkInput): Promise<BulkResult> {
  const ids = cleanIds(input.ids);
  const blocked = await guard(CUSTOMERS_MANAGE);
  if (blocked) return bulkBlocked(ids, blocked.error ?? "");
  const names = await profileNames();
  const group = input.value ?? "";
  const result = await eachId(
    ids,
    async (id) => failure(await setGroupMember(group, id, true)),
    (id) => names.get(id) ?? id,
  );
  refresh();
  return result;
}

/** Gắn thêm một nhãn cho các hồ sơ đã chọn (giữ nhãn cũ). */
export async function bulkAddTagAction(input: BulkInput): Promise<BulkResult> {
  const ids = cleanIds(input.ids);
  const blocked = await guard(CUSTOMERS_MANAGE);
  if (blocked) return bulkBlocked(ids, blocked.error ?? "");
  const names = await profileNames();
  const tag = (input.value ?? "").trim();
  const result = await eachId(
    ids,
    async (id) => {
      const found = await getProfile(id);
      const tags = found ? [...found.data.tags, tag].join(", ") : tag;
      return failure(await setTags(id, tags));
    },
    (id) => names.get(id) ?? id,
  );
  refresh();
  return result;
}

// ---- Tài khoản người mua (bước 34)

/** Khoá / mở khoá (đảo được: `status` = `locked` hoặc `active`). */
// ---- Nhóm khách

const GROUP_FIELDS = ["name", "kind", "spent", "orders", "days", "tier", "org"] as const;

export async function groupAction(state: FormState, formData: FormData): Promise<FormState> {
  const blocked = await guard(CUSTOMERS_SEGMENTS_MANAGE);
  if (blocked) return blocked;
  const values = typed(formData, GROUP_FIELDS);
  const kind = values.kind ?? "";
  const rule = readRule({
    spent: values.spent ?? "",
    orders: values.orders ?? "",
    days: values.days ?? "",
    tier: values.tier ?? "",
    org: values.org ?? "",
  });
  if (kind === "rule" && !rule.ok) {
    const problem = await translateCommerce(
      {
        type: "about:blank",
        title: "",
        status: 422,
        code: "validation_failed",
        detail: "",
        errors: rule.errors,
      },
      "customers",
    );
    return { ...problemState(problem, GROUP_FIELDS), values };
  }
  const id = idOf(formData);
  const outcome = await saveGroup({
    ...(id ? { id } : {}),
    name: values.name ?? "",
    kind,
    rule: rule.ok ? rule.rule : null,
  });
  return finishCommerce("customers", state, outcome, GROUP_FIELDS, values);
}

export interface PreviewState extends FormState {
  result?: { matched: number; consented: number };
}

/** Xem trước số hồ sơ khớp quy tắc (không lưu gì). */
export async function previewRuleAction(
  state: PreviewState,
  formData: FormData,
): Promise<PreviewState> {
  const blocked = await guard([CUSTOMERS_SEGMENTS_MANAGE, CUSTOMERS_READ]);
  if (blocked) return blocked;
  const values = typed(formData, ["spent", "orders", "days", "tier", "org"]);
  const rule = readRule({
    spent: values.spent ?? "",
    orders: values.orders ?? "",
    days: values.days ?? "",
    tier: values.tier ?? "",
    org: values.org ?? "",
  });
  if (!rule.ok) {
    const problem = await translateCommerce(
      {
        type: "about:blank",
        title: "",
        status: 422,
        code: "validation_failed",
        detail: "",
        errors: rule.errors,
      },
      "customers",
    );
    return { ...problemState(problem, ["spent", "orders", "days"]), values };
  }
  return { done: (state.done ?? 0) + 1, values, result: await previewRule(rule.rule) };
}

export async function deleteGroupAction(state: FormState, formData: FormData): Promise<FormState> {
  const blocked = await guard(CUSTOMERS_SEGMENTS_MANAGE);
  if (blocked) return blocked;
  return finishCommerce("customers", state, await deleteGroup(idOf(formData)), []);
}

// ---- Điểm, nhắc giỏ, giới thiệu

const LOYALTY_FIELDS = ["earn", "value", "months", "min", "max_pct", "from"] as const;

export async function loyaltyRuleAction(state: FormState, formData: FormData): Promise<FormState> {
  const blocked = await guard(CUSTOMERS_LOYALTY_MANAGE);
  if (blocked) return blocked;
  const values = typed(formData, LOYALTY_FIELDS);
  const outcome = await addLoyaltyRule({
    earn: values.earn ?? "",
    value: values.value ?? "",
    months: values.months ?? "",
    min: values.min ?? "",
    max_pct: values.max_pct ?? "",
    from: values.from ?? "",
  });
  return finishCommerce("customers", state, outcome, LOYALTY_FIELDS, values);
}

export async function reminderRuleAction(state: FormState, formData: FormData): Promise<FormState> {
  const blocked = await guard(CUSTOMERS_ENGAGEMENT_MANAGE);
  if (blocked) return blocked;
  const values = typed(formData, ["delays", "channel"]);
  const outcome = await addReminderRule({
    enabled: formData.get("enabled") === "on",
    delays: values.delays ?? "",
    channel: values.channel ?? "",
  });
  return finishCommerce("customers", state, outcome, ["delays", "channel"], values);
}

const REFERRAL_FIELDS = ["referrer", "referee", "min", "from"] as const;

export async function referralRuleAction(state: FormState, formData: FormData): Promise<FormState> {
  const blocked = await guard(CUSTOMERS_ENGAGEMENT_MANAGE);
  if (blocked) return blocked;
  const values = typed(formData, REFERRAL_FIELDS);
  const outcome = await addReferralRule({
    referrer: values.referrer ?? "",
    referee: values.referee ?? "",
    min: values.min ?? "",
    from: values.from ?? "",
  });
  return finishCommerce("customers", state, outcome, REFERRAL_FIELDS, values);
}

// ---- Rủi ro COD (bước 45)

const COD_FIELDS = ["min", "ratio", "action", "from"] as const;

export async function codRuleAction(state: FormState, formData: FormData): Promise<FormState> {
  const blocked = await guard(ORDERS_RISK_MANAGE);
  if (blocked) return blocked;
  const values = typed(formData, COD_FIELDS);
  const outcome = await addCodRule({
    min: values.min ?? "",
    ratio: values.ratio ?? "",
    action: values.action ?? "",
    from: values.from ?? "",
  });
  return finishCommerce("customers", state, outcome, COD_FIELDS, values);
}

export interface LookupState extends FormState {
  result?: CodLookup;
}

/** Tra thống kê COD theo SĐT: số được chuẩn hoá và băm, không lưu số tra (không điền lại ô). */
export async function lookupAction(state: LookupState, formData: FormData): Promise<LookupState> {
  const blocked = await guard(ORDERS_RISK_MANAGE);
  if (blocked) return blocked;
  const outcome = await lookupBuyer(String(formData.get("phone") ?? ""));
  if (!outcome.ok)
    return problemState(await translateCommerce(outcome.problem, "customers"), ["phone"]);
  return { done: (state.done ?? 0) + 1, result: outcome.data };
}

const BLOCK_FIELDS = ["phone", "reason", "until", "note"] as const;

export async function blockAction(state: FormState, formData: FormData): Promise<FormState> {
  const blocked = await guard(ORDERS_RISK_MANAGE);
  if (blocked) return blocked;
  const values = typed(formData, BLOCK_FIELDS);
  const outcome = await blockPhone({
    phone: values.phone ?? "",
    reason: values.reason ?? "",
    until: values.until ?? "",
    note: values.note ?? "",
  });
  return finishCommerce("customers", state, outcome, BLOCK_FIELDS, values);
}

/** Gỡ chặn / chặn lại (đảo được: `status` = `lifted` hoặc `blocked`). */
export async function liftAction(_state: ChangeState, formData: FormData): Promise<ChangeState> {
  const blocked = await guard(ORDERS_RISK_MANAGE);
  if (blocked) return blocked;
  const lifted = formData.get("status") === "lifted";
  const outcome = await setBlockLifted(idOf(formData), lifted);
  if (!outcome.ok) return problemState(await translateCommerce(outcome.problem, "customers"), []);
  refresh();
  return { done: 1, previous: lifted ? "blocked" : "lifted", updated: outcome.data.updated_at };
}
