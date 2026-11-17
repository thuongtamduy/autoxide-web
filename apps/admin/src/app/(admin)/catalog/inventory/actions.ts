"use server";

// Server Action của màn "Tồn kho" (module `inventory` của core chưa có, bước 42): gọi hàm mẫu của
// `src/sample/inventory.ts` thay cho API (W-006), cùng cách trả lỗi như phần gọi core thật — lỗi
// theo ô, gom mọi lỗi một lần, mã lỗi `inventory.*`. Khi có API chỉ thay lời gọi hàm mẫu.
import type { Problem } from "@autoxide/sdk";
import { refresh } from "next/cache";
import {
  commerceGuard,
  finishChange,
  finishCommerce,
  translateCommerce,
  typed,
} from "@/lib/commerce-action";
import type { ChangeState } from "@/lib/engage";
import type { FormState } from "@/lib/form";
import { type BulkInput, type BulkResult, bulkBlocked, cleanIds, eachId } from "@/lib/table";
import {
  adjustStock,
  changeCount,
  changePurchaseOrder,
  changeTransfer,
  createCount,
  createPurchaseOrder,
  createReceipt,
  createSupplier,
  createSupplierReturn,
  createTransfer,
  decideSerial,
  listCounts,
  listLevels,
  listLots,
  listPurchaseOrders,
  listSerials,
  listSuppliers,
  listTransfers,
  putCountLines,
  receivePurchaseOrder,
  receiveTransfer,
  setReorderPoint,
  setSupplierActive,
  writeOffLot,
} from "@/sample/inventory";

function idOf(formData: FormData): string {
  return String(formData.get("id") ?? "");
}

export interface ReplayState extends FormState {
  replayed?: boolean;
}

const ADJUST_FIELDS = [
  "org_id",
  "code",
  "quantity",
  "reason_code",
  "note",
  "serials",
  "reference",
] as const;

/** Điều chỉnh tồn có lý do; `reference` chống ghi hai lần khi bấm lại. */
export async function adjustAction(state: ReplayState, formData: FormData): Promise<ReplayState> {
  const off = await commerceGuard();
  if (off) return off;
  const values = typed(formData, ADJUST_FIELDS);
  const outcome = await adjustStock({
    org_id: values.org_id ?? "",
    code: values.code ?? "",
    quantity: values.quantity ?? "",
    reason_code: values.reason_code ?? "",
    note: values.note ?? "",
    serials: values.serials ?? "",
    reference: values.reference ?? "",
  });
  const next = await finishCommerce("inventory", state, outcome, ADJUST_FIELDS, values);
  return outcome.ok ? { ...next, replayed: outcome.data.replayed } : next;
}

export async function reorderAction(state: FormState, formData: FormData): Promise<FormState> {
  const off = await commerceGuard();
  if (off) return off;
  const values = typed(formData, ["reorder_point"]);
  return finishCommerce(
    "inventory",
    state,
    await setReorderPoint(idOf(formData), values.reorder_point ?? ""),
    ["reorder_point"],
    values,
  );
}

const TRANSFER_FIELDS = ["from_org_id", "to_org_id", "lines", "note"] as const;

export async function createTransferAction(
  state: FormState,
  formData: FormData,
): Promise<FormState> {
  const off = await commerceGuard();
  if (off) return off;
  const values = typed(formData, TRANSFER_FIELDS);
  const outcome = await createTransfer({
    from_org_id: values.from_org_id ?? "",
    to_org_id: values.to_org_id ?? "",
    lines: values.lines ?? "",
    note: values.note ?? "",
  });
  return finishCommerce("inventory", state, outcome, TRANSFER_FIELDS, values);
}

export async function shipTransferAction(state: FormState, formData: FormData): Promise<FormState> {
  const off = await commerceGuard();
  if (off) return off;
  return finishCommerce("inventory", state, await changeTransfer(idOf(formData), "ship"), []);
}

export async function cancelTransferAction(
  state: FormState,
  formData: FormData,
): Promise<FormState> {
  const off = await commerceGuard();
  if (off) return off;
  return finishCommerce("inventory", state, await changeTransfer(idOf(formData), "cancel"), []);
}

export async function closeTransferAction(
  state: FormState,
  formData: FormData,
): Promise<FormState> {
  const off = await commerceGuard();
  if (off) return off;
  return finishCommerce("inventory", state, await changeTransfer(idOf(formData), "close"), []);
}

