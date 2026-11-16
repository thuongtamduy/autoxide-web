"use server";

// Server Action cho phần màn Bình luận dùng dữ liệu mẫu (W-006): cài đặt bình luận theo khách.
// Gọi hàm mẫu của `src/sample/engage.ts` thay cho API của bước 33 và 37 của core; lỗi cùng hình
// dạng Problem như phần gọi core thật, câu báo theo `engage.comments.policy.errors.*`.
import { refresh } from "next/cache";
import { getTranslations } from "next-intl/server";
import { type FormState, nextDone, problemState } from "@/lib/form";
import { sampleGuard } from "@/lib/sample-action";
import {
  MODERATION_MODES,
  type ModerationMode,
  POSTING_LEVELS,
  type PostingLevel,
  updateCommentPolicy,
} from "@/sample/engage";

function pick<T extends string>(
  value: FormDataEntryValue | null,
  allowed: readonly T[],
  fallback: T,
) {
  return allowed.find((item) => item === value) ?? fallback;
}

/** Lưu cài đặt bình luận của khách (mẫu). */
export async function saveCommentPolicy(state: FormState, formData: FormData): Promise<FormState> {
  const off = await sampleGuard();
  if (off) return off;
  const outcome = await updateCommentPolicy({
    guests_allowed: formData.get("guests_allowed") === "on",
    guest_moderation: pick<ModerationMode>(
      formData.get("guest_moderation"),
      MODERATION_MODES,
      "pre",
    ),
    user_moderation: pick<ModerationMode>(
      formData.get("user_moderation"),
      MODERATION_MODES,
      "first_time",
    ),
    posting: pick<PostingLevel>(formData.get("posting"), POSTING_LEVELS, "none"),
  });
  if (!outcome.ok) {
    const t = await getTranslations("engage.comments.policy.errors");
    const problem = {
      ...outcome.problem,
      detail: t("invalid"),
      errors: (outcome.problem.errors ?? []).map((entry) => ({
        ...entry,
        detail: t.has(entry.code) ? t(entry.code) : entry.detail,
      })),
    };
    return problemState(problem, [
      "guests_allowed",
      "guest_moderation",
      "user_moderation",
      "posting",
    ]);
  }
  refresh();
  return { done: nextDone(state) };
}
