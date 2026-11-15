"use client";

// Các khối sửa của trang chi tiết sản phẩm (dữ liệu mẫu, W-006): thông tin chung, thuộc tính của
// danh mục, thuộc tính đồ bếp, nội dung và SEO theo ngôn ngữ, ảnh từ thư viện media thật.
import { useTranslations } from "next-intl";
import { useActionState, useState } from "react";
import {
  saveAttributesAction,
  saveKitchenAction,
  saveMediaAction,
  saveTranslationAction,
  updateProductAction,
} from "@/app/(admin)/catalog/actions";
import { MediaPicker } from "@/components/media/media-picker";
import { Icon } from "@/components/shell/icon";
import {
  CheckField,
  Field,
  FormAlert,
  Labelled,
  SelectField,
  TextareaField,
  useOnDone,
} from "@/components/ui/form";
import { useToast } from "@/components/ui/toast";
import type { FormState } from "@/lib/form";
import { mediaIdSrc } from "@/lib/media";
import { ActionForm } from "./action-dialog";
import type { Option } from "./forms";

const value = (state: FormState, name: string, fallback = "") => state.values?.[name] ?? fallback;

/** Danh mục, nhóm thuế và cách theo dõi tồn. */
export function GeneralForm({
  id,
  categories,
  taxes,
  current,
  disabled,
}: {
  id: string;
  categories: Option[];
  taxes: Option[];
  current: {
    category_id: string;
    tax_category: string;
    allow_backorder: boolean;
    lot_tracked: boolean;
    serial_tracked: boolean;
  };
  disabled: boolean;
}) {
  const t = useTranslations("catalog.product.general");
  return (
    <ActionForm action={updateProductAction} hidden={{ id }} submit={t("save")} done={t("saved")}>
      {(state) => (
        <fieldset disabled={disabled} className="cat-fs">
          <div className="fld-row">
            <SelectField
              label={t("category")}
              name="category_id"
              defaultValue={current.category_id}
              options={categories}
              error={state.fields?.category_id}
            />
            <SelectField
              label={t("tax")}
              name="tax_category"
              defaultValue={current.tax_category}
              options={[{ value: "", label: t("noTax") }, ...taxes]}
              error={state.fields?.tax_category}
            />
          </div>
          <CheckField
            label={t("backorder")}
            hint={t("backorderHint")}
            name="allow_backorder"
            defaultChecked={current.allow_backorder}
          />
          <CheckField
            label={t("lot")}
            hint={t("lotHint")}
            name="lot_tracked"
            defaultChecked={current.lot_tracked}
          />
          <CheckField
            label={t("serial")}
            hint={t("serialHint")}
            name="serial_tracked"
            defaultChecked={current.serial_tracked}
          />
          {state.fields?.serial_tracked ? (
            <p className="ferr" role="alert">
              {state.fields.serial_tracked}
            </p>
          ) : null}
        </fieldset>
      )}
    </ActionForm>
  );
}

export interface AttributeField {
  id: string;
  code: string;
  name: string;
  type: "text" | "integer" | "decimal" | "boolean" | "date" | "option" | "options";
  unit: string | null;
  options: Option[];
  required: boolean;
  values: string[];
}

