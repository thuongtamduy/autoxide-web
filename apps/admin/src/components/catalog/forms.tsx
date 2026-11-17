"use client";

// Biểu mẫu của màn "Sản phẩm và giá" (dữ liệu mẫu, W-006, chờ module `catalog` của bước 41). Cùng
// cách làm với phần gọi core thật: Server Action, lỗi theo ô dưới đúng ô, gom mọi lỗi một lần, mã
// lỗi `catalog.*`; chỉ khác là action gọi hàm mẫu thay cho API chưa có.
import { useTranslations } from "next-intl";
import { useState } from "react";
import {
  addDocumentAction,
  addPriceAction,
  createAttributeAction,
  createCategoryAction,
  createPriceListAction,
  createProductAction,
  moveCategoryAction,
  type PriceState,
  saveVariantAction,
  setCategoryAttributeAction,
} from "@/app/(admin)/catalog/actions";
import { CheckField, Field, SelectField, TextareaField } from "@/components/ui/form";
import type { FormState } from "@/lib/form";
import { ActionDialog } from "./action-dialog";

export interface Option {
  value: string;
  label: string;
}

const value = (state: FormState, name: string, fallback = "") => state.values?.[name] ?? fallback;

/** "Sản phẩm mới": bản nháp có một biến thể; mở bán khi đủ thuộc tính, nhóm thuế và giá. */
export function NewProductDialog({
  categories,
  taxes,
  primary = true,
}: {
  categories: Option[];
  taxes: Option[];
  primary?: boolean;
}) {
  const t = useTranslations("catalog.new");
  const kinds = useTranslations("catalog.kinds");
  return (
    <ActionDialog
      label={t("button")}
      title={t("title")}
      intro={t("intro")}
      triggerClass={primary ? "btn pri" : "btn sm"}
      action={createProductAction}
      submit={t("submit")}
      done={t("created")}
    >
      {(state) => (
        <>
          <Field
            label={t("name")}
            name="name"
            required
            defaultValue={value(state, "name")}
            error={state.fields?.name}
          />
          <div className="fld-row">
            <SelectField
              label={t("kind")}
              name="kind"
              defaultValue={value(state, "kind", "physical")}
              options={["physical", "digital", "service", "bundle"].map((k) => ({
                value: k,
                label: kinds(k),
              }))}
              error={state.fields?.kind}
            />
            <SelectField
              label={t("tax")}
              name="tax_category"
              defaultValue={value(state, "tax_category", taxes[0]?.value ?? "")}
              options={taxes}
              error={state.fields?.tax_category}
            />
          </div>
          <SelectField
            label={t("category")}
            name="category_id"
            defaultValue={value(state, "category_id")}
            options={[{ value: "", label: t("pickCategory") }, ...categories]}
            error={state.fields?.category_id}
          />
          <Field
            label={t("sku")}
            name="sku"
            mono
            required
            defaultValue={value(state, "sku")}
            hint={t("skuHint")}
            error={state.fields?.sku}
          />
        </>
      )}
    </ActionDialog>
  );
}

export interface VariantValues {
  id: string;
  sku: string;
  barcode: string;
  weight_grams: string;
  length_mm: string;
  width_mm: string;
  height_mm: string;
}

/**
 * Thêm hay sửa một biến thể. Thêm biến thể thứ hai cho sản phẩm chưa có tuỳ chọn thì hỏi tên tuỳ
 * chọn ("Cỡ", "Màu"); có rồi thì chỉ hỏi giá trị ("30 cm").
 */
