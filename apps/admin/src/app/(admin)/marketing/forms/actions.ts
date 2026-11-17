"use server";

// Server Action của màn Biểu mẫu, gọi module `forms` của core bằng token trong cookie `httpOnly`.
// Core kiểm quyền và dữ liệu (mọi lỗi của định nghĩa form báo một lần, đường dẫn kiểu
// `fields[2].options`); ở đây chỉ kiểm ô bắt buộc để báo sớm. Lệnh sửa gửi `If-Match` (core bắt
// buộc), qua `versioned`: bản ghi đã đổi kể từ lúc mở trang thì báo, không ghi đè.
import type { components } from "@autoxide/sdk";
import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { z } from "zod";
import { send } from "@/lib/action";
import { type DataState, lines } from "@/lib/engage";
import {
  type ChangeState,
  field,
  integerField,
  nestedProblemState,
  versioned,
} from "@/lib/engage-server";
import { type FormState, nextDone, problemState } from "@/lib/form";
import { type FieldDraft, fieldToCore, SUBMISSION_STATUSES } from "@/lib/forms";
import { currentUnit } from "@/lib/org-server";

type Schemas = components["schemas"];

const FORMS = "/marketing/forms";

const Draft = z.object({
  key: z.string(),
  type: z.enum([
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
  ]),
  labelVi: z.string(),
  labelEn: z.string(),
  helpVi: z.string(),
  helpEn: z.string(),
  placeholderVi: z.string(),
  placeholderEn: z.string(),
  required: z.boolean(),
  minLength: z.string(),
  maxLength: z.string(),
  min: z.string(),
  max: z.string(),
  options: z.string(),
});

const TOP = [
  "name",
  "key",
  "status",
  "retention_days",
  "notify_emails",
  "reply_to_field",
  "allowed_origins",
  "ip_limit_per_hour",
  "email_limit_per_hour",
  "success_message",
  "fields",
];

/** Mã đã có form khác dùng: lỗi nằm dưới ô "Mã". */
const KEY_TAKEN = { "forms.key_taken": "key" };

/** Trạng thái của trình sửa form: thêm giá trị đã gõ để điền lại khi core báo lỗi. */
export interface FormEditorState extends FormState {
  /** Trường đã gửi, để trình sửa không mất thẻ nào khi core báo lỗi. */
  drafts?: FieldDraft[];
}

