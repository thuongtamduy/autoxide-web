"use server";

import { refresh } from "next/cache";
// Server Action của màn "Đơn hàng" (module `orders` của core chưa có, bước 45): gọi hàm mẫu của
// `src/sample/orders.ts` thay cho API (W-006, W-017), cùng cách trả lỗi như phần gọi core thật — lỗi
// theo ô, gom mọi lỗi một lần, mã lỗi `orders.*`. Khi có API chỉ thay lời gọi hàm mẫu.
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { commerceGuard, finishCommerce, translateCommerce, typed } from "@/lib/commerce-action";
import { loadAi } from "@/lib/content-server";
import type { ChangeState } from "@/lib/engage";
import { type FormState, problemState } from "@/lib/form";
import {
  filterQuery,
  ORDER_STATUSES,
  ORDERS_MANAGE,
  ORDERS_POS_SELL,
  ORDERS_READ,
  ORDERS_REFUND,
  ORDERS_RETURNS_MANAGE,
  type OrderStatus,
  readFilters,
} from "@/lib/orders";
import { can } from "@/lib/viewer";
import {
  acceptOrders,
  addNote,
  countOrders,
  decideProposal,
  decideReturn,
  matchingIds,
  parseFilterText,
  recordManualPayment,
  refundOrder,
  remindCart,
  resendPaymentLink,
  type SampleOutcome,
  saveView,
  transitionOrder,
  undoAccept,
} from "@/sample/orders";
import { createPosSale } from "@/sample/stores";

function idOf(formData: FormData): string {
  return String(formData.get("id") ?? "");
}

/** Thiếu permission thì trả lỗi như core (403) — nút đã ẩn, đây là lớp chặn thứ hai. */
async function guard(permission: string | readonly string[]): Promise<FormState | null> {
  const off = await commerceGuard();
  if (off) return off;
  if (await can(permission)) return null;
  const t = await getTranslations("errors");
  const name = typeof permission === "string" ? permission : permission.join(", ");
  return { error: t("forbidden", { permission: name }), code: "forbidden" };
}

async function failed(
  outcome: SampleOutcome<unknown> & { ok: false },
  fields: readonly string[] = [],
) {
  return problemState(await translateCommerce(outcome.problem, "orders"), fields);
}

// ---- Trạng thái đơn

/**
 * Đổi trạng thái đảo được (nhận đơn, bắt đầu chuẩn bị, tự giao): trả trạng thái cũ và `updated_at`
 * mới của đơn, để Hoàn tác gửi lại trạng thái cũ kèm phiên bản (`expect`).
 */
export async function orderStatusAction(
  _state: ChangeState,
  formData: FormData,
): Promise<ChangeState> {
  const blocked = await guard(ORDERS_MANAGE);
  if (blocked) return blocked;
  const to = String(formData.get("status") ?? "") as OrderStatus;
  if (!ORDER_STATUSES.includes(to)) return { error: "?", code: "validation_failed" };
  const expect = String(formData.get("expect") ?? "");
  const outcome = await transitionOrder(idOf(formData), to, expect ? { expect } : {});
  if (!outcome.ok) return failed(outcome);
  refresh();
  return { done: 1, previous: outcome.data.previous, updated: outcome.data.order.updated_at };
}

async function moveTo(
  state: FormState,
  formData: FormData,
  to: OrderStatus,
  reason?: string,
): Promise<FormState> {
  const blocked = await guard(ORDERS_MANAGE);
  if (blocked) return blocked;
  const outcome = await transitionOrder(idOf(formData), to, reason ? { reason } : {});
  return finishCommerce("orders", state, outcome, []);
}

/** Huỷ (không đảo được): đơn đã thu tiền thì tự tạo hoàn tiền toàn phần, trả chỗ giữ tồn. */
export async function cancelOrderAction(state: FormState, formData: FormData): Promise<FormState> {
  return moveTo(state, formData, "cancelled", "staff_cancelled");
}
export async function deliveredAction(state: FormState, formData: FormData): Promise<FormState> {
  return moveTo(state, formData, "delivered");
}
export async function redeliverAction(state: FormState, formData: FormData): Promise<FormState> {
  return moveTo(state, formData, "shipping", "redeliver");
}

