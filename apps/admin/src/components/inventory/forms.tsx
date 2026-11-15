"use client";

// Biểu mẫu của màn "Tồn kho" (dữ liệu mẫu, W-006, chờ module `inventory` của bước 42): điều chỉnh
// tồn có lý do, chuyển kho, kiểm kê, đơn đặt mua, phiếu nhập, trả hàng, nhà cung cấp. Cùng cách
// làm với phần gọi core thật: Server Action, lỗi theo ô, gom mọi lỗi một lần, mã lỗi `inventory.*`.
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import {
  adjustAction,
  countLinesAction,
  createCountAction,
  createPurchaseOrderAction,
  createReceiptAction,
  createReturnAction,
  createSupplierAction,
  createTransferAction,
  type ReplayState,
  receivePartAction,
  reorderAction,
} from "@/app/(admin)/catalog/inventory/actions";
import { ActionDialog, ActionForm } from "@/components/catalog/action-dialog";
import type { Option } from "@/components/catalog/forms";
import { Field, SelectField, TextareaField } from "@/components/ui/form";
import type { FormState } from "@/lib/form";

const value = (state: FormState, name: string, fallback = "") => state.values?.[name] ?? fallback;

/** Lý do điều chỉnh (mã ổn định của core, chữ theo ngôn ngữ). */
function useReasons(withEmpty = true): Option[] {
  const t = useTranslations("inventory.reasons");
  const codes = ["damaged", "lost", "found", "correction", "sample"];
  return [
    ...(withEmpty ? [{ value: "", label: t("pick") }] : []),
    ...codes.map((c) => ({ value: c, label: t(c) })),
  ];
}

interface AdjustFieldsProps {
  warehouses: Option[];
  org?: string;
  code?: string;
}

