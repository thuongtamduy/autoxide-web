"use server";

// Server Action cho các tab dùng dữ liệu mẫu (W-006): lời mời, uỷ quyền, hồ sơ công khai, quyền
// vào hỗ trợ. Gọi hàm mẫu của `src/sample/org.ts` thay cho API của bước 34 của core; cùng cách
// trả lỗi (Problem → lỗi theo ô) như phần gọi core thật, để khi có API chỉ thay lời gọi.
import { getTranslations } from "next-intl/server";
import { z } from "zod";
import { type FormState, parseForm } from "@/lib/form";
import { finishSample, sampleGuard } from "@/lib/sample-action";
import {
  createDelegation,
  createInvitation,
  type Ref,
  resendInvitation,
  revokeDelegation,
  revokeInvitation,
  revokeSupportGrant,
  setSupportAccess,
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

/** `role` gửi lên dạng `id|name` (role thật của core, tên để hiện trong bản ghi mẫu). */
function refs(values: readonly FormDataEntryValue[]): Ref[] {
  return values.map(String).map((value) => {
    const bar = value.indexOf("|");
    return bar > 0
      ? { id: value.slice(0, bar), name: value.slice(bar + 1) }
      : { id: value, name: value };
  });
}

const guard = sampleGuard;
const finish = finishSample;

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
