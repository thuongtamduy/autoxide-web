"use client";

import { useTranslations } from "next-intl";
import type { ReactNode } from "react";
import { pickText } from "@/lib/engage";
import { type FieldDraft, type FieldType, parseOptions } from "@/lib/forms";

export type PreviewLang = "vi" | "en";

/** Kiểu ô của trình duyệt cho từng loại trường chữ (loại khác có cách vẽ riêng). */
const INPUT_TYPE: Partial<Record<FieldType, string>> = {
  text: "text",
  email: "email",
  phone: "tel",
  number: "number",
  date: "date",
};

/**
 * Xem trước biểu mẫu như người xem thấy trên website: đúng thứ tự, nhãn, gợi ý, chữ mờ và lựa chọn
 * của các trường đang soạn, theo một ngôn ngữ (thiếu thì lấy ngôn ngữ kia). Ô nhập bị khoá và không
 * có `name` nên không lẫn vào dữ liệu gửi đi. Cả tấm `aria-hidden`: nội dung đã có ở các thẻ trường
 * bên trái, người dùng trình đọc màn hình không phải nghe hai lần.
 */
export function FormPreview({
  name,
  fields,
  lang,
  success,
  closed,
}: {
  name: string;
  fields: readonly FieldDraft[];
  lang: PreviewLang;
  success: string;
  closed: boolean;
}) {
  const t = useTranslations("engage.forms.editor");
  const visible = fields.filter((field) => field.type !== "hidden");
  const hidden = fields.filter((field) => field.type === "hidden");
  return (
    <div className="fb-sheet" aria-hidden="true" data-testid="form-preview">
      <h3 className="fb-sheet-title">{name.trim() || t("untitledForm")}</h3>
      {closed ? <p className="fb-sheet-closed">{t("previewClosed")}</p> : null}
      {fields.length === 0 ? <p className="fb-sheet-empty">{t("previewEmpty")}</p> : null}
      {visible.map((field, index) => (
        <PreviewField
          // Thứ tự là danh tính duy nhất ở đây (khoá có thể trùng / trống khi đang soạn).
          // biome-ignore lint/suspicious/noArrayIndexKey: bản xem trước không giữ trạng thái riêng
          key={index}
          field={field}
          lang={lang}
          untitled={t("untitled")}
          choose={t("previewChoose")}
          noOptions={t("previewNoOptions")}
        />
      ))}
      {hidden.map((field, index) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: như trên
        <p key={index} className="fb-sheet-hidden">
          {t("previewHidden", { key: field.key || "…" })}
        </p>
      ))}
      {fields.length > 0 ? (
        <div>
          <button type="button" className="btn pri" disabled tabIndex={-1}>
            {t("previewSubmit")}
          </button>
        </div>
      ) : null}
      {success.trim() ? (
        <p className="fb-sheet-success">{t("previewSuccess", { text: success.trim() })}</p>
      ) : null}
    </div>
  );
}

function PreviewField({
  field,
  lang,
  untitled,
  choose,
  noOptions,
}: {
  field: FieldDraft;
  lang: PreviewLang;
  untitled: string;
  choose: string;
  noOptions: string;
}) {
  const label = pickText({ vi: field.labelVi, en: field.labelEn }, lang) || field.key || untitled;
  const help = pickText({ vi: field.helpVi, en: field.helpEn }, lang);
  const placeholder = pickText({ vi: field.placeholderVi, en: field.placeholderEn }, lang);
  const options = parseOptions(field.options).map((option) => ({
    value: option.value,
    label: (option.label && pickText(option.label, lang)) || option.value,
  }));
  const mark = field.required ? <span className="fb-sheet-req">*</span> : null;

  // Ô đồng ý: một ô tích, văn bản đồng ý đứng cạnh.
  if (field.type === "consent") {
    return (
      <div className="fb-sheet-fld">
        <span className="fb-sheet-check">
          <input type="checkbox" disabled tabIndex={-1} />
          <span>
            {label}
            {mark}
          </span>
        </span>
        {help ? <span className="fb-sheet-help">{help}</span> : null}
      </div>
    );
  }

  let control: ReactNode;
  if (field.type === "textarea") {
    control = (
      <textarea className="inp area" rows={3} disabled tabIndex={-1} placeholder={placeholder} />
    );
  } else if (field.type === "select") {
    control = (
      <select className="inp" disabled tabIndex={-1} defaultValue="">
        <option value="">{placeholder || choose}</option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    );
  } else if (field.type === "radio" || field.type === "checkbox") {
    control =
      options.length === 0 ? (
        <span className="fb-sheet-help">{noOptions}</span>
      ) : (
        <span className="fb-sheet-opts">
          {options.map((option) => (
            <span key={option.value} className="fb-sheet-check">
              <input type={field.type} disabled tabIndex={-1} />
              <span>{option.label}</span>
            </span>
          ))}
        </span>
      );
  } else {
    control = (
      <input
        className="inp"
        type={INPUT_TYPE[field.type] ?? "text"}
        disabled
        tabIndex={-1}
        placeholder={placeholder}
      />
    );
  }
  return (
    <div className="fb-sheet-fld">
      <span className="fb-sheet-lab">
        {label}
        {mark}
      </span>
      {control}
      {help ? <span className="fb-sheet-help">{help}</span> : null}
    </div>
  );
}