export async function manualPaymentAction(
  state: FormState,
  formData: FormData,
): Promise<FormState> {
  const blocked = await guard(ORDERS_MANAGE);
  if (blocked) return blocked;
  const values = typed(formData, ["reference"]);
  const outcome = await recordManualPayment(idOf(formData), values.reference ?? "");
  return finishCommerce("orders", state, outcome, ["reference"], values);
}

export async function resendLinkAction(state: FormState, formData: FormData): Promise<FormState> {
  const blocked = await guard(ORDERS_MANAGE);
  if (blocked) return blocked;
  return finishCommerce("orders", state, await resendPaymentLink(idOf(formData)), []);
}

export async function noteAction(state: FormState, formData: FormData): Promise<FormState> {
  const blocked = await guard([ORDERS_MANAGE, ORDERS_READ]);
  if (blocked) return blocked;
  const outcome = await addNote(idOf(formData), String(formData.get("text") ?? ""));
  return finishCommerce("orders", state, outcome, ["text"]);
}

// ---- Hoàn tiền

const REFUND_FIELDS = ["amount", "reason"] as const;

/** Hoàn một phần hay toàn bộ (không đảo được): hộp thoại đã nêu số tiền và nơi tiền về. */
export async function refundAction(state: FormState, formData: FormData): Promise<FormState> {
  const blocked = await guard(ORDERS_REFUND);
  if (blocked) return blocked;
  const values = typed(formData, [...REFUND_FIELDS, "reference"]);
  const outcome = await refundOrder(idOf(formData), {
    amount: values.amount ?? "",
    reason: values.reason ?? "",
    reference: values.reference ?? "",
  });
  return finishCommerce("orders", state, outcome, REFUND_FIELDS, values);
}

/** Duyệt đề xuất hoàn tiền của agent: hoàn ngay (không đảo được). */
export async function approveProposalAction(
  state: FormState,
  formData: FormData,
): Promise<FormState> {
  const blocked = await guard(ORDERS_REFUND);
  if (blocked) return blocked;
  return finishCommerce("orders", state, await decideProposal(idOf(formData), "approve"), []);
}

/** Từ chối đề xuất (đảo được: `reopen` mở lại tới khi hết hạn). */
export async function proposalAction(
  _state: ChangeState,
  formData: FormData,
): Promise<ChangeState> {
  const blocked = await guard(ORDERS_REFUND);
  if (blocked) return blocked;
  const status = String(formData.get("status") ?? "");
  const outcome = await decideProposal(idOf(formData), status === "reopen" ? "reopen" : "reject");
  if (!outcome.ok) return failed(outcome);
  refresh();
  return {
    done: 1,
    previous: status === "reopen" ? "reject" : "reopen",
    updated: outcome.data.updated_at,
  };
}

// ---- Hàng loạt

export interface BulkState extends FormState {
  changed?: string[];
  skipped?: number;
}

/** Xác nhận nhiều đơn chờ xác nhận; "cả N đơn khớp bộ lọc" lấy theo bộ lọc của trang. */
export async function bulkAcceptAction(_state: BulkState, formData: FormData): Promise<BulkState> {
  const blocked = await guard(ORDERS_MANAGE);
  if (blocked) return blocked;
  const ids =
    formData.get("all") === "1"
      ? await matchingIds(
          readFilters(Object.fromEntries(new URLSearchParams(String(formData.get("query") ?? "")))),
        )
      : formData.getAll("ids").map(String);
  const out = await acceptOrders(ids);
  refresh();
  return { done: Date.now(), changed: out.changed, skipped: out.skipped };
}

export async function undoBulkAction(ids: string[]): Promise<number> {
  const blocked = await guard(ORDERS_MANAGE);
  if (blocked) return 0;
  const n = await undoAccept(ids);
  refresh();
  return n;
}

// ---- View và lọc bằng lời

export async function saveViewAction(state: FormState, formData: FormData): Promise<FormState> {
  const blocked = await guard(ORDERS_READ);
  if (blocked) return blocked;
  const values = typed(formData, ["name", "scope"]);
  const query = filterQuery(
    readFilters(Object.fromEntries(new URLSearchParams(String(formData.get("query") ?? "")))),
  );
  const outcome = await saveView({ name: values.name ?? "", scope: values.scope ?? "", query });
  return finishCommerce("orders", state, outcome, ["name", "scope"], values);
}

export interface AskState extends FormState {
  asked?: string;
  /** Chuỗi truy vấn của bộ lọc AI hiểu được (đã kiểm theo schema bộ lọc). */
  query?: string;
  unknown?: string;
  count?: number;
}

