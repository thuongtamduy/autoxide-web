"use server";

// Server Action của màn "Vận chuyển" (module `shipping` của core chưa có, bước 44): gọi hàm mẫu của
// `src/sample/shipping.ts` thay cho API (W-006, W-015), cùng cách trả lỗi như phần gọi core thật —
// lỗi theo ô, gom mọi lỗi một lần, mã lỗi `shipping.*`. Khi có API chỉ thay lời gọi hàm mẫu.
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
  SHIPPING_CARRIERS_MANAGE,
  SHIPPING_COD_MANAGE,
  SHIPPING_READ,
  SHIPPING_SETTINGS_MANAGE,
  SHIPPING_SHIPMENTS_MANAGE,
} from "@/lib/shipping";
import { type BulkInput, type BulkResult, bulkBlocked, cleanIds, eachId } from "@/lib/table";
import { can } from "@/lib/viewer";
import {
  addHoliday,
  changeShipment,
  createCarrierAccount,
  createMethod,
  createShipment,
  importStatement,
  listCarrierAccounts,
  listDiscrepancies,
  listMethods,
  listShipments,
  type Quote,
  quote,
  replaceCarrierKey,
  resolveDiscrepancy,
  type SampleOutcome,
  saveCalendar,
  setCarrierActive,
  setMethodActive,
  splitParcels,
  testCarrierAccount,
  trackShipment,
} from "@/sample/shipping";

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

// ---- Vận đơn

const SHIPMENT_FIELDS = [
  "order_number",
  "origin_org_id",
  "method_id",
  "recipient_name",
  "recipient_phone",
  "province_code",
  "address_line",
  "cod",
  "weight_grams",
] as const;

/** Vận đơn tay cho đơn bán tại quầy giao sau. */
export async function createShipmentAction(
  state: FormState,
  formData: FormData,
): Promise<FormState> {
  const blocked = await guard(SHIPPING_SHIPMENTS_MANAGE);
  if (blocked) return blocked;
  const values = typed(formData, SHIPMENT_FIELDS);
  const outcome = await createShipment({
    order_number: values.order_number ?? "",
    origin_org_id: values.origin_org_id ?? "",
    method_id: values.method_id ?? "",
    recipient_name: values.recipient_name ?? "",
    recipient_phone: values.recipient_phone ?? "",
    province_code: values.province_code ?? "",
    address_line: values.address_line ?? "",
    cod: values.cod ?? "",
    weight_grams: values.weight_grams ?? "",
  });
  return finishCommerce("shipping", state, outcome, SHIPMENT_FIELDS, values);
}

async function move(
  state: FormState,
  formData: FormData,
  step: Parameters<typeof changeShipment>[1],
): Promise<FormState> {
  const blocked = await guard(SHIPPING_SHIPMENTS_MANAGE);
  if (blocked) return blocked;
  return finishCommerce("shipping", state, await changeShipment(idOf(formData), step), []);
}

export async function bookAction(state: FormState, formData: FormData): Promise<FormState> {
  return move(state, formData, "book");
}
export async function cancelShipmentAction(
  state: FormState,
  formData: FormData,
): Promise<FormState> {
  return move(state, formData, "cancel");
}
export async function redeliverAction(state: FormState, formData: FormData): Promise<FormState> {
  return move(state, formData, "redeliver");
}
export async function returnAction(state: FormState, formData: FormData): Promise<FormState> {
  return move(state, formData, "return");
}
export async function receiveReturnAction(
  state: FormState,
  formData: FormData,
): Promise<FormState> {
  return move(state, formData, "receive_return");
}
export async function handOverAction(state: FormState, formData: FormData): Promise<FormState> {
  return move(state, formData, "hand_over");
}

/** Hỏi lại hành trình ở hãng (không đổi gì nếu hãng không có cập nhật mới). */
export async function trackAction(state: FormState, formData: FormData): Promise<FormState> {
  const blocked = await guard([SHIPPING_SHIPMENTS_MANAGE, SHIPPING_COD_MANAGE]);
  if (blocked) return blocked;
  return finishCommerce("shipping", state, await trackShipment(idOf(formData)), []);
}

export async function splitAction(state: FormState, formData: FormData): Promise<FormState> {
  const blocked = await guard(SHIPPING_SHIPMENTS_MANAGE);
  if (blocked) return blocked;
  const values = typed(formData, ["weights"]);
  return finishCommerce(
    "shipping",
    state,
    await splitParcels(idOf(formData), values.weights ?? ""),
    ["weights"],
    values,
  );
}

