"use server";

import { refresh } from "next/cache";
import { getTranslations } from "next-intl/server";
// Server Action của màn "Vận hành sàn" (module `marketplace` của core chưa có, bước 46): gọi hàm mẫu
// của `src/sample/market.ts` thay cho API (W-006, W-018), cùng cách trả lỗi như phần gọi core thật —
// lỗi theo ô, gom mọi lỗi một lần, mã lỗi `marketplace.*`. Khi có API chỉ thay lời gọi hàm mẫu.
import type { DialogState } from "@/components/ui/form-dialog";
import {
  commerceGuard,
  finishChange,
  finishCommerce,
  translateCommerce,
  typed,
} from "@/lib/commerce-action";
import type { ChangeState } from "@/lib/engage";
import { type FormState, nextDone, problemState } from "@/lib/form";
import {
  MARKETPLACE_DISPUTES_RESOLVE,
  MARKETPLACE_FEES_MANAGE,
  MARKETPLACE_FINANCE_MANAGE,
  MARKETPLACE_LISTINGS_REVIEW,
  MARKETPLACE_SELLERS_MANAGE,
} from "@/lib/market";
import { can, getMe } from "@/lib/viewer";
import {
  addFeeRule,
  addPenalty,
  cancelFeeRule,
  decideDocument,
  decideListing,
  type FeePreview,
  inviteSeller,
  previewFees,
  resolveDispute,
  retryPayout,
  sendPayout,
  transitionSeller,
} from "@/sample/market";

const idOf = (formData: FormData) => String(formData.get("id") ?? "");

async function actor(): Promise<string> {
  const me = await getMe();
  return me.name || me.email;
}

/** Thiếu permission thì trả lỗi như core (403) — nút đã ẩn, đây là lớp chặn thứ hai. */
async function guard(permission: string): Promise<FormState | null> {
  const off = await commerceGuard();
  if (off) return off;
  if (await can(permission)) return null;
  const t = await getTranslations("errors");
  return { error: t("forbidden", { permission }), code: "forbidden" };
}

// ---- Người bán

async function transition(
  state: DialogState,
  formData: FormData,
  name: "approve" | "reject" | "suspend" | "reinstate" | "terminate",
): Promise<DialogState> {
  const blocked = await guard(MARKETPLACE_SELLERS_MANAGE);
  if (blocked) return blocked;
  const values = typed(formData, ["reason"]);
  if (name === "terminate" && formData.get("acknowledged") !== "on") {
    const t = await getTranslations("sample.fields");
    return { fields: { acknowledged: t("acknowledge") }, values };
  }
  const outcome = await transitionSeller(
    idOf(formData),
    { transition: name, reason: values.reason ?? "" },
    await actor(),
  );
  if (!outcome.ok) {
    const problem = await translateCommerce(outcome.problem, "market");
    return { ...problemState(problem, ["reason"]), values };
  }
  refresh();
  const done: DialogState = { done: nextDone(state) };
  // Tạm khoá ↔ mở lại đảo được: Hoàn tác gửi lệnh ngược lại (kèm lý do cũ khi tạm khoá lại).
  if (name === "suspend") done.undo = { id: idOf(formData) };
  if (name === "reinstate" && outcome.data.previous === "suspended") {
    done.undo = { id: idOf(formData), reason: values.reason || "—" };
  }
  return done;
}

export async function approveSellerAction(state: FormState, formData: FormData) {
  return transition(state, formData, "approve");
}
export async function rejectSellerAction(state: DialogState, formData: FormData) {
  return transition(state, formData, "reject");
}
export async function suspendSellerAction(state: DialogState, formData: FormData) {
  return transition(state, formData, "suspend");
}
export async function reinstateSellerAction(state: DialogState, formData: FormData) {
  return transition(state, formData, "reinstate");
}
/** Hoàn tác của "Mở lại": tạm khoá lại với lý do cũ (lý do ngắn thì ghi rõ là hoàn tác). */
export async function resuspendSellerAction(state: DialogState, formData: FormData) {
  const reason = String(formData.get("reason") ?? "");
  const t = await getTranslations("market.sellers");
  formData.set("reason", reason.length >= 10 ? reason : t("undoReason"));
  return transition(state, formData, "suspend");
}
export async function terminateSellerAction(state: DialogState, formData: FormData) {
  return transition(state, formData, "terminate");
}

export async function approveDocumentAction(state: FormState, formData: FormData) {
  const blocked = await guard(MARKETPLACE_SELLERS_MANAGE);
  if (blocked) return blocked;
  const outcome = await decideDocument(
    idOf(formData),
    { decision: "approved", note: "" },
    await actor(),
  );
  return finishCommerce("market", state, outcome, []);
}

export async function rejectDocumentAction(state: DialogState, formData: FormData) {
  const blocked = await guard(MARKETPLACE_SELLERS_MANAGE);
  if (blocked) return blocked;
  const values = typed(formData, ["note"]);
  const outcome = await decideDocument(
    idOf(formData),
    { decision: "rejected", note: values.note ?? "" },
    await actor(),
  );
  return finishCommerce("market", state, outcome, ["note"], values);
}

const INVITE_FIELDS = ["email", "seller_type", "note"] as const;

export async function inviteSellerAction(state: DialogState, formData: FormData) {
  const blocked = await guard(MARKETPLACE_SELLERS_MANAGE);
  if (blocked) return blocked;
  const values = typed(formData, INVITE_FIELDS);
  const outcome = await inviteSeller({
    email: values.email ?? "",
    seller_type: values.seller_type ?? "",
    note: values.note ?? "",
  });
  return finishCommerce("market", state, outcome, INVITE_FIELDS, values);
}

