import "server-only";

// Đồ dùng chung của Server Action hai màn Sản phẩm và Tồn kho (dữ liệu mẫu, W-006): dịch mã lỗi
// của hàm mẫu theo câu ở `messages/` (`catalog.codes.*` / `inventory.codes.*` cho mã của module,
// `<ns>.fields.*` cho lỗi theo ô), rồi trả trạng thái form như khi gọi core thật. Core thật tự dịch
// `detail` theo `Accept-Language`; khi có API thì bỏ phần dịch ở đây.
import type { Problem } from "@autoxide/sdk";
import { refresh } from "next/cache";
import { getTranslations } from "next-intl/server";
import type { ChangeState } from "@/lib/engage";
import { type FormState, nextDone, problemState } from "@/lib/form";
import { type SampleOutcome, sampleGuard, translateSample } from "@/lib/sample-action";

export type Namespace =
  | "catalog"
  | "inventory"
  | "finance"
  | "promotions"
  | "shipping"
  | "market"
  | "orders";

const key = (code: string) => code.replaceAll(".", "_");

/** Câu của một mã lỗi theo ô, kèm giá trị (`{value}`: SKU, số còn lại…) nếu hàm mẫu có ghi. */
async function fieldText(ns: Namespace, code: string, value: string): Promise<string | null> {
  const t = await getTranslations(`${ns}.fields`);
  return t.has(key(code)) ? t(key(code), { value }) : null;
}

export async function translateCommerce(problem: Problem, ns: Namespace): Promise<Problem> {
  const t = await getTranslations(`${ns}.codes`);
  const values = (problem.errors ?? [])
    .map((entry) => entry.detail)
    .filter((d) => d && d !== problem.code);
  const detail = values.join(", ");
  const errors = await Promise.all(
    (problem.errors ?? []).map(async (entry) => ({
      ...entry,
      detail: (await fieldText(ns, entry.code, entry.detail)) ?? entry.detail,
    })),
  );
  const own: Problem = {
    ...problem,
    detail: t.has(key(problem.code)) ? t(key(problem.code), { detail }) : problem.detail,
    ...(problem.errors ? { errors } : {}),
  };
  // Mã chung (validation_failed, required…) dùng câu chung của dữ liệu mẫu.
  return translateSample(own);
}

/** Tắt dữ liệu mẫu thì không ghi gì. */
export const commerceGuard = sampleGuard;

/** Kết quả của hàm mẫu thành trạng thái form: lỗi dưới ô (đã dịch), hoặc xong và làm mới trang. */
export async function finishCommerce<T>(
  ns: Namespace,
  state: FormState,
  outcome: SampleOutcome<T>,
  fields: readonly string[],
  values?: Record<string, string>,
): Promise<FormState> {
  if (!outcome.ok) {
    const problem = await translateCommerce(outcome.problem, ns);
    return { ...problemState(problem, fields), ...(values ? { values } : {}) };
  }
  refresh();
  return { done: nextDone(state) };
}

/** Như `finishCommerce` cho lệnh đổi trạng thái đảo được: trả trạng thái cũ cho nút Hoàn tác. */
export async function finishChange<T>(
  ns: Namespace,
  outcome: SampleOutcome<T>,
  previous: (data: T) => string,
): Promise<ChangeState> {
  if (!outcome.ok) {
    const problem = await translateCommerce(outcome.problem, ns);
    return problemState(problem, []);
  }
  refresh();
  return { done: 1, previous: previous(outcome.data), updated: new Date().toISOString() };
}

/** Đọc chữ của các ô có tên trong `names` (giá trị điền lại khi báo lỗi). */
export function typed(formData: FormData, names: readonly string[]): Record<string, string> {
  return Object.fromEntries(names.map((name) => [name, String(formData.get(name) ?? "")]));
}