export function VariantDialog({
  productId,
  variant,
  optionName,
  needsOption,
  needsOptionName,
}: {
  productId: string;
  variant?: VariantValues;
  optionName: string | null;
  needsOption: boolean;
  needsOptionName: boolean;
}) {
  const t = useTranslations("catalog.product.variants");
  const editing = variant !== undefined;
  const v = (state: FormState, name: keyof VariantValues) =>
    value(state, name, variant?.[name] ?? "");
  return (
    <ActionDialog
      label={editing ? t("edit") : t("add")}
      title={editing ? t("editTitle", { sku: variant.sku }) : t("addTitle")}
      intro={editing ? undefined : t("addIntro")}
      triggerClass={editing ? "btn sm ghost" : "btn sm"}
      action={saveVariantAction}
      hidden={{ id: productId, variant_id: variant?.id ?? "" }}
      submit={editing ? t("save") : t("addSubmit")}
      done={editing ? t("saved") : t("added")}
    >
      {(state) => (
        <>
          <div className="fld-row">
            <Field
              label={t("sku")}
              name="sku"
              mono
              required
              defaultValue={v(state, "sku")}
              error={state.fields?.sku}
            />
            <Field
              label={t("barcode")}
              name="barcode"
              mono
              inputMode="numeric"
              defaultValue={v(state, "barcode")}
              hint={t("barcodeHint")}
              error={state.fields?.barcode}
            />
          </div>
          {!editing && needsOptionName ? (
            <Field
              label={t("optionName")}
              name="option_name"
              defaultValue={value(state, "option_name")}
              hint={t("optionNameHint")}
              error={state.fields?.option_name}
            />
          ) : null}
          {!editing && needsOption ? (
            <Field
              label={optionName ? t("optionValueOf", { option: optionName }) : t("optionValue")}
              name="option_value"
              defaultValue={value(state, "option_value")}
              error={state.fields?.option_value}
            />
          ) : null}
          <div className="fld-row">
            <Field
              label={t("weight")}
              name="weight_grams"
              mono
              inputMode="numeric"
              defaultValue={v(state, "weight_grams")}
              error={state.fields?.weight_grams}
            />
            <Field
              label={t("length")}
              name="length_mm"
              mono
              inputMode="numeric"
              defaultValue={v(state, "length_mm")}
              error={state.fields?.length_mm}
            />
          </div>
          <div className="fld-row">
            <Field
              label={t("width")}
              name="width_mm"
              mono
              inputMode="numeric"
              defaultValue={v(state, "width_mm")}
              error={state.fields?.width_mm}
            />
            <Field
              label={t("height")}
              name="height_mm"
              mono
              inputMode="numeric"
              defaultValue={v(state, "height_mm")}
              error={state.fields?.height_mm}
            />
          </div>
          <p className="fhint">{t("shippingHint")}</p>
        </>
      )}
    </ActionDialog>
  );
}

/** "Thêm danh mục": tên và danh mục cha; đường dẫn tự sinh từ tên. */
export function CategoryDialog({ parents }: { parents: Option[] }) {
  const t = useTranslations("catalog.categories");
  return (
    <ActionDialog
      label={t("add")}
      title={t("addTitle")}
      action={createCategoryAction}
      submit={t("addSubmit")}
      done={t("added")}
    >
      {(state) => (
        <>
          <Field
            label={t("name")}
            name="name"
            required
            defaultValue={value(state, "name")}
            error={state.fields?.name}
          />
          <SelectField
            label={t("parent")}
            name="parent_id"
            defaultValue={value(state, "parent_id")}
            options={[{ value: "", label: t("noParent") }, ...parents]}
            error={state.fields?.parent_id}
          />
        </>
      )}
    </ActionDialog>
  );
}

/** "Dời danh mục": chọn cha mới; dời vào nhánh con của chính nó thì core báo `catalog.category_cycle`. */
export function MoveCategoryDialog({
  id,
  name,
  parents,
  current,
}: {
  id: string;
  name: string;
  parents: Option[];
  current: string;
}) {
  const t = useTranslations("catalog.categories");
  return (
    <ActionDialog
      label={t("move")}
      title={t("moveTitle", { name })}
      intro={t("moveIntro")}
      action={moveCategoryAction}
      hidden={{ id }}
      submit={t("moveSubmit")}
      done={t("moved")}
    >
      {(state) => (
        <SelectField
          label={t("parent")}
          name="parent_id"
          defaultValue={current}
          options={[{ value: "", label: t("noParent") }, ...parents]}
          error={state.fields?.parent_id}
        />
      )}
    </ActionDialog>
  );
}