/** Nhận đủ phần còn lại của phiếu chuyển. */
export async function receiveAllAction(state: FormState, formData: FormData): Promise<FormState> {
  const off = await commerceGuard();
  if (off) return off;
  return finishCommerce("inventory", state, await receiveTransfer(idOf(formData), null), []);
}

/** Nhận một phần: ô `line.<id>` là số nhận được của từng dòng. */
export async function receivePartAction(state: FormState, formData: FormData): Promise<FormState> {
  const off = await commerceGuard();
  if (off) return off;
  const quantities: Record<string, string> = {};
  for (const [name, value] of formData.entries()) {
    if (name.startsWith("line.")) quantities[name.slice(5)] = String(value);
  }
  const outcome = await receiveTransfer(idOf(formData), quantities);
  return finishCommerce("inventory", state, outcome, [
    ...Object.keys(quantities).map((id) => `line.${id}`),
    "lines",
  ]);
}

export async function createCountAction(state: FormState, formData: FormData): Promise<FormState> {
  const off = await commerceGuard();
  if (off) return off;
  const values = typed(formData, ["org_id", "scope"]);
  return finishCommerce(
    "inventory",
    state,
    await createCount({ org_id: values.org_id ?? "", scope: values.scope ?? "" }),
    ["org_id", "scope"],
    values,
  );
}

/** Ghi số đếm và lý do: ô `line.<id>` (số đếm) và `reason.<id>` (mã lý do). */
export async function countLinesAction(state: FormState, formData: FormData): Promise<FormState> {
  const off = await commerceGuard();
  if (off) return off;
  const lines: Record<string, { counted: string; reason: string }> = {};
  const names: string[] = [];
  for (const [name, value] of formData.entries()) {
    const match = /^(line|reason)\.(.+)$/.exec(name);
    if (!match) continue;
    const [, which, id] = match as unknown as [string, "line" | "reason", string];
    const entry = lines[id] ?? { counted: "", reason: "" };
    if (which === "line") entry.counted = String(value);
    else entry.reason = String(value);
    lines[id] = entry;
    names.push(name);
  }
  return finishCommerce("inventory", state, await putCountLines(idOf(formData), lines), names);
}

export async function applyCountAction(state: FormState, formData: FormData): Promise<FormState> {
  const off = await commerceGuard();
  if (off) return off;
  return finishCommerce("inventory", state, await changeCount(idOf(formData), "apply"), []);
}

export async function cancelCountAction(state: FormState, formData: FormData): Promise<FormState> {
  const off = await commerceGuard();
  if (off) return off;
  return finishCommerce("inventory", state, await changeCount(idOf(formData), "cancel"), []);
}

export async function writeOffLotAction(state: FormState, formData: FormData): Promise<FormState> {
  const off = await commerceGuard();
  if (off) return off;
  return finishCommerce(
    "inventory",
    state,
    await writeOffLot(idOf(formData), String(formData.get("note") ?? "")),
    [],
  );
}

export async function restockSerialAction(
  state: FormState,
  formData: FormData,
): Promise<FormState> {
  const off = await commerceGuard();
  if (off) return off;
  return finishCommerce("inventory", state, await decideSerial(idOf(formData), "restock"), []);
}

export async function writeOffSerialAction(
  state: FormState,
  formData: FormData,
): Promise<FormState> {
  const off = await commerceGuard();
  if (off) return off;
  return finishCommerce("inventory", state, await decideSerial(idOf(formData), "write_off"), []);
}

const SUPPLIER_FIELDS = ["code", "name", "tax_code", "payment_terms_days", "note"] as const;

export async function createSupplierAction(
  state: FormState,
  formData: FormData,
): Promise<FormState> {
  const off = await commerceGuard();
  if (off) return off;
  const values = typed(formData, SUPPLIER_FIELDS);
  const outcome = await createSupplier({
    code: values.code ?? "",
    name: values.name ?? "",
    tax_code: values.tax_code ?? "",
    payment_terms_days: values.payment_terms_days ?? "",
    note: values.note ?? "",
  });
  return finishCommerce("inventory", state, outcome, SUPPLIER_FIELDS, values);
}

