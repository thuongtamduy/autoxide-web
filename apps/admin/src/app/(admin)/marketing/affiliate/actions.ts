"use server";

// Server Action của màn "Tiếp thị liên kết": gọi hàm mẫu của `src/sample/affiliate.ts` (module `affiliate`
// của core chưa có, bước 49; W-006, W-019). Lỗi dịch theo `affiliate.codes.*` / `affiliate.fields.*`.
import { refresh } from "next/cache";
import { getTranslations } from "next-intl/server";
import {
  AFFILIATE_FINANCE,
  AFFILIATE_LIVE_MANAGE,
  AFFILIATE_MANAGE,
  AFFILIATE_PARTNER,
  AFFILIATE_READ,
} from "@/lib/affiliate";
import { commerceGuard, finishCommerce, translateCommerce, typed } from "@/lib/commerce-action";
import type { ChangeState } from "@/lib/engage";
import { type FormState, problemState } from "@/lib/form";
import { can } from "@/lib/viewer";
import {
  addRule,
  type CommissionPreview,
  changeSession,
  closeRule,
  createLink,
  disableLink,
  markPayoutPaid,
  pinProduct,
  previewCommission,
  retryPayout,
  saveProgram,
  scheduleSession,
  transitionPartner,
} from "@/sample/affiliate";

async function guard(permission: string | readonly string[]): Promise<FormState | null> {
  const off = await commerceGuard();
  if (off) return off;
  if (await can(permission)) return null;
  const t = await getTranslations("errors");
  const name = typeof permission === "string" ? permission : permission.join(", ");
  return { error: t("forbidden", { permission: name }), code: "forbidden" };
}

const idOf = (formData: FormData) => String(formData.get("id") ?? "");

// ---- Người tiếp thị

export async function approveAction(state: FormState, formData: FormData): Promise<FormState> {
  const blocked = await guard(AFFILIATE_MANAGE);
  if (blocked) return blocked;
  return finishCommerce("affiliate", state, await transitionPartner(idOf(formData), "approve"), []);
}

export async function suspendAction(state: FormState, formData: FormData): Promise<FormState> {
  const blocked = await guard(AFFILIATE_MANAGE);
  if (blocked) return blocked;
  const values = typed(formData, ["reason"]);
  const outcome = await transitionPartner(idOf(formData), "suspend", values.reason ?? "");
  return finishCommerce("affiliate", state, outcome, ["reason"], values);
}

export async function terminateAction(state: FormState, formData: FormData): Promise<FormState> {
  const blocked = await guard(AFFILIATE_MANAGE);
  if (blocked) return blocked;
  const values = typed(formData, ["reason"]);
  const outcome = await transitionPartner(idOf(formData), "terminate", values.reason ?? "");
  return finishCommerce("affiliate", state, outcome, ["reason"], values);
}

/** Mở lại (đảo được: Hoàn tác tạm khoá lại với lý do "hoàn tác"). */
export async function reopenAction(_state: ChangeState, formData: FormData): Promise<ChangeState> {
  const blocked = await guard(AFFILIATE_MANAGE);
  if (blocked) return blocked;
  const to = formData.get("status") === "suspended" ? "suspend" : "reopen";
  const t = await getTranslations("affiliate");
  const outcome = await transitionPartner(
    idOf(formData),
    to,
    to === "suspend" ? t("partners.undoReason") : "",
  );
  if (!outcome.ok) return problemState(await translateCommerce(outcome.problem, "affiliate"), []);
  refresh();
  return { done: 1, previous: outcome.data.previous, updated: outcome.data.partner.updated_at };
}

// ---- Quy tắc, chương trình

const RULE_FIELDS = ["scope", "target", "partner", "rate", "cap", "priority", "from"] as const;

export async function ruleAction(state: FormState, formData: FormData): Promise<FormState> {
  const blocked = await guard(AFFILIATE_MANAGE);
  if (blocked) return blocked;
  const values = typed(formData, [...RULE_FIELDS, "product", "category"]);
  const scope = values.scope ?? "";
  const outcome = await addRule({
    scope,
    target:
      scope === "product"
        ? (values.product ?? "")
        : scope === "category"
          ? (values.category ?? "")
          : "",
    partner: values.partner ?? "",
    rate: values.rate ?? "",
    cap: values.cap ?? "",
    priority: values.priority ?? "",
    from: values.from ?? "",
  });
  // Lỗi của `target` hiện dưới ô sản phẩm hay danh mục đang chọn.
  if (!outcome.ok && scope !== "default") {
    const field = scope === "product" ? "product" : "category";
    if (outcome.problem.errors) {
      outcome.problem.errors = outcome.problem.errors.map((e) =>
        e.field === "target" ? { ...e, field } : e,
      );
    }
  }
  return finishCommerce(
    "affiliate",
    state,
    outcome,
    [...RULE_FIELDS, "product", "category"],
    values,
  );
}

export async function closeRuleAction(state: FormState, formData: FormData): Promise<FormState> {
  const blocked = await guard(AFFILIATE_MANAGE);
  if (blocked) return blocked;
  return finishCommerce("affiliate", state, await closeRule(idOf(formData)), []);
}

