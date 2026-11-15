"use server";

// Server Action của màn "Cửa hàng" (nhận tại cửa hàng, ca thu ngân, đổi trả tại quầy, đánh giá): gọi
// hàm mẫu của `src/sample/orders.ts` và `src/sample/stores.ts` (module `orders` của core chưa có, bước
// 45; W-006, W-017). Lỗi dịch theo `orders.codes.*` / `orders.fields.*` như màn Đơn hàng.
import { refresh } from "next/cache";
import { getTranslations } from "next-intl/server";
import { commerceGuard, finishCommerce, translateCommerce, typed } from "@/lib/commerce-action";
import type { ChangeState } from "@/lib/engage";
import { type FormState, problemState } from "@/lib/form";
import {
  ORDERS_MANAGE,
  ORDERS_POS_SHIFT,
  ORDERS_RETURNS_MANAGE,
  ORDERS_REVIEWS_MODERATE,
} from "@/lib/orders";
import { can } from "@/lib/viewer";
import {
  createStoreReturn,
  handOver,
  pickupReady,
  resendPickupCode,
  transitionOrder,
} from "@/sample/orders";
import {
  closeShift,
  decideSummary,
  markReviewSeen,
  moderateReview,
  openShift,
  replyReview,
} from "@/sample/stores";

function idOf(formData: FormData): string {
  return String(formData.get("id") ?? "");
}

async function guard(permission: string | readonly string[]): Promise<FormState | null> {
  const off = await commerceGuard();
  if (off) return off;
  if (await can(permission)) return null;
  const t = await getTranslations("errors");
  const name = typeof permission === "string" ? permission : permission.join(", ");
  return { error: t("forbidden", { permission: name }), code: "forbidden" };
}

// ---- Nhận tại cửa hàng

/** Báo sẵn sàng (đảo được: `status` = `ready` hoặc `preparing` để hoàn tác). */
export async function pickupReadyAction(
  _state: ChangeState,
  formData: FormData,
): Promise<ChangeState> {
  const blocked = await guard(ORDERS_MANAGE);
  if (blocked) return blocked;
  const undo = formData.get("status") === "preparing";
  const outcome = await pickupReady(idOf(formData), undo);
  if (!outcome.ok) return problemState(await translateCommerce(outcome.problem, "orders"), []);
  refresh();
  return { done: 1, previous: undo ? "ready" : "preparing", updated: outcome.data.updated_at };
}

export async function resendCodeAction(state: FormState, formData: FormData): Promise<FormState> {
  const blocked = await guard(ORDERS_MANAGE);
  if (blocked) return blocked;
  return finishCommerce("orders", state, await resendPickupCode(idOf(formData)), []);
}

const HANDOVER_FIELDS = ["who", "code", "proxy_name"] as const;

export async function handOverAction(state: FormState, formData: FormData): Promise<FormState> {
  const blocked = await guard(ORDERS_MANAGE);
  if (blocked) return blocked;
  const values = typed(formData, HANDOVER_FIELDS);
  const outcome = await handOver(idOf(formData), {
    who: values.who ?? "",
    code: values.code ?? "",
    proxy_name: values.proxy_name ?? "",
  });
  // Không điền lại mã nhận vào form (mã là của người mua).
  return finishCommerce("orders", state, outcome, HANDOVER_FIELDS, { ...values, code: "" });
}

/** Huỷ và trả chỗ (không đảo được): trả hàng về tồn, hoàn tiền qua cách đã trả. */
export async function cancelPickupAction(state: FormState, formData: FormData): Promise<FormState> {
  const blocked = await guard(ORDERS_MANAGE);
  if (blocked) return blocked;
  const outcome = await transitionOrder(idOf(formData), "cancelled", { reason: "pickup_expired" });
  return finishCommerce("orders", state, outcome, []);
}

// ---- Ca thu ngân

const OPEN_FIELDS = ["org_id", "register", "opening"] as const;