/** Ngừng / giao dịch lại với nhà cung cấp (`status` = "on" / "off"), trả trạng thái cũ cho Hoàn tác. */
export async function supplierActiveAction(
  _state: ChangeState,
  formData: FormData,
): Promise<ChangeState> {
  const off = await commerceGuard();
  if (off) return off;
  const outcome = await setSupplierActive(idOf(formData), formData.get("status") === "on");
  return finishChange("inventory", outcome, (data) => (data.previous ? "on" : "off"));
}

/** Ngừng / giao dịch lại với nhiều nhà cung cấp: hàm mẫu (và core) chỉ có lệnh từng cái, lặp và gom lỗi. */
async function bulkSupplierActive(input: BulkInput, active: boolean): Promise<BulkResult> {
  const ids = cleanIds(input.ids);
  const off = await commerceGuard();
  if (off) return bulkBlocked(ids, off.error ?? "");
  const { data } = await listSuppliers();
  const names = new Map(data.map((s) => [s.id, s.name]));
  const result = await eachId(
    ids,
    async (id) => {
      const outcome = await setSupplierActive(id, active);
      return outcome.ok ? null : (await translateCommerce(outcome.problem, "inventory")).detail;
    },
    (id) => names.get(id) ?? id,
  );
  refresh();
  return result;
}

export async function bulkSupplierOffAction(input: BulkInput): Promise<BulkResult> {
  return bulkSupplierActive(input, false);
}

export async function bulkSupplierOnAction(input: BulkInput): Promise<BulkResult> {
  return bulkSupplierActive(input, true);
}

const PO_FIELDS = ["supplier_id", "org_id", "lines", "expected_on"] as const;

export async function createPurchaseOrderAction(
  state: FormState,
  formData: FormData,
): Promise<FormState> {
  const off = await commerceGuard();
  if (off) return off;
  const values = typed(formData, PO_FIELDS);
  const outcome = await createPurchaseOrder({
    supplier_id: values.supplier_id ?? "",
    org_id: values.org_id ?? "",
    lines: values.lines ?? "",
    expected_on: values.expected_on ?? "",
  });
  return finishCommerce("inventory", state, outcome, PO_FIELDS, values);
}

export async function orderPurchaseAction(
  state: FormState,
  formData: FormData,
): Promise<FormState> {
  const off = await commerceGuard();
  if (off) return off;
  return finishCommerce("inventory", state, await changePurchaseOrder(idOf(formData), "order"), []);
}

export async function closePurchaseAction(
  state: FormState,
  formData: FormData,
): Promise<FormState> {
  const off = await commerceGuard();
  if (off) return off;
  return finishCommerce("inventory", state, await changePurchaseOrder(idOf(formData), "close"), []);
}

export async function cancelPurchaseAction(
  state: FormState,
  formData: FormData,
): Promise<FormState> {
  const off = await commerceGuard();
  if (off) return off;
  return finishCommerce(
    "inventory",
    state,
    await changePurchaseOrder(idOf(formData), "cancel"),
    [],
  );
}

export async function receivePurchaseAction(
  state: FormState,
  formData: FormData,
): Promise<FormState> {
  const off = await commerceGuard();
  if (off) return off;
  return finishCommerce("inventory", state, await receivePurchaseOrder(idOf(formData)), []);
}

const RECEIPT_FIELDS = [
  "purchase_order_id",
  "supplier_id",
  "org_id",
  "reference",
  "lines",
  "lot",
] as const;

export async function createReceiptAction(
  state: ReplayState,
  formData: FormData,
): Promise<ReplayState> {
  const off = await commerceGuard();
  if (off) return off;
  const values = typed(formData, RECEIPT_FIELDS);
  const outcome = await createReceipt({
    purchase_order_id: values.purchase_order_id ?? "",
    supplier_id: values.supplier_id ?? "",
    org_id: values.org_id ?? "",
    reference: values.reference ?? "",
    lines: values.lines ?? "",
    lot: values.lot ?? "",
  });
  const next = await finishCommerce("inventory", state, outcome, RECEIPT_FIELDS, values);
  return outcome.ok ? { ...next, replayed: outcome.data.replayed } : next;
}

const RETURN_FIELDS = ["receipt_number", "lines", "reason"] as const;

export async function createReturnAction(state: FormState, formData: FormData): Promise<FormState> {
  const off = await commerceGuard();
  if (off) return off;
  const values = typed(formData, RETURN_FIELDS);
  const outcome = await createSupplierReturn({
    receipt_number: values.receipt_number ?? "",
    lines: values.lines ?? "",
    reason: values.reason ?? "",
  });
  return finishCommerce("inventory", state, outcome, RETURN_FIELDS, values);
}