// ---- Phương thức, báo giá, lịch

/** Bật / tắt phương thức (đảo được): trả trạng thái cũ cho Hoàn tác. */
export async function methodActiveAction(
  _state: ChangeState,
  formData: FormData,
): Promise<ChangeState> {
  const blocked = await guard(SHIPPING_SETTINGS_MANAGE);
  if (blocked) return blocked;
  const outcome = await setMethodActive(idOf(formData), formData.get("status") === "on");
  return finishChange("shipping", outcome, (data) => (data.previous ? "on" : "off"));
}

const METHOD_FIELDS = [
  "name",
  "code",
  "kind",
  "org_id",
  "free_over",
  "days",
  "carrier_account_id",
] as const;

export async function createMethodAction(state: FormState, formData: FormData): Promise<FormState> {
  const blocked = await guard(SHIPPING_SETTINGS_MANAGE);
  if (blocked) return blocked;
  const values = typed(formData, METHOD_FIELDS);
  const outcome = await createMethod({
    name: values.name ?? "",
    code: values.code ?? "",
    kind: values.kind ?? "",
    org_id: values.org_id ?? "",
    free_over: values.free_over ?? "",
    days: values.days ?? "",
    carrier_account_id: values.carrier_account_id ?? "",
  });
  return finishCommerce("shipping", state, outcome, METHOD_FIELDS, values);
}

export interface QuoteState extends FormState {
  result?: Quote;
}

const QUOTE_FIELDS = ["org_id", "province_code", "weight_grams", "order_value"] as const;

/** Tính thử phí: cùng hàm với báo giá cho đơn hàng; không ghi gì. */
export async function quoteAction(state: QuoteState, formData: FormData): Promise<QuoteState> {
  const blocked = await guard([SHIPPING_READ, SHIPPING_SETTINGS_MANAGE]);
  if (blocked) return blocked;
  const values = typed(formData, QUOTE_FIELDS);
  const outcome = await quote(
    {
      org_id: values.org_id ?? "",
      province_code: values.province_code ?? "",
      weight_grams: values.weight_grams ?? "",
      order_value: values.order_value ?? "",
    },
    await getLocale(),
  );
  if (!outcome.ok) {
    const problem = await translateCommerce(outcome.problem, "shipping");
    return { ...problemState(problem, QUOTE_FIELDS), values };
  }
  return { done: nextDone(state), values, result: outcome.data };
}

const CALENDAR_FIELDS = ["cutoff", "workdays", "effective_from"] as const;

export async function calendarAction(state: FormState, formData: FormData): Promise<FormState> {
  const blocked = await guard(SHIPPING_SETTINGS_MANAGE);
  if (blocked) return blocked;
  const values = typed(formData, CALENDAR_FIELDS);
  const outcome = await saveCalendar({
    cutoff: values.cutoff ?? "",
    workdays: values.workdays ?? "",
    effective_from: values.effective_from ?? "",
  });
  return finishCommerce("shipping", state, outcome, CALENDAR_FIELDS, values);
}

const HOLIDAY_FIELDS = ["from", "to", "name", "org_id"] as const;

export async function holidayAction(state: FormState, formData: FormData): Promise<FormState> {
  const blocked = await guard(SHIPPING_SETTINGS_MANAGE);
  if (blocked) return blocked;
  const values = typed(formData, HOLIDAY_FIELDS);
  const outcome = await addHoliday({
    from: values.from ?? "",
    to: values.to ?? "",
    name: values.name ?? "",
    org_id: values.org_id ?? "",
  });
  return finishCommerce("shipping", state, outcome, HOLIDAY_FIELDS, values);
}

// ---- COD

export interface ImportState extends FormState {
  replayed?: boolean;
}

const IMPORT_FIELDS = ["carrier_account_id", "reference", "csv"] as const;

export async function importStatementAction(
  state: ImportState,
  formData: FormData,
): Promise<ImportState> {
  const blocked = await guard(SHIPPING_COD_MANAGE);
  if (blocked) return blocked;
  const values = typed(formData, IMPORT_FIELDS);
  const file = formData.get("file");
  // Tệp CSV chọn từ máy thì đọc ở máy chủ; không có tệp thì dùng chữ dán vào ô.
  const csv = file instanceof File && file.size > 0 ? await file.text() : (values.csv ?? "");
  const outcome = await importStatement({
    carrier_account_id: values.carrier_account_id ?? "",
    reference: values.reference ?? "",
    csv,
  });
  const next = await finishCommerce("shipping", state, outcome, IMPORT_FIELDS, values);
  return outcome.ok ? { ...next, replayed: outcome.data.replayed } : next;
}

