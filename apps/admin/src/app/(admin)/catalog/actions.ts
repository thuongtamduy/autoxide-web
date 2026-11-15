"use server";

// Server Action của màn "Sản phẩm và giá" (module `catalog` của core chưa có, bước 41): gọi hàm mẫu
// của `src/sample/catalog.ts` thay cho API (W-006), cùng cách trả lỗi như phần gọi core thật — lỗi
// theo ô, gom mọi lỗi một lần, mã lỗi `catalog.*`. Khi có API chỉ thay lời gọi hàm mẫu.
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import {
  commerceGuard,
  finishChange,
  finishCommerce,
  translateCommerce,
  typed,
} from "@/lib/commerce-action";
import type { ChangeState } from "@/lib/engage";
import type { FormState } from "@/lib/form";
import {
  type AttributeType,
  addDocument,
  addPrice,
  createAttribute,
  createCategory,
  createPriceList,
  createProduct,
  decideSuggestion,
  deleteProduct,
  type ImportMode,
  type ImportPreview,
  moveCategory,
  type PriceResolution,
  type ProductKind,
  type ProductStatus,
  previewImport,
  putAttributes,
  putKitchen,
  putMedia,
  putTranslation,
  removeCategoryAttribute,
  resolvePrice,
  runImport,
  saveVariant,
  setCategoryAttribute,
  setPriceListActive,
  setProductStatus,
  setVariantActive,
  suggestCopy,
  type Transfer,
  updateProduct,
} from "@/sample/catalog";

const CATALOG = "/catalog";

function idOf(formData: FormData): string {
  return String(formData.get("id") ?? "");
}

const on = (formData: FormData, name: string) => formData.get(name) === "on";

// ---------------------------------------------------------------- Sản phẩm

const NEW_FIELDS = ["name", "kind", "category_id", "tax_category", "sku"] as const;

export async function createProductAction(
  state: FormState,
  formData: FormData,
): Promise<FormState> {
  const off = await commerceGuard();
  if (off) return off;
  const values = typed(formData, NEW_FIELDS);
  const outcome = await createProduct({
    name: values.name ?? "",
    kind: (values.kind ?? "physical") as ProductKind,
    category_id: values.category_id ?? "",
    tax_category: values.tax_category ?? "",
    sku: values.sku ?? "",
  });
  if (!outcome.ok) return finishCommerce("catalog", state, outcome, NEW_FIELDS, values);
  redirect(`${CATALOG}/products/${outcome.data.id}?created=1`);
}

const GENERAL_FIELDS = ["category_id", "tax_category", "serial_tracked"] as const;

export async function updateProductAction(
  state: FormState,
  formData: FormData,
): Promise<FormState> {
  const off = await commerceGuard();
  if (off) return off;
  const outcome = await updateProduct(idOf(formData), {
    category_id: String(formData.get("category_id") ?? ""),
    tax_category: String(formData.get("tax_category") ?? ""),
    allow_backorder: on(formData, "allow_backorder"),
    lot_tracked: on(formData, "lot_tracked"),
    serial_tracked: on(formData, "serial_tracked"),
  });
  return finishCommerce("catalog", state, outcome, GENERAL_FIELDS);
}

/** Đổi trạng thái sản phẩm (mở bán, ngừng bán, lưu trữ); trả trạng thái cũ cho Hoàn tác. */
export async function productStatusAction(
  _state: ChangeState,
  formData: FormData,
): Promise<ChangeState> {
  const off = await commerceGuard();
  if (off) return off;
  const outcome = await setProductStatus(
    idOf(formData),
    String(formData.get("status") ?? "") as ProductStatus,
  );
  return finishChange("catalog", outcome, (data) => data.previous);
}

export async function archiveProductAction(
  state: FormState,
  formData: FormData,
): Promise<FormState> {
  const off = await commerceGuard();
  if (off) return off;
  return finishCommerce("catalog", state, await setProductStatus(idOf(formData), "archived"), []);
}

