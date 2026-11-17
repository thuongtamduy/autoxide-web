"use server";

// Server Action cho phần Cài đặt dùng dữ liệu mẫu (W-006): kết nối
// đối tác (bước 33/36/39), job (bước 52), yêu cầu duyệt của agent (bước 51). Gọi hàm mẫu
// của `src/sample/` thay cho API chưa có; cùng cách trả lỗi như phần gọi core thật, để khi có API
// chỉ thay lời gọi.
import type { FormState } from "@/lib/form";
import { finishSample, sampleGuard } from "@/lib/sample-action";
import { getMe } from "@/lib/viewer";
import { approveRequest, rejectRequest } from "@/sample/agent";
import {
  CONNECTION_SETTINGS,
  type ConnectionId,
  retryJob,
  saveConnection,
  testConnection,
} from "@/sample/settings";

function idOf(formData: FormData): string {
  return String(formData.get("id") ?? "");
}

function typed(formData: FormData, names: readonly string[]): Record<string, string> {
  return Object.fromEntries(names.map((name) => [name, String(formData.get(name) ?? "")]));
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