/** Thêm hay đổi một thuộc tính bắt buộc của danh mục, kèm ngày hiệu lực và căn cứ. */
export function RequiredAttributeDialog({
  id,
  name,
  attributes,
  today,
}: {
  id: string;
  name: string;
  attributes: Option[];
  today: string;
}) {
  const t = useTranslations("catalog.categories.required");
  return (
    <ActionDialog
      label={t("edit")}
      title={t("dialogTitle", { name })}
      intro={t("intro")}
      triggerClass="btn sm pri"
      action={setCategoryAttributeAction}
      hidden={{ id }}
      submit={t("submit")}
      done={t("saved")}
    >
      {(state) => (
        <>
          <SelectField
            label={t("attribute")}
            name="attribute_id"
            defaultValue={value(state, "attribute_id")}
            options={[{ value: "", label: t("pick") }, ...attributes]}
            error={state.fields?.attribute_id}
          />
          <Field
            label={t("from")}
            name="effective_from"
            type="date"
            defaultValue={value(state, "effective_from", today)}
            error={state.fields?.effective_from}
          />
          <CheckField
            label={t("children")}
            hint={t("childrenHint")}
            name="applies_to_descendants"
            defaultChecked
          />
          <Field
            label={t("basis")}
            name="legal_basis"
            defaultValue={value(state, "legal_basis")}
            hint={t("basisHint")}
            error={state.fields?.legal_basis}
          />
        </>
      )}
    </ActionDialog>
  );
}

const TYPES = ["text", "integer", "decimal", "boolean", "date", "option", "options"] as const;

/** "Thêm thuộc tính": mã, tên, kiểu, đơn vị, lọc được; lựa chọn viết mỗi dòng `mã | nhãn`. */
export function AttributeDialog() {
  const t = useTranslations("catalog.attributes");
  const [type, setType] = useState<string>("text");
  return (
    <ActionDialog
      label={t("add")}
      title={t("addTitle")}
      action={createAttributeAction}
      submit={t("addSubmit")}
      done={t("added")}
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
            <SelectField
              label={t("type")}
              name="data_type"
              value={type}
              onChange={(event) => setType(event.target.value)}
              options={TYPES.map((k) => ({ value: k, label: t(`types.${k}`) }))}
              error={state.fields?.data_type}
            />
            <Field
              label={t("unit")}
              name="unit"
              defaultValue={value(state, "unit")}
              hint={t("unitHint")}
            />
          </div>
          {type === "decimal" ? (
            <Field
              label={t("scale")}
              name="scale"
              mono
              inputMode="numeric"
              defaultValue={value(state, "scale", "1")}
              hint={t("scaleHint")}
              error={state.fields?.scale}
            />
          ) : null}
          {type === "option" || type === "options" ? (
            <TextareaField
              label={t("options")}
              name="options"
              rows={4}
              defaultValue={value(state, "options")}
              hint={t("optionsHint")}
              error={state.fields?.options}
            />
          ) : null}
          <CheckField label={t("filterable")} hint={t("filterableHint")} name="filterable" />
        </>
      )}
    </ActionDialog>
  );
}

/** "Thêm giấy tờ" của hàng có điều kiện; tệp lưu ở kho riêng tư (chưa tải lên ở bản mẫu). */
export function DocumentDialog({
  products,
  types,
  productId,
  primary = false,
}: {
  products: Option[];
  types: Option[];
  productId?: string;
  primary?: boolean;
}) {
  const t = useTranslations("catalog.documents");
  return (
    <ActionDialog
      label={t("add")}
      title={t("addTitle")}
      intro={t("addIntro")}
      triggerClass={primary ? "btn sm pri" : "btn sm"}
      action={addDocumentAction}
      submit={t("addSubmit")}
      done={t("added")}
    >
      {(state) => (
        <>
          <SelectField
            label={t("product")}
            name="product_id"
            defaultValue={value(state, "product_id", productId ?? "")}
            options={[{ value: "", label: t("pickProduct") }, ...products]}
            error={state.fields?.product_id}
          />
          <SelectField
            label={t("type")}
            name="document_type"
            defaultValue={value(state, "document_type", types[0]?.value ?? "")}
            options={types}
            error={state.fields?.document_type}
          />
          <div className="fld-row">
            <Field
              label={t("number")}
              name="number"
              required
              defaultValue={value(state, "number")}
              error={state.fields?.number}
            />
            <Field
              label={t("issuedBy")}
              name="issued_by"
              defaultValue={value(state, "issued_by")}
            />
          </div>
          <div className="fld-row">
            <Field
              label={t("issuedOn")}
              name="issued_on"
              type="date"
              required
              defaultValue={value(state, "issued_on")}
              error={state.fields?.issued_on}
            />
            <Field
              label={t("expiresOn")}
              name="expires_on"
              type="date"
              defaultValue={value(state, "expires_on")}
              hint={t("expiresHint")}
              error={state.fields?.expires_on}
            />
          </div>
        </>
      )}
    </ActionDialog>
  );
}