/** Giá trị thuộc tính; thuộc tính bắt buộc của danh mục có nhãn và báo khi còn trống. */
export function AttributesForm({
  id,
  fields,
  disabled,
}: {
  id: string;
  fields: AttributeField[];
  disabled: boolean;
}) {
  const t = useTranslations("catalog.product.attributes");
  return (
    <ActionForm action={saveAttributesAction} hidden={{ id }} submit={t("save")} done={t("saved")}>
      {(state) => (
        <fieldset disabled={disabled} className="cat-fs cat-attrs">
          {fields.map((field) => {
            const name = `attr.${field.id}`;
            const error = state.fields?.[name];
            const label = `${field.name}${field.unit ? ` (${field.unit})` : ""}`;
            const hint = field.required
              ? field.values.some((v) => v)
                ? t("required")
                : t("missing")
              : undefined;
            if (field.type === "options") {
              return (
                <fieldset
                  key={field.id}
                  className="checks plain cat-multi"
                  aria-invalid={error ? true : undefined}
                >
                  <legend className="lab">
                    {label}{" "}
                    {field.required ? (
                      <span className="badge b-warn">{t("requiredBadge")}</span>
                    ) : null}
                  </legend>
                  <input type="hidden" name={name} value="" />
                  {field.options.map((option) => (
                    <CheckField
                      key={option.value}
                      label={option.label}
                      name={name}
                      value={option.value}
                      defaultChecked={field.values.includes(option.value)}
                    />
                  ))}
                  {error ? <span className="ferr">{error}</span> : null}
                </fieldset>
              );
            }
            if (field.type === "option" || field.type === "boolean") {
              const options =
                field.type === "boolean"
                  ? [
                      { value: "true", label: t("yes") },
                      { value: "false", label: t("no") },
                    ]
                  : field.options;
              return (
                <SelectField
                  key={field.id}
                  label={label}
                  name={name}
                  defaultValue={field.values[0] ?? ""}
                  options={[{ value: "", label: t("empty") }, ...options]}
                  hint={hint}
                  error={error}
                />
              );
            }
            return (
              <Field
                key={field.id}
                label={label}
                name={name}
                type={field.type === "date" ? "date" : "text"}
                inputMode={
                  field.type === "integer" || field.type === "decimal" ? "decimal" : undefined
                }
                mono={field.type === "integer" || field.type === "decimal"}
                defaultValue={field.values[0] ?? ""}
                hint={hint}
                error={error}
              />
            );
          })}
        </fieldset>
      )}
    </ActionForm>
  );
}

export interface KitchenValues {
  locale: string;
  serves: { variant_id: string; label: string; min: string; max: string }[];
  in_box: string;
  not_included: string;
  use: string;
  care: string;
  dishwasher_safe: "" | "yes" | "no";
  manual_media_id: string;
}

/**
 * Thuộc tính đồ bếp có cấu trúc: số người ăn theo cỡ, trong hộp có gì và không kèm, dùng và chăm
 * sóc, tệp hướng dẫn (PDF trong thư viện media). Chữ theo ngôn ngữ đang chọn.
 */
export function KitchenForm({
  id,
  current,
  manuals,
  disabled,
}: {
  id: string;
  current: KitchenValues;
  manuals: Option[];
  disabled: boolean;
}) {
  const t = useTranslations("catalog.product.kitchen");
  return (
    <ActionForm
      action={saveKitchenAction}
      hidden={{ id, locale: current.locale }}
      submit={t("save")}
      done={t("saved")}
    >
      {(state) => (
        <fieldset disabled={disabled} className="cat-fs">
          <fieldset className="cat-serves">
            <legend className="lab">{t("serves")}</legend>
            <p className="fhint">{t("servesHint")}</p>
            {current.serves.map((row) => (
              <Labelled
                key={row.variant_id}
                label={row.label}
                error={state.fields?.[`serves.${row.variant_id}`]}
              >
                {(inputId, aria) => (
                  <span className="cat-range">
                    <input
                      id={inputId}
                      className="inp mono"
                      name={`serves.min.${row.variant_id}`}
                      inputMode="numeric"
                      defaultValue={row.min}
                      aria-label={t("min", { label: row.label })}
                      {...aria}
                    />
                    <span aria-hidden="true">–</span>
                    <input
                      className="inp mono"
                      name={`serves.max.${row.variant_id}`}
                      inputMode="numeric"
                      defaultValue={row.max}
                      aria-label={t("max", { label: row.label })}
                    />
                    <span className="muted">{t("people")}</span>
                  </span>
                )}
              </Labelled>
            ))}
          </fieldset>
          <div className="fld-row">
            <TextareaField
              label={t("inBox")}
              name="in_box"
              rows={4}
              defaultValue={current.in_box}
              hint={t("inBoxHint")}
              error={state.fields?.in_box}
            />
            <TextareaField
              label={t("notIncluded")}
              name="not_included"
              rows={4}
              defaultValue={current.not_included}
              hint={t("notIncludedHint")}
            />
          </div>
          <TextareaField label={t("use")} name="use" rows={3} defaultValue={current.use} />
          <TextareaField label={t("care")} name="care" rows={3} defaultValue={current.care} />
          <div className="fld-row">
            <SelectField
              label={t("dishwasher")}
              name="dishwasher_safe"
              defaultValue={current.dishwasher_safe}
              options={[
                { value: "", label: t("unknown") },
                { value: "yes", label: t("yes") },
                { value: "no", label: t("no") },
              ]}
            />
            <SelectField
              label={t("manual")}
              name="manual_media_id"
              defaultValue={current.manual_media_id}
              options={[
                { value: "", label: manuals.length > 0 ? t("noManual") : t("noDocuments") },
                ...manuals,
              ]}
              hint={t("manualHint")}
            />
          </div>
        </fieldset>
      )}
    </ActionForm>
  );
}