export async function deleteProductAction(
  state: FormState,
  formData: FormData,
): Promise<FormState> {
  const off = await commerceGuard();
  if (off) return off;
  const outcome = await deleteProduct(idOf(formData));
  if (!outcome.ok) return finishCommerce("catalog", state, outcome, []);
  redirect(`${CATALOG}?deleted=1`);
}

const VARIANT_FIELDS = [
  "sku",
  "barcode",
  "option_value",
  "option_name",
  "weight_grams",
  "length_mm",
  "width_mm",
  "height_mm",
] as const;

export async function saveVariantAction(state: FormState, formData: FormData): Promise<FormState> {
  const off = await commerceGuard();
  if (off) return off;
  const values = typed(formData, VARIANT_FIELDS);
  const variantId = String(formData.get("variant_id") ?? "");
  const outcome = await saveVariant(idOf(formData), variantId || null, {
    sku: values.sku ?? "",
    barcode: values.barcode ?? "",
    option_value: values.option_value ?? "",
    option_name: values.option_name ?? "",
    weight_grams: values.weight_grams ?? "",
    length_mm: values.length_mm ?? "",
    width_mm: values.width_mm ?? "",
    height_mm: values.height_mm ?? "",
  });
  return finishCommerce("catalog", state, outcome, VARIANT_FIELDS, values);
}

export async function deactivateVariantAction(
  state: FormState,
  formData: FormData,
): Promise<FormState> {
  const off = await commerceGuard();
  if (off) return off;
  return finishCommerce("catalog", state, await setVariantActive(idOf(formData), false), []);
}

export async function activateVariantAction(
  state: FormState,
  formData: FormData,
): Promise<FormState> {
  const off = await commerceGuard();
  if (off) return off;
  return finishCommerce("catalog", state, await setVariantActive(idOf(formData), true), []);
}

/** Thuộc tính: ô `attr.<id>` (nhiều lựa chọn gửi nhiều giá trị cùng tên). */
export async function saveAttributesAction(
  state: FormState,
  formData: FormData,
): Promise<FormState> {
  const off = await commerceGuard();
  if (off) return off;
  const values: Record<string, string[]> = {};
  const names = new Set<string>();
  for (const [name, value] of formData.entries()) {
    if (!name.startsWith("attr.")) continue;
    names.add(name);
    const id = name.slice(5);
    values[id] = [...(values[id] ?? []), String(value)];
  }
  // Ô có / không gửi "false" khi bỏ chọn qua ô ẩn đứng trước; lấy giá trị sau cùng.
  for (const [id, list] of Object.entries(values)) {
    if (list.length === 2 && list[0] === "" && (list[1] === "true" || list[1] === "false"))
      values[id] = [list[1]];
  }
  const outcome = await putAttributes(idOf(formData), values);
  return finishCommerce("catalog", state, outcome, [...names]);
}

export async function saveKitchenAction(state: FormState, formData: FormData): Promise<FormState> {
  const off = await commerceGuard();
  if (off) return off;
  const serves: Record<string, { min: string; max: string }> = {};
  const names: string[] = [
    "in_box",
    "not_included",
    "use",
    "care",
    "dishwasher_safe",
    "manual_media_id",
  ];
  for (const [name, value] of formData.entries()) {
    const match = /^serves\.(min|max)\.(.+)$/.exec(name);
    if (!match) continue;
    const [, which, id] = match as unknown as [string, "min" | "max", string];
    serves[id] = { ...(serves[id] ?? { min: "", max: "" }), [which]: String(value) };
    names.push(`serves.${id}`);
  }
  const outcome = await putKitchen(idOf(formData), {
    locale: String(formData.get("locale") ?? "vi"),
    serves,
    in_box: String(formData.get("in_box") ?? ""),
    not_included: String(formData.get("not_included") ?? ""),
    use: String(formData.get("use") ?? ""),
    care: String(formData.get("care") ?? ""),
    dishwasher_safe: String(formData.get("dishwasher_safe") ?? "") as "" | "yes" | "no",
    manual_media_id: String(formData.get("manual_media_id") ?? ""),
  });
  return finishCommerce("catalog", state, outcome, names);
}

