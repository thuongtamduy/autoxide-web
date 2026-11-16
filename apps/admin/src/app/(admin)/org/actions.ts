"use server";

// Server Action của màn "Cây tổ chức" (dữ liệu mẫu, W-006, W-012): gọi hàm mẫu của
// `src/sample/org.ts` và `src/sample/org-tree.ts` thay cho API của bước 34 của core, cùng cách trả
// lỗi (Problem → lỗi theo ô) như phần gọi core thật, để khi có API chỉ thay lời gọi.
import type { DialogState } from "@/components/ui/form-dialog";
import type { FormState } from "@/lib/form";
import { UNITS_MANAGE } from "@/lib/permissions";
import { finishSample, type SampleOutcome, sampleGuard } from "@/lib/sample-action";
import { can } from "@/lib/viewer";
import { createUnit, setUnitStatus } from "@/sample/org";
import { clearSetting, requestSplit, setSetting } from "@/sample/org-tree";

function text(formData: FormData, name: string): string {
  return String(formData.get(name) ?? "");
}

/** Kết quả thành trạng thái hộp thoại; `extra` thêm ô Hoàn tác / trang mở tiếp khi xong. */
async function finish<T>(
  state: DialogState,
  outcome: SampleOutcome<T>,
  fields: readonly string[],
  values: Record<string, string>,
  extra?: (data: T) => DialogState,
): Promise<DialogState> {
  const next = await finishSample(state, outcome, fields, values);
  return outcome.ok && extra ? { ...next, ...extra(outcome.data) } : next;
}

/** Thêm nút con. Nút `active` (người tạo có quyền duyệt) thì Hoàn tác = lưu trữ nút đó. */
export async function addUnit(state: DialogState, formData: FormData): Promise<DialogState> {
  const off = await sampleGuard();
  if (off) return off;
  const values = {
    parent_id: text(formData, "parent_id"),
    name: text(formData, "name"),
    unit_type: text(formData, "unit_type"),
    code: text(formData, "code"),
  };
  const outcome = await createUnit(values, { manage: await can(UNITS_MANAGE) });
  return finish(state, outcome, ["name", "unit_type", "code"], values, (unit) => ({
    go: `/org?unit=${unit.id}`,
    ...(unit.status === "active" ? { undo: { id: unit.id } } : {}),
  }));
}

/** Hoàn tác "thêm nút": lưu trữ nút vừa tạo (`POST …/status {archived}`). */
export async function archiveUnit(state: DialogState, formData: FormData): Promise<DialogState> {
  const off = await sampleGuard();
  if (off) return off;
  return finish(state, await setUnitStatus(text(formData, "id"), "archived"), [], {});
}

export async function askSplit(state: DialogState, formData: FormData): Promise<DialogState> {
  const off = await sampleGuard();
  if (off) return off;
  const values = { note: text(formData, "note"), acknowledged: text(formData, "acknowledged") };
  const outcome = await requestSplit(text(formData, "unit_id"), {
    acknowledged: values.acknowledged === "on",
    note: values.note,
  });
  return finish(state, outcome, ["acknowledged", "note"], values);
}

export async function putSetting(state: DialogState, formData: FormData): Promise<DialogState> {
  const off = await sampleGuard();
  if (off) return off;
  const values = { value: text(formData, "value") };
  const outcome = await setSetting(text(formData, "unit_id"), text(formData, "key"), values.value);
  return finish(state, outcome, ["value"], values);
}

/** "Dùng giá trị kế thừa": bỏ giá trị đặt riêng ở nút (`DELETE …/settings/{key}`). */
export async function dropSetting(state: FormState, formData: FormData): Promise<FormState> {
  const off = await sampleGuard();
  if (off) return off;
  // `id` của InlineAction mang "<unit_id>|<key>".
  const [unitId = "", key = ""] = text(formData, "id").split("|");
  return finishSample(state, await clearSetting(unitId, key), []);
}