export interface TranslationValues {
  locale: string;
  name: string;
  slug: string;
  short_description: string;
  description: string;
  meta_title: string;
  meta_description: string;
  ai_assisted: boolean;
}

/** Nội dung và SEO của một ngôn ngữ; đếm ký tự của tiêu đề và mô tả SEO theo giới hạn hay dùng. */
export function TranslationForm({
  id,
  current,
  pathPrefix,
  disabled,
}: {
  id: string;
  current: TranslationValues;
  pathPrefix: string;
  disabled: boolean;
}) {
  const t = useTranslations("catalog.product.seo");
  const [slug, setSlug] = useState(current.slug);
  const [title, setTitle] = useState(current.meta_title);
  const [description, setDescription] = useState(current.meta_description);
  return (
    <ActionForm
      action={saveTranslationAction}
      hidden={{ id, locale: current.locale }}
      submit={t("save")}
      done={t("saved")}
    >
      {(state) => (
        <fieldset disabled={disabled} className="cat-fs">
          {current.ai_assisted ? (
            <span className="badge b-info cat-ai">{t("aiAssisted")}</span>
          ) : null}
          <Field
            label={t("name")}
            name="name"
            required
            defaultValue={value(state, "name", current.name)}
            error={state.fields?.name}
          />
          <Field
            label={t("slug")}
            name="slug"
            mono
            value={value(state, "slug", slug)}
            onChange={(event) => setSlug(event.target.value)}
            hint={t("slugHint", { path: `${pathPrefix}/${slug || "…"}` })}
            error={state.fields?.slug}
          />
          <TextareaField
            label={t("short")}
            name="short_description"
            rows={2}
            defaultValue={value(state, "short_description", current.short_description)}
          />
          <TextareaField
            label={t("description")}
            name="description"
            rows={5}
            defaultValue={value(state, "description", current.description)}
            hint={t("descriptionHint")}
          />
          <Field
            label={t("metaTitle")}
            name="meta_title"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            hint={t("counter", { count: title.length, max: 70 })}
            error={state.fields?.meta_title}
          />
          <TextareaField
            label={t("metaDescription")}
            name="meta_description"
            rows={2}
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            hint={t("counter", { count: description.length, max: 160 })}
            error={state.fields?.meta_description}
          />
          <figure className="cat-serp">
            <figcaption className="vh">{t("preview")}</figcaption>
            <span className="cat-serp-path mono">{`${pathPrefix}/${slug}`}</span>
            <b>{title || current.name}</b>
            <span>{description || current.short_description}</span>
          </figure>
        </fieldset>
      )}
    </ActionForm>
  );
}

export interface ImageValue {
  media_id: string;
  variant_id: string | null;
  alt: string;
  /** Tên tệp và công khai hay chưa (đọc thật từ `GET /media/{id}`); `null` khi không đọc được. */
  name: string | null;
  public: boolean;
}

/**
 * Ảnh của sản phẩm: chọn từ thư viện media thật (bộ chọn ảnh dùng chung với trình soạn bài, tải
 * ảnh mới ngay tại chỗ), alt theo ngôn ngữ mặc định, gắn với một biến thể, đổi thứ tự. Lưu cả danh
 * sách một lần (`PUT /products/{id}/media`). Ảnh sản phẩm phải công khai.
 */