// ---------------------------------------------------------------- Hàng loạt
//
// Hàm mẫu (và API dự kiến của bước 42) chỉ có lệnh từng phiếu: lặp từng id, gom lỗi (đã dịch) để
// thanh hàng loạt báo "Xong 8/10, 2 lỗi" và giữ dòng hỏng được chọn. Không bịa endpoint hàng loạt.

type Outcome = { ok: true } | { ok: false; problem: Problem };

async function bulkInventory(
  input: BulkInput,
  run: (id: string) => Promise<Outcome>,
  names: () => Promise<Map<string, string>>,
): Promise<BulkResult> {
  const ids = cleanIds(input.ids);
  const off = await commerceGuard();
  if (off) return bulkBlocked(ids, off.error ?? "");
  const known = await names();
  const result = await eachId(
    ids,
    async (id) => {
      const outcome = await run(id);
      return outcome.ok ? null : (await translateCommerce(outcome.problem, "inventory")).detail;
    },
    (id) => known.get(id) ?? id,
  );
  refresh();
  return result;
}

const transferNames = async () =>
  new Map((await listTransfers()).data.map((t) => [t.id, t.number]));
const countNames = async () => new Map((await listCounts()).data.map((c) => [c.id, c.number]));
const purchaseNames = async () =>
  new Map((await listPurchaseOrders()).data.map((p) => [p.id, p.number]));
const lotNames = async () => new Map((await listLots()).data.map((l) => [l.id, l.lot_code]));
const serialNames = async () => new Map((await listSerials()).data.map((x) => [x.id, x.serial]));
const levelNames = async () =>
  new Map(
    (await listLevels({ limit: 10_000 })).data.map((l) => [l.id, `${l.sku} · ${l.org_name}`]),
  );

/** Đặt cùng một mức tối thiểu cho nhiều dòng tồn (`value`: số người dùng gõ; hàm mẫu kiểm số nguyên). */
export async function bulkReorderAction(input: BulkInput): Promise<BulkResult> {
  return bulkInventory(input, (id) => setReorderPoint(id, input.value ?? ""), levelNames);
}

export async function bulkShipTransfersAction(input: BulkInput): Promise<BulkResult> {
  return bulkInventory(input, (id) => changeTransfer(id, "ship"), transferNames);
}

export async function bulkReceiveTransfersAction(input: BulkInput): Promise<BulkResult> {
  return bulkInventory(input, (id) => receiveTransfer(id, null), transferNames);
}

export async function bulkCancelTransfersAction(input: BulkInput): Promise<BulkResult> {
  return bulkInventory(input, (id) => changeTransfer(id, "cancel"), transferNames);
}

export async function bulkApplyCountsAction(input: BulkInput): Promise<BulkResult> {
  return bulkInventory(input, (id) => changeCount(id, "apply"), countNames);
}

export async function bulkCancelCountsAction(input: BulkInput): Promise<BulkResult> {
  return bulkInventory(input, (id) => changeCount(id, "cancel"), countNames);
}

export async function bulkWriteOffLotsAction(input: BulkInput): Promise<BulkResult> {
  return bulkInventory(input, (id) => writeOffLot(id, ""), lotNames);
}

export async function bulkRestockSerialsAction(input: BulkInput): Promise<BulkResult> {
  return bulkInventory(input, (id) => decideSerial(id, "restock"), serialNames);
}

export async function bulkWriteOffSerialsAction(input: BulkInput): Promise<BulkResult> {
  return bulkInventory(input, (id) => decideSerial(id, "write_off"), serialNames);
}

export async function bulkPlacePurchasesAction(input: BulkInput): Promise<BulkResult> {
  return bulkInventory(input, (id) => changePurchaseOrder(id, "order"), purchaseNames);
}

export async function bulkClosePurchasesAction(input: BulkInput): Promise<BulkResult> {
  return bulkInventory(input, (id) => changePurchaseOrder(id, "close"), purchaseNames);
}

export async function bulkCancelPurchasesAction(input: BulkInput): Promise<BulkResult> {
  return bulkInventory(input, (id) => changePurchaseOrder(id, "cancel"), purchaseNames);
}