export async function resolveAction(state: FormState, formData: FormData): Promise<FormState> {
  const blocked = await guard(SHIPPING_COD_MANAGE);
  if (blocked) return blocked;
  const values = typed(formData, ["note"]);
  return finishCommerce(
    "shipping",
    state,
    await resolveDiscrepancy(idOf(formData), values.note ?? ""),
    ["note"],
    values,
  );
}

// ---- Hãng vận chuyển

export async function testCarrierAction(state: FormState, formData: FormData): Promise<FormState> {
  const blocked = await guard(SHIPPING_CARRIERS_MANAGE);
  if (blocked) return blocked;
  return finishCommerce("shipping", state, await testCarrierAccount(idOf(formData)), []);
}

export async function carrierActiveAction(
  _state: ChangeState,
  formData: FormData,
): Promise<ChangeState> {
  const blocked = await guard(SHIPPING_CARRIERS_MANAGE);
  if (blocked) return blocked;
  const outcome = await setCarrierActive(idOf(formData), formData.get("status") === "on");
  return finishChange("shipping", outcome, (data) => (data.previous ? "on" : "off"));
}

/** Khoá API của hãng: không bao giờ điền lại khi báo lỗi, không ghi log. */
export async function replaceKeyAction(state: FormState, formData: FormData): Promise<FormState> {
  const blocked = await guard(SHIPPING_CARRIERS_MANAGE);
  if (blocked) return blocked;
  const outcome = await replaceCarrierKey(idOf(formData), String(formData.get("key") ?? ""));
  return finishCommerce("shipping", state, outcome, ["key"]);
}

const CARRIER_FIELDS = ["carrier_code", "name", "key", "org_id"] as const;

export async function createCarrierAction(
  state: FormState,
  formData: FormData,
): Promise<FormState> {
  const blocked = await guard(SHIPPING_CARRIERS_MANAGE);
  if (blocked) return blocked;
  const values = typed(formData, ["carrier_code", "name", "org_id"]);
  const outcome = await createCarrierAccount({
    carrier_code: values.carrier_code ?? "",
    name: values.name ?? "",
    key: String(formData.get("key") ?? ""),
    sandbox: formData.get("sandbox") === "on",
    org_id: values.org_id ?? "",
  });
  return finishCommerce("shipping", state, outcome, CARRIER_FIELDS, values);
}

// ---- Hàng loạt

/**
 * Chạy một lệnh mẫu cho từng id (hàm mẫu, như core bước 44, chỉ có lệnh từng cái; không bịa endpoint
 * hàng loạt), gom lỗi đã dịch theo `shipping.codes.*`. `undo`: id đã đổi, cho nút Hoàn tác.
 */
async function eachSample(
  ids: string[],
  permission: string | readonly string[],
  run: (id: string) => Promise<SampleOutcome<unknown> | string>,
  names: ReadonlyMap<string, string>,
): Promise<BulkResult> {
  const blocked = await guard(permission);
  if (blocked) return bulkBlocked(ids, blocked.error ?? "");
  const result = await eachId(
    ids,
    async (id) => {
      const outcome = await run(id);
      if (typeof outcome === "string") return outcome;
      return outcome.ok ? null : (await translateCommerce(outcome.problem, "shipping")).detail;
    },
    (id) => names.get(id) ?? id,
  );
  refresh();
  const failed = new Set(result.errors.map((e) => e.id));
  return { ...result, undo: ids.filter((id) => !failed.has(id)) };
}

async function shipmentNames(): Promise<Map<string, string>> {
  const { data } = await listShipments({ limit: 1000 });
  return new Map(data.map((x) => [x.id, x.order_number]));
}

/** Đặt hãng cho nhiều vận đơn chờ đặt; vận đơn không ở trạng thái chờ hay hãng lỗi báo riêng dòng. */
export async function bulkBookAction(input: BulkInput): Promise<BulkResult> {
  return eachSample(
    cleanIds(input.ids),
    SHIPPING_SHIPMENTS_MANAGE,
    (id) => changeShipment(id, "book"),
    await shipmentNames(),
  );
}

