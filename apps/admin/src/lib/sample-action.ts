import "server-only";

// Đồ dùng chung của Server Action gọi hàm dữ liệu mẫu (W-006): chặn khi tắt dữ liệu mẫu, dịch câu
// báo của hàm mẫu, đổi kết quả thành trạng thái form như khi gọi core thật.
import type { Problem } from "@autoxide/sdk";
import { refresh } from "next/cache";
import { getTranslations } from "next-intl/server";
import { type FormState, nextDone, problemState } from "@/lib/form";
import { sampleDataEnabled } from "@/sample";

export type SampleOutcome<T> = { ok: true; data: T } | { ok: false; problem: Problem };

/** Tắt dữ liệu mẫu thì không ghi gì (trang cũng không hiện phần mẫu). */
export async function sampleGuard(): Promise<FormState | null> {
  if (sampleDataEnabled()) return null;
  const t = await getTranslations("sample");
  return { error: t("off"), code: "sample_data_off" };
}

/**
 * Câu báo của hàm mẫu theo ngôn ngữ giao diện. Core thật tự dịch `detail` theo `Accept-Language`;
 * hàm mẫu chỉ có `code`, nên dịch ở đây (`sample.codes.*`, `sample.fields.*`).
 */
export async function translateSample(problem: Problem): Promise<Problem> {
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

/** Kết quả của hàm mẫu thành trạng thái form: lỗi dưới ô, hoặc xong (và làm mới trang). */
export async function finishSample<T>(
  state: FormState,
  outcome: SampleOutcome<T>,
  fields: readonly string[],
  values?: Record<string, string>,
): Promise<FormState> {
  if (!outcome.ok) {
    const problem = await translateSample(outcome.problem);
    return { ...problemState(problem, fields), ...(values ? { values } : {}) };
  }
  refresh();
  return { done: nextDone(state) };
}