export async function openShiftAction(state: FormState, formData: FormData): Promise<FormState> {
  const blocked = await guard(ORDERS_POS_SHIFT);
  if (blocked) return blocked;
  const values = typed(formData, OPEN_FIELDS);
  const outcome = await openShift({
    org_id: values.org_id ?? "",
    register: values.register ?? "",
    opening: values.opening ?? "",
  });
  return finishCommerce("orders", state, outcome, OPEN_FIELDS, values);
}

const CLOSE_FIELDS = ["counted", "reason"] as const;

export async function closeShiftAction(state: FormState, formData: FormData): Promise<FormState> {
  const blocked = await guard(ORDERS_POS_SHIFT);
  if (blocked) return blocked;
  const values = typed(formData, CLOSE_FIELDS);
  const outcome = await closeShift(idOf(formData), {
    counted: values.counted ?? "",
    reason: values.reason ?? "",
  });
  return finishCommerce("orders", state, outcome, CLOSE_FIELDS, values);
}

// ---- Đổi trả tại quầy

const STORE_RETURN_FIELDS = [
  "order_number",
  "sku",
  "quantity",
  "reason_code",
  "condition",
  "resolution",
] as const;

export async function storeReturnAction(state: FormState, formData: FormData): Promise<FormState> {
  const blocked = await guard(ORDERS_RETURNS_MANAGE);
  if (blocked) return blocked;
  const values = typed(formData, STORE_RETURN_FIELDS);
  const outcome = await createStoreReturn({
    order_number: values.order_number ?? "",
    sku: values.sku ?? "",
    quantity: values.quantity ?? "",
    reason_code: values.reason_code ?? "",
    condition: values.condition ?? "",
    resolution: values.resolution ?? "",
  });
  return finishCommerce("orders", state, outcome, STORE_RETURN_FIELDS, values);
}

// ---- Đánh giá

export async function seenAction(state: FormState, formData: FormData): Promise<FormState> {
  const blocked = await guard(ORDERS_REVIEWS_MODERATE);
  if (blocked) return blocked;
  return finishCommerce("orders", state, await markReviewSeen(idOf(formData)), []);
}

export async function replyAction(state: FormState, formData: FormData): Promise<FormState> {
  const blocked = await guard(ORDERS_REVIEWS_MODERATE);
  if (blocked) return blocked;
  const values = typed(formData, ["text"]);
  return finishCommerce(
    "orders",
    state,
    await replyReview(idOf(formData), values.text ?? ""),
    ["text"],
    values,
  );
}

export async function hideAction(state: FormState, formData: FormData): Promise<FormState> {
  const blocked = await guard(ORDERS_REVIEWS_MODERATE);
  if (blocked) return blocked;
  const values = typed(formData, ["reason", "note"]);
  const outcome = await moderateReview(idOf(formData), {
    action: "hide",
    reason: values.reason ?? "",
    note: values.note ?? "",
  });
  return finishCommerce("orders", state, outcome, ["reason", "note"], values);
}

export async function publishAction(state: FormState, formData: FormData): Promise<FormState> {
  const blocked = await guard(ORDERS_REVIEWS_MODERATE);
  if (blocked) return blocked;
  return finishCommerce(
    "orders",
    state,
    await moderateReview(idOf(formData), { action: "publish" }),
    [],
  );
}

export async function approveSummaryAction(
  state: FormState,
  formData: FormData,
): Promise<FormState> {
  const blocked = await guard(ORDERS_REVIEWS_MODERATE);
  if (blocked) return blocked;
  return finishCommerce("orders", state, await decideSummary(idOf(formData), "approve"), []);
}

export async function dropSummaryAction(state: FormState, formData: FormData): Promise<FormState> {
  const blocked = await guard(ORDERS_REVIEWS_MODERATE);
  if (blocked) return blocked;
  return finishCommerce("orders", state, await decideSummary(idOf(formData), "drop"), []);
}