const PENALTY_FIELDS = ["rule_code", "points", "sanction", "reason"] as const;

export async function addPenaltyAction(state: DialogState, formData: FormData) {
  const blocked = await guard(MARKETPLACE_SELLERS_MANAGE);
  if (blocked) return blocked;
  const values = typed(formData, PENALTY_FIELDS);
  const outcome = await addPenalty(
    idOf(formData),
    {
      rule_code: values.rule_code ?? "",
      points: values.points ?? "",
      sanction: values.sanction ?? "",
      reason: values.reason ?? "",
    },
    await actor(),
  );
  return finishCommerce("market", state, outcome, PENALTY_FIELDS, values);
}

// ---- Duyệt sản phẩm

/** Duyệt (và Hoàn tác về "chờ duyệt"): nút đổi trạng thái đảo được. */
export async function listingChangeAction(
  _state: ChangeState,
  formData: FormData,
): Promise<ChangeState> {
  const blocked = await guard(MARKETPLACE_LISTINGS_REVIEW);
  if (blocked) return blocked;
  const outcome = await decideListing(
    idOf(formData),
    { decision: String(formData.get("status") ?? ""), reason: "" },
    await actor(),
  );
  return finishChange("market", outcome, (data) => data.previous);
}

async function listingDecision(state: DialogState, formData: FormData, decision: string) {
  const blocked = await guard(MARKETPLACE_LISTINGS_REVIEW);
  if (blocked) return blocked;
  const values = typed(formData, ["reason"]);
  const outcome = await decideListing(
    idOf(formData),
    { decision, reason: values.reason ?? "" },
    await actor(),
  );
  return finishCommerce("market", state, outcome, ["reason"], values);
}

export async function rejectListingAction(state: DialogState, formData: FormData) {
  return listingDecision(state, formData, "rejected");
}
export async function delistAction(state: DialogState, formData: FormData) {
  return listingDecision(state, formData, "delisted");
}

// ---- Phí sàn

const FEE_FIELDS = ["fee_kind", "category_id", "seller_type", "rate", "effective_from"] as const;

export async function addFeeRuleAction(state: DialogState, formData: FormData) {
  const blocked = await guard(MARKETPLACE_FEES_MANAGE);
  if (blocked) return blocked;
  const values = typed(formData, FEE_FIELDS);
  const outcome = await addFeeRule(
    {
      fee_kind: values.fee_kind ?? "",
      category_id: values.category_id ?? "",
      seller_type: values.seller_type ?? "",
      rate: values.rate ?? "",
      effective_from: values.effective_from ?? "",
    },
    await actor(),
  );
  if (!outcome.ok && outcome.problem.code === "marketplace.fee_rule_overlap") {
    // Chồng ngày với dòng đã có: lỗi thuộc ô "Hiệu lực từ".
    const problem = await translateCommerce(outcome.problem, "market");
    return { fields: { effective_from: problem.detail }, values, code: problem.code };
  }
  return finishCommerce("market", state, outcome, FEE_FIELDS, values);
}

export async function cancelFeeRuleAction(state: FormState, formData: FormData) {
  const blocked = await guard(MARKETPLACE_FEES_MANAGE);
  if (blocked) return blocked;
  return finishCommerce("market", state, await cancelFeeRule(idOf(formData)), []);
}

export interface PreviewState extends FormState {
  result?: FeePreview;
}

const PREVIEW_FIELDS = ["category_id", "price", "seller_type", "date"] as const;

/** Tính thử phí: chỉ tính, không ghi (người bán cũng tính thử được ở trang của mình). */
export async function previewFeeAction(
  _state: PreviewState,
  formData: FormData,
): Promise<PreviewState> {
  const off = await commerceGuard();
  if (off) return off;
  const values = typed(formData, PREVIEW_FIELDS);
  const outcome = await previewFees({
    category_id: values.category_id ?? "",
    price: values.price ?? "",
    seller_type: values.seller_type ?? "",
    date: values.date ?? "",
  });
  if (!outcome.ok) {
    const problem = await translateCommerce(outcome.problem, "market");
    return { ...problemState(problem, PREVIEW_FIELDS), values };
  }
  return { done: 1, result: outcome.data, values };
}

// ---- Chi trả

export async function sendPayoutAction(state: FormState, formData: FormData) {
  const blocked = await guard(MARKETPLACE_FINANCE_MANAGE);
  if (blocked) return blocked;
  return finishCommerce("market", state, await sendPayout(idOf(formData)), []);
}

export async function retryPayoutAction(state: FormState, formData: FormData) {
  const blocked = await guard(MARKETPLACE_FINANCE_MANAGE);
  if (blocked) return blocked;
  return finishCommerce("market", state, await retryPayout(idOf(formData)), []);
}

// ---- Tranh chấp

const RESOLVE_FIELDS = ["resolution", "amount", "reason", "acknowledged"] as const;

export async function resolveDisputeAction(state: DialogState, formData: FormData) {
  const blocked = await guard(MARKETPLACE_DISPUTES_RESOLVE);
  if (blocked) return blocked;
  const values = typed(formData, ["resolution", "amount", "reason"]);
  const outcome = await resolveDispute(
    idOf(formData),
    {
      resolution: values.resolution ?? "",
      amount: values.amount ?? "",
      reason: values.reason ?? "",
      acknowledged: formData.get("acknowledged") === "on",
    },
    await actor(),
  );
  return finishCommerce("market", state, outcome, RESOLVE_FIELDS, values);
}