/** Mã chống ghi hai lần cho một lần điều chỉnh: mới sau mỗi lần ghi xong, giữ nguyên khi gửi lại. */
function attemptKey(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

function AdjustFields({ state, warehouses, org, code }: AdjustFieldsProps & { state: FormState }) {
  const t = useTranslations("inventory.adjust");
  const reasons = useReasons();
  // Sinh ở trình duyệt (không ở máy chủ, để khỏi lệch khi hydrate), đổi sau mỗi lần ghi xong.
  const [reference, setReference] = useState("");
  // biome-ignore lint/correctness/useExhaustiveDependencies: đổi mã khi `done` tăng
  useEffect(() => setReference(attemptKey()), [state.done]);
  return (
    <>
      <input type="hidden" name="reference" value={reference ? `adj-${reference}` : ""} />
      <div className="fld-row">
        <SelectField
          label={t("warehouse")}
          name="org_id"
          defaultValue={value(state, "org_id", org ?? warehouses[0]?.value ?? "")}
          options={warehouses}
          error={state.fields?.org_id}
        />
        <Field
          label={t("code")}
          name="code"
          mono
          required
          defaultValue={value(state, "code", code ?? "")}
          hint={t("codeHint")}
          error={state.fields?.code}
        />
      </div>
      <div className="fld-row">
        <Field
          label={t("quantity")}
          name="quantity"
          mono
          required
          inputMode="numeric"
          defaultValue={value(state, "quantity")}
          hint={t("quantityHint")}
          error={state.fields?.quantity}
        />
        <SelectField
          label={t("reason")}
          name="reason_code"
          defaultValue={value(state, "reason_code")}
          options={reasons}
          error={state.fields?.reason_code}
        />
      </div>
      <TextareaField
        label={t("note")}
        name="note"
        rows={2}
        required
        defaultValue={value(state, "note")}
        hint={t("noteHint")}
        error={state.fields?.note}
      />
      <Field
        label={t("serials")}
        name="serials"
        mono
        defaultValue={value(state, "serials")}
        hint={t("serialsHint")}
        error={state.fields?.serials}
      />
    </>
  );
}

/** "Điều chỉnh tồn": ghi một dòng sổ biến động có lý do; không sửa được sau khi ghi. */
export function AdjustDialog({
  label,
  primary = false,
  triggerClass,
  ...props
}: AdjustFieldsProps & { label?: string; primary?: boolean; triggerClass?: string }) {
  const t = useTranslations("inventory.adjust");
  return (
    <ActionDialog<ReplayState>
      label={label ?? t("button")}
      title={t("title")}
      intro={t("intro")}
      triggerClass={triggerClass ?? (primary ? "btn pri" : "btn sm")}
      action={adjustAction}
      submit={t("submit")}
      done={(state) => (state.replayed ? t("replayed") : t("done"))}
    >
      {(state) => <AdjustFields state={state} {...props} />}
    </ActionDialog>
  );
}

/** "Điều chỉnh nhanh" đặt ngay trong tab Sổ biến động. */
export function QuickAdjustForm(props: AdjustFieldsProps) {
  const t = useTranslations("inventory.adjust");
  return (
    <ActionForm<ReplayState>
      action={adjustAction}
      submit={t("submit")}
      done={(state) => (state.replayed ? t("replayed") : t("done"))}
    >
      {(state) => <AdjustFields state={state} {...props} />}
    </ActionForm>
  );
}

/** "Đổi mức tồn tối thiểu" của một dòng tồn. */
export function ReorderDialog({ id, current }: { id: string; current: string }) {
  const t = useTranslations("inventory.reorder");
  return (
    <ActionDialog
      label={t("button")}
      title={t("title")}
      intro={t("intro")}
      action={reorderAction}
      hidden={{ id }}
      submit={t("submit")}
      done={t("done")}
    >
      {(state) => (
        <Field
          label={t("field")}
          name="reorder_point"
          mono
          inputMode="numeric"
          defaultValue={value(state, "reorder_point", current)}
          hint={t("hint")}
          error={state.fields?.reorder_point}
        />
      )}
    </ActionDialog>
  );
}

/** "Tạo phiếu chuyển kho": bản nháp, chưa trừ tồn; mỗi dòng "SKU × số lượng". */
export function TransferDialog({
  warehouses,
  from,
  to,
  lines,
  label,
  primary = false,
}: {
  warehouses: Option[];
  from?: string;
  to?: string;
  lines?: string;
  label?: string;
  primary?: boolean;
}) {
  const t = useTranslations("inventory.transfer");
  return (
    <ActionDialog
      label={label ?? t("button")}
      title={t("title")}
      intro={t("intro")}
      triggerClass={primary ? "btn sm pri" : "btn sm"}
      action={createTransferAction}
      submit={t("submit")}
      done={t("created")}
    >
      {(state) => (
        <>
          <div className="fld-row">
            <SelectField
              label={t("from")}
              name="from_org_id"
              defaultValue={value(state, "from_org_id", from ?? warehouses[0]?.value ?? "")}
              options={warehouses}
              error={state.fields?.from_org_id}
            />
            <SelectField
              label={t("to")}
              name="to_org_id"
              defaultValue={value(state, "to_org_id", to ?? warehouses[1]?.value ?? "")}
              options={warehouses}
              error={state.fields?.to_org_id}
            />
          </div>
          <TextareaField
            label={t("lines")}
            name="lines"
            rows={4}
            className="inp area mono"
            required
            defaultValue={value(state, "lines", lines ?? "")}
            hint={t("linesHint")}
            error={state.fields?.lines}
          />
          <Field label={t("note")} name="note" defaultValue={value(state, "note")} />
        </>
      )}
    </ActionDialog>
  );
}

/** "Nhận một phần": số nhận được của từng dòng; phần còn lại vẫn đang đi đường. */
export function ReceivePartDialog({
  id,
  number,
  lines,
}: {
  id: string;
  number: string;
  lines: { id: string; label: string; left: number }[];
}) {
  const t = useTranslations("inventory.transfers");
  return (
    <ActionDialog
      label={t("receivePart")}
      title={t("receivePartTitle", { number })}
      intro={t("receivePartIntro")}
      action={receivePartAction}
      hidden={{ id }}
      submit={t("receivePartSubmit")}
      done={t("receivedPart")}
    >
      {(state) => (
        <>
          {lines.map((line) => (
            <Field
              key={line.id}
              label={t("receiveLine", { label: line.label, left: line.left })}
              name={`line.${line.id}`}
              mono
              inputMode="numeric"
              defaultValue=""
              error={state.fields?.[`line.${line.id}`]}
            />
          ))}
          {state.fields?.lines ? (
            <p className="ferr" role="alert">
              {state.fields.lines}
            </p>
          ) : null}
        </>
      )}
    </ActionDialog>
  );
}

/** "Mở phiếu kiểm kê": theo kho hay theo khu vực. */
export function CountDialog({ warehouses }: { warehouses: Option[] }) {
  const t = useTranslations("inventory.count");
  return (
    <ActionDialog
      label={t("button")}
      title={t("title")}
      intro={t("intro")}
      triggerClass="btn sm pri"
      action={createCountAction}
      submit={t("submit")}
      done={t("created")}
    >
      {(state) => (
        <>
          <SelectField
            label={t("warehouse")}
            name="org_id"
            defaultValue={value(state, "org_id", warehouses[0]?.value ?? "")}
            options={warehouses}
            error={state.fields?.org_id}
          />
          <Field
            label={t("scope")}
            name="scope"
            required
            defaultValue={value(state, "scope")}
            hint={t("scopeHint")}
            error={state.fields?.scope}
          />
        </>
      )}
    </ActionDialog>
  );
}

export interface CountLineValue {
  id: string;
  label: string;
  counted: string;
  expected: number | null;
  reason: string;
}

/**
 * Nhập số đếm và lý do cho từng dòng của một phiếu đang đếm. Số "lúc đếm có" do hệ thống ghi ngay
 * khi lưu số đếm của dòng, nên hàng bán xen giữa không làm sai chênh lệch.
 */
export function CountLinesForm({ id, lines }: { id: string; lines: CountLineValue[] }) {
  const t = useTranslations("inventory.counts");
  const reasons = useReasons();
  return (
    <ActionForm
      action={countLinesAction}
      hidden={{ id }}
      submit={t("saveLines")}
      done={t("savedLines")}
      className="dlg-form cat-count"
    >
      {(state) => (
        <div className="cat-count-lines">
          {lines.map((line) => {
            const diff =
              line.counted !== "" && line.expected !== null
                ? Number(line.counted) - line.expected
                : 0;
            return (
              <div key={line.id} className="cat-count-line">
                <span className="cell2">
                  <b>{line.label}</b>
                  <span className="sub">
                    {line.expected === null
                      ? t("notCounted")
                      : t("expected", { count: line.expected })}
                    {diff !== 0
                      ? ` · ${t("diff", { diff: diff > 0 ? `+${diff}` : `−${Math.abs(diff)}` })}`
                      : ""}
                  </span>
                </span>
                <Field
                  label={t("counted")}
                  name={`line.${line.id}`}
                  mono
                  inputMode="numeric"
                  defaultValue={line.counted}
                  error={state.fields?.[`line.${line.id}`]}
                />
                <SelectField
                  label={t("reason")}
                  name={`reason.${line.id}`}
                  defaultValue={line.reason}
                  options={reasons}
                  error={state.fields?.[`reason.${line.id}`]}
                />
              </div>
            );
          })}
        </div>
      )}
    </ActionForm>
  );
}

/** "Thêm nhà cung cấp": mã duy nhất trong khách (`inventory.supplier_code_taken`). */
export function SupplierDialog() {
  const t = useTranslations("inventory.supplier");
  return (
    <ActionDialog
      label={t("button")}
      title={t("title")}
      triggerClass="btn sm pri"
      action={createSupplierAction}
      submit={t("submit")}
      done={t("created")}
    >
      {(state) => (
        <>
          <div className="fld-row">
            <Field
              label={t("code")}
              name="code"
              mono
              required
              defaultValue={value(state, "code")}
              hint={t("codeHint")}
              error={state.fields?.code}
            />
            <Field
              label={t("name")}
              name="name"
              required
              defaultValue={value(state, "name")}
              error={state.fields?.name}
            />
          </div>
          <div className="fld-row">
            <Field
              label={t("taxCode")}
              name="tax_code"
              mono
              defaultValue={value(state, "tax_code")}
              hint={t("taxCodeHint")}
              error={state.fields?.tax_code}
            />
            <Field
              label={t("terms")}
              name="payment_terms_days"
              mono
              inputMode="numeric"
              defaultValue={value(state, "payment_terms_days", "30")}
              error={state.fields?.payment_terms_days}
            />
          </div>
          <Field
            label={t("note")}
            name="note"
            defaultValue={value(state, "note")}
            hint={t("noteHint")}
          />
        </>
      )}
    </ActionDialog>
  );
}

/** "Tạo đơn đặt mua": bản nháp; mỗi dòng "SKU × số lượng × giá nhập". */
export function PurchaseDialog({
  suppliers,
  warehouses,
  supplier,
}: {
  suppliers: Option[];
  warehouses: Option[];
  supplier?: string;
}) {
  const t = useTranslations("inventory.po");
  return (
    <ActionDialog
      label={t("button")}
      title={t("title")}
      intro={t("intro")}
      triggerClass="btn sm pri"
      action={createPurchaseOrderAction}
      submit={t("submit")}
      done={t("created")}
    >
      {(state) => (
        <>
          <div className="fld-row">
            <SelectField
              label={t("supplier")}
              name="supplier_id"
              defaultValue={value(state, "supplier_id", supplier ?? suppliers[0]?.value ?? "")}
              options={suppliers}
              error={state.fields?.supplier_id}
            />
            <SelectField
              label={t("warehouse")}
              name="org_id"
              defaultValue={value(state, "org_id", warehouses[0]?.value ?? "")}
              options={warehouses}
              error={state.fields?.org_id}
            />
          </div>
          <TextareaField
            label={t("lines")}
            name="lines"
            rows={4}
            className="inp area mono"
            required
            defaultValue={value(state, "lines")}
            hint={t("linesHint")}
            error={state.fields?.lines}
          />
          <Field
            label={t("expected")}
            name="expected_on"
            type="date"
            defaultValue={value(state, "expected_on")}
            error={state.fields?.expected_on}
          />
        </>
      )}
    </ActionDialog>
  );
}

/**
 * "Lập phiếu nhập": theo đơn đặt mua (giá theo đơn) hay nhập thẳng (ghi giá). Mã tham chiếu (số
 * phiếu giao của nhà cung cấp) chống nhập trùng khi bấm lại hay mạng chập chờn.
 */
export function ReceiptDialog({
  orders,
  suppliers,
  warehouses,
  reference,
  primary = false,
}: {
  orders: Option[];
  suppliers: Option[];
  warehouses: Option[];
  reference: string;
  primary?: boolean;
}) {
  const t = useTranslations("inventory.receipt");
  const [order, setOrder] = useState(orders[0]?.value ?? "");
  return (
    <ActionDialog<ReplayState>
      label={t("button")}
      title={t("title")}
      intro={t("intro")}
      triggerClass={primary ? "btn pri" : "btn sm"}
      action={createReceiptAction}
      submit={t("submit")}
      done={(state) => (state.replayed ? t("replayed") : t("done"))}
    >
      {(state) => (
        <>
          <SelectField
            label={t("order")}
            name="purchase_order_id"
            value={order}
            onChange={(event) => setOrder(event.target.value)}
            options={[...orders, { value: "", label: t("direct") }]}
            error={state.fields?.purchase_order_id}
          />
          {order === "" ? (
            <div className="fld-row">
              <SelectField
                label={t("supplier")}
                name="supplier_id"
                defaultValue={value(state, "supplier_id", suppliers[0]?.value ?? "")}
                options={suppliers}
                error={state.fields?.supplier_id}
              />
              <SelectField
                label={t("warehouse")}
                name="org_id"
                defaultValue={value(state, "org_id", warehouses[0]?.value ?? "")}
                options={warehouses}
                error={state.fields?.org_id}
              />
            </div>
          ) : null}
          <Field
            label={t("reference")}
            name="reference"
            mono
            required
            defaultValue={value(state, "reference", reference)}
            hint={t("referenceHint")}
            error={state.fields?.reference}
          />
          <TextareaField
            label={t("lines")}
            name="lines"
            rows={3}
            className="inp area mono"
            required
            defaultValue={value(state, "lines")}
            hint={order === "" ? t("linesDirectHint") : t("linesHint")}
            error={state.fields?.lines}
          />
          <Field
            label={t("lot")}
            name="lot"
            mono
            defaultValue={value(state, "lot")}
            hint={t("lotHint")}
            error={state.fields?.lot}
          />
        </>
      )}
    </ActionDialog>
  );
}

/** "Trả hàng cho nhà cung cấp": trừ tồn ở kho của phiếu nhập, đảo phần phải trả. */
export function SupplierReturnDialog({ receipts }: { receipts: Option[] }) {
  const t = useTranslations("inventory.return");
  return (
    <ActionDialog
      label={t("button")}
      title={t("title")}
      intro={t("intro")}
      action={createReturnAction}
      submit={t("submit")}
      done={t("done")}
    >
      {(state) => (
        <>
          <SelectField
            label={t("receipt")}
            name="receipt_number"
            defaultValue={value(state, "receipt_number", receipts[0]?.value ?? "")}
            options={receipts}
            error={state.fields?.receipt_number}
          />
          <TextareaField
            label={t("lines")}
            name="lines"
            rows={2}
            className="inp area mono"
            required
            defaultValue={value(state, "lines")}
            hint={t("linesHint")}
            error={state.fields?.lines}
          />
          <Field
            label={t("reason")}
            name="reason"
            required
            defaultValue={value(state, "reason")}
            hint={t("reasonHint")}
            error={state.fields?.reason}
          />
        </>
      )}
    </ActionDialog>
  );
}
