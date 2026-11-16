"use server";

import type { components } from "@autoxide/sdk";
import { routing } from "@/i18n/routing";
import { formToken } from "./antispam-actions";
import { publicClient, visitorChain } from "./core";
import { isProblem } from "./problem";

// Gửi một biểu mẫu công khai của core (`POST /api/v1/forms/public/{key}/submissions`, module `forms`
// có thật). Trang "Bán trên sàn" dùng biểu mẫu có khoá `ban-tren-cho` khi khách đã tạo nó trong trang
// quản trị (W-030). Core kiểm từng trường và trả `detail` đã dịch; website chỉ hiện lại.

type SubmitRequest = components["schemas"]["SubmitRequest"];

export interface PublicFormState {
  status: "idle" | "ok" | "error";
  message: string;
  /** Lỗi theo trường (`errors[]` của Problem), `detail` do core dịch. */
  fields: { field: string; detail: string }[];
}

export interface FieldSpec {
  key: string;
  type: string;
}

const locales = routing.locales as readonly string[];

export async function submitPublicForm(
  _: PublicFormState,
  form: FormData,
): Promise<PublicFormState> {
  const key = String(form.get("form_key") ?? "");
  const raw = String(form.get("locale") ?? "");
  const locale = locales.includes(raw) ? raw : routing.defaultLocale;
  if (!/^[a-z0-9-]{1,64}$/.test(key)) return { status: "error", message: "", fields: [] };
  let specs: FieldSpec[] = [];
  try {
    specs = (JSON.parse(String(form.get("form_fields") ?? "[]")) as FieldSpec[]).slice(0, 100);
  } catch {
    specs = [];
  }
  const data: Record<string, unknown> = {};
  for (const spec of specs) {
    const name = `f_${spec.key}`;
    if (spec.type === "checkbox") {
      const values = form.getAll(name).map(String);
      if (values.length > 0) data[spec.key] = values;
    } else if (spec.type === "consent") {
      if (form.get(name) === "on") data[spec.key] = true;
    } else if (spec.type === "number") {
      const value = String(form.get(name) ?? "").trim();
      if (value) data[spec.key] = Number(value);
    } else {
      const value = String(form.get(name) ?? "").trim();
      if (value) data[spec.key] = value.slice(0, 10_000);
    }
  }
  const token =
    String(form.get("form_token") ?? "") ||
    (await formToken(String(form.get("token_scope") ?? `forms:${key}`), locale)) ||
    null;
  try {
    const { data: body, error } = await publicClient(locale, await visitorChain()).POST(
      "/api/v1/forms/public/{key}/submissions",
      {
        params: { path: { key } },
        body: {
          // Kiểu sinh từ `openapi.json` coi `data` là object không có trường nào khai sẵn (trường do
          // biểu mẫu quyết lúc chạy); giá trị đã đúng hình dạng core nhận (chuỗi, số, mảng, `true`).
          data: data as SubmitRequest["data"],
          form_token: token,
          locale,
          trap: String(form.get("trap") ?? "") || null,
          page_url: String(form.get("page_url") ?? "").slice(0, 2000) || null,
        },
      },
    );
    if (body) return { status: "ok", message: body.data.message, fields: [] };
    if (isProblem(error)) {
      return {
        status: "error",
        message: error.detail,
        fields: (error.errors ?? []).map((e) => ({
          field: e.field.replace(/^data\./, ""),
          detail: e.detail,
        })),
      };
    }
    return { status: "error", message: "", fields: [] };
  } catch {
    return { status: "error", message: "", fields: [] };
  }
}