/** Ảnh: cả danh sách gửi một lần dạng JSON (`media`), như `PUT /products/{id}/media`. */
export async function saveMediaAction(state: FormState, formData: FormData): Promise<FormState> {
  const off = await commerceGuard();
  if (off) return off;
  let list: { media_id: string; variant_id: string | null; alt: string; public: boolean }[] = [];
  try {
    const parsed: unknown = JSON.parse(String(formData.get("media") ?? "[]"));
    if (Array.isArray(parsed)) {
      list = parsed
        .filter((m): m is Record<string, unknown> => typeof m === "object" && m !== null)
        .map((m) => ({
          media_id: String(m.media_id ?? ""),
          variant_id: typeof m.variant_id === "string" && m.variant_id ? m.variant_id : null,
          alt: String(m.alt ?? ""),
          public: m.public === true,
        }))
        .filter((m) => /^[0-9a-f-]{36}$/.test(m.media_id));
    }
  } catch {
    const t = await getTranslations("catalog.product.images");
    return { error: t("invalid") };
  }
  return finishCommerce("catalog", state, await putMedia(idOf(formData), list), [
    "alt",
    "variant_id",
  ]);
}

const TRANSLATION_FIELDS = [
  "name",
  "slug",
  "short_description",
  "description",
  "meta_title",
  "meta_description",
] as const;

export async function saveTranslationAction(
  state: FormState,
  formData: FormData,
): Promise<FormState> {
  const off = await commerceGuard();
  if (off) return off;
  const values = typed(formData, TRANSLATION_FIELDS);
  const outcome = await putTranslation(idOf(formData), {
    locale: String(formData.get("locale") ?? "vi"),
    name: values.name ?? "",
    slug: values.slug ?? "",
    short_description: values.short_description ?? "",
    description: values.description ?? "",
    meta_title: values.meta_title ?? "",
    meta_description: values.meta_description ?? "",
  });
  return finishCommerce("catalog", state, outcome, TRANSLATION_FIELDS, values);
}

export async function suggestCopyAction(state: FormState, formData: FormData): Promise<FormState> {
  const off = await commerceGuard();
  if (off) return off;
  return finishCommerce(
    "catalog",
    state,
    await suggestCopy(idOf(formData), String(formData.get("locale") ?? "vi")),
    [],
  );
}

export async function applySuggestionAction(
  state: FormState,
  formData: FormData,
): Promise<FormState> {
  const off = await commerceGuard();
  if (off) return off;
  return finishCommerce("catalog", state, await decideSuggestion(idOf(formData), true), []);
}

export async function discardSuggestionAction(
  state: FormState,
  formData: FormData,
): Promise<FormState> {
  const off = await commerceGuard();
  if (off) return off;
  return finishCommerce("catalog", state, await decideSuggestion(idOf(formData), false), []);
}

// ---------------------------------------------------------------- Danh mục, thuộc tính, giấy tờ

export async function createCategoryAction(
  state: FormState,
  formData: FormData,
): Promise<FormState> {
  const off = await commerceGuard();
  if (off) return off;
  const values = typed(formData, ["name", "parent_id"]);
  const outcome = await createCategory({
    name: values.name ?? "",
    parent_id: values.parent_id || null,
  });
  return finishCommerce("catalog", state, outcome, ["name", "parent_id"], values);
}

export async function moveCategoryAction(state: FormState, formData: FormData): Promise<FormState> {
  const off = await commerceGuard();
  if (off) return off;
  const parent = String(formData.get("parent_id") ?? "");
  return finishCommerce("catalog", state, await moveCategory(idOf(formData), parent || null), [
    "parent_id",
  ]);
}

const REQUIRED_FIELDS = ["attribute_id", "effective_from", "legal_basis"] as const;