export function MediaEditor({
  id,
  initial,
  variants,
  context,
  media,
  disabled,
}: {
  id: string;
  initial: ImageValue[];
  variants: Option[];
  context: string;
  media: { available: boolean; canUpload: boolean; aiAlt: boolean };
  disabled: boolean;
}) {
  const t = useTranslations("catalog.product.images");
  const toast = useToast();
  const [images, setImages] = useState<ImageValue[]>(initial);
  const [picking, setPicking] = useState(false);
  const [state, run, pending] = useActionState<FormState, FormData>(saveMediaAction, {});
  useOnDone(state.done, () => toast(t("saved")));
  const update = (index: number, change: Partial<ImageValue>) =>
    setImages((list) => list.map((image, i) => (i === index ? { ...image, ...change } : image)));
  const shift = (index: number, by: number) =>
    setImages((list) => {
      const next = [...list];
      const [item] = next.splice(index, 1);
      if (item) next.splice(Math.max(0, Math.min(next.length, index + by)), 0, item);
      return next;
    });
  return (
    <form action={run} className="card padded dlg-form">
      <input type="hidden" name="id" value={id} />
      <input
        type="hidden"
        name="media"
        value={JSON.stringify(
          images.map(({ media_id, variant_id, alt, public: open }) => ({
            media_id,
            variant_id,
            alt,
            public: open,
          })),
        )}
      />
      {images.length === 0 ? <p className="empty">{t("empty")}</p> : null}
      <ul className="cat-images">
        {images.map((image, index) => (
          <li key={image.media_id} className="cat-image">
            {/* biome-ignore lint/performance/noImgElement: ảnh đi qua route `/media/…` của giao diện (kèm phiên) */}
            <img src={mediaIdSrc(image.media_id)} alt={image.alt} />
            <div className="cat-image-main">
              <span className="fhint mono">
                {index === 0 ? <span className="badge b-ok">{t("cover")}</span> : null}{" "}
                {image.name ?? image.media_id}
                {image.public ? null : <span className="badge b-warn">{t("private")}</span>}
              </span>
              <Field
                label={t("alt")}
                name={`alt-${index}`}
                value={image.alt}
                onChange={(event) => update(index, { alt: event.target.value })}
                hint={t("altHint")}
                disabled={disabled}
              />
              <SelectField
                label={t("variant")}
                name={`variant-${index}`}
                value={image.variant_id ?? ""}
                onChange={(event) => update(index, { variant_id: event.target.value || null })}
                options={[{ value: "", label: t("allVariants") }, ...variants]}
                disabled={disabled}
              />
              {disabled ? null : (
                <span className="row-acts start">
                  <button
                    type="button"
                    className="btn sm"
                    disabled={index === 0}
                    onClick={() => shift(index, -1)}
                    aria-label={t("up")}
                  >
                    <Icon name="up" />
                  </button>
                  <button
                    type="button"
                    className="btn sm"
                    disabled={index === images.length - 1}
                    onClick={() => shift(index, 1)}
                    aria-label={t("down")}
                  >
                    <Icon name="down" />
                  </button>
                  <button
                    type="button"
                    className="btn sm danger"
                    onClick={() => setImages((list) => list.filter((_, i) => i !== index))}
                  >
                    {t("remove")}
                  </button>
                </span>
              )}
            </div>
          </li>
        ))}
      </ul>
      {disabled ? null : (
        <div className="role-foot">
          <FormAlert state={state} />
          {media.available ? (
            <button type="button" className="btn" onClick={() => setPicking(true)}>
              <Icon name="image" />
              {t("add")}
            </button>
          ) : (
            <span className="fhint">{t("unavailable")}</span>
          )}
          <button type="submit" className="btn pri" disabled={pending}>
            {t("save")}
          </button>
        </div>
      )}
      <p className="fhint">{t("publicHint")}</p>
      {picking ? (
        <MediaPicker
          title={t("pickTitle")}
          locale="vi"
          context={context}
          aiEnabled={media.aiAlt}
          canUpload={media.canUpload}
          onClose={() => setPicking(false)}
          onPick={(picked) =>
            setImages((list) =>
              list.some((m) => m.media_id === picked.item.id)
                ? list
                : [
                    ...list,
                    {
                      media_id: picked.item.id,
                      variant_id: null,
                      alt: picked.alt,
                      name: picked.item.name,
                      public: picked.item.visibility === "public",
                    },
                  ],
            )
          }
        />
      ) : null}
    </form>
  );
}