/**
 * "Hỏi bằng lời": chỉ chạy khi core báo AI bật (`GET /ai/status`, gọi thật). Phần hiểu câu là mẫu của
 * `POST /ai/filters/parse` (bước 52); kết quả chỉ là bộ lọc để người dùng sửa rồi áp, không làm gì khác.
 */
export async function askAction(_state: AskState, formData: FormData): Promise<AskState> {
  const blocked = await guard(ORDERS_READ);
  if (blocked) return blocked;
  const ai = await loadAi();
  const t = await getTranslations("orders.ask");
  if (!ai.enabled) return { error: t("off"), code: "ai.disabled" };
  const text = String(formData.get("text") ?? "").trim();
  if (!text) return { fields: { text: t("empty") }, code: "validation_failed" };
  const parsed = parseFilterText(text.slice(0, 200));
  return {
    done: Date.now(),
    asked: text,
    query: filterQuery(parsed.filters),
    unknown: parsed.unknown,
    count: await countOrders(parsed.filters),
  };
}

/** Số đơn khớp một bộ lọc (nút "Áp dụng · N đơn" sau khi sửa chip). */
export async function countAction(query: string): Promise<number> {
  if (await guard(ORDERS_READ)) return 0;
  return countOrders(readFilters(Object.fromEntries(new URLSearchParams(query))));
}

// ---- Đổi trả

async function returnStep(
  state: FormState,
  formData: FormData,
  step: Parameters<typeof decideReturn>[1],
  fields: readonly string[] = [],
  permission: string = ORDERS_RETURNS_MANAGE,
): Promise<FormState> {
  const blocked = await guard(permission);
  if (blocked) return blocked;
  return finishCommerce(
    "orders",
    state,
    await decideReturn(idOf(formData), step),
    fields,
    typed(formData, fields),
  );
}

export async function approveReturnAction(
  state: FormState,
  formData: FormData,
): Promise<FormState> {
  return returnStep(state, formData, { step: "approve" });
}
export async function rejectReturnAction(state: FormState, formData: FormData): Promise<FormState> {
  return returnStep(
    state,
    formData,
    {
      step: "reject",
      code: String(formData.get("code") ?? ""),
      note: String(formData.get("note") ?? ""),
    },
    ["code", "note"],
  );
}
export async function receiveReturnAction(
  state: FormState,
  formData: FormData,
): Promise<FormState> {
  return returnStep(
    state,
    formData,
    { step: "receive", condition: String(formData.get("condition") ?? "") },
    ["condition"],
  );
}
export async function refundReturnAction(state: FormState, formData: FormData): Promise<FormState> {
  return returnStep(state, formData, { step: "refund" }, [], ORDERS_REFUND);
}
export async function closeReturnAction(state: FormState, formData: FormData): Promise<FormState> {
  return returnStep(state, formData, { step: "close" });
}

// ---- Giỏ bỏ dở

/** Nhắc giỏ (đảo được tới lúc thư gửi đi): `status` = `remind` hoặc `undo`. */
export async function remindAction(_state: ChangeState, formData: FormData): Promise<ChangeState> {
  const blocked = await guard(ORDERS_MANAGE);
  if (blocked) return blocked;
  const undo = formData.get("status") === "undo";
  const outcome = await remindCart(idOf(formData), undo);
  if (!outcome.ok) return failed(outcome);
  refresh();
  return { done: 1, previous: undo ? "remind" : "undo", updated: new Date().toISOString() };
}

// ---- Bán tại quầy

const POS_FIELDS = ["org_id", "lines", "method"] as const;

/** Tạo đơn tại quầy rồi mở bản xem trước hoá đơn để in. */
export async function posSaleAction(_state: FormState, formData: FormData): Promise<FormState> {
  const blocked = await guard(ORDERS_POS_SELL);
  if (blocked) return blocked;
  const values = typed(formData, [...POS_FIELDS, "reference"]);
  const outcome = await createPosSale({
    org_id: values.org_id ?? "",
    lines: values.lines ?? "",
    method: values.method ?? "",
    reference: values.reference ?? "",
  });
  if (!outcome.ok) {
    const problem = await translateCommerce(outcome.problem, "orders");
    return { ...problemState(problem, POS_FIELDS), values };
  }
  redirect(`/sales/orders/${outcome.data.order.id}/receipt?new=1`);
}
