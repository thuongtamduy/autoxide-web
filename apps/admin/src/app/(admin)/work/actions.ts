"use server";

// Server Action của màn "Việc và hoạt động" (W-020). Hoãn, giao, ghim, tuỳ chọn thông báo và thao tác
// hàng loạt chưa có API trong core (bước 51 P8 / P10, bước 37 / 52): gọi hàm mẫu của `src/sample/`
// (W-006), cùng cách trả lỗi như khi gọi core thật. Mỗi thao tác đảo được trả `undo` (ô gửi lại cho
// action Hoàn tác).
import type { Problem } from "@autoxide/sdk";
import { refresh } from "next/cache";
import type { DialogState } from "@/components/ui/form-dialog";
import { nextDone, problemState } from "@/lib/form";
import { finishSample, sampleGuard, translateSample } from "@/lib/sample-action";
import { getMe } from "@/lib/viewer";
import { runTaxChange } from "@/sample/bulk";
import type { SampleOutcome } from "@/sample/settings";
import {
  assignWork,
  restorePin,
  saveNotificationPrefs,
  snoozeWork,
  unpin,
  unsnoozeWork,
} from "@/sample/work";
import { SNOOZE_PRESETS, type SnoozePreset, snoozeUntil } from "@/work/registry";
import { assignCandidates, canHandle, workRows } from "@/work/server";

function text(formData: FormData, name: string): string {
  return String(formData.get(name) ?? "").trim();
}

/** Lỗi của hàm mẫu thành trạng thái form (câu theo ngôn ngữ giao diện, lỗi dưới đúng ô). */
async function failed(problem: Problem, fields: readonly string[]): Promise<DialogState> {
  return problemState(await translateSample(problem), fields);
}

async function done<T>(
  state: DialogState,
  outcome: SampleOutcome<T>,
  fields: readonly string[],
  undo: (data: T) => Record<string, string>,
): Promise<DialogState> {
  if (!outcome.ok) return failed(outcome.problem, fields);
  refresh();
  return { done: nextDone(state), undo: undo(outcome.data) };
}

/** Hoãn một việc tới thời điểm chọn (1 giờ, 3 giờ, 9:00 sáng mai, 9:00 thứ Hai tới). */
export async function snoozeAction(state: DialogState, formData: FormData): Promise<DialogState> {
  const off = await sampleGuard();
  if (off) return off;
  const preset = text(formData, "preset");
  if (!SNOOZE_PRESETS.includes(preset as SnoozePreset)) {
    return failed(
      {
        type: "about:blank",
        title: "Unprocessable Entity",
        status: 422,
        code: "validation_failed",
        detail: "Pick when the work comes back.",
        errors: [{ field: "preset", code: "required", detail: "required" }],
      },
      ["preset"],
    );
  }
  const me = await getMe();
  const outcome = await snoozeWork(
    me.id,
    text(formData, "key"),
    snoozeUntil(preset as SnoozePreset, Date.now()),
  );
  // Core báo lỗi ở ô `until`; form chọn bằng ô `preset`.
  if (!outcome.ok && outcome.problem.errors) {
    outcome.problem.errors = outcome.problem.errors.map((e) =>
      e.field === "until" ? { ...e, field: "preset" } : e,
    );
  }
  return done(state, outcome, ["preset"], (data) => ({
    key: text(formData, "key"),
    restore: data.previous ?? "",
  }));
}

/**
 * Đặt lại thời điểm hoãn (`restore`, rỗng = bỏ hoãn): dùng cho nút "Bỏ hoãn" và cho Hoàn tác của
 * "Hoãn". Trả thời điểm cũ để Hoàn tác tiếp.
 */
export async function setSnoozeAction(
  state: DialogState,
  formData: FormData,
): Promise<DialogState> {
  const off = await sampleGuard();
  if (off) return off;
  const me = await getMe();
  const key = text(formData, "key");
  const restore = text(formData, "restore");
  const outcome = await unsnoozeWork(me.id, key, restore || null);
  return done(state, outcome, [], (data) => ({ key, restore: data.previous ?? "" }));
}

/**
 * Giao việc cho một người (`user_id`, rỗng = bỏ giao). Người nhận phải có permission của nguồn: kiểm
 * theo role của họ trên core, như core sẽ kiểm (`kernel.work_assignee_forbidden`).
 */
export async function assignAction(state: DialogState, formData: FormData): Promise<DialogState> {
  const off = await sampleGuard();
  if (off) return off;
  const key = text(formData, "key");
  const userId = text(formData, "user_id");
  const [me, { rows }, candidates] = await Promise.all([getMe(), workRows(), assignCandidates()]);
  const item = rows.find((row) => row.key === key);
  if (!item) {
    return failed(
      {
        type: "about:blank",
        title: "Not Found",
        status: 404,
        code: "kernel.work_not_found",
        detail: "This work item is gone: it was handled where it came from.",
      },
      [],
    );
  }
  const person = userId ? (candidates.find((c) => c.id === userId) ?? null) : null;
  const allowed = person !== null && canHandle(person, item.source, item);
  const outcome = await assignWork(
    me.id,
    key,
    userId ? { id: userId, name: person?.name ?? userId } : null,
    allowed,
  );
  return done(state, outcome, ["user_id"], (data) => ({
    key,
    user_id: data.previous?.id ?? "",
  }));
}

/** Bỏ ghim một mục; Hoàn tác ghim lại đúng mục đó. */
export async function unpinAction(state: DialogState, formData: FormData): Promise<DialogState> {
  const off = await sampleGuard();
  if (off) return off;
  const me = await getMe();
  const id = text(formData, "id");
  return done(state, await unpin(me.id, id), [], () => ({ id }));
}

export async function restorePinAction(
  state: DialogState,
  formData: FormData,
): Promise<DialogState> {
  const off = await sampleGuard();
  if (off) return off;
  const me = await getMe();
  const id = text(formData, "id");
  return done(state, await restorePin(me.id, id), [], () => ({ id }));
}

const PREFS = ["mention", "assigned", "approval", "digest"] as const;

/** Lưu tuỳ chọn thông báo (ô đánh dấu: có mặt trong form = bật). */
export async function savePrefsAction(
  state: DialogState,
  formData: FormData,
): Promise<DialogState> {
  const off = await sampleGuard();
  if (off) return off;
  const me = await getMe();
  const on = (name: (typeof PREFS)[number]) => formData.get(name) === "on";
  const outcome = await saveNotificationPrefs(me.id, {
    mention: on("mention"),
    assigned: on("assigned"),
    approval: on("approval"),
    digest: on("digest"),
  });
  return finishSample(state, outcome, PREFS);
}

/**
 * Chạy thật thao tác hàng loạt đã chạy thử: gửi lại bộ lọc và số bản ghi lúc chạy thử
 * (`expected_count`); số khớp lúc chạy khác thì core báo 409 `kernel.bulk_count_changed`.
 */
export async function runBulkAction(state: DialogState, formData: FormData): Promise<DialogState> {
  const off = await sampleGuard();
  if (off) return off;
  const outcome = await runTaxChange({
    category_id: text(formData, "category_id"),
    tax_category: text(formData, "tax_category"),
    expected_count: Number(text(formData, "expected_count")),
  });
  return finishSample(state, outcome, []);
}
