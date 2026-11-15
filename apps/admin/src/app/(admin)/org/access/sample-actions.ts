"use server";

// Server Action cho các tab dùng dữ liệu mẫu (W-006): lời mời, uỷ quyền, hồ sơ công khai, quyền
// vào hỗ trợ. Gọi hàm mẫu của `src/sample/org.ts` thay cho API của bước 34 của core; cùng cách
// trả lỗi (Problem → lỗi theo ô) như phần gọi core thật, để khi có API chỉ thay lời gọi.
import type { Problem } from "@autoxide/sdk";
import { refresh } from "next/cache";
import { getTranslations } from "next-intl/server";
import { z } from "zod";
import { type FormState, nextDone, parseForm, problemState } from "@/lib/form";
import { sampleDataEnabled } from "@/sample";
import {
  createDelegation,
  createInvitation,
  type Ref,
  resendInvitation,
  revokeDelegation,
  revokeInvitation,
  revokeSupportGrant,
  type SampleOutcome,
  setSupportAccess,
  updateProfile,
} from "@/sample/org";

async function required(): Promise<{ fallback: string; messages: Record<string, string> }> {
  const t = await getTranslations("access.required");
  return {
    fallback: t("field"),
    messages: {
      email: t("email"),
      org_id: t("org"),
      reason: t("reason"),
      display_name: t("display_name"),
    },
  };
}

function typed(formData: FormData, names: readonly string[]): Record<string, string> {
  return Object.fromEntries(names.map((name) => [name, String(formData.get(name) ?? "")]));
}

/** Tắt dữ liệu mẫu thì không ghi gì (trang cũng không hiện các tab này). */
async function guard(): Promise<FormState | null> {
  if (sampleDataEnabled()) return null;
  const t = await getTranslations("sample");
  return { error: t("off"), code: "sample_data_off" };
}

/** `role` gửi lên dạng `id|name` (role thật của core, tên để hiện trong bản ghi mẫu). */
function refs(values: readonly FormDataEntryValue[]): Ref[] {
  return values.map(String).map((value) => {
    const bar = value.indexOf("|");
    return bar > 0
      ? { id: value.slice(0, bar), name: value.slice(bar + 1) }
      : { id: value, name: value };
  });
}

/**
 * Câu báo của hàm mẫu theo ngôn ngữ giao diện. Core thật tự dịch `detail` theo `Accept-Language`;
 * hàm mẫu chỉ có `code`, nên dịch ở đây (`sample.codes.*`, `sample.fields.*`).
 */
async function translated(problem: Problem): Promise<Problem> {
  const t = await getTranslations("sample");
  const key = problem.code.replaceAll(".", "_");
  return {
    ...problem,
    detail: t.has(`codes.${key}`) ? t(`codes.${key}`) : problem.detail,
    ...(problem.errors
      ? {
          errors: problem.errors.map((entry) => ({
            ...entry,
            detail: t.has(`fields.${entry.code}`) ? t(`fields.${entry.code}`) : entry.detail,
          })),
        }
      : {}),
  };
}

async function finish<T>(
  state: FormState,
  outcome: SampleOutcome<T>,
  fields: readonly string[],
  values?: Record<string, string>,
): Promise<FormState> {
  if (!outcome.ok) {
    const problem = await translated(outcome.problem);
    return { ...problemState(problem, fields), ...(values ? { values } : {}) };
  }
  refresh();
  return { done: nextDone(state) };
}

// ---------------------------------------------------------------- Lời mời

const InviteForm = z.object({
  email: z.string().trim().min(1),
  name: z.string().trim().optional(),
  org_id: z.string().min(1),
});

