// Trạng thái chung của các form gửi bằng Server Action: gom mọi lỗi của ô để báo một lần, rồi
// hiện lỗi ngay dưới ô (quy ước thiết kế quản trị, mục 2.3). Lỗi của core giữ `code` để rẽ nhánh
// và `detail` để hiện (core đã dịch theo `Accept-Language`).
import type { Problem } from "@autoxide/sdk";
import type { z } from "zod";

export interface FormState {
  /** Tăng mỗi lần gửi thành công, để component biết mà đóng hộp thoại và báo xong. */
  done?: number;
  /** Lỗi không gắn với ô nào (đã theo ngôn ngữ). */
  error?: string;
  /** `code` lỗi của core, để test và giao diện rẽ nhánh. */
  code?: string;
  /** Lỗi theo tên ô (`name` của input, cũng là tên trường của core). */
  fields?: Record<string, string>;
  /** Giá trị không bí mật vừa gửi, điền lại sau khi báo lỗi (React đặt lại form sau mỗi lần gửi). */
  values?: Record<string, string>;
}

/** Lần gửi thành công kế tiếp của `state`. */
export function nextDone(state: FormState | undefined): number {
  return (state?.done ?? 0) + 1;
}

/**
 * Đọc form theo `schema`. Ô sai nào cũng có lỗi của nó (`messages[tên ô]`, không có thì
 * `fallback`), gom hết trong một lần thay vì dừng ở ô đầu tiên.
 */
export function parseForm<S extends z.ZodType>(
  schema: S,
  formData: FormData,
  fallback: string,
  messages: Record<string, string> = {},
): { ok: true; data: z.output<S> } | { ok: false; fields: Record<string, string> } {
  const result = schema.safeParse(Object.fromEntries(formData.entries()));
  if (result.success) {
    return { ok: true, data: result.data };
  }
  const fields: Record<string, string> = {};
  for (const issue of result.error.issues) {
    const name = String(issue.path[0] ?? "");
    if (name && !(name in fields)) {
      fields[name] = messages[name] ?? fallback;
    }
  }
  return { ok: false, fields };
}

/**
 * Đổi Problem của core thành trạng thái form. Lỗi gắn được vào ô (`errors` của core, hoặc mã
 * trong `codeField`, vd mật khẩu sai → ô mật khẩu) thì nằm dưới ô; còn lại là lỗi chung.
 */
export function problemState(
  problem: Problem,
  fields: readonly string[],
  codeField: Readonly<Record<string, string>> = {},
): FormState {
  const byField: Record<string, string> = {};
  let unmatched = false;
  for (const entry of problem.errors ?? []) {
    if (fields.includes(entry.field)) {
      byField[entry.field] ??= entry.detail;
    } else {
      unmatched = true;
    }
  }
  const field = codeField[problem.code];
  if (field && fields.includes(field)) {
    byField[field] ??= problem.detail;
  }
  const state: FormState = { code: problem.code };
  if (Object.keys(byField).length > 0) {
    state.fields = byField;
  }
  if (unmatched || Object.keys(byField).length === 0) {
    state.error = problem.detail;
  }
  return state;
}