export async function setCategoryAttributeAction(
  state: FormState,
  formData: FormData,
): Promise<FormState> {
  const off = await commerceGuard();
  if (off) return off;
  const values = typed(formData, REQUIRED_FIELDS);
  const outcome = await setCategoryAttribute(idOf(formData), {
    attribute_id: values.attribute_id ?? "",
    effective_from: values.effective_from ?? "",
    applies_to_descendants: on(formData, "applies_to_descendants"),
    legal_basis: values.legal_basis ?? "",
  });
  return finishCommerce("catalog", state, outcome, REQUIRED_FIELDS, values);
}

/** `id` = `<danh mục>|<thuộc tính>`. */
export async function removeCategoryAttributeAction(
  state: FormState,
  formData: FormData,
): Promise<FormState> {
  const off = await commerceGuard();
  if (off) return off;
  const [category = "", attribute = ""] = idOf(formData).split("|");
  return finishCommerce("catalog", state, await removeCategoryAttribute(category, attribute), []);
}

const ATTRIBUTE_FIELDS = ["code", "name", "data_type", "unit", "scale", "options"] as const;

export async function createAttributeAction(
  state: FormState,
  formData: FormData,
): Promise<FormState> {
  const off = await commerceGuard();
  if (off) return off;
  const values = typed(formData, ATTRIBUTE_FIELDS);
  const outcome = await createAttribute({
    code: values.code ?? "",
    name: values.name ?? "",
    data_type: (values.data_type ?? "text") as AttributeType,
    unit: values.unit ?? "",
    scale: values.scale ?? "",
    filterable: on(formData, "filterable"),
    options: values.options ?? "",
  });
  return finishCommerce("catalog", state, outcome, ATTRIBUTE_FIELDS, values);
}

const DOCUMENT_FIELDS = [
  "product_id",
  "document_type",
  "number",
  "issued_by",
  "issued_on",
  "expires_on",
] as const;

export async function addDocumentAction(state: FormState, formData: FormData): Promise<FormState> {
  const off = await commerceGuard();
  if (off) return off;
  const values = typed(formData, DOCUMENT_FIELDS);
  const outcome = await addDocument({
    product_id: values.product_id ?? "",
    document_type: values.document_type ?? "",
    number: values.number ?? "",
    issued_by: values.issued_by ?? "",
    issued_on: values.issued_on ?? "",
    expires_on: values.expires_on ?? "",
  });
  return finishCommerce("catalog", state, outcome, DOCUMENT_FIELDS, values);
}

// ---------------------------------------------------------------- Bảng giá

const LIST_FIELDS = [
  "name",
  "org_id",
  "audience",
  "currency",
  "tax_inclusive",
  "customer_group",
  "priority",
] as const;

export async function createPriceListAction(
  state: FormState,
  formData: FormData,
): Promise<FormState> {
  const off = await commerceGuard();
  if (off) return off;
  const values = typed(formData, LIST_FIELDS);
  const outcome = await createPriceList({
    name: values.name ?? "",
    org_id: values.org_id ?? "",
    audience: values.audience ?? "",
    currency: (values.currency ?? "").toUpperCase(),
    tax_inclusive: on(formData, "tax_inclusive"),
    customer_group: values.customer_group ?? "",
    priority: values.priority ?? "",
  });
  return finishCommerce("catalog", state, outcome, LIST_FIELDS, values);
}

/** Bật / tắt bảng giá (`status` = "on" / "off"), trả trạng thái cũ cho Hoàn tác. */
export async function priceListActiveAction(
  _state: ChangeState,
  formData: FormData,
): Promise<ChangeState> {
  const off = await commerceGuard();
  if (off) return off;
  const outcome = await setPriceListActive(idOf(formData), formData.get("status") === "on");
  return finishChange("catalog", outcome, (data) => (data.previous ? "on" : "off"));
}