export async function inviteStaff(state: FormState, formData: FormData): Promise<FormState> {
  const off = await guard();
  if (off) return off;
  const { fallback, messages } = await required();
  const values = typed(formData, ["email", "name", "org_id"]);
  const input = parseForm(InviteForm, formData, fallback, messages);
  const roles = refs(formData.getAll("role"));
  if (!input.ok || roles.length === 0) {
    // Gom cả lỗi "chưa chọn role" vào cùng một lần báo.
    const t = await getTranslations("access.required");
    return {
      fields: {
        ...(input.ok ? {} : input.fields),
        ...(roles.length === 0 ? { role_ids: t("roles") } : {}),
      },
      values,
    };
  }
  const outcome = await createInvitation({
    email: input.data.email,
    ...(input.data.name ? { name: input.data.name } : {}),
    org_id: input.data.org_id,
    role_ids: roles.map((r) => r.id),
    roles,
  });
  return finish(state, outcome, ["email", "name", "org_id", "role_ids"], values);
}

export async function resendInvite(state: FormState, formData: FormData): Promise<FormState> {
  const off = await guard();
  if (off) return off;
  return finish(state, await resendInvitation(String(formData.get("id") ?? "")), []);
}

export async function revokeInvite(state: FormState, formData: FormData): Promise<FormState> {
  const off = await guard();
  if (off) return off;
  return finish(state, await revokeInvitation(String(formData.get("id") ?? "")), []);
}

// ---------------------------------------------------------------- Uỷ quyền

const DelegateForm = z.object({
  child_tenant_id: z.string().min(1),
  reason: z.string().trim().min(1),
  expires_at: z.string().optional(),
});

export async function delegateRole(state: FormState, formData: FormData): Promise<FormState> {
  const off = await guard();
  if (off) return off;
  const { fallback, messages } = await required();
  const values = typed(formData, ["child_tenant_id", "reason", "expires_at"]);
  const input = parseForm(DelegateForm, formData, fallback, messages);
  const [role] = refs(formData.getAll("role"));
  if (!input.ok || !role) {
    const t = await getTranslations("access.required");
    return {
      fields: { ...(input.ok ? {} : input.fields), ...(role ? {} : { role: t("role") }) },
      values,
    };
  }
  // Ô ngày (`YYYY-MM-DD`) → hết ngày đó theo UTC.
  const expires = input.data.expires_at ? `${input.data.expires_at}T23:59:59Z` : null;
  const outcome = await createDelegation({
    child_tenant_id: input.data.child_tenant_id,
    role,
    expires_at: expires,
    reason: input.data.reason,
  });
  return finish(state, outcome, ["child_tenant_id", "reason", "expires_at"], values);
}

export async function revokeDelegationAction(
  state: FormState,
  formData: FormData,
): Promise<FormState> {
  const off = await guard();
  if (off) return off;
  return finish(state, await revokeDelegation(String(formData.get("id") ?? "")), []);
}

// ---------------------------------------------------------------- Hồ sơ công khai

const ProfileForm = z.object({ display_name: z.string().trim().min(1) });

export async function saveProfile(state: FormState, formData: FormData): Promise<FormState> {
  const off = await guard();
  if (off) return off;
  const names = ["display_name", "province_code", "commune_name", "line", "opens", "closes"];
  const values = typed(formData, names);
  const { fallback, messages } = await required();
  const input = parseForm(ProfileForm, formData, fallback, messages);
  if (!input.ok) return { fields: input.fields, values };
  const outcome = await updateProfile(String(formData.get("unit_id") ?? ""), {
    public: formData.get("public") === "on",
    pickup: formData.get("pickup") === "on",
    display_name: values.display_name ?? "",
    province_code: values.province_code ?? "",
    commune_name: values.commune_name ?? "",
    line: values.line ?? "",
    opens: values.opens ?? "",
    closes: values.closes ?? "",
  });
  return finish(state, outcome, names, values);
}

// ---------------------------------------------------------------- Quyền vào hỗ trợ

export async function saveSupportAccess(state: FormState, formData: FormData): Promise<FormState> {
  const off = await guard();
  if (off) return off;
  return finish(state, await setSupportAccess(formData.get("enabled") === "on"), []);
}

export async function revokeGrant(state: FormState, formData: FormData): Promise<FormState> {
  const off = await guard();
  if (off) return off;
  return finish(state, await revokeSupportGrant(String(formData.get("id") ?? "")), []);
}