function readDrafts(formData: FormData): FieldDraft[] | null {
  try {
    const parsed = z.array(Draft).safeParse(JSON.parse(field(formData, "fields") || "[]"));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

/** Phần chung của tạo và sửa: đọc ô, gom lỗi bắt buộc, dựng thân request. */
async function readForm(formData: FormData): Promise<
  | {
      ok: true;
      body: Schemas["CreateFormRequest"];
      drafts: FieldDraft[];
    }
  | { ok: false; state: FormEditorState }
> {
  const t = await getTranslations("engage.forms.required");
  const drafts = readDrafts(formData) ?? [];
  const errors: Record<string, string> = {};
  const name = field(formData, "name");
  const key = field(formData, "key");
  if (!name) errors.name = t("name");
  if (!key) errors.key = t("key");
  if (drafts.length === 0) errors.fields = t("fields");
  const numbers: Record<string, number | null> = {};
  for (const name of ["retention_days", "ip_limit_per_hour", "email_limit_per_hour"]) {
    const value = integerField(formData, name);
    if (value === undefined) errors[name] = t("number");
    else numbers[name] = value;
  }
  drafts.forEach((draft, index) => {
    if (!draft.key.trim()) errors[`fields[${index}].key`] = t("fieldKey");
    if (!draft.labelVi.trim() && !draft.labelEn.trim()) {
      errors[`fields[${index}].label`] = t("fieldLabel");
    }
  });
  if (Object.keys(errors).length > 0) {
    return { ok: false, state: { fields: errors, drafts } };
  }
  const successVi = field(formData, "success_vi");
  const successEn = field(formData, "success_en");
  const replyTo = field(formData, "reply_to_field");
  const status = field(formData, "status") === "closed" ? "closed" : "open";
  return {
    ok: true,
    drafts,
    body: {
      name,
      key,
      status,
      fields: drafts.map(fieldToCore),
      notify_emails: lines(field(formData, "notify_emails")),
      allowed_origins: lines(field(formData, "allowed_origins")),
      reply_to_field: replyTo || null,
      retention_days: numbers.retention_days ?? null,
      ip_limit_per_hour: numbers.ip_limit_per_hour ?? null,
      email_limit_per_hour: numbers.email_limit_per_hour ?? null,
      success_message: {
        ...(successVi ? { vi: successVi } : {}),
        ...(successEn ? { en: successEn } : {}),
      },
    },
  };
}

/** Tạo form; xong thì mở trang của form. */
export async function createForm(
  _state: FormEditorState,
  formData: FormData,
): Promise<FormEditorState> {
  const input = await readForm(formData);
  if (!input.ok) return input.state;
  // Form mới thuộc nút đang chọn ở góc trên trái; không chọn thì là form của cả khách.
  const unit = await currentUnit();
  const result = await send((client) =>
    client.POST("/api/v1/forms", { body: { ...input.body, ...(unit ? { org_id: unit.id } : {}) } }),
  );
  if (!result.ok) {
    return {
      ...nestedProblemState(result.problem, TOP, ["fields["], KEY_TAKEN),
      drafts: input.drafts,
    };
  }
  redirect(`${FORMS}/${result.data.data.id}?created=1`);
}

/** Sửa form (`If-Match`). Đổi trường thì core tạo phiên bản mới; bài cũ giữ nhãn cũ. */
export async function updateForm(
  _state: FormEditorState,
  formData: FormData,
): Promise<FormEditorState> {
  const input = await readForm(formData);
  if (!input.ok) return input.state;
  const id = field(formData, "id");
  const result = await versioned(
    (client) => client.GET("/api/v1/forms/{id}", { params: { path: { id } } }),
    field(formData, "expect"),
    (client, etag) =>
      client.PATCH("/api/v1/forms/{id}", {
        params: { path: { id }, header: { "If-Match": etag } },
        body: input.body,
      }),
  );
  if (!result.ok) {
    return {
      ...nestedProblemState(result.problem, TOP, ["fields["], KEY_TAKEN),
      drafts: input.drafts,
    };
  }
  redirect(`${FORMS}/${id}?saved=1`);
}

/** Đóng hay mở lại form. Đảo được: trả trạng thái cũ để nút Hoàn tác dùng. */
export async function setFormStatus(state: ChangeState, formData: FormData): Promise<ChangeState> {
  const id = field(formData, "id");
  const status = field(formData, "status") === "closed" ? "closed" : "open";
  const result = await versioned(
    (client) => client.GET("/api/v1/forms/{id}", { params: { path: { id } } }),
    field(formData, "expect"),
    (client, etag) =>
      client.PATCH("/api/v1/forms/{id}", {
        params: { path: { id }, header: { "If-Match": etag } },
        body: { status },
      }),
  );
  if (!result.ok) return problemState(result.problem, []);
  refresh();
  return {
    done: nextDone(state),
    updated: result.data.data.updated_at,
    previous: result.before.status,
  };
}

/** Xoá form cùng mọi bài nộp của nó; về danh sách. */
export async function deleteForm(_state: FormState, formData: FormData): Promise<FormState> {
  const id = field(formData, "id");
  const result = await versioned(
    (client) => client.GET("/api/v1/forms/{id}", { params: { path: { id } } }),
    field(formData, "expect"),
    (client, etag) =>
      client.DELETE("/api/v1/forms/{id}", {
        params: { path: { id }, header: { "If-Match": etag } },
      }),
  );
  if (!result.ok) return problemState(result.problem, []);
  redirect(`${FORMS}?deleted=1`);
}

/** Đổi trạng thái một bài nộp (đọc, lưu trữ, spam, mới). Đảo được. */
export async function setSubmissionStatus(
  state: ChangeState,
  formData: FormData,
): Promise<ChangeState> {
  const id = field(formData, "id");
  const status = SUBMISSION_STATUSES.find((s) => s === field(formData, "status"));
  if (!status) return { error: (await getTranslations("engage"))("badRequest") };
  const result = await versioned(
    (client) => client.GET("/api/v1/forms/submissions/{id}", { params: { path: { id } } }),
    field(formData, "expect"),
    (client, etag) =>
      client.PATCH("/api/v1/forms/submissions/{id}", {
        params: { path: { id }, header: { "If-Match": etag } },
        body: { status },
      }),
  );
  if (!result.ok) return problemState(result.problem, []);
  refresh();
  return {
    done: nextDone(state),
    updated: result.data.data.updated_at,
    previous: result.before.status,
  };
}

/** Xoá hẳn một bài nộp; về trang của form. */
export async function deleteSubmission(_state: FormState, formData: FormData): Promise<FormState> {
  const id = field(formData, "id");
  const form = field(formData, "form");
  const result = await send((client) =>
    client.DELETE("/api/v1/forms/submissions/{id}", { params: { path: { id } } }),
  );
  if (!result.ok) return problemState(result.problem, []);
  redirect(`${FORMS}/${encodeURIComponent(form)}?removed=1`);
}

// ---------------------------------------------------------------- Dữ liệu theo email

/** Tra mọi bài nộp có email này (yêu cầu của chủ dữ liệu). */
export async function lookupFormsData(state: DataState, formData: FormData): Promise<DataState> {
  const email = field(formData, "email");
  if (!email) {
    const t = await getTranslations("engage.data");
    return { fields: { email: t("emailRequired") } };
  }
  const result = await send((client) =>
    client.GET("/api/v1/forms/data", { params: { query: { email } } }),
  );
  if (!result.ok) return { ...problemState(result.problem, ["email"]), values: { email } };
  return { done: nextDone(state), email, found: result.data.data };
}

/** Xoá hẳn mọi bài nộp có email này. */
export async function eraseFormsData(state: DataState, formData: FormData): Promise<DataState> {
  const email = field(formData, "email");
  const result = await send((client) =>
    client.DELETE("/api/v1/forms/data", { params: { query: { email } } }),
  );
  // Core trả số bài đã xoá; trang tra lại ngay sau đó nên không cần giữ.
  if (!result.ok) return problemState(result.problem, []);
  refresh();
  return { done: nextDone(state), email };
}

// ---------------------------------------------------------------- Xuất CSV chạy nền

export type FormExport = components["schemas"]["ExportResponse"];

/**
 * Xuất bài nộp chạy nền (core: `POST /forms/{id}/submissions/exports`, cần `forms.export`) cho form nhiều
 * bài nộp. Core chỉ cho một lượt xuất chưa xong mỗi form (409 `forms.export_in_progress`).
 */
export async function startFormExport(
  formId: string,
  status: string,
): Promise<
  { ok: true; data: FormExport } | { ok: false; problem: components["schemas"]["Problem"] }
> {
  if (!z.uuid().safeParse(formId).success) return badRequest();
  const wanted = SUBMISSION_STATUSES.find((s) => s === status);
  const result = await send((client) =>
    client.POST("/api/v1/forms/{id}/submissions/exports", {
      params: { path: { id: formId } },
      body: wanted ? { status: wanted } : {},
    }),
  );
  return result.ok ? { ok: true, data: result.data.data } : result;
}

/** Trạng thái một lượt xuất (`pending`, `running`, `ready`, `failed`); hỏi lại vài giây một lần. */
export async function readFormExport(
  exportId: string,
): Promise<
  { ok: true; data: FormExport } | { ok: false; problem: components["schemas"]["Problem"] }
> {
  if (!z.uuid().safeParse(exportId).success) return badRequest();
  const result = await send((client) =>
    client.GET("/api/v1/forms/exports/{export_id}", { params: { path: { export_id: exportId } } }),
  );
  return result.ok ? { ok: true, data: result.data.data } : result;
}

function badRequest(): { ok: false; problem: components["schemas"]["Problem"] } {
  return {
    ok: false,
    problem: {
      type: "about:blank",
      title: "Bad Request",
      status: 400,
      code: "invalid_request",
      detail: "The request is not valid.",
    },
  };
}
