// Phần thuần của màn Bình luận (module `comments` của core): trạng thái và thao tác kiểm duyệt,
// lý do giữ lại, đích của bình luận. Dùng được cả ở máy chủ lẫn trình duyệt.
import type { components } from "@autoxide/sdk";

type Schemas = components["schemas"];
export type CommentDetail = Schemas["CommentDetail"];
export type CommentStatus = Schemas["CommentStatus"];
export type CommentBan = Schemas["CommentBan"];
export type CommentTarget = Schemas["CommentTarget"];

export const COMMENT_STATUSES: readonly CommentStatus[] = [
  "pending",
  "published",
  "rejected",
  "spam",
  "deleted",
];

export const COMMENT_BADGE: Record<CommentStatus, string> = {
  pending: "badge b-violet",
  published: "badge b-ok",
  rejected: "badge b-bad",
  spam: "badge b-bad",
  deleted: "badge b-arch",
};

/**
 * Quyết định kiểm duyệt có thể đưa ra với bình luận ở trạng thái này (`PATCH /comments/{id}`
 * nhận `published`, `rejected`, `spam`, `pending`). Bình luận tác giả đã xoá không đổi được.
 */
export function moderationMoves(status: CommentStatus): CommentStatus[] {
  switch (status) {
    case "pending":
      return ["published", "rejected", "spam"];
    case "published":
      return ["pending", "rejected", "spam"];
    case "rejected":
      return ["published", "spam"];
    case "spam":
      return ["published", "rejected"];
    case "deleted":
      return [];
  }
}

/** Lý do giữ lại đã biết (mô tả của `hold_reason` trong `openapi.json`). */
export const HOLD_REASONS = [
  "moderation",
  "first_comment",
  "reported",
  "suspect_word",
  "too_many_links",
  "too_fast",
  "duplicate",
  "classifier",
] as const;
export type HoldReason = (typeof HOLD_REASONS)[number];

/** `hold_reason` của core ("first_comment,too_many_links") thành danh sách. */
export function holdReasons(value: string | null | undefined): string[] {
  return (value ?? "")
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
}

export function isKnownReason(reason: string): reason is HoldReason {
  return (HOLD_REASONS as readonly string[]).includes(reason);
}

export const BAN_KINDS = ["user", "email", "ip"] as const;
export type BanKind = (typeof BAN_KINDS)[number];

/** Trạng thái hiện của một đích: ẩn (đã ẩn hết và đóng), đóng hay mở. */
export function targetState(target: Pick<CommentTarget, "state" | "hidden">) {
  if (target.hidden) return "hidden" as const;
  return target.state;
}

export const TARGET_BADGE = {
  open: "badge b-ok",
  closed: "badge b-arch",
  hidden: "badge b-bad",
} as const;

/** Đường dẫn tới trang của một đích; hai phần được mã hoá (id có thể chứa ký tự lạ). */
export function targetHref(type: string, id: string): string {
  return `/marketing/comments/targets/${encodeURIComponent(type)}/${encodeURIComponent(id)}`;
}

/** Một phần của đường dẫn đã mã hoá (`content.entry`, id); chuỗi hỏng thì giữ nguyên. */
export function decoded(segment: string): string {
  try {
    return decodeURIComponent(segment);
  } catch {
    return segment;
  }
}

/** Các đích khác nhau của một nhóm bình luận, giữ thứ tự xuất hiện. */
export function uniqueTargets(
  comments: readonly Pick<CommentDetail, "target_type" | "target_id">[],
): { type: string; id: string }[] {
  const seen = new Set<string>();
  const out: { type: string; id: string }[] = [];
  for (const comment of comments) {
    const key = `${comment.target_type}\u0000${comment.target_id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ type: comment.target_type, id: comment.target_id });
  }
  return out;
}

/** Giá trị để cấm tác giả theo từng cách, lấy từ chi tiết bình luận (không có thì bỏ). */
export function banChoices(
  comment: Pick<CommentDetail, "user_id" | "author_email" | "ip_fingerprint">,
): { kind: BanKind; value: string }[] {
  const out: { kind: BanKind; value: string }[] = [];
  if (comment.user_id) out.push({ kind: "user", value: comment.user_id });
  if (comment.author_email) out.push({ kind: "email", value: comment.author_email });
  if (comment.ip_fingerprint) out.push({ kind: "ip", value: comment.ip_fingerprint });
  return out;
}
