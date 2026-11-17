"use server";

// Server Action của màn "Khuyến mại" (module `promotions` của core chưa có, bước 43): gọi hàm mẫu của
// `src/sample/promotions.ts` thay cho API (W-006, W-015), cùng cách trả lỗi như phần gọi core thật —
// lỗi theo ô, gom mọi lỗi một lần, mã lỗi `promotions.*`. Khi có API chỉ thay lời gọi hàm mẫu.
import type { Problem } from "@autoxide/sdk";
import { refresh } from "next/cache";
import { getLocale, getTranslations } from "next-intl/server";
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
  PROMOTIONS_CODES_MANAGE,
  PROMOTIONS_COMPLIANCE,
  PROMOTIONS_PUBLISH,
  PROMOTIONS_READ,
  PROMOTIONS_WRITE,
} from "@/lib/promotions";
import { type BulkInput, type BulkResult, bulkBlocked, cleanIds, eachId } from "@/lib/table";
import { can } from "@/lib/viewer";
import {
  activatePromotion,
  type CartView,
  changePromotion,
  createPromotion,
  disableCode,
  evaluateCart,
  extendPromotion,
  generateCodes,
  listPromotions,
  recordNotice,
  setFlashPrice,
  setPromotionRunning,
} from "@/sample/promotions";

/** Vô hiệu một mã (hộp xác nhận trong menu "⋯" của dòng). */
export async function disableCodeAction(state: FormState, formData: FormData): Promise<FormState> {
  const blocked = await guard(PROMOTIONS_CODES_MANAGE);
  if (blocked) return blocked;
  return finishCommerce("promotions", state, await disableCode(idOf(formData)), []);
}

/** Vô hiệu nhiều mã: hàm mẫu (và core) chỉ có lệnh từng mã, lặp và gom lỗi. */
export async function bulkDisableCodesAction(input: BulkInput): Promise<BulkResult> {
  const ids = cleanIds(input.ids);
  const blocked = await guard(PROMOTIONS_CODES_MANAGE);
  if (blocked) return bulkBlocked(ids, blocked.error ?? "");
  const result = await eachId(ids, async (id) => {
    const outcome = await disableCode(id);
    return outcome.ok ? null : (await translateCommerce(outcome.problem, "promotions")).detail;
  });
  refresh();
  return result;
}

/**
 * Một lệnh cho nhiều chương trình (bảng Chương trình): hàm mẫu (và API dự kiến của bước 43) chỉ có
 * lệnh từng chương trình, lặp và gom lỗi. `undo` là id đã đổi, cho nút Hoàn tác.
 */
async function bulkPromotions(
  input: BulkInput,
  run: (id: string) => Promise<{ ok: true } | { ok: false; problem: Problem }>,
): Promise<BulkResult> {
  const ids = cleanIds(input.ids);
  const blocked = await guard(PROMOTIONS_PUBLISH);
  if (blocked) return bulkBlocked(ids, blocked.error ?? "");
  const { data } = await listPromotions({ locale: await getLocale() });
  const names = new Map(data.map((p) => [p.id, p.title]));
  const result = await eachId(
    ids,
    async (id) => {
      const outcome = await run(id);
      return outcome.ok ? null : (await translateCommerce(outcome.problem, "promotions")).detail;
    },
    (id) => names.get(id) ?? id,
  );
  const failed = new Set(result.errors.map((e) => e.id));
  refresh();
  return { ...result, undo: ids.filter((id) => !failed.has(id)) };
}

/** Tạm dừng nhiều chương trình đang chạy; Hoàn tác chạy lại đúng những cái vừa dừng. */
export async function bulkPauseAction(input: BulkInput | string[]): Promise<BulkResult> {
  const value = Array.isArray(input) ? { ids: input } : input;
  return bulkPromotions(value, (id) => setPromotionRunning(id, "paused"));
}

/** Chạy lại nhiều chương trình đang tạm dừng; Hoàn tác dừng lại đúng những cái vừa chạy. */
export async function bulkResumeAction(input: BulkInput | string[]): Promise<BulkResult> {
  const value = Array.isArray(input) ? { ids: input } : input;
  return bulkPromotions(value, (id) => setPromotionRunning(id, "active"));
}

/** Bật nhiều bản nháp: mỗi cái qua đủ bước kiểm (trần pháp luật, thông báo…); cái bị chặn báo lỗi riêng. */
export async function bulkActivateAction(input: BulkInput): Promise<BulkResult> {
  const result = await bulkPromotions(input, (id) => activatePromotion(id));
  return { ...result, undo: [] };
}

function idOf(formData: FormData): string {
  return String(formData.get("id") ?? "");
}

/** Thiếu permission thì trả lỗi như core (403) — nút đã ẩn, đây là lớp chặn thứ hai. */
async function guard(permission: string): Promise<FormState | null> {
  const off = await commerceGuard();
  if (off) return off;
  if (await can(permission)) return null;
  const t = await getTranslations("errors");
  return { error: t("forbidden", { permission }), code: "forbidden" };
}

const CREATE_FIELDS = [
  "title",
  "kind",
  "trigger",
  "code",
  "value",
  "min_order",
  "starts_at",
  "ends_at",
  "usage_limit",
  "per_customer_limit",
  "org_id",
  "targets",
] as const;