export interface PreviewState extends FormState {
  result?: CommissionPreview;
}

export async function previewAction(
  state: PreviewState,
  formData: FormData,
): Promise<PreviewState> {
  const blocked = await guard([AFFILIATE_MANAGE, AFFILIATE_READ]);
  if (blocked) return blocked;
  const values = typed(formData, ["sku", "code", "day", "partner"]);
  const outcome = await previewCommission({
    sku: values.sku ?? "",
    code: values.code ?? "",
    day: values.day ?? "",
    partner: values.partner ?? "",
  });
  if (!outcome.ok) {
    return {
      ...problemState(await translateCommerce(outcome.problem, "affiliate"), [
        "sku",
        "code",
        "day",
      ]),
      values,
    };
  }
  return { done: (state.done ?? 0) + 1, values, result: outcome.data };
}

const PROGRAM_FIELDS = ["days", "precedence", "base", "mode", "min"] as const;

export async function programAction(state: FormState, formData: FormData): Promise<FormState> {
  const blocked = await guard(AFFILIATE_MANAGE);
  if (blocked) return blocked;
  const values = typed(formData, PROGRAM_FIELDS);
  const outcome = await saveProgram({
    days: values.days ?? "",
    precedence: values.precedence ?? "",
    base: values.base ?? "",
    auto: formData.get("auto") === "on",
    mode: values.mode ?? "",
    min: values.min ?? "",
  });
  return finishCommerce("affiliate", state, outcome, PROGRAM_FIELDS, values);
}

// ---- Chi trả (việc về tiền: hộp xác nhận, không hoàn tác được)

export async function markPaidAction(state: FormState, formData: FormData): Promise<FormState> {
  const blocked = await guard(AFFILIATE_FINANCE);
  if (blocked) return blocked;
  const values = typed(formData, ["bank_reference", "date"]);
  const outcome = await markPayoutPaid(idOf(formData), {
    bank_reference: values.bank_reference ?? "",
    date: values.date ?? "",
  });
  return finishCommerce("affiliate", state, outcome, ["bank_reference", "date"], values);
}

export async function retryPayoutAction(state: FormState, formData: FormData): Promise<FormState> {
  const blocked = await guard(AFFILIATE_FINANCE);
  if (blocked) return blocked;
  return finishCommerce("affiliate", state, await retryPayout(idOf(formData)), []);
}

// ---- Livestream

const SCHEDULE_FIELDS = ["title", "host", "platform", "at"] as const;

export async function scheduleAction(state: FormState, formData: FormData): Promise<FormState> {
  const blocked = await guard(AFFILIATE_LIVE_MANAGE);
  if (blocked) return blocked;
  const values = typed(formData, SCHEDULE_FIELDS);
  const outcome = await scheduleSession({
    title: values.title ?? "",
    host: values.host ?? "",
    platform: values.platform ?? "",
    at: values.at ?? "",
  });
  return finishCommerce("affiliate", state, outcome, SCHEDULE_FIELDS, values);
}

export async function startAction(state: FormState, formData: FormData): Promise<FormState> {
  const blocked = await guard(AFFILIATE_LIVE_MANAGE);
  if (blocked) return blocked;
  return finishCommerce("affiliate", state, await changeSession(idOf(formData), "live"), []);
}

export async function endAction(state: FormState, formData: FormData): Promise<FormState> {
  const blocked = await guard(AFFILIATE_LIVE_MANAGE);
  if (blocked) return blocked;
  return finishCommerce("affiliate", state, await changeSession(idOf(formData), "ended"), []);
}

export async function pinAction(state: FormState, formData: FormData): Promise<FormState> {
  const blocked = await guard(AFFILIATE_LIVE_MANAGE);
  if (blocked) return blocked;
  const values = typed(formData, ["sku", "code"]);
  const outcome = await pinProduct(idOf(formData), {
    sku: values.sku ?? "",
    code: values.code ?? "",
  });
  return finishCommerce("affiliate", state, outcome, ["sku", "code"], values);
}

// ---- Góc người tiếp thị (của chính mình)

const LINK_FIELDS = ["code", "target_kind", "sku"] as const;

export async function createLinkAction(state: FormState, formData: FormData): Promise<FormState> {
  const blocked = await guard([AFFILIATE_PARTNER, AFFILIATE_MANAGE]);
  if (blocked) return blocked;
  const values = typed(formData, LINK_FIELDS);
  const outcome = await createLink({
    code: values.code ?? "",
    target_kind: values.target_kind ?? "",
    sku: values.sku ?? "",
  });
  return finishCommerce("affiliate", state, outcome, LINK_FIELDS, values);
}

export async function disableLinkAction(state: FormState, formData: FormData): Promise<FormState> {
  const blocked = await guard([AFFILIATE_PARTNER, AFFILIATE_MANAGE]);
  if (blocked) return blocked;
  return finishCommerce("affiliate", state, await disableLink(idOf(formData)), []);
}
