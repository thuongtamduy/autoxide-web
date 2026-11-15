"use server";

// Server Action cho phần Cài đặt dùng dữ liệu mẫu (W-006): gói và thuê bao (bước 35), tên miền
// (bước 33), kết nối đối tác (bước 33/36/39), job (bước 52), yêu cầu duyệt của agent (bước 51).
// Gọi hàm mẫu của `src/sample/` thay cho API chưa có; cùng cách trả lỗi như phần gọi core thật,
// để khi có API chỉ thay lời gọi.
import { getTranslations } from "next-intl/server";
import { z } from "zod";
import { type FormState, parseForm } from "@/lib/form";
import { finishSample, sampleGuard } from "@/lib/sample-action";
import { getMe } from "@/lib/viewer";
import { approveRequest, rejectRequest } from "@/sample/agent";
import {
  addDomain,
  CONNECTION_SETTINGS,
  type ConnectionId,
  cancelRenewal,
  changePlan,
  resumeRenewal,
  retryJob,
  revokeDomain,
  saveConnection,
  testConnection,
  updateBillingProfile,
  verifyDomain,
} from "@/sample/settings";

function idOf(formData: FormData): string {
  return String(formData.get("id") ?? "");
}

function typed(formData: FormData, names: readonly string[]): Record<string, string> {
  return Object.fromEntries(names.map((name) => [name, String(formData.get(name) ?? "")]));
}

// ---------------------------------------------------------------- Gói và thuê bao

export async function changePlanAction(state: FormState, formData: FormData): Promise<FormState> {
  const off = await sampleGuard();
  if (off) return off;
  return finishSample(state, await changePlan(String(formData.get("price_id") ?? "")), [
    "price_id",
  ]);
}

export async function cancelRenewalAction(state: FormState): Promise<FormState> {
  const off = await sampleGuard();
  if (off) return off;
  return finishSample(state, await cancelRenewal(), []);
}

export async function resumeRenewalAction(state: FormState): Promise<FormState> {
  const off = await sampleGuard();
  if (off) return off;
  return finishSample(state, await resumeRenewal(), []);
}

const PROFILE_FIELDS = [
  "legal_name",
  "tax_code",
  "email",
  "phone",
  "address_province_code",
  "address_commune",
  "address_line",
] as const;

export async function saveBillingProfile(state: FormState, formData: FormData): Promise<FormState> {
  const off = await sampleGuard();
  if (off) return off;
  const values = typed(formData, PROFILE_FIELDS);
  const outcome = await updateBillingProfile({
    legal_name: values.legal_name ?? "",
    tax_code: values.tax_code ?? "",
    email: values.email ?? "",
    phone: values.phone ?? "",
    address_province_code: values.address_province_code ?? "",
    address_commune: values.address_commune ?? "",
    address_line: values.address_line ?? "",
  });
  return finishSample(state, outcome, PROFILE_FIELDS, values);
}

// ---------------------------------------------------------------- Tên miền

const DomainForm = z.object({ domain: z.string().trim().min(1) });

export async function addDomainAction(state: FormState, formData: FormData): Promise<FormState> {
  const off = await sampleGuard();
  if (off) return off;
  const values = typed(formData, ["domain"]);
  const t = await getTranslations("settings.required");
  const input = parseForm(DomainForm, formData, t("field"), { domain: t("domain") });
  if (!input.ok) return { fields: input.fields, values };
  return finishSample(state, await addDomain(input.data.domain), ["domain"], values);
}

export async function verifyDomainAction(state: FormState, formData: FormData): Promise<FormState> {
  const off = await sampleGuard();
  if (off) return off;
  return finishSample(state, await verifyDomain(idOf(formData)), []);
}

export async function revokeDomainAction(state: FormState, formData: FormData): Promise<FormState> {
  const off = await sampleGuard();
  if (off) return off;
  return finishSample(state, await revokeDomain(idOf(formData)), []);
}

// ---------------------------------------------------------------- Kết nối đối tác

function connectionOf(formData: FormData): ConnectionId | null {
  const value = idOf(formData);
  return value in CONNECTION_SETTINGS ? (value as ConnectionId) : null;
}

export async function saveConnectionAction(
  state: FormState,
  formData: FormData,
): Promise<FormState> {
  const off = await sampleGuard();
  if (off) return off;
  const connection = connectionOf(formData);
  if (!connection) return { error: "Unknown connection.", code: "kernel.setting_not_found" };
  const specs = CONNECTION_SETTINGS[connection];
  const names = specs.map((s) => s.name);
  // Không điền lại secret sau khi báo lỗi: chỉ giữ ô thường.
  const values = typed(
    formData,
    specs.filter((s) => !s.secret).map((s) => s.name),
  );
  const outcome = await saveConnection(connection, typed(formData, names));
  return finishSample(state, outcome, names, values);
}

export async function testConnectionAction(
  state: FormState,
  formData: FormData,
): Promise<FormState> {
  const off = await sampleGuard();
  if (off) return off;
  const connection = connectionOf(formData);
  if (!connection) return { error: "Unknown connection.", code: "kernel.setting_not_found" };
  return finishSample(state, await testConnection(connection), []);
}

// ---------------------------------------------------------------- Job

export async function retryJobAction(state: FormState, formData: FormData): Promise<FormState> {
  const off = await sampleGuard();
  if (off) return off;
  return finishSample(state, await retryJob(idOf(formData)), []);
}

// ---------------------------------------------------------------- Yêu cầu duyệt của agent

async function decider(): Promise<{ id: string; name: string }> {
  const me = await getMe();
  return { id: me.id, name: me.name || me.email };
}

export async function approveAction(state: FormState, formData: FormData): Promise<FormState> {
  const off = await sampleGuard();
  if (off) return off;
  return finishSample(state, await approveRequest(idOf(formData), await decider()), []);
}

export async function rejectAction(state: FormState, formData: FormData): Promise<FormState> {
  const off = await sampleGuard();
  if (off) return off;
  return finishSample(state, await rejectRequest(idOf(formData), await decider()), []);
}