export async function createPromotionAction(
  state: FormState,
  formData: FormData,
): Promise<FormState> {
  const blocked = await guard(PROMOTIONS_WRITE);
  if (blocked) return blocked;
  const values = typed(formData, CREATE_FIELDS);
  const outcome = await createPromotion({
    title: values.title ?? "",
    kind: values.kind ?? "",
    trigger: values.trigger ?? "",
    code: values.code ?? "",
    value: values.value ?? "",
    min_order: values.min_order ?? "",
    starts_at: values.starts_at ?? "",
    ends_at: values.ends_at ?? "",
    usage_limit: values.usage_limit ?? "",
    per_customer_limit: values.per_customer_limit ?? "",
    exclusive: formData.get("exclusive") === "on",
    org_id: values.org_id ?? "",
    targets: values.targets ?? "",
  });
  return finishCommerce("promotions", state, outcome, CREATE_FIELDS, values);
}

/** Bật: kiểm trần pháp luật, thông báo, mục tiêu; không đạt thì báo mã lỗi của điều kiện đầu tiên. */
export async function activateAction(state: FormState, formData: FormData): Promise<FormState> {
  const blocked = await guard(PROMOTIONS_PUBLISH);
  if (blocked) return blocked;
  return finishCommerce("promotions", state, await activatePromotion(idOf(formData)), []);
}

export async function cancelPromotionAction(
  state: FormState,
  formData: FormData,
): Promise<FormState> {
  const blocked = await guard(PROMOTIONS_PUBLISH);
  if (blocked) return blocked;
  return finishCommerce("promotions", state, await changePromotion(idOf(formData), "cancel"), []);
}

export async function endPromotionAction(state: FormState, formData: FormData): Promise<FormState> {
  const blocked = await guard(PROMOTIONS_PUBLISH);
  if (blocked) return blocked;
  return finishCommerce("promotions", state, await changePromotion(idOf(formData), "end"), []);
}

/** Tạm dừng / chạy lại (đảo được): trả trạng thái cũ cho nút Hoàn tác. */
export async function runningAction(_state: ChangeState, formData: FormData): Promise<ChangeState> {
  const blocked = await guard(PROMOTIONS_PUBLISH);
  if (blocked) return blocked;
  const outcome = await setPromotionRunning(idOf(formData), String(formData.get("status") ?? ""));
  return finishChange("promotions", outcome, (data) => data.previous);
}

const EXTEND_FIELDS = ["ends_at", "usage_limit", "reason"] as const;

export async function extendAction(state: FormState, formData: FormData): Promise<FormState> {
  const blocked = await guard(PROMOTIONS_WRITE);
  if (blocked) return blocked;
  const values = typed(formData, EXTEND_FIELDS);
  const outcome = await extendPromotion(idOf(formData), {
    ends_at: values.ends_at ?? "",
    usage_limit: values.usage_limit ?? "",
    reason: values.reason ?? "",
  });
  return finishCommerce("promotions", state, outcome, EXTEND_FIELDS, values);
}

const FLASH_FIELDS = ["sale_price", "quantity_limit"] as const;

export async function flashPriceAction(state: FormState, formData: FormData): Promise<FormState> {
  const blocked = await guard(PROMOTIONS_WRITE);
  if (blocked) return blocked;
  const values = typed(formData, FLASH_FIELDS);
  const outcome = await setFlashPrice(
    idOf(formData),
    String(formData.get("variant_id") ?? ""),
    values.sale_price ?? "",
    values.quantity_limit ?? "",
  );
  return finishCommerce("promotions", state, outcome, FLASH_FIELDS, values);
}

export interface GenerateState extends FormState {
  generated?: number;
  queued?: boolean;
}

const GENERATE_FIELDS = ["promotion_id", "count", "prefix", "per_code"] as const;

export async function generateCodesAction(
  state: GenerateState,
  formData: FormData,
): Promise<GenerateState> {
  const blocked = await guard(PROMOTIONS_CODES_MANAGE);
  if (blocked) return blocked;
  const values = typed(formData, GENERATE_FIELDS);
  const outcome = await generateCodes({
    promotion_id: values.promotion_id ?? "",
    count: values.count ?? "",
    prefix: values.prefix ?? "",
    per_code: values.per_code ?? "",
  });
  const next = await finishCommerce("promotions", state, outcome, GENERATE_FIELDS, values);
  return outcome.ok
    ? { ...next, generated: outcome.data.generated, queued: outcome.data.queued }
    : next;
}

const NOTICE_FIELDS = ["reference", "submitted_on"] as const;

export async function recordNoticeAction(state: FormState, formData: FormData): Promise<FormState> {
  const blocked = await guard(PROMOTIONS_COMPLIANCE);
  if (blocked) return blocked;
  const values = typed(formData, NOTICE_FIELDS);
  const outcome = await recordNotice(
    idOf(formData),
    values.reference ?? "",
    values.submitted_on ?? "",
  );
  return finishCommerce("promotions", state, outcome, NOTICE_FIELDS, values);
}

export interface EvaluateState extends FormState {
  result?: CartView;
}

const EVALUATE_FIELDS = ["org_id", "lines", "codes", "customer_group", "shipping_fee"] as const;

/** Thử giỏ hàng: tính như lúc đặt hàng, không giữ lượt, không ghi gì. */
export async function evaluateAction(
  state: EvaluateState,
  formData: FormData,
): Promise<EvaluateState> {
  const blocked = await guard(PROMOTIONS_READ);
  if (blocked) return blocked;
  const values = typed(formData, EVALUATE_FIELDS);
  const outcome = await evaluateCart(
    {
      org_id: values.org_id ?? "",
      lines: values.lines ?? "",
      codes: values.codes ?? "",
      customer_group: values.customer_group ?? "",
      shipping_fee: values.shipping_fee ?? "",
    },
    await getLocale(),
  );
  if (!outcome.ok) {
    const problem = await translateCommerce(outcome.problem, "promotions");
    return { ...problemState(problem, EVALUATE_FIELDS), values };
  }
  return { done: nextDone(state), values, result: outcome.data };
}
