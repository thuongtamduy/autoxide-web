// Phần thuần của màn Biểu mẫu (module `forms` của core): trường của form ở dạng sửa được trên giao
// diện và đổi qua lại với hình dạng core nhận, tóm tắt một bài nộp cho bảng, gắn lỗi của core vào
// đúng trường. Dùng được cả ở máy chủ lẫn trình duyệt.
import type { components } from "@autoxide/sdk";
import { excerpt, pickText } from "./engage";

type Schemas = components["schemas"];
export type Form = Schemas["FormResponse"];
export type FormField = Schemas["Field"];
export type FieldType = Schemas["FieldType"];
export type Submission = Schemas["SubmissionResponse"];
export type SubmissionStatus = Schemas["SubmissionStatus"];

/** Danh sách đóng của core, theo thứ tự hay dùng. */
export const FIELD_TYPES: readonly FieldType[] = [
  "text",
  "email",
  "phone",
  "textarea",
  "number",
  "select",
  "radio",
  "checkbox",
  "date",
  "hidden",
  "consent",
];

/** Kiểu có danh sách lựa chọn. */
export const CHOICE_TYPES: readonly FieldType[] = ["select", "radio", "checkbox"];
/** Kiểu có giới hạn số ký tự. */
export const LENGTH_TYPES: readonly FieldType[] = ["text", "textarea", "hidden"];

export const SUBMISSION_STATUSES: readonly SubmissionStatus[] = ["new", "read", "archived", "spam"];

export const SUBMISSION_BADGE: Record<SubmissionStatus, string> = {
  new: "badge b-info",
  read: "badge b-draft",
  archived: "badge b-arch",
  spam: "badge b-bad",
};

/** Trạng thái có thể chuyển tới từ một trạng thái, theo thứ tự nút trên màn. */
export function submissionMoves(status: SubmissionStatus): SubmissionStatus[] {
  switch (status) {
    case "new":
      return ["read", "archived", "spam"];
    case "read":
      return ["new", "archived", "spam"];
    case "archived":
      return ["read", "spam"];
    case "spam":
      return ["new"];
  }
}

/**
 * Một trường ở dạng ô nhập của trình sửa: mọi giá trị là chữ, hai ngôn ngữ tách ô, lựa chọn là
 * một ô nhiều dòng `giá trị | nhãn tiếng Việt | nhãn tiếng Anh`.
 */
export interface FieldDraft {
  key: string;
  type: FieldType;
  labelVi: string;
  labelEn: string;
  helpVi: string;
  helpEn: string;
  placeholderVi: string;
  placeholderEn: string;
  required: boolean;
  minLength: string;
  maxLength: string;
  min: string;
  max: string;
  options: string;
}

export function emptyField(type: FieldType = "text"): FieldDraft {
  return {
    key: "",
    type,
    labelVi: "",
    labelEn: "",
    helpVi: "",
    helpEn: "",
    placeholderVi: "",
    placeholderEn: "",
    required: false,
    minLength: "",
    maxLength: "",
    min: "",
    max: "",
    options: "",
  };
}

/**
 * Ba trường có sẵn của một form mới (họ tên, email, lời nhắn), nhãn hai ngôn ngữ. Là nội dung
 * mặc định của form (người dùng sửa được), không phải chữ của giao diện.
 */
export const STARTER_FIELDS: readonly FieldDraft[] = [
  { ...emptyField("text"), key: "name", labelVi: "Họ tên", labelEn: "Name", required: true },
  { ...emptyField("email"), key: "email", labelVi: "Email", labelEn: "Email", required: true },
  {
    ...emptyField("textarea"),
    key: "message",
    labelVi: "Lời nhắn",
    labelEn: "Message",
    required: true,
  },
];

function localized(vi: string, en: string): Schemas["Localized"] | null {
  const v = vi.trim();
  const e = en.trim();
  if (!v && !e) return null;
  return { ...(v ? { vi: v } : {}), ...(e ? { en: e } : {}) };
}

function integer(text: string): number | null {
  const value = text.trim();
  return /^-?\d+$/.test(value) ? Number(value) : null;
}

function decimal(text: string): number | null {
  const value = text.trim().replace(",", ".");
  return value !== "" && Number.isFinite(Number(value)) ? Number(value) : null;
}

/** Ô lựa chọn thành danh sách của core; dòng trống bỏ qua, nhãn trống thì core lấy giá trị. */
export function parseOptions(text: string): Schemas["FieldOption"][] {
  return text
    .split(/\r?\n/)
    .map((line) => line.split("|").map((part) => part.trim()))
    .filter(([value]) => Boolean(value))
    .map(([value = "", vi = "", en = ""]) => {
      const label = localized(vi, en);
      return label ? { value, label } : { value };
    });
}

function optionsText(options: readonly Schemas["FieldOption"][] | undefined): string {
  return (options ?? [])
    .map((option) => {
      const vi = option.label?.vi ?? "";
      const en = option.label?.en ?? "";
      if (!vi && !en) return option.value;
      return en ? `${option.value} | ${vi} | ${en}` : `${option.value} | ${vi}`;
    })
    .join("\n");
}

/**
 * Trường của trình sửa thành `Field` của core. Chỉ gửi thứ hợp với kiểu (vd lựa chọn chỉ cho
 * select / radio / checkbox); core vẫn kiểm lại mọi thứ và báo mọi lỗi một lần.
 */