const PRICE_FIELDS = [
  "price_list_id",
  "code",
  "amount",
  "compare_at",
  "valid_from",
  "reference",
] as const;

export interface PriceState extends FormState {
  replayed?: boolean;
}

export async function addPriceAction(state: PriceState, formData: FormData): Promise<PriceState> {
  const off = await commerceGuard();
  if (off) return off;
  const values = typed(formData, PRICE_FIELDS);
  const outcome = await addPrice({
    price_list_id: values.price_list_id ?? "",
    code: values.code ?? "",
    amount: values.amount ?? "",
    compare_at: values.compare_at ?? "",
    valid_from: values.valid_from ?? "",
    reference: values.reference ?? "",
  });
  const next = await finishCommerce("catalog", state, outcome, PRICE_FIELDS, values);
  return outcome.ok ? { ...next, replayed: outcome.data.replayed } : next;
}

export interface ResolveState extends FormState {
  result?: PriceResolution;
}

/** "Giá giải ra vì sao": chỉ đọc, trả kết quả để hiện ngay dưới form. */
export async function resolvePriceAction(
  _state: ResolveState,
  formData: FormData,
): Promise<ResolveState> {
  const off = await commerceGuard();
  if (off) return off;
  const at = String(formData.get("at") ?? "");
  const outcome = await resolvePrice({
    variant_id: String(formData.get("variant_id") ?? ""),
    org_id: String(formData.get("org_id") ?? ""),
    customer_group: String(formData.get("customer_group") ?? "") || null,
    at: at ? new Date(Date.parse(`${at}:00+07:00`)).toISOString() : new Date().toISOString(),
  });
  if (!outcome.ok) {
    const problem = await translateCommerce(outcome.problem, "catalog");
    return { error: problem.detail, code: problem.code };
  }
  return { result: outcome.data, done: 1 };
}

// ---------------------------------------------------------------- Nhập CSV

export interface ImportState extends FormState {
  preview?: ImportPreview;
  transfer?: Transfer;
  /** Nội dung tệp vừa chạy thử, để bấm "Nhập" không phải chọn lại tệp. */
  text?: string;
  fileName?: string;
  mode?: ImportMode;
}

const MAX_BYTES = 20 * 1024 * 1024;

async function importText(
  formData: FormData,
): Promise<{ text: string; fileName: string } | { error: string }> {
  const t = await getTranslations("catalog.imports");
  const kept = String(formData.get("kept") ?? "");
  if (kept) return { text: kept, fileName: String(formData.get("file_name") ?? "import.csv") };
  const file = formData.get("file");
  if (file instanceof File && file.size > 0) {
    if (file.size > MAX_BYTES) return { error: t("tooBig") };
    return { text: await file.text(), fileName: file.name };
  }
  const pasted = String(formData.get("pasted") ?? "");
  if (pasted.trim()) return { text: pasted, fileName: "pasted.csv" };
  return { error: t("noFile") };
}

/** Chạy thử: kiểm mọi dòng như lần nhập thật, không ghi gì; `run` = nhập thật. */
export async function importAction(state: ImportState, formData: FormData): Promise<ImportState> {
  const off = await commerceGuard();
  if (off) return off;
  // "Chọn tệp khác": bỏ kết quả chạy thử, về form trống.
  if (formData.get("again") === "1") return {};
  const mode = (formData.get("mode") === "update_only" ? "update_only" : "upsert") as ImportMode;
  const source = await importText(formData);
  if ("error" in source) return { fields: { file: source.error } };
  if (formData.get("run") === "1") {
    const outcome = await runImport(source.text, mode, source.fileName);
    const next = await finishCommerce("catalog", state, outcome, ["file"]);
    return outcome.ok ? { ...next, transfer: outcome.data } : next;
  }
  const outcome = await previewImport(source.text, mode);
  if (!outcome.ok) return finishCommerce("catalog", state, outcome, ["file"]);
  return { preview: outcome.data, text: source.text, fileName: source.fileName, mode };
}
