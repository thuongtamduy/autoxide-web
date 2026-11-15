// Dữ liệu mẫu của phân hệ Tiếp thị cho phần core chưa có API (W-006): cài đặt bình luận theo
// từng khách. Hiện core đặt các cài đặt này bằng biến môi trường `AUTOXIDE_COMMENTS_*` cho cả máy
// chủ (`GET /api/v1/comments/public/settings` đọc được, không sửa được). Đặt riêng cho từng khách
// là cấu hình theo khách của bước 33 (`PUT /api/v1/kernel/settings/{name}`); yêu cầu xác thực tài
// khoản trước khi bình luận (NĐ 147/2024) là chính sách `posting.comments` của bước 37
// (`PUT /api/v1/compliance/policies/{key}`, giá trị `none` / `phone` / `identity`).
//
// Lệnh ghi đổi một kho trong bộ nhớ của tiến trình máy chủ; khởi động lại thì về ban đầu.
import type { Problem } from "@autoxide/sdk";

export type SampleOutcome<T> = { ok: true; data: T } | { ok: false; problem: Problem };

export type ModerationMode = "pre" | "first_time" | "post";
export type PostingLevel = "none" | "phone" | "identity";

export const MODERATION_MODES: readonly ModerationMode[] = ["pre", "first_time", "post"];
export const POSTING_LEVELS: readonly PostingLevel[] = ["none", "phone", "identity"];

/** Cài đặt bình luận của khách đang xem (dự kiến gộp từ hai API của bước 33 và 37). */
export interface CommentPolicy {
  /** `comments.allow_guests` (bước 33): khách không tài khoản được bình luận. */
  guests_allowed: boolean;
  /** `comments.guest_moderation` (bước 33). */
  guest_moderation: ModerationMode;
  /** `comments.user_moderation` (bước 33). */
  user_moderation: ModerationMode;
  /** `posting.comments` (bước 37): mức xác thực tài khoản cần để bình luận. */
  posting: PostingLevel;
  updated_at: string;
}

function initial(): CommentPolicy {
  return {
    guests_allowed: true,
    guest_moderation: "pre",
    user_moderation: "first_time",
    posting: "none",
    updated_at: "2026-11-10T02:00:00Z",
  };
}

let policy = initial();

/** Về dữ liệu ban đầu (test). */
export function resetSampleEngage() {
  policy = initial();
}

// Thay bằng GET /api/v1/kernel/settings (bước 33) + GET /api/v1/compliance/policies (bước 37) khi core có.
export async function getCommentPolicy(): Promise<{ data: CommentPolicy }> {
  return { data: { ...policy } };
}

// Thay bằng PUT /api/v1/kernel/settings/{name} (bước 33) + PUT /api/v1/compliance/policies/posting.comments (bước 37) khi core có.
export async function updateCommentPolicy(
  input: Omit<CommentPolicy, "updated_at">,
): Promise<SampleOutcome<CommentPolicy>> {
  const errors: NonNullable<Problem["errors"]> = [];
  if (!MODERATION_MODES.includes(input.guest_moderation)) {
    errors.push({ field: "guest_moderation", code: "unknown", detail: "Unknown mode." });
  }
  if (!MODERATION_MODES.includes(input.user_moderation)) {
    errors.push({ field: "user_moderation", code: "unknown", detail: "Unknown mode." });
  }
  if (!POSTING_LEVELS.includes(input.posting)) {
    errors.push({ field: "posting", code: "unknown", detail: "Unknown level." });
  }
  // Như `PostingGate` của bước 37: khách vãng lai chỉ qua được khi không đòi xác thực.
  if (input.guests_allowed && input.posting !== "none") {
    errors.push({
      field: "guests_allowed",
      code: "guests_need_none",
      detail: "Guests cannot verify an account; turn guests off or ask for no verification.",
    });
  }
  if (errors.length > 0) {
    return {
      ok: false,
      problem: {
        type: "about:blank",
        title: "Unprocessable Entity",
        status: 422,
        code: "validation_failed",
        detail: "The request has invalid fields.",
        errors,
      },
    };
  }
  policy = { ...input, updated_at: new Date().toISOString() };
  return { ok: true, data: { ...policy } };
}