/** Hỏi lại hành trình ở hãng cho nhiều vận đơn. */
export async function bulkTrackAction(input: BulkInput): Promise<BulkResult> {
  return eachSample(
    cleanIds(input.ids),
    [SHIPPING_SHIPMENTS_MANAGE, SHIPPING_COD_MANAGE],
    (id) => trackShipment(id),
    await shipmentNames(),
  );
}

/**
 * Dòng lệch COD "hãng báo chưa giao": hỏi lại hành trình của vận đơn để tự khớp. Dòng lệch loại khác
 * không hỏi được (báo riêng dòng).
 */
export async function bulkTrackDiscrepancyAction(input: BulkInput): Promise<BulkResult> {
  const { data } = await listDiscrepancies();
  const t = await getTranslations("shipping.cod");
  return eachSample(
    cleanIds(input.ids),
    SHIPPING_COD_MANAGE,
    async (id) => {
      const d = data.find((x) => x.id === id);
      if (d?.status !== "open" || !d.shipment_id || d.kind !== "not_delivered") {
        return t("bulkTrackSkip");
      }
      return trackShipment(d.shipment_id);
    },
    new Map(data.map((d) => [d.id, d.tracking_number])),
  );
}

/** Đóng nhiều dòng lệch COD với cùng một lý do (người dùng gõ trong hộp hỏi lại). Không đảo được. */
export async function bulkResolveDiscrepancyAction(input: BulkInput): Promise<BulkResult> {
  const { data } = await listDiscrepancies();
  return eachSample(
    cleanIds(input.ids),
    SHIPPING_COD_MANAGE,
    (id) => resolveDiscrepancy(id, input.value ?? ""),
    new Map(data.map((d) => [d.id, d.tracking_number])),
  );
}

/** Bật / tắt nhiều hãng; Hoàn tác đảo lại đúng các hãng đã đổi. */
async function carriersTo(ids: string[], active: boolean): Promise<BulkResult> {
  const { data } = await listCarrierAccounts();
  const changed: string[] = [];
  const result = await eachSample(
    ids,
    SHIPPING_CARRIERS_MANAGE,
    async (id) => {
      const outcome = await setCarrierActive(id, active);
      if (outcome.ok && outcome.data.previous !== active) changed.push(id);
      return outcome;
    },
    new Map(data.map((c) => [c.id, c.name])),
  );
  return { ...result, undo: changed };
}

export async function bulkCarrierOffAction(input: BulkInput): Promise<BulkResult> {
  return carriersTo(cleanIds(input.ids), false);
}
export async function bulkCarrierOnAction(input: BulkInput): Promise<BulkResult> {
  return carriersTo(cleanIds(input.ids), true);
}
export async function undoCarrierOffAction(ids: string[]): Promise<BulkResult> {
  const { total, done, errors } = await carriersTo(cleanIds(ids), true);
  return { total, done, errors };
}
export async function undoCarrierOnAction(ids: string[]): Promise<BulkResult> {
  const { total, done, errors } = await carriersTo(cleanIds(ids), false);
  return { total, done, errors };
}

/** Bật / tắt nhiều phương thức giao; Hoàn tác đảo lại đúng các phương thức đã đổi. */
async function methodsTo(ids: string[], active: boolean): Promise<BulkResult> {
  const [{ data }, locale] = await Promise.all([listMethods(), getLocale()]);
  const changed: string[] = [];
  const result = await eachSample(
    ids,
    SHIPPING_SETTINGS_MANAGE,
    async (id) => {
      const outcome = await setMethodActive(id, active);
      if (outcome.ok && outcome.data.previous !== active) changed.push(id);
      return outcome;
    },
    new Map(data.map((m) => [m.id, m.names[locale] ?? m.names.vi ?? m.code])),
  );
  return { ...result, undo: changed };
}

export async function bulkMethodOffAction(input: BulkInput): Promise<BulkResult> {
  return methodsTo(cleanIds(input.ids), false);
}
export async function bulkMethodOnAction(input: BulkInput): Promise<BulkResult> {
  return methodsTo(cleanIds(input.ids), true);
}
export async function undoMethodOffAction(ids: string[]): Promise<BulkResult> {
  const { total, done, errors } = await methodsTo(cleanIds(ids), true);
  return { total, done, errors };
}
export async function undoMethodOnAction(ids: string[]): Promise<BulkResult> {
  const { total, done, errors } = await methodsTo(cleanIds(ids), false);
  return { total, done, errors };
}