export function fieldToCore(draft: FieldDraft): FormField {
  const field: FormField = {
    key: draft.key.trim(),
    type: draft.type,
    label: localized(draft.labelVi, draft.labelEn) ?? {},
    required: draft.required,
  };
  const help = localized(draft.helpVi, draft.helpEn);
  if (help) field.help = help;
  const placeholder = localized(draft.placeholderVi, draft.placeholderEn);
  if (placeholder && draft.type !== "consent" && draft.type !== "hidden") {
    field.placeholder = placeholder;
  }
  if (LENGTH_TYPES.includes(draft.type)) {
    const minLength = integer(draft.minLength);
    const maxLength = integer(draft.maxLength);
    if (minLength !== null) field.min_length = minLength;
    if (maxLength !== null) field.max_length = maxLength;
  }
  if (draft.type === "number") {
    const min = decimal(draft.min);
    const max = decimal(draft.max);
    if (min !== null) field.min = min;
    if (max !== null) field.max = max;
  }
  if (CHOICE_TYPES.includes(draft.type)) {
    field.options = parseOptions(draft.options);
  }
  return field;
}

/** `Field` của core thành trường của trình sửa (để sửa form đã có). */
export function fieldFromCore(field: FormField): FieldDraft {
  const text = (value: number | null | undefined) =>
    value === null || value === undefined ? "" : String(value);
  return {
    key: field.key,
    type: field.type,
    labelVi: field.label.vi ?? "",
    labelEn: field.label.en ?? "",
    helpVi: field.help?.vi ?? "",
    helpEn: field.help?.en ?? "",
    placeholderVi: field.placeholder?.vi ?? "",
    placeholderEn: field.placeholder?.en ?? "",
    required: field.required ?? false,
    minLength: text(field.min_length),
    maxLength: text(field.max_length),
    min: text(field.min),
    max: text(field.max),
    options: optionsText(field.options),
  };
}

/** Khoá gợi ý từ nhãn: không dấu, chữ thường, `_` thay khoảng trắng (luật khoá của core). */
export function suggestKey(label: string): string {
  const key = label
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/đ/gi, "d")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 64);
  return /^[a-z]/.test(key) ? key : key ? `f_${key}`.slice(0, 64) : "";
}

/** Mã form gợi ý từ tên (luật của core: chữ thường và số, nhóm nối bằng `-`, tối đa 50). */
export function suggestFormKey(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/đ/gi, "d")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 50)
    .replace(/-+$/g, "");
}

/** Lỗi của trường thứ `index` (`fields[2].options` → "options"), theo tên thuộc tính. */
export function fieldErrors(
  errors: Record<string, string> | undefined,
  index: number,
): Record<string, string> {
  const prefix = `fields[${index}]`;
  const found: Record<string, string> = {};
  for (const [path, detail] of Object.entries(errors ?? {})) {
    if (path === prefix) found._ ??= detail;
    else if (path.startsWith(`${prefix}.`)) {
      // `fields[2].options[1].value` → `options`; `fields[0].label.vi` → `label`.
      const name = path.slice(prefix.length + 1).split(/[.[]/)[0] ?? "_";
      found[name] ??= detail;
    }
  }
  return found;
}

/**
 * Giá trị của một câu trả lời thành chữ để hiện. Câu trả lời lựa chọn lưu `value`; nhãn của lựa
 * chọn lấy từ trường cùng khoá của form hiện tại (`field`) nếu còn, không thì hiện `value`.
 */
export function answerText(
  answer: Schemas["AnswerResponse"],
  labels: { yes: string; no: string },
  field?: FormField,
  locale = "vi",
): string {
  const value = answer.value as unknown;
  if (value === null || value === undefined || value === "") return "—";
  const named = (v: unknown) => {
    const option = field?.options?.find((o) => o.value === String(v));
    return (option?.label && pickText(option.label, locale)) || String(v);
  };
  if (Array.isArray(value)) return value.map(named).join(", ");
  if (value === true) return labels.yes;
  if (value === false) return labels.no;
  return CHOICE_TYPES.includes(answer.type) ? named(value) : String(value);
}

/**
 * Tóm tắt một bài nộp cho bảng: người gửi (câu trả lời chữ ngắn đầu tiên, thường là họ tên;
 * không có thì email), dòng phụ (email khi đã có tên) và nội dung (câu trả lời chữ dài nhất).
 */
export function submissionSummary(submission: Submission): {
  who: string;
  sub: string;
  text: string;
} {
  const texts = submission.answers.filter(
    (a) => typeof a.value === "string" && (a.value as string).trim() !== "",
  );
  const named = texts.find((a) => a.type === "text");
  const longest = texts
    .filter((a) => a.type !== "email" && a !== named)
    .sort((a, b) => String(b.value).length - String(a.value).length)[0];
  const name = named ? excerpt(String(named.value), 60) : "";
  return {
    who: name || submission.email || "—",
    sub: name && submission.email ? submission.email : "",
    text: longest ? excerpt(String(longest.value), 140) : "",
  };
}

/**
 * Hạn lưu của form thành chữ: `null` theo cấu hình chung của máy chủ
 * (`AUTOXIDE_FORMS_RETENTION_DAYS`), 0 giữ tới khi xoá. `t` là bộ dịch `engage.forms`.
 */
export function retention(
  days: number | null | undefined,
  t: (
    key: "retentionDefault" | "retentionKeep" | "retentionDays",
    values?: { days: number },
  ) => string,
): string {
  if (days === null || days === undefined) return t("retentionDefault");
  if (days === 0) return t("retentionKeep");
  return t("retentionDays", { days });
}

/** Nhãn của một trường theo ngôn ngữ giao diện, không có thì khoá. */
export function fieldLabel(field: { key: string; label: Schemas["Localized"] }, locale: string) {
  return pickText(field.label, locale) || field.key;
}