/** "Bảng giá mới": nút (trụ sở hay cửa hàng), đối tượng, tiền tệ, gồm thuế, nhóm khách, ưu tiên. */
export function PriceListDialog({ units }: { units: Option[] }) {
  const t = useTranslations("catalog.prices.newList");
  const audience = useTranslations("catalog.prices.audience");
  return (
    <ActionDialog
      label={t("button")}
      title={t("title")}
      intro={t("intro")}
      action={createPriceListAction}
      submit={t("submit")}
      done={t("created")}
    >
      {(state) => (
        <>
          <Field
            label={t("name")}
            name="name"
            required
            defaultValue={value(state, "name")}
            error={state.fields?.name}
          />
          <div className="fld-row">
            <SelectField
              label={t("node")}
              name="org_id"
              defaultValue={value(state, "org_id", units[0]?.value ?? "")}
              options={units}
              error={state.fields?.org_id}
            />
            <SelectField
              label={t("audience")}
              name="audience"
              defaultValue={value(state, "audience", "consumer")}
              options={["consumer", "business"].map((a) => ({ value: a, label: audience(a) }))}
              error={state.fields?.audience}
            />
          </div>
          <div className="fld-row">
            <Field
              label={t("currency")}
              name="currency"
              mono
              defaultValue={value(state, "currency", "VND")}
              error={state.fields?.currency}
            />
            <Field
              label={t("priority")}
              name="priority"
              mono
              inputMode="numeric"
              defaultValue={value(state, "priority", "0")}
              hint={t("priorityHint")}
              error={state.fields?.priority}
            />
          </div>
          <Field
            label={t("group")}
            name="customer_group"
            mono
            defaultValue={value(state, "customer_group")}
            hint={t("groupHint")}
          />
          <CheckField
            label={t("taxInclusive")}
            hint={t("taxInclusiveHint")}
            name="tax_inclusive"
            defaultChecked
          />
          {state.fields?.tax_inclusive ? (
            <p className="ferr" role="alert">
              {state.fields.tax_inclusive}
            </p>
          ) : null}
        </>
      )}
    </ActionDialog>
  );
}

/**
 * "Thêm dòng giá": dòng giá không sửa, không xoá; đổi giá là thêm dòng mới có ngày hiệu lực. Mã
 * tham chiếu chống thêm hai lần khi bấm lại (gửi lại cùng mã → core trả dòng đã có).
 */
export function PriceDialog({
  lists,
  list,
  code,
  from,
  reference,
  label,
  triggerClass = "btn sm",
}: {
  lists: Option[];
  list?: string;
  code?: string;
  from: string;
  reference: string;
  label?: string;
  triggerClass?: string;
}) {
  const t = useTranslations("catalog.prices.add");
  return (
    <ActionDialog<PriceState>
      label={label ?? t("button")}
      title={t("title")}
      intro={t("intro")}
      triggerClass={triggerClass}
      action={addPriceAction}
      submit={t("submit")}
      done={(state) => (state.replayed ? t("replayed") : t("added"))}
    >
      {(state) => (
        <>
          <SelectField
            label={t("list")}
            name="price_list_id"
            defaultValue={value(state, "price_list_id", list ?? lists[0]?.value ?? "")}
            options={lists}
            error={state.fields?.price_list_id}
          />
          <div className="fld-row">
            <Field
              label={t("code")}
              name="code"
              mono
              required
              defaultValue={value(state, "code", code ?? "")}
              hint={t("codeHint")}
              error={state.fields?.code}
            />
            <Field
              money
              label={t("amount")}
              name="amount"
              mono
              inputMode="numeric"
              required
              defaultValue={value(state, "amount")}
              hint={t("amountHint")}
              error={state.fields?.amount}
            />
          </div>
          <div className="fld-row">
            <Field
              label={t("from")}
              name="valid_from"
              type="datetime-local"
              required
              defaultValue={value(state, "valid_from", from)}
              hint={t("fromHint")}
              error={state.fields?.valid_from}
            />
            <Field
              money
              label={t("compare")}
              name="compare_at"
              mono
              inputMode="numeric"
              defaultValue={value(state, "compare_at")}
              hint={t("compareHint")}
              error={state.fields?.compare_at}
            />
          </div>
          <Field
            label={t("reference")}
            name="reference"
            mono
            required
            defaultValue={value(state, "reference", reference)}
            hint={t("referenceHint")}
            error={state.fields?.reference}
          />
        </>
      )}
    </ActionDialog>
  );
}
